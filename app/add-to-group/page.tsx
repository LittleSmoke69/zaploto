'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import Layout from '@/components/Layout';
import { useDashboardData, Contact, WhatsAppInstance, DbGroup, Campaign } from '@/hooks/useDashboardData';
import ActiveCampaigns from '@/components/Campaigns/ActiveCampaigns';
import {
  Plus,
  Pause,
  Play,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Clock,
  XCircle,
  Menu,
} from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { supabase } from '@/lib/supabase';

type DelayUnit = 'seconds' | 'minutes';
type DistributionMode = 'sequential' | 'random';

const AddToGroupPage = () => {
  const { checking } = useRequireAuth();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  const {
    userId,
    instances,
    contacts,
    dbGroups,
    campaigns,
    setDbGroups,
    showToast,
    addLog,
    toasts,
    setToasts,
    loadInitialData,
  } = useDashboardData();

  const [selectedInstance, setSelectedInstance] = useState('');
  const [selectedGroupJid, setSelectedGroupJid] = useState('');
  const [selectedGroupSubject, setSelectedGroupSubject] = useState('');
  const [multiInstancesMode, setMultiInstancesMode] = useState(false);
  const [instancesForAdd, setInstancesForAdd] = useState<string[]>([]);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('sequential');
  const [addLimit, setAddLimit] = useState<number>(10);
  const [addDelayValue, setAddDelayValue] = useState<number>(1);
  const [addDelayUnit, setAddDelayUnit] = useState<DelayUnit>('minutes');
  const [addRandom, setAddRandom] = useState<boolean>(false);
  const [randomMinSeconds, setRandomMinSeconds] = useState<number>(550);
  const [randomMaxSeconds, setRandomMaxSeconds] = useState<number>(950);
  const [addConcurrency, setAddConcurrency] = useState<number>(2);
  const [addingToGroup, setAddingToGroup] = useState<boolean>(false);
  const [addPaused, setAddPaused] = useState<boolean>(false);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const historyItemsPerPage = 10;
  const activeCampaignsRef = useRef<HTMLDivElement>(null);

  const toggleInstanceForAdd = (name: string) => {
    setInstancesForAdd(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const loadDbGroups = useCallback(async () => {
    if (!selectedInstance || !userId) {
      setDbGroups([]);
      return;
    }
    const { data, error } = await supabase
      .from('whatsapp_groups')
      .select('group_id, group_subject')
      .eq('user_id', userId)
      .eq('instance_name', selectedInstance)
      .order('group_subject', { ascending: true });

    if (error) {
      addLog(`Erro ao carregar grupos: ${error.message}`, 'error');
    } else {
      setDbGroups((data || []) as DbGroup[]);
    }
  }, [selectedInstance, userId, setDbGroups, addLog]);

  useEffect(() => {
    loadDbGroups();
  }, [loadDbGroups]);

  const handleAddToGroup = async () => {
    if (!userId) {
      showToast('Sessão inválida', 'error');
      return;
    }

    const groupsToUse = selectedGroupJid ? [{ jid: selectedGroupJid, subject: selectedGroupSubject }] : [];

    if (groupsToUse.length === 0) {
      showToast('Selecione pelo menos um grupo', 'error');
      return;
    }

    if (!multiInstancesMode && !selectedInstance) {
      showToast('Selecione uma instância', 'error');
      return;
    }

    if (multiInstancesMode && instancesForAdd.length === 0) {
      showToast('Selecione pelo menos uma instância', 'error');
      return;
    }

    const availableContacts = contacts.filter(c => c.status !== 'failed' && !c.status_add_gp);
    if (availableContacts.length === 0) {
      showToast('Nenhum contato disponível para adicionar', 'error');
      return;
    }

    const contactsToUse = availableContacts.slice(0, addLimit);
    if (contactsToUse.length === 0) {
      showToast('Nenhum contato selecionado', 'error');
      return;
    }

    setAddingToGroup(true);
    addLog(`Iniciando adição de ${contactsToUse.length} contato(s) ao grupo...`, 'info');

    try {
      // Cria campanha
      const instancesToUse = multiInstancesMode ? instancesForAdd : [selectedInstance];
      
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          user_id: userId,
          group_id: groupsToUse[0].jid,
          group_subject: groupsToUse[0].subject || null,
          status: 'pending',
          total_contacts: contactsToUse.length,
          processed_contacts: 0,
          failed_contacts: 0,
          strategy: {
            delayConfig: {
              delayMode: addRandom ? 'random' : 'fixed',
              delayValue: addDelayValue,
              delayUnit: addDelayUnit,
              randomMinSeconds,
              randomMaxSeconds,
            },
            distributionMode,
            concurrency: addConcurrency,
          },
          instances: instancesToUse,
        })
        .select()
        .single();

      if (campaignError || !campaign) {
        throw new Error(campaignError?.message || 'Erro ao criar campanha');
      }

      addLog(`Campanha criada com ID: ${campaign.id}`, 'success');

      // Processa campanha
      const jobs = contactsToUse.map(c => ({
        contactId: c.id,
        phone: c.telefone || '',
      }));

      const resp = await fetch('/api/campaigns/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          jobs,
          userId,
        }),
      });

      const data = await resp.json().catch(() => ({} as any));

      if (!resp.ok) {
        throw new Error(data?.error || data?.message || 'Erro ao iniciar campanha');
      }

      showToast(`Campanha iniciada! Processando ${contactsToUse.length} contato(s)...`, 'success');
      addLog(`Campanha ${campaign.id} iniciada com sucesso!`, 'success');
      
      // Recarrega dados imediatamente para mostrar a campanha ativa
      await loadInitialData();
      
      // Faz scroll para a seção de campanhas ativas
      setTimeout(() => {
        activeCampaignsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      
      // Aguarda um pouco e recarrega novamente para pegar status atualizado
      setTimeout(async () => {
        await loadInitialData();
      }, 2000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`Erro ao adicionar ao grupo: ${msg}`, 'error');
      showToast(`Erro: ${msg}`, 'error');
    } finally {
      setAddingToGroup(false);
      setAddPaused(false);
    }
  };

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
          <p className="text-gray-700 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout onSignOut={handleSignOut}>
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 min-w-[320px] px-6 py-4 rounded-lg shadow-lg text-white ${
              toast.type === 'success' ? 'bg-emerald-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-amber-500'
            }`}
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

      <div className="space-y-6 w-full">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Adição em Grupo</h1>
            <p className="text-sm sm:text-base text-gray-600">Configure e inicie a adição de contatos aos grupos</p>
          </div>
          {/* Botão Toggle da Sidebar - Apenas no mobile, no topo direito */}
          <div className="lg:hidden flex-shrink-0">
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition text-gray-600 shadow-md bg-white"
              aria-label="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 space-y-6" data-tour-id="adicao-configuracao">
          {/* Instância base */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instância base:
            </label>
            <select
              value={selectedInstance}
              onChange={e => setSelectedInstance(e.target.value)}
              disabled={multiInstancesMode}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 text-black"
            >
              <option value="">Selecione uma Instância</option>
              {instances.map(inst => (
                <option key={inst.id || inst.instance_name} value={inst.instance_name}>
                  {inst.instance_name} ({inst.status})
                </option>
              ))}
            </select>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="multiInstances"
                checked={multiInstancesMode}
                onChange={e => setMultiInstancesMode(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              <label htmlFor="multiInstances" className="text-sm text-gray-700">
                Usar múltiplas instâncias em rodízio para adicionar ao grupo
              </label>
            </div>
          </div>

          {/* Múltiplas instâncias */}
          {multiInstancesMode && (
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30" data-tour-id="adicao-multiplas-instancias">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Selecionar Instâncias:
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {instances.map(inst => (
                  <button
                    key={inst.id || inst.instance_name}
                    onClick={() => toggleInstanceForAdd(inst.instance_name)}
                    className={`px-3 py-2 rounded-lg border-2 transition ${
                      instancesForAdd.includes(inst.instance_name)
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {inst.instance_name}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">Modo de rodízio</label>
                <select
                  value={distributionMode}
                  onChange={e => setDistributionMode(e.target.value as DistributionMode)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-black"
                >
                  <option value="sequential">Sequencial</option>
                  <option value="random">Aleatório</option>
                </select>
              </div>
            </div>
          )}

          {/* Grupo salvo no banco */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Grupo salvo no banco
            </label>
            <select
              value={selectedGroupJid}
              onChange={e => {
                const group = dbGroups.find(g => g.group_id === e.target.value);
                setSelectedGroupJid(e.target.value);
                setSelectedGroupSubject(group?.group_subject || '');
              }}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black"
            >
              <option value="">Selecione um Grupo</option>
              {dbGroups.map(group => (
                <option key={group.group_id} value={group.group_id}>
                  {group.group_subject || group.group_id}
                </option>
              ))}
            </select>
          </div>

          {/* Quantidade de Leads */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantidade de Leads
            </label>
            <input
              type="number"
              value={addLimit}
              onChange={e => setAddLimit(Number(e.target.value))}
              placeholder="Digite uma Quantidade*"
              min="1"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black placeholder:text-black"
            />
          </div>

          {/* Atraso entre inclusões */}
          <div data-tour-id="adicao-tempo-random">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Atraso entre inclusões
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                value={addDelayValue}
                onChange={e => setAddDelayValue(Number(e.target.value))}
                placeholder="Digite uma Quantidade*"
                min="0"
                disabled={addRandom}
                className="flex-1 min-w-0 px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 text-black placeholder:text-black"
              />
              <select
                value={addDelayUnit}
                onChange={e => setAddDelayUnit(e.target.value as DelayUnit)}
                disabled={addRandom}
                className="w-full sm:w-auto px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 text-black"
              >
                <option value="seconds">Segundos</option>
                <option value="minutes">Minutos</option>
              </select>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="randomTime"
                checked={addRandom}
                onChange={e => setAddRandom(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
              <label htmlFor="randomTime" className="text-sm text-gray-700">
                Random Time
              </label>
            </div>
            {addRandom && (
              <div className="mt-3 flex gap-2 items-center">
                <input
                  type="number"
                  value={randomMinSeconds}
                  onChange={e => setRandomMinSeconds(Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm text-black"
                  min="0"
                />
                <span className="text-gray-600">a</span>
                <input
                  type="number"
                  value={randomMaxSeconds}
                  onChange={e => setRandomMaxSeconds(Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm text-black"
                  min="0"
                />
                <span className="text-xs text-gray-500">segundos</span>
              </div>
            )}
            {addRandom && (
              <p className="text-xs text-gray-500 mt-2">
                Dica: 550s=9min10s e 950s=15min50s. Defina 0 para sem espera (não recomendado).
              </p>
            )}
          </div>

          {/* Concorrência */}
          <div data-tour-id="adicao-concorrencia">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Concorrência (Envios em Paralelo)
            </label>
            <input
              type="number"
              value={addConcurrency}
              onChange={e => setAddConcurrency(Number(e.target.value))}
              placeholder="Digite uma Quantidade*"
              min="1"
              max="10"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black placeholder:text-black"
            />
            <p className="text-xs text-gray-500 mt-1">
              *Use com cautela para evitar rate-limit.
            </p>
          </div>

          {/* Botões de ação */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4" data-tour-id="adicao-controle-campanha">
            <button
              onClick={handleAddToGroup}
              disabled={addingToGroup || !selectedGroupJid || (!multiInstancesMode ? !selectedInstance : instancesForAdd.length === 0)}
              className="w-full sm:flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              <span className="whitespace-nowrap">{addingToGroup ? 'Iniciando...' : 'Iniciar Inclusão'}</span>
            </button>
            <button
              onClick={() => setAddPaused(!addPaused)}
              disabled={!addingToGroup}
              className="w-full sm:w-auto px-6 py-3 border-2 border-emerald-600 text-emerald-600 rounded-lg font-medium hover:bg-emerald-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {addPaused ? (
                <>
                  <Play className="w-5 h-5" />
                  <span className="whitespace-nowrap">Retomar Inclusão</span>
                </>
              ) : (
                <>
                  <Pause className="w-5 h-5" />
                  <span className="whitespace-nowrap">Pausar Inclusão</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Campanhas Ativas */}
        <div ref={activeCampaignsRef} data-tour-id="adicao-campanhas-ativas">
          <ActiveCampaigns
            campaigns={campaigns}
            onPause={async (campaignId: string) => {
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
          }}
          onResume={async (campaignId: string) => {
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
          }}
          onDelete={async (campaignId: string) => {
            if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
            if (!userId) {
              showToast('Sessão inválida', 'error');
              return;
            }
            try {
              const response = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'DELETE',
                headers: {
                  'X-User-Id': userId,
                },
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
          }}
          />
        </div>

        {/* Histórico de Campanhas */}
        <div className="bg-white rounded-xl shadow-md p-6" data-tour-id="adicao-historico">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Histórico de Campanhas</h2>
          {(() => {
            const historyCampaigns = campaigns
              .filter(c => c.status === 'completed' || c.status === 'failed')
              .sort((a, b) => {
                // Ordena por data de conclusão ou created_at (mais recentes primeiro)
                const dateA = a.completed_at ? new Date(a.completed_at).getTime() : new Date(a.created_at).getTime();
                const dateB = b.completed_at ? new Date(b.completed_at).getTime() : new Date(b.created_at).getTime();
                return dateB - dateA;
              });

            if (historyCampaigns.length === 0) {
              return (
                <p className="text-sm text-gray-500 text-center py-4">
                  Nenhuma campanha finalizada no histórico
                </p>
              );
            }

            // Paginação
            const totalPages = Math.ceil(historyCampaigns.length / historyItemsPerPage);
            const startIndex = (historyPage - 1) * historyItemsPerPage;
            const endIndex = startIndex + historyItemsPerPage;
            const paginatedCampaigns = historyCampaigns.slice(startIndex, endIndex);

            return (
              <>
                <div className="space-y-4">
                  {paginatedCampaigns.map(campaign => {
                  const total = campaign.total_contacts || 1;
                  const processed = campaign.processed_contacts || 0;
                  const failed = campaign.failed_contacts || 0;
                  const completed = processed + failed;
                  const progressPercentage = Math.round((completed / total) * 100);
                  const successPercentage = completed > 0 ? Math.round((processed / completed) * 100) : 0;
                  const failedPercentage = completed > 0 ? Math.round((failed / completed) * 100) : 0;
                  const isCompleted = campaign.status === 'completed';
                  const isFailed = campaign.status === 'failed';

                  return (
                    <div
                      key={campaign.id}
                      className="p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-300 transition"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-800">
                              {campaign.group_subject || campaign.group_id}
                            </h3>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : isFailed
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {isCompleted ? 'Concluída' : isFailed ? 'Falhou' : campaign.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 font-mono mb-2">{campaign.id}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
                            if (!userId) {
                              showToast('Sessão inválida', 'error');
                              return;
                            }
                            try {
                              const response = await fetch(`/api/campaigns/${campaign.id}`, {
                                method: 'DELETE',
                                headers: {
                                  'X-User-Id': userId,
                                },
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
                          }}
                          className="p-2 bg-red-600 hover:bg-red-700 text-white rounded transition"
                          title="Excluir campanha"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Estatísticas */}
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-1">Total</p>
                          <p className="text-lg font-bold text-gray-800">{total}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-1">Adicionados</p>
                          <p className="text-lg font-bold text-emerald-600">{processed}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500 mb-1">Falhas</p>
                          <p className="text-lg font-bold text-red-600">{failed}</p>
                        </div>
                      </div>

                      {/* Percentuais */}
                      <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-600">Progresso</span>
                          <span className="text-xs font-medium text-gray-800">{progressPercentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all ${
                              isCompleted ? 'bg-emerald-600' : 'bg-gray-400'
                            }`}
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Taxa de sucesso e falha */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-2 bg-emerald-50 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="text-xs text-gray-600">Taxa de Sucesso</span>
                          </div>
                          <p className="text-sm font-bold text-emerald-600">{successPercentage}%</p>
                        </div>
                        <div className="p-2 bg-red-50 rounded">
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span className="text-xs text-gray-600">Taxa de Falha</span>
                          </div>
                          <p className="text-sm font-bold text-red-600">{failedPercentage}%</p>
                        </div>
                      </div>

                      {/* Tempo */}
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>
                            {isCompleted && campaign.completed_at
                              ? `Concluída em: ${new Date(campaign.completed_at).toLocaleString('pt-BR')}`
                              : `Criada em: ${new Date(campaign.created_at).toLocaleString('pt-BR')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>

                {/* Controles de Paginação */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
                    <div className="text-sm text-gray-600">
                      Mostrando {startIndex + 1} a {Math.min(endIndex, historyCampaigns.length)} de {historyCampaigns.length} campanhas
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                        disabled={historyPage === 1}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        Anterior
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(page => {
                            // Mostra sempre primeira, última, atual e 2 ao redor
                            return (
                              page === 1 ||
                              page === totalPages ||
                              (page >= historyPage - 1 && page <= historyPage + 1)
                            );
                          })
                          .map((page, index, array) => {
                            // Adiciona "..." quando há gap
                            const showEllipsis = index > 0 && array[index] - array[index - 1] > 1;
                            return (
                              <React.Fragment key={page}>
                                {showEllipsis && (
                                  <span className="px-2 text-gray-500">...</span>
                                )}
                                <button
                                  onClick={() => setHistoryPage(page)}
                                  className={`px-3 py-2 text-sm font-medium rounded-lg transition ${
                                    historyPage === page
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                  }`}
                                >
                                  {page}
                                </button>
                              </React.Fragment>
                            );
                          })}
                      </div>
                      <button
                        onClick={() => setHistoryPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={historyPage === totalPages}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </Layout>
  );
};

export default AddToGroupPage;

