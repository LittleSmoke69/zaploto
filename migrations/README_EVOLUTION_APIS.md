# Gerenciamento de Múltiplas APIs Evolution

## 📋 Visão Geral

Este sistema permite gerenciar múltiplas APIs Evolution e atribuir usuários a diferentes APIs, permitindo maior flexibilidade e distribuição de carga.

## 🗄️ Estrutura das Tabelas

### Tabela `evolution_apis`
Armazena as configurações de cada API Evolution:
- `id`: UUID único
- `name`: Nome identificador (ex: "Evolution Principal", "Evolution Backup")
- `base_url`: URL base da API (ex: "https://evolution.m7flow.com.br/")
- `api_key`: Chave de API (Master Key)
- `is_active`: Se a API está ativa
- `description`: Descrição opcional
- `created_at` / `updated_at`: Timestamps

### Tabela `user_evolution_apis`
Relaciona usuários com APIs Evolution:
- `id`: UUID único
- `user_id`: ID do usuário (referencia `profiles.id`)
- `evolution_api_id`: ID da API Evolution
- `is_default`: Se é a API padrão para o usuário
- `created_at` / `updated_at`: Timestamps

## 🔧 Como Executar as Migrações

1. Acesse o painel do Supabase
2. Vá em **SQL Editor**
3. Execute os scripts na ordem:
   - `create_evolution_apis_table.sql`
   - `create_user_evolution_apis_table.sql`

## 📝 Exemplos de Uso

### Criar uma nova API Evolution

```sql
INSERT INTO evolution_apis (name, base_url, api_key, description)
VALUES (
  'Evolution Principal',
  'https://evolution.m7flow.com.br/',
  'SUA_API_KEY_AQUI',
  'API principal de produção'
);
```

### Atribuir uma API a um usuário

```sql
INSERT INTO user_evolution_apis (user_id, evolution_api_id, is_default)
VALUES (
  'user-uuid-aqui',
  'evolution-api-uuid-aqui',
  true
);
```

### Listar APIs de um usuário

```sql
SELECT 
  ea.name,
  ea.base_url,
  uea.is_default
FROM user_evolution_apis uea
JOIN evolution_apis ea ON ea.id = uea.evolution_api_id
WHERE uea.user_id = 'user-uuid-aqui';
```

## 🎯 Funcionalidades

- ✅ Múltiplas APIs Evolution configuráveis
- ✅ Atribuição de usuários a APIs específicas
- ✅ API padrão por usuário
- ✅ Ativação/desativação de APIs
- ✅ Gerenciamento via painel admin

