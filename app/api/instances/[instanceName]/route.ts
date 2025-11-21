import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';

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

    const { data, error } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', userId)
      .eq('instance_name', instanceName)
      .single();

    if (error || !data) {
      return errorResponse('Instância não encontrada', 404);
    }

    return successResponse(data);
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

    // Busca a instância
    const { data: instance, error: fetchError } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('hash')
      .eq('user_id', userId)
      .eq('instance_name', instanceName)
      .single();

    if (fetchError || !instance) {
      return errorResponse('Instância não encontrada', 404);
    }

    // Deleta na Evolution API
    if (instance.hash) {
      try {
        await evolutionService.deleteInstance(instanceName, instance.hash);
      } catch (evolutionError: any) {
        console.error('Erro ao deletar na Evolution:', evolutionError);
        // Continua mesmo se falhar na Evolution
      }
    }

    // Deleta no banco
    const { error: deleteError } = await supabaseServiceRole
      .from('whatsapp_instances')
      .delete()
      .eq('user_id', userId)
      .eq('instance_name', instanceName);

    if (deleteError) {
      return errorResponse(`Erro ao deletar: ${deleteError.message}`);
    }

    return successResponse(null, 'Instância deletada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

