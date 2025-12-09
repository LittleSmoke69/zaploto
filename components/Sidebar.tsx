'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Rocket,
  Users,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  LogOut,
} from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';

interface SidebarProps {
  onSignOut?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onSignOut }) => {
  const pathname = usePathname();
  const { isMobileOpen, setIsMobileOpen, isCollapsed, setIsCollapsed } = useSidebar();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (typeof window === 'undefined') return;
      
      const userId = sessionStorage.getItem('user_id') || 
                     sessionStorage.getItem('profile_id') || 
                     window.localStorage.getItem('profile_id');
      
      if (!userId) {
        setIsAdmin(false);
        return;
      }

      try {
        const response = await fetch('/api/admin/check', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
          },
          credentials: 'include',
        });

        if (response.ok) {
          const result = await response.json();
          setIsAdmin(result.success && result.data?.isAdmin === true);
        }
      } catch (error) {
        console.error('Erro ao verificar admin:', error);
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, []);

  const menuItems = [
    {
      href: '/',
      icon: LayoutDashboard,
      label: 'Dashboard',
    },
    {
      href: '/instances',
      icon: MessageSquare,
      label: 'Instâncias WhatsApp',
    },
    {
      href: '/add-to-group',
      icon: Rocket,
      label: 'Adição em Grupo',
    },
    {
      href: '/contacts',
      icon: Users,
      label: 'Contatos Ativos',
    },
    {
      href: '/import-contacts',
      icon: Plus,
      label: 'Importar Contatos',
    },
    // Link para admin apenas se for admin
    ...(isAdmin ? [{
      href: '/admin',
      icon: Shield,
      label: 'Painel Admin',
    }] : []),
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-full bg-white shadow-lg z-40
          transform transition-all duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
          w-64
          ${!isMobileOpen && isCollapsed ? 'lg:w-20' : 'lg:w-64'}
          flex flex-col
        `}
        data-collapsed={isCollapsed}
      >
        {/* Logo e Botão de Toggle */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {(isMobileOpen || !isCollapsed) && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-gray-800">ZAP</span>
              <span className="text-xl font-bold text-emerald-500">LOTO</span>
            </div>
          )}
          {!isMobileOpen && isCollapsed && (
            <div className="flex items-center justify-center w-full">
              <span className="text-lg font-bold text-emerald-500">Z</span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition text-gray-600"
            aria-label="Toggle sidebar"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-2 space-y-1 flex-1 flex flex-col">
          <div className="flex-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200
                    ${isMobileOpen ? '' : isCollapsed ? 'justify-center' : ''}
                    ${
                      active
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                  title={isMobileOpen ? undefined : isCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {(isMobileOpen || !isCollapsed) && (
                    <span className="font-medium whitespace-nowrap">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
          
          {/* Botão Sair no final da sidebar */}
          {onSignOut && (
            <div className="mt-auto pt-4 pb-2 border-t border-gray-200">
              <button
                onClick={() => {
                  setIsMobileOpen(false);
                  onSignOut();
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200
                  ${isMobileOpen ? '' : isCollapsed ? 'justify-center' : ''}
                  text-white bg-red-600 hover:bg-red-700 shadow-md
                `}
                title={isMobileOpen ? undefined : isCollapsed ? 'Sair' : undefined}
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                {(isMobileOpen || !isCollapsed) && (
                  <span className="font-medium whitespace-nowrap">Sair</span>
                )}
              </button>
            </div>
          )}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
