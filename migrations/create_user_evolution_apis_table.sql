-- Criação da tabela user_evolution_apis para relacionar usuários com APIs Evolution
CREATE TABLE IF NOT EXISTS user_evolution_apis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  evolution_api_id UUID NOT NULL REFERENCES evolution_apis(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, evolution_api_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_evolution_apis_user_id ON user_evolution_apis(user_id);
CREATE INDEX IF NOT EXISTS idx_user_evolution_apis_evolution_api_id ON user_evolution_apis(evolution_api_id);
CREATE INDEX IF NOT EXISTS idx_user_evolution_apis_is_default ON user_evolution_apis(is_default);

-- Comentários
COMMENT ON TABLE user_evolution_apis IS 'Tabela de relacionamento entre usuários e APIs Evolution';
COMMENT ON COLUMN user_evolution_apis.user_id IS 'ID do usuário (referencia profiles.id)';
COMMENT ON COLUMN user_evolution_apis.evolution_api_id IS 'ID da API Evolution';
COMMENT ON COLUMN user_evolution_apis.is_default IS 'Indica se esta é a API padrão para o usuário';

