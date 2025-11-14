// utils/add-group-worker.js
import amqp from 'amqplib';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config'; // carrega o .env automaticamente

// ====== CONFIG SUPABASE (SERVICE ROLE) ======
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltando SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ====== HELPERS ======
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function computeDelayMs(cfg) {
  if (!cfg) return 1000;

  if (cfg.delayMode === 'random') {
    let minS = Math.max(1, Number(cfg.randomMinSeconds) || 1);
    let maxS = Math.max(1, Number(cfg.randomMaxSeconds) || 1);
    if (minS > maxS) [minS, maxS] = [maxS, minS];
    const sec = Math.floor(Math.random() * (maxS - minS + 1)) + minS;
    return sec * 1000;
  }

  const base = Math.max(0, Number(cfg.delayValue) || 0);
  const seconds = cfg.delayUnit === 'minutes' ? base * 60 : base;
  return Math.max(1, seconds) * 1000;
}

async function markStatus(contactId, status, statusAddGp) {
  if (!contactId) return;

  try {
    const { error } = await supabase
      .from('searches')
      .update({
        status,
        status_add_gp: statusAddGp,
      })
      .eq('id', contactId);

    if (error) {
      console.error(
        `❌ Erro ao atualizar Supabase para contato ${contactId}:`,
        error.message,
      );
    } else {
      console.log(
        `📝 Supabase atualizado para contato ${contactId}: status=${status}, status_add_gp=${statusAddGp}`,
      );
    }
  } catch (err) {
    console.error(
      `💥 Exceção ao atualizar Supabase para contato ${contactId}:`,
      err,
    );
  }
}

async function getInstanceApiKey(userId, instanceName) {
  // Tenta pegar o hash salvo da instância
  try {
    if (!userId || !instanceName) return null;

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('hash')
      .eq('user_id', userId)
      .eq('instance_name', instanceName)
      .single();

    if (error) {
      console.warn(
        `⚠️ Não foi possível buscar hash da instância "${instanceName}" (user=${userId}):`,
        error.message,
      );
      return null;
    }

    if (data?.hash) return data.hash;
    return null;
  } catch (err) {
    console.warn(
      `⚠️ Exceção ao buscar hash da instância "${instanceName}" (user=${userId}):`,
      err,
    );
    return null;
  }
}

// ====== CONFIG GERAL ======
const AMQP_URL = process.env.AMQP_URL; // amqp://usuario:senha@ip:5672/
const QUEUE_NAME = 'add_group_queue';

if (!AMQP_URL) {
  console.error('❌ AMQP_URL não configurada no .env');
  process.exit(1);
}

// base + master key (fallback)
const EVOLUTION_BASE =
  process.env.EVOLUTION_BASE ||
  process.env.NEXT_PUBLIC_EVOLUTION_BASE ||
  '';

const EVOLUTION_APIKEY =
  process.env.EVOLUTION_APIKEY ||
  process.env.NEXT_PUBLIC_EVOLUTION_APIKEY ||
  '';

if (!EVOLUTION_BASE) {
  console.error('❌ Faltando EVOLUTION_BASE no .env');
  process.exit(1);
}

console.log('👷 Worker add-group iniciado (ESM)...');
console.log('🌐 AMQP_URL =', AMQP_URL);
console.log('🌐 EVOLUTION_BASE =', EVOLUTION_BASE);

