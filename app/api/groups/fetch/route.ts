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

    // Busca hash da instância
    const { data: instance, error: instanceError } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('hash')
      .eq('user_id', userId)
      .eq('instance_name', instanceName)
      .single();

    if (instanceError || !instance || !instance.hash) {
      return errorResponse('Instância não encontrada ou sem API key', 404);
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

        const url = `${process.env.EVOLUTION_BASE || process.env.NEXT_PUBLIC_EVOLUTION_BASE}/group/fetchAllGroups/${instanceName}?getParticipants=true`;
        const resp = await fetchWithTimeout(
          url,
          { method: 'GET', headers: { apikey: instance.hash } },
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

