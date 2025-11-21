import { NextRequest } from 'next/server';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

export interface AuthUser {
  userId: string;
}

/**
 * Middleware para autenticação via headers ou query params
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthUser | null> {
  // Tenta pegar do header Authorization
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const userId = authHeader.replace('Bearer ', '');
    if (userId) return { userId };
  }

  // Tenta pegar do header X-User-Id
  const userIdHeader = req.headers.get('x-user-id');
  if (userIdHeader) {
    return { userId: userIdHeader };
  }

  // Tenta pegar do body (para POST/PUT)
  try {
    const body = await req.clone().json().catch(() => null);
    if (body?.userId) {
      return { userId: body.userId };
    }
  } catch {
    // Ignora erro de parsing
  }

  // Tenta pegar da query string
  const userIdQuery = req.nextUrl.searchParams.get('userId');
  if (userIdQuery) {
    return { userId: userIdQuery };
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

