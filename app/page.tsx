'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import {
  Send,
  Download,
  RefreshCw,
  Copy,
  X,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronLeft,
  ChevronRight,
  Upload,
  LogOut,
  Users2,
  Plus,
  Clock,
  Link as LinkIcon,
  BarChart3,
  Pause,
  Play,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Contact {
  id: string;
  name?: string;
  telefone: string | null;
  status_disparo?: boolean;
  status_add_gp?: boolean;
  status?: string;
}

interface WhatsAppInstance {
  id?: string;
  instance_name: string;
  status: string; // 'connecting' | 'connected' | etc
  hash?: string;
  number?: string;
  qr_code?: string | null;
  connected_at?: string | null;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'error';
  message: string;
}

interface EvolutionGroup {
  id: string;
  subject: string;
  pictureUrl?: string;
  size?: number;
}

interface DbGroup {
  group_id: string;
  group_subject: string;
}

type DelayUnit = 'seconds' | 'minutes';
type DistributionMode = 'sequential' | 'random';

const EVOLUTION_BASE = process.env.NEXT_PUBLIC_EVOLUTION_BASE!;
const EVOLUTION_APIKEY = process.env.NEXT_PUBLIC_EVOLUTION_APIKEY!;


const Dashboard = () => {
  const { checking } = useRequireAuth();

  // Instância WhatsApp
  const [instanceName, setInstanceName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [qrTimer, setQrTimer] = useState(0);

  // Disparo / Leads
  const [messageTemplate, setMessageTemplate] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leadsLimit, setLeadsLimit] = useState<number>(10);

  // Upload CSV
  const [csvContacts, setCsvContacts] = useState<Partial<Contact>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvImporting, setCsvImporting] = useState<boolean>(false);

  // Grupos (Evolution fetch)
  const [availableGroups, setAvailableGroups] = useState<EvolutionGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState<boolean>(false);
  const [groupFetchElapsed, setGroupFetchElapsed] = useState<number>(0);

  // Grupos (Banco para Add)
  const [dbGroups, setDbGroups] = useState<DbGroup[]>([]);
  const [selectedGroupJid, setSelectedGroupJid] = useState<string>('');
  const [selectedGroupSubject, setSelectedGroupSubject] = useState<string>('');

  // Adicionar ao grupo
  const [addLimit, setAddLimit] = useState<number>(10);
  const [addDelayValue, setAddDelayValue] = useState<number>(1);
  const [addDelayUnit, setAddDelayUnit] = useState<DelayUnit>('minutes');
  const [addRandom, setAddRandom] = useState<boolean>(false);
  const [addingToGroup, setAddingToGroup] = useState<boolean>(false);

  // NOVO: rodízio multi-instância
  const [multiInstancesMode, setMultiInstancesMode] = useState<boolean>(false);
  const [instancesForAdd, setInstancesForAdd] = useState<string[]>([]);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('sequential');

  // NOVO: concorrência + pause (ADD GRUPO)
  const [addConcurrency, setAddConcurrency] = useState<number>(2);
  const [addPaused, setAddPaused] = useState<boolean>(false);
  const addCtrl = useRef<{ paused: boolean }>({ paused: false });

  // misc UI
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Tabela de contatos — controle de paginação e limite
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // KPIs
  const [kpiSent, setKpiSent] = useState<number>(0);
  const [kpiAdded, setKpiAdded] = useState<number>(0);
  const [kpiPending, setKpiPending] = useState<number>(0);
  const [kpiConnected, setKpiConnected] = useState<number>(0);
  const [kpiFailedSends, setKpiFailedSends] = useState<number>(0);
  const [kpiFailedAdds, setKpiFailedAdds] = useState<number>(0);

  // ========= Toast + logs =========
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const ts = new Date().toISOString();
    const entry: LogEntry = { timestamp: ts, type, message };
    if (type === 'error') console.error(`[${ts}] ❌ ${message}`);
    else if (type === 'success') console.log(`[${ts}] ✅ ${message}`);
    else console.log(`[${ts}] ℹ️ ${message}`);
    setLogs(prev => [entry, ...prev].slice(0, 200));
  };

  // ========= Helpers =========
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const waitIfAddPaused = async () => {
    while (addCtrl.current.paused) {
      await sleep(300);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) setPhoneNumber(value);
  };

  const copyApiKey = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('API Key copiada!', 'success');
  };

  const handleSignOut = async () => {
    window.localStorage.removeItem('profile_id');
    window.location.href = '/login';
  };

  // checkbox/token style picker para rodízio multi-instância
  const toggleInstanceForAdd = (name: string) => {
    setInstancesForAdd(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  // ========= Effects =========

  // contador do QR Code
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (qrTimer > 0) {
      interval = setInterval(() => {
        setQrTimer(prev => {
          if (prev <= 1) {
            addLog('Tempo do QR Code expirou. Gerar novamente se necessário.', 'info');
            setQrCode('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [qrTimer]);

  // cronômetro de carregamento de grupos
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (groupsLoading) {
      setGroupFetchElapsed(0);
      timer = setInterval(() => setGroupFetchElapsed(v => v + 1), 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [groupsLoading]);

  // load inicial + realtime
  useEffect(() => {
    loadInitialData();

    const channel = supabase
      .channel('whatsapp_instances_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_instances' },
        payload => {
          addLog(`Instância atualizada: ${(payload as any).new?.instance_name || ''}`, 'info');
          loadInitialData();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // quando trocar instância, buscar grupos do banco
  useEffect(() => {
    const fetchDbGroups = async () => {
      setDbGroups([]);
      setSelectedGroupJid('');
      setSelectedGroupSubject('');
      if (!selectedInstance) return;
      const { data, error } = await supabase
        .from('whatsapp_groups')
        .select('group_id, group_subject')
        .eq('instance_name', selectedInstance)
        .order('group_subject', { ascending: true });

      if (error) {
        addLog(`Erro ao carregar grupos do banco: ${error.message}`, 'error');
      } else {
        setDbGroups((data || []) as DbGroup[]);
        addLog(`Carregados ${data?.length || 0} grupos do banco para a instância`, 'success');
      }
    };
    fetchDbGroups();
  }, [selectedInstance]);

  // ========= Load inicial =========

  const loadInitialData = async () => {
    try {
      addLog('Carregando dados iniciais...', 'info');

      // contatos
      const { data: contactsData, error: contactsError } = await supabase
        .from('searches')
        .select('*')
        .not('telefone', 'is', null)
        .order('created_at', { ascending: false });

      if (!contactsError && contactsData) {
        const formatted: Contact[] = contactsData.map((c: any) => ({
          id: c.id,
          name: c.name || undefined,
          telefone: c.telefone,
          status_disparo: c.status_disparo,
          status_add_gp: c.status_add_gp,
          status: c.status
        }));
        setContacts(formatted);
        addLog(`${formatted.length} contatos carregados`, 'success');
      } else if (contactsError) {
        addLog(`Erro ao carregar contatos: ${contactsError.message}`, 'error');
      }

      // instâncias
      const { data: instancesData, error: instancesError } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .order('created_at', { ascending: false });

      if (!instancesError && instancesData) {
        setInstances(instancesData);
        setKpiConnected(instancesData.filter((i: any) => i.status === 'connected').length);
        addLog(`${instancesData.length} instâncias carregadas`, 'success');
      } else if (instancesError) {
        addLog(`Erro ao carregar instâncias: ${instancesError.message}`, 'error');
      }

      // KPIs (contagens simples no banco)
      const [{ count: sent }, { count: added }, { count: pending }] = await Promise.all([
        supabase.from('searches').select('*', { count: 'exact', head: true }).eq('status_disparo', true),
        supabase.from('searches').select('*', { count: 'exact', head: true }).eq('status_add_gp', true),
        supabase.from('searches').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      ]);

      setKpiSent(sent || 0);
      setKpiAdded(added || 0);
      setKpiPending(pending || 0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      addLog(`Erro geral no loadInitialData: ${msg}`, 'error');
      showToast('Erro ao carregar dados do banco', 'error');
    }
  };

  // ========= CSV Upload =========

  const parseCSV = (raw: string) => {
    const firstLine = raw.split(/\r?\n/)[0] || '';
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

    const lines = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return [];

    const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

    // mapeamento flexível para telefone
    const phoneCandidates = [
      'telefone',
      'phone',
      'phone_number',
      'number',
      'phone_numbwer_number',
      'phonenumber',
      'phonenumber'
    ];
    const telIdx = header.findIndex(h => phoneCandidates.includes(h));

    const nameIdx = header.findIndex(h => h === 'name' || h === 'nome');

    const parsed: Partial<Contact>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter);
      const telefoneRaw = telIdx >= 0 ? (cols[telIdx] || '').replace(/\D/g, '') : '';
      if (!telefoneRaw) continue;

      parsed.push({
        name: nameIdx >= 0 ? (cols[nameIdx] || '').trim() : undefined,
        telefone: telefoneRaw,
        status: 'pending',
        status_disparo: false,
        status_add_gp: false
      });
    }

    return parsed;
  };

  const handleCSVSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast('Envie um arquivo .csv', 'error');
      return;
    }

    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target?.result?.toString() || '';
        const parsed = parseCSV(text);

        if (parsed.length === 0) {
          showToast('Nenhum contato válido encontrado no CSV', 'error');
          setCsvContacts([]);
          return;
        }
        if (parsed.length > 10000) {
          showToast('Limite máximo é 10.000 contatos por upload', 'error');
          setCsvContacts([]);
          return;
        }

        setCsvContacts(parsed);
        showToast(`Arquivo lido: ${parsed.length} contato(s) pronto(s) para importar`, 'success');
        addLog(`CSV carregado (${file.name}) com ${parsed.length} contatos válidos`, 'success');
      } catch {
        showToast('Erro ao ler CSV', 'error');
        addLog('Erro ao fazer parse do CSV', 'error');
        setCsvContacts([]);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImportCSV = async () => {
    if (csvContacts.length === 0) {
      showToast('Nenhum contato carregado', 'error');
      return;
    }
    if (csvContacts.length > 10000) {
      showToast('Máximo 10.000 contatos por upload', 'error');
      return;
    }

    setCsvImporting(true);
    addLog(`Iniciando importação CSV (${csvContacts.length} contatos) para o banco...`, 'info');
    showToast('Importando contatos...', 'info');

    let insertedTotal = 0;
    let insertErrors = 0;

    const chunkSize = 500;
    for (let i = 0; i < csvContacts.length; i += chunkSize) {
      const chunk = csvContacts.slice(i, i + chunkSize);

      const payload = chunk.map(c => ({
        name: c.name || null,
        telefone: c.telefone || null,
        status: 'pending',
        status_disparo: false,
        status_add_gp: false
      }));

      try {
        const { error } = await supabase.from('searches').insert(payload);
        if (error) {
          insertErrors += payload.length;
          addLog(`Erro ao inserir bloco [${i}-${i + chunkSize}]: ${error.message}`, 'error');
        } else {
          insertedTotal += payload.length;
          addLog(`Bloco [${i}-${i + chunkSize}] inserido com sucesso (${payload.length} contatos)`, 'success');
        }
      } catch (err) {
        insertErrors += chunk.length;
        addLog(`Exceção ao inserir bloco [${i}-${i + chunkSize}]: ${String(err)}`, 'error');
      }
    }

    setCsvImporting(false);
    showToast(
      `Importação finalizada. Sucesso: ${insertedTotal} | Falha: ${insertErrors}`,
      insertErrors === 0 ? 'success' : 'error'
    );
    addLog(
      `Importação CSV finalizada. Sucesso=${insertedTotal}, Falha=${insertErrors}`,
      insertErrors === 0 ? 'success' : 'error'
    );

    loadInitialData();
    setCsvContacts([]);
    setCsvFileName('');
  };

  // ========= Criar instância =========

  const handleCreateInstance = async () => {
    if (!instanceName) { showToast('Digite um nome para a instância', 'error'); return; }
    if (!phoneNumber || phoneNumber.length < 10) { showToast('Digite um número válido com DDD', 'error'); return; }

    setLoading(true);
    try {
      const fullNumber = `55${phoneNumber}`;
      addLog(`Criando instância ${instanceName} para o número ${fullNumber}...`, 'info');

      const response = await fetch(`${EVOLUTION_BASE}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
        body: JSON.stringify({ instanceName, qrcode: true, number: fullNumber, integration: 'WHATSAPP-BAILEYS' })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.qrcode) {
        const { data: savedInstance, error } = await supabase
          .from('whatsapp_instances')
          .insert({
            instance_name: instanceName,
            status: 'connecting',
            qr_code: data.qrcode.base64,
            hash: data.hash,
            number: fullNumber
          })
          .select()
          .single();

        if (error) throw error;

        setInstances(prev => [savedInstance, ...prev]);
        setSelectedInstance(instanceName);
        setQrCode(data.qrcode.base64);
        setQrTimer(30);

        addLog(`Instância ${instanceName} criada e aguardando conexão`, 'success');
        showToast('Instância criada! Escaneie o QR Code.', 'success');

        setInstanceName('');
        setPhoneNumber('');

        const checkStatus = setInterval(async () => {
          try {
            const statusResponse = await fetch(
              `${EVOLUTION_BASE}/instance/connectionState/${instanceName}`,
              { headers: { apikey: EVOLUTION_APIKEY } }
            );

            const statusData = await statusResponse.json().catch(() => ({}));

            if (statusData.state === 'open') {
              await supabase
                .from('whatsapp_instances')
                .update({ status: 'connected', connected_at: new Date().toISOString(), qr_code: null })
                .eq('instance_name', instanceName);

              setQrCode('');
              setQrTimer(0);
              loadInitialData();
              addLog(`Instância ${instanceName} conectada com sucesso`, 'success');
              showToast(`WhatsApp conectado com sucesso!`, 'success');
              clearInterval(checkStatus);
            }
          } catch (e) {
            addLog(`Erro ao verificar status da instância ${instanceName}: ${e}`, 'error');
          }
        }, 3000);

        setTimeout(() => clearInterval(checkStatus), 60000);
      } else {
        const errMsg = data?.message || 'Erro ao criar instância na Evolution API';
        addLog(`Falha na criação da instância: ${errMsg}`, 'error');
        throw new Error(errMsg);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      addLog(`Erro ao criar instância: ${msg}`, 'error');
      showToast('Erro ao criar instância', 'error');
    }
    setLoading(false);
  };

  // ========= AÇÕES DE INSTÂNCIA: reconectar, status, deletar =========

  const handleReconnectInstance = async (inst: WhatsAppInstance) => {
    if (!inst.hash) { showToast('API key não encontrada para esta instância', 'error'); return; }
    try {
      addLog(`Solicitando reconexão da instância ${inst.instance_name}...`, 'info');
      const resp = await fetch(`${EVOLUTION_BASE}/instance/connect/${inst.instance_name}`, {
        method: 'GET',
        headers: { apikey: inst.hash }
      });
      const txt = await resp.text().catch(() => '');
      if (resp.ok) {
        showToast('Reconexão solicitada. Verifique o status em alguns segundos.', 'success');
        addLog(`Reconexão solicitada. Resposta: ${txt}`, 'success');

        await supabase.from('whatsapp_instances').update({ status: 'connecting' }).eq('instance_name', inst.instance_name);
        setInstances(prev => prev.map(i => (i.instance_name === inst.instance_name ? { ...i, status: 'connecting' } : i)));
      } else {
        showToast('Falha ao solicitar reconexão', 'error');
        addLog(`Falha ao reconectar: HTTP ${resp.status} ${resp.statusText} | ${txt}`, 'error');
      }
    } catch (e) {
      showToast('Erro ao reconectar', 'error');
      addLog(`Erro ao reconectar: ${String(e)}`, 'error');
    }
  };

  const handleCheckStatus = async (inst: WhatsAppInstance) => {
    if (!inst.hash) { showToast('API key não encontrada para esta instância', 'error'); return; }
    try {
      addLog(`Verificando status da instância ${inst.instance_name}...`, 'info');
      const resp = await fetch(`${EVOLUTION_BASE}/instance/connectionState/${inst.instance_name}`, {
        method: 'GET',
        headers: { apikey: inst.hash }
      });
      const data = await resp.json().catch(() => ({}));
      const state = data?.state || 'unknown';
      addLog(`Estado atual: ${state}`, state === 'open' ? 'success' : 'info');
      showToast(`Estado: ${state}`, state === 'open' ? 'success' : 'info');

      if (state === 'open') {
        await supabase
          .from('whatsapp_instances')
          .update({ status: 'connected', connected_at: new Date().toISOString(), qr_code: null })
          .eq('instance_name', inst.instance_name);

        setInstances(prev =>
          prev.map(i =>
            i.instance_name === inst.instance_name ? { ...i, status: 'connected', qr_code: null } : i
          )
        );
        if (selectedInstance === inst.instance_name) {
          setQrCode('');
          setQrTimer(0);
        }
      }
    } catch (e) {
      showToast('Erro ao verificar status', 'error');
      addLog(`Erro ao consultar estado: ${String(e)}`, 'error');
    }
  };

  const handleDeleteInstance = async (inst: WhatsAppInstance) => {
    if (!inst.hash) { showToast('API key não encontrada para esta instância', 'error'); return; }
    const confirmDelete = window.confirm(
      `Tem certeza que deseja excluir a instância "${inst.instance_name}"?\nIsso irá deletar na Evolution e no banco.`
    );
    if (!confirmDelete) return;

    try {
      addLog(`Deletando instância ${inst.instance_name} na Evolution...`, 'info');
      const resp = await fetch(`${EVOLUTION_BASE}/instance/delete/${inst.instance_name}`, {
        method: 'DELETE',
        headers: { apikey: inst.hash }
      });
      const txt = await resp.text().catch(() => '');
      if (!resp.ok) {
        addLog(`Falha ao excluir na Evolution: HTTP ${resp.status} ${resp.statusText} | ${txt}`, 'error');
        showToast('Erro ao excluir na Evolution', 'error');
        return;
      }

      addLog(`Instância removida na Evolution. Removendo do banco...`, 'success');
      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('instance_name', inst.instance_name);
      if (error) {
        addLog(`Erro ao apagar no banco: ${error.message}`, 'error');
        showToast('Erro ao remover no banco', 'error');
        return;
      }

      setInstances(prev => prev.filter(i => i.instance_name !== inst.instance_name));
      if (selectedInstance === inst.instance_name) {
        setSelectedInstance('');
        setQrCode('');
        setQrTimer(0);
      }

      addLog(`Instância "${inst.instance_name}" removida com sucesso`, 'success');
      showToast('Instância removida com sucesso', 'success');
    } catch (e) {
      addLog(`Erro ao deletar instância: ${String(e)}`, 'error');
      showToast('Erro ao deletar instância', 'error');
    }
  };

  // ========= Puxar grupos (Evolution) =========

  const fetchWithTimeout = async (resource: string, options: RequestInit, timeoutMs: number) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(resource, { ...options, signal: controller.signal, cache: 'no-store' });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  const fetchGroupsFromInstance = async () => {
    if (!selectedInstance) { showToast('Selecione uma instância primeiro', 'error'); return; }
    const inst = instances.find(i => i.instance_name === selectedInstance);
    if (!inst || !inst.hash) { showToast('Instância inválida ou sem hash/API key', 'error'); return; }

    setGroupsLoading(true);
    setAvailableGroups([]);
    addLog(`Buscando grupos da instância ${selectedInstance}... (pode demorar)`, 'info');
    showToast('Carregando grupos... isso pode levar alguns minutos', 'info');

    const PER_TRY_TIMEOUT = 180_000;
    const MAX_TOTAL_MS = 420_000;
    const started = Date.now();
    let attempt = 0;

    while (Date.now() - started < MAX_TOTAL_MS) {
      attempt += 1;
      try {
        const url = `${EVOLUTION_BASE}/group/fetchAllGroups/${selectedInstance}?getParticipants=true`;
        const resp = await fetchWithTimeout(url, { method: 'GET', headers: { apikey: inst.hash } }, PER_TRY_TIMEOUT);

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          addLog(`HTTP ${resp.status} ao buscar grupos (tentativa ${attempt}). Resposta: ${txt}`, 'error');
        } else {
          const json = await resp.json().catch(() => []);
          let groupsList: EvolutionGroup[] = [];
          if (Array.isArray(json)) groupsList = json as EvolutionGroup[];
          else if (Array.isArray(json?.groups)) groupsList = json.groups as EvolutionGroup[];
          else if (json && json.id && json.subject) groupsList = [json as EvolutionGroup];

          if (groupsList.length > 0) {
            setAvailableGroups(groupsList);
            addLog(`Recebidos ${groupsList.length} grupo(s).`, 'success');
            showToast(`Foram encontrados ${groupsList.length} grupo(s)`, 'success');
            setGroupsLoading(false);
            return;
          }
        }
      } catch (err: any) {
        addLog(`Tentativa ${attempt}: ${err?.name === 'AbortError' ? 'timeout' : String(err)}`, 'error');
      }
      const backoff = Math.min(20000, 5000 * attempt);
      await new Promise(r => setTimeout(r, backoff));
    }
    setGroupsLoading(false);
    showToast('Não foi possível obter os grupos após várias tentativas.', 'error');
  };

  // ========= Disparo de mensagens =========

  const handleSendMessages = async () => {
    if (!selectedInstance) { showToast('Selecione uma instância WhatsApp', 'error'); return; }
    if (!messageTemplate) { showToast('Digite uma mensagem', 'error'); return; }
    if (contacts.length === 0) { showToast('Não há contatos para enviar', 'error'); return; }
    if (leadsLimit < 1) { showToast('A quantidade mínima de leads é 1', 'error'); return; }

    const instance = instances.find(i => i.instance_name === selectedInstance);
    if (!instance?.hash) { showToast('Hash da instância não encontrado', 'error'); return; }

    setLoading(true);
    showToast('Iniciando disparo de mensagens...', 'info');
    addLog(`Iniciando disparo: instância=${selectedInstance}, leadsLimit=${leadsLimit}`, 'info');

    let sentCount = 0;
    let failedCount = 0;

    const eligibleContacts = contacts.filter(c => {
      const jaDisparou = c.status_disparo === true;
      const estaPending = (c.status || '').toLowerCase() === 'pending';
      return estaPending && !jaDisparou && !!c.telefone;
    });

    const contactsToSend = eligibleContacts.slice(0, leadsLimit);
    if (contactsToSend.length === 0) {
      showToast('Nenhum lead elegível para disparo', 'error');
      setLoading(false);
      return;
    }

    for (const contact of contactsToSend) {
      try {
        const justDigits = contact.telefone!.replace(/\D/g, '');
        const finalNumber = justDigits.startsWith('55') ? justDigits : `55${justDigits}`;

        const response = await fetch(
          `${EVOLUTION_BASE}/message/sendText/${selectedInstance}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: instance.hash },
            body: JSON.stringify({ number: finalNumber, text: messageTemplate })
          }
        );

        const responseText = await response.text().catch(() => '[sem corpo]');
        if (response.ok) {
          sentCount++;
          addLog(`✅ Mensagem enviada para ${contact.name || finalNumber}. Resposta: ${responseText}`, 'success');

          const { error: updateError } = await supabase
            .from('searches')
            .update({ status_disparo: true, updated_at: new Date().toISOString() })
            .eq('id', contact.id);

          if (updateError) addLog(`Falha ao marcar status_disparo: ${updateError.message}`, 'error');
        } else {
          failedCount++;
          addLog(`❌ Falha ao enviar para ${contact.name || finalNumber}. HTTP ${response.status} | ${responseText}`, 'error');
        }

        await new Promise(r => setTimeout(r, 2000));
      } catch (error) {
        failedCount++;
        addLog(`❌ Erro inesperado ao enviar: ${String(error)}`, 'error');
      }
    }

    addLog(`Resumo do disparo: sucesso=${sentCount} | falhas=${failedCount}`, 'info');
    showToast(`Disparo finalizado! Sucesso: ${sentCount} | Falhas: ${failedCount}`, failedCount ? 'error' : 'success');
    setKpiSent(prev => prev + sentCount);
    setKpiFailedSends(prev => prev + failedCount);

    setMessageTemplate('');
    setLoading(false);
  };

  // ========= Adicionar pessoas ao grupo (com multi-instâncias, concorrência e pausa) =========

  const computeRandomDelayMs = (): number => {
    const roll = Math.random();
    if (roll < 0.9) { // 90% minutos
      const m = Math.floor(Math.random() * 5) + 1; // 1..5
      const s = Math.floor(Math.random() * 60);    // 0..59
      return (m * 60 + s) * 1000;
    }
    const sOnly = Math.floor(Math.random() * 50) + 10; // 10..59
    return sOnly * 1000;
  };

  const getConfiguredDelayMs = (): number => {
    if (addRandom) return computeRandomDelayMs();
    const base = Math.max(0, Number(addDelayValue) || 0);
    const seconds = (addDelayUnit === 'minutes' ? base * 60 : base);
    return Math.max(1, seconds) * 1000;
  };

  const handleAddToGroup = async () => {
    if (!selectedGroupJid) { showToast('Selecione um grupo', 'error'); return; }

    // montar pool de instâncias que vão executar o add
    const chosenNames = multiInstancesMode
      ? instancesForAdd
      : [selectedInstance];

    const instPool = chosenNames
      .map(name => instances.find(i => i.instance_name === name))
      .filter((i): i is WhatsAppInstance => Boolean(i && i.hash));

    if (instPool.length === 0) {
      showToast('Nenhuma instância válida selecionada para adicionar.', 'error');
      addLog('Nenhuma instância válida no rodízio para adicionar.', 'error');
      return;
    }

    // escolher contatos elegíveis
    const eligible = contacts.filter(c =>
      !!c.telefone &&
      c.status_add_gp !== true &&
      (c.status || '').toLowerCase() !== 'added'
    );
    const toAdd = eligible.slice(0, Math.max(1, addLimit));

    if (toAdd.length === 0) {
      showToast('Nenhum lead elegível para adicionar ao grupo.', 'error');
      addLog('Nenhum lead elegível para adicionar.', 'error');
      return;
    }

    setAddingToGroup(true);
    setAddPaused(false);
    addCtrl.current.paused = false;

    addLog(
      `ADD Grupo iniciado: grupo="${selectedGroupSubject || selectedGroupJid}" | leads=${toAdd.length} | instâncias=${instPool.length} | modo=${distributionMode} | concorrência=${addConcurrency}`,
      'info'
    );
    showToast('Iniciando inclusão no grupo...', 'info');

    let ok = 0, fail = 0;
    let globalIndex = 0;

    const worker = async (wid: number) => {
      while (true) {
        const idx = globalIndex++;
        if (idx >= toAdd.length) break;

        await waitIfAddPaused();

        const c = toAdd[idx];
        const digits = (c.telefone || '').replace(/\D/g, '');
        const numberE164 = digits.startsWith('55') ? digits : `55${digits}`;

        // pegar instância para ESTE contato (sequencial ou aleatório)
        const instObj =
          distributionMode === 'sequential'
            ? instPool[idx % instPool.length]
            : instPool[Math.floor(Math.random() * instPool.length)];

        // Até 3 tentativas com backoff para rate-limit
        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
          await waitIfAddPaused();
          attempts++;

          try {
            const url = `${EVOLUTION_BASE}/group/updateParticipant/${instObj.instance_name}?groupJid=${encodeURIComponent(selectedGroupJid)}`;
            const body = { action: 'add', participants: [numberE164] };

            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: instObj.hash as string },
              body: JSON.stringify(body)
            });

            const txt = await resp.text().catch(() => '');
            const lowerTxt = (txt || '').toLowerCase();

            if (resp.ok) {
              ok++;
              addLog(
                `✅ [${instObj.instance_name}] (${wid}) Adicionado ${numberE164} ao grupo.`,
                'success'
              );

              const { error: upErr } = await supabase
                .from('searches')
                .update({ status_add_gp: true, status: 'added', updated_at: new Date().toISOString() })
                .eq('id', c.id);
              if (upErr) addLog(`Falhou ao atualizar status do contato ${c.id}: ${upErr.message}`, 'error');

              success = true;
            } else {
              const isRate =
                resp.status === 429 ||
                lowerTxt.includes('rate-overlimit') ||
                lowerTxt.includes('too many') ||
                lowerTxt.includes('limit');

              if (isRate && attempts < 3) {
                const base = Math.max(getConfiguredDelayMs(), 2000);
                const jitter = 1000 + Math.floor(Math.random() * 2000);
                const wait = base + jitter;
                addLog(`⚠️ [${instObj.instance_name}] (${wid}) Rate-limit para ${numberE164}. Backoff ${(wait / 1000).toFixed(1)}s (tentativa ${attempts}/3)`, 'info');
                await sleep(wait);
                continue;
              }

              fail++;
              addLog(
                `❌ [${instObj.instance_name}] (${wid}) Falha ao adicionar ${numberE164}. HTTP ${resp.status} ${resp.statusText} | ${txt}`,
                'error'
              );
              break;
            }
          } catch (e) {
            if (attempts < 3) {
              const wait = Math.max(getConfiguredDelayMs(), 2000);
              addLog(`⚠️ [${instObj.instance_name}] (${wid}) Exceção para ${numberE164}. Retentando em ${(wait / 1000).toFixed(1)}s (tentativa ${attempts}/3).`, 'info');
              await sleep(wait);
            } else {
              fail++;
              addLog(`❌ [${instObj.instance_name}] (${wid}) Erro final para ${numberE164}: ${String(e)}`, 'error');
            }
          }
        }

        const waitMs = getConfiguredDelayMs();
        addLog(`⏳ (${wid}) aguardando ${(waitMs / 1000).toFixed(1)}s...`, 'info');
        await sleep(waitMs);
      }
    };

    const N = Math.max(1, Math.min(addConcurrency, toAdd.length));
    await Promise.all(Array.from({ length: N }, (_, i) => worker(i)));

    addLog(`Inclusão no grupo finalizada. Sucesso=${ok} | Falhas=${fail}`, 'info');
    showToast(`Inclusão finalizada — Sucesso: ${ok} | Falhas: ${fail}`, fail === 0 ? 'success' : 'error');

    setAddingToGroup(false);
    setAddPaused(false);
    addCtrl.current.paused = false;
    setKpiAdded(prev => prev + ok);
    setKpiFailedAdds(prev => prev + fail);

    loadInitialData();
  };

  const togglePauseAdd = () => {
    if (!addingToGroup) return;
    const next = !addPaused;
    setAddPaused(next);
    addCtrl.current.paused = next;
    addLog(next ? '⏸️ Inclusão PAUSADA' : '▶️ Inclusão RETOMADA', next ? 'info' : 'success');
    showToast(next ? 'Inclusão pausada' : 'Inclusão retomada', next ? 'info' : 'success');
  };

  // ========= Export CSV =========

  const handleExportCSV = () => {
    if (contacts.length === 0) { showToast('Não há contatos para exportar', 'error'); return; }

    const headers = ['Nome','Telefone','Status','Status_Disparo','Status_Add_GP'];
    const rows = contacts.map(c => [
      c.name || '', c.telefone || '', c.status || '',
      c.status_disparo ? 'true' : 'false',
      c.status_add_gp ? 'true' : 'false'
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contatos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    showToast('CSV exportado com sucesso!', 'success');
  };

  // ========= Tabela — paginação/limite =========
  const filteredContacts = contacts;
  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = filteredContacts.slice(startIndex, endIndex);

  useEffect(() => { setCurrentPage(1); }, [itemsPerPage]);

  // ========= Render =========

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-yellow-50">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-lime-200 text-center">
          <p className="text-gray-700 font-medium">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-yellow-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 min-w-[320px] px-6 py-4 rounded-lg shadow-lg text-white transform transition-all duration-300 ease-out animate-slide-in ${
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
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b border-yellow-300">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Slot da LOGO (maior) */}
            <div className="h-12 w-auto sm:h-14 md:h-16 flex items-center">
              <img src="/zaploto.png" alt="ZapLoto" className="h-12 sm:h-14 md:h-16 w-auto object-contain" />
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-yellow-600 to-emerald-700 bg-clip-text text-transparent truncate">
              ZapLoto — Operador WhatsApp
            </h1>
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-yellow-400 to-emerald-600 text-white rounded-lg shadow hover:from-yellow-500 hover:to-emerald-700 transition border border-yellow-300"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Painel de KPIs */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Mensagens enviadas', value: kpiSent, tone: 'from-yellow-400 to-yellow-500' },
            { label: 'Adicionados ao grupo', value: kpiAdded, tone: 'from-emerald-500 to-emerald-600' },
            { label: 'Pendentes', value: kpiPending, tone: 'from-lime-400 to-lime-600' },
            { label: 'Instâncias conectadas', value: kpiConnected, tone: 'from-green-500 to-green-700' },
            { label: 'Disparos com falha', value: kpiFailedSends, tone: 'from-red-400 to-red-600' },
            { label: 'Falhas ao adicionar', value: kpiFailedAdds, tone: 'from-orange-400 to-orange-600' }
          ].map((k, i) => (
            <div
              key={i}
              className={`rounded-xl p-5 text-white shadow-lg bg-gradient-to-br ${k.tone} flex items-center justify-between border border-white/10`}
            >
              <div>
                <p className="text-xs/5 opacity-90">{k.label}</p>
                <p className="text-3xl font-extrabold mt-1">{k.value}</p>
              </div>
              <BarChart3 className="w-8 h-8 opacity-80" />
            </div>
          ))}
        </section>

        {/* WhatsApp — criar e GERENCIAR INSTÂNCIAS */}
        <section className="bg-white rounded-xl shadow-lg p-6 border border-yellow-200">
          <h2 className="text-xl font-semibold text-emerald-800 mb-4">📱 Instâncias WhatsApp</h2>

          {/* Criar Instância */}
          <div className="mb-8 grid sm:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Nome da instância *"
              value={instanceName}
              onChange={e => setInstanceName(e.target.value)}
              className="px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
            />
            <input
              type="tel"
              placeholder="81900000000"
              value={phoneNumber}
              onChange={handlePhoneChange}
              className="px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
              maxLength={11}
              required
            />
            <button
              onClick={handleCreateInstance}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-emerald-600 text-white rounded-lg shadow hover:from-yellow-500 hover:to-emerald-700 transition disabled:opacity-50 font-medium border border-yellow-300"
            >
              Criar Instância
            </button>
            <p className="sm:col-span-3 text-xs text-gray-500">Formato do número: 81900000000 (DDD + número sem espaços ou 55)</p>
          </div>

          {/* Instâncias ativas — layout clean + ações */}
          {instances.length > 0 && (
            <div className="mb-2">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {instances.map(inst => {
                  const connected = inst.status === 'connected';
                  const connecting = inst.status === 'connecting';
                  return (
                    <div key={inst.id} className="p-5 rounded-xl border-2 border-yellow-200 bg-white hover:shadow-md transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-md bg-yellow-50 text-yellow-700 text-xs font-semibold border border-yellow-200">
                              {inst.instance_name}
                            </span>
                            <span
                              className={`px-2 py-1 rounded-md text-xs font-semibold border ${
                                connected
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : connecting
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}
                            >
                              {connected ? 'Conectado' : connecting ? 'Conectando' : (inst.status || '—')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mt-2 truncate">
                            <span className="font-medium">Número:</span> +{inst.number || '—'}
                          </div>
                        </div>

                        {inst.hash && (
                          <button
                            onClick={() => copyApiKey(inst.hash!)}
                            className="shrink-0 px-2 py-1 rounded-md bg-yellow-50 hover:bg-yellow-100 transition text-xs font-medium border border-yellow-200"
                            title="Copiar API Key"
                          >
                            <Copy className="w-4 h-4 text-yellow-700" />
                          </button>
                        )}
                      </div>

                      {inst.hash && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-[11px] font-mono break-all text-gray-600 border border-gray-200">
                          {inst.hash}
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSelectedInstance(inst.instance_name)}
                          className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                            selectedInstance === inst.instance_name
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-gray-700 border-yellow-200 hover:bg-yellow-50'
                          }`}
                          title="Usar esta instância"
                        >
                          Selecionar
                        </button>

                        <button
                          onClick={() => handleReconnectInstance(inst)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border bg-white text-gray-700 hover:bg-yellow-50 transition text-xs border-yellow-200"
                        >
                          <LinkIcon className="w-4 h-4 text-emerald-700" />
                          Conectar
                        </button>

                        <button
                          onClick={() => handleCheckStatus(inst)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition text-xs"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Verificar status
                        </button>

                        <button
                          onClick={() => handleDeleteInstance(inst)}
                          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-xs"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* QR Code */}
          {qrCode && (
            <div className="flex flex-col items-center mt-6 p-6 bg-gradient-to-br from-emerald-50 to-yellow-50 rounded-lg border-2 border-emerald-200">
              {qrTimer > 0 && (
                <div className="mb-4 bg-gradient-to-r from-amber-500 to-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold animate-pulse">{qrTimer}s</div>
                    <div className="text-sm">
                      <div className="font-semibold">Tempo restante</div>
                      <div className="text-xs opacity-90">Escaneie antes que expire</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white p-6 rounded-lg shadow-xl border-4 border-emerald-500">
                <img src={qrCode} alt="QR Code" className="w-72 h-72" />
              </div>

              <div className="mt-4 text-center">
                <p className="text-lg font-semibold text-gray-800">📱 Escaneie com WhatsApp</p>
                <p className="text-sm text-gray-600 mt-1">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
              </div>
            </div>
          )}

          {/* Gestão de Grupos (Evolution – opcional) */}
          <div className="mt-10">
            <h3 className="font-medium text-emerald-800 mb-3 flex items-center gap-2">
              <Users2 className="w-5 h-5 text-emerald-700" />
              Gerenciar Grupos da Instância (API Evolution)
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Instância selecionada</label>
                <select
                  value={selectedInstance}
                  onChange={e => setSelectedInstance(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
                >
                  <option value="">Escolha a instância</option>
                  {instances
                    .filter(i => i.status === 'connecting' || i.status === 'connected')
                    .map(inst => (
                      <option key={inst.id} value={inst.instance_name}>
                        {inst.instance_name} (+{inst.number})
                      </option>
                    ))}
                </select>
              </div>

              <button
                onClick={fetchGroupsFromInstance}
                disabled={groupsLoading || !selectedInstance}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-400 to-emerald-600 text-white rounded-lg hover:from-yellow-500 hover:to-emerald-700 transition disabled:opacity-50 text-sm font-medium border border-yellow-300"
              >
                <RefreshCw className={`w-4 h-4 ${groupsLoading ? 'animate-spin' : ''}`} />
                {groupsLoading ? `Carregando grupos... (${groupFetchElapsed}s)` : 'Carregar grupos da instância'}
              </button>

              {availableGroups.length > 0 ? (
                <div className="border border-yellow-200 rounded-lg divide-y divide-yellow-100 bg-yellow-50/40">
                  {availableGroups.map(g => (
                    <div key={g.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-800">{g.subject || '(sem nome)'}</div>
                        <div className="text-xs text-gray-600 break-all">
                          ID: <span className="font-mono">{g.id}</span>
                        </div>
                        <div className="text-xs text-gray-600">Membros: {g.size ?? '—'}</div>
                      </div>

                      <button
                        onClick={async () => {
                          setSelectedGroupJid(g.id);
                          setSelectedGroupSubject(g.subject || '');
                          addLog(`Grupo selecionado: "${g.subject}" (${g.id})`, 'success');
                          const { error } = await supabase.from('whatsapp_groups').insert({
                            instance_name: selectedInstance,
                            group_id: g.id,
                            group_subject: g.subject,
                            picture_url: g.pictureUrl || null,
                            size: g.size ?? null
                          });
                          if (error) addLog(`Erro ao salvar grupo no banco: ${error.message}`, 'error');
                          else addLog(`Grupo salvo no banco`, 'success');
                        }}
                        className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                      >
                        Selecionar & salvar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600 italic">
                  Nenhum grupo carregado ainda. (esta lista vem da API Evolution)
                </p>
              )}
            </div>
          </div>
        </section>

        {/* NOVA SESSÃO — Adicionar pessoas ao grupo */}
        <section className="bg-white rounded-xl shadow-lg p-6 border border-yellow-200">
          <h2 className="text-xl font-semibold text-emerald-800 mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Adicionar pessoas ao grupo
          </h2>

          {/* Seleção de instância base e grupo (grupo vem do banco da instância base) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Instância base</label>
              <select
                value={selectedInstance}
                onChange={e => setSelectedInstance(e.target.value)}
                className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
              >
                <option value="">Selecione uma instância</option>
                {instances
                  .filter(i => i.status === 'connecting' || i.status === 'connected')
                  .map(inst => (
                    <option key={inst.id} value={inst.instance_name}>
                      {inst.instance_name} (+{inst.number})
                    </option>
                  ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Grupo salvo no banco</label>
              <select
                value={selectedGroupJid}
                onChange={e => {
                  const jid = e.target.value;
                  setSelectedGroupJid(jid);
                  const subj = dbGroups.find(g => g.group_id === jid)?.group_subject || '';
                  setSelectedGroupSubject(subj);
                }}
                className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
              >
                <option value="">Selecione um grupo</option>
                {dbGroups.map(g => (
                  <option key={g.group_id} value={g.group_id}>
                    {g.group_subject || '(sem nome)'} — {g.group_id}
                  </option>
                ))}
              </select>
              {selectedGroupSubject && (
                <p className="text-xs text-gray-600 mt-1">
                  Selecionado: <b>{selectedGroupSubject}</b>
                </p>
              )}
            </div>
          </div>

          {/* Rodízio multi-instância */}
          <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50/30 mb-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <input
                type="checkbox"
                className="w-4 h-4 accent-emerald-600"
                checked={multiInstancesMode}
                onChange={() => setMultiInstancesMode(v => !v)}
              />
              <span>Usar múltiplas instâncias em rodízio para adicionar ao grupo</span>
            </label>

            <div className={multiInstancesMode ? 'space-y-4' : 'hidden'}>
              <div>
                <p className="text-xs text-gray-600 mb-2 font-medium">
                  Escolha quais instâncias vão participar do rodízio:
                </p>
                <div className="flex flex-wrap gap-2">
                  {instances
                    .filter(i => i.status === 'connecting' || i.status === 'connected')
                    .map(inst => (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => toggleInstanceForAdd(inst.instance_name)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${
                          instancesForAdd.includes(inst.instance_name)
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-gray-700 border-yellow-200 hover:bg-yellow-50'
                        }`}
                      >
                        {inst.instance_name} (+{inst.number})
                      </button>
                    ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  A(s) instância(s) selecionada(s) precisam ter permissão de adicionar no grupo.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Modo de rodízio</label>
                <select
                  value={distributionMode}
                  onChange={e => setDistributionMode(e.target.value as DistributionMode)}
                  className="w-full max-w-xs px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
                >
                  <option value="sequential">Sequencial (1ª instância, depois 2ª, etc)</option>
                  <option value="random">Aleatório (instância sorteada a cada lead)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Isso ajuda a cadenciar inclusões e reduzir risco de bloqueio.
                </p>
              </div>
            </div>
          </div>

          {/* Quantidade / Delay / Random Time (alinhado) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quantidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade de leads</label>
              <input
                type="number"
                min={1}
                max={contacts.length}
                value={addLimit}
                onChange={e => setAddLimit(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
              />
            </div>

            {/* Delay + random toggle inline (alinhado) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Atraso entre inclusões
              </label>

              <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={addDelayValue}
                    onChange={e => setAddDelayValue(Math.max(0, parseInt(e.target.value) || 0))}
                    disabled={addRandom}
                    className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  />
                  <select
                    value={addDelayUnit}
                    onChange={e => setAddDelayUnit(e.target.value as DelayUnit)}
                    disabled={addRandom}
                    className="px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
                  >
                    <option value="seconds">segundos</option>
                    <option value="minutes">minutos</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setAddRandom(v => !v)}
                  className={`px-4 py-3 h-[46px] rounded-lg border font-medium text-sm transition whitespace-nowrap ${
                    addRandom
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-yellow-200 hover:bg-yellow-50'
                  }`}
                  title="Seleciona tempos aleatórios (1–5 min com segundos; às vezes apenas segundos)"
                >
                  {addRandom ? 'Random Time: ATIVO' : 'Random Time: DESATIVADO'}
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Defina 0 para sem espera (não recomendado).
              </p>
            </div>
          </div>

          {/* Concorrência + Botões iniciar/pausar */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Concorrência (envios em paralelo)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={addConcurrency}
              onChange={e => setAddConcurrency(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="w-full max-w-xs px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
            />
            <p className="text-[11px] text-gray-500 mt-1">Aumente com cautela: concorrência alta pode acionar rate-limit.</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={handleAddToGroup}
              disabled={
                addingToGroup ||
                !selectedGroupJid ||
                (!multiInstancesMode
                  ? !selectedInstance
                  : instancesForAdd.length === 0)
              }
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 font-medium"
            >
              <Plus className={`w-5 h-5 ${addingToGroup ? 'animate-pulse' : ''}`} />
              {addingToGroup ? 'Adicionando...' : 'Iniciar inclusão'}
            </button>

            <button
              onClick={togglePauseAdd}
              disabled={!addingToGroup}
              className={`px-6 py-3 rounded-lg transition flex items-center justify-center gap-2 font-medium border ${
                addPaused
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                  : 'bg-white text-gray-800 border-yellow-300 hover:bg-yellow-50'
              }`}
            >
              {addPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              {addPaused ? 'Retomar inclusão' : 'Pausar inclusão'}
            </button>
          </div>
        </section>

        {/* Disparo (limpo) */}
        <section className="bg-white rounded-xl shadow-lg p-6 border border-yellow-200">
          <h2 className="text-xl font-semibold text-emerald-800 mb-4">💬 Disparo de Mensagens</h2>

          <div className="mb-4 grid sm:grid-cols-3 gap-3">
            <select
              value={selectedInstance}
              onChange={e => setSelectedInstance(e.target.value)}
              className="px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
            >
              <option value="">Selecione uma instância</option>
              {instances
                .filter(i => i.status === 'connecting' || i.status === 'connected')
                .map(inst => (
                  <option key={inst.id} value={inst.instance_name}>
                    {inst.instance_name} (+{inst.number})
                  </option>
                ))}
            </select>

            <input
              type="number"
              min="1"
              max={contacts.length}
              value={leadsLimit}
              onChange={e => setLeadsLimit(Math.max(1, parseInt(e.target.value) || 1))}
              className="px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
              placeholder="Qtd de leads"
            />

            <div className="sm:col-span-3">
              <textarea
                placeholder="Digite sua mensagem aqui..."
                value={messageTemplate}
                onChange={e => setMessageTemplate(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900 placeholder-gray-400"
              />
            </div>
          </div>

          <button
            onClick={handleSendMessages}
            disabled={loading || !selectedInstance || !messageTemplate}
            className="w-full px-6 py-3 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition flex items-center justify-center gap-2 disabled:opacity-50 font-medium"
          >
            <Send className="w-5 h-5" />
            Enviar para {Math.min(leadsLimit, contacts.length)} contato(s)
          </button>
        </section>

        {/* Upload CSV Contatos */}
        <section className="bg-white rounded-xl shadow-lg p-6 border border-yellow-200">
          <h2 className="text-xl font-semibold text-emerald-800 mb-4">📤 Importar Contatos via CSV</h2>

          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-sm text-yellow-900">
              <p className="font-semibold mb-1">Regras do arquivo:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Formato: .csv (até 10.000 linhas)</li>
                <li>Campo obrigatório de telefone (case-insensitive): <b>telefone</b>, <b>phone</b>, <b>phone_number</b>, <b>number</b>, <b>phone_numbwer_number</b></li>
                <li>Opcional: <b>name</b> ou <b>nome</b></li>
                <li>Telefone com DDD: ex. 81999998888</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <label className="w-full sm:w-auto flex-1">
                <div className="cursor-pointer flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-yellow-50 text-gray-800 border-2 border-dashed border-yellow-300 rounded-lg transition text-sm font-medium text-center">
                  <Upload className="w-5 h-5 text-emerald-700" />
                  <span>{csvFileName ? `Selecionado: ${csvFileName}` : 'Escolher arquivo CSV'}</span>
                </div>
                <input type="file" accept=".csv" className="hidden" onChange={handleCSVSelect} />
              </label>

              <div className="text-sm text-gray-700">
                {csvContacts.length > 0 ? (
                  <span className="font-medium text-gray-800">{csvContacts.length} contato(s) carregado(s)</span>
                ) : (
                  <span className="italic text-gray-400">Nenhum arquivo carregado</span>
                )}
              </div>
            </div>

            <button
              onClick={handleImportCSV}
              disabled={csvImporting || csvContacts.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-400 to-emerald-600 text-white rounded-lg hover:from-yellow-500 hover:to-emerald-700 transition disabled:opacity-50 font-medium border border-yellow-300"
            >
              <Send className="w-5 h-5" />
              {csvImporting ? 'Importando...' : `Importar ${csvContacts.length || 0} contato(s)`}
            </button>
          </div>
        </section>

        {/* Contatos */}
        <section className="bg-white rounded-xl shadow-lg p-6 border border-yellow-200">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
            <h2 className="text-xl font-semibold text-emerald-800">
              📋 Contatos Ativos ({contacts.length})
            </h2>
            <div className="flex gap-2 flex-wrap items-center">
              <label className="text-sm text-gray-700">Mostrar até:</label>
              <select
                value={itemsPerPage}
                onChange={e => setItemsPerPage(parseInt(e.target.value))}
                className="px-3 py-2 border-2 border-yellow-200 rounded-lg text-sm"
              >
                {[10, 50, 100, 500, 1000].map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>

              <button
                onClick={loadInitialData}
                className="px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </button>
              <button
                onClick={handleExportCSV}
                disabled={contacts.length === 0}
                className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-emerald-600 text-white rounded-lg hover:from-yellow-500 hover:to-emerald-700 transition flex items-center gap-2 disabled:opacity-50 border border-yellow-300"
              >
                <Download className="w-5 h-5" />
                Exportar CSV
              </button>
            </div>
          </div>

          {contacts.length === 0 ? (
            <div className="text-center py-12 bg-yellow-50 rounded-lg border border-yellow-100">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Info className="w-8 h-8 text-yellow-700" />
              </div>
              <p className="text-gray-700 text-lg font-medium">Nenhum contato encontrado</p>
              <p className="text-gray-500 text-sm mt-2">Importe contatos via CSV para começar a enviar</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-yellow-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nome</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Telefone</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status Disparo</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status Add GP</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status Lead</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-yellow-100">
                    {paginatedContacts.map(contact => (
                      <tr key={contact.id} className="hover:bg-yellow-50 transition">
                        <td className="px-4 py-3 text-sm text-gray-800 font-medium">{contact.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{contact.telefone || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          {contact.status_disparo ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              ✅ Enviado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              ⏳ Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {contact.status_add_gp ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              ✅ Adicionado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              ⏳ Pendente
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {(contact.status || '').toLowerCase() === 'pending' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              🟡 Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-100">
                              {contact.status || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-yellow-100 flex-wrap gap-4">
                  <div className="text-sm text-gray-700">
                    Mostrando {startIndex + 1} a {Math.min(endIndex, filteredContacts.length)} de {filteredContacts.length} contatos
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 border border-yellow-200 rounded-lg hover:bg-yellow-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Anterior
                    </button>

                    <div className="flex items-center gap-1 flex-wrap">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`px-4 py-2 rounded-lg transition ${
                              currentPage === pageNum ? 'bg-emerald-600 text-white' : 'border border-yellow-200 hover:bg-yellow-50'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 border border-yellow-200 rounded-lg hover:bg-yellow-50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      Próxima
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Logs */}
        {logs.length > 0 && (
          <section className="bg-gray-950 rounded-xl shadow-lg p-6 border border-gray-800">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-semibold text-white">🖥️ Console de Logs</h2>
              <button
                onClick={() => setLogs([])}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Limpar
              </button>
            </div>

            <div className="bg-black rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-xs leading-relaxed text-left border border-gray-800">
              {logs.map((log, index) => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                const colorClass = log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-amber-300';
                const icon = log.type === 'error' ? '❌' : log.type === 'success' ? '✅' : 'ℹ️';
                return (
                  <div key={index} className={`${colorClass} mb-2 break-words`}>
                    [{time}] {icon} {log.message}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
