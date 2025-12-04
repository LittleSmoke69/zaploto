import { supabaseServiceRole } from './supabase-service';

/**
 * Busca a API Evolution configurada para um usuário
 * Retorna a API padrão do usuário ou a primeira API ativa disponível
 */
export async function getUserEvolutionApi(userId: string): Promise<{
  baseUrl: string;
  apiKey: string;
} | null> {
  try {
    // Busca a API padrão do usuário
    const { data: userApis } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select(`
        evolution_api_id,
        is_default,
        evolution_apis (
          id,
          base_url,
          api_key,
          is_active
        )
      `)
      .eq('user_id', userId)
      .eq('is_default', true);

    // Filtra apenas APIs ativas
    const defaultApi = Array.isArray(userApis)
      ? userApis.find(
          (ua: any) => ua.evolution_apis && ua.evolution_apis.is_active === true
        )
      : null;

    if (defaultApi?.evolution_apis) {
      const api = defaultApi.evolution_apis as any;
      if (api && typeof api === 'object' && 'base_url' in api) {
        return {
          baseUrl: api.base_url,
          apiKey: api.api_key,
        };
      }
    }

    // Se não tem padrão, busca qualquer API atribuída ao usuário
    const { data: anyUserApis } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select(`
        evolution_apis (
          id,
          base_url,
          api_key,
          is_active
        )
      `)
      .eq('user_id', userId)
      .limit(10);

    // Filtra apenas APIs ativas
    const activeApi = Array.isArray(anyUserApis) 
      ? anyUserApis.find(
          (ua: any) => ua.evolution_apis && ua.evolution_apis.is_active === true
        )
      : null;

    if (activeApi?.evolution_apis) {
      const api = activeApi.evolution_apis as any;
      if (api && typeof api === 'object' && 'base_url' in api) {
        return {
          baseUrl: api.base_url,
          apiKey: api.api_key,
        };
      }
    }

    // Se não tem API atribuída, busca a primeira API ativa do sistema
    const { data: systemApi } = await supabaseServiceRole
      .from('evolution_apis')
      .select('base_url, api_key')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (systemApi) {
      return {
        baseUrl: systemApi.base_url,
        apiKey: systemApi.api_key,
      };
    }

    // Fallback para variáveis de ambiente (compatibilidade)
    const envBase = process.env.EVOLUTION_BASE || process.env.NEXT_PUBLIC_EVOLUTION_BASE || '';
    const envKey = process.env.EVOLUTION_APIKEY || process.env.NEXT_PUBLIC_EVOLUTION_APIKEY || '';

    if (envBase && envKey) {
      return {
        baseUrl: envBase,
        apiKey: envKey,
      };
    }

    return null;
  } catch (error) {
    console.error('Erro ao buscar API Evolution do usuário:', error);
    
    // Fallback para variáveis de ambiente em caso de erro
    const envBase = process.env.EVOLUTION_BASE || process.env.NEXT_PUBLIC_EVOLUTION_BASE || '';
    const envKey = process.env.EVOLUTION_APIKEY || process.env.NEXT_PUBLIC_EVOLUTION_APIKEY || '';

    if (envBase && envKey) {
      return {
        baseUrl: envBase,
        apiKey: envKey,
      };
    }

    return null;
  }
}

