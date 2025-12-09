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

    // Atualiza status da campanha para 'running' IMEDIATAMENTE
    // OTIMIZAÇÃO: Atualiza status antes de iniciar processamento para feedback visual rápido
    console.log(`⚡ [CAMPANHA ${campaignId}] Atualizando status para 'running' IMEDIATAMENTE...`);
    await supabaseServiceRole
      .from('campaigns')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);
    console.log(`✅ [CAMPANHA ${campaignId}] Status atualizado para 'running'. Processamento iniciando...`);

    // IMPORTANTE: Na Netlify, precisamos garantir que o processamento inicie IMEDIATAMENTE
    // Inicia o processamento ANTES de retornar a resposta para garantir que comece a executar
    console.log(`🚀 [CAMPANHA ${campaignId}] Iniciando processamento IMEDIATAMENTE antes de retornar resposta...`);
    
    // Processa a campanha de forma assíncrona (não bloqueia a resposta)
    // IMPORTANTE: Na Netlify, precisamos garantir que a função continue executando
    // mesmo após retornar a resposta HTTP. Usamos .then() para garantir que a promise
    // não seja descartada quando a função retornar.
    const processPromise = processCampaignAsync(campaignId, campaign, jobs, userId);
    
    // Garante que o processamento comece imediatamente
    // Aguarda um pequeno delay para garantir que o primeiro job seja iniciado
    processPromise.catch((err) => {
      console.error('❌ [CAMPANHA] Erro fatal ao processar campanha assíncrona:', err);
      console.error('❌ [CAMPANHA] Stack trace:', err?.stack);
    });

    // Garante que a promise não seja descartada
    processPromise.then(() => {
      console.log(`✅ [CAMPANHA ${campaignId}] Processamento assíncrono concluído`);
    }).catch(() => {
      // Já tratado acima
    });

    // IMPORTANTE: Aguarda um pequeno delay para garantir que o processamento comece
    // antes de retornar a resposta (especialmente importante na Netlify)
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`✅ [CAMPANHA ${campaignId}] Campanha iniciada com sucesso! Total de jobs: ${jobs.length}. Sistema suporta múltiplas campanhas simultâneas.`);
    
    return successResponse(
      {
        campaignId,
        status: 'running',
        totalJobs: jobs.length,
        message: 'Campanha iniciada. Processamento em andamento. Múltiplas campanhas podem rodar simultaneamente.',
      },
      'Campanha iniciada com sucesso'
    );
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * Processa a campanha de forma assíncrona
 */
async function processCampaignAsync(
  campaignId: string,
  campaign: any,
  jobs: Array<{ contactId: string; phone: string }>,
  userId: string
) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🚀 [PROCESS_CAMPAIGN_ASYNC] Função iniciada - Campanha: ${campaignId}, Jobs: ${jobs.length}, UserId: ${userId}`);
  
  try {
    console.log(`[${timestamp}] 🚀 [PROCESS_CAMPAIGN_ASYNC] Iniciando processamento IMEDIATO da campanha ${campaignId} - ${jobs.length} jobs`);

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

    // Processa jobs sequencialmente com delay entre cada um
    // A concorrência é controlada pelo número de instâncias disponíveis
    let processed = 0;
    let failed = 0;

    // Processa cada job sequencialmente com delay
    console.log(`🔄 [CAMPANHA ${campaignId}] Iniciando processamento de ${jobs.length} jobs...`);
    console.log(`🚀 [CAMPANHA ${campaignId}] PRIMEIRO JOB será executado IMEDIATAMENTE, depois aplicará delay entre os demais`);
    
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
      
      while (attempts < maxAttempts && !success) {
        attempts++;
        const addStartTime = Date.now();
        
        try {
          console.log(`🔄 [CAMPANHA ${campaignId}] Job ${jobNumber}: Tentativa ${attempts}/${maxAttempts} - Chamando evolutionBalancer.addLeadToGroup para telefone ${normalizedPhone}...`);
          
          // Usa o balanceador automático para adicionar lead ao grupo
          // O balanceador distribui automaticamente entre todas as Evolution APIs ativas
          const result = await evolutionBalancer.addLeadToGroup({
            userId, // Opcional - usado apenas se preferUserBinding=true
            groupId,
            leadPhone: normalizedPhone,
            preferUserBinding, // Se false, distribui entre todas as APIs
          });
        
          const addDuration = Date.now() - addStartTime;
          console.log(`⏱️ [CAMPANHA ${campaignId}] Job ${jobNumber}: addLeadToGroup concluído em ${addDuration}ms (tentativa ${attempts}/${maxAttempts})`);
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

            // Se não há instâncias disponíveis, marca todos os restantes como erro
            if (result.errorType === 'no_instance_available') {
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
          console.error(`❌ [CAMPANHA ${campaignId}] Job ${jobNumber}: Exceção ao chamar addLeadToGroup (tentativa ${attempts}/${maxAttempts}):`, addError);
          console.error(`❌ [CAMPANHA ${campaignId}] Stack trace:`, addError?.stack);
          
          // Se não for última tentativa, faz retry
          if (attempts < maxAttempts) {
            const waitMs = Math.max(getDelay() || 2000, 2000);
            console.log(`⚠️ [CAMPANHA ${campaignId}] Job ${jobNumber}: Exceção. Retentando em ${(waitMs / 1000).toFixed(1)}s (tentativa ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            continue; // Tenta novamente
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

