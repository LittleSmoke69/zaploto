export interface EvolutionInstance {
  instanceName: string;
  number?: string;
  qrcode?: {
    base64: string;
  };
  hash?: string;
  state?: string;
}

export interface EvolutionGroup {
  id: string;
  subject: string;
  pictureUrl?: string;
  size?: number;
}

export class EvolutionService {
  /**
   * Cria uma nova instância WhatsApp
   * @param baseUrl URL base da Evolution API (obtida do banco de dados)
   * @param apiKey Chave da API (obtida do banco de dados)
   */
  async createInstance(
    instanceName: string,
    number: string,
    baseUrl: string,
    apiKey: string,
    qrcode: boolean = true
  ): Promise<EvolutionInstance> {
    const response = await fetch(`${baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        instanceName,
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
  }

  /**
   * Verifica o status de conexão de uma instância
   * @param baseUrl URL base da Evolution API (obtida do banco de dados)
   */
  async getConnectionState(instanceName: string, apiKey: string, baseUrl: string): Promise<any> {
    const response = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Erro ao verificar status: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Conecta/reconecta uma instância
   * @param baseUrl URL base da Evolution API (obtida do banco de dados)
   */
  async connectInstance(instanceName: string, apiKey: string, baseUrl: string): Promise<any> {
    const response = await fetch(`${baseUrl}/instance/connect/${instanceName}`, {
      method: 'GET',
      headers: {
        apikey: apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      throw new Error(`Erro ao conectar: ${response.status} ${error}`);
    }

    return await response.json().catch(() => ({}));
  }

  /**
   * Deleta uma instância
   * @param baseUrl URL base da Evolution API (obtida do banco de dados)
   */
  async deleteInstance(instanceName: string, apiKey: string, baseUrl: string): Promise<void> {
    const response = await fetch(`${baseUrl}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: {
        apikey: apiKey,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => '');
      throw new Error(`Erro ao deletar: ${response.status} ${error}`);
    }
  }

