import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { getUserEvolutionApi } from '@/lib/services/evolution-api-helper';

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

    // Busca a instância e sua Evolution API
    const { data: userApis } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select('evolution_api_id')
      .eq('user_id', userId);

    if (!userApis || userApis.length === 0) {
      return errorResponse('Nenhuma Evolution API configurada', 404);
    }

    const apiIds = userApis.map(ua => ua.evolution_api_id);
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          base_url,
          api_key
        )
      `)
      .in('evolution_api_id', apiIds)
      .eq('instance_name', instanceName)
      .single();

    if (fetchError || !instance) {
      return errorResponse('Instância não encontrada', 404);
    }

    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (!evolutionApi?.api_key) {
      return errorResponse('Instância sem API key configurada', 404);
    }

    // Verifica status na Evolution
    const evolutionData = await evolutionService.getConnectionState(instanceName, evolutionApi.api_key);
    const state = evolutionService.extractState(evolutionData);
    const qrCode = evolutionService.extractQr(evolutionData);

    // Mapeia status para o novo formato
    let newStatus = instance.status;
    if (state === 'connected') {
      newStatus = 'ok';
    } else if (state === 'disconnected') {
      newStatus = 'disconnected';
    } else if (state === 'connecting') {
      newStatus = 'ok'; // Mantém como ok durante conexão
    }

    // Atualiza no banco
    await supabaseServiceRole
      .from('evolution_instances')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);

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

    // Busca a instância e sua Evolution API
    const { data: userApis } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select('evolution_api_id')
      .eq('user_id', userId);

    if (!userApis || userApis.length === 0) {
      return errorResponse('Nenhuma Evolution API configurada', 404);
    }

    const apiIds = userApis.map(ua => ua.evolution_api_id);
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          base_url,
          api_key
        )
      `)
      .in('evolution_api_id', apiIds)
      .eq('instance_name', instanceName)
      .single();

    if (fetchError || !instance) {
      return errorResponse('Instância não encontrada', 404);
    }

    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (!evolutionApi?.api_key) {
      return errorResponse('Instância sem API key configurada', 404);
    }

    // Reconecta na Evolution
    const evolutionData = await evolutionService.connectInstance(instanceName, evolutionApi.api_key);
    const state = evolutionService.extractState(evolutionData);
    const qrCode = evolutionService.extractQr(evolutionData);

    // Atualiza no banco
    await supabaseServiceRole
      .from('evolution_instances')
      .update({
        status: state === 'connected' ? 'ok' : 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id);

    return successResponse({
      status: state,
      qrCode,
      message: 'Reconexão solicitada',
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

