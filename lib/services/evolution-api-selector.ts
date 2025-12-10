import { supabaseServiceRole } from './supabase-service';

/**
 * Serviço para selecionar a melhor Evolution API para criar novas instâncias
 * Distribui a carga entre todas as Evolution APIs disponíveis
 */
export class EvolutionApiSelector {
  /**
   * Seleciona a melhor Evolution API para criar uma nova instância
   * Estratégia: distribui uniformemente entre as APIs ativas baseado em quantas instâncias cada uma já tem
   */
  async selectBestEvolutionApiForNewInstance(): Promise<{
    id: string;
    name: string;
    base_url: string;
    api_key: string; // Na verdade é api_key_global
  } | null> {
    try {
      // Busca todas as Evolution APIs ativas
      const { data: apis, error: apisError } = await supabaseServiceRole
        .from('evolution_apis')
        .select('id, name, base_url, api_key_global, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (apisError || !apis || apis.length === 0) {
        console.error('Nenhuma Evolution API ativa encontrada:', apisError);
        return null;
      }

      // Conta quantas instâncias cada API já tem
      const apiInstanceCounts = await Promise.all(
        apis.map(async (api) => {
          const { count, error } = await supabaseServiceRole
            .from('evolution_instances')
            .select('id', { count: 'exact', head: true })
            .eq('evolution_api_id', api.id)
            .eq('is_active', true);

          return {
            api,
            instanceCount: error ? 0 : (count || 0),
          };
        })
      );

      // Seleciona a API com menor número de instâncias
      // Se houver empate, seleciona aleatoriamente entre as com menos instâncias
      const minCount = Math.min(...apiInstanceCounts.map(a => a.instanceCount));
      const candidates = apiInstanceCounts.filter(a => a.instanceCount === minCount);

      // Seleciona aleatoriamente entre as candidatas (para distribuição uniforme)
      const selected = candidates[Math.floor(Math.random() * candidates.length)];

      console.log(`✅ Evolution API selecionada: ${selected.api.name} (${selected.instanceCount} instâncias existentes)`);

      return {
        id: selected.api.id,
        name: selected.api.name,
        base_url: selected.api.base_url,
        api_key: selected.api.api_key_global, // CRÍTICO: Retorna api_key_global
      };
    } catch (error) {
      console.error('Erro ao selecionar Evolution API:', error);
      return null;
    }
  }

  /**
   * Obtém todas as Evolution APIs ativas
   */
  async getAllActiveApis(): Promise<Array<{
    id: string;
    name: string;
    base_url: string;
    api_key: string; // Na verdade é api_key_global
    instanceCount: number;
  }>> {
    try {
      const { data: apis, error } = await supabaseServiceRole
        .from('evolution_apis')
        .select('id, name, base_url, api_key_global, is_active')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error || !apis || apis.length === 0) {
        return [];
      }

      // Conta instâncias por API
      const apisWithCounts = await Promise.all(
        apis.map(async (api) => {
          const { count } = await supabaseServiceRole
            .from('evolution_instances')
            .select('id', { count: 'exact', head: true })
            .eq('evolution_api_id', api.id)
            .eq('is_active', true);

          return {
            id: api.id,
            name: api.name,
            base_url: api.base_url,
            api_key: api.api_key_global, // CRÍTICO: Retorna api_key_global
            instanceCount: count || 0,
          };
        })
      );

      return apisWithCounts;
    } catch (error) {
      console.error('Erro ao buscar Evolution APIs:', error);
      return [];
    }
  }
}

export const evolutionApiSelector = new EvolutionApiSelector();

