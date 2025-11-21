const EVOLUTION_BASE = process.env.EVOLUTION_BASE || process.env.NEXT_PUBLIC_EVOLUTION_BASE || '';
const EVOLUTION_APIKEY = process.env.EVOLUTION_APIKEY || process.env.NEXT_PUBLIC_EVOLUTION_APIKEY || '';

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
  private baseUrl: string;
  private masterKey: string;

  constructor() {
    this.baseUrl = EVOLUTION_BASE;
    this.masterKey = EVOLUTION_APIKEY;
  }

  /**
   * Cria uma nova instância WhatsApp
   */
  async createInstance(instanceName: string, number: string, qrcode: boolean = true): Promise<EvolutionInstance> {
    const response = await fetch(`${this.baseUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.masterKey,
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
   */
  async getConnectionState(instanceName: string, apiKey: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/instance/connectionState/${instanceName}`, {
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
   */
  async connectInstance(instanceName: string, apiKey: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/instance/connect/${instanceName}`, {
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
   */
  async deleteInstance(instanceName: string, apiKey: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/instance/delete/${instanceName}`, {
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
   */
  async fetchAllGroups(instanceName: string, apiKey: string, getParticipants: boolean = true): Promise<EvolutionGroup[]> {
    const url = `${this.baseUrl}/group/fetchAllGroups/${instanceName}?getParticipants=${getParticipants}`;
    
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
}

export const evolutionService = new EvolutionService();

