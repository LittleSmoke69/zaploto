'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type DelayUnit = 'seconds' | 'minutes';
type DistributionMode = 'sequential' | 'random';

const AddToGroupPage = () => {
  const { checking } = useRequireAuth();
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
      
      await loadInitialData();
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

      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Adição em Grupo</h1>
          <p className="text-gray-600">Configure e inicie a adição de contatos aos grupos</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 space-y-6">
          {/* Instância base */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instância base:
            </label>
            <select
              value={selectedInstance}
              onChange={e => setSelectedInstance(e.target.value)}
              disabled={multiInstancesMode}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50"
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
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30">
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
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg"
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
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {/* Atraso entre inclusões */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Atraso entre inclusões
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={addDelayValue}
                onChange={e => setAddDelayValue(Number(e.target.value))}
                placeholder="Digite uma Quantidade*"
                min="0"
                disabled={addRandom}
                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50"
              />
              <select
                value={addDelayUnit}
                onChange={e => setAddDelayUnit(e.target.value as DelayUnit)}
                disabled={addRandom}
                className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50"
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
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  min="0"
                />
                <span className="text-gray-600">a</span>
                <input
                  type="number"
                  value={randomMaxSeconds}
                  onChange={e => setRandomMaxSeconds(Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
          <div>
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
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              *Use com cautela para evitar rate-limit.
            </p>
          </div>

          {/* Botões de ação */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={handleAddToGroup}
              disabled={addingToGroup || !selectedGroupJid || (!multiInstancesMode ? !selectedInstance : instancesForAdd.length === 0)}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              {addingToGroup ? 'Iniciando...' : 'Iniciar Inclusão'}
            </button>
            <button
              onClick={() => setAddPaused(!addPaused)}
              disabled={!addingToGroup}
              className="px-6 py-3 border-2 border-emerald-600 text-emerald-600 rounded-lg font-medium hover:bg-emerald-50 transition disabled:opacity-50 flex items-center gap-2"
            >
              {addPaused ? (
                <>
                  <Play className="w-5 h-5" />
                  Retomar Inclusão
                </>
              ) : (
                <>
                  <Pause className="w-5 h-5" />
                  Pausar Inclusão
                </>
              )}
            </button>
          </div>
        </div>

        {/* Campanhas Ativas */}
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
          }}
        />
      </div>
    </Layout>
  );
};

export default AddToGroupPage;