async function startWorker() {
  try {
    console.log('🔌 Conectando no RabbitMQ...');
    const conn = await amqp.connect(AMQP_URL);
    console.log('✅ Conectado no RabbitMQ');

    const ch = await conn.createChannel();
    await ch.assertQueue(QUEUE_NAME, { durable: true });

    // Processar 1 mensagem por vez (respeitar delays)
    ch.prefetch(1);

    console.log(`🎯 Aguardando mensagens na fila "${QUEUE_NAME}"...`);

    ch.consume(
      QUEUE_NAME,
      async (msg) => {
        if (!msg) return;

        const contentStr = msg.content.toString();
        console.log('📩 Mensagem recebida bruto:', contentStr);

        let payload;
        try {
          payload = JSON.parse(contentStr);
        } catch (err) {
          console.error('❌ Erro ao fazer JSON.parse do payload:', err);
          ch.ack(msg);
          return;
        }

        const {
          userId,
          contactId,
          phone,
          groupId,
          groupSubject,
          delayConfig,
          instanceName,
        } = payload;

        console.log('➡️ Job parseado:', {
          userId,
          contactId,
          phone,
          groupId,
          groupSubject,
          delayConfig,
          instanceName,
        });

        // validações básicas do payload
        if (!contactId || !phone || !groupId || !instanceName || !userId) {
          console.error(
            '❌ Payload inválido, campos obrigatórios faltando:',
            payload,
          );
          await markStatus(contactId, 'error_add_group_payload', false);
          ch.ack(msg);
          return;
        }

        // marca como na fila no banco
        await markStatus(contactId, 'queued_add_group', false);

        // delay entre inclusões (random / fixo)
        const delayMs = computeDelayMs(delayConfig);
        console.log(
          `⏱️ Delay calculado: ${delayMs}ms (≈ ${(delayMs / 1000).toFixed(1)}s) para contato ${contactId}`,
        );
        if (delayMs > 0) {
          await sleep(delayMs);
        }

        // monta o JID do participante
        try {
          let digits = String(phone).replace(/\D/g, '');
          if (!digits.startsWith('55')) {
            digits = `55${digits}`;
          }
          const participantJid = `${digits}@s.whatsapp.net`;

          // pega o API key da instância (hash) ou cai pro master
          let apiKeyToUse = await getInstanceApiKey(userId, instanceName);
          if (!apiKeyToUse) {
            apiKeyToUse = EVOLUTION_APIKEY;
          }

          if (!apiKeyToUse) {
            console.error(
              `❌ Nenhum API key disponível para chamar Evolution (instância=${instanceName}).`,
            );
            await markStatus(contactId, 'error_add_group_apikey', false);
            ch.ack(msg);
            return;
          }

          console.log(
            `📲 Chamando Evolution para adicionar ${participantJid} no grupo ${groupId} (${groupSubject || 'sem nome'}) via instância "${instanceName}"`,
          );

          // Endpoint padrão Evolution:
          // POST /group/updateParticipant/{instanceName}
          // body: { groupJid, action, participants[] }
          const resp = await fetch(
            `${EVOLUTION_BASE}/group/updateParticipant/${encodeURIComponent(
              instanceName,
            )}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: apiKeyToUse,
              },
              body: JSON.stringify({
                groupJid: groupId,
                action: 'add',
                participants: [participantJid],
              }),
            },
          );

          const text = await resp.text();
          console.log('📨 Resposta Evolution:', resp.status, text);

          if (!resp.ok) {
            console.error(
              `❌ Falha na Evolution (status ${resp.status}) para contato ${contactId}`,
            );
            await markStatus(contactId, 'error_add_group', false);
            ch.ack(msg);
            return;
          }

          console.log(
            `✅ Contato ${contactId} adicionado no grupo com sucesso.`,
          );
          await markStatus(contactId, 'added_to_group', true);
          ch.ack(msg);
        } catch (err) {
          console.error('💥 Erro inesperado ao processar job:', err);
          await markStatus(contactId, 'error_add_group', false);
          ch.ack(msg);
        }
      },
      { noAck: false },
    );

    process.on('SIGINT', async () => {
      console.log('\n🛑 SIGINT recebido, fechando conexão RabbitMQ...');
      try {
        await ch.close();
        await conn.close();
      } catch (err) {
        console.error('⚠️ Erro ao fechar conexão RabbitMQ:', err);
      }
      process.exit(0);
    });
  } catch (err) {
    console.error('💥 Erro FATAL no worker. Tentando reiniciar em 5s...', err);
    setTimeout(startWorker, 5000);
  }
}

// inicia o worker
startWorker();