  /**
   * Busca todos os grupos de uma instância
   * @param baseUrl URL base da Evolution API (obtida do banco de dados)
   */
  async fetchAllGroups(instanceName: string, apiKey: string, baseUrl: string, getParticipants: boolean = true): Promise<EvolutionGroup[]> {
    const url = `${baseUrl}/group/fetchAllGroups/${instanceName}?getParticipants=${getParticipants}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: apiKey,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Erro ao buscar grupos: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Normaliza diferentes formatos de resposta
    if (Array.isArray(data)) {
      return data;
    } else if (Array.isArray(data?.groups)) {
      return data.groups;
    } else if (data?.id && data?.subject) {
      return [data];
    }
    
    return [];
  }

  /**
   * Extrai o estado de conexão de uma resposta
   */
  extractState(data: any): 'connected' | 'connecting' | 'disconnected' | 'unknown' {
    const raw = (data?.instance?.state ?? data?.state ?? data?.connection?.state ?? data?.status ?? '')
      .toString()
      .toLowerCase();

    if (!raw) return 'unknown';
    if (raw === 'open') return 'connected';
    if (['connecting', 'pairing', 'qrcode', 'qr', 'waiting_qr'].includes(raw)) return 'connecting';
    if (['close', 'closed', 'disconnected', 'logout'].includes(raw)) return 'disconnected';
    return 'unknown';
  }

  /**
   * Extrai o QR code de uma resposta
   */
  extractQr(data: any): string | null {
    return data?.qrcode?.base64 || data?.qrcode || data?.instance?.qrcode?.base64 || data?.instance?.qrcode || null;
  }

  /**
   * Adiciona participantes a um grupo
   * Retorna resultado detalhado com tratamento de erros específicos
   * groupId é passado como parâmetro na URL
   * @param baseUrl URL base da Evolution API (obtida do banco de dados)
   */
  async addParticipantsToGroup(
    instanceName: string,
    apiKey: string,
    groupId: string,
    participants: string[],
    baseUrl: string
  ): Promise<{
    success: boolean;
    error?: string;
    errorType?: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown';
    added?: number;
    httpStatus?: number;
    responseData?: any;
  }> {
    const startTime = Date.now();
    // Passa groupJid como parâmetro na URL (a API Evolution espera 'groupJid', não 'groupId')
    const url = `${baseUrl}/group/updateParticipant/${instanceName}?groupJid=${encodeURIComponent(groupId)}`;
    const payload = {
      action: 'add',
      participants: participants,
    };

    console.log(`📤 [Evolution API] Enviando requisição:`, {
      url,
      instanceName,
      groupId,
      groupJidInUrl: true, // Usa groupJid conforme esperado pela API
      participantsCount: participants.length,
      participants: participants,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify(payload),
      });

      const duration = Date.now() - startTime;
      const responseText = await response.text();
      let responseData: any = {};
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Se não for JSON, mantém o texto
        responseData = { message: responseText, raw: responseText };
      }

      console.log(`📥 [Evolution API] Resposta recebida:`, {
        instanceName,
        groupId,
        httpStatus: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        responseSize: responseText.length,
        responseData,
        timestamp: new Date().toISOString(),
      });

      // Tratamento específico de erros conforme documentação
      if (response.status === 403) {
        // 403: Request OK mas lead não foi adicionado ao grupo
        console.warn(`⚠️ [Evolution API] Status 403 - Request OK mas lead não adicionado:`, {
          instanceName,
          groupId,
          participants,
          responseData,
        });
        return {
          success: false,
          error: 'Lead não foi adicionado ao grupo (403)',
          errorType: 'rate_limit',
          added: 0,
          httpStatus: 403,
          responseData,
        };
      }

      if (response.status === 400) {
        // 400: Bad request - pode ser número inválido ou erro na requisição
        const errorMsg = responseData?.message || responseText || 'Bad request';
        
        // Verifica se é Connection Closed (número banido/desconectado)
        const isConnectionClosed = 
          errorMsg.toLowerCase().includes('connection closed') || 
          responseText.toLowerCase().includes('connection closed') ||
          errorMsg.toLowerCase().includes('disconnected') ||
          responseText.toLowerCase().includes('disconnected');

        if (isConnectionClosed) {
          console.error(`❌ [Evolution API] Connection Closed - Número banido/desconectado:`, {
            instanceName,
            groupId,
            participants,
            errorMsg,
            responseData,
          });
          return {
            success: false,
            error: 'Número desconectado ou banido (Connection Closed)',
            errorType: 'connection_closed',
            added: 0,
            httpStatus: 400,
            responseData,
          };
        }

        console.error(`❌ [Evolution API] Bad Request (400):`, {
          instanceName,
          groupId,
          participants,
          errorMsg,
          responseData,
        });
        return {
          success: false,
          error: errorMsg,
          errorType: 'bad_request',
          added: 0,
          httpStatus: 400,
          responseData,
        };
      }

      if (!response.ok) {
        console.error(`❌ [Evolution API] Erro HTTP ${response.status}:`, {
          instanceName,
          groupId,
          participants,
          httpStatus: response.status,
          statusText: response.statusText,
          responseData,
        });
        return {
          success: false,
          error: responseData?.message || `Erro HTTP ${response.status}`,
          errorType: 'unknown',
          added: 0,
          httpStatus: response.status,
          responseData,
        };
      }

      // Sucesso
      console.log(`✅ [Evolution API] Lead adicionado com sucesso:`, {
        instanceName,
        groupId,
        participants,
        added: participants.length,
        responseData,
      });
      return {
        success: true,
        added: participants.length,
        httpStatus: response.status,
        responseData,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorDetails = {
        instanceName,
        groupId,
        participants,
        duration: `${duration}ms`,
        errorName: error?.name,
        errorMessage: error?.message,
        errorStack: error?.stack,
        timestamp: new Date().toISOString(),
      };

      // Erro de conexão (Connection Closed)
      const isConnectionError = 
        error?.message?.toLowerCase().includes('connection closed') ||
        error?.message?.toLowerCase().includes('econnreset') ||
        error?.message?.toLowerCase().includes('socket hang up') ||
        error?.message?.toLowerCase().includes('econnrefused') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ECONNREFUSED';

      if (isConnectionError) {
        console.error(`❌ [Evolution API] Erro de conexão (Connection Closed):`, errorDetails);
        return {
          success: false,
          error: 'Conexão fechada - número pode estar banido ou desconectado',
          errorType: 'connection_closed',
          added: 0,
          httpStatus: 0,
          responseData: { error: error?.message, code: error?.code },
        };
      }

      console.error(`❌ [Evolution API] Erro inesperado:`, errorDetails);
      return {
        success: false,
        error: error?.message || 'Erro desconhecido ao adicionar participantes',
        errorType: 'unknown',
        added: 0,
        httpStatus: 0,
        responseData: { error: error?.message, name: error?.name, code: error?.code },
      };
    }
  }
}

export const evolutionService = new EvolutionService();

