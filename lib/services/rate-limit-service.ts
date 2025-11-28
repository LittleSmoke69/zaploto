import { supabaseServiceRole } from './supabase-service';

const DEFAULT_MAX_LEADS_PER_DAY = 100; // Padrão: máximo de leads por dia por usuário
const DEFAULT_MAX_INSTANCES_PER_USER = 20; // Padrão: máximo de instâncias por usuário

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: string; // ISO timestamp
  reason?: string;
}

export interface InstanceStatus {
  instanceName: string;
  status: 'active' | 'banned' | 'suspended' | 'error';
  lastError?: string;
  errorType?: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown';
  lastErrorAt?: string;
  consecutiveErrors?: number;
}

export class RateLimitService {
  /**
   * Obtém configurações do usuário (limites personalizados)
   */
  async getUserSettings(userId: string): Promise<{
    maxLeadsPerDay: number;
    maxInstances: number;
    isAdmin: boolean;
  }> {
    const { data: settings } = await supabaseServiceRole
      .from('user_settings')
      .select('max_leads_per_day, max_instances, is_admin')
      .eq('user_id', userId)
      .single();

    return {
      maxLeadsPerDay: settings?.max_leads_per_day || DEFAULT_MAX_LEADS_PER_DAY,
      maxInstances: settings?.max_instances || DEFAULT_MAX_INSTANCES_PER_USER,
      isAdmin: settings?.is_admin || false,
    };
  }

  /**
   * Verifica se o usuário pode adicionar mais leads hoje
   */
  async checkDailyLimit(userId: string): Promise<RateLimitResult> {
    // Busca configurações do usuário
    const settings = await this.getUserSettings(userId);
    const maxLeads = settings.maxLeadsPerDay;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Busca campanhas do usuário criadas hoje
    const { data: campaigns, error } = await supabaseServiceRole
      .from('campaigns')
      .select('total_contacts, processed_contacts')
      .eq('user_id', userId)
      .gte('created_at', today.toISOString())
      .lt('created_at', tomorrow.toISOString());

    if (error) {
      console.error('Erro ao verificar rate limit:', error);
      // Em caso de erro, permite mas registra
      return {
        allowed: true,
        remaining: maxLeads,
        limit: maxLeads,
        resetAt: tomorrow.toISOString(),
      };
    }

    // Soma todos os contatos processados hoje
    const totalProcessedToday = campaigns?.reduce((sum, c) => sum + (c.processed_contacts || 0), 0) || 0;
    const remaining = Math.max(0, maxLeads - totalProcessedToday);

    return {
      allowed: remaining > 0,
      remaining,
      limit: maxLeads,
      resetAt: tomorrow.toISOString(),
      reason: remaining === 0 ? 'Limite diário de leads atingido' : undefined,
    };
  }

  /**
   * Verifica se o usuário pode criar mais instâncias
   */
  async checkInstanceLimit(userId: string): Promise<{ allowed: boolean; current: number; max: number; reason?: string }> {
    // Busca configurações do usuário
    const settings = await this.getUserSettings(userId);
    const maxInstances = settings.maxInstances;

    const { data: instances, error } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('id')
      .eq('user_id', userId);

    if (error) {
      console.error('Erro ao verificar limite de instâncias:', error);
      return {
        allowed: true,
        current: 0,
        max: maxInstances,
      };
    }

    const current = instances?.length || 0;
    const allowed = current < maxInstances;

    return {
      allowed,
      current,
      max: maxInstances,
      reason: !allowed ? `Limite de ${maxInstances} instâncias atingido` : undefined,
    };
  }

  /**
   * Registra uso de leads (atualiza contadores da campanha)
   */
  async recordLeadUsage(campaignId: string, count: number, success: boolean): Promise<void> {
    const updateField = success ? 'processed_contacts' : 'failed_contacts';
    
    // Busca valores atuais
    const { data: campaign } = await supabaseServiceRole
      .from('campaigns')
      .select(`${updateField}`)
      .eq('id', campaignId)
      .single();

    const currentValue = (campaign?.[updateField] as number) || 0;
    const newValue = currentValue + count;

    await supabaseServiceRole
      .from('campaigns')
      .update({
        [updateField]: newValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);
  }

  /**
   * Obtém status das instâncias para distribuição inteligente
   */
  async getInstancesStatus(userId: string, instanceNames: string[]): Promise<Map<string, InstanceStatus>> {
    const statusMap = new Map<string, InstanceStatus>();

    // Busca instâncias do usuário
    const { data: instances } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('instance_name, status')
      .eq('user_id', userId)
      .in('instance_name', instanceNames);

    // Inicializa status para todas as instâncias solicitadas
    for (const instanceName of instanceNames) {
      const instance = instances?.find(i => i.instance_name === instanceName);
      statusMap.set(instanceName, {
        instanceName,
        status: instance?.status === 'connected' ? 'active' : 'error',
        consecutiveErrors: 0,
      });
    }

    return statusMap;
  }

  /**
   * Marca instância com erro e atualiza contador
   */
  async markInstanceError(
    userId: string,
    instanceName: string,
    errorType: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown',
    errorMessage: string
  ): Promise<void> {
    // Busca instância
    const { data: instance } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', userId)
      .eq('instance_name', instanceName)
      .single();

    if (!instance) return;

    // Atualiza status baseado no tipo de erro
    let newStatus = instance.status;
    if (errorType === 'connection_closed') {
      newStatus = 'banned'; // Número banido/desconectado
    } else if (errorType === 'rate_limit') {
      newStatus = 'suspended'; // Temporariamente suspenso
    }

    await supabaseServiceRole
      .from('whatsapp_instances')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
  }

  /**
   * Seleciona a melhor instância disponível para uso
   */
  async selectBestInstance(userId: string, instanceNames: string[]): Promise<string | null> {
    const { data: instances } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('instance_name, status')
      .eq('user_id', userId)
      .in('instance_name', instanceNames)
      .eq('status', 'connected')
      .order('updated_at', { ascending: true }); // Usa a menos recentemente usada

    if (!instances || instances.length === 0) {
      return null;
    }

    return instances[0].instance_name;
  }
}

export const rateLimitService = new RateLimitService();

