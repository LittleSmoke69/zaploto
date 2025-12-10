import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { rateLimitService } from '@/lib/services/rate-limit-service';
import { evolutionBalancer } from '@/lib/services/evolution-balancer';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutos para processamento assíncrono

interface ProcessCampaignRequest {
  campaignId: string;
  jobs: Array<{ contactId: string; phone: string }>;
}

/**
 * POST /api/campaigns/process - Processa uma campanha adicionando leads aos grupos
 * Substitui o webhook e processa diretamente no código
 */
export async function POST(req: NextRequest) {
  try {
    // Autentica primeiro (lê headers ou body)
    let userId: string;
    try {
      const auth = await requireAuth(req);
      userId = auth.userId;
    } catch (authError: any) {
      console.error('Erro de autenticação:', authError);
      return errorResponse(authError.message || 'Não autenticado', 401);
    }
    
    // Depois lê o body
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
    // IMPORTANTE: Permite múltiplas campanhas ativas simultaneamente
    // O limite é por leads processados no dia, não por número de campanhas
    console.log(`🔍 [CAMPANHA ${campaignId}] Verificando rate limits para permitir múltiplas campanhas simultâneas...`);
    
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
    // IMPORTANTE: Este limite é sobre instâncias do sistema, não campanhas
    // Múltiplas campanhas podem compartilhar as mesmas instâncias via balanceador
    const instanceLimit = await rateLimitService.checkInstanceLimit(userId);
    console.log(`📊 [CAMPANHA ${campaignId}] Limite de instâncias: ${instanceLimit.current}/${instanceLimit.max} instâncias ativas no sistema`);
    
    if (!instanceLimit.allowed) {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Limite de instâncias atingido: ${instanceLimit.max} instâncias`);
      return errorResponse(
        `Limite de instâncias atingido. Máximo: ${instanceLimit.max} instâncias ativas no sistema.`,
        429
      );
    }
    
    // Verifica se há campanhas ativas (apenas para log, não bloqueia)
    const { data: activeCampaigns } = await supabaseServiceRole
      .from('campaigns')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['running', 'paused']);
    
    const activeCount = activeCampaigns?.length || 0;
    console.log(`✅ [CAMPANHA ${campaignId}] Sistema permite múltiplas campanhas ativas. Campanhas ativas atuais: ${activeCount}`);
    
    if (activeCount > 0) {
      console.log(`🔄 [CAMPANHA ${campaignId}] Iniciando nova campanha com ${activeCount} campanha(s) já ativa(s). O balanceador distribuirá a carga entre todas as Evolution APIs.`);
    }

    // IMPORTANTE: Mantém status 'pending' para mostrar animação de "iniciando campanha"
    // O status só muda para 'running' após o primeiro job ser processado com sucesso
    console.log(`⚡ [CAMPANHA ${campaignId}] Mantendo status 'pending' para mostrar animação. Processamento iniciando...`);
    
    // Registra o started_at quando realmente inicia o processamento
    await supabaseServiceRole
      .from('campaigns')
      .update({
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);
    console.log(`✅ [CAMPANHA ${campaignId}] Processamento iniciando. Status permanece 'pending' até primeiro job...`);

    // CRÍTICO: Retorna resposta HTTP imediata e processa jobs em background
    // Isso evita timeout 504 na Netlify (limite de 10s para funções serverless)
    // O processamento continua em background mesmo após retornar a resposta
    console.log(`🚀 [CAMPANHA ${campaignId}] Retornando resposta HTTP imediata e processando ${jobs.length} jobs em background...`);
    
    // Inicia processamento em background (não bloqueia a resposta HTTP)
    processCampaignInBackground(campaignId, campaign, jobs, userId).catch((error) => {
      console.error(`❌ [CAMPANHA ${campaignId}] Erro no processamento em background:`, error);
    });
    
    // Retorna resposta imediata
    return successResponse(
      {
        campaignId,
        status: 'pending',
        totalJobs: jobs.length,
        message: 'Campanha iniciada. Processamento em andamento...',
      },
      'Campanha iniciada com sucesso'
    );
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * Processa campanha em background (não bloqueia resposta HTTP)
 */
async function processCampaignInBackground(
  campaignId: string,
  campaign: any,
  jobs: Array<{ contactId: string; phone: string }>,
  userId: string
) {
  try {
    console.log(`🔄 [CAMPANHA ${campaignId}] Iniciando processamento em background de ${jobs.length} jobs...`);
    
    // Extrai informações necessárias
    const strategy = campaign.strategy || {};
    const groupId = campaign.group_id;
    const delayConfig = strategy.delayConfig || {};
    const preferUserBinding = strategy.preferUserBinding === true;
    
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
    
    // Processa TODOS os jobs sequencialmente
    let processed = 0;
    let failed = 0;
    
    for (let i = 0; i < jobs.length; i++) {
      // CRÍTICO: Verifica se a campanha foi excluída antes de processar cada job
      const { data: campaignCheck, error: checkError } = await supabaseServiceRole
        .from('campaigns')
        .select('id, status')
        .eq('id', campaignId)
        .single();
      
      // Se a campanha foi excluída ou não existe mais, para o processamento imediatamente
      if (checkError || !campaignCheck) {
        console.log(`🛑 [CAMPANHA ${campaignId}] Campanha foi excluída ou não existe mais. Parando processamento no job ${i + 1}/${jobs.length}`);
        break; // Para o processamento imediatamente
      }
      
      // Se a campanha foi marcada como failed, completed ou paused, para o processamento
      if (campaignCheck.status === 'failed' || campaignCheck.status === 'completed') {
        console.log(`🛑 [CAMPANHA ${campaignId}] Campanha foi finalizada (status: ${campaignCheck.status}). Parando processamento no job ${i + 1}/${jobs.length}`);
        break; // Para o processamento imediatamente
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
            return; // Para o processamento imediatamente
          }
          
          // Se foi finalizada, para o processamento
          if (statusCheck.status === 'failed' || statusCheck.status === 'completed') {
            console.log(`🛑 [CAMPANHA ${campaignId}] Campanha foi finalizada durante pausa (status: ${statusCheck.status}). Parando processamento.`);
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
      
      const job = jobs[i];
      const jobNumber = i + 1;
      const normalizedPhone = normalizePhoneNumber(job.phone);
      
      console.log(`📞 [CAMPANHA ${campaignId}] Job ${jobNumber}/${jobs.length}: Processando ${normalizedPhone}`);
      
      // Marca o tempo inicial do request
      const requestStartTime = Date.now();
      
      try {
        // Faz request DIRETO para Evolution API (sem passar pelo balancer complexo)
        const instance = await evolutionBalancer.pickBestEvolutionInstance({
          userId,
          preferUserBinding,
        });
        
        if (!instance || !instance.evolution_api) {
          throw new Error('Nenhuma instância disponível');
        }
        
        // Busca apikey da instância
        const { data: instanceData } = await supabaseServiceRole
          .from('evolution_instances')
          .select('apikey')
          .eq('id', instance.id)
          .single();
        
        const instanceApikey = instanceData?.apikey;
        
        if (!instanceApikey) {
          throw new Error('Instância sem apikey configurada');
        }
        
        // Faz request DIRETO para Evolution API
        const normalizedBaseUrl = instance.evolution_api.base_url.replace(/\/+$/, '').replace(/([^:]\/)\/+/g, '$1');
        const url = `${normalizedBaseUrl}/group/updateParticipant/${instance.instance_name}?groupJid=${encodeURIComponent(groupId)}`;
        const finalUrl = url.replace(/([^:]\/)\/+/g, '$1');
        
        const body = {
          action: 'add',
          participants: [normalizedPhone],
        };
        
        console.log(`📤 [CAMPANHA ${campaignId}] Job ${jobNumber}: Fazendo request para ${finalUrl}`);
        
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
          body: JSON.stringify(body),
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
        
        // Calcula tempo de resposta do request
        const requestDuration = Date.now() - requestStartTime;
        
        if (response.ok) {
          processed++;
          console.log(`✅ [CAMPANHA ${campaignId}] Job ${jobNumber}: SUCESSO em ${requestDuration}ms`);
          
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
          console.log(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: FALHA em ${requestDuration}ms - ${response.status} ${responseData.message || ''}`);
          
          await rateLimitService.recordLeadUsage(campaignId, 1, false);
          await supabaseServiceRole
            .from('searches')
            .update({
              status: 'erro',
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.contactId);
        }
        
        // CRÍTICO: Atualiza progresso no banco APÓS CADA JOB para feedback em tempo real
        // O front-end faz polling a cada 1 segundo, então verá as atualizações imediatamente
        // IMPORTANTE: Primeiro job muda status de 'pending' para 'running' (remove animação)
        const newStatus = jobNumber === 1 ? 'running' : 'running';
        
        if (jobNumber === 1) {
          console.log(`🎬 [CAMPANHA ${campaignId}] Primeiro job processado! Mudando status de 'pending' para 'running' - animação será removida`);
        }
        
        // CRÍTICO: Verifica novamente se a campanha existe antes de atualizar
        const { data: updateCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('id')
          .eq('id', campaignId)
          .single();
        
        if (updateCheck) {
          await supabaseServiceRole
            .from('campaigns')
            .update({
              processed_contacts: processed,
              failed_contacts: failed,
              status: newStatus, // Primeiro job muda para 'running', outros mantêm 'running'
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaignId);
        } else {
          console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada ao atualizar progresso (foi excluída). Parando processamento.`);
          break; // Para o processamento se a campanha foi excluída
        }
        
        console.log(`📊 [CAMPANHA ${campaignId}] Job ${jobNumber}: Progresso atualizado no banco - Processados: ${processed}, Falhas: ${failed}, Total: ${jobs.length}, Status: ${newStatus}`);
        
        // Delay APÓS o request (antes do próximo) - mas não no último job
        if (i < jobs.length - 1) {
          const delay = getDelay();
          const delayStartTime = Date.now();
          
          console.log(`⏳ [CAMPANHA ${campaignId}] Job ${jobNumber} concluído. Aguardando ${delay}ms (${(delay/1000).toFixed(1)}s) antes do próximo...`);
          
          // Aguarda o delay configurado
          await new Promise((resolve) => setTimeout(resolve, delay));
          
          const actualDelay = Date.now() - delayStartTime;
          console.log(`✅ [CAMPANHA ${campaignId}] Delay concluído: ${actualDelay}ms aguardados`);
        }
        
      } catch (error: any) {
        failed++;
        const requestDuration = Date.now() - requestStartTime;
        console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: ERRO após ${requestDuration}ms:`, error?.message || error);
        
        await rateLimitService.recordLeadUsage(campaignId, 1, false);
        await supabaseServiceRole
          .from('searches')
          .update({
            status: 'erro',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.contactId);
        
        // CRÍTICO: Verifica novamente se a campanha existe antes de atualizar após erro
        const { data: errorUpdateCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('id')
          .eq('id', campaignId)
          .single();
        
        if (errorUpdateCheck) {
          await supabaseServiceRole
            .from('campaigns')
            .update({
              processed_contacts: processed,
              failed_contacts: failed,
              status: 'running', // Mantém como 'running' durante processamento
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaignId);
        } else {
          console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada ao atualizar progresso após erro (foi excluída). Parando processamento.`);
          break; // Para o processamento se a campanha foi excluída
        }
        
        console.log(`📊 [CAMPANHA ${campaignId}] Job ${jobNumber}: Progresso atualizado após erro - Processados: ${processed}, Falhas: ${failed}, Total: ${jobs.length}`);
        
        // Continua para o próximo job mesmo se este falhou
        if (i < jobs.length - 1) {
          const delay = getDelay();
          console.log(`⏳ [CAMPANHA ${campaignId}] Job ${jobNumber} falhou. Aguardando ${delay}ms antes do próximo...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    
    // Finaliza campanha
    // Verifica se a campanha ainda existe antes de finalizar
    const { data: finalCheck } = await supabaseServiceRole
      .from('campaigns')
      .select('id, status')
      .eq('id', campaignId)
      .single();
    
    if (!finalCheck) {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha foi excluída durante processamento. Não é possível finalizar.`);
      return successResponse(
        {
          campaignId,
          status: 'failed',
          totalJobs: jobs.length,
          processed,
          failed,
          message: 'Campanha foi excluída durante processamento',
        },
        'Processamento interrompido: campanha foi excluída'
      );
    }
    
    // Status: 'failed' apenas se TODOS os jobs falharam, caso contrário 'completed'
    const finalStatus = failed === jobs.length && processed === 0 ? 'failed' : 'completed';
    const totalProcessed = processed + failed;
    const successRate = totalProcessed > 0 ? Math.round((processed / totalProcessed) * 100) : 0;
    
    console.log(`🏁 [CAMPANHA ${campaignId}] Finalizando campanha...`);
    console.log(`📊 [CAMPANHA ${campaignId}] Estatísticas finais:`);
    console.log(`   - Total de jobs: ${jobs.length}`);
    console.log(`   - Processados com sucesso: ${processed}`);
    console.log(`   - Falhas: ${failed}`);
    console.log(`   - Taxa de sucesso: ${successRate}%`);
    console.log(`   - Status final: ${finalStatus}`);
    
    const updateResult = await supabaseServiceRole
      .from('campaigns')
      .update({
        status: finalStatus,
        processed_contacts: processed,
        failed_contacts: failed,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .select('id, status, processed_contacts, failed_contacts, completed_at');
    
    if (updateResult.error) {
      console.error(`❌ [CAMPANHA ${campaignId}] Erro ao atualizar status final:`, updateResult.error);
    } else if (updateResult.data && updateResult.data.length > 0) {
      const updatedCampaign = updateResult.data[0];
      console.log(`✅ [CAMPANHA ${campaignId}] Campanha finalizada e atualizada no banco:`, {
        id: updatedCampaign.id,
        status: updatedCampaign.status,
        processed: updatedCampaign.processed_contacts,
        failed: updatedCampaign.failed_contacts,
        completed_at: updatedCampaign.completed_at,
      });
    } else {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada ao atualizar status final (pode ter sido excluída)`);
    }
    
    console.log(`✅ [CAMPANHA ${campaignId}] Processamento completo: ${processed} sucessos, ${failed} falhas, Status: ${finalStatus}`);
  } catch (err: any) {
    console.error(`❌ [CAMPANHA ${campaignId}] Erro fatal no processamento em background:`, err);
    console.error('Stack trace:', err?.stack);
    
    // Tenta marcar campanha como failed em caso de erro fatal
    try {
      const { data: campaignExists } = await supabaseServiceRole
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .single();

      if (campaignExists) {
        await supabaseServiceRole
          .from('campaigns')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', campaignId);
        console.log(`✅ [CAMPANHA ${campaignId}] Campanha marcada como failed devido a erro fatal`);
      }
    } catch (updateError: any) {
      console.error(`❌ [CAMPANHA ${campaignId}] Erro ao atualizar status da campanha para failed:`, updateError);
    }
  }
}

/**
 * @deprecated Esta função não é mais usada - todo processamento é feito sequencialmente na função POST
 * Mantida apenas para referência histórica
 */
async function processCampaignAsync_DEPRECATED(
  campaignId: string,
  campaign: any,
  jobs: Array<{ contactId: string; phone: string }>,
  userId: string
) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🚀 [PROCESS_CAMPAIGN_ASYNC] Função iniciada - Campanha: ${campaignId}, Jobs: ${jobs.length}, UserId: ${userId}`);
  
  try {
    console.log(`[${timestamp}] 🚀 [PROCESS_CAMPAIGN_ASYNC] Iniciando processamento IMEDIATO da campanha ${campaignId} - ${jobs.length} jobs`);
    
    // CRÍTICO: Executa o primeiro passo IMEDIATAMENTE para garantir que o processamento comece
    // Isso é especialmente importante na Netlify para evitar que o contexto seja encerrado
    console.log(`⚡ [PROCESS_CAMPAIGN_ASYNC] Executando primeiro passo IMEDIATAMENTE para garantir início do processamento...`);

    const strategy = campaign.strategy || {};
    const groupId = campaign.group_id;
    const delayConfig = strategy.delayConfig || {};
    // Balanceamento automático é sempre ativo - atribuição de usuário é opcional
    const preferUserBinding = strategy.preferUserBinding === true; // Só prioriza usuário se explicitamente ativado

    if (!groupId) {
      console.error(`❌ ERRO: Campanha ${campaignId} sem group_id`);
      await supabaseServiceRole
        .from('campaigns')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
      return;
    }

    console.log(`📋 [CAMPANHA ${campaignId}] GroupId: ${groupId}, Jobs: ${jobs.length}`);

    // Verifica se há instâncias disponíveis usando o balanceador
    // Balanceamento automático distribui carga entre TODAS as Evolution APIs ativas
    // OTIMIZAÇÃO: Esta verificação é rápida e não bloqueia o início
    console.log(`🔍 [CAMPANHA ${campaignId}] Verificando instâncias disponíveis (verificação rápida)...`);
    const testInstance = await evolutionBalancer.pickBestEvolutionInstance({
      userId,
      preferUserBinding, // Opcional - se false, usa todas as APIs disponíveis
    });

    if (!testInstance) {
      console.error(`❌ Nenhuma instância disponível para campanha ${campaignId}`);
      await supabaseServiceRole
        .from('campaigns')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
      return;
    }

    console.log(`✅ [CAMPANHA ${campaignId}] Instância selecionada: ${testInstance.instance_name}`);
    console.log(`🚀 [CAMPANHA ${campaignId}] PRIMEIRO JOB será executado IMEDIATAMENTE após esta verificação`);

    // Função para normalizar número de telefone (adiciona 55 se não tiver, remove duplicação)
    const normalizePhoneNumber = (phone: string): string => {
      // Remove caracteres não numéricos
      let cleaned = phone.replace(/\D/g, '');
      
      // Remove "55" duplicado no início (ex: "555599798679" -> "5599798679")
      if (cleaned.startsWith('5555')) {
        cleaned = cleaned.substring(2); // Remove os dois primeiros "55"
      }
      
      // Se já começa com 55 (e não é duplicado), retorna como está
      if (cleaned.startsWith('55') && !cleaned.startsWith('5555')) {
        return cleaned;
      }
      
      // Se não começa com 55, adiciona
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

    // IMPORTANTE: O primeiro job já foi processado antes de retornar a resposta HTTP
    // Aqui processamos apenas os jobs restantes, começando com delay
    
    // Busca o progresso atual da campanha (já inclui o primeiro job processado)
    const { data: currentProgress } = await supabaseServiceRole
      .from('campaigns')
      .select('processed_contacts, failed_contacts')
      .eq('id', campaignId)
      .single();
    
    // Inicializa contadores considerando o primeiro job já processado
    let processed = currentProgress?.processed_contacts || 0;
    let failed = currentProgress?.failed_contacts || 0;
    
    console.log(`🔄 [CAMPANHA ${campaignId}] Iniciando processamento de ${jobs.length} jobs restantes...`);
    console.log(`📊 [CAMPANHA ${campaignId}] Progresso inicial: ${processed} processados, ${failed} falhas (primeiro job já executado)`);
    console.log(`⏳ [CAMPANHA ${campaignId}] Aplicando delay entre os jobs conforme configuração`);
    
    // Aplica delay ANTES do primeiro job restante (já que o primeiro foi executado imediatamente)
    if (jobs.length > 0) {
      const delay = getDelay();
      console.log(`⏳ [CAMPANHA ${campaignId}] Aguardando ${delay}ms (${(delay/1000).toFixed(1)}s) antes de processar próximo job...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    
    for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobNumber = i + 1;
    const totalJobs = jobs.length;

    // Verifica se a campanha ainda existe e seu status
    // IMPORTANTE: Continua processando mesmo se a campanha foi excluída do banco
    // Isso garante que o processamento não seja interrompido por exclusões
    const { data: campaignCheck } = await supabaseServiceRole
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();

    // Se a campanha não existe mais (foi excluída), continua processando
    // mas não atualiza o status no banco (já foi excluída)
    if (!campaignCheck) {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada no banco (pode ter sido excluída), mas continuando processamento dos jobs restantes...`);
      // Continua processando os jobs mesmo se a campanha foi excluída
      // Isso garante que os leads sejam processados e adicionados ao grupo
    } else if (campaignCheck.status === 'paused') {
      // Aguarda até ser retomada ou cancelada (verifica a cada 2 segundos)
      console.log(`⏸️ [CAMPANHA ${campaignId}] Campanha pausada, aguardando retomada...`);
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        const { data: statusCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('status')
          .eq('id', campaignId)
          .single();

        // Se foi excluída, continua processando
        if (!statusCheck) {
          console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha excluída durante pausa, continuando processamento...`);
          break; // Continua processamento
        }

        if (statusCheck.status === 'failed' || statusCheck.status === 'completed') {
          console.log(`🛑 [CAMPANHA ${campaignId}] Campanha finalizada durante pausa, interrompendo processamento`);
          return; // Finaliza processamento
        }

        if (statusCheck.status === 'running') {
          console.log(`▶️ [CAMPANHA ${campaignId}] Campanha retomada, continuando processamento`);
          break; // Continua processamento
        }
      }
    } else if (campaignCheck.status === 'failed' || campaignCheck.status === 'completed') {
      console.log(`🛑 [CAMPANHA ${campaignId}] Campanha já finalizada (${campaignCheck.status}), interrompendo processamento`);
      break;
    }

      // Lógica de retry baseada no código antigo
      const originalPhone = job.phone;
      const normalizedPhone = normalizePhoneNumber(job.phone);
      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      
      console.log(`📞 [CAMPANHA ${campaignId}] Job ${jobNumber}/${totalJobs}: Telefone original: ${originalPhone} | Normalizado: ${normalizedPhone}`);
      console.log(`📞 [CAMPANHA ${campaignId}] Job ${jobNumber}/${totalJobs}: Adicionando ${normalizedPhone} ao grupo ${groupId}`);
      
      // Declara result antes do while para estar disponível em todo o escopo
      let result: {
        success: boolean;
        error?: string;
        errorType?: 'rate_limit' | 'bad_request' | 'connection_closed' | 'unknown';
        added?: number;
        httpStatus?: number;
        responseData?: any;
        instanceUsed?: any;
      } = {
        success: false,
        error: 'Erro desconhecido',
        errorType: 'unknown',
        added: 0,
        httpStatus: 0,
      };
      
      while (attempts < maxAttempts && !success) {
        attempts++;
        const addStartTime = Date.now();
        
        try {
          console.log(`🔄 [CAMPANHA ${campaignId}] Job ${jobNumber}: Tentativa ${attempts}/${maxAttempts} - Fazendo request DIRETO para Evolution API...`);
          
          // SIMPLIFICADO: Faz request DIRETO para Evolution API usando instância selecionada
          // Busca instância e faz request direto (sem passar pelo balanceador complexo)
          const instance = await evolutionBalancer.pickBestEvolutionInstance({
            userId,
            preferUserBinding,
          });
          
          if (!instance || !instance.evolution_api) {
            throw new Error('Nenhuma instância disponível');
          }
          
          // Busca apikey da instância
          const { data: instanceData } = await supabaseServiceRole
            .from('evolution_instances')
            .select('apikey')
            .eq('id', instance.id)
            .single();
          
          const instanceApikey = instanceData?.apikey;
          
          if (!instanceApikey) {
            throw new Error('Instância sem apikey configurada');
          }
          
          // Faz request DIRETO para Evolution API
          const normalizedBaseUrl = instance.evolution_api.base_url.replace(/\/+$/, '').replace(/([^:]\/)\/+/g, '$1');
          const url = `${normalizedBaseUrl}/group/updateParticipant/${instance.instance_name}?groupJid=${encodeURIComponent(groupId)}`;
          const finalUrl = url.replace(/([^:]\/)\/+/g, '$1');
          
          const body = {
            action: 'add',
            participants: [normalizedPhone],
          };
          
          console.log(`📤 [CAMPANHA ${campaignId}] Job ${jobNumber}: URL: ${finalUrl}`);
          console.log(`📤 [CAMPANHA ${campaignId}] Job ${jobNumber}: Body:`, JSON.stringify(body));
          
          // Timeout de 25 segundos (menor que 30 para evitar abort na Netlify)
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
            body: JSON.stringify(body),
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
          
          // Atualiza resultado no formato esperado
          if (response.ok) {
            result = {
              success: true,
              added: 1,
              httpStatus: response.status,
              responseData,
              instanceUsed: {
                id: instance.id,
                instance_name: instance.instance_name,
                evolution_api_id: instance.evolution_api_id,
              },
            };
          } else if (response.status === 403) {
            result = {
              success: false,
              error: 'Rate limit (403)',
              errorType: 'rate_limit',
              added: 0,
              httpStatus: 403,
              responseData,
              instanceUsed: {
                id: instance.id,
                instance_name: instance.instance_name,
                evolution_api_id: instance.evolution_api_id,
              },
            };
          } else if (response.status === 400) {
            const errorMsg = responseData?.message || responseText || 'Bad request';
            const isConnectionClosed = errorMsg.toLowerCase().includes('connection closed');
            
            result = {
              success: false,
              error: isConnectionClosed ? 'Connection Closed' : errorMsg,
              errorType: isConnectionClosed ? 'connection_closed' : 'bad_request',
              added: 0,
              httpStatus: 400,
              responseData,
              instanceUsed: {
                id: instance.id,
                instance_name: instance.instance_name,
                evolution_api_id: instance.evolution_api_id,
              },
            };
          } else {
            result = {
              success: false,
              error: responseData?.message || `Erro HTTP ${response.status}`,
              errorType: 'unknown',
              added: 0,
              httpStatus: response.status,
              responseData,
              instanceUsed: {
                id: instance.id,
                instance_name: instance.instance_name,
                evolution_api_id: instance.evolution_api_id,
              },
            };
          }
        
          const addDuration = Date.now() - addStartTime;
          console.log(`⏱️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Request concluído em ${addDuration}ms (tentativa ${attempts}/${maxAttempts})`);
          console.log(`📊 [CAMPANHA ${campaignId}] Job ${jobNumber}: Resultado - ${result.success ? 'SUCESSO' : 'FALHA'} ${result.error ? `(${result.error})` : ''}`);
          console.log(`📊 [CAMPANHA ${campaignId}] Job ${jobNumber}: Detalhes - errorType: ${result.errorType || 'N/A'}, httpStatus: ${result.httpStatus || 'N/A'}`);

          if (result.success) {
            success = true;
            processed++;
            console.log(`✅ [CAMPANHA ${campaignId}] Job ${jobNumber}: Telefone ${normalizedPhone} adicionado com SUCESSO! Processados: ${processed}`);
            await rateLimitService.recordLeadUsage(campaignId, 1, true);
            
            // Atualiza contato no banco - marca como adicionado com sucesso
            const { error: updateError } = await supabaseServiceRole
              .from('searches')
              .update({
                status_add_gp: true,
                status: 'added',
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.contactId);
            
            if (updateError) {
              console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Erro ao atualizar contato ${job.contactId} (telefone ${normalizedPhone}):`, updateError);
            } else {
              console.log(`✅ [CAMPANHA ${campaignId}] Job ${jobNumber}: Contato ${job.contactId} (telefone ${normalizedPhone}) atualizado no banco`);
            }
          } else {
            // Verifica se é rate limit e deve fazer retry
            const isRateLimit = result.errorType === 'rate_limit' || 
                               result.httpStatus === 429 ||
                               (result.error || '').toLowerCase().includes('rate') ||
                               (result.error || '').toLowerCase().includes('too many') ||
                               (result.error || '').toLowerCase().includes('limit');
            
            if (isRateLimit && attempts < maxAttempts) {
              // Calcula delay com backoff baseado no código antigo
              const baseDelay = getDelay() || 2000;
              const jitter = 1000 + Math.random() * 2000;
              const waitMs = baseDelay + jitter;
              
              console.log(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Rate-limit detectado. Backoff ${(waitMs / 1000).toFixed(1)}s (tentativa ${attempts}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue; // Tenta novamente
            }

            // Se não há instâncias disponíveis (erro ao buscar instância), marca como erro
            if (result.error?.includes('Nenhuma instância') || result.error?.includes('sem apikey')) {
              const remaining = jobs.length - i;
              const remainingJobs = jobs.slice(i);
              const remainingContactIds = remainingJobs.map(j => j.contactId);
              
              if (remainingContactIds.length > 0) {
                await supabaseServiceRole
                  .from('searches')
                  .update({
                    status: 'erro',
                    updated_at: new Date().toISOString(),
                  })
                  .in('id', remainingContactIds);
              }
              console.error(`❌ [CAMPANHA ${campaignId}] Nenhuma instância disponível. ${remaining} jobs restantes marcados como erro.`);
              break;
            }

            // IMPORTANTE: Connection closed NÃO deve fazer retry - marca como falha
            // Mas só marca instância como desconectada se for realmente connection closed confirmado
            if (result.errorType === 'connection_closed' && result.instanceUsed) {
              const isRealConnectionClosed = result.error?.toLowerCase().includes('connection closed') ||
                                           (result.httpStatus === 400 && result.error?.toLowerCase().includes('connection closed'));
              
              if (isRealConnectionClosed) {
                console.warn(`⚠️ [CAMPANHA ${campaignId}] Instância ${result.instanceUsed.instance_name} marcada como desconectada - Connection Closed confirmado`);
                // O balanceador já atualiza o status, apenas logamos aqui
              } else {
                console.log(`⚠️ [CAMPANHA ${campaignId}] Erro marcado como connection_closed mas não confirma - NÃO marca instância como desconectada`);
              }
              
              // Connection closed não faz retry - marca como falha
              failed++;
              await rateLimitService.recordLeadUsage(campaignId, 1, false);
              await supabaseServiceRole
                .from('searches')
                .update({
                  status: 'erro',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', job.contactId);
              break; // Não tenta novamente para connection closed
            }

            // Outros erros: se não for última tentativa, faz retry com delay
            if (attempts < maxAttempts) {
              const waitMs = Math.max(getDelay() || 2000, 2000);
              console.log(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Erro detectado. Retentando em ${(waitMs / 1000).toFixed(1)}s (tentativa ${attempts}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue; // Tenta novamente
            }

            // Última tentativa falhou
            failed++;
            console.log(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Telefone ${normalizedPhone} FALHOU após ${maxAttempts} tentativas! Erro: ${result.error || 'Desconhecido'}. Falhas: ${failed}`);
            await rateLimitService.recordLeadUsage(campaignId, 1, false);

            // Marca como 'erro' quando falha
            await supabaseServiceRole
              .from('searches')
              .update({
                status: 'erro',
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.contactId);
          }
        } catch (addError: any) {
          const addDuration = Date.now() - addStartTime;
          console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Exceção ao fazer request (tentativa ${attempts}/${maxAttempts}):`, addError);
          console.error(`❌ [CAMPANHA ${campaignId}] Stack trace:`, addError?.stack);
          
          // Trata erros de instância não disponível ou sem apikey
          const errorMessage = addError?.message || '';
          if (errorMessage.includes('Nenhuma instância disponível') || errorMessage.includes('sem apikey')) {
            result = {
              success: false,
              error: errorMessage,
              errorType: 'unknown',
              added: 0,
              httpStatus: 0,
            };
            
            // Se não for última tentativa, faz retry
            if (attempts < maxAttempts) {
              const waitMs = Math.max(getDelay() || 2000, 2000);
              console.log(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: ${errorMessage}. Retentando em ${(waitMs / 1000).toFixed(1)}s (tentativa ${attempts}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue; // Tenta novamente
            } else {
              // Última tentativa falhou
              failed++;
              console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: ${errorMessage} após ${maxAttempts} tentativas. Telefone: ${normalizedPhone}`);
              await rateLimitService.recordLeadUsage(campaignId, 1, false);
              await supabaseServiceRole
                .from('searches')
                .update({
                  status: 'erro',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', job.contactId);
              break; // Não tenta mais
            }
          }
          
          // Trata AbortError (timeout ou abort na Netlify)
          const isAbortError = addError?.name === 'AbortError' || addError?.code === 20;
          const isTimeout = addError?.message?.includes('timeout') || addError?.message?.includes('aborted');
          
          if (isAbortError || isTimeout) {
            console.warn(`⏱️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Request abortado/timeout após ${addDuration}ms. Tentando novamente...`);
            
            // Se não for última tentativa, faz retry com delay maior
            if (attempts < maxAttempts) {
              const waitMs = Math.max(getDelay() || 3000, 3000); // Delay maior para timeout
              console.log(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Timeout/Abort. Retentando em ${(waitMs / 1000).toFixed(1)}s (tentativa ${attempts}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue; // Tenta novamente
            } else {
              // Última tentativa falhou por timeout
              failed++;
              console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Timeout após ${maxAttempts} tentativas. Telefone: ${normalizedPhone}`);
              await rateLimitService.recordLeadUsage(campaignId, 1, false);
              await supabaseServiceRole
                .from('searches')
                .update({
                  status: 'erro',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', job.contactId);
              break; // Não tenta mais
            }
          } else {
            // Outros erros: se não for última tentativa, faz retry
            if (attempts < maxAttempts) {
              const waitMs = Math.max(getDelay() || 2000, 2000);
              console.log(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Exceção. Retentando em ${(waitMs / 1000).toFixed(1)}s (tentativa ${attempts}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, waitMs));
              continue; // Tenta novamente
            }
          }
          
          // Última tentativa falhou
          failed++;
          console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Erro final após ${maxAttempts} tentativas:`, addError);
          await rateLimitService.recordLeadUsage(campaignId, 1, false);
          
          // Marca como 'erro' em caso de exceção
          await supabaseServiceRole
            .from('searches')
            .update({
              status: 'erro',
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.contactId);
        }
      }

      // Atualiza progresso no banco a cada job para feedback em tempo real
      // IMPORTANTE: Só atualiza se a campanha ainda existir no banco
      const progressUpdate = {
        processed_contacts: processed,
        failed_contacts: failed,
        updated_at: new Date().toISOString(),
      };
      
      console.log(`📊 [CAMPANHA ${campaignId}] Job ${jobNumber}: Atualizando progresso no banco - Processados: ${processed}, Falhas: ${failed}, Total jobs: ${jobs.length}`);
      
      const { data: updateData, error: updateError } = await supabaseServiceRole
        .from('campaigns')
        .update(progressUpdate)
        .eq('id', campaignId)
        .select('processed_contacts, failed_contacts');
      
      if (updateError) {
        // Se erro for "campanha não encontrada", apenas loga mas continua processando
        if (updateError.code === 'PGRST116' || updateError.message?.includes('No rows')) {
          console.warn(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Campanha não encontrada no banco (pode ter sido excluída), mas continuando processamento...`);
        } else {
          console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Erro ao atualizar progresso no banco:`, updateError);
        }
      } else if (updateData && updateData.length > 0) {
        console.log(`✅ [CAMPANHA ${campaignId}] Job ${jobNumber}: Progresso atualizado no banco - Processados: ${updateData[0].processed_contacts}, Falhas: ${updateData[0].failed_contacts}`);
      } else {
        console.warn(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Campanha não encontrada ao atualizar progresso (pode ter sido excluída), mas continuando processamento...`);
      }

      // Log de progresso a cada job ou a cada 10 jobs
      if ((i + 1) % 10 === 0 || i === jobs.length - 1) {
        const progressPercentage = Math.round(((processed + failed) / jobs.length) * 100);
        const successRate = processed + failed > 0 ? Math.round((processed / (processed + failed)) * 100) : 0;
        const currentJobPhone = normalizePhoneNumber(jobs[i].phone);
        console.log(`📊 [CAMPANHA ${campaignId}] Progresso: ${processed + failed}/${jobs.length} (${progressPercentage}%) | Sucesso: ${successRate}% | Processados: ${processed} | Falhas: ${failed} | Último telefone processado: ${currentJobPhone}`);
      }

      // Delay entre requisições (exceto no último)
      // IMPORTANTE: O primeiro job já foi executado imediatamente acima
      // Agora aplicamos delay APÓS cada job (antes do próximo)
      if (i < jobs.length - 1) {
        const delay = getDelay();
        console.log(`⏳ [CAMPANHA ${campaignId}] Job ${jobNumber} concluído. Aguardando ${delay}ms (${(delay/1000).toFixed(1)}s) antes do próximo job...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.log(`✅ [CAMPANHA ${campaignId}] Último job (${jobNumber}) concluído, sem delay`);
      }
    }

    // Finaliza campanha
    const finalStatus = failed === jobs.length ? 'failed' : 'completed';
    const successRate = jobs.length > 0 ? Math.round((processed / jobs.length) * 100) : 0;
    
    console.log(`✅ [CAMPANHA ${campaignId}] Finalizada: ${processed} sucessos, ${failed} falhas (${successRate}% taxa de sucesso)`);
    console.log(`📊 [CAMPANHA ${campaignId}] Atualizando status final no banco - Status: ${finalStatus}, Processados: ${processed}, Falhas: ${failed}, Total: ${jobs.length}`);

    // Verifica se a campanha ainda existe antes de atualizar
    const { data: campaignExists } = await supabaseServiceRole
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .single();

    if (!campaignExists) {
      console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada no banco (foi excluída), mas processamento concluído: ${processed} sucessos, ${failed} falhas`);
      return; // Não tenta atualizar se foi excluída
    }

    const finalUpdate = {
      status: finalStatus,
      processed_contacts: processed,
      failed_contacts: failed,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: finalUpdateData, error: finalUpdateError } = await supabaseServiceRole
      .from('campaigns')
      .update(finalUpdate)
      .eq('id', campaignId)
      .select('id, status, processed_contacts, failed_contacts, completed_at');
    
    if (finalUpdateError) {
      // Se erro for "campanha não encontrada", apenas loga
      if (finalUpdateError.code === 'PGRST116' || finalUpdateError.message?.includes('No rows')) {
        console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha foi excluída durante processamento, mas concluída: ${processed} sucessos, ${failed} falhas`);
      } else {
        console.error(`❌ [CAMPANHA ${campaignId}] Erro ao atualizar status final no banco:`, finalUpdateError);
      }
    } else if (finalUpdateData && finalUpdateData.length > 0) {
      console.log(`✅ [CAMPANHA ${campaignId}] Status final atualizado no banco:`, {
        id: finalUpdateData[0].id,
        status: finalUpdateData[0].status,
        processed_contacts: finalUpdateData[0].processed_contacts,
        failed_contacts: finalUpdateData[0].failed_contacts,
        completed_at: finalUpdateData[0].completed_at,
      });
    }
  } catch (error: any) {
    console.error(`❌ [CAMPANHA ${campaignId}] Erro fatal no processamento:`, error);
    console.error('Stack trace:', error?.stack);
    
    // Marca campanha como falha em caso de erro fatal
    // Só atualiza se a campanha ainda existir no banco
    try {
      const { data: campaignExists } = await supabaseServiceRole
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .single();

      if (campaignExists) {
        const { error: updateError } = await supabaseServiceRole
          .from('campaigns')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          })
          .eq('id', campaignId);
        
        if (updateError) {
          console.error(`❌ [CAMPANHA ${campaignId}] Erro ao atualizar status da campanha para failed:`, updateError);
        } else {
          console.log(`✅ [CAMPANHA ${campaignId}] Campanha marcada como failed devido a erro fatal`);
        }
      } else {
        console.warn(`⚠️ [CAMPANHA ${campaignId}] Campanha não encontrada no banco (foi excluída), não é possível atualizar status`);
      }
    } catch (updateError: any) {
      console.error(`❌ [CAMPANHA ${campaignId}] Erro ao verificar/atualizar status da campanha para failed:`, updateError);
    }
  }
}

