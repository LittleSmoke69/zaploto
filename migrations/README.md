# Migrações do Banco de Dados

## Tabela de Campanhas (campaigns)

### Como executar a migração

1. Acesse o painel do Supabase
2. Vá em **SQL Editor**
3. Execute o script `create_campaigns_table.sql`

Ou via CLI do Supabase:

```bash
supabase db push
```

### Estrutura da Tabela

A tabela `campaigns` armazena informações sobre as campanhas de adição de contatos a grupos do WhatsApp:

- **id**: UUID único da campanha
- **user_id**: ID do usuário que criou a campanha
- **group_id**: ID do grupo do WhatsApp
- **group_subject**: Nome do grupo (opcional)
- **status**: Status da campanha (`pending`, `running`, `completed`, `failed`, `paused`)
- **total_contacts**: Total de contatos na campanha
- **processed_contacts**: Contatos processados com sucesso
- **failed_contacts**: Contatos que falharam
- **strategy**: JSON com configurações da estratégia (delayConfig, distributionMode, concurrency, etc)
- **instances**: Array de nomes das instâncias WhatsApp utilizadas
- **created_at**: Data de criação
- **updated_at**: Data da última atualização
- **started_at**: Data de início da execução
- **completed_at**: Data de conclusão

### Status da Campanha

- `pending`: Campanha criada, aguardando processamento
- `running`: Campanha em execução
- `completed`: Campanha finalizada com sucesso
- `failed`: Campanha falhou
- `paused`: Campanha pausada

