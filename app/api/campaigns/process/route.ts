import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';
import { evolutionService } from '@/lib/services/evolution-service';
import { rateLimitService } from '@/lib/services/rate-limit-service';

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
  const instances = campaign.instances || [];
  const groupId = campaign.group_id;
  const delayConfig = strategy.delayConfig || {};
  const concurrency = Math.max(1, Math.min(10, strategy.concurrency || 1)); // Limita entre 1 e 10
  const distributionMode = strategy.distributionMode || 'round_robin';

  console.log(`📋 Configurações da Campanha:`, {
    groupId,
    instances: instances.length,
    instanceNames: instances,
    concurrency,
    distributionMode,
    delayConfig,
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

  // Busca dados das instâncias (hash/API keys)
  console.log(`🔍 Buscando instâncias: ${instances.join(', ')}`);
  const { data: instanceData, error: instanceError } = await supabaseServiceRole
    .from('whatsapp_instances')
    .select('instance_name, hash, status')
    .eq('user_id', userId)
    .in('instance_name', instances);

  if (instanceError) {
    console.error(`❌ Erro ao buscar instâncias:`, instanceError);
  }

  if (!instanceData || instanceData.length === 0) {
    console.error(`❌ Nenhuma instância encontrada para a campanha ${campaignId}`);
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

  console.log(`📱 Instâncias encontradas: ${instanceData.length}`, instanceData.map(i => ({
    name: i.instance_name,
    status: i.status,
    hasHash: !!i.hash,
  })));

  // Filtra apenas instâncias conectadas e com hash
  const availableInstances = instanceData.filter(
    (inst) => inst.status === 'connected' && inst.hash
  );

  if (availableInstances.length === 0) {
    console.error(`❌ Nenhuma instância disponível (conectada e com hash) para a campanha ${campaignId}`);
    console.error(`   Instâncias encontradas mas não disponíveis:`, instanceData.map(i => ({
      name: i.instance_name,
      status: i.status,
      hasHash: !!i.hash,
      reason: !i.hash ? 'Sem hash/API key' : i.status !== 'connected' ? `Status: ${i.status}` : 'Desconhecido',
    })));
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

  console.log(`✅ Instâncias disponíveis para uso: ${availableInstances.length}`, 
    availableInstances.map(i => i.instance_name));

  // Mapa de status das instâncias
  const instanceStatus = new Map<string, { errors: number; banned: boolean }>();
  availableInstances.forEach((inst) => {
    instanceStatus.set(inst.instance_name, { errors: 0, banned: false });
  });

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

  // Função para selecionar próxima instância
  const getNextInstance = (): { name: string; hash: string } | null => {
    // Remove instâncias banidas
    const activeInstances = availableInstances.filter(
      (inst) => !instanceStatus.get(inst.instance_name)?.banned
    );

    if (activeInstances.length === 0) {
      return null; // Todas as instâncias foram banidas
    }

    if (distributionMode === 'round_robin') {
      // Round robin simples (pode ser melhorado com tracking)
      const index = Math.floor(Math.random() * activeInstances.length);
      const inst = activeInstances[index];
      return { name: inst.instance_name, hash: inst.hash! };
    } else {
      // Least used (usa a instância com menos erros)
      const sorted = activeInstances.sort((a, b) => {
        const aErrors = instanceStatus.get(a.instance_name)?.errors || 0;
        const bErrors = instanceStatus.get(b.instance_name)?.errors || 0;
        return aErrors - bErrors;
      });
      const inst = sorted[0];
      return { name: inst.instance_name, hash: inst.hash! };
    }
  };

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

    const instance = getNextInstance();
    
    if (!instance) {
      // Todas as instâncias banidas - marca todos os restantes como falha
      const remaining = jobs.length - i;
      failed += remaining;
      await rateLimitService.recordLeadUsage(campaignId, remaining, false);
      
      // IMPORTANTE: Atualiza status de todos os leads restantes para 'added'
      // para evitar que sejam processados novamente
      const remainingJobs = jobs.slice(i);
      const remainingContactIds = remainingJobs.map(j => j.contactId);
      
      if (remainingContactIds.length > 0) {
        await supabaseServiceRole
          .from('searches')
          .update({
            status: 'added', // Marca como 'added' para não processar novamente
            updated_at: new Date().toISOString(),
            // Não marca status_add_gp como true pois falharam
          })
          .in('id', remainingContactIds);
      }
      
      logDetail('error', `Todas as instâncias foram banidas. ${remaining} jobs restantes marcados como falha e status atualizado para 'added'.`, {
        jobNumber,
        contactId: job.contactId,
        phone: job.phone,
        remainingJobs: remaining,
        remainingContactIds,
        availableInstances: availableInstances.length,
        bannedInstances: Array.from(instanceStatus.entries())
          .filter(([_, status]) => status.banned)
          .map(([name]) => name),
        action: 'Status atualizado para "added" em todos os leads restantes',
      });
      break;
    }

    logDetail('info', `Tentando adicionar lead usando instância`, {
      jobNumber,
      contactId: job.contactId,
      phone: job.phone,
      instanceName: instance.name,
      groupId,
      instanceErrors: instanceStatus.get(instance.name)?.errors || 0,
    });

    try {
      const startTime = Date.now();
      
      // Adiciona participante ao grupo
      const result = await evolutionService.addParticipantsToGroup(
        instance.name,
        instance.hash,
        groupId,
        [job.phone]
      );

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
          instanceName: instance.name,
          groupId,
          duration: `${duration}ms`,
          added: result.added || 1,
          updateError: updateError?.message || null,
        });
      } else {
        failed++;
        await rateLimitService.recordLeadUsage(campaignId, 1, false);

        // IMPORTANTE: Atualiza status para 'added' mesmo quando falha
        // Isso evita que o mesmo lead seja processado novamente
        const { error: updateError } = await supabaseServiceRole
          .from('searches')
          .update({
            status: 'added', // Marca como 'added' para não processar novamente
            updated_at: new Date().toISOString(),
            // Não marca status_add_gp como true pois falhou
          })
          .eq('id', job.contactId);

        // Atualiza status da instância baseado no erro
        const status = instanceStatus.get(instance.name);
        if (status) {
          status.errors++;
          
          // Marca como banida se for connection_closed
          if (result.errorType === 'connection_closed') {
            status.banned = true;
            await rateLimitService.markInstanceError(
              userId,
              instance.name,
              'connection_closed',
              result.error || 'Connection closed'
            );
          } else if (result.errorType === 'rate_limit') {
            // Suspende temporariamente em caso de rate limit
            await rateLimitService.markInstanceError(
              userId,
              instance.name,
              'rate_limit',
              result.error || 'Rate limit'
            );
          }
        }

        logDetail('error', `Falha ao adicionar lead ao grupo - Status atualizado para 'added' para evitar reprocessamento`, {
          jobNumber,
          contactId: job.contactId,
          phone: job.phone,
          instanceName: instance.name,
          groupId,
          duration: `${duration}ms`,
          errorType: result.errorType || 'unknown',
          error: result.error || 'Erro desconhecido',
          instanceStatus: {
            errors: status?.errors || 0,
            banned: status?.banned || false,
          },
          action: result.errorType === 'connection_closed' 
            ? 'Instância marcada como banida' 
            : result.errorType === 'rate_limit'
            ? 'Instância suspensa temporariamente'
            : 'Erro registrado',
          statusUpdated: 'added', // Indica que status foi atualizado mesmo com falha
          updateError: updateError?.message || null,
        });
      }
    } catch (error: any) {
      failed++;
      await rateLimitService.recordLeadUsage(campaignId, 1, false);
      
      // IMPORTANTE: Atualiza status para 'added' mesmo em caso de exceção
      // Isso evita que o mesmo lead seja processado novamente
      const { error: updateError } = await supabaseServiceRole
        .from('searches')
        .update({
          status: 'added', // Marca como 'added' para não processar novamente
          updated_at: new Date().toISOString(),
          // Não marca status_add_gp como true pois falhou
        })
        .eq('id', job.contactId);
      
      logDetail('error', `Erro inesperado ao processar job - Status atualizado para 'added' para evitar reprocessamento`, {
        jobNumber,
        contactId: job.contactId,
        phone: job.phone,
        instanceName: instance?.name || 'N/A',
        groupId,
        errorType: 'exception',
        errorMessage: error?.message || String(error),
        errorStack: error?.stack || null,
        errorName: error?.name || 'UnknownError',
        statusUpdated: 'added', // Indica que status foi atualizado mesmo com exceção
        updateError: updateError?.message || null,
      });
    }

    // Atualiza progresso periodicamente (a cada 5 jobs ou no último)
    if ((i + 1) % 5 === 0 || i === jobs.length - 1) {
      const progressPercentage = Math.round(((processed + failed) / jobs.length) * 100);
      
      logDetail('info', `Progresso da campanha atualizado`, {
        processed,
        failed,
        total: jobs.length,
        progress: `${processed + failed}/${jobs.length} (${progressPercentage}%)`,
        successRate: jobs.length > 0 ? `${Math.round((processed / (processed + failed || 1)) * 100)}%` : '0%',
        instanceStatus: Array.from(instanceStatus.entries()).map(([name, status]) => ({
          name,
          errors: status.errors,
          banned: status.banned,
        })),
      });

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

  // Finaliza campanha
  const finalStatus = failed === jobs.length ? 'failed' : 'completed';
  const successRate = jobs.length > 0 ? Math.round((processed / jobs.length) * 100) : 0;
  
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
      instanceStatus: Array.from(instanceStatus.entries()).map(([name, status]) => ({
        name,
        errors: status.errors,
        banned: status.banned,
      })),
      summary: {
        total: jobs.length,
        success: processed,
        failed,
        successRate: `${successRate}%`,
        bannedInstances: Array.from(instanceStatus.entries())
          .filter(([_, status]) => status.banned)
          .map(([name]) => name),
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

