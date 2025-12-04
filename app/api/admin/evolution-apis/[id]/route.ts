import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * PATCH /api/admin/evolution-apis/[id] - Atualiza uma API Evolution
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    
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

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (base_url !== undefined) {
      // Valida URL
      try {
        new URL(base_url);
        updateData.base_url = base_url.endsWith('/') ? base_url : `${base_url}/`;
      } catch {
        return errorResponse('base_url deve ser uma URL válida', 400);
      }
    }
    if (api_key !== undefined) updateData.api_key = api_key;
    if (description !== undefined) updateData.description = description;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabaseServiceRole
      .from('evolution_apis')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return errorResponse(`Erro ao atualizar API: ${error.message}`);
    }

    if (!data) {
      return errorResponse('API não encontrada', 404);
    }

    return successResponse(data, 'API Evolution atualizada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * DELETE /api/admin/evolution-apis/[id] - Deleta uma API Evolution
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    
    // Verifica se é admin
    const { data: profile } = await supabaseServiceRole
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();

    if (profile?.status !== 'admin') {
      return errorResponse('Acesso negado. Apenas administradores podem acessar.', 403);
    }

    // Verifica se há usuários atribuídos
    const { count } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select('id', { count: 'exact', head: true })
      .eq('evolution_api_id', id);

    if (count && count > 0) {
      return errorResponse('Não é possível deletar uma API que possui usuários atribuídos. Remova as atribuições primeiro.', 400);
    }

    const { error } = await supabaseServiceRole
      .from('evolution_apis')
      .delete()
      .eq('id', id);

    if (error) {
      return errorResponse(`Erro ao deletar API: ${error.message}`);
    }

    return successResponse(null, 'API Evolution deletada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

