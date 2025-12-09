'use client';

import React, { useState, useEffect } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Pagination from '@/components/Admin/Pagination';
import { useSidebar } from '@/contexts/SidebarContext';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
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
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Menu,
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
  chartData?: {
    date: string;
    mensagens: number;
    adicoes: number;
  }[];
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

interface EvolutionApi {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
  description: string | null;
  user_count: number;
}

interface UserWithApis {
  id: string;
  email: string;
  full_name: string | null;
  evolution_apis: Array<{
    id: string;
    is_default: boolean;
    evolution_apis: EvolutionApi;
  }>;
}

const AdminDashboard = () => {
  const { checking } = useRequireAuth();
  const router = useRouter();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'campaigns' | 'settings'>('overview');
  const [instances, setInstances] = useState<any[]>([]);
  const [groups, setGroups] = useState<{ dbGroups: any[]; evolutionGroups: any[] }>({ dbGroups: [], evolutionGroups: [] });
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);

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
    } else if (!checking) {
      router.push('/admin/login');
    }
  }, [userId, checking, router]);

  const checkAdminAndLoad = async () => {
    if (!userId) return;
    
    try {
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
        setTimeout(() => router.push('/admin/login'), 1000);
        return;
      }

      setIsAdmin(true);
      await loadData();
      setLoading(false);
    } catch (error) {
      console.error('Erro ao verificar admin:', error);
      setIsAdmin(false);
      setLoading(false);
      setTimeout(() => router.push('/admin/login'), 1000);
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

      // Carrega instâncias e grupos
      loadInstances();
      loadGroups();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const loadInstances = async () => {
    setLoadingInstances(true);
    try {
      const res = await fetch('/api/admin/evolution/instances', {
        headers: { 'X-User-Id': userId! },
      });
      if (res.ok) {
        const data = await res.json();
        setInstances(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
    } finally {
      setLoadingInstances(false);
    }
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch('/api/admin/evolution/groups', {
        headers: { 'X-User-Id': userId! },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups({
          dbGroups: data.data?.dbGroups || [],
          evolutionGroups: data.data?.evolutionGroups || [],
        });
      }
    } catch (error) {
      console.error('Erro ao carregar grupos:', error);
    } finally {
      setLoadingGroups(false);
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

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('user_id');
      sessionStorage.removeItem('profile_id');
      window.localStorage.removeItem('profile_id');
      document.cookie = 'user_id=; Path=/; Max-Age=0; SameSite=Lax';
    }
    router.push('/admin/login');
  };

  if (!isAdmin && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Acesso Negado</h1>
          <p className="text-gray-600 mb-4">Você não tem permissão para acessar esta área.</p>
          <button
            onClick={() => router.push('/admin/login')}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
          >
            Fazer Login Admin
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout onSignOut={handleSignOut}>
      <div className="space-y-8 w-full">
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Painel Administrativo</h1>
            <p className="text-sm sm:text-base text-gray-600">Gerenciamento completo do sistema</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <button className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50 text-sm sm:text-base">
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Últimos 7 dias</span>
              <span className="sm:hidden">7 dias</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {/* Botão Toggle da Sidebar - Apenas no mobile, no topo direito */}
            <div className="lg:hidden">
              <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition text-gray-600 shadow-md bg-white"
                aria-label="Toggle sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-2 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSection('overview')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base ${
              activeSection === 'overview'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveSection('users')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base ${
              activeSection === 'users'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Usuários</span>
          </button>

          <button
            onClick={() => setActiveSection('campaigns')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base ${
              activeSection === 'campaigns'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Campanhas</span>
          </button>

          <button
            onClick={() => setActiveSection('settings')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition text-sm sm:text-base ${
              activeSection === 'settings'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>Configurações</span>
          </button>
        </div>

        <div>
          {activeSection === 'overview' && stats && (
            <div className="space-y-6 w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 w-full">
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 w-full">
                <div className="lg:col-span-2 bg-white rounded-xl shadow p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">
                    Mensagens Enviadas e Adição aos Grupos
                  </h2>
                  <div className="h-48 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.chartData || []} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                          dataKey="date"
                          stroke="#6b7280"
                          style={{ fontSize: '12px' }}
                        />
                        <YAxis
                          stroke="#6b7280"
                          style={{ fontSize: '12px' }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '8px',
                          }}
                          labelStyle={{ color: '#374151', fontWeight: 'bold' }}
                        />
                        <Legend
                          wrapperStyle={{ paddingTop: '20px' }}
                          iconType="line"
                        />
                        <Line
                          type="monotone"
                          dataKey="mensagens"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          name="Mensagens Enviadas"
                          dot={{ fill: '#3b82f6', r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="adicoes"
                          stroke="#10b981"
                          strokeWidth={2}
                          name="Adições aos Grupos"
                          dot={{ fill: '#10b981', r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow p-4 sm:p-6">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4">
                    Sucesso de Adição aos Grupos
                  </h2>
                  <div className="text-center">
                    <div className="text-4xl sm:text-5xl font-bold text-emerald-600 mb-4">
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full">
                <div className="bg-white rounded-xl shadow p-4 sm:p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Lista de Instâncias</h2>
                    <button 
                      onClick={loadInstances}
                      className="text-emerald-600 text-sm font-medium hover:text-emerald-700"
                    >
                      Ver todas
                    </button>
                  </div>
                  {loadingInstances ? (
                    <div className="text-center py-4">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {instances.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhuma instância cadastrada</p>
                      ) : (
                        instances.slice(0, 5).map((inst, i) => (
                          <div key={inst.id || i} className="p-3 bg-gray-50 rounded-lg">
                            <div className="font-medium text-gray-800">{inst.instance_name}</div>
                            <div className="text-sm text-gray-500">
                              {inst.phone_number || 'N/A'} • {inst.status}
                              {inst.evolution_api && ` • ${inst.evolution_api.name}`}
                            </div>
                            {inst.sent_today > 0 && (
                              <div className="text-xs text-gray-400 mt-1">
                                {inst.sent_today} enviados hoje
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow p-4 sm:p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Grupos Salvos no Banco</h2>
                    <button 
                      onClick={loadGroups}
                      className="text-emerald-600 text-sm font-medium hover:text-emerald-700"
                    >
                      Ver todas
                    </button>
                  </div>
                  {loadingGroups ? (
                    <div className="text-center py-4">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-gray-800 mb-2">
                        {groups.dbGroups.length}
                      </div>
                      {groups.dbGroups.length > 0 && (
                        <div className="text-sm text-gray-500">
                          {groups.dbGroups.slice(0, 3).map((g, i) => (
                            <div key={g.id || i} className="truncate">
                              {g.group_subject || g.group_id}
                            </div>
                          ))}
                          {groups.dbGroups.length > 3 && (
                            <div className="text-gray-400">+{groups.dbGroups.length - 3} mais...</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="bg-white rounded-xl shadow p-4 sm:p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-800">Grupos da API (Evolution)</h2>
                    <button 
                      onClick={loadGroups}
                      className="text-emerald-600 text-sm font-medium hover:text-emerald-700"
                    >
                      Ver todas
                    </button>
                  </div>
                  {loadingGroups ? (
                    <div className="text-center py-4">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-gray-800 mb-2">
                        {groups.evolutionGroups.length}
                      </div>
                      {groups.evolutionGroups.length > 0 && (
                        <div className="text-sm text-gray-500">
                          {groups.evolutionGroups.slice(0, 3).map((g, i) => (
                            <div key={g.id || i} className="truncate">
                              {g.subject || g.id}
                            </div>
                          ))}
                          {groups.evolutionGroups.length > 3 && (
                            <div className="text-gray-400">+{groups.evolutionGroups.length - 3} mais...</div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'users' && (
            <UsersSection users={users} onUserSelect={setSelectedUser} selectedUser={selectedUser} />
          )}

          {activeSection === 'campaigns' && <CampaignsSection userId={userId} />}

          {activeSection === 'settings' && <SettingsSection />}
        </div>
      </div>
    </Layout>
  );
};

const MetricCard = ({ title, value, icon, bgColor }: any) => (
  <div className="bg-white rounded-xl shadow p-4 sm:p-6">
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className={`${bgColor} p-2 sm:p-3 rounded-lg text-white`}>{icon}</div>
    </div>
    <div className="text-xl sm:text-2xl font-bold text-gray-800 mb-1">{value}</div>
    <div className="text-xs sm:text-sm text-gray-600">{title}</div>
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

  const totalPages = Math.ceil(users.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedUsers = users.slice(startIndex, endIndex);

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-4 sm:mb-6">Gerenciar Usuários</h2>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Usuário</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Leads/Dia</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Instâncias</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Campanhas</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Contatos</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user: User) => (
                <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3 sm:p-4">
                    <div>
                      <div className="font-medium text-gray-800 text-sm sm:text-base">{user.email}</div>
                      <div className="text-xs sm:text-sm text-gray-500">{user.full_name || 'Sem nome'}</div>
                    </div>
                  </td>
                  <td className="p-3 sm:p-4">
                    {editingUser === user.id ? (
                      <input
                        type="number"
                        value={maxLeads}
                        onChange={(e) => setMaxLeads(Number(e.target.value))}
                        className="w-16 sm:w-20 px-2 py-1 border rounded text-black text-sm"
                      />
                    ) : (
                      <span className="text-sm sm:text-base">{user.settings.max_leads_per_day}</span>
                    )}
                  </td>
                  <td className="p-3 sm:p-4">
                    {editingUser === user.id ? (
                      <input
                        type="number"
                        value={maxInstances}
                        onChange={(e) => setMaxInstances(Number(e.target.value))}
                        className="w-16 sm:w-20 px-2 py-1 border rounded text-black text-sm"
                      />
                    ) : (
                      <span className="text-sm sm:text-base">{user.settings.max_instances}</span>
                    )}
                  </td>
                  <td className="p-3 sm:p-4 text-sm sm:text-base">{user.stats.campaigns}</td>
                  <td className="p-3 sm:p-4 text-sm sm:text-base">{user.stats.contacts}</td>
                  <td className="p-3 sm:p-4">
                    {editingUser === user.id ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => handleSave(user.id)}
                          disabled={saving}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 text-xs sm:text-sm"
                        >
                          {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                          onClick={handleCancel}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs sm:text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEdit(user)}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs sm:text-sm"
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
      {users.length > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={users.length}
        />
      )}
    </div>
  );
};

const CampaignsSection = ({ userId }: { userId: string | null }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (userId) {
      loadCampaigns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const totalPages = Math.ceil(campaigns.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCampaigns = campaigns.slice(startIndex, endIndex);

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">Todas as Campanhas</h2>
          <button
            onClick={loadCampaigns}
            className="px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm sm:text-base"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">ID</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Usuário</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Grupo</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Status</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Processados</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Falhas</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    Nenhuma campanha encontrada
                  </td>
                </tr>
              ) : (
                paginatedCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 sm:p-4 text-xs sm:text-sm text-gray-600">{campaign.id.substring(0, 8)}...</td>
                    <td className="p-3 sm:p-4 text-sm sm:text-base">{campaign.profiles?.email || 'N/A'}</td>
                    <td className="p-3 sm:p-4 text-sm sm:text-base">{campaign.group_subject || campaign.group_id}</td>
                    <td className="p-3 sm:p-4">
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
                    <td className="p-3 sm:p-4 text-sm sm:text-base">{campaign.processed_contacts}</td>
                    <td className="p-3 sm:p-4 text-sm sm:text-base">{campaign.failed_contacts}</td>
                    <td className="p-3 sm:p-4 text-xs sm:text-sm text-gray-600">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {campaigns.length > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          itemsPerPage={itemsPerPage}
          totalItems={campaigns.length}
        />
      )}
    </div>
  );
};

const SettingsSection = () => {
  const [apis, setApis] = useState<EvolutionApi[]>([]);
  const [usersWithApis, setUsersWithApis] = useState<UserWithApis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingApi, setEditingApi] = useState<EvolutionApi | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    base_url: '',
    api_key: '',
    description: '',
    is_active: true,
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const userId = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
      const [apisRes, usersRes] = await Promise.all([
        fetch('/api/admin/evolution-apis', {
          headers: { 'X-User-Id': userId || '' },
        }),
        fetch('/api/admin/evolution-apis/users', {
          headers: { 'X-User-Id': userId || '' },
        }),
      ]);

      if (apisRes.ok) {
        const apisData = await apisRes.json();
        setApis(apisData.data || []);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsersWithApis(usersData.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userId = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
    
    if (!userId) {
      alert('Sessão inválida. Faça login novamente.');
      return;
    }

    if (!formData.name.trim() || !formData.base_url.trim() || !formData.api_key.trim()) {
      alert('Preencha todos os campos obrigatórios (Nome, URL Base e API Key)');
      return;
    }

    try {
      const url = editingApi
        ? `/api/admin/evolution-apis/${editingApi.id}`
        : '/api/admin/evolution-apis';
      
      const method = editingApi ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({
          ...formData,
          description: formData.description.trim() || null,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setEditingApi(null);
        setFormData({ name: '', base_url: '', api_key: '', description: '', is_active: true });
        await loadData();
      } else {
        const error = await res.json();
        alert(`Erro: ${error.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar API. Verifique sua conexão e tente novamente.');
    }
  };

  const handleEdit = (api: EvolutionApi) => {
    setEditingApi(api);
    setFormData({
      name: api.name,
      base_url: api.base_url,
      api_key: api.api_key,
      description: api.description || '',
      is_active: api.is_active,
    });
    setShowAddModal(true);
  };

  const handleDelete = async (apiId: string) => {
    if (!confirm('Tem certeza que deseja deletar esta API? Isso removerá todas as atribuições de usuários.')) {
      return;
    }

    const userId = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
    
    if (!userId) {
      alert('Sessão inválida. Faça login novamente.');
      return;
    }
    
    try {
      const res = await fetch(`/api/admin/evolution-apis/${apiId}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userId },
      });

      if (res.ok) {
        await loadData();
      } else {
        const error = await res.json();
        alert(`Erro: ${error.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao deletar:', error);
      alert('Erro ao deletar API. Verifique sua conexão e tente novamente.');
    }
  };

  const handleAssignUser = async (apiId: string, userId: string, isDefault: boolean) => {
    const adminUserId = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
    if (!adminUserId) return;
    
    try {
      const res = await fetch(`/api/admin/evolution-apis/${apiId}/assign-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': adminUserId,
        },
        body: JSON.stringify({ user_id: userId, is_default: isDefault }),
      });

      if (res.ok) {
        await loadData();
      } else {
        const error = await res.json();
        console.error('Erro ao atribuir usuário:', error);
        alert(`Erro: ${error.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao atribuir usuário:', error);
      alert('Erro ao atribuir usuário');
    }
  };

  const handleUnassignUser = async (apiId: string, userId: string) => {
    const adminUserId = sessionStorage.getItem('user_id') || sessionStorage.getItem('profile_id');
    if (!adminUserId) return;
    
    try {
      const res = await fetch(`/api/admin/evolution-apis/${apiId}/assign-user?user_id=${userId}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': adminUserId },
      });

      if (res.ok) {
        return;
      } else {
        const error = await res.json();
        console.error('Erro ao remover atribuição:', error);
        throw new Error(error.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Erro ao remover atribuição:', error);
      throw error;
    }
  };

  if (loading) {
    return <div className="bg-white rounded-xl shadow p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">APIs Evolution</h2>
          <button
            onClick={() => {
              setEditingApi(null);
              setFormData({ name: '', base_url: '', api_key: '', description: '', is_active: true });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm sm:text-base w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            Adicionar API
          </button>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Nome</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">URL Base</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Status</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Usuários</th>
                <th className="text-left p-3 sm:p-4 text-gray-700 text-sm sm:text-base">Ações</th>
              </tr>
            </thead>
            <tbody>
              {apis.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    Nenhuma API configurada
                  </td>
                </tr>
              ) : (
                apis.map((api) => (
                  <tr key={api.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 sm:p-4">
                      <div className="font-medium text-gray-800 text-sm sm:text-base">{api.name}</div>
                      {api.description && (
                        <div className="text-xs sm:text-sm text-gray-500">{api.description}</div>
                      )}
                    </td>
                    <td className="p-3 sm:p-4 text-xs sm:text-sm text-gray-600 break-all">{api.base_url}</td>
                    <td className="p-3 sm:p-4">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          api.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {api.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="p-3 sm:p-4 text-sm sm:text-base">{api.user_count}</td>
                    <td className="p-3 sm:p-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(api)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(api.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                          title="Deletar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-800 mb-4 sm:mb-6">Atribuir Usuários às APIs</h2>
        <div className="space-y-4">
          {usersWithApis.map((user) => (
            <div key={user.id} className="border border-gray-200 rounded-lg p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-3">
                <div className="flex-1">
                  <div className="font-medium text-gray-800 text-sm sm:text-base">{user.email}</div>
                  <div className="text-xs sm:text-sm text-gray-500">{user.full_name || 'Sem nome'}</div>
                </div>
                <select
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-black w-full sm:w-auto"
                  value={user.evolution_apis.find(ua => ua.is_default)?.evolution_apis?.id || ''}
                  onChange={async (e) => {
                    const apiId = e.target.value;
                    try {
                      if (apiId) {
                        for (const ua of user.evolution_apis) {
                          try {
                            await handleUnassignUser(ua.evolution_apis.id, user.id);
                          } catch (err) {
                            console.error('Erro ao remover atribuição:', err);
                          }
                        }
                        await handleAssignUser(apiId, user.id, true);
                      } else {
                        for (const ua of user.evolution_apis) {
                          try {
                            await handleUnassignUser(ua.evolution_apis.id, user.id);
                          } catch (err) {
                            console.error('Erro ao remover atribuição:', err);
                          }
                        }
                        await loadData();
                      }
                    } catch (error) {
                      console.error('Erro ao processar atribuição:', error);
                      alert('Erro ao processar atribuição. Tente novamente.');
                    }
                  }}
                >
                  <option value="">Selecione uma API</option>
                  {apis.filter(api => api.is_active).map((api) => (
                    <option key={api.id} value={api.id}>
                      {api.name}
                    </option>
                  ))}
                </select>
              </div>
              {user.evolution_apis.length > 0 && (
                <div className="text-sm text-gray-600">
                  APIs atribuídas: {user.evolution_apis.map(ua => ua.evolution_apis.name).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-800">
                {editingApi ? 'Editar API Evolution' : 'Adicionar API Evolution'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingApi(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL Base *
                </label>
                <input
                  type="url"
                  value={formData.base_url}
                  onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  placeholder="https://evolution.example.com/"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key (Master Key) *
                </label>
                <input
                  type="text"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black"
                  rows={3}
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                />
                <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                  API Ativa
                </label>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingApi(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm sm:text-base"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  <Save className="w-4 h-4" />
                  {editingApi ? 'Salvar Alterações' : 'Criar API'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
