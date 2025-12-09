import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';

/**
 * POST /api/groups/fetch - Busca grupos da Evolution API
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { instanceName } = body;

    if (!instanceName) {
      return errorResponse('instanceName é obrigatório', 400);
    }

    // Busca a instância e sua Evolution API
    const { data: userApis } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select('evolution_api_id')
      .eq('user_id', userId);

    if (!userApis || userApis.length === 0) {
      return errorResponse('Nenhuma Evolution API configurada para este usuário', 404);
    }

    const apiIds = userApis.map(ua => ua.evolution_api_id);
    const { data: instance, error: instanceError } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          base_url,
          api_key
        )
      `)
      .in('evolution_api_id', apiIds)
      .eq('instance_name', instanceName)
      .single();

    if (instanceError || !instance) {
      return errorResponse('Instância não encontrada', 404);
    }

    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (!evolutionApi?.api_key) {
      return errorResponse('Instância sem API key configurada', 404);
    }

    // Busca grupos na Evolution (com timeout)
    const PER_TRY_TIMEOUT = 180_000; // 3 minutos
    const MAX_TOTAL_MS = 420_000; // 7 minutos
    const started = Date.now();
    let attempt = 0;

    while (Date.now() - started < MAX_TOTAL_MS) {
      attempt += 1;
      try {
        const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), timeoutMs);
          try {
            return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
          } finally {
            clearTimeout(id);
          }
        };

        const url = `${evolutionApi.base_url}/group/fetchAllGroups/${instanceName}?getParticipants=true`;
        const resp = await fetchWithTimeout(
          url,
          { method: 'GET', headers: { apikey: evolutionApi.api_key } },
          PER_TRY_TIMEOUT
        );

        if (resp.ok) {
          const json = await resp.json().catch(() => []);
          let groupsList: any[] = [];
          
          if (Array.isArray(json)) {
            groupsList = json;
          } else if (Array.isArray(json?.groups)) {
            groupsList = json.groups;
          } else if (json?.id && json?.subject) {
            groupsList = [json];
          }

          if (groupsList.length > 0) {
            return successResponse(groupsList, `${groupsList.length} grupo(s) encontrado(s)`);
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log(`Tentativa ${attempt}: timeout`);
        } else {
          console.error(`Tentativa ${attempt}:`, err);
        }
      }

      const backoff = Math.min(20000, 5000 * attempt);
      await new Promise(r => setTimeout(r, backoff));
    }

    return errorResponse('Não foi possível obter os grupos após várias tentativas', 408);
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

