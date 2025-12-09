import { supabaseServiceRole } from './supabase-service';
import { getUserEvolutionApi } from './evolution-api-helper';
import { evolutionService } from './evolution-service';

export type InstanceStatus = 'ok' | 'rate_limited' | 'blocked' | 'error' | 'disconnected';

export interface EvolutionInstance {
  id: string;
  evolution_api_id: string;
  instance_name: string;
  phone_number: string | null;
  is_active: boolean;
  status: InstanceStatus;
  daily_limit: number | null;
  sent_today: number;
  error_today: number;
  rate_limit_count_today: number;
  last_used_at: string | null;
  cooldown_until: string | null;
  // Dados da Evolution API (join)
  evolution_api?: {
    id: string;
    name: string;
    base_url: string;
    api_key: string;
    is_active: boolean;
  };
}

export interface PickInstanceOptions {
  userId?: string;
  preferUserBinding?: boolean;
  groupId?: string;
  leadPhone?: string;
}

export interface AddLeadToGroupParams {
  userId?: string;
  groupId: string;
  leadPhone: string;
  preferUserBinding?: boolean;
}

export interface AddLeadResult {
  success: boolean;
  error?: string;
  errorType?: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown' | 'no_instance_available';
  instanceUsed?: {
    id: string;
    instance_name: string;
    evolution_api_id: string;
  };
  httpStatus?: number;
}

