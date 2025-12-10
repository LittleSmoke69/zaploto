import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { rateLimitService } from '@/lib/services/rate-limit-service';
import { evolutionBalancer } from '@/lib/services/evolution-balancer';

export const runtime = 'nodejs';
export const maxDuration = 900; // 15 minutos - máximo suportado pela Netlify para funções serverless

interface ProcessCampaignRequest {
  campaignId: string;
  jobs: Array<{ contactId: string; phone: string }>;
}

/**
 * POST /api/campaigns/process - Processa uma campanha adicionando leads aos grupos
 * Processa tudo sequencialmente na mesma requisição HTTP para evitar que a Netlify mate o processo
 */
export async function POST(req: NextRequest) {
  try {
    // Autentica primeiro
    let userId: string;
    try {
      const auth = await requireAuth(req);
      userId = auth.userId;
    } catch (authError: any) {
      console.error('Erro de autenticação:', authError);
      return errorResponse(authError.message || 'Não autenticado', 401);
    }
    
    // Lê o body
    const body: ProcessCampaignRequest = await req.json();
    const { campaignId, jobs } = body;

    if (!campaignId || !Array.isArray(jobs) || jobs.length === 0) {
      return errorResponse('campaignId e jobs são obrigatórios', 400);
    }

    // Busca dados da campanha
    const { data: campaign, error: campaignError } = await supabaseServiceRole
      .from('campaigns')
      .select('*')
      .eq('user_id', userId)
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return errorResponse('Campanha não encontrada', 404);
    }

    // Verifica rate limit diário
    console.log(`🔍 [CAMPANHA ${campaignId}] Verificando rate limits...`);
    
    const rateLimit = await rateLimitService.checkDailyLimit(userId);
    console.log(`📊 [CAMPANHA ${campaignId}] Rate limit diário: ${rateLimit.remaining}/${rateLimit.limit} leads restantes`);
    
    if (!rateLimit.allowed) {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Limite diário atingido: ${rateLimit.limit} leads`);
      return errorResponse(
        `Limite diário atingido. Você pode adicionar até ${rateLimit.limit} leads por dia. Reset em ${new Date(rateLimit.resetAt).toLocaleTimeString()}`,
        429
      );
    }

    // Verifica se há leads suficientes no limite
    if (jobs.length > rateLimit.remaining) {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Leads insuficientes no limite: ${jobs.length} solicitados, ${rateLimit.remaining} disponíveis`);
      return errorResponse(
        `Você pode adicionar apenas ${rateLimit.remaining} leads hoje. Tente novamente amanhã ou reduza a quantidade.`,
        429
      );
    }

    // Verifica limite de instâncias
    const instanceLimit = await rateLimitService.checkInstanceLimit(userId);
    console.log(`📊 [CAMPANHA ${campaignId}] Limite de instâncias: ${instanceLimit.current}/${instanceLimit.max} instâncias ativas`);
    
    if (!instanceLimit.allowed) {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Limite de instâncias atingido: ${instanceLimit.max} instâncias`);
      return errorResponse(
        `Limite de instâncias atingido. Máximo: ${instanceLimit.max} instâncias ativas no sistema.`,
        429
      );
    }

    // Registra o started_at
    await supabaseServiceRole
      .from('campaigns')
      .update({
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    console.log(`🚀 [CAMPANHA ${campaignId}] Iniciando processamento sequencial de ${jobs.length} jobs...`);

    // Processa a campanha sequencialmente (tudo na mesma requisição HTTP)
    const result = await processCampaignQueue(campaignId, campaign, jobs, userId);

    return successResponse(result, 'Campanha processada com sucesso');
  } catch (err: any) {
    console.error('❌ Erro no processamento da campanha:', err);
    return serverErrorResponse(err);
  }
}

/**
 * Processa fila de jobs sequencialmente
 * Cada job: request → delay → próximo request
 */
async function processCampaignQueue(
  campaignId: string,
  campaign: any,
  jobs: Array<{ contactId: string; phone: string }>,
  userId: string
) {
  // Extrai informações necessárias
  const strategy = campaign.strategy || {};
  const groupId = campaign.group_id;
  const delayConfig = strategy.delayConfig || {};
  const preferUserBinding = strategy.preferUserBinding === true;

  if (!groupId) {
    throw new Error('Campanha sem group_id');
  }

  // Função auxiliar para normalizar telefone
  const normalizePhoneNumber = (phone: string): string => {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('5555')) {
      cleaned = cleaned.substring(2);
    }
    if (cleaned.startsWith('55') && !cleaned.startsWith('5555')) {
      return cleaned;
    }
    return `55${cleaned}`;
  };

  // Função para calcular delay
  const getDelay = (): number => {
    if (delayConfig.delayMode === 'random') {
      const min = Math.max(1, Number(delayConfig.randomMinSeconds) || 1);
      const max = Math.max(1, Number(delayConfig.randomMaxSeconds) || 1);
      const seconds = Math.floor(Math.random() * (max - min + 1)) + min;
      return seconds * 1000;
    } else {
      const value = Number(delayConfig.delayValue) || 0;
      const unit = delayConfig.delayUnit === 'minutes' ? 60 : 1;
      return Math.max(1000, value * unit * 1000);
    }
  };

  // Contadores
  let processed = 0;
  let failed = 0;
  let firstRequestDone = false;

  // Processa cada job sequencialmente
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobNumber = i + 1;
    const normalizedPhone = normalizePhoneNumber(job.phone);

    // CRÍTICO: Verifica se a campanha foi excluída antes de processar cada job
    const { data: campaignCheck, error: checkError } = await supabaseServiceRole
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .single();
    
    // Se a campanha foi excluída ou não existe mais, para o processamento imediatamente
    if (checkError || !campaignCheck) {
      console.log(`🛑 [CAMPANHA ${campaignId}] Campanha foi excluída. Parando processamento no job ${jobNumber}/${jobs.length}`);
      break;
    }
    
    // Se a campanha foi finalizada, para o processamento
    if (campaignCheck.status === 'failed' || campaignCheck.status === 'completed') {
      console.log(`🛑 [CAMPANHA ${campaignId}] Campanha foi finalizada (status: ${campaignCheck.status}). Parando processamento.`);
      break;
    }
    
    // Se a campanha está pausada, aguarda até ser retomada ou excluída
    if (campaignCheck.status === 'paused') {
      console.log(`⏸️ [CAMPANHA ${campaignId}] Campanha pausada. Aguardando retomada...`);
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Verifica a cada 2 segundos
        
        const { data: statusCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('id, status')
          .eq('id', campaignId)
          .single();
        
        // Se foi excluída, para o processamento
        if (!statusCheck) {
          console.log(`🛑 [CAMPANHA ${campaignId}] Campanha foi excluída durante pausa. Parando processamento.`);
          break;
        }
        
        // Se foi finalizada, para o processamento
        if (statusCheck.status === 'failed' || statusCheck.status === 'completed') {
          console.log(`🛑 [CAMPANHA ${campaignId}] Campanha foi finalizada durante pausa. Parando processamento.`);
          break;
        }
        
        // Se foi retomada, continua o processamento
        if (statusCheck.status === 'running') {
          console.log(`▶️ [CAMPANHA ${campaignId}] Campanha retomada. Continuando processamento.`);
          break;
        }
      }
      
      // Verifica novamente se deve continuar após a pausa
      const { data: finalCheck } = await supabaseServiceRole
        .from('campaigns')
        .select('id, status')
        .eq('id', campaignId)
        .single();
      
      if (!finalCheck || finalCheck.status === 'failed' || finalCheck.status === 'completed') {
        console.log(`🛑 [CAMPANHA ${campaignId}] Campanha não pode continuar após pausa. Parando processamento.`);
        break;
      }
    }

    console.log(`📞 [CAMPANHA ${campaignId}] Job ${jobNumber}/${jobs.length}: Processando ${normalizedPhone}`);

    try {
      // Faz request DIRETO para Evolution API
      const instance = await evolutionBalancer.pickBestEvolutionInstance({
        userId,
        preferUserBinding,
      });
      
      if (!instance || !instance.evolution_api) {
        throw new Error('Nenhuma instância disponível');
      }
      
      console.log(`🔍 [CAMPANHA ${campaignId}] Job ${jobNumber}: Instância selecionada:`, {
        instanceId: instance.id,
        instanceName: instance.instance_name,
        evolutionApiId: instance.evolution_api_id,
        evolutionApiBaseUrl: instance.evolution_api.base_url,
      });
      
      // Busca apikey da instância da tabela evolution_instances
      const { data: instanceData, error: instanceDataError } = await supabaseServiceRole
        .from('evolution_instances')
        .select('apikey, instance_name')
        .eq('id', instance.id)
        .single();
      
      if (instanceDataError) {
        console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Erro ao buscar apikey da instância:`, instanceDataError);
        throw new Error(`Erro ao buscar apikey: ${instanceDataError.message}`);
      }
      
      const instanceApikey = instanceData?.apikey;
      
      if (!instanceApikey) {
        console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Instância sem apikey configurada na tabela evolution_instances`);
        throw new Error('Instância sem apikey configurada');
      }
      
      // Log da apikey (mascarada por segurança - mostra apenas primeiros e últimos caracteres)
      const maskedApikey = instanceApikey.length > 10 
        ? `${instanceApikey.substring(0, 6)}...${instanceApikey.substring(instanceApikey.length - 4)}`
        : '***';
      
      console.log(`🔑 [CAMPANHA ${campaignId}] Job ${jobNumber}: Apikey obtida da tabela evolution_instances:`, {
        instanceId: instance.id,
        instanceName: instanceData.instance_name,
        apikeyLength: instanceApikey.length,
        apikeyMasked: maskedApikey,
        source: 'evolution_instances.apikey',
      });
      
      // Faz request DIRETO para Evolution API
      const normalizedBaseUrl = instance.evolution_api.base_url.replace(/\/+$/, '').replace(/([^:]\/)\/+/g, '$1');
      const url = `${normalizedBaseUrl}/group/updateParticipant/${instance.instance_name}?groupJid=${encodeURIComponent(groupId)}`;
      const finalUrl = url.replace(/([^:]\/)\/+/g, '$1');
      
      const requestBody = {
        action: 'add',
        participants: [normalizedPhone],
      };
      
      console.log(`📤 [CAMPANHA ${campaignId}] Job ${jobNumber}: Request para Evolution API:`, {
        method: 'POST',
        url: finalUrl,
        headers: {
          'Content-Type': 'application/json',
          apikey: maskedApikey, // Log com apikey mascarada
        },
        body: requestBody,
        timeout: '25000ms',
      });
      
      // Timeout de 25 segundos
      const FETCH_TIMEOUT_MS = 25000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, FETCH_TIMEOUT_MS);
      
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: instanceApikey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const responseText = await response.text();
      let responseData: any = {};
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { message: responseText };
      }
      
      // Log da resposta da Evolution API
      console.log(`📥 [CAMPANHA ${campaignId}] Job ${jobNumber}: Resposta da Evolution API:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        responseData: responseData,
        responseTextLength: responseText.length,
      });
      
      // Processa resultado
      if (response.ok) {
        processed++;
        console.log(`✅ [CAMPANHA ${campaignId}] Job ${jobNumber}: SUCESSO - Contato ${normalizedPhone} adicionado ao grupo ${groupId}`);
        
        await rateLimitService.recordLeadUsage(campaignId, 1, true);
        await supabaseServiceRole
          .from('searches')
          .update({
            status_add_gp: true,
            status: 'added',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.contactId);
      } else {
        failed++;
        console.log(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: FALHA - Status: ${response.status}, Mensagem: ${responseData.message || responseText || 'Sem mensagem'}`);
        
        await rateLimitService.recordLeadUsage(campaignId, 1, false);
        await supabaseServiceRole
          .from('searches')
          .update({
            status: 'erro',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.contactId);
      }

      // CRÍTICO: Após o primeiro request (sucesso ou erro), muda status para 'running' para parar animação
      if (!firstRequestDone) {
        firstRequestDone = true;
        console.log(`🎬 [CAMPANHA ${campaignId}] Primeiro request concluído! Mudando status para 'running' - animação será removida`);
        
        // Verifica se a campanha ainda existe antes de atualizar
        const { data: updateCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('id')
          .eq('id', campaignId)
          .single();
        
        if (updateCheck) {
          await supabaseServiceRole
            .from('campaigns')
            .update({
              status: 'running',
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaignId);
        }
      }

      // Atualiza progresso no banco APÓS CADA JOB
      const { data: progressCheck } = await supabaseServiceRole
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .single();
      
      if (progressCheck) {
        await supabaseServiceRole
          .from('campaigns')
          .update({
            processed_contacts: processed,
            failed_contacts: failed,
            status: 'running',
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignId);
      } else {
        console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada ao atualizar progresso (foi excluída). Parando processamento.`);
        break;
      }
      
      console.log(`📊 [CAMPANHA ${campaignId}] Job ${jobNumber}: Progresso atualizado - Processados: ${processed}, Falhas: ${failed}, Total: ${jobs.length}`);

      // Delay APÓS o request (antes do próximo) - mas não no último job
      if (i < jobs.length - 1) {
        const delay = getDelay();
        console.log(`⏳ [CAMPANHA ${campaignId}] Job ${jobNumber} concluído. Aguardando ${delay}ms (${(delay/1000).toFixed(1)}s) antes do próximo...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

    } catch (error: any) {
      failed++;
      console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: ERRO:`, error?.message || error);
      
      await rateLimitService.recordLeadUsage(campaignId, 1, false);
      await supabaseServiceRole
        .from('searches')
        .update({
          status: 'erro',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.contactId);

      // CRÍTICO: Após o primeiro request (mesmo com erro), muda status para 'running'
      if (!firstRequestDone) {
        firstRequestDone = true;
        console.log(`🎬 [CAMPANHA ${campaignId}] Primeiro request falhou! Mudando status para 'running' - animação será removida`);
        
        const { data: errorUpdateCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('id')
          .eq('id', campaignId)
          .single();
        
        if (errorUpdateCheck) {
          await supabaseServiceRole
            .from('campaigns')
            .update({
              status: 'running',
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaignId);
        }
      }

      // Atualiza progresso mesmo em caso de erro
      const { data: errorProgressCheck } = await supabaseServiceRole
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .single();
      
      if (errorProgressCheck) {
        await supabaseServiceRole
          .from('campaigns')
          .update({
            processed_contacts: processed,
            failed_contacts: failed,
            status: 'running',
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignId);
      } else {
        console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada ao atualizar progresso após erro (foi excluída). Parando processamento.`);
        break;
      }

      // Continua para o próximo job mesmo se este falhou
      if (i < jobs.length - 1) {
        const delay = getDelay();
        console.log(`⏳ [CAMPANHA ${campaignId}] Job ${jobNumber} falhou. Aguardando ${delay}ms antes do próximo...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Finaliza campanha
  const { data: finalCheck } = await supabaseServiceRole
    .from('campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .single();
  
  if (!finalCheck) {
    console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha foi excluída durante processamento. Não é possível finalizar.`);
    return {
      campaignId,
      status: 'failed',
      totalJobs: jobs.length,
      processed,
      failed,
      message: 'Campanha foi excluída durante processamento',
    };
  }

  // Status: 'failed' apenas se TODOS os jobs falharam, caso contrário 'completed'
  const finalStatus = failed === jobs.length && processed === 0 ? 'failed' : 'completed';
  
  await supabaseServiceRole
    .from('campaigns')
    .update({
      status: finalStatus,
      processed_contacts: processed,
      failed_contacts: failed,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  console.log(`✅ [CAMPANHA ${campaignId}] Finalizada: ${processed} sucessos, ${failed} falhas, Status: ${finalStatus}`);

  return {
    campaignId,
    status: finalStatus,
    totalJobs: jobs.length,
    processed,
    failed,
    message: `Campanha finalizada: ${processed} sucessos, ${failed} falhas`,
  };
}
