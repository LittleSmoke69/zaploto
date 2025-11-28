# Painel Administrativo - Configuração

## 📋 Passos para Configurar o Painel Admin

### 1. Criar Tabela de Configurações de Usuários

Execute no SQL Editor do Supabase:

```sql
-- Execute o arquivo: create_user_settings_table.sql
```

### 2. Criar Trigger Automático

Execute no SQL Editor do Supabase:

```sql
-- Execute o arquivo: create_user_settings_trigger.sql
```

Este trigger cria automaticamente as configurações padrão (100 leads/dia, 20 instâncias) sempre que um novo usuário for criado na tabela `profiles`.

**Importante:** O trigger funciona automaticamente para todos os novos usuários. O código de registro também cria as configurações como fallback caso o trigger não esteja ativo.

### 3. Inicializar Configurações para Usuários Existentes

Execute no SQL Editor do Supabase:

```sql
-- Execute o arquivo: init_user_settings.sql
```

Isso criará configurações padrão (100 leads/dia, 20 instâncias) para todos os usuários existentes que ainda não têm configurações.

### 3. Tornar um Usuário Administrador

Para tornar um usuário admin, execute:

```sql
-- Opção 1: Se o usuário já tem configurações
UPDATE user_settings 
SET is_admin = true, updated_at = NOW()
WHERE user_id = '<user-id>';

-- Opção 2: Se o usuário não tem configurações (cria e torna admin)
INSERT INTO user_settings (user_id, max_leads_per_day, max_instances, is_admin, is_active)
VALUES ('<user-id>', 100, 20, true, true)
ON CONFLICT (user_id) DO UPDATE SET is_admin = true, updated_at = NOW();
```

**Ou use o arquivo pronto:** `grant_admin.sql` (edite o user_id no arquivo)

### 4. Acessar o Painel Admin

1. Faça login com uma conta de administrador
2. Acesse: `http://localhost:3000/admin`
3. O sistema verificará automaticamente se você é admin

## 🎯 Funcionalidades do Painel Admin

### Dashboard (Visão Geral)
- Métricas gerais do sistema
- Total de usuários, campanhas, contatos, instâncias
- Gráficos de mensagens e adições
- Taxa de sucesso

### Usuários
- Lista todos os usuários
- Visualiza estatísticas por usuário
- Edita limites personalizados:
  - Máximo de leads por dia
  - Máximo de instâncias
- Visualiza campanhas, contatos e instâncias de cada usuário

### Campanhas
- Lista todas as campanhas do sistema
- Filtra por status (running, paused, completed, failed)
- Filtra por usuário
- Visualiza detalhes completos de cada campanha

### Configurações
- Configurações gerais do sistema (em desenvolvimento)

## ⚙️ Configurações Padrão

- **Leads por dia**: 100 (configurável por usuário)
- **Instâncias máximas**: 20 (configurável por usuário)
- **Status padrão**: Ativo para todos os usuários

## 🔐 Segurança

- Apenas usuários com `is_admin = true` podem acessar o painel
- Todas as APIs verificam permissão de admin
- Dados são filtrados por usuário quando necessário

## 📊 Métricas Disponíveis

### Visão Geral
- Total de usuários
- Total de campanhas
- Total de contatos
- Total de instâncias
- Total de grupos
- Campanhas em execução
- Campanhas pausadas
- Taxa de sucesso

### Por Usuário
- Número de campanhas
- Número de instâncias
- Número de contatos
- Leads processados
- Leads com falha
- Limites configurados

