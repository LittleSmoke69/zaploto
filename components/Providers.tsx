'use client';

import React from 'react';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { TutorialProvider } from '@/contexts/TutorialContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <TutorialProvider>
        {children}
      </TutorialProvider>
    </SidebarProvider>
  );
}

