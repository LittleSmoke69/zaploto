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

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
      if (status === 'running' && !body.started_at) {
        updateData.started_at = new Date().toISOString();
      }
      if (status === 'completed' || status === 'failed') {
        updateData.completed_at = new Date().toISOString();
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

