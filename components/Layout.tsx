'use client';

import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { useSidebar } from '@/contexts/SidebarContext';
import { Menu, X } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  onSignOut?: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, onSignOut }) => {
  const [sidebarWidth, setSidebarWidth] = useState(80);
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
        className="flex-1 transition-all duration-300 min-h-screen w-full"
        style={{ 
          marginLeft: isMobile ? '0px' : `${sidebarWidth}px` 
        }}
      >
        <div className="p-4 sm:p-6 lg:p-8 w-full overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
