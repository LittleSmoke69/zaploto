'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useTutorial } from '@/contexts/TutorialContext';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const TutorialOverlay: React.FC = () => {
  const { isActive, currentStep, steps, nextStep, prevStep, skipTutorial, finishTutorial } = useTutorial();
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' | 'left' | 'right' } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStepData = steps[currentStep];

  useEffect(() => {
    if (!isActive || !currentStepData) {
      setTargetElement(null);
      setTooltipPosition(null);
      return;
    }

    // Aguarda um pouco para garantir que o DOM está renderizado
    const timer = setTimeout(() => {
      const element = document.querySelector(`[data-tour-id="${currentStepData.target}"]`) as HTMLElement;
      
      if (element) {
        setTargetElement(element);
        calculateTooltipPosition(element);
        scrollToElement(element);
      } else {
        console.warn(`Elemento não encontrado: ${currentStepData.target}`);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isActive, currentStep, currentStepData]);

  const calculateTooltipPosition = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const spacing = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let placement: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
    let top = 0;
    let left = 0;

    // Verifica espaço disponível em cada direção
    const spaceTop = rect.top;
    const spaceBottom = viewportHeight - rect.bottom;
    const spaceLeft = rect.left;
    const spaceRight = viewportWidth - rect.right;

    // Desktop: tenta colocar ao lado ou acima/abaixo
    if (viewportWidth >= 768) {
      if (spaceRight >= tooltipWidth + spacing) {
        // Lado direito
        placement = 'right';
        top = scrollY + rect.top + rect.height / 2 - tooltipHeight / 2;
        left = scrollX + rect.right + spacing;
      } else if (spaceLeft >= tooltipWidth + spacing) {
        // Lado esquerdo
        placement = 'left';
        top = scrollY + rect.top + rect.height / 2 - tooltipHeight / 2;
        left = scrollX + rect.left - tooltipWidth - spacing;
      } else if (spaceBottom >= tooltipHeight + spacing) {
        // Abaixo
        placement = 'bottom';
        top = scrollY + rect.bottom + spacing;
        left = scrollX + rect.left + rect.width / 2 - tooltipWidth / 2;
      } else if (spaceTop >= tooltipHeight + spacing) {
        // Acima
        placement = 'top';
        top = scrollY + rect.top - tooltipHeight - spacing;
        left = scrollX + rect.left + rect.width / 2 - tooltipWidth / 2;
      } else {
        // Fallback: centro da tela
        placement = 'bottom';
        top = scrollY + viewportHeight / 2 - tooltipHeight / 2;
        left = scrollX + viewportWidth / 2 - tooltipWidth / 2;
      }
    } else {
      // Mobile: sempre acima ou abaixo
      if (spaceBottom >= tooltipHeight + spacing) {
        placement = 'bottom';
        top = scrollY + rect.bottom + spacing;
        left = scrollX + Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2);
      } else {
        placement = 'top';
        top = scrollY + rect.top - tooltipHeight - spacing;
        left = scrollX + Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2);
      }

      // Garante que não saia da tela
      left = Math.max(16, Math.min(left, viewportWidth - tooltipWidth - 16));
    }

    setTooltipPosition({ top, left, placement });
  };

  const scrollToElement = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const scrollY = window.scrollY;
    const elementTop = rect.top + scrollY;
    const elementCenter = elementTop + rect.height / 2;
    const viewportCenter = window.innerHeight / 2;

    const targetScroll = elementCenter - viewportCenter;
    
    window.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: 'smooth',
    });
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        nextStep();
        setIsAnimating(false);
      }, 200);
    } else {
      finishTutorial();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setIsAnimating(true);
      setTimeout(() => {
        prevStep();
        setIsAnimating(false);
      }, 200);
    }
  };

  const handleSkip = () => {
    skipTutorial();
  };

  if (!isActive || !currentStepData || !targetElement || !tooltipPosition) {
    return null;
  }

  return (
    <>
      {/* Overlay escuro com desfoque */}
      <div
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleSkip}
      >
        {/* Área destacada (transparente) */}
        {targetElement && (
          <div
            className="absolute border-4 border-transparent"
            style={{
              top: `${targetElement.getBoundingClientRect().top - 4}px`,
              left: `${targetElement.getBoundingClientRect().left - 4}px`,
              width: `${targetElement.getBoundingClientRect().width + 8}px`,
              height: `${targetElement.getBoundingClientRect().height + 8}px`,
            }}
          />
        )}
      </div>

      {/* Destaque no elemento alvo */}
      {targetElement && (
        <div
          className="fixed z-[9999] pointer-events-none transition-all duration-300"
          style={{
            top: `${targetElement.getBoundingClientRect().top + window.scrollY - 4}px`,
            left: `${targetElement.getBoundingClientRect().left + window.scrollX - 4}px`,
            width: `${targetElement.getBoundingClientRect().width + 8}px`,
            height: `${targetElement.getBoundingClientRect().height + 8}px`,
            boxShadow: '0 0 0 4px rgba(16, 185, 129, 0.5), 0 0 0 8px rgba(16, 185, 129, 0.3)',
            borderRadius: '8px',
            animation: 'pulse 2s infinite',
          }}
        />
      )}

      {/* Balão do tutorial */}
      <div
        ref={tooltipRef}
        className={`fixed z-[10000] bg-white rounded-xl shadow-2xl p-6 w-80 transition-all duration-300 ${
          isAnimating ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
        style={{
          top: `${tooltipPosition.top}px`,
          left: `${tooltipPosition.left}px`,
        }}
      >
        {/* Cabeçalho com X */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">{currentStepData.title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{currentStepData.description}</p>
          </div>
          <button
            onClick={handleSkip}
            className="ml-4 p-1 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            aria-label="Fechar tutorial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicador de progresso */}
        <div className="mb-4">
          <div className="flex items-center gap-1 mb-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  index === currentStep
                    ? 'bg-emerald-600'
                    : index < currentStep
                    ? 'bg-emerald-300'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 text-center">
            {currentStep + 1} de {steps.length}
          </p>
        </div>

        {/* Botões de navegação */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              currentStep === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Voltar</span>
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <span className="text-sm font-medium">
              {currentStep === steps.length - 1 ? 'Concluir' : 'Próximo'}
            </span>
            {currentStep < steps.length - 1 && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.7;
          }
        }
      `}</style>
    </>
  );
};

export default TutorialOverlay;

