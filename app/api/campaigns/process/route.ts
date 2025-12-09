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
  console.log(`[${timestamp}] 🚀 Iniciando campanha ${campaignId} - ${jobs.length} jobs`);

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

  // Verifica se há instâncias disponíveis usando o balanceador
  // Balanceamento automático distribui carga entre TODAS as Evolution APIs ativas
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

  // O balanceador já seleciona a melhor instância automaticamente, não precisa mais dessa função

  // Processa jobs sequencialmente com delay entre cada um
  // A concorrência é controlada pelo número de instâncias disponíveis
  let processed = 0;
  let failed = 0;

  // Processa cada job sequencialmente com delay
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobNumber = i + 1;
    const totalJobs = jobs.length;

    // Verifica se a campanha foi pausada
    const { data: campaignCheck } = await supabaseServiceRole
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();

    if (campaignCheck?.status === 'paused') {
      // Aguarda até ser retomada ou cancelada (verifica a cada 2 segundos)
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        
        const { data: statusCheck } = await supabaseServiceRole
          .from('campaigns')
          .select('status')
          .eq('id', campaignId)
          .single();

        if (!statusCheck || statusCheck.status === 'failed' || statusCheck.status === 'completed') {
          return; // Finaliza processamento
        }

        if (statusCheck.status === 'running') {
          break; // Continua processamento
        }
      }
    }

    if (campaignCheck?.status === 'failed' || campaignCheck?.status === 'completed') {
      break;
    }

    try {
      // Normaliza o número de telefone (adiciona 55 se não tiver)
      const normalizedPhone = normalizePhoneNumber(job.phone);
      
      // Usa o balanceador automático para adicionar lead ao grupo
      // O balanceador distribui automaticamente entre todas as Evolution APIs ativas
      const result = await evolutionBalancer.addLeadToGroup({
        userId, // Opcional - usado apenas se preferUserBinding=true
        groupId,
        leadPhone: normalizedPhone,
        preferUserBinding, // Se false, distribui entre todas as APIs
      });

      if (result.success) {
        processed++;
        await rateLimitService.recordLeadUsage(campaignId, 1, true);
        
        // Atualiza contato no banco - marca como adicionado com sucesso
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
          console.error(`❌ Nenhuma instância disponível. ${remaining} jobs restantes marcados como erro.`);
          break;
        }

        // Se erro for connection_closed, atualiza status da instância para disconnected
        if (result.errorType === 'connection_closed' && result.instanceUsed) {
          await supabaseServiceRole
            .from('evolution_instances')
            .update({
              status: 'disconnected',
              is_active: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', result.instanceUsed.id);
          
          console.warn(`⚠️ Instância ${result.instanceUsed.instance_name} marcada como desconectada devido a connection_closed`);
        }

        // Marca como 'erro' quando falha
        await supabaseServiceRole
          .from('searches')
          .update({
            status: 'erro',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.contactId);
      }
    } catch (error: any) {
      failed++;
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

    // Atualiza progresso no banco a cada job para feedback em tempo real
    await supabaseServiceRole
      .from('campaigns')
      .update({
        processed_contacts: processed,
        failed_contacts: failed,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    // Log de progresso a cada 10 jobs
    if ((i + 1) % 10 === 0 || i === jobs.length - 1) {
      const progressPercentage = Math.round(((processed + failed) / jobs.length) * 100);
      const successRate = processed + failed > 0 ? Math.round((processed / (processed + failed)) * 100) : 0;
      console.log(`📊 Progresso: ${processed + failed}/${jobs.length} (${progressPercentage}%) | Sucesso: ${successRate}% | Processados: ${processed} | Falhas: ${failed}`);
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
  
  console.log(`✅ Campanha ${campaignId} finalizada: ${processed} sucessos, ${failed} falhas (${successRate}% taxa de sucesso)`);

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

