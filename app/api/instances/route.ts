import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { rateLimitService } from '@/lib/services/rate-limit-service';
import { getUserEvolutionApi } from '@/lib/services/evolution-api-helper';
import { evolutionApiSelector } from '@/lib/services/evolution-api-selector';

/**
 * GET /api/instances - Lista instâncias do usuário
 * - Admin: vê todas as instâncias
 * - Usuário normal: vê apenas suas instâncias
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);

    // Verifica se o usuário é admin
    const { data: profile } = await supabaseServiceRole
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();

    const isAdmin = profile?.status === 'admin';

    let instances: any[] = [];
    let query = supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          name,
          base_url,
          api_key_global
        )
      `);

    // Se não for admin, filtra apenas instâncias do usuário
    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }
    // Se for admin, mostra todas (sem filtro adicional)

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar instâncias:', error);
    } else {
      // Filtra para mostrar instâncias ativas OU conectadas (status = 'ok')
      // Isso garante que instâncias conectadas apareçam mesmo se is_active for false temporariamente
      const filteredData = (data || []).filter((inst: any) => 
        inst.is_active === true || inst.status === 'ok'
      );
      
      // Converte para formato compatível com o frontend
      instances = filteredData.map((inst: any) => {
        const evolutionApi = Array.isArray(inst.evolution_apis) 
          ? inst.evolution_apis[0] 
          : inst.evolution_apis;

        // Mapeia status do banco para o frontend
        // 'ok' no banco = 'connected' no frontend (conectado)
        // 'disconnected' no banco = pode ser 'disconnected' ou 'connecting' (aguardando QR)
        // Para saber se está 'connecting', precisamos verificar se tem QR code pendente
        let frontendStatus: string;
        if (inst.status === 'ok') {
          frontendStatus = 'connected';
        } else if (inst.status === 'disconnected') {
          // Se está desconectado, pode estar aguardando QR code
          // Por padrão, assumimos 'connecting' se foi criado recentemente
          frontendStatus = 'connecting';
        } else {
          frontendStatus = inst.status;
        }

        return {
          id: inst.id,
          instance_name: inst.instance_name,
          status: frontendStatus,
          number: inst.phone_number,
          created_at: inst.created_at,
          updated_at: inst.updated_at,
          hash: evolutionApi?.api_key_global || null, // API key global da Evolution API para compatibilidade
          qr_code: null, // QR code é temporário
          user_id: userId, // Adiciona para compatibilidade
        };
      });
    }

    // Log para debug (remover em produção se necessário)
    console.log(`[API Instances] Retornando ${instances.length} instância(s) para usuário ${userId}`);
    if (instances.length > 0) {
      const connectedCount = instances.filter((i: any) => i.status === 'connected').length;
      console.log(`[API Instances] ${connectedCount} instância(s) conectada(s)`);
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

    // SIMPLIFICADO: Sempre usa balanceamento automático para distribuir carga
    // A atribuição de usuário é opcional e não é necessária
    console.log(`🔄 [INSTÂNCIA] Selecionando Evolution API usando balanceamento automático...`);
    
    const selectedApi = await evolutionApiSelector.selectBestEvolutionApiForNewInstance();
    
    if (!selectedApi) {
      console.error('❌ [INSTÂNCIA] Nenhuma Evolution API ativa encontrada');
      return errorResponse(
        'Nenhuma Evolution API ativa configurada. Configure pelo menos uma Evolution API no painel admin.',
        400
      );
    }
    
    console.log(`✅ [INSTÂNCIA] Evolution API selecionada: ${selectedApi.name} (${selectedApi.base_url})`);

    // VALIDAÇÃO CRÍTICA: Verifica se a API key está presente e válida
    if (!selectedApi.api_key || typeof selectedApi.api_key !== 'string' || selectedApi.api_key.trim().length === 0) {
      console.error(`❌ [INSTÂNCIA] API key inválida ou vazia para Evolution API ${selectedApi.name}`);
      return errorResponse(
        `API key não configurada para a Evolution API "${selectedApi.name}". Configure a API key no painel admin.`,
        400
      );
    }

    // Log de validação (sem mostrar a key completa por segurança)
    const apiKeyPreview = selectedApi.api_key.length > 10 
      ? `${selectedApi.api_key.substring(0, 10)}...${selectedApi.api_key.substring(selectedApi.api_key.length - 4)}`
      : '***';
    console.log(`🔑 [INSTÂNCIA] API key validada (preview: ${apiKeyPreview}, length: ${selectedApi.api_key.length})`);

    const apiRecord = { id: selectedApi.id };

    const fullNumber = `55${phoneNumber}`;

    // Normaliza a URL base (remove barras duplas e finais)
    const normalizeBaseUrl = (baseUrl: string): string => {
      if (!baseUrl) return baseUrl;
      let normalized = baseUrl.trim();
      normalized = normalized.replace(/\/+$/, ''); // Remove barras finais
      normalized = normalized.replace(/([^:]\/)\/+/g, '$1'); // Remove barras duplas (preservando ://)
      return normalized;
    };

    const normalizedBaseUrl = normalizeBaseUrl(selectedApi.base_url);
    console.log(`🔗 [INSTÂNCIA] Base URL original: ${selectedApi.base_url}`);
    console.log(`🔗 [INSTÂNCIA] Base URL normalizada: ${normalizedBaseUrl}`);

    // Cria instância na Evolution API selecionada pelo balanceador
    const tempEvolutionService = {
      baseUrl: normalizedBaseUrl,
      masterKey: selectedApi.api_key.trim(), // Remove espaços e garante string limpa
      apiKeyPreview: apiKeyPreview, // Preview para logs
      apiName: selectedApi.name, // Nome da API para logs de erro
      async createInstance(name: string, number: string, qrcode: boolean = true) {
        try {
          const requestUrl = `${this.baseUrl}/instance/create`;
          const requestHeaders = {
            'Content-Type': 'application/json',
            apikey: this.masterKey,
          };
          const requestBody = {
            instanceName: name,
            qrcode,
            number,
            integration: 'WHATSAPP-BAILEYS',
          };

          console.log(`🔄 [INSTÂNCIA] Fazendo request para Evolution API: ${requestUrl}`);
          console.log(`📤 [INSTÂNCIA] Headers enviados:`, {
            'Content-Type': requestHeaders['Content-Type'],
            'apikey': this.apiKeyPreview, // Mostra apenas preview por segurança
          });
          console.log(`📤 [INSTÂNCIA] Body enviado:`, requestBody);

          const response = await fetch(requestUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            let errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`;
            let errorDetails: any = {};
            
            try {
              const errorData = await response.json();
              errorMessage = errorData.message || errorData.error || errorMessage;
              errorDetails = errorData;
            } catch {
              // Se não conseguir parsear JSON, tenta ler como texto
              try {
                const errorText = await response.text();
                errorMessage = errorText || errorMessage;
                errorDetails = { raw: errorText };
              } catch {
                // Mantém a mensagem padrão
              }
            }

            // Log detalhado do erro
            console.error(`❌ [INSTÂNCIA] Evolution API retornou erro: ${errorMessage}`);
            console.error(`❌ [INSTÂNCIA] Detalhes do erro:`, {
              status: response.status,
              statusText: response.statusText,
              url: requestUrl,
              apiKeyPreview: this.apiKeyPreview,
              apiKeyLength: this.masterKey.length,
              errorDetails,
            });

            // Mensagem mais amigável para 403 Forbidden
            if (response.status === 403) {
              throw new Error(
                `Acesso negado pela Evolution API (403 Forbidden). Verifique se a API key está correta e tem permissões para criar instâncias. ` +
                `API: ${this.apiName}, URL: ${this.baseUrl}`
              );
            }

            throw new Error(errorMessage);
          }

          const data = await response.json();
          console.log(`✅ [INSTÂNCIA] Evolution API retornou sucesso`);
          return data;
        } catch (fetchError: any) {
          console.error('❌ [INSTÂNCIA] Erro no fetch para Evolution API:', fetchError);
          throw new Error(fetchError?.message || 'Erro ao conectar com Evolution API');
        }
      },
    };

    console.log(`📊 Criando instância ${instanceName} na Evolution API: ${selectedApi.name} (${selectedApi.base_url})`);

    let evolutionData;
    try {
      evolutionData = await tempEvolutionService.createInstance(instanceName, fullNumber, true);
    } catch (createError: any) {
      console.error('❌ [INSTÂNCIA] Erro ao criar instância na Evolution API:', createError);
      const errorMsg = createError?.message || 'Erro ao criar instância na Evolution API';
      return errorResponse(`Erro ao criar instância: ${errorMsg}`, 500);
    }

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
          const deleteUrl = `${normalizedBaseUrl}/instance/delete/${instanceName}`;
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
             headers: {
               apikey: selectedApi.api_key.trim(), // api_key contém o valor de api_key_global
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

    // CRÍTICO: Captura o hash da instância retornado pela Evolution API
    // O hash é uma string direta, não um objeto
    const instanceHash = evolutionData.hash || null;
    
    if (!instanceHash) {
      console.warn(`⚠️ [INSTÂNCIA] Hash não encontrado na resposta da Evolution API. Resposta:`, JSON.stringify(evolutionData).substring(0, 500));
    } else {
      console.log(`✅ [INSTÂNCIA] Hash da instância capturado: ${instanceHash}`);
    }

    // Salva na nova tabela evolution_instances com user_id
    // Status inicial deve ser 'disconnected' ou 'connecting' - NÃO 'ok' (que significa conectado)
    const { data: savedInstance, error: dbError } = await supabaseServiceRole
      .from('evolution_instances')
      .insert({
        evolution_api_id: apiRecord.id,
        instance_name: instanceName,
        phone_number: fullNumber,
        is_active: true,
        status: 'disconnected', // Status inicial: desconectado aguardando QR code
        daily_limit: 100, // Padrão
        sent_today: 0,
        error_today: 0,
        rate_limit_count_today: 0,
        user_id: userId, // Vincula a instância ao usuário que criou
        apikey: instanceHash, // CRÍTICO: Salva o hash da instância (que é usado como apikey nos requests)
      })
      .select()
      .single();

    if (dbError || !savedInstance) {
      // Tenta deletar na Evolution se falhou no banco
      try {
        if (evolutionData.hash) {
          // Cria função temporária para deletar
          const deleteUrl = `${normalizedBaseUrl}/instance/delete/${instanceName}`;
          const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
             headers: {
               apikey: selectedApi.api_key.trim(), // api_key contém o valor de api_key_global
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
    // Status deve ser 'connecting' pois ainda não foi escaneado o QR code
    const responseData = {
      id: savedInstance.id,
      instance_name: savedInstance.instance_name,
      status: 'connecting', // Status inicial: aguardando QR code ser escaneado
      qr_code: qrCodeBase64,
      hash: evolutionData.hash,
      number: savedInstance.phone_number,
      created_at: savedInstance.created_at,
      updated_at: savedInstance.updated_at,
    };

    return successResponse(responseData, 'Instância criada com sucesso');
  } catch (err: any) {
    console.error('❌ [INSTÂNCIA] Erro ao criar instância:', err);
    console.error('❌ [INSTÂNCIA] Stack trace:', err?.stack);
    console.error('❌ [INSTÂNCIA] Erro detalhado:', {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      cause: err?.cause,
    });
    
    // Garante que sempre retorna JSON válido
    const errorMessage = err?.message || err?.toString() || 'Erro desconhecido ao criar instância';
    return errorResponse(errorMessage, 500);
  }
}

