import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { getUserEvolutionApi } from '@/lib/services/evolution-api-helper';
import { checkInstanceAccess } from '@/lib/utils/instance-access';

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

    // Verifica se o usuário tem acesso à instância
    const hasAccess = await checkInstanceAccess(userId, instanceName);
    if (!hasAccess) {
      return errorResponse('Acesso negado. Você não tem permissão para acessar esta instância.', 403);
    }

    // Busca a instância
    const { data, error } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          name,
          base_url,
          api_key,
          is_active
        )
      `)
      .eq('instance_name', instanceName)
      .eq('is_active', true)
      .eq('evolution_apis.is_active', true)
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

    // Verifica se o usuário tem acesso à instância
    const hasAccess = await checkInstanceAccess(userId, instanceName);
    if (!hasAccess) {
      return errorResponse('Acesso negado. Você não tem permissão para deletar esta instância.', 403);
    }

    // Busca a instância (permite deletar mesmo se estiver inativa)
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis (
          id,
          base_url,
          api_key,
          is_active
        )
      `)
      .eq('instance_name', instanceName)
      .single();

    if (fetchError || !instance) {
      console.error(`❌ [DELETE INSTANCE] Erro ao buscar instância ${instanceName}:`, fetchError);
      return errorResponse('Instância não encontrada', 404);
    }

    // Verifica se a instância pertence ao usuário (se não for admin)
    if (instance.user_id !== userId) {
      // Verifica se é admin
      const { data: profile } = await supabaseServiceRole
        .from('profiles')
        .select('status')
        .eq('id', userId)
        .single();
      
      if (profile?.status !== 'admin') {
        return errorResponse('Acesso negado. Você não tem permissão para deletar esta instância.', 403);
      }
    }

    console.log(`🗑️ [DELETE INSTANCE] Instância encontrada: ${instanceName}, Status: ${instance.status}, is_active: ${instance.is_active}`);

    // Deleta na Evolution API (se houver API configurada)
    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (evolutionApi?.api_key && evolutionApi?.base_url) {
      try {
        const normalizedBaseUrl = evolutionApi.base_url.replace(/\/+$/, '').replace(/([^:]\/)\/+/g, '$1');
        const deleteUrl = `${normalizedBaseUrl}/instance/delete/${instanceName}`;
        const finalUrl = deleteUrl.replace(/([^:]\/)\/+/g, '$1');
        
        console.log(`🗑️ [DELETE INSTANCE] Tentando deletar na Evolution API: ${finalUrl}`);
        
        const deleteResponse = await fetch(finalUrl, {
          method: 'DELETE',
          headers: {
            apikey: evolutionApi.api_key,
          },
        });
        
        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text().catch(() => '');
          console.warn(`⚠️ [DELETE INSTANCE] Não foi possível deletar instância na Evolution API: ${deleteResponse.status} ${errorText}`);
        } else {
          console.log(`✅ [DELETE INSTANCE] Instância deletada na Evolution API com sucesso`);
        }
      } catch (evolutionError: any) {
        console.error(`❌ [DELETE INSTANCE] Erro ao deletar na Evolution:`, evolutionError);
        // Continua mesmo se falhar na Evolution - deleta do banco mesmo assim
      }
    } else {
      console.warn(`⚠️ [DELETE INSTANCE] Evolution API não configurada ou sem api_key/base_url. Deletando apenas do banco.`);
    }

    // Deleta no banco
    console.log(`🗑️ [DELETE INSTANCE] Deletando instância ${instanceName} (ID: ${instance.id}) do banco...`);
    const { error: deleteError } = await supabaseServiceRole
      .from('evolution_instances')
      .delete()
      .eq('id', instance.id);

    if (deleteError) {
      console.error(`❌ [DELETE INSTANCE] Erro ao deletar do banco:`, deleteError);
      return errorResponse(`Erro ao deletar: ${deleteError.message}`);
    }

    console.log(`✅ [DELETE INSTANCE] Instância ${instanceName} deletada com sucesso do banco`);
    return successResponse(null, 'Instância deletada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

