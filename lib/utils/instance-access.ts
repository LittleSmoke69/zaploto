import { supabaseServiceRole } from '@/lib/services/supabase-service';

/**
 * Verifica se o usuário tem acesso a uma instância
 * @param userId ID do usuário
 * @param instanceName Nome da instância
 * @returns true se o usuário tem acesso (é dono ou admin), false caso contrário
 */
export async function checkInstanceAccess(userId: string, instanceName: string): Promise<boolean> {
  try {
    // Verifica se é admin
    const { data: profile } = await supabaseServiceRole
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single();

    const isAdmin = profile?.status === 'admin';

    // Se for admin, tem acesso a todas as instâncias
    if (isAdmin) {
      return true;
    }

    // Se não for admin, verifica se é dono da instância
    const { data: instance } = await supabaseServiceRole
      .from('evolution_instances')
      .select('user_id')
      .eq('instance_name', instanceName)
      .eq('is_active', true)
      .single();

    // Se não encontrou a instância, não tem acesso
    if (!instance) {
      return false;
    }

    // Se user_id for null (instância antiga), não permite acesso
    if (instance.user_id === null) {
      return false;
    }

    // Verifica se o user_id da instância corresponde ao usuário
    return instance.user_id === userId;
  } catch (error) {
    console.error('Erro ao verificar acesso à instância:', error);
    return false;
  }
}

