'use client';

import React, { useState, useEffect } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import Pagination from '@/components/Admin/Pagination';
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
  LogOut,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
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
      <div className="space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Painel Administrativo</h1>
            <p className="text-gray-600">Gerenciamento completo do sistema</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow border border-gray-200 hover:bg-gray-50">
              <Calendar className="w-4 h-4" />
              <span>Últimos 7 dias</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition shadow-md hover:shadow-lg"
              title="Sair do painel admin"
            >
              <LogOut className="w-5 h-5" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-2 flex gap-2">
          <button
            onClick={() => setActiveSection('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
              activeSection === 'settings'
                ? 'bg-emerald-600 text-white'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Configurações</span>
          </button>
        </div>

        <div>
          {activeSection === 'overview' && stats && (
            <div className="space-y-6">
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">
                    Mensagens Enviadas e Adição aos Grupos
                  </h2>
                  <div className="h-64">
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
        </div>
      </div>
    </Layout>
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
      <div className="p-6">
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
              {paginatedUsers.map((user: User) => (
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
                        className="w-20 px-2 py-1 border rounded text-black"
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
                        className="w-20 px-2 py-1 border rounded text-black"
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
      <div className="p-6">
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
              {paginatedCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    Nenhuma campanha encontrada
                  </td>
                </tr>
              ) : (
                paginatedCampaigns.map((campaign) => (
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
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">APIs Evolution</h2>
          <button
            onClick={() => {
              setEditingApi(null);
              setFormData({ name: '', base_url: '', api_key: '', description: '', is_active: true });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            <Plus className="w-5 h-5" />
            Adicionar API
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-4 text-gray-700">Nome</th>
                <th className="text-left p-4 text-gray-700">URL Base</th>
                <th className="text-left p-4 text-gray-700">Status</th>
                <th className="text-left p-4 text-gray-700">Usuários</th>
                <th className="text-left p-4 text-gray-700">Ações</th>
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
                    <td className="p-4">
                      <div className="font-medium text-gray-800">{api.name}</div>
                      {api.description && (
                        <div className="text-sm text-gray-500">{api.description}</div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-600">{api.base_url}</td>
                    <td className="p-4">
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
                    <td className="p-4">{api.user_count}</td>
                    <td className="p-4">
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

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Atribuir Usuários às APIs</h2>
        <div className="space-y-4">
          {usersWithApis.map((user) => (
            <div key={user.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-medium text-gray-800">{user.email}</div>
                  <div className="text-sm text-gray-500">{user.full_name || 'Sem nome'}</div>
                </div>
                <select
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-black"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-800">
                {editingApi ? 'Editar API Evolution' : 'Adicionar API Evolution'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingApi(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
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

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingApi(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
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
