import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/utils/response';
import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * GET /api/admin/check - Verifica se o usuário é administrador
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    
    // Busca configurações do usuário
    const { data: userSettings, error } = await supabaseServiceRole
      .from('user_settings')
      .select('is_admin, is_active')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Se não encontrou configurações, não é admin
      return successResponse({ isAdmin: false, isActive: false });
    }

    return successResponse({
      isAdmin: userSettings?.is_admin === true,
      isActive: userSettings?.is_active === true,
    });
  } catch (err: any) {
    // Se não autenticado, retorna false
    return successResponse({ isAdmin: false, isActive: false });
  }
}

