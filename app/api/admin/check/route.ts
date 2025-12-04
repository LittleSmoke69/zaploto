import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/admin/check - Verifica se o usuário é administrador
 * Verifica o campo 'status' na tabela 'profiles'
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    // Busca o perfil do usuário e verifica o campo status
    const { data: profile, error } = await supabaseServiceRole
      .from('profiles')
      .select('id, status')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      // Se não encontrou o perfil, não é admin
      return successResponse({ isAdmin: false, isActive: false });
    }

    // Verifica se o status é 'admin'
    const isAdmin = profile.status === 'admin';

    return successResponse({
      isAdmin,
      isActive: true, // Assumindo que se existe o perfil, está ativo
    });
  } catch (err: any) {
    // Se não autenticado, retorna false
    return successResponse({ isAdmin: false, isActive: false });
  }
}

