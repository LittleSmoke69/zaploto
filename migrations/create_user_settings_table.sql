-- Criação da tabela user_settings para configurações personalizadas por usuário
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  max_leads_per_day INTEGER NOT NULL DEFAULT 100,
  max_instances INTEGER NOT NULL DEFAULT 20,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_is_admin ON user_settings(is_admin);

-- Comentários para documentação
COMMENT ON TABLE user_settings IS 'Configurações personalizadas por usuário (limites de leads, instâncias, permissões)';
COMMENT ON COLUMN user_settings.max_leads_per_day IS 'Máximo de leads que o usuário pode adicionar por dia';
COMMENT ON COLUMN user_settings.max_instances IS 'Máximo de instâncias WhatsApp que o usuário pode ter conectadas';
COMMENT ON COLUMN user_settings.is_admin IS 'Indica se o usuário é administrador do sistema';
COMMENT ON COLUMN user_settings.is_active IS 'Indica se a conta do usuário está ativa';

-- Insere configurações padrão para usuários existentes (se necessário)
-- Isso pode ser feito via trigger ou manualmente

