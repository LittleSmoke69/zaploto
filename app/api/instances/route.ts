import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';

/**
 * GET /api/instances - Lista todas as instâncias do usuário
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);

    const { data, error } = await supabaseServiceRole
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(`Erro ao buscar instâncias: ${error.message}`);
    }

    return successResponse(data || [], 'Instâncias carregadas com sucesso');
  } catch (err: any) {
    return errorResponse(err.message || 'Erro ao buscar instâncias', 401);
  }
}

/**
 * POST /api/instances - Cria uma nova instância
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { instanceName, phoneNumber } = body;

    if (!instanceName || !phoneNumber) {
      return errorResponse('instanceName e phoneNumber são obrigatórios', 400);
    }

    if (phoneNumber.length < 10) {
      return errorResponse('Número de telefone inválido (mínimo 10 dígitos)', 400);
    }

    const fullNumber = `55${phoneNumber}`;

    // Cria instância na Evolution API
    const evolutionData = await evolutionService.createInstance(instanceName, fullNumber, true);

    if (!evolutionData.qrcode?.base64) {
      return errorResponse('Erro ao gerar QR Code na Evolution API', 500);
    }

    // Salva no banco
    const { data: savedInstance, error: dbError } = await supabaseServiceRole
      .from('whatsapp_instances')
      .insert({
        user_id: userId,
        instance_name: instanceName,
        status: 'connecting',
        qr_code: evolutionData.qrcode.base64,
        hash: evolutionData.hash,
        number: fullNumber,
      })
      .select()
      .single();

    if (dbError || !savedInstance) {
      // Tenta deletar na Evolution se falhou no banco
      try {
        if (evolutionData.hash) {
          await evolutionService.deleteInstance(instanceName, evolutionData.hash);
        }
      } catch {}
      return errorResponse(`Erro ao salvar instância: ${dbError?.message || 'Erro desconhecido'}`);
    }

    return successResponse(savedInstance, 'Instância criada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

