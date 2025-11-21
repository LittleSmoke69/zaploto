-- Criação da tabela campaigns para gerenciar campanhas de disparo
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_subject TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'running' | 'completed' | 'failed' | 'paused'
  total_contacts INTEGER NOT NULL DEFAULT 0,
  processed_contacts INTEGER NOT NULL DEFAULT 0,
  failed_contacts INTEGER NOT NULL DEFAULT 0,
  strategy JSONB NOT NULL DEFAULT '{}', -- Armazena delayConfig, distributionMode, concurrency, etc
  instances TEXT[] NOT NULL DEFAULT '{}', -- Array de nomes de instâncias
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- Comentários para documentação
COMMENT ON TABLE campaigns IS 'Tabela para gerenciar campanhas de adição de contatos a grupos do WhatsApp';
COMMENT ON COLUMN campaigns.status IS 'Status da campanha: pending, running, completed, failed, paused';
COMMENT ON COLUMN campaigns.strategy IS 'JSON com configurações da estratégia: delayConfig, distributionMode, concurrency, etc';
COMMENT ON COLUMN campaigns.instances IS 'Array de nomes das instâncias WhatsApp utilizadas na campanha';

