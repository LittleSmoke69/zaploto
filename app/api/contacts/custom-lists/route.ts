import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * POST /api/contacts/custom-lists - Cria uma lista personalizada de contatos
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { name, contactIds } = body;

    if (!name || !name.trim()) {
      return errorResponse('Nome da lista é obrigatório', 400);
    }

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return errorResponse('Lista de IDs de contatos é obrigatória', 400);
    }

    // Verifica se os contatos pertencem ao usuário
    const { data: contacts, error: contactsError } = await supabaseServiceRole
      .from('searches')
      .select('id')
      .eq('user_id', userId)
      .in('id', contactIds);

    if (contactsError) {
      return errorResponse(`Erro ao verificar contatos: ${contactsError.message}`, 500);
    }

    if (!contacts || contacts.length === 0) {
      return errorResponse('Nenhum contato válido encontrado', 400);
    }

    // Cria a lista personalizada
    const { data: customList, error: listError } = await supabaseServiceRole
      .from('custom_contact_lists')
      .insert({
        user_id: userId,
        name: name.trim(),
        contact_ids: contactIds,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (listError) {
      // Se a tabela não existir, retorna erro informativo
      if (listError.code === '42P01') {
        return errorResponse(
          'Tabela de listas personalizadas não existe. Execute a migração primeiro.',
          500
        );
      }
      return errorResponse(`Erro ao criar lista: ${listError.message}`, 500);
    }

    return successResponse(
      customList,
      `Lista "${name}" criada com ${contacts.length} contato(s)`
    );
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * GET /api/contacts/custom-lists - Lista todas as listas personalizadas do usuário
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);

    const { data, error } = await supabaseServiceRole
      .from('custom_contact_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        return successResponse([], 'Nenhuma lista encontrada');
      }
      return errorResponse(`Erro ao buscar listas: ${error.message}`, 500);
    }

    return successResponse(data || [], 'Listas carregadas com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

/**
 * DELETE /api/contacts/custom-lists/[id] - Deleta uma lista personalizada
 */
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const listId = searchParams.get('id');

    if (!listId) {
      return errorResponse('ID da lista é obrigatório', 400);
    }

    const { error } = await supabaseServiceRole
      .from('custom_contact_lists')
      .delete()
      .eq('id', listId)
      .eq('user_id', userId);

    if (error) {
      return errorResponse(`Erro ao deletar lista: ${error.message}`, 500);
    }

    return successResponse(null, 'Lista deletada com sucesso');
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}

