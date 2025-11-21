import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';

/**
 * GET /api/instances/[instanceName]/status - Verifica status de conexão
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { instanceName } = await params;

    // Busca a instância
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('hash')
      .eq('user_id', userId)
      .eq('instance_name', instanceName)
      .single();

    if (fetchError || !instance || !instance.hash) {
      return errorResponse('Instância não encontrada ou sem API key', 404);
    }

    // Verifica status na Evolution
    const evolutionData = await evolutionService.getConnectionState(instanceName, instance.hash);
    const state = evolutionService.extractState(evolutionData);
    const qrCode = evolutionService.extractQr(evolutionData);

    // Atualiza no banco
    const updateData: any = {
      status: state,
      updated_at: new Date().toISOString(),
    };

    if (state === 'connected') {
      updateData.connected_at = new Date().toISOString();
      updateData.qr_code = null;
    } else if (qrCode) {
      updateData.qr_code = qrCode;
    }

    await supabaseServiceRole
      .from('whatsapp_instances')
      .update(updateData)
      .eq('user_id', userId)
      .eq('instance_name', instanceName);

    return successResponse({
      status: state,
      qrCode,
      raw: evolutionData,
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * POST /api/instances/[instanceName]/status/connect - Reconecta instância
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { instanceName } = await params;

    // Busca a instância
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('hash')
      .eq('user_id', userId)
      .eq('instance_name', instanceName)
      .single();

    if (fetchError || !instance || !instance.hash) {
      return errorResponse('Instância não encontrada ou sem API key', 404);
    }

    // Reconecta na Evolution
    const evolutionData = await evolutionService.connectInstance(instanceName, instance.hash);
    const state = evolutionService.extractState(evolutionData);
    const qrCode = evolutionService.extractQr(evolutionData);

    // Atualiza no banco
    await supabaseServiceRole
      .from('whatsapp_instances')
      .update({
        status: 'connecting',
        qr_code: qrCode,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('instance_name', instanceName);

    return successResponse({
      status: state,
      qrCode,
      message: 'Reconexão solicitada',
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

