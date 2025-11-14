import { NextRequest } from 'next/server';
import amqp from 'amqplib';

// garante que essa rota rode em Node.js (não no edge)
export const runtime = 'nodejs';

let amqpConn: any = null;
let amqpChannel: any = null;

async function getChannel() {
  if (amqpChannel) return amqpChannel;

  const url = process.env.AMQP_URL;
  if (!url) {
    throw new Error('AMQP_URL não configurada no .env');
  }

  // usamos variáveis locais para o TS não reclamar de "possibly null"
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue('add_group_queue', { durable: true });

  amqpConn = conn;
  amqpChannel = ch;

  return ch;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, groupId, groupSubject, delayConfig, jobs } = body || {};

    if (!userId || !groupId || !Array.isArray(jobs) || jobs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'userId, groupId e jobs são obrigatórios' }),
        { status: 400 }
      );
    }

    const ch = await getChannel();
    let accepted = 0;
    let failed = 0;
    const now = Date.now();

    for (const job of jobs) {
      try {
        const payload = {
          userId,
          contactId: job.contactId,
          phone: job.phone,
          groupId,
          groupSubject: groupSubject || null,
          delayConfig: delayConfig || null,
          createdAt: now,
        };

        ch.sendToQueue(
          'add_group_queue',
          Buffer.from(JSON.stringify(payload)),
          { persistent: true }
        );
        accepted++;
      } catch (err) {
        console.error('Erro ao enfileirar job:', err);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, accepted, failed }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Erro em /api/add-to-group:', err);
    return new Response(
      JSON.stringify({ error: 'Erro interno ao enfileirar os jobs' }),
      { status: 500 }
    );
  }
}
