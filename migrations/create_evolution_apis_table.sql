-- Criação da tabela evolution_apis para gerenciar múltiplas APIs Evolution
CREATE TABLE IF NOT EXISTS evolution_apis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_evolution_apis_is_active ON evolution_apis(is_active);
CREATE INDEX IF NOT EXISTS idx_evolution_apis_created_at ON evolution_apis(created_at DESC);

-- Comentários
COMMENT ON TABLE evolution_apis IS 'Tabela para armazenar configurações de múltiplas APIs Evolution';
COMMENT ON COLUMN evolution_apis.name IS 'Nome identificador da API Evolution';
COMMENT ON COLUMN evolution_apis.base_url IS 'URL base da API Evolution';
COMMENT ON COLUMN evolution_apis.api_key IS 'Chave de API (Master Key) da Evolution';
COMMENT ON COLUMN evolution_apis.is_active IS 'Indica se a API está ativa e disponível para uso';

