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

    if (!campaignId) {
      return errorResponse('ID da campanha é obrigatório', 400);
    }

    console.log(`🗑️ Tentando excluir campanha: ${campaignId} para usuário: ${userId}`);

    // Verifica se a campanha existe e pertence ao usuário
    const { data: campaign, error: checkError } = await supabaseServiceRole
      .from('campaigns')
      .select('id, status')
      .eq('user_id', userId)
      .eq('id', campaignId)
      .single();

    if (checkError) {
      console.error('❌ Erro ao verificar campanha:', checkError);
      return errorResponse(`Erro ao verificar campanha: ${checkError.message}`, 500);
    }

    if (!campaign) {
      console.log(`⚠️ Campanha não encontrada: ${campaignId}`);
      return errorResponse('Campanha não encontrada', 404);
    }

    console.log(`📋 Campanha encontrada: ${campaignId}, Status: ${campaign.status}`);

    // Se a campanha estiver em execução ou pausada, marca como failed antes de excluir
    if (campaign.status === 'running' || campaign.status === 'paused') {
      console.log(`🔄 Atualizando status da campanha ${campaignId} para 'failed' antes de excluir`);
      const { error: updateError } = await supabaseServiceRole
        .from('campaigns')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('❌ Erro ao atualizar status da campanha:', updateError);
        return errorResponse(`Erro ao atualizar status da campanha: ${updateError.message}`, 500);
      }
    }

    // Exclui a campanha
    console.log(`🗑️ Excluindo campanha: ${campaignId}`);
    const { error, data } = await supabaseServiceRole
      .from('campaigns')
      .delete()
      .eq('user_id', userId)
      .eq('id', campaignId)
      .select();

    if (error) {
      console.error('❌ Erro ao excluir campanha:', error);
      return errorResponse(`Erro ao excluir campanha: ${error.message}`, 500);
    }

    if (!data || data.length === 0) {
      console.log(`⚠️ Nenhuma campanha foi excluída: ${campaignId}`);
      return errorResponse('Campanha não encontrada ou já foi excluída', 404);
    }

    console.log(`✅ Campanha excluída com sucesso: ${campaignId}`);
    return successResponse({ id: campaignId }, 'Campanha excluída com sucesso');
  } catch (err: any) {
    console.error('❌ Erro inesperado ao excluir campanha:', err);
    return serverErrorResponse(err);
  }
}

