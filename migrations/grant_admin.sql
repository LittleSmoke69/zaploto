-- Query para tornar um usuário administrador
-- Substitua o user_id abaixo pelo ID do usuário que deseja tornar admin

-- Opção 1: Se o usuário já tem configurações, apenas atualiza
UPDATE user_settings 
SET 
  is_admin = true,
  updated_at = NOW()
WHERE user_id = 'eab8f365-3c71-4272-b9ea-349e269616af';

-- Opção 2: Se o usuário não tem configurações, cria com admin = true
-- (Execute apenas se a Opção 1 não afetar nenhuma linha)
INSERT INTO user_settings (
  user_id,
  max_leads_per_day,
  max_instances,
  is_admin,
  is_active,
  created_at,
  updated_at
)
VALUES (
  'eab8f365-3c71-4272-b9ea-349e269616af',
  100,
  20,
  true,  -- Admin
  true,
  NOW(),
  NOW()
)
ON CONFLICT (user_id) 
DO UPDATE SET 
  is_admin = true,
  updated_at = NOW();

-- Verificar se funcionou
SELECT 
  user_id,
  max_leads_per_day,
  max_instances,
  is_admin,
  is_active,
  created_at,
  updated_at
FROM user_settings
WHERE user_id = 'eab8f365-3c71-4272-b9ea-349e269616af';

