import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/admin/evolution-apis - Lista todas as APIs Evolution
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    // Verifica se é admin
    const { data: profile } = await supabaseServiceRole
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();

    if (profile?.status !== 'admin') {
      return errorResponse('Acesso negado. Apenas administradores podem acessar.', 403);
    }

    const { data: apis, error } = await supabaseServiceRole
      .from('evolution_apis')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(`Erro ao buscar APIs: ${error.message}`);
    }

    // Busca contagem de usuários para cada API
    const apisWithStats = await Promise.all(
      (apis || []).map(async (api) => {
        const { count } = await supabaseServiceRole
          .from('user_evolution_apis')
          .select('id', { count: 'exact', head: true })
          .eq('evolution_api_id', api.id);

        return {
          ...api,
          user_count: count || 0,
        };
      })
    );

    return successResponse(apisWithStats);
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * POST /api/admin/evolution-apis - Cria uma nova API Evolution
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    // Verifica se é admin
    const { data: profile } = await supabaseServiceRole
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();

    if (profile?.status !== 'admin') {
      return errorResponse('Acesso negado. Apenas administradores podem acessar.', 403);
    }

    const body = await req.json();
    const { name, base_url, api_key, description, is_active } = body;

    if (!name || !base_url || !api_key) {
      return errorResponse('name, base_url e api_key são obrigatórios', 400);
    }

    // Valida URL
    try {
      new URL(base_url);
    } catch {
      return errorResponse('base_url deve ser uma URL válida', 400);
    }

    const { data, error } = await supabaseServiceRole
      .from('evolution_apis')
      .insert({
        name,
        base_url: base_url.endsWith('/') ? base_url : `${base_url}/`,
        api_key,
        description: description || null,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single();

    if (error) {
      return errorResponse(`Erro ao criar API: ${error.message}`);
    }

    return successResponse(data, 'API Evolution criada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

