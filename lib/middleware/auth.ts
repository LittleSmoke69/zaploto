import { NextRequest } from 'next/server';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

export interface AuthUser {
  userId: string;
}

/**
 * Middleware para autenticação via headers ou query params
 * Prioriza headers para evitar problemas com leitura do body
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthUser | null> {
  // Tenta pegar do header X-User-Id (prioridade 1 - RECOMENDADO)
  const userIdHeader = req.headers.get('x-user-id');
  if (userIdHeader?.trim()) {
    return { userId: userIdHeader.trim() };
  }

  // Tenta pegar do header Authorization (prioridade 2)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const userId = authHeader.replace('Bearer ', '').trim();
    if (userId) return { userId };
  }

  // Tenta pegar da query string (prioridade 3)
  const userIdQuery = req.nextUrl.searchParams.get('userId');
  if (userIdQuery?.trim()) {
    return { userId: userIdQuery.trim() };
  }

  // Tenta pegar do body (para POST/PUT) - última opção
  // Só tenta se não encontrou nos headers/query
  try {
    const clonedReq = req.clone();
    const body = await clonedReq.json().catch(() => null);
    if (body?.userId) {
      return { userId: String(body.userId).trim() };
    }
  } catch {
    // Ignora erro de parsing - pode ser que o body não seja JSON válido
  }

  return null;
}

/**
 * Valida se o usuário existe no banco
 */
export async function validateUser(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseServiceRole
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    return !error && !!data;
  } catch {
    return false;
  }
}

/**
 * Middleware completo: autentica e valida usuário
 */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  const auth = await authenticateRequest(req);
  
  if (!auth) {
    throw new Error('Não autenticado');
  }

  const isValid = await validateUser(auth.userId);
  if (!isValid) {
    throw new Error('Usuário inválido');
  }

  return auth;
}

