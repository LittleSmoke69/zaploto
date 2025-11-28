import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { rateLimitService } from '@/lib/services/rate-limit-service';

/**
 * GET /api/admin/stats - Retorna estatísticas gerais do sistema
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

    // Busca todas as estatísticas
    const [
      { count: totalUsers },
      { count: totalCampaigns },
      { count: totalContacts },
      { count: totalInstances },
      { count: totalGroups },
      campaignsData,
      instancesData,
      contactsData,
    ] = await Promise.all([
      supabaseServiceRole.from('profiles').select('id', { count: 'exact', head: true }),
      supabaseServiceRole.from('campaigns').select('id', { count: 'exact', head: true }),
      supabaseServiceRole.from('searches').select('id', { count: 'exact', head: true }),
      supabaseServiceRole.from('whatsapp_instances').select('id', { count: 'exact', head: true }),
      supabaseServiceRole.from('whatsapp_groups').select('id', { count: 'exact', head: true }),
      supabaseServiceRole
        .from('campaigns')
        .select('status, processed_contacts, failed_contacts, total_contacts'),
      supabaseServiceRole
        .from('whatsapp_instances')
        .select('status'),
      supabaseServiceRole
        .from('searches')
        .select('status, status_add_gp, status_disparo'),
    ]);

    // Calcula métricas
    const runningCampaigns = campaignsData?.data?.filter(c => c.status === 'running').length || 0;
    const pausedCampaigns = campaignsData?.data?.filter(c => c.status === 'paused').length || 0;
    const completedCampaigns = campaignsData?.data?.filter(c => c.status === 'completed').length || 0;
    const failedCampaigns = campaignsData?.data?.filter(c => c.status === 'failed').length || 0;
    
    const totalProcessed = campaignsData?.data?.reduce((sum, c) => sum + (c.processed_contacts || 0), 0) || 0;
    const totalFailed = campaignsData?.data?.reduce((sum, c) => sum + (c.failed_contacts || 0), 0) || 0;
    const totalAdded = campaignsData?.data?.reduce((sum, c) => sum + (c.total_contacts || 0), 0) || 0;

    const connectedInstances = instancesData?.data?.filter(i => i.status === 'connected').length || 0;
    const pendingContacts = contactsData?.data?.filter(c => c.status === 'pending').length || 0;
    const addedContacts = contactsData?.data?.filter(c => c.status_add_gp === true).length || 0;
    const sentMessages = contactsData?.data?.filter(c => c.status_disparo === true).length || 0;

    // Taxa de sucesso
    const successRate = totalAdded > 0 
      ? Math.round((totalProcessed / totalAdded) * 100) 
      : 0;

    return successResponse({
      overview: {
        totalUsers: totalUsers || 0,
        totalCampaigns: totalCampaigns || 0,
        totalContacts: totalContacts || 0,
        totalInstances: totalInstances || 0,
        totalGroups: totalGroups || 0,
      },
      campaigns: {
        total: totalCampaigns || 0,
        running: runningCampaigns,
        paused: pausedCampaigns,
        completed: completedCampaigns,
        failed: failedCampaigns,
        totalProcessed,
        totalFailed,
        totalAdded,
        successRate,
      },
      instances: {
        total: totalInstances || 0,
        connected: connectedInstances,
        disconnected: (totalInstances || 0) - connectedInstances,
      },
      contacts: {
        total: totalContacts || 0,
        pending: pendingContacts,
        added: addedContacts,
        sent: sentMessages,
      },
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

