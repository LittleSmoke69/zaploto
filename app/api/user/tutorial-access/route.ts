import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * PATCH /api/user/tutorial-access - Atualiza tutorial_acess do usuário
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    const body = await req.json();
    const { tutorial_acess } = body;

    if (typeof tutorial_acess !== 'boolean') {
      return errorResponse('tutorial_acess deve ser um booleano', 400);
    }

    // Atualiza o campo tutorial_acess na tabela profiles
    const { data, error } = await supabaseServiceRole
      .from('profiles')
      .update({ tutorial_acess })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return errorResponse(`Erro ao atualizar tutorial_acess: ${error.message}`, 500);
    }

    return successResponse(data, 'Tutorial access atualizado com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * GET /api/user/tutorial-access - Retorna o valor atual de tutorial_acess
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);

    const { data, error } = await supabaseServiceRole
      .from('profiles')
      .select('tutorial_acess')
      .eq('id', userId)
      .single();

    if (error) {
      return errorResponse(`Erro ao buscar tutorial_acess: ${error.message}`, 500);
    }

    return successResponse({ tutorial_acess: data?.tutorial_acess ?? false });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

