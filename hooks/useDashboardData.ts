'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Contact {
  id: string;
  name?: string;
  telefone: string | null;
  status_disparo?: boolean;
  status_add_gp?: boolean;
  status?: string;
}

export interface WhatsAppInstance {
  id?: string;
  instance_name: string;
  status: string;
  hash?: string;
  number?: string;
  qr_code?: string | null;
  connected_at?: string | null;
  user_id?: string;
}

export interface DbGroup {
  group_id: string;
  group_subject: string;
}

export interface EvolutionGroup {
  id: string;
  subject: string;
  pictureUrl?: string;
  size?: number;
}

export interface Campaign {
  id: string;
  user_id: string;
  group_id: string;
  group_subject: string | null;
  status: string;
  total_contacts: number;
  processed_contacts: number;
  failed_contacts: number;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error';
  message: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const useDashboardData = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [dbGroups, setDbGroups] = useState<DbGroup[]>([]);
  const [availableGroups, setAvailableGroups] = useState<EvolutionGroup[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [kpiSent, setKpiSent] = useState<number>(0);
  const [kpiAdded, setKpiAdded] = useState<number>(0);
  const [kpiPending, setKpiPending] = useState<number>(0);
  const [kpiConnected, setKpiConnected] = useState<number>(0);
  const [kpiFailedSends, setKpiFailedSends] = useState<number>(0);
  const [kpiFailedAdds, setKpiFailedAdds] = useState<number>(0);
  const [chartData, setChartData] = useState<Array<{ month: string; mensagens: number; adicoes: number }>>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id =
      sessionStorage.getItem('user_id') ||
      sessionStorage.getItem('profile_id') ||
      window.localStorage.getItem('profile_id');
    setUserId(id);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const ts = new Date().toISOString();
    const entry: LogEntry = { timestamp: ts, type, message };
    if (type === 'error') console.error(`[${ts}] ❌ ${message}`);
    else if (type === 'success') console.log(`[${ts}] ✅ ${message}`);
    else console.log(`[${ts}] ℹ️ ${message}`);
    setLogs(prev => [entry, ...prev].slice(0, 200));
  }, []);

  const loadChartData = useCallback(async (currentUserId: string) => {
    try {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const [campaignsResult, contactsResult] = await Promise.all([
        supabase
          .from('campaigns')
          .select('processed_contacts, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', twelveMonthsAgo.toISOString()),
        supabase
          .from('searches')
          .select('status_disparo, status_add_gp, created_at')
          .eq('user_id', currentUserId)
          .gte('created_at', twelveMonthsAgo.toISOString())
      ]);

      const campaigns = campaignsResult.data || [];
      const contacts = contactsResult.data || [];

      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthlyData: Record<string, { mensagens: number; adicoes: number }> = {};

      for (let i = 0; i < 12; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - (11 - i));
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = { mensagens: 0, adicoes: 0 };
      }

      campaigns.forEach((campaign: any) => {
        if (campaign.created_at) {
          const date = new Date(campaign.created_at);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyData[monthKey]) {
            monthlyData[monthKey].adicoes += campaign.processed_contacts || 0;
          }
        }
      });

      contacts.forEach((contact: any) => {
        if (contact.created_at && contact.status_disparo) {
          const date = new Date(contact.created_at);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthlyData[monthKey]) {
            monthlyData[monthKey].mensagens += 1;
          }
        }
      });

      const chartDataArray = Object.keys(monthlyData)
        .sort()
        .map((key) => {
          const date = new Date(key + '-01');
          return {
            month: monthNames[date.getMonth()],
            mensagens: monthlyData[key].mensagens,
            adicoes: monthlyData[key].adicoes,
          };
        });

      setChartData(chartDataArray);
    } catch (error) {
      console.error('Erro ao carregar dados do gráfico:', error);
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    if (!userId) return;
    try {
      addLog('Carregando dados iniciais...', 'info');

      // Busca instâncias via API (agora usa evolution_instances)
      let instancesData: WhatsAppInstance[] = [];
      try {
        const instancesResponse = await fetch('/api/instances', {
          headers: { 'X-User-Id': userId },
        });
        if (instancesResponse.ok) {
          const instancesResult = await instancesResponse.json();
          if (instancesResult.success && instancesResult.data) {
            instancesData = instancesResult.data as WhatsAppInstance[];
          }
        }
      } catch (instancesError) {
        console.error('Erro ao buscar instâncias via API:', instancesError);
        addLog('Erro ao buscar instâncias. Usando dados locais se disponíveis.', 'error');
      }

      const [contactsResult, campaignsResult, kpiResults] = await Promise.all([
        supabase
          .from('searches')
          .select('*')
          .eq('user_id', userId)
          .not('telefone', 'is', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('campaigns')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        Promise.all([
          supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_disparo', true),
          supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_add_gp', true),
          supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending'),
          supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'failed').eq('status_disparo', false),
          supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'failed').eq('status_add_gp', false),
        ])
      ]);

      if (!contactsResult.error && contactsResult.data) {
        const formatted: Contact[] = contactsResult.data.map((c: any) => ({
          id: c.id,
          name: c.name || undefined,
          telefone: c.telefone,
          status_disparo: c.status_disparo,
          status_add_gp: c.status_add_gp,
          status: c.status
        }));
        setContacts(formatted);
      }

      // Usa instâncias buscadas via API
      if (instancesData.length > 0) {
        setInstances(instancesData);
        setKpiConnected(instancesData.filter((i: any) => i.status === 'connected').length);
      } else {
        // Se não conseguiu buscar, mantém array vazio
        setInstances([]);
        setKpiConnected(0);
      }

      if (!campaignsResult.error && campaignsResult.data) {
        setCampaigns(campaignsResult.data as Campaign[]);
      }

      const [{ count: sent }, { count: added }, { count: pending }, { count: failedSends }, { count: failedAdds }] = kpiResults;
      setKpiSent(sent || 0);
      setKpiAdded(added || 0);
      setKpiPending(pending || 0);
      setKpiFailedSends(failedSends || 0);
      setKpiFailedAdds(failedAdds || 0);

      await loadChartData(userId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      addLog(`Erro geral no loadInitialData: ${msg}`, 'error');
      showToast('Erro ao carregar dados do banco', 'error');
    }
  }, [userId, addLog, showToast, loadChartData]);

  useEffect(() => {
    if (userId) {
      loadInitialData();
    }
  }, [userId, loadInitialData]);

  // Polling para atualizar campanhas ativas a cada 5 segundos
  useEffect(() => {
    if (!userId) return;

    // Verifica se há campanhas ativas antes de iniciar o polling
    const checkActiveCampaigns = () => {
      const activeCampaigns = campaigns.filter(
        c => c.status === 'running' || c.status === 'paused'
      );
      return activeCampaigns.length > 0;
    };

    // Se não houver campanhas ativas, não inicia o polling ainda
    // Mas vamos iniciar mesmo assim para atualizar histórico periodicamente
    const interval = setInterval(async () => {
      try {
        // Busca TODAS as campanhas (não apenas ativas) para manter histórico
        const { data, error } = await supabase
          .from('campaigns')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Atualiza todas as campanhas, não apenas as ativas
          setCampaigns(data as Campaign[]);
        }
      } catch (error) {
        console.error('Erro ao atualizar campanhas:', error);
      }
    }, 5000); // Atualiza a cada 5 segundos

    return () => clearInterval(interval);
  }, [userId]); // Remove campaigns das dependências para evitar loops

  return {
    userId,
    instances,
    contacts,
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
    logs,
    toasts,
    setToasts,
    showToast,
    addLog,
    setInstances,
    setContacts,
    setDbGroups,
    setAvailableGroups,
    setCampaigns,
    loadInitialData,
  };
};

