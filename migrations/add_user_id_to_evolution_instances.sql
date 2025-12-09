-- Adiciona campo user_id à tabela evolution_instances para rastrear quem criou cada instância
-- A coluna é criada sem foreign key constraint para evitar erros caso a estrutura de profiles seja diferente
-- A aplicação garantirá a integridade através da lógica de acesso

ALTER TABLE evolution_instances 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Cria índice para melhorar performance das consultas por user_id
CREATE INDEX IF NOT EXISTS idx_evolution_instances_user_id ON evolution_instances(user_id);

-- Comentário explicativo
COMMENT ON COLUMN evolution_instances.user_id IS 'ID do usuário que criou a instância. NULL para instâncias antigas ou do sistema. Valores devem corresponder ao ID do usuário na tabela profiles.';

