'use client';

import React, { useState, useEffect } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  UserPlus,
  Settings,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Calendar,
  ChevronDown,
} from 'lucide-react';

interface AdminStats {
  overview: {
    totalUsers: number;
    totalCampaigns: number;
    totalContacts: number;
    totalInstances: number;
    totalGroups: number;
  };
  campaigns: {
    total: number;
    running: number;
    paused: number;
    completed: number;
    failed: number;
    totalProcessed: number;
    totalFailed: number;
    totalAdded: number;
    successRate: number;
  };
  instances: {
    total: number;
    connected: number;
    disconnected: number;
  };
  contacts: {
    total: number;
    pending: number;
    added: number;
    sent: number;
  };
}

interface User {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  settings: {
    max_leads_per_day: number;
    max_instances: number;
    is_admin: boolean;
    is_active: boolean;
  };
  stats: {
    campaigns: number;
    instances: number;
    contacts: number;
    processed: number;
    failed: number;
  };
}

interface Campaign {
  id: string;
  user_id: string;
  group_id: string;
  group_subject: string | null;
  status: string;
  processed_contacts: number;
  failed_contacts: number;
  created_at: string;
  profiles?: {
    email: string;
    full_name: string | null;
  };
}

const AdminDashboard = () => {
  const { checking } = useRequireAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'campaigns' | 'settings'>('overview');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id =
      sessionStorage.getItem('user_id') ||
      sessionStorage.getItem('profile_id') ||
      window.localStorage.getItem('profile_id');
    setUserId(id);
  }, []);

  useEffect(() => {
    if (userId) {
      checkAdminAndLoad();
    }
  }, [userId]);

  const checkAdminAndLoad = async () => {
    if (!userId) return;
    
    try {
      // Verifica se é admin através da API (evita erro 406 do Supabase)
      const response = await fetch('/api/admin/check', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const result = await response.json();
      
      if (!result.success || !result.data?.isAdmin) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      await loadData();
    } catch (error) {
      console.error('Erro ao verificar admin:', error);
      setIsAdmin(false);
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats', {
          headers: { 'X-User-Id': userId! },
        }),
        fetch('/api/admin/users', {
          headers: { 'X-User-Id': userId! },
        }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  if (checking || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Acesso Negado</h1>
          <p className="text-gray-600">Você não tem permissão para acessar esta área.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg fixed left-0 top-0 h-full z-10">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">Z</span>
            </div>
            <span className="font-bold text-gray-800">ZAPLOTO</span>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          <button
            onClick={() => setActiveSection('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeSection === 'overview'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveSection('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeSection === 'users'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Usuários</span>
          </button>

          <button
            onClick={() => setActiveSection('campaigns')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeSection === 'campaigns'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span>Campanhas</span>
          </button>

          <button
            onClick={() => setActiveSection('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              activeSection === 'settings'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Configurações</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-gray-600 mt-1">Painel Administrativo</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50">
            <Calendar className="w-4 h-4" />
            <span>Últimos 7 dias</span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {activeSection === 'overview' && stats && (
          <div className="space-y-6">
            {/* Métricas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <MetricCard
                title="Mensagens Enviadas"
                value={stats.contacts.sent}
                icon={<MessageSquare className="w-6 h-6" />}
                bgColor="bg-emerald-600"
              />
              <MetricCard
                title="Adicionados ao Grupo"
                value={stats.contacts.added}
                icon={<UserPlus className="w-6 h-6" />}
                bgColor="bg-emerald-600"
              />
              <MetricCard
                title="Pendentes"
                value={stats.contacts.pending}
                icon={<Clock className="w-6 h-6" />}
                bgColor="bg-gray-400"
              />
              <MetricCard
                title="Instâncias Conectadas"
                value={stats.instances.connected}
                icon={<CheckCircle2 className="w-6 h-6" />}
                bgColor="bg-emerald-600"
              />
              <MetricCard
                title="Disparos com Falha"
                value={stats.campaigns.failed}
                icon={<XCircle className="w-6 h-6" />}
                bgColor="bg-gray-400"
              />
              <MetricCard
                title="Falhas ao Adicionar"
                value={stats.campaigns.totalFailed}
                icon={<AlertCircle className="w-6 h-6" />}
                bgColor="bg-gray-400"
              />
            </div>

            {/* Gráficos e Listas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Mensagens Enviadas e Adição aos Grupos
                </h2>
                <div className="h-64 flex items-center justify-center text-gray-400">
                  Gráfico de linha (implementar com biblioteca de gráficos)
                </div>
              </div>

              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Sucesso de Adição aos Grupos
                </h2>
                <div className="text-center">
                  <div className="text-5xl font-bold text-emerald-600 mb-4">
                    {stats.campaigns.successRate}%
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-emerald-600 h-4 rounded-full transition-all"
                      style={{ width: `${stats.campaigns.successRate}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Listas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">Lista de Instâncias</h2>
                  <button className="text-emerald-600 text-sm font-medium">Ver todas</button>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: Math.min(5, stats.instances.total) }, (_, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                      <div className="font-medium text-gray-800">Instância {String(i + 1).padStart(2, '0')}</div>
                      <div className="text-sm text-gray-500">XXXXXX</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">Grupos Salvos no Banco</h2>
                  <button className="text-emerald-600 text-sm font-medium">Ver todas</button>
                </div>
                <div className="text-3xl font-bold text-gray-800">{stats.overview.totalGroups}</div>
              </div>

              <div className="bg-white rounded-xl shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">Grupos da API (Evolution)</h2>
                  <button className="text-emerald-600 text-sm font-medium">Ver todas</button>
                </div>
                <div className="text-3xl font-bold text-gray-800">{stats.overview.totalGroups}</div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'users' && (
          <UsersSection users={users} onUserSelect={setSelectedUser} selectedUser={selectedUser} />
        )}

        {activeSection === 'campaigns' && <CampaignsSection userId={userId} />}

        {activeSection === 'settings' && <SettingsSection />}
      </main>
    </div>
  );
};

const MetricCard = ({ title, value, icon, bgColor }: any) => (
  <div className="bg-white rounded-xl shadow p-6">
    <div className="flex items-center justify-between mb-4">
      <div className={`${bgColor} p-3 rounded-lg text-white`}>{icon}</div>
    </div>
    <div className="text-2xl font-bold text-gray-800 mb-1">{value}</div>
    <div className="text-sm text-gray-600">{title}</div>
  </div>
);

const UsersSection = ({ 
  users, 
  onUserSelect, 
  selectedUser 
}: { 
  users: User[]; 
  onUserSelect: (userId: string | null) => void; 
  selectedUser: string | null;
}) => {
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [maxLeads, setMaxLeads] = useState(100);
  const [maxInstances, setMaxInstances] = useState(20);
  const [saving, setSaving] = useState(false);

  const handleEdit = (user: User) => {
    setEditingUser(user.id);
    setMaxLeads(user.settings.max_leads_per_day);
    setMaxInstances(user.settings.max_instances);
  };

  const handleCancel = () => {
    setEditingUser(null);
  };

  const handleSave = async (userId: string) => {
    const currentUserId = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
    if (!currentUserId) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUserId,
        },
        body: JSON.stringify({
          targetUserId: userId,
          maxLeadsPerDay: maxLeads,
          maxInstances: maxInstances,
        }),
      });

      if (res.ok) {
        setEditingUser(null);
        window.location.reload();
      } else {
        const error = await res.json();
        alert(`Erro ao salvar: ${error.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Gerenciar Usuários</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left p-4 text-gray-700">Usuário</th>
              <th className="text-left p-4 text-gray-700">Leads/Dia</th>
              <th className="text-left p-4 text-gray-700">Instâncias</th>
              <th className="text-left p-4 text-gray-700">Campanhas</th>
              <th className="text-left p-4 text-gray-700">Contatos</th>
              <th className="text-left p-4 text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user: User) => (
              <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-4">
                  <div>
                    <div className="font-medium text-gray-800">{user.email}</div>
                    <div className="text-sm text-gray-500">{user.full_name || 'Sem nome'}</div>
                  </div>
                </td>
                <td className="p-4">
                  {editingUser === user.id ? (
                    <input
                      type="number"
                      value={maxLeads}
                      onChange={(e) => setMaxLeads(Number(e.target.value))}
                      className="w-20 px-2 py-1 border rounded"
                    />
                  ) : (
                    <span>{user.settings.max_leads_per_day}</span>
                  )}
                </td>
                <td className="p-4">
                  {editingUser === user.id ? (
                    <input
                      type="number"
                      value={maxInstances}
                      onChange={(e) => setMaxInstances(Number(e.target.value))}
                      className="w-20 px-2 py-1 border rounded"
                    />
                  ) : (
                    <span>{user.settings.max_instances}</span>
                  )}
                </td>
                <td className="p-4">{user.stats.campaigns}</td>
                <td className="p-4">{user.stats.contacts}</td>
                <td className="p-4">
                  {editingUser === user.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSave(user.id)}
                        disabled={saving}
                        className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleEdit(user)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Editar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CampaignsSection = ({ userId }: { userId: string | null }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadCampaigns();
    }
  }, [userId]);

  const loadCampaigns = async () => {
    if (!userId) return;
    
    try {
      const res = await fetch('/api/admin/campaigns', {
        headers: { 'X-User-Id': userId },
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar campanhas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="bg-white rounded-xl shadow p-6">Carregando...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">Todas as Campanhas</h2>
        <button
          onClick={loadCampaigns}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left p-4 text-gray-700">ID</th>
              <th className="text-left p-4 text-gray-700">Usuário</th>
              <th className="text-left p-4 text-gray-700">Grupo</th>
              <th className="text-left p-4 text-gray-700">Status</th>
              <th className="text-left p-4 text-gray-700">Processados</th>
              <th className="text-left p-4 text-gray-700">Falhas</th>
              <th className="text-left p-4 text-gray-700">Criada em</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  Nenhuma campanha encontrada
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 text-sm text-gray-600">{campaign.id.substring(0, 8)}...</td>
                  <td className="p-4">{campaign.profiles?.email || 'N/A'}</td>
                  <td className="p-4">{campaign.group_subject || campaign.group_id}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        campaign.status === 'running'
                          ? 'bg-emerald-100 text-emerald-800'
                          : campaign.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : campaign.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : campaign.status === 'paused'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="p-4">{campaign.processed_contacts}</td>
                  <td className="p-4">{campaign.failed_contacts}</td>
                  <td className="p-4 text-sm text-gray-600">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SettingsSection = () => {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">Configurações do Sistema</h2>
      <p className="text-gray-600">Configurações gerais do sistema serão implementadas aqui.</p>
    </div>
  );
};

export default AdminDashboard;

