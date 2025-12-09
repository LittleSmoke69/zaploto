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
    const rateLimit = await rateLimitService.checkDailyLimit(userId);
    if (!rateLimit.allowed) {
      return errorResponse(
        `Limite diário atingido. Você pode adicionar até ${rateLimit.limit} leads por dia. Reset em ${new Date(rateLimit.resetAt).toLocaleTimeString()}`,
        429
      );
    }

    // Verifica se há leads suficientes no limite
    if (jobs.length > rateLimit.remaining) {
      return errorResponse(
        `Você pode adicionar apenas ${rateLimit.remaining} leads hoje. Tente novamente amanhã ou reduza a quantidade.`,
        429
      );
    }

    // Verifica limite de instâncias
    const instanceLimit = await rateLimitService.checkInstanceLimit(userId);
    if (!instanceLimit.allowed) {
      return errorResponse(
        `Limite de instâncias atingido. Máximo: ${instanceLimit.max}`,
        429
      );
    }

    // Atualiza status da campanha para 'running'
    await supabaseServiceRole
      .from('campaigns')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    // Processa a campanha de forma assíncrona (não bloqueia a resposta)
    processCampaignAsync(campaignId, campaign, jobs, userId).catch((err) => {
      console.error('Erro ao processar campanha assíncrona:', err);
    });

    return successResponse(
      {
        campaignId,
        status: 'running',
        totalJobs: jobs.length,
        message: 'Campanha iniciada. Processamento em andamento.',
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
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${timestamp}] 🚀 INICIANDO PROCESSAMENTO DA CAMPANHA`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Campanha ID: ${campaignId}`);
  console.log(`Grupo: ${campaign.group_subject || campaign.group_id}`);
  console.log(`Total de jobs: ${jobs.length}`);
  console.log(`User ID: ${userId}`);
  console.log(`${'='.repeat(80)}\n`);

  const strategy = campaign.strategy || {};
  const groupId = campaign.group_id;
  const delayConfig = strategy.delayConfig || {};
  // Balanceamento automático é sempre ativo - atribuição de usuário é opcional
  const preferUserBinding = strategy.preferUserBinding === true; // Só prioriza usuário se explicitamente ativado

  console.log(`📋 Configurações da Campanha:`, {
    groupId,
    concurrency: strategy.concurrency || 1,
    delayConfig,
    preferUserBinding,
  });

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

  // Verifica se há instâncias disponíveis usando o balanceador
  // Balanceamento automático distribui carga entre TODAS as Evolution APIs ativas
  const testInstance = await evolutionBalancer.pickBestEvolutionInstance({
    userId,
    preferUserBinding, // Opcional - se false, usa todas as APIs disponíveis
  });

  if (!testInstance) {
    console.error(`❌ Nenhuma instância Evolution disponível no sistema para a campanha ${campaignId}`);
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

  console.log(`✅ Sistema de balanceamento automático ativo. Distribuindo carga entre todas as Evolution APIs disponíveis.`);
  console.log(`📊 Instância de teste disponível: ${testInstance.instance_name} (Evolution: ${testInstance.evolution_api?.name})`);

  // Busca estatísticas iniciais de todas as instâncias para comparar depois
  const { data: initialInstances } = await supabaseServiceRole
    .from('evolution_instances')
    .select(`
      id,
      instance_name,
      sent_today,
      error_today,
      evolution_api_id,
      evolution_apis!inner (
        id,
        name
      )
    `)
    .eq('is_active', true)
    .eq('status', 'ok');

  const initialStats = (initialInstances || []).map((inst: any) => {
    const api = Array.isArray(inst.evolution_apis) ? inst.evolution_apis[0] : inst.evolution_apis;
    return {
      instanceName: inst.instance_name,
      evolutionApi: api?.name || 'N/A',
      sentToday: inst.sent_today,
      errorToday: inst.error_today,
    };
  });

  console.log(`\n📊 [BALANCEAMENTO] Estatísticas iniciais das instâncias:`);
  initialStats.forEach((stat: any) => {
    console.log(`   ${stat.instanceName} (${stat.evolutionApi}): ${stat.sentToday} enviados, ${stat.errorToday} erros`);
  });
  console.log('');

  // Função para normalizar número de telefone (adiciona 55 se não tiver)
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

  // O balanceador já seleciona a melhor instância automaticamente, não precisa mais dessa função

  // Processa jobs sequencialmente com delay entre cada um
  // A concorrência é controlada pelo número de instâncias disponíveis
  let processed = 0;
  let failed = 0;

  // Função auxiliar para log detalhado
  const logDetail = (
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    data?: any
  ) => {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      type,
      campaignId,
      message,
      ...(data && { data }),
    };
    
    // Log estruturado no console
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`[${timestamp}] ${emoji} ${message}`, data ? JSON.stringify(data, null, 2) : '');
    
    return logData;
  };

  // Processa cada job sequencialmente com delay
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobNumber = i + 1;
    const totalJobs = jobs.length;
    
    logDetail('info', `Processando job ${jobNumber}/${totalJobs}`, {
      contactId: job.contactId,
      phone: job.phone,
      progress: `${jobNumber}/${totalJobs}`,
    });

    // Verifica se a campanha foi pausada
    const { data: campaignCheck } = await supabaseServiceRole
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();

    if (campaignCheck?.status === 'paused') {
      logDetail('warning', `Campanha ${campaignId} foi pausada. Aguardando retomada...`, {
        jobNumber,
        contactId: job.contactId,
        phone: job.phone,
      });
      
      // Aguarda até ser retomada ou cancelada (verifica a cada 2 segundos)
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        const { data: statusCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('status')
          .eq('id', campaignId)
          .single();

        if (!statusCheck || statusCheck.status === 'failed' || statusCheck.status === 'completed') {
          logDetail('info', `Campanha ${campaignId} foi finalizada enquanto estava pausada.`, {
            finalStatus: statusCheck?.status,
            jobNumber,
            contactId: job.contactId,
          });
          return; // Finaliza processamento
        }

        if (statusCheck.status === 'running') {
          logDetail('info', `Campanha ${campaignId} foi retomada. Continuando processamento...`, {
            jobNumber,
            contactId: job.contactId,
            phone: job.phone,
          });
          break; // Continua processamento
        }

        // Se ainda estiver pausada, continua aguardando
      }
    }

    if (campaignCheck?.status === 'failed' || campaignCheck?.status === 'completed') {
      logDetail('info', `Campanha ${campaignId} foi finalizada. Parando processamento.`, {
        finalStatus: campaignCheck.status,
        jobNumber,
        remainingJobs: jobs.length - i,
      });
      break;
    }

    try {
      const startTime = Date.now();
      
      // Normaliza o número de telefone (adiciona 55 se não tiver)
      const normalizedPhone = normalizePhoneNumber(job.phone);
      
      // Log se o número foi alterado
      if (normalizedPhone !== job.phone) {
        logDetail('info', `Número normalizado: ${job.phone} → ${normalizedPhone}`, {
          jobNumber,
          contactId: job.contactId,
          originalPhone: job.phone,
          normalizedPhone,
        });
      }
      
      // Usa o balanceador automático para adicionar lead ao grupo
      // O balanceador distribui automaticamente entre todas as Evolution APIs ativas
      const leadStartTime = Date.now();
      const result = await evolutionBalancer.addLeadToGroup({
        userId, // Opcional - usado apenas se preferUserBinding=true
        groupId,
        leadPhone: normalizedPhone,
        preferUserBinding, // Se false, distribui entre todas as APIs
      });
      const leadDuration = Date.now() - leadStartTime;

      // Log detalhado do resultado
      if (result.instanceUsed) {
        logDetail(result.success ? 'success' : 'error', `Lead ${result.success ? 'adicionado' : 'falhou'}`, {
          jobNumber,
          contactId: job.contactId,
          phone: normalizedPhone,
          instanceName: result.instanceUsed.instance_name,
          instanceId: result.instanceUsed.id,
          evolutionApiId: result.instanceUsed.evolution_api_id,
          httpStatus: result.httpStatus,
          errorType: result.errorType,
          duration: `${leadDuration}ms`,
        });
      }

      const duration = Date.now() - startTime;

      if (result.success) {
        processed++;
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

        logDetail('success', `Lead adicionado com sucesso ao grupo`, {
          jobNumber,
          contactId: job.contactId,
          phone: job.phone,
          instanceUsed: result.instanceUsed?.instance_name || 'N/A',
          groupId,
          duration: `${duration}ms`,
          updateError: updateError?.message || null,
        });
      } else {
        failed++;
        await rateLimitService.recordLeadUsage(campaignId, 1, false);

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
          
          logDetail('error', `Nenhuma instância disponível. ${remaining} jobs restantes marcados como erro.`, {
            jobNumber,
            contactId: job.contactId,
            phone: job.phone,
            remainingJobs: remaining,
            action: 'Status atualizado para "erro" em todos os leads restantes',
          });
          break;
        }

        // Marca como 'erro' quando falha
        const { error: updateError } = await supabaseServiceRole
          .from('searches')
          .update({
            status: 'erro',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.contactId);

        logDetail('error', `Falha ao adicionar lead ao grupo - Status atualizado para 'erro'`, {
          jobNumber,
          contactId: job.contactId,
          phone: job.phone,
          instanceUsed: result.instanceUsed?.instance_name || 'N/A',
          groupId,
          duration: `${duration}ms`,
          errorType: result.errorType || 'unknown',
          error: result.error || 'Erro desconhecido',
          statusUpdated: 'erro',
          updateError: updateError?.message || null,
        });
      }
    } catch (error: any) {
      failed++;
      await rateLimitService.recordLeadUsage(campaignId, 1, false);
      
      // Marca como 'erro' em caso de exceção
      const { error: updateError } = await supabaseServiceRole
        .from('searches')
        .update({
          status: 'erro',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.contactId);
      
      logDetail('error', `Erro inesperado ao processar job - Status atualizado para 'erro'`, {
        jobNumber,
        contactId: job.contactId,
        phone: job.phone,
        groupId,
        errorType: 'exception',
        errorMessage: error?.message || String(error),
        errorStack: error?.stack || null,
        errorName: error?.name || 'UnknownError',
        statusUpdated: 'erro',
        updateError: updateError?.message || null,
      });
    }

    // Atualiza progresso periodicamente (a cada 5 jobs ou no último)
    if ((i + 1) % 5 === 0 || i === jobs.length - 1) {
      const progressPercentage = Math.round(((processed + failed) / jobs.length) * 100);
      
      // Busca estatísticas atuais para comparar distribuição
      const { data: currentInstances } = await supabaseServiceRole
        .from('evolution_instances')
        .select(`
          id,
          instance_name,
          sent_today,
          error_today,
          evolution_api_id,
          evolution_apis!inner (
            id,
            name
          )
        `)
        .eq('is_active', true)
        .eq('status', 'ok');

      const currentStats = (currentInstances || []).map((inst: any) => {
        const api = Array.isArray(inst.evolution_apis) ? inst.evolution_apis[0] : inst.evolution_apis;
        const initial = initialStats.find((s: any) => s.instanceName === inst.instance_name);
        const sentInCampaign = initial ? (inst.sent_today - initial.sentToday) : inst.sent_today;
        return {
          instanceName: inst.instance_name,
          evolutionApi: api?.name || 'N/A',
          sentToday: inst.sent_today,
          sentInCampaign,
          errorToday: inst.error_today,
        };
      });

      logDetail('info', `Progresso da campanha atualizado`, {
        processed,
        failed,
        total: jobs.length,
        progress: `${processed + failed}/${jobs.length} (${progressPercentage}%)`,
        successRate: jobs.length > 0 ? `${Math.round((processed / (processed + failed || 1)) * 100)}%` : '0%',
      });

      console.log(`\n📊 [BALANCEAMENTO] Distribuição de carga até agora:`);
      currentStats.forEach((stat: any) => {
        console.log(`   ${stat.instanceName} (${stat.evolutionApi}):`);
        console.log(`      Total enviado hoje: ${stat.sentToday} | Nesta campanha: ${stat.sentInCampaign} | Erros: ${stat.errorToday}`);
      });
      console.log('');

      await supabaseServiceRole
        .from('campaigns')
        .update({
          processed_contacts: processed,
          failed_contacts: failed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
    }

    // Delay entre requisições (exceto no último)
    if (i < jobs.length - 1) {
      const delay = getDelay();
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Busca estatísticas finais para comparar distribuição
  const { data: finalInstances } = await supabaseServiceRole
    .from('evolution_instances')
    .select(`
      id,
      instance_name,
      sent_today,
      error_today,
      evolution_api_id,
      evolution_apis!inner (
        id,
        name
      )
    `)
    .eq('is_active', true)
    .eq('status', 'ok');

  const finalStats = (finalInstances || []).map((inst: any) => {
    const api = Array.isArray(inst.evolution_apis) ? inst.evolution_apis[0] : inst.evolution_apis;
    const initial = initialStats.find((s: any) => s.instanceName === inst.instance_name);
    const sentInCampaign = initial ? (inst.sent_today - initial.sentToday) : inst.sent_today;
    const errorInCampaign = initial ? (inst.error_today - initial.errorToday) : inst.error_today;
    return {
      instanceName: inst.instance_name,
      evolutionApi: api?.name || 'N/A',
      sentToday: inst.sent_today,
      sentInCampaign,
      errorToday: inst.error_today,
      errorInCampaign,
      percentage: processed > 0 ? Math.round((sentInCampaign / processed) * 100) : 0,
    };
  });

  // Finaliza campanha
  const finalStatus = failed === jobs.length ? 'failed' : 'completed';
  const successRate = jobs.length > 0 ? Math.round((processed / jobs.length) * 100) : 0;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${new Date().toISOString()}] ✅ CAMPANHA FINALIZADA`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Campanha ID: ${campaignId}`);
  console.log(`Grupo: ${campaign.group_subject || campaign.group_id}`);
  console.log(`Processados: ${processed}`);
  console.log(`Falhas: ${failed}`);
  console.log(`Total: ${jobs.length}`);
  console.log(`Taxa de sucesso: ${successRate}%`);
  console.log(`${'='.repeat(80)}`);
  console.log(`\n📊 [BALANCEAMENTO] Relatório final de distribuição:`);
  console.log(`${'='.repeat(80)}`);
  finalStats.forEach((stat: any) => {
    console.log(`   ${stat.instanceName} (${stat.evolutionApi}):`);
    console.log(`      Enviados nesta campanha: ${stat.sentInCampaign} (${stat.percentage}% da carga)`);
    console.log(`      Erros nesta campanha: ${stat.errorInCampaign}`);
    console.log(`      Total enviado hoje: ${stat.sentToday}`);
  });
  console.log(`${'='.repeat(80)}\n`);
  
  logDetail(
    finalStatus === 'completed' ? 'success' : 'error',
    `Campanha ${finalStatus === 'completed' ? 'concluída' : 'falhou'}`,
    {
      campaignId,
      finalStatus,
      totalJobs: jobs.length,
      processed,
      failed,
      successRate: `${successRate}%`,
      distribution: finalStats,
      summary: {
        total: jobs.length,
        success: processed,
        failed,
        successRate: `${successRate}%`,
      },
    }
  );

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
}

