import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { getUserEvolutionApi } from '@/lib/services/evolution-api-helper';

/**
 * GET /api/instances/[instanceName] - Busca uma instância específica
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { instanceName } = await params;

    // Busca APIs Evolution atribuídas ao usuário
    const { data: userApis } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select('evolution_api_id')
      .eq('user_id', userId);

    if (!userApis || userApis.length === 0) {
      return errorResponse('Instância não encontrada', 404);
    }

    // Busca instância nas APIs do usuário
    const apiIds = userApis.map(ua => ua.evolution_api_id);
    const { data, error } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          name,
          base_url,
          api_key
        )
      `)
      .in('evolution_api_id', apiIds)
      .eq('instance_name', instanceName)
      .single();

    if (error || !data) {
      return errorResponse('Instância não encontrada', 404);
    }

    // Converte para formato compatível
    const formatted = {
      id: data.id,
      instance_name: data.instance_name,
      status: data.status === 'ok' ? 'connected' : data.status === 'disconnected' ? 'disconnected' : 'connecting',
      number: data.phone_number,
      created_at: data.created_at,
      updated_at: data.updated_at,
      hash: Array.isArray(data.evolution_apis) ? data.evolution_apis[0]?.api_key : data.evolution_apis?.api_key || null,
      qr_code: null,
      user_id: userId,
    };

    return successResponse(formatted);
  } catch (err: any) {
    return errorResponse(err.message || 'Erro ao buscar instância', 401);
  }
}

/**
 * DELETE /api/instances/[instanceName] - Deleta uma instância
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { instanceName } = await params;

    // Busca APIs Evolution atribuídas ao usuário
    const { data: userApis } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select('evolution_api_id')
      .eq('user_id', userId);

    if (!userApis || userApis.length === 0) {
      return errorResponse('Instância não encontrada', 404);
    }

    // Busca a instância
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

    // Deleta na Evolution API
    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (evolutionApi?.api_key) {
      try {
        const deleteResponse = await fetch(`${evolutionApi.base_url}/instance/delete/${instanceName}`, {
          method: 'DELETE',
          headers: {
            apikey: evolutionApi.api_key,
          },
        });
        if (!deleteResponse.ok) {
          console.warn('Não foi possível deletar instância na Evolution API');
        }
      } catch (evolutionError: any) {
        console.error('Erro ao deletar na Evolution:', evolutionError);
        // Continua mesmo se falhar na Evolution
      }
    }

    // Deleta no banco
    const { error: deleteError } = await supabaseServiceRole
      .from('evolution_instances')
      .delete()
      .eq('id', instance.id);

    if (deleteError) {
      return errorResponse(`Erro ao deletar: ${deleteError.message}`);
    }

    return successResponse(null, 'Instância deletada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

