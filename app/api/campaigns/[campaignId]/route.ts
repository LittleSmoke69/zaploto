import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/campaigns/[campaignId] - Busca uma campanha específica
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { campaignId } = await params;

    const { data, error } = await supabaseServiceRole
      .from('campaigns')
      .select('*')
      .eq('user_id', userId)
      .eq('id', campaignId)
      .single();

    if (error || !data) {
      return errorResponse('Campanha não encontrada', 404);
    }

    return successResponse(data);
  } catch (err: any) {
    return errorResponse(err.message || 'Erro ao buscar campanha', 401);
  }
}

/**
 * PATCH /api/campaigns/[campaignId] - Atualiza status de uma campanha
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { campaignId } = await params;
    const body = await req.json();
    const { status, processedContacts, failedContacts } = body;

    // Busca campanha atual para validar transições de status
    const { data: currentCampaign } = await supabaseServiceRole
      .from('campaigns')
      .select('status')
      .eq('user_id', userId)
      .eq('id', campaignId)
      .single();

    if (!currentCampaign) {
      return errorResponse('Campanha não encontrada', 404);
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      // Valida transições de status
      const currentStatus = currentCampaign.status;
      const validTransitions: Record<string, string[]> = {
        pending: ['running', 'failed'],
        running: ['paused', 'completed', 'failed'],
        paused: ['running', 'failed'],
        completed: [], // Não pode mudar de completed
        failed: ['pending', 'running'], // Pode retentar
      };

      if (validTransitions[currentStatus]?.includes(status)) {
        updateData.status = status;
        
        if (status === 'running' && currentStatus === 'paused') {
          // Retomando campanha pausada - não atualiza started_at
          // Mantém o started_at original
        } else if (status === 'running' && currentStatus !== 'paused' && !body.started_at) {
          updateData.started_at = new Date().toISOString();
        }
        
        if (status === 'completed' || status === 'failed') {
          updateData.completed_at = new Date().toISOString();
        }
      } else {
        return errorResponse(
          `Transição de status inválida: ${currentStatus} -> ${status}`,
          400
        );
      }
    }

    if (typeof processedContacts === 'number') {
      updateData.processed_contacts = processedContacts;
    }

    if (typeof failedContacts === 'number') {
      updateData.failed_contacts = failedContacts;
    }

    const { data, error } = await supabaseServiceRole
      .from('campaigns')
      .update(updateData)
      .eq('user_id', userId)
      .eq('id', campaignId)
      .select()
      .single();

    if (error) {
      return errorResponse(`Erro ao atualizar campanha: ${error.message}`);
    }

    return successResponse(data, 'Campanha atualizada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * DELETE /api/campaigns/[campaignId] - Exclui uma campanha
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { campaignId } = await params;

    // Verifica se a campanha existe e pertence ao usuário
    const { data: campaign, error: checkError } = await supabaseServiceRole
      .from('campaigns')
      .select('id, status')
      .eq('user_id', userId)
      .eq('id', campaignId)
      .single();

    if (checkError || !campaign) {
      return errorResponse('Campanha não encontrada', 404);
    }

    // Se a campanha estiver em execução ou pausada, marca como failed antes de excluir
    if (campaign.status === 'running' || campaign.status === 'paused') {
      await supabaseServiceRole
        .from('campaigns')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
    }

    // Exclui a campanha
    const { error } = await supabaseServiceRole
      .from('campaigns')
      .delete()
      .eq('user_id', userId)
      .eq('id', campaignId);

    if (error) {
      return errorResponse(`Erro ao excluir campanha: ${error.message}`);
    }

    return successResponse({ id: campaignId }, 'Campanha excluída com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

