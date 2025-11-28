import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/admin/campaigns - Lista todas as campanhas do sistema
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    // Verifica se é admin
    const { data: userSettings } = await supabaseServiceRole
      .from('user_settings')
      .select('is_admin')
      .eq('user_id', userId)
      .single();

    if (!userSettings?.is_admin) {
      return errorResponse('Acesso negado. Apenas administradores podem acessar.', 403);
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const userIdFilter = searchParams.get('userId');

    // Busca campanhas
    let query = supabaseServiceRole
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (userIdFilter) {
      query = query.eq('user_id', userIdFilter);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      return errorResponse(`Erro ao buscar campanhas: ${error.message}`);
    }

    // Busca dados dos usuários para cada campanha
    const campaignsWithUsers = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        const { data: user } = await supabaseServiceRole
          .from('profiles')
          .select('id, email, full_name')
          .eq('id', campaign.user_id)
          .single();

        return {
          ...campaign,
          profiles: user || null,
        };
      })
    );

    return successResponse(campaignsWithUsers);
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

