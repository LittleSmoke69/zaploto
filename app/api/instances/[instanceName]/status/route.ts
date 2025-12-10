import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { getUserEvolutionApi } from '@/lib/services/evolution-api-helper';
import { checkInstanceAccess } from '@/lib/utils/instance-access';

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

    // Verifica se o usuário tem acesso à instância
    const hasAccess = await checkInstanceAccess(userId, instanceName);
    if (!hasAccess) {
      return errorResponse('Acesso negado. Você não tem permissão para acessar esta instância.', 403);
    }

    // Busca a instância e sua Evolution API
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          base_url,
          api_key_global,
          is_active
        )
      `)
      .eq('instance_name', instanceName)
      .eq('is_active', true)
      .eq('evolution_apis.is_active', true)
      .single();

    if (fetchError || !instance) {
      return errorResponse('Instância não encontrada', 404);
    }

    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (!evolutionApi?.api_key_global) {
      return errorResponse('Instância sem API key global configurada', 404);
    }

    // Verifica status na Evolution usando api_key_global
    const evolutionData = await evolutionService.getConnectionState(instanceName, evolutionApi.api_key_global, evolutionApi.base_url);
    const state = evolutionService.extractState(evolutionData);
    const qrCode = evolutionService.extractQr(evolutionData);

    console.log(`📊 [STATUS] Instância ${instanceName}: state extraído=${state}, dados brutos:`, JSON.stringify(evolutionData).substring(0, 300));

    // Mapeia status para o novo formato
    // IMPORTANTE: 'ok' no banco significa CONECTADO, não 'connecting'
    // 'connecting' significa aguardando QR code ser escaneado
    let newStatus = instance.status;
    if (state === 'connected') {
      newStatus = 'ok'; // Conectado
      console.log(`✅ [STATUS] Instância ${instanceName} CONECTADA - atualizando status para 'ok'`);
    } else if (state === 'disconnected') {
      newStatus = 'disconnected'; // Desconectado
      console.log(`⚠️ [STATUS] Instância ${instanceName} DESCONECTADA - atualizando status para 'disconnected'`);
    } else if (state === 'connecting') {
      newStatus = 'disconnected'; // Aguardando QR code = ainda desconectado
      console.log(`⏳ [STATUS] Instância ${instanceName} CONECTANDO - mantendo status 'disconnected'`);
    } else {
      console.log(`❓ [STATUS] Instância ${instanceName} estado desconhecido: ${state} - mantendo status atual: ${instance.status}`);
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

    // Verifica se o usuário tem acesso à instância
    const hasAccess = await checkInstanceAccess(userId, instanceName);
    if (!hasAccess) {
      return errorResponse('Acesso negado. Você não tem permissão para acessar esta instância.', 403);
    }

    // Busca a instância e sua Evolution API
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          base_url,
          api_key_global,
          is_active
        )
      `)
      .eq('instance_name', instanceName)
      .eq('is_active', true)
      .eq('evolution_apis.is_active', true)
      .single();

    if (fetchError || !instance) {
      return errorResponse('Instância não encontrada', 404);
    }

    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (!evolutionApi?.api_key_global) {
      return errorResponse('Instância sem API key global configurada', 404);
    }

    // Reconecta na Evolution usando api_key_global
    const evolutionData = await evolutionService.connectInstance(instanceName, evolutionApi.api_key_global, evolutionApi.base_url);
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

