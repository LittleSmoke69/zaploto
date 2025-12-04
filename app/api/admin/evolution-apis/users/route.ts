import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/admin/evolution-apis/users - Lista usuários e suas APIs atribuídas
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

    // Busca todos os usuários
    const { data: users, error: usersError } = await supabaseServiceRole
      .from('profiles')
      .select('id, email, full_name')
      .order('created_at', { ascending: false });

    if (usersError) {
      return errorResponse(`Erro ao buscar usuários: ${usersError.message}`);
    }

    // Para cada usuário, busca suas APIs atribuídas
    const usersWithApis = await Promise.all(
      (users || []).map(async (user) => {
        try {
          const { data: userApis, error: userApisError } = await supabaseServiceRole
            .from('user_evolution_apis')
            .select(`
              id,
              is_default,
              evolution_apis (
                id,
                name,
                base_url,
                is_active
              )
            `)
            .eq('user_id', user.id);

          if (userApisError) {
            console.error(`Erro ao buscar APIs do usuário ${user.id}:`, userApisError);
          }

          return {
            ...user,
            evolution_apis: userApis || [],
          };
        } catch (error) {
          console.error(`Erro ao processar usuário ${user.id}:`, error);
          return {
            ...user,
            evolution_apis: [],
          };
        }
      })
    );

    return successResponse(usersWithApis);
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