export class EvolutionBalancer {
  /**
   * Seleciona a melhor instância Evolution disponível para uso
   */
  async pickBestEvolutionInstance(
    options: PickInstanceOptions = {}
  ): Promise<EvolutionInstance | null> {
    const { userId, preferUserBinding = false } = options;
    const now = new Date().toISOString();

    // Base query: busca instâncias ativas e disponíveis
    let query = supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          name,
          base_url,
          api_key,
          is_active
        )
      `)
      .eq('is_active', true)
      .eq('status', 'ok')
      .eq('evolution_apis.is_active', true);

    // Filtra cooldown: apenas instâncias que não estão em cooldown
    // Nota: Supabase não suporta OR direto, então filtramos depois ou usamos uma abordagem diferente
    // Vamos buscar todas e filtrar em memória para as que estão fora do cooldown

    // Se preferUserBinding e userId fornecido, prioriza instâncias do usuário
    if (preferUserBinding && userId) {
      // Primeiro tenta instâncias vinculadas ao usuário
      const { data: userApiBindings } = await supabaseServiceRole
        .from('user_evolution_apis')
        .select('evolution_api_id')
        .eq('user_id', userId);

      if (userApiBindings && userApiBindings.length > 0) {
        const userApiIds = userApiBindings.map((b) => b.evolution_api_id);
        query = query.in('evolution_api_id', userApiIds);
      }
    }

    // Executa query
    const { data: candidates, error } = await query;

    if (error) {
      console.error('Erro ao buscar instâncias candidatas:', error);
      return null;
    }

    if (!candidates || candidates.length === 0) {
      // Se preferUserBinding e não encontrou do usuário, tenta qualquer instância
      if (preferUserBinding && userId) {
        return this.pickBestEvolutionInstance({ ...options, preferUserBinding: false });
      }
      return null;
    }

    // Filtra por cooldown e daily_limit
    const availableCandidates = candidates.filter((inst: any) => {
      // Verifica cooldown
      if (inst.cooldown_until) {
        const cooldownUntil = new Date(inst.cooldown_until);
        if (cooldownUntil > new Date()) {
          return false; // Ainda em cooldown
        }
      }

      // Verifica daily_limit
      if (inst.daily_limit !== null && inst.sent_today >= inst.daily_limit) {
        return false;
      }

      return true;
    });

    if (availableCandidates.length === 0) {
      return null;
    }

    // Calcula score para cada candidato e seleciona o melhor
    const scored = availableCandidates.map((inst: any) => {
      const lastUsedAt = inst.last_used_at ? new Date(inst.last_used_at).getTime() : 0;
      const secondsSinceLastUse = lastUsedAt > 0 
        ? (Date.now() - lastUsedAt) / 1000 
        : 999999; // Nunca usado = muito tempo

      // Score: menor sent_today = melhor, maior tempo desde uso = melhor
      // Formula: (1 / (sent_today + 1)) + (secondsSinceLastUse / 1000) + random pequeno
      const usageScore = 1 / (inst.sent_today + 1);
      const timeScore = Math.min(secondsSinceLastUse / 1000, 100); // Cap em 100
      const randomScore = Math.random() * 0.1; // 0-0.1 para evitar padrão previsível

      return {
        instance: inst,
        score: usageScore + timeScore + randomScore,
      };
    });

    // Ordena por score (maior primeiro)
    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0].instance;

    // Atualiza last_used_at
    await supabaseServiceRole
      .from('evolution_instances')
      .update({
        last_used_at: now,
        updated_at: now,
      })
      .eq('id', selected.id);

    // Retorna instância formatada
    return {
      id: selected.id,
      evolution_api_id: selected.evolution_api_id,
      instance_name: selected.instance_name,
      phone_number: selected.phone_number,
      is_active: selected.is_active,
      status: selected.status as InstanceStatus,
      daily_limit: selected.daily_limit,
      sent_today: selected.sent_today,
      error_today: selected.error_today,
      rate_limit_count_today: selected.rate_limit_count_today,
      last_used_at: selected.last_used_at,
      cooldown_until: selected.cooldown_until,
      evolution_api: Array.isArray(selected.evolution_apis) 
        ? selected.evolution_apis[0] 
        : selected.evolution_apis,
    };
  }

  /**
   * Adiciona um lead a um grupo usando balanceamento inteligente
   */
  async addLeadToGroup(params: AddLeadToGroupParams): Promise<AddLeadResult> {
    const { userId, groupId, leadPhone, preferUserBinding = false } = params;

    // 1. Seleciona a melhor instância
    const instance = await this.pickBestEvolutionInstance({
      userId,
      preferUserBinding,
      groupId,
      leadPhone,
    });

    if (!instance || !instance.evolution_api) {
      return {
        success: false,
        error: 'Nenhuma instância Evolution disponível no momento. Tente novamente em alguns minutos.',
        errorType: 'no_instance_available',
      };
    }

    const { base_url, api_key } = instance.evolution_api;
    const { instance_name } = instance;

    // 2. Faz a chamada à Evolution API usando o serviço existente
    // Mas precisamos usar a base_url da instância selecionada, não a global
    // Para isso, vamos criar uma instância temporária do serviço ou modificar o método
    
    let result: {
      success: boolean;
      error?: string;
      errorType?: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown';
      added?: number;
      httpStatus?: number;
      responseData?: any;
    };

    try {
      // Usa o método existente mas com a base_url específica
      result = await this.callEvolutionAddParticipants(
        base_url,
        api_key,
        instance_name,
        groupId,
        [leadPhone]
      );
    } catch (error: any) {
      result = {
        success: false,
        error: error?.message || 'Erro desconhecido',
        errorType: 'unknown',
        httpStatus: 0,
      };
    }

    // 3. Atualiza contadores e registra log
    await this.handleInstanceResult(instance, result, {
      groupId,
      leadPhone,
    });

    return {
      success: result.success,
      error: result.error,
      errorType: result.errorType,
      instanceUsed: {
        id: instance.id,
        instance_name: instance.instance_name,
        evolution_api_id: instance.evolution_api_id,
      },
      httpStatus: result.httpStatus,
    };
  }

  /**
   * Chama a Evolution API para adicionar participantes (wrapper com base_url customizada)
   */
  private async callEvolutionAddParticipants(
    baseUrl: string,
    apiKey: string,
    instanceName: string,
    groupId: string,
    participants: string[]
  ): Promise<{
    success: boolean;
    error?: string;
    errorType?: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown';
    added?: number;
    httpStatus?: number;
    responseData?: any;
  }> {
    const url = `${baseUrl}/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(groupId)}`;
    const payload = {
      action: 'add',
      participants: participants,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let responseData: any = {};
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText, raw: responseText };
      }

      // Tratamento de erros igual ao EvolutionService
      if (response.status === 403) {
        return {
          success: false,
          error: 'Lead não foi adicionado ao grupo (403)',
          errorType: 'rate_limit',
          added: 0,
          httpStatus: 403,
          responseData,
        };
      }

      if (response.status === 400) {
        const errorMsg = responseData?.message || responseText || 'Bad request';
        const isConnectionClosed = 
          errorMsg.toLowerCase().includes('connection closed') || 
          responseText.toLowerCase().includes('connection closed') ||
          errorMsg.toLowerCase().includes('disconnected') ||
          responseText.toLowerCase().includes('disconnected');

        if (isConnectionClosed) {
          return {
            success: false,
            error: 'Número desconectado ou banido (Connection Closed)',
            errorType: 'connection_closed',
            added: 0,
            httpStatus: 400,
            responseData,
          };
        }

        return {
          success: false,
          error: errorMsg,
          errorType: 'bad_request',
          added: 0,
          httpStatus: 400,
          responseData,
        };
      }

      if (!response.ok) {
        return {
          success: false,
          error: responseData?.message || `Erro HTTP ${response.status}`,
          errorType: 'unknown',
          added: 0,
          httpStatus: response.status,
          responseData,
        };
      }

      // Sucesso
      return {
        success: true,
        added: participants.length,
        httpStatus: response.status,
        responseData,
      };
    } catch (error: any) {
      const isConnectionError = 
        error?.message?.toLowerCase().includes('connection closed') ||
        error?.message?.toLowerCase().includes('econnreset') ||
        error?.message?.toLowerCase().includes('socket hang up') ||
        error?.message?.toLowerCase().includes('econnrefused') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ECONNREFUSED';

      if (isConnectionError) {
        return {
          success: false,
          error: 'Conexão fechada - número pode estar banido ou desconectado',
          errorType: 'connection_closed',
          added: 0,
          httpStatus: 0,
          responseData: { error: error?.message, code: error?.code },
        };
      }

      return {
        success: false,
        error: error?.message || 'Erro desconhecido ao adicionar participantes',
        errorType: 'unknown',
        added: 0,
        httpStatus: 0,
        responseData: { error: error?.message, name: error?.name, code: error?.code },
      };
    }
  }

  /**
   * Processa o resultado da chamada e atualiza instância + logs
   */
  private async handleInstanceResult(
    instance: EvolutionInstance,
    result: {
      success: boolean;
      error?: string;
      errorType?: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown';
      httpStatus?: number;
      responseData?: any;
    },
    metadata: {
      groupId?: string;
      leadPhone?: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    const { groupId, leadPhone } = metadata;

    if (result.success) {
      // Sucesso: incrementa sent_today e registra log
      await supabaseServiceRole
        .from('evolution_instances')
        .update({
          sent_today: instance.sent_today + 1,
          updated_at: now,
        })
        .eq('id', instance.id);

      await supabaseServiceRole
        .from('evolution_instance_logs')
        .insert({
          evolution_instance_id: instance.id,
          type: 'success',
          http_status: result.httpStatus || null,
          group_id: groupId || null,
          lead_phone: leadPhone || null,
        });
    } else {
      // Erro: processa baseado no tipo
      let newStatus = instance.status;
      let newCooldownUntil: string | null = null;
      const updates: any = {
        error_today: instance.error_today + 1,
        updated_at: now,
      };

      if (result.errorType === 'rate_limit') {
        // Rate limit: coloca em cooldown por 5 minutos
        newCooldownUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        updates.cooldown_until = newCooldownUntil;
        updates.rate_limit_count_today = instance.rate_limit_count_today + 1;
        // Mantém status como 'ok' mas com cooldown

        await supabaseServiceRole
          .from('evolution_instance_logs')
          .insert({
            evolution_instance_id: instance.id,
            type: 'rate_limit',
            http_status: result.httpStatus || null,
            error_message: result.error || null,
            group_id: groupId || null,
            lead_phone: leadPhone || null,
            raw_response_snippet: result.responseData 
              ? JSON.stringify(result.responseData).substring(0, 500) 
              : null,
          });
      } else if (result.errorType === 'connection_closed') {
        // Bloqueio: marca como blocked e desativa
        newStatus = 'blocked';
        updates.status = 'blocked';
        updates.is_active = false;

        await supabaseServiceRole
          .from('evolution_instance_logs')
          .insert({
            evolution_instance_id: instance.id,
            type: 'blocked',
            http_status: result.httpStatus || null,
            error_message: result.error || null,
            group_id: groupId || null,
            lead_phone: leadPhone || null,
            raw_response_snippet: result.responseData 
              ? JSON.stringify(result.responseData).substring(0, 500) 
              : null,
          });
      } else {
        // Outro erro
        await supabaseServiceRole
          .from('evolution_instance_logs')
          .insert({
            evolution_instance_id: instance.id,
            type: 'error',
            http_status: result.httpStatus || null,
            error_message: result.error || null,
            error_code: result.errorType || null,
            group_id: groupId || null,
            lead_phone: leadPhone || null,
            raw_response_snippet: result.responseData 
              ? JSON.stringify(result.responseData).substring(0, 500) 
              : null,
          });
      }

      await supabaseServiceRole
        .from('evolution_instances')
        .update(updates)
        .eq('id', instance.id);
    }
  }

  /**
   * Obtém lista de todas as instâncias com status
   */
  async getAllInstances(): Promise<EvolutionInstance[]> {
    const { data, error } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          name,
          base_url,
          api_key,
          is_active
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar instâncias:', error);
      return [];
    }

    return (data || []).map((inst: any) => ({
      id: inst.id,
      evolution_api_id: inst.evolution_api_id,
      instance_name: inst.instance_name,
      phone_number: inst.phone_number,
      is_active: inst.is_active,
      status: inst.status as InstanceStatus,
      daily_limit: inst.daily_limit,
      sent_today: inst.sent_today,
      error_today: inst.error_today,
      rate_limit_count_today: inst.rate_limit_count_today,
      last_used_at: inst.last_used_at,
      cooldown_until: inst.cooldown_until,
      evolution_api: Array.isArray(inst.evolution_apis) 
        ? inst.evolution_apis[0] 
        : inst.evolution_apis,
    }));
  }
}

export const evolutionBalancer = new EvolutionBalancer();

