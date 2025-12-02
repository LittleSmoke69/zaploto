'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  Rocket,
  Users,
  Plus,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  onSignOut?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onSignOut }) => {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true); // Por padrão colapsada

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
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(href);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md hover:bg-gray-100 transition"
        aria-label="Toggle menu"
      >
        {isMobileOpen ? (
          <X className="w-6 h-6 text-gray-700" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700" />
        )}
      </button>

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
          ${isCollapsed ? 'w-20' : 'w-64'}
        `}
        data-collapsed={isCollapsed}
      >
        {/* Logo e Botão de Toggle */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-gray-800">ZAP</span>
              <span className="text-xl font-bold text-emerald-500">LOTO</span>
            </div>
          )}
          {isCollapsed && (
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
        <nav className="p-2 space-y-1">
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
                  ${isCollapsed ? 'justify-center' : ''}
                  ${
                    active
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!isCollapsed && (
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
