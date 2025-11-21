import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/contacts - Lista contatos do usuário
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseServiceRole
      .from('searches')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .not('telefone', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return errorResponse(`Erro ao buscar contatos: ${error.message}`);
    }

    return successResponse({
      contacts: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err: any) {
    return errorResponse(err.message || 'Erro ao buscar contatos', 401);
  }
}

/**
 * POST /api/contacts - Importa contatos via CSV
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { contacts } = body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return errorResponse('Lista de contatos é obrigatória', 400);
    }

    if (contacts.length > 10000) {
      return errorResponse('Limite de 10.000 contatos por importação', 400);
    }

    // Prepara dados para inserção
    const payload = contacts.map((c: any) => ({
      user_id: userId,
      name: c.name || null,
      telefone: c.telefone || null,
      status: 'pending',
      status_disparo: false,
      status_add_gp: false,
    }));

    // Insere em lotes de 500
    const chunkSize = 500;
    let insertedTotal = 0;
    let insertErrors = 0;

    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { error } = await supabaseServiceRole.from('searches').insert(chunk);
      
      if (error) {
        insertErrors += chunk.length;
        console.error(`Erro no bloco [${i}-${i + chunkSize}]:`, error);
      } else {
        insertedTotal += chunk.length;
      }
    }

    return successResponse({
      inserted: insertedTotal,
      failed: insertErrors,
      total: contacts.length,
    }, `Importação concluída: ${insertedTotal} sucesso, ${insertErrors} falhas`);
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * DELETE /api/contacts - Deleta todos os contatos do usuário
 */
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);

    const { error, count } = await supabaseServiceRole
      .from('searches')
      .delete({ count: 'exact' })
      .eq('user_id', userId);

    if (error) {
      return errorResponse(`Erro ao deletar contatos: ${error.message}`);
    }

    return successResponse({ deleted: count || 0 }, `${count || 0} contato(s) deletado(s)`);
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

