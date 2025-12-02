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

    console.log('Evolution API Response:', {
      hasQrcode: !!evolutionData.qrcode,
      qrcodeType: typeof evolutionData.qrcode,
      keys: Object.keys(evolutionData || {}),
      instanceKeys: evolutionData.instance ? Object.keys(evolutionData.instance) : null,
    });

    // Extrai QR code de diferentes formatos possíveis
    let qrCodeBase64 = evolutionData.qrcode?.base64 || 
                      evolutionData.qrcode || 
                      evolutionData.instance?.qrcode?.base64 ||
                      evolutionData.instance?.qrcode ||
                      null;

    // Se o QR code é uma string, tenta extrair o base64 se estiver em um objeto
    if (qrCodeBase64 && typeof qrCodeBase64 === 'object') {
      qrCodeBase64 = qrCodeBase64.base64 || qrCodeBase64.data || null;
    }

    // Remove possíveis prefixos data:image
    if (qrCodeBase64 && typeof qrCodeBase64 === 'string') {
      qrCodeBase64 = qrCodeBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    }

    if (!qrCodeBase64 || (typeof qrCodeBase64 === 'string' && qrCodeBase64.trim().length < 100)) {
      console.error('QR Code não encontrado ou inválido na resposta da Evolution API:', {
        evolutionData,
        hasQrcode: !!evolutionData.qrcode,
        qrCodeBase64: qrCodeBase64 ? `${qrCodeBase64.substring(0, 50)}...` : null,
        qrCodeLength: qrCodeBase64?.length || 0,
        keys: Object.keys(evolutionData || {}),
      });
      return errorResponse('Erro ao gerar QR Code na Evolution API. Verifique os logs do servidor.', 500);
    }

    // Salva no banco
    const { data: savedInstance, error: dbError } = await supabaseServiceRole
      .from('whatsapp_instances')
      .insert({
        user_id: userId,
        instance_name: instanceName,
        status: 'connecting',
        qr_code: qrCodeBase64,
        hash: evolutionData.hash,
        number: fullNumber,
      })
      .select()
      .single();

    if (dbError || !savedInstance) {
      // Tenta deletar na Evolution se falhou no banco
      try {
        if (evolutionData.hash) {
          // O método deleteInstance espera apiKey (master key da Evolution API)
          const apiKey = process.env.EVOLUTION_APIKEY || process.env.NEXT_PUBLIC_EVOLUTION_APIKEY || '';
          if (apiKey) {
            await evolutionService.deleteInstance(instanceName, apiKey);
          }
        }
      } catch (deleteErr) {
        console.error('Erro ao deletar instância na Evolution após falha no banco:', deleteErr);
      }
      return errorResponse(`Erro ao salvar instância: ${dbError?.message || 'Erro desconhecido'}`);
    }

    // Garante que o QR code está no objeto retornado
    const responseData = {
      ...savedInstance,
      qr_code: savedInstance.qr_code || qrCodeBase64,
    };

    return successResponse(responseData, 'Instância criada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

