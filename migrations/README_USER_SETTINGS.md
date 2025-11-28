# Integração profiles ↔ user_settings

## 📋 Visão Geral

Quando uma nova conta é criada na tabela `profiles`, o sistema automaticamente cria uma entrada correspondente na tabela `user_settings` com as configurações padrão.

## 🔄 Como Funciona

### 1. Trigger Automático (Recomendado)

Um trigger no banco de dados (`create_user_settings_trigger.sql`) executa automaticamente após cada inserção na tabela `profiles`:

- **Quando:** Após `INSERT` na tabela `profiles`
- **O que faz:** Cria entrada em `user_settings` com valores padrão
- **Valores padrão:**
  - `max_leads_per_day`: 100
  - `max_instances`: 20
  - `is_admin`: false
  - `is_active`: true

### 2. Fallback no Código

O código de registro (`app/register/page.tsx`) também cria as configurações como fallback caso o trigger não esteja ativo ou falhe.

## 📝 Estrutura

### Tabela `profiles`
- **PK:** `id` (UUID gerado automaticamente) ou `user_id` (dependendo da estrutura)
- Campos: `id`, `user_id`, `full_name`, `email`, `password_hash`, etc.

### Tabela `user_settings`
- **PK:** `id` (UUID)
- **FK:** `user_id` → referencia `profiles.id` ou `profiles.user_id`
- Campos: `user_id`, `max_leads_per_day`, `max_instances`, `is_admin`, `is_active`

## 🔧 Configuração

### Passo 1: Criar a Tabela

```sql
-- Execute: create_user_settings_table.sql
```

### Passo 2: Criar o Trigger

```sql
-- Execute: create_user_settings_trigger.sql
```

### Passo 3: Inicializar Usuários Existentes

```sql
-- Execute: init_user_settings.sql
```

## ✅ Verificação

Para verificar se está funcionando:

```sql
-- Verifica se todos os usuários têm configurações
SELECT 
  p.id,
  p.email,
  CASE WHEN us.user_id IS NOT NULL THEN 'OK' ELSE 'FALTANDO' END as settings_status
FROM profiles p
LEFT JOIN user_settings us ON us.user_id = p.id OR us.user_id = p.user_id;
```

## 🐛 Troubleshooting

### Problema: Configurações não são criadas automaticamente

**Solução 1:** Verifique se o trigger está ativo:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'trigger_create_user_settings';
```

**Solução 2:** O código de registro cria como fallback, então mesmo sem trigger deve funcionar.

**Solução 3:** Execute manualmente para usuários existentes:
```sql
-- Execute: init_user_settings.sql
```

### Problema: Erro de foreign key

**Causa:** O `user_id` em `user_settings` não corresponde ao `id` ou `user_id` em `profiles`.

**Solução:** Verifique a estrutura da tabela `profiles` e ajuste o trigger se necessário.

## 📊 Fluxo de Criação de Usuário

```
1. Usuário preenche formulário de registro
   ↓
2. Código cria entrada em `profiles`
   ↓
3. Trigger detecta INSERT e cria `user_settings`
   ↓
4. Código também tenta criar (fallback)
   ↓
5. Usuário tem configurações padrão ativas
```

## 🔐 Segurança

- O trigger usa `ON CONFLICT DO NOTHING` para evitar duplicatas
- O código também usa `upsert` com `onConflict` para garantir idempotência
- Não há risco de criar múltiplas configurações para o mesmo usuário

