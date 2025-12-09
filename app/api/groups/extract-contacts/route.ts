import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * POST /api/groups/extract-contacts - Extrai contatos de um grupo específico
 */
export async function POST(req: NextRequest) {
  console.log('[extract-contacts] Rota chamada');
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { instanceName, groupId } = body;
    
    console.log('[extract-contacts] Parâmetros:', { instanceName, groupId, userId });

    if (!instanceName || !groupId) {
      return errorResponse('instanceName e groupId são obrigatórios', 400);
    }

    // Verifica se o usuário tem acesso à instância
    const { checkInstanceAccess } = await import('@/lib/utils/instance-access');
    const hasAccess = await checkInstanceAccess(userId, instanceName);
    if (!hasAccess) {
      return errorResponse('Acesso negado. Você não tem permissão para acessar esta instância.', 403);
    }

    // Busca a instância e sua Evolution API
    const { data: instance, error: instanceError } = await supabaseServiceRole
      .from('evolution_instances')
      .select(`
        *,
        evolution_apis!inner (
          id,
          base_url,
          api_key,
          is_active
        )
      `)
      .eq('instance_name', instanceName)
      .eq('is_active', true)
      .eq('evolution_apis.is_active', true)
      .single();

    if (instanceError || !instance) {
      return errorResponse('Instância não encontrada', 404);
    }

    const evolutionApi = Array.isArray(instance.evolution_apis) 
      ? instance.evolution_apis[0] 
      : instance.evolution_apis;

    if (!evolutionApi?.api_key) {
      return errorResponse('Instância sem API key configurada', 404);
    }

    // Busca grupos com participantes
    const url = `${evolutionApi.base_url}/group/fetchAllGroups/${instanceName}?getParticipants=true`;
    
    // Usa timeout similar ao endpoint de fetch
    const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
      } finally {
        clearTimeout(id);
      }
    };

    const PER_TRY_TIMEOUT = 180_000; // 3 minutos
    const response = await fetchWithTimeout(
      url,
      { method: 'GET', headers: { apikey: evolutionApi.api_key } },
      PER_TRY_TIMEOUT
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`Erro ao buscar grupos: ${response.status} ${response.statusText}`, errorText);
      return errorResponse(`Erro ao buscar grupos: ${response.statusText} (${response.status})`, response.status);
    }

    const groupsData = await response.json().catch(() => {
      console.error('Erro ao parsear resposta JSON');
      return [];
    });
    
    let groupsList: any[] = [];
    
    if (Array.isArray(groupsData)) {
      groupsList = groupsData;
    } else if (Array.isArray(groupsData?.groups)) {
      groupsList = groupsData.groups;
    } else if (groupsData?.id && groupsData?.subject) {
      groupsList = [groupsData];
    }

    if (groupsList.length === 0) {
      return errorResponse('Nenhum grupo encontrado na resposta da API', 404);
    }

    // Encontra o grupo específico
    const targetGroup = groupsList.find(g => g.id === groupId);
    
    if (!targetGroup) {
      return errorResponse(`Grupo ${groupId} não encontrado na lista de ${groupsList.length} grupo(s)`, 404);
    }

    // Extrai participantes
    let participants: any[] = [];
    
    if (Array.isArray(targetGroup.participants)) {
      participants = targetGroup.participants;
    } else if (targetGroup.participants && typeof targetGroup.participants === 'object') {
      participants = Object.values(targetGroup.participants);
    }

    // Função para normalizar telefone: adiciona 55 se não tiver, mantém se já tiver
    const normalizePhoneNumber = (phone: string): string => {
      // Remove caracteres não numéricos
      const cleaned = phone.replace(/\D/g, '');
      
      // Se já começa com 55, retorna como está
      if (cleaned.startsWith('55')) {
        return cleaned;
      }
      
      // Se não começa com 55, adiciona
      return `55${cleaned}`;
    };

    // Formata os contatos
    const formattedContacts = participants.map((p: any) => {
      // Trata o phoneNumber para extrair apenas o telefone
      // Exemplo: "553175097323@s.whatsapp.net" -> "553175097323"
      let telefone = '';
      
      // Prioriza phoneNumber, depois id
      const phoneSource = p.phoneNumber || p.id || '';
      
      if (phoneSource) {
        // Remove sufixos do WhatsApp
        telefone = phoneSource
          .replace('@s.whatsapp.net', '')
          .replace('@c.us', '')
          .replace('@g.us', '')
          .replace('@lid', '')
          .trim();
        
        // Normaliza: adiciona 55 se não tiver, mantém se já tiver
        telefone = normalizePhoneNumber(telefone);
      }

      return {
        id: p.id || p.phoneNumber || '',
        name: p.name || p.pushName || p.notify || '',
        telefone: telefone,
        admin: p.admin || null,
      };
    }).filter(c => c.telefone && c.telefone.length > 0);

    return successResponse(
      formattedContacts,
      `${formattedContacts.length} contato(s) extraído(s) do grupo`
    );
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

