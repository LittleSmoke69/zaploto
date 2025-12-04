import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/admin/users - Lista todos os usuários com suas estatísticas
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    // Verifica se é admin através do campo status na tabela profiles
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
      .select('id, email, full_name, created_at')
      .order('created_at', { ascending: false });

    if (usersError) {
      return errorResponse(`Erro ao buscar usuários: ${usersError.message}`);
    }

    // Busca configurações e estatísticas de cada usuário
    const usersWithStats = await Promise.all(
      (users || []).map(async (user) => {
        const [
          { data: settings },
          { count: campaignsCount },
          { count: instancesCount },
          { count: contactsCount },
          { data: campaigns },
        ] = await Promise.all([
          supabaseServiceRole
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single(),
          supabaseServiceRole
            .from('campaigns')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabaseServiceRole
            .from('whatsapp_instances')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabaseServiceRole
            .from('searches')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabaseServiceRole
            .from('campaigns')
            .select('processed_contacts, failed_contacts')
            .eq('user_id', user.id),
        ]);

        const totalProcessed = campaigns?.reduce((sum, c) => sum + (c.processed_contacts || 0), 0) || 0;
        const totalFailed = campaigns?.reduce((sum, c) => sum + (c.failed_contacts || 0), 0) || 0;

        return {
          ...user,
          settings: settings || {
            max_leads_per_day: 100,
            max_instances: 20,
            is_admin: false,
            is_active: true,
          },
          stats: {
            campaigns: campaignsCount || 0,
            instances: instancesCount || 0,
            contacts: contactsCount || 0,
            processed: totalProcessed,
            failed: totalFailed,
          },
        };
      })
    );

    return successResponse(usersWithStats);
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * PATCH /api/admin/users - Atualiza configurações de um usuário
 */
export async function PATCH(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    // Verifica se é admin através do campo status na tabela profiles
    const { data: profile } = await supabaseServiceRole
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();

    if (profile?.status !== 'admin') {
      return errorResponse('Acesso negado. Apenas administradores podem acessar.', 403);
    }

    const body = await req.json();
    const { targetUserId, maxLeadsPerDay, maxInstances, isActive } = body;

    if (!targetUserId) {
      return errorResponse('targetUserId é obrigatório', 400);
    }

    // Atualiza ou cria configurações
    const { data: existing } = await supabaseServiceRole
      .from('user_settings')
      .select('id')
      .eq('user_id', targetUserId)
      .single();

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (typeof maxLeadsPerDay === 'number') {
      updateData.max_leads_per_day = maxLeadsPerDay;
    }

    if (typeof maxInstances === 'number') {
      updateData.max_instances = maxInstances;
    }

    if (typeof isActive === 'boolean') {
      updateData.is_active = isActive;
    }

    let result;
    if (existing) {
      // Atualiza existente
      const { data, error } = await supabaseServiceRole
        .from('user_settings')
        .update(updateData)
        .eq('user_id', targetUserId)
        .select()
        .single();

      if (error) {
        return errorResponse(`Erro ao atualizar configurações: ${error.message}`);
      }

      result = data;
    } else {
      // Cria novo
      const { data, error } = await supabaseServiceRole
        .from('user_settings')
        .insert({
          user_id: targetUserId,
          max_leads_per_day: maxLeadsPerDay || 100,
          max_instances: maxInstances || 20,
          is_active: isActive !== undefined ? isActive : true,
          ...updateData,
        })
        .select()
        .single();

      if (error) {
        return errorResponse(`Erro ao criar configurações: ${error.message}`);
      }

      result = data;
    }

    return successResponse(result, 'Configurações atualizadas com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

