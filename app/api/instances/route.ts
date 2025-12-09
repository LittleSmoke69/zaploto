import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { rateLimitService } from '@/lib/services/rate-limit-service';
import { getUserEvolutionApi } from '@/lib/services/evolution-api-helper';

/**
 * GET /api/instances - Lista todas as instâncias do usuário
 * Agora busca de evolution_instances vinculadas via user_evolution_apis
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);

    // Busca APIs Evolution atribuídas ao usuário
    const { data: userApis, error: userApisError } = await supabaseServiceRole
      .from('user_evolution_apis')
      .select('evolution_api_id')
      .eq('user_id', userId);

    let instances: any[] = [];
    let query = supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          name,
          base_url,
          api_key
        )
      `);

    // Se o usuário tem APIs atribuídas, filtra por elas
    if (!userApisError && userApis && userApis.length > 0) {
      const apiIds = userApis.map(ua => ua.evolution_api_id);
      query = query.in('evolution_api_id', apiIds);
    }
    // Se não tem APIs atribuídas, busca todas as instâncias ativas (fallback)
    // Isso permite que instâncias criadas apareçam mesmo sem vínculo direto

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar instâncias:', error);
    } else {
      // Converte para formato compatível com o frontend
      instances = (data || []).map((inst: any) => {
        const evolutionApi = Array.isArray(inst.evolution_apis) 
          ? inst.evolution_apis[0] 
          : inst.evolution_apis;

        return {
          id: inst.id,
          instance_name: inst.instance_name,
          status: inst.status === 'ok' ? 'connected' : inst.status === 'disconnected' ? 'disconnected' : 'connecting',
          number: inst.phone_number,
          created_at: inst.created_at,
          updated_at: inst.updated_at,
          hash: evolutionApi?.api_key || null, // API key da Evolution API para compatibilidade
          qr_code: null, // QR code é temporário
          user_id: userId, // Adiciona para compatibilidade
        };
      });
    }

    // Busca limite de instâncias do usuário
    const instanceLimit = await rateLimitService.checkInstanceLimit(userId);

    // Adiciona informação de limite como propriedade não enumerável para não quebrar código existente
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

    // Busca a Evolution API do usuário (ou primeira disponível)
    const evolutionApi = await getUserEvolutionApi(userId);
    if (!evolutionApi) {
      return errorResponse(
        'Nenhuma Evolution API configurada. Entre em contato com o administrador.',
        400
      );
    }

    // Busca o ID da Evolution API no banco
    const { data: apiRecord, error: apiError } = await supabaseServiceRole
      .from('evolution_apis')
      .select('id')
      .eq('base_url', evolutionApi.baseUrl)
      .eq('api_key', evolutionApi.apiKey)
      .eq('is_active', true)
      .single();

    if (apiError || !apiRecord) {
      return errorResponse(
        'Evolution API não encontrada no banco de dados. Entre em contato com o administrador.',
        500
      );
    }

    const fullNumber = `55${phoneNumber}`;

    // Cria instância na Evolution API usando a API do usuário
    // Precisamos criar um serviço temporário com a base_url e api_key corretas
    const tempEvolutionService = {
      baseUrl: evolutionApi.baseUrl,
      masterKey: evolutionApi.apiKey,
      async createInstance(name: string, number: string, qrcode: boolean = true) {
        const response = await fetch(`${this.baseUrl}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.masterKey,
          },
          body: JSON.stringify({
            instanceName: name,
            qrcode,
            number,
            integration: 'WHATSAPP-BAILEYS',
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.message || `Erro ao criar instância: ${response.statusText}`);
        }

        return await response.json();
      },
    };

    const evolutionData = await tempEvolutionService.createInstance(instanceName, fullNumber, true);

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

    // Verifica se a instância já existe
    const { data: existingInstance } = await supabaseServiceRole
      .from('evolution_instances')
      .select('id')
      .eq('evolution_api_id', apiRecord.id)
      .eq('instance_name', instanceName)
      .single();

    if (existingInstance) {
      // Tenta deletar na Evolution se já existe no banco
      try {
        if (evolutionData.hash) {
          const deleteResponse = await fetch(`${evolutionApi.baseUrl}/instance/delete/${instanceName}`, {
            method: 'DELETE',
            headers: {
              apikey: evolutionApi.apiKey,
            },
          });
          if (!deleteResponse.ok) {
            console.warn('Não foi possível deletar instância duplicada na Evolution');
          }
        }
      } catch (deleteErr) {
        console.error('Erro ao deletar instância duplicada na Evolution:', deleteErr);
      }
      return errorResponse('Instância com este nome já existe para esta Evolution API', 400);
    }

    // Salva na nova tabela evolution_instances
    const { data: savedInstance, error: dbError } = await supabaseServiceRole
      .from('evolution_instances')
      .insert({
        evolution_api_id: apiRecord.id,
        instance_name: instanceName,
        phone_number: fullNumber,
        is_active: true,
        status: 'ok', // Será atualizado quando conectar
        daily_limit: 100, // Padrão
        sent_today: 0,
        error_today: 0,
        rate_limit_count_today: 0,
      })
      .select()
      .single();

    if (dbError || !savedInstance) {
      // Tenta deletar na Evolution se falhou no banco
      try {
        if (evolutionData.hash) {
          // Cria função temporária para deletar
          const deleteResponse = await fetch(`${evolutionApi.baseUrl}/instance/delete/${instanceName}`, {
            method: 'DELETE',
            headers: {
              apikey: evolutionApi.apiKey,
            },
          });
          if (!deleteResponse.ok) {
            console.warn('Não foi possível deletar instância na Evolution após falha no banco');
          }
        }
      } catch (deleteErr) {
        console.error('Erro ao deletar instância na Evolution após falha no banco:', deleteErr);
      }
      return errorResponse(`Erro ao salvar instância: ${dbError?.message || 'Erro desconhecido'}`);
    }

    // Retorna dados no formato compatível com o frontend (inclui QR code)
    const responseData = {
      id: savedInstance.id,
      instance_name: savedInstance.instance_name,
      status: 'connecting', // Status inicial para compatibilidade
      qr_code: qrCodeBase64,
      hash: evolutionData.hash,
      number: savedInstance.phone_number,
      created_at: savedInstance.created_at,
      updated_at: savedInstance.updated_at,
    };

    return successResponse(responseData, 'Instância criada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

