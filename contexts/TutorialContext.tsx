'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

export type TutorialPage = 'dashboard' | 'instancias' | 'adicionar-grupo' | 'contatos-ativos' | 'importar-contatos';

export interface TutorialStep {
  id: string;
  page: TutorialPage;
  target: string; // seletor baseado em data-tour-id
  title: string;
  description: string;
}

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  steps: TutorialStep[];
  startTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => Promise<void>;
  finishTutorial: () => Promise<void>;
  setSteps: (steps: TutorialStep[]) => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TutorialStep[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  // Carrega userId do sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const id = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
      setUserId(id);
    }
  }, []);

  const updateTutorialAccess = useCallback(async (value: boolean) => {
    if (!userId) return;

    try {
      const response = await fetch('/api/user/tutorial-access', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({ tutorial_acess: value }),
      });

      if (!response.ok) {
        console.error('Erro ao atualizar tutorial_acess');
      }
    } catch (error) {
      console.error('Erro ao atualizar tutorial_acess:', error);
    }
  }, [userId]);

  const startTutorial = useCallback(() => {
    setIsActive(true);
    setCurrentStep(0);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev < steps.length - 1) {
        return prev + 1;
      }
      return prev;
    });
  }, [steps.length]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const skipTutorial = useCallback(async () => {
    setIsActive(false);
    setCurrentStep(0);
    await updateTutorialAccess(true);
  }, [updateTutorialAccess]);

  const finishTutorial = useCallback(async () => {
    setIsActive(false);
    setCurrentStep(0);
    await updateTutorialAccess(true);
  }, [updateTutorialAccess]);

  return (
    <TutorialContext.Provider
      value={{
        isActive,
        currentStep,
        steps,
        startTutorial,
        nextStep,
        prevStep,
        skipTutorial,
        finishTutorial,
        setSteps,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return context;
};

