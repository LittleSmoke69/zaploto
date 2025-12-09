import { TutorialStep } from '@/contexts/TutorialContext';

export const tutorialSteps: TutorialStep[] = [
  // Dashboard
  {
    id: 'dashboard-resumo',
    page: 'dashboard',
    target: 'dashboard-resumo',
    title: 'Resumo dos resultados',
    description: 'Aqui você acompanha um resumo rápido dos seus números: grupos, contatos e desempenho geral das campanhas.',
  },
  {
    id: 'dashboard-acoes-rapidas',
    page: 'dashboard',
    target: 'dashboard-acoes-rapidas',
    title: 'Ações rápidas',
    description: 'Use esses atalhos para ir direto para as tarefas mais importantes, como criar campanhas e gerenciar instâncias.',
  },
  {
    id: 'dashboard-instancias-sucesso',
    page: 'dashboard',
    target: 'dashboard-instancias-sucesso',
    title: 'Instâncias e taxa de sucesso',
    description: 'Aqui você enxerga suas instâncias conectadas e o desempenho das adições em grupos.',
  },

  // Instâncias WhatsApp
  {
    id: 'instancias-criar',
    page: 'instancias',
    target: 'instancias-criar',
    title: 'Criar nova instância',
    description: 'Clique aqui para conectar um número WhatsApp via QRCode e usá-lo nas campanhas.',
  },
  {
    id: 'instancias-gerenciar-grupos',
    page: 'instancias',
    target: 'instancias-gerenciar-grupos',
    title: 'Gerenciar grupos da instância',
    description: 'Use este card para visualizar e organizar os grupos dessa instância.',
  },
  {
    id: 'instancias-marcar-grupos',
    page: 'instancias',
    target: 'instancias-marcar-grupos',
    title: 'Selecionar grupos',
    description: 'Aqui você vê os grupos extraídos e pode marcar quais serão usados. Quando marcado, o grupo fica em destaque (verde).',
  },
  {
    id: 'instancias-carregar-grupos',
    page: 'instancias',
    target: 'instancias-carregar-grupos',
    title: 'Carregar grupos da instância',
    description: 'Clique para carregar os grupos dessa instância e preparar para extração ou campanhas.',
  },
  {
    id: 'instancias-extrair-contatos',
    page: 'instancias',
    target: 'instancias-extrair-contatos',
    title: 'Extrair contatos do grupo',
    description: 'Depois de marcar os grupos, use este card para extrair os contatos dessas conversas.',
  },
  {
    id: 'instancias-lista-contatos',
    page: 'instancias',
    target: 'instancias-lista-contatos',
    title: 'Lista de contatos extraídos',
    description: 'Aqui aparecem os contatos extraídos. Você também pode baixar tudo em CSV.',
  },
  {
    id: 'instancias-conectadas',
    page: 'instancias',
    target: 'instancias-conectadas',
    title: 'Instâncias conectadas',
    description: 'Esta seção mostra todas as instâncias conectadas e o status de cada uma.',
  },

  // Adição em Grupo
  {
    id: 'adicao-configuracao',
    page: 'adicionar-grupo',
    target: 'adicao-configuracao',
    title: 'Configuração da campanha',
    description: 'Aqui você escolhe instância(s), grupo, quantidade de leads e o tempo entre os envios. É o cérebro da sua campanha.',
  },
  {
    id: 'adicao-multiplas-instancias',
    page: 'adicionar-grupo',
    target: 'adicao-multiplas-instancias',
    title: 'Múltiplas instâncias',
    description: 'Use este botão para distribuir a adição em grupo por vários números, evitando bloqueios e limites.',
  },
  {
    id: 'adicao-tempo-random',
    page: 'adicionar-grupo',
    target: 'adicao-tempo-random',
    title: 'Controle e randomização do tempo',
    description: 'Defina o intervalo e use o random time para deixar os envios mais naturais e seguros.',
  },
  {
    id: 'adicao-concorrencia',
    page: 'adicionar-grupo',
    target: 'adicao-concorrencia',
    title: 'Concorrência de envios',
    description: 'Aqui você define quantos envios vão rodar em paralelo. Ajuste com cuidado para equilibrar velocidade e segurança.',
  },
  {
    id: 'adicao-controle-campanha',
    page: 'adicionar-grupo',
    target: 'adicao-controle-campanha',
    title: 'Iniciar e pausar campanhas',
    description: 'Use estes botões para iniciar ou pausar sua campanha de adição em massa.',
  },
  {
    id: 'adicao-campanhas-ativas',
    page: 'adicionar-grupo',
    target: 'adicao-campanhas-ativas',
    title: 'Campanhas em andamento',
    description: 'Este card mostra as campanhas que estão rodando agora, com status e progresso.',
  },
  {
    id: 'adicao-historico',
    page: 'adicionar-grupo',
    target: 'adicao-historico',
    title: 'Histórico de campanhas',
    description: 'Veja aqui as campanhas que já rodaram, resultados e métricas.',
  },

  // Contatos Ativos
  {
    id: 'contatos-lista',
    page: 'contatos-ativos',
    target: 'contatos-lista',
    title: 'Contatos ativos',
    description: 'Aqui ficam os contatos que você já importou para usar nas campanhas de adição.',
  },
  {
    id: 'contatos-selecionar-instancia',
    page: 'contatos-ativos',
    target: 'contatos-selecionar-instancia',
    title: 'Selecionar instância',
    description: 'Escolha a instância de onde você quer puxar novos contatos.',
  },
  {
    id: 'contatos-carregar-grupos',
    page: 'contatos-ativos',
    target: 'contatos-carregar-grupos',
    title: 'Carregar grupos',
    description: 'Carregue os grupos dessa instância para visualizar e extrair contatos.',
  },
  {
    id: 'contatos-extrair',
    page: 'contatos-ativos',
    target: 'contatos-extrair',
    title: 'Extrair contatos',
    description: 'Extraia contatos dos grupos selecionados e mantenha sua base sempre atualizada.',
  },

  // Importar Contatos
  {
    id: 'importar-upload',
    page: 'importar-contatos',
    target: 'importar-upload',
    title: 'Importar contatos via CSV',
    description: 'Envie aqui seu arquivo CSV com até 10.000 linhas para usar esses contatos nas campanhas de adição em massa.',
  },
  {
    id: 'importar-regras',
    page: 'importar-contatos',
    target: 'importar-regras',
    title: 'Regras do arquivo',
    description: 'O campo de telefone é obrigatório (telefone, phone, phone_number, number...). Nome é opcional, mas recomendado.',
  },
  {
    id: 'importar-exemplo',
    page: 'importar-contatos',
    target: 'importar-exemplo',
    title: 'Formato recomendado',
    description: 'Use números com DDD, como 81999998888, para evitar erros na hora de adicionar aos grupos.',
  },
];

/**
 * Filtra os steps do tutorial baseado na página atual
 */
export function getTutorialStepsForPage(page: TutorialStep['page']): TutorialStep[] {
  return tutorialSteps.filter((step) => step.page === page);
}

