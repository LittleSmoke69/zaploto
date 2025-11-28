import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/admin/users/[userId] - Retorna dados detalhados de um usuário específico
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId: adminUserId } = await requireAuth(req);
    const { userId: targetUserId } = await params;
    
    // Verifica se é admin
    const { data: userSettings } = await supabaseServiceRole
      .from('user_settings')
      .select('is_admin')
      .eq('user_id', adminUserId)
      .single();

    if (!userSettings?.is_admin) {
      return errorResponse('Acesso negado. Apenas administradores podem acessar.', 403);
    }

    // Busca dados do usuário
    const { data: user, error: userError } = await supabaseServiceRole
      .from('profiles')
      .select('id, email, full_name, created_at')
      .eq('id', targetUserId)
      .single();

    if (userError || !user) {
      return errorResponse('Usuário não encontrado', 404);
    }

    // Busca configurações
    const { data: settings } = await supabaseServiceRole
      .from('user_settings')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    // Busca estatísticas
    const [
      { data: campaigns },
      { data: instances },
      { data: contacts },
      { data: groups },
    ] = await Promise.all([
      supabaseServiceRole
        .from('campaigns')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false }),
      supabaseServiceRole
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false }),
      supabaseServiceRole
        .from('searches')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false }),
      supabaseServiceRole
        .from('whatsapp_groups')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false }),
    ]);

    // Calcula métricas
    const runningCampaigns = campaigns?.filter(c => c.status === 'running').length || 0;
    const totalProcessed = campaigns?.reduce((sum, c) => sum + (c.processed_contacts || 0), 0) || 0;
    const totalFailed = campaigns?.reduce((sum, c) => sum + (c.failed_contacts || 0), 0) || 0;
    const pendingContacts = contacts?.filter(c => c.status === 'pending').length || 0;
    const addedContacts = contacts?.filter(c => c.status_add_gp === true).length || 0;
    const connectedInstances = instances?.filter(i => i.status === 'connected').length || 0;

    return successResponse({
      user,
      settings: settings || {
        max_leads_per_day: 100,
        max_instances: 20,
        is_admin: false,
        is_active: true,
      },
      stats: {
        campaigns: {
          total: campaigns?.length || 0,
          running: runningCampaigns,
          completed: campaigns?.filter(c => c.status === 'completed').length || 0,
          failed: campaigns?.filter(c => c.status === 'failed').length || 0,
          paused: campaigns?.filter(c => c.status === 'paused').length || 0,
          totalProcessed,
          totalFailed,
        },
        instances: {
          total: instances?.length || 0,
          connected: connectedInstances,
          disconnected: (instances?.length || 0) - connectedInstances,
        },
        contacts: {
          total: contacts?.length || 0,
          pending: pendingContacts,
          added: addedContacts,
        },
        groups: {
          total: groups?.length || 0,
        },
      },
      data: {
        campaigns: campaigns || [],
        instances: instances || [],
        contacts: contacts || [],
        groups: groups || [],
      },
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

