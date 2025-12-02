'use client';

import React from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import Layout from '@/components/Layout';
import DashboardStats from '@/components/Dashboard/DashboardStats';
import InstanceList from '@/components/Dashboard/InstanceList';
import SuccessRate from '@/components/Dashboard/SuccessRate';
import GroupsCard from '@/components/Dashboard/GroupsCard';
import ChartCard from '@/components/Dashboard/ChartCard';
import ActiveCampaigns from '@/components/Campaigns/ActiveCampaigns';
import { useDashboardData, Campaign } from '@/hooks/useDashboardData';
import { CheckCircle2, AlertCircle, Info, X, LogOut } from 'lucide-react';
import Link from 'next/link';

const Dashboard = () => {
  const { checking } = useRequireAuth();
  const {
    userId,
    instances,
    dbGroups,
    availableGroups,
    campaigns,
    kpiSent,
    kpiAdded,
    kpiPending,
    kpiConnected,
    kpiFailedSends,
    kpiFailedAdds,
    chartData,
    toasts,
    showToast,
    setToasts,
    setCampaigns,
    loadInitialData,
  } = useDashboardData();

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('user_id');
      sessionStorage.removeItem('profile_id');
      window.localStorage.removeItem('profile_id');
      document.cookie = 'user_id=; Path=/; Max-Age=0; SameSite=Lax';
    }
    window.location.href = '/login';
  };

  if (checking || userId === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 text-center">
          <p className="text-gray-700 font-medium">Preparando seu ambiente...</p>
        </div>
      </div>
    );
  }

  // Calcular taxa de sucesso
  const successRate = kpiAdded + kpiFailedAdds > 0 
    ? Math.round((kpiAdded / (kpiAdded + kpiFailedAdds)) * 100) 
    : 0;

  // Contar grupos salvos
  const savedGroupsCount = dbGroups.length;
  const apiGroupsCount = availableGroups.length;

  // Funções para gerenciar campanhas
  const handlePauseCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      });
      const data = await response.json();
      if (data.success) {
        showToast('Campanha pausada com sucesso', 'success');
        loadInitialData();
      } else {
        showToast(data.message || 'Erro ao pausar campanha', 'error');
      }
    } catch (error) {
      showToast('Erro ao pausar campanha', 'error');
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'running' }),
      });
      const data = await response.json();
      if (data.success) {
        showToast('Campanha retomada com sucesso', 'success');
        loadInitialData();
      } else {
        showToast(data.message || 'Erro ao retomar campanha', 'error');
      }
    } catch (error) {
      showToast('Erro ao retomar campanha', 'error');
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        showToast('Campanha excluída com sucesso', 'success');
        loadInitialData();
      } else {
        showToast(data.message || 'Erro ao excluir campanha', 'error');
      }
    } catch (error) {
      showToast('Erro ao excluir campanha', 'error');
    }
  };

  return (
    <Layout onSignOut={handleSignOut}>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 min-w-[320px] px-6 py-4 rounded-lg shadow-lg text-white transform transition-all duration-300 ease-out ${
              toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-amber-500'
            }`}
            style={{ animation: 'slideIn 0.3s ease-out' }}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            {toast.type === 'info' && <Info className="w-5 h-5 flex-shrink-0" />}
            <p className="flex-1 font-medium">{toast.message}</p>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="hover:bg-white/20 rounded p-1 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>

      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Dashboard</h1>
            <p className="text-gray-600">Visão geral do seu sistema</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition shadow-md hover:shadow-lg"
            title="Sair da conta"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>

        {/* KPIs */}
        <DashboardStats
          kpiSent={kpiSent}
          kpiAdded={kpiAdded}
          kpiPending={kpiPending}
          kpiConnected={kpiConnected}
          kpiFailedSends={kpiFailedSends}
          kpiFailedAdds={kpiFailedAdds}
        />

        {/* Gráficos e Listas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <InstanceList 
            instances={instances} 
            onViewAll={() => window.location.href = '/instances'}
          />
          <ChartCard 
            title="Mensagens Enviadas e Adição aos Grupos"
            subtitle="(+5) mais em 2025"
            data={chartData}
          />
        </div>

        {/* Cards Inferiores */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SuccessRate rate={successRate} />
          <GroupsCard 
            title="Grupos Salvos no Banco" 
            count={savedGroupsCount}
            onViewAll={() => window.location.href = '/instances'}
          />
          <GroupsCard 
            title="Grupos da API(Evolution)" 
            count={apiGroupsCount}
            onViewAll={() => window.location.href = '/instances'}
          />
        </div>

        {/* Campanhas Ativas */}
        <ActiveCampaigns
          campaigns={campaigns}
          onPause={handlePauseCampaign}
          onResume={handleResumeCampaign}
          onDelete={handleDeleteCampaign}
        />

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Ações Rápidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/instances"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition text-center"
            >
              <div className="text-2xl mb-2">📱</div>
              <div className="font-medium text-gray-800">Gerenciar Instâncias</div>
            </Link>
            <Link
              href="/add-to-group"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition text-center"
            >
              <div className="text-2xl mb-2">🚀</div>
              <div className="font-medium text-gray-800">Adicionar ao Grupo</div>
            </Link>
            <Link
              href="/contacts"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition text-center"
            >
              <div className="text-2xl mb-2">👥</div>
              <div className="font-medium text-gray-800">Ver Contatos</div>
            </Link>
            <Link
              href="/import-contacts"
              className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 transition text-center"
            >
              <div className="text-2xl mb-2">➕</div>
              <div className="font-medium text-gray-800">Importar Contatos</div>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
