'use client';

import { useEffect } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { usePathname } from 'next/navigation';
import { getTutorialStepsForPage, tutorialSteps } from '@/lib/tutorial-steps';
import TutorialOverlay from './TutorialOverlay';

/**
 * Componente que inicializa o tutorial automaticamente baseado em tutorial_acess
 * e filtra os steps baseado na página atual
 */
export default function TutorialInitializer() {
  const { setSteps, startTutorial, isActive } = useTutorial();
  const pathname = usePathname();

  useEffect(() => {
    // Mapeia rotas para páginas do tutorial
    const routeToPageMap: Record<string, string> = {
      '/': 'dashboard',
      '/instances': 'instancias',
      '/add-to-group': 'adicionar-grupo',
      '/contacts': 'contatos-ativos',
      '/import-contacts': 'importar-contatos',
    };

    const currentPage = routeToPageMap[pathname] as 'dashboard' | 'instancias' | 'adicionar-grupo' | 'contatos-ativos' | 'importar-contatos' | undefined;

    if (!currentPage) {
      return;
    }

    // Filtra steps para a página atual
    const pageSteps = getTutorialStepsForPage(currentPage);
    setSteps(pageSteps);
  }, [pathname, setSteps]);

  useEffect(() => {
    // Verifica se deve iniciar o tutorial automaticamente
    const checkAndStartTutorial = async () => {
      if (isActive) return; // Já está ativo

      try {
        const userId = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
        if (!userId) return;

        const response = await fetch('/api/user/tutorial-access', {
          headers: {
            'X-User-Id': userId,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const tutorialAcess = data.data?.tutorial_acess ?? false;

          // Se tutorial_acess === false, inicia o tutorial
          if (!tutorialAcess) {
            // Aguarda um pouco para garantir que a página carregou
            setTimeout(() => {
              startTutorial();
            }, 1000);
          }
        }
      } catch (error) {
        console.error('Erro ao verificar tutorial_acess:', error);
      }
    };

    checkAndStartTutorial();
  }, [isActive, startTutorial]);

  return <TutorialOverlay />;
}

