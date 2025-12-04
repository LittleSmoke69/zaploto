import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { rateLimitService } from '@/lib/services/rate-limit-service';

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

    // Busca limite de instâncias do usuário
    const instanceLimit = await rateLimitService.checkInstanceLimit(userId);

    // Retorna instâncias no formato antigo para compatibilidade
    // Adiciona informação de limite como propriedade não enumerável para não quebrar código existente
    const instances = data || [];
    Object.defineProperty(instances, '__limit', {
      value: {
        current: instanceLimit.current,
        max: instanceLimit.max,
        allowed: instanceLimit.allowed,
      },
      enumerable: false,
      writable: false,
    });

    return successResponse(instances, 'Instâncias carregadas com sucesso');
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

    // Verifica limite de instâncias antes de criar
    const instanceLimit = await rateLimitService.checkInstanceLimit(userId);
    if (!instanceLimit.allowed) {
      return errorResponse(
        `Limite de instâncias atingido. Você possui ${instanceLimit.current} de ${instanceLimit.max} instâncias permitidas.`,
        429
      );
    }

    const fullNumber = `55${phoneNumber}`;

    // Cria instância na Evolution API
    const evolutionData = await evolutionService.createInstance(instanceName, fullNumber, true);

    console.log('Evolution API Response:', {
      hasQrcode: !!evolutionData.qrcode,
      qrcodeType: typeof evolutionData.qrcode,
      keys: Object.keys(evolutionData || {}),
    });

    // Extrai QR code de diferentes formatos possíveis
    let qrCodeBase64: string | null = null;
    
    // Tenta extrair do formato padrão
    if (evolutionData.qrcode) {
      if (typeof evolutionData.qrcode === 'string') {
        qrCodeBase64 = evolutionData.qrcode;
      } else if (evolutionData.qrcode.base64) {
        qrCodeBase64 = evolutionData.qrcode.base64;
      }
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

