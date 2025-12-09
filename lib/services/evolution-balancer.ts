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

    // Base query: busca TODAS as instâncias ativas e disponíveis (balanceamento global)
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

    // Atribuição de usuário é OPCIONAL - apenas prioriza se preferUserBinding=true e usuário tem APIs atribuídas
    if (preferUserBinding && userId) {
      // Tenta priorizar instâncias vinculadas ao usuário (se tiver)
      const { data: userApiBindings } = await supabaseServiceRole
        .from('user_evolution_apis')
        .select('evolution_api_id')
        .eq('user_id', userId);

      if (userApiBindings && userApiBindings.length > 0) {
        const userApiIds = userApiBindings.map((b) => b.evolution_api_id);
        // Primeiro tenta apenas APIs do usuário
        const userQuery = query.in('evolution_api_id', userApiIds);
        const { data: userCandidates } = await userQuery;

        // Se encontrou instâncias do usuário, usa apenas elas
        if (userCandidates && userCandidates.length > 0) {
          const available = userCandidates.filter((inst: any) => {
            if (inst.cooldown_until) {
              const cooldownUntil = new Date(inst.cooldown_until);
              if (cooldownUntil > new Date()) return false;
            }
            if (inst.daily_limit !== null && inst.sent_today >= inst.daily_limit) {
              return false;
            }
            return true;
          });

          if (available.length > 0) {
            // Calcula score e retorna melhor instância do usuário
            return await this.selectBestFromCandidates(available, now);
          }
        }
      }
      // Se não encontrou do usuário ou preferUserBinding=false, continua com todas as instâncias
    }

    // Executa query
    const { data: candidates, error } = await query;

    if (error) {
      console.error('Erro ao buscar instâncias candidatas:', error);
      return null;
    }

    if (!candidates || candidates.length === 0) {
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

    // Seleciona melhor candidato
    return this.selectBestFromCandidates(availableCandidates, now);
  }

  /**
   * Método auxiliar para selecionar a melhor instância de uma lista de candidatos
   */
  private async selectBestFromCandidates(candidates: any[], now: string): Promise<EvolutionInstance | null> {
    if (candidates.length === 0) return null;

    console.log(`\n📊 [BALANCEADOR] Selecionando melhor instância entre ${candidates.length} candidato(s)`);

    // Calcula score para cada candidato e seleciona o melhor
    const scored = candidates.map((inst: any) => {
      const evolutionApi = Array.isArray(inst.evolution_apis) 
        ? inst.evolution_apis[0] 
        : inst.evolution_apis;

      const lastUsedAt = inst.last_used_at ? new Date(inst.last_used_at).getTime() : 0;
      const secondsSinceLastUse = lastUsedAt > 0 
        ? (Date.now() - lastUsedAt) / 1000 
        : 999999; // Nunca usado = muito tempo

      // Score: menor sent_today = melhor, maior tempo desde uso = melhor
      // Formula: (1 / (sent_today + 1)) + (secondsSinceLastUse / 1000) + random pequeno
      const usageScore = 1 / (inst.sent_today + 1);
      const timeScore = Math.min(secondsSinceLastUse / 1000, 100); // Cap em 100
      const randomScore = Math.random() * 0.1; // 0-0.1 para evitar padrão previsível
      const totalScore = usageScore + timeScore + randomScore;

      return {
        instance: inst,
        score: totalScore,
        metrics: {
          instanceName: inst.instance_name,
          evolutionApi: evolutionApi?.name || 'N/A',
          sentToday: inst.sent_today,
          errorToday: inst.error_today,
          dailyLimit: inst.daily_limit,
          secondsSinceLastUse: Math.round(secondsSinceLastUse),
          usageScore: usageScore.toFixed(4),
          timeScore: timeScore.toFixed(2),
          randomScore: randomScore.toFixed(4),
          totalScore: totalScore.toFixed(4),
        },
      };
    });

    // Ordena por score (maior primeiro)
    scored.sort((a, b) => b.score - a.score);

    // Log detalhado das top 3 candidatas
    console.log(`📈 [BALANCEADOR] Top 3 candidatas:`);
    scored.slice(0, 3).forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.metrics.instanceName} (${item.metrics.evolutionApi})`);
      console.log(`      Score: ${item.metrics.totalScore} | Enviados hoje: ${item.metrics.sentToday}/${item.metrics.dailyLimit || '∞'} | Tempo desde último uso: ${item.metrics.secondsSinceLastUse}s`);
    });

    const selected = scored[0].instance;
    const selectedApi = Array.isArray(selected.evolution_apis) 
      ? selected.evolution_apis[0] 
      : selected.evolution_apis;

    console.log(`✅ [BALANCEADOR] Instância selecionada: ${selected.instance_name}`);
    console.log(`   Evolution API: ${selectedApi?.name || 'N/A'} (${selectedApi?.base_url})`);
    console.log(`   Status: ${selected.status} | Enviados hoje: ${selected.sent_today}/${selected.daily_limit || '∞'}\n`);

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

    const startTime = Date.now();

    // 1. Seleciona a melhor instância
    const instance = await this.pickBestEvolutionInstance({
      userId,
      preferUserBinding,
      groupId,
      leadPhone,
    });

    if (!instance || !instance.evolution_api) {
      console.log(`❌ [BALANCEADOR] Nenhuma instância disponível para adicionar lead ${leadPhone}`);
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
        // Conexão fechada: marca como disconnected e desativa
        newStatus = 'disconnected';
        updates.status = 'disconnected';
        updates.is_active = false;

        await supabaseServiceRole
          .from('evolution_instance_logs')
          .insert({
            evolution_instance_id: instance.id,
            type: 'disconnected',
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

