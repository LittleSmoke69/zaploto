-- Script para inicializar configurações padrão para usuários existentes
-- Execute este script após criar a tabela user_settings

-- Insere configurações padrão para todos os usuários que ainda não têm
INSERT INTO user_settings (user_id, max_leads_per_day, max_instances, is_admin, is_active)
SELECT 
  id as user_id,
  100 as max_leads_per_day,
  20 as max_instances,
  false as is_admin,
  true as is_active
FROM profiles
WHERE id NOT IN (SELECT user_id FROM user_settings)
ON CONFLICT (user_id) DO NOTHING;

-- Para tornar um usuário admin, execute:
-- UPDATE user_settings SET is_admin = true WHERE user_id = '<user-id>';

