'use client';

import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  onSignOut?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, onSignOut }) => {
  const [sidebarWidth, setSidebarWidth] = useState(80);

  useEffect(() => {
    const updateSidebarWidth = () => {
      const sidebar = document.querySelector('aside[data-collapsed]');
      if (sidebar) {
        const isCollapsed = sidebar.getAttribute('data-collapsed') === 'true';
        setSidebarWidth(isCollapsed ? 80 : 256);
      }
    };

    // Atualiza imediatamente
    updateSidebarWidth();

    // Observa mudanças na sidebar
    const observer = new MutationObserver(updateSidebarWidth);
    const sidebar = document.querySelector('aside[data-collapsed]');
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['data-collapsed'] });
    }

    // Atualiza periodicamente também (fallback)
    const interval = setInterval(updateSidebarWidth, 100);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar onSignOut={onSignOut} />
      <main
        className="flex-1 transition-all duration-300 min-h-screen"
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
