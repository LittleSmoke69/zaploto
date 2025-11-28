-- Trigger para criar user_settings automaticamente quando um novo usuário é criado
-- Este trigger garante que toda conta criada em profiles tenha configurações padrão

-- Função que será executada quando um novo usuário for inserido
CREATE OR REPLACE FUNCTION create_user_settings_on_profile_insert()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id TEXT;
BEGIN
  -- Determina qual campo usar como user_id
  -- Tenta usar 'id' primeiro (PK padrão do Supabase), depois 'user_id' se existir
  IF (NEW.id IS NOT NULL) THEN
    target_user_id := NEW.id::TEXT;
  ELSIF (NEW.user_id IS NOT NULL) THEN
    target_user_id := NEW.user_id::TEXT;
  ELSE
    -- Fallback: usa o que estiver disponível
    target_user_id := COALESCE(NEW.id::TEXT, NEW.user_id::TEXT);
  END IF;

  -- Insere configurações padrão para o novo usuário
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
    target_user_id,              -- ID do novo usuário
    100,                         -- Padrão: 100 leads por dia
    20,                          -- Padrão: 20 instâncias máximas
    false,                       -- Não é admin por padrão
    true,                        -- Conta ativa por padrão
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING; -- Evita erro se já existir
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cria o trigger que executa a função após inserção em profiles
DROP TRIGGER IF EXISTS trigger_create_user_settings ON profiles;

CREATE TRIGGER trigger_create_user_settings
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION create_user_settings_on_profile_insert();

-- Comentário para documentação
COMMENT ON FUNCTION create_user_settings_on_profile_insert() IS 
  'Função que cria automaticamente configurações padrão (100 leads/dia, 20 instâncias) quando um novo usuário é criado';

COMMENT ON TRIGGER trigger_create_user_settings ON profiles IS 
  'Trigger que executa após inserção de novo usuário para criar user_settings automaticamente';

