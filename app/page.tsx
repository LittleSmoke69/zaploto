'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  status: string; // 'connecting' | 'connected' | 'disconnected' | 'unknown'
  hash?: string;
  number?: string;
  qr_code?: string | null;
  connected_at?: string | null;
  user_id?: string;
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
const QR_WINDOW_SECONDS = 30;

const Dashboard = () => {
  const { checking } = useRequireAuth();

  // ======== MULTI-TENANT ========
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id =
      sessionStorage.getItem('user_id') ||
      sessionStorage.getItem('profile_id') ||
      window.localStorage.getItem('profile_id');
    setUserId(id);
  }, []);

  // Instâncias
  const [instanceName, setInstanceName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState('');

  // QR
  const [qrCode, setQrCode] = useState('');
  const [qrTimer, setQrTimer] = useState(0);
  const [qrExpired, setQrExpired] = useState(false);

  const lastStatesRef = useRef<Record<string, string>>({});
  const heartBeatOnRef = useRef<boolean>(false);

  // Contatos
  const [contacts, setContacts] = useState<Contact[]>([]);

  // CSV
  const [csvContacts, setCsvContacts] = useState<Partial<Contact>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvImporting, setCsvImporting] = useState<boolean>(false);

  // GRUPOS — API (Evolution)
  const [availableGroups, setAvailableGroups] = useState<EvolutionGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState<boolean>(false);
  const [groupFetchElapsed, setGroupFetchElapsed] = useState<number>(0);

  // GRUPOS — Banco (salvos por instância)
  const [dbGroups, setDbGroups] = useState<DbGroup[]>([]);
  const [selectedGroupJid, setSelectedGroupJid] = useState<string>('');
  const [selectedGroupSubject, setSelectedGroupSubject] = useState<string>('');

  // ===== NOVO: Busca + Paginação (API) =====
  const [availGroupsSearch, setAvailGroupsSearch] = useState('');
  const [availGroupsPage, setAvailGroupsPage] = useState(1);
  const [availGroupsPerPage, setAvailGroupsPerPage] = useState(10);

  // ===== NOVO: Busca + Paginação (salvos) =====
  const [savedGroupsSearch, setSavedGroupsSearch] = useState('');
  const [savedGroupsPage, setSavedGroupsPage] = useState(1);
  const [savedGroupsPerPage, setSavedGroupsPerPage] = useState(10);

  // Adicionar ao grupo
  const [addLimit, setAddLimit] = useState<number>(10);

  // Delay configurável
  const [addDelayValue, setAddDelayValue] = useState<number>(1);
  const [addDelayUnit, setAddDelayUnit] = useState<DelayUnit>('minutes');
  const [addRandom, setAddRandom] = useState<boolean>(false);

  // NOVO: faixa de random (em segundos)
  const [randomMinSeconds, setRandomMinSeconds] = useState<number>(550); // ~9m10s
  const [randomMaxSeconds, setRandomMaxSeconds] = useState<number>(950); // ~15m50s

  const [addingToGroup, setAddingToGroup] = useState<boolean>(false);

  // Rodízio multi-instância
  const [multiInstancesMode, setMultiInstancesMode] = useState<boolean>(false);
  const [instancesForAdd, setInstancesForAdd] = useState<string[]>([]);
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('sequential');

  // Concorrência + pause
  const [addConcurrency, setAddConcurrency] = useState<number>(2);
  const [addPaused, setAddPaused] = useState<boolean>(false);
  const addCtrl = useRef<{ paused: boolean }>({ paused: false });
  const cancelAddRef = useRef<boolean>(false);

  // misc UI
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Tabela contatos
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
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('user_id');
      sessionStorage.removeItem('profile_id');
      window.localStorage.removeItem('profile_id');
      document.cookie = 'user_id=; Path=/; Max-Age=0; SameSite=Lax';
    }
    window.location.href = '/login';
  };

  const toggleInstanceForAdd = (name: string) => {
    setInstancesForAdd(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  // ===== Helpers Evolution (estado/QR) =====
  const extractState = (j: any): 'connected' | 'connecting' | 'disconnected' | 'unknown' => {
    const raw = (j?.instance?.state ?? j?.state ?? j?.connection?.state ?? j?.status ?? '')
      .toString()
      .toLowerCase();

    if (!raw) return 'unknown';
    if (raw === 'open') return 'connected';
    if (['connecting', 'pairing', 'qrcode', 'qr', 'waiting_qr'].includes(raw)) return 'connecting';
    if (['close', 'closed', 'disconnected', 'logout'].includes(raw)) return 'disconnected';
    return raw as any;
  };

  const extractQr = (j: any): string | null => {
    return j?.qrcode?.base64 || j?.qrcode || j?.instance?.qrcode?.base64 || j?.instance?.qrcode || null;
  };

  // ========= Effects =========
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (qrTimer > 0) {
      setQrExpired(false);
      interval = setInterval(() => {
        setQrTimer(prev => {
          if (prev <= 1) {
            addLog('Tempo do QR Code expirou. Gere/libere novamente para tentar.', 'info');
            setQrExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [qrTimer]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (groupsLoading) {
      setGroupFetchElapsed(0);
      timer = setInterval(() => setGroupFetchElapsed(v => v + 1), 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [groupsLoading]);

  useEffect(() => {
    setKpiConnected(instances.filter(i => i.status === 'connected').length);
  }, [instances]);

  const markInstanceDisconnected = useCallback(async (instName: string) => {
    lastStatesRef.current[instName] = 'disconnected';
    setInstances(cur =>
      cur.map(i => i.instance_name === instName ? { ...i, status: 'disconnected' } : i)
    );
    try {
      await supabase
        .from('whatsapp_instances')
        .update({ status: 'disconnected' })
        .eq('user_id', userId!)
        .eq('instance_name', instName);
    } catch {}
    showToast(`Instância ${instName} desconectou (Connection Closed).`, 'error');
    addLog(`Instância ${instName} marcada como desconectada (Connection Closed).`, 'error');
  }, [userId]);

  const loadInitialData = useCallback(async () => {
    if (!userId) return;
    try {
      addLog('Carregando dados iniciais...', 'info');

      // contatos
      const { data: contactsData, error: contactsError } = await supabase
        .from('searches')
        .select('*')
        .eq('user_id', userId)
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
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!instancesError && instancesData) {
        setInstances(instancesData as WhatsAppInstance[]);
        setKpiConnected((instancesData as WhatsAppInstance[]).filter((i: any) => i.status === 'connected').length);
        addLog(`${instancesData.length} instâncias carregadas`, 'success');
      } else if (instancesError) {
        addLog(`Erro ao carregar instâncias: ${instancesError.message}`, 'error');
      }

      // KPIs
      const [{ count: sent }, { count: added }, { count: pending }] = await Promise.all([
        supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_disparo', true),
        supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status_add_gp', true),
        supabase.from('searches').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending')
      ]);

      setKpiSent(sent || 0);
      setKpiAdded(added || 0);
      setKpiPending(pending || 0);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      addLog(`Erro geral no loadInitialData: ${msg}`, 'error');
      showToast('Erro ao carregar dados do banco', 'error');
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadInitialData();

    const channel = supabase
      .channel('whatsapp_instances_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${userId}`
        },
        () => {
          addLog(`Instância atualizada (realtime).`, 'info');
          loadInitialData();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, loadInitialData]);

  // quando trocar instância, buscar grupos salvos
  useEffect(() => {
    const fetchDbGroups = async () => {
      setDbGroups([]);
      setSelectedGroupJid('');
      setSelectedGroupSubject('');
      if (!selectedInstance || !userId) return;
      const { data, error } = await supabase
        .from('whatsapp_groups')
        .select('group_id, group_subject')
        .eq('user_id', userId)
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
  }, [selectedInstance, userId]);

  // ========= Heartbeat de status =========
  useEffect(() => {
    if (!userId || instances.length === 0) return;
    if (heartBeatOnRef.current) return;
    heartBeatOnRef.current = true;

    const INTERVAL = 12_000;

    const tick = async () => {
      await Promise.all(
        instances.map(async (inst) => {
          if (!inst?.hash || !inst?.instance_name) return;
          try {
            const r = await fetch(`${EVOLUTION_BASE}/instance/connectionState/${inst.instance_name}`, {
              method: 'GET',
              headers: { apikey: inst.hash },
              cache: 'no-store',
            });
            const j = await r.json().catch(() => ({} as any));
            const mapped = extractState(j);

            const prev = lastStatesRef.current[inst.instance_name];
            if (prev !== mapped) {
              lastStatesRef.current[inst.instance_name] = mapped;
              setInstances(cur =>
                cur.map(i => i.instance_name === inst.instance_name ? { ...i, status: mapped } : i)
              );
              try {
                await supabase.from('whatsapp_instances')
                  .update({ status: mapped })
                  .eq('user_id', userId!)
                  .eq('instance_name', inst.instance_name);
              } catch {}
            }

            if (selectedInstance === inst.instance_name) {
              const qrb64 = extractQr(j);
              if (qrb64) {
                setQrCode(qrb64);
                setQrTimer(QR_WINDOW_SECONDS);
                setQrExpired(false);
              }
            }
          } catch {
            const prev = lastStatesRef.current[inst.instance_name] || inst.status;
            const mapped = 'unknown';
            if (prev !== mapped) {
              lastStatesRef.current[inst.instance_name] = mapped;
              setInstances(cur =>
                cur.map(i => i.instance_name === inst.instance_name ? { ...i, status: mapped } : i
              ));
            }
          }
        })
      );
    };

    const id = setInterval(tick, INTERVAL);
    tick();

    return () => { clearInterval(id); heartBeatOnRef.current = false; };
  }, [instances, userId, selectedInstance]);

  // ========= CSV =========
  const parseCSV = (raw: string) => {
    const firstLine = raw.split(/\r?\n/)[0] || '';
    const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

    const lines = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) return [];

    const header = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

    const phoneCandidates = [
      'telefone', 'phone', 'phone_number', 'number', 'phone_numbwer_number', 'phonenumber'
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
      showToast('Envie um arquivo .csv', 'error'); return;
    }
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target?.result?.toString() || '';
        const parsed = parseCSV(text);
        if (parsed.length === 0) { showToast('Nenhum contato válido encontrado', 'error'); setCsvContacts([]); return; }
        if (parsed.length > 10000) { showToast('Limite de 10.000 contatos', 'error'); setCsvContacts([]); return; }
        setCsvContacts(parsed);
        showToast(`Arquivo lido: ${parsed.length} contato(s)`, 'success');
        addLog(`CSV carregado (${file.name}) com ${parsed.length} contatos`, 'success');
      } catch {
        showToast('Erro ao ler CSV', 'error'); addLog('Erro parse CSV', 'error'); setCsvContacts([]);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImportCSV = async () => {
    if (!userId) { showToast('Sessão inválida', 'error'); return; }
    if (csvContacts.length === 0) { showToast('Nenhum contato carregado', 'error'); return; }
    if (csvContacts.length > 10000) { showToast('Máximo 10.000 contatos', 'error'); return; }

    setCsvImporting(true);
    addLog(`Importando ${csvContacts.length} contatos...`, 'info');
    showToast('Importando contatos...', 'info');

    let insertedTotal = 0;
    let insertErrors = 0;

    const chunkSize = 500;
    for (let i = 0; i < csvContacts.length; i += chunkSize) {
      const chunk = csvContacts.slice(i, i + chunkSize);
      const payload = chunk.map(c => ({
        user_id: userId,
        name: c.name || null,
        telefone: c.telefone || null,
        status: 'pending',
        status_disparo: false,
        status_add_gp: false
      }));

      try {
        const { error } = await supabase.from('searches').insert(payload);
        if (error) { insertErrors += payload.length; addLog(`Erro bloco [${i}-${i + chunkSize}]: ${error.message}`, 'error'); }
        else { insertedTotal += payload.length; addLog(`Bloco [${i}-${i + chunkSize}] inserido (${payload.length})`, 'success'); }
      } catch (err) {
        insertErrors += chunk.length;
        addLog(`Exceção bloco [${i}-${i + chunkSize}]: ${String(err)}`, 'error');
      }
    }

    setCsvImporting(false);
    showToast(`Importação: Sucesso ${insertedTotal} | Falha ${insertErrors}`, insertErrors === 0 ? 'success' : 'error');
    addLog(`Importação finalizada. Sucesso=${insertedTotal}, Falha=${insertErrors}`, insertErrors === 0 ? 'success' : 'error');
    loadInitialData();
    setCsvContacts([]); setCsvFileName('');
  };

  // ========= Criar instância =========
  const handleCreateInstance = async () => {
    if (!userId) { showToast('Sessão inválida', 'error'); return; }
    if (!instanceName) { showToast('Digite um nome para a instância', 'error'); return; }
    if (!phoneNumber || phoneNumber.length < 10) { showToast('Digite um número válido com DDD', 'error'); return; }

    setLoading(true);
    try {
      const fullNumber = `55${phoneNumber}`;
      addLog(`Criando instância ${instanceName} (${fullNumber})...`, 'info');

      const response = await fetch(`${EVOLUTION_BASE}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
        body: JSON.stringify({ instanceName, qrcode: true, number: fullNumber, integration: 'WHATSAPP-BAILEYS' })
      });
      const data = await response.json().catch(() => ({} as any));

      if (response.ok && data?.qrcode?.base64) {
        const { data: savedInstance, error } = await supabase
          .from('whatsapp_instances')
          .insert({
            user_id: userId,
            instance_name: instanceName,
            status: 'connecting',
            qr_code: data.qrcode.base64,
            hash: data.hash,
            number: fullNumber
          })
          .select()
          .single();
        if (error) throw error;

        setInstances(prev => [savedInstance as WhatsAppInstance, ...prev]);
        setSelectedInstance(instanceName);
        setQrCode(data.qrcode.base64);
        setQrTimer(QR_WINDOW_SECONDS);
        setQrExpired(false);

        addLog(`Instância ${instanceName} criada e aguardando conexão`, 'success');
        showToast('Instância criada! Escaneie o QR Code.', 'success');

        setInstanceName('');
        setPhoneNumber('');
      } else {
        const errMsg = data?.message || 'Erro ao criar instância na Evolution API';
        addLog(`Falha criação: ${errMsg}`, 'error');
        throw new Error(errMsg);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      addLog(`Erro ao criar instância: ${msg}`, 'error');
      showToast('Erro ao criar instância', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ========= AÇÕES DE INSTÂNCIA =========
  const handleShowSavedQR = async () => {
    if (!selectedInstance) { showToast('Nenhuma instância selecionada.', 'error'); return; }
    const mem = instances.find(i => i.instance_name === selectedInstance)?.qr_code || null;
    let qr = mem;
    if (!qr) {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('qr_code')
        .eq('user_id', userId!)
        .eq('instance_name', selectedInstance)
        .single();
      if (error) { addLog(`Erro ao ler QR: ${error.message}`, 'error'); showToast('QR salvo não encontrado.', 'error'); return; }
      qr = (data?.qr_code as string) || null;
    }
    if (!qr) { showToast('QR salvo não encontrado para esta instância.', 'error'); return; }

    setQrCode(qr);
    setQrExpired(false);
    setQrTimer(QR_WINDOW_SECONDS);
    addLog('QR salvo reexibido (sem gerar novo).', 'info');
  };

  const handleReconnectInstance = async (inst: WhatsAppInstance) => {
    if (!inst?.hash) { showToast('API key não encontrada para esta instância', 'error'); return; }
    try {
      addLog(`Solicitando reconexão da instância ${inst.instance_name}...`, 'info');
      const resp = await fetch(`${EVOLUTION_BASE}/instance/connect/${inst.instance_name}`, {
        method: 'GET',
        headers: { apikey: inst.hash }
      });

      let body: any = null;
      try { body = await resp.json(); } catch { body = null; }
      const txt = body ? JSON.stringify(body) : (await resp.text().catch(() => ''));

      if (resp.ok) {
        showToast('Reconexão solicitada.', 'success');
        addLog(`Reconexão solicitada. Resposta: ${txt}`, 'success');

        await supabase.from('whatsapp_instances')
          .update({ status: 'connecting' })
          .eq('user_id', userId!)
          .eq('instance_name', inst.instance_name);

        setInstances(prev => prev.map(i => (
          i.instance_name === inst.instance_name ? { ...i, status: 'connecting' } : i
        )));

        const qrb64 = extractQr(body);
        if (qrb64 && selectedInstance === inst.instance_name) {
          setQrCode(qrb64);
          setQrTimer(QR_WINDOW_SECONDS);
          setQrExpired(false);
        }
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
      const data = await resp.json().catch(() => ({} as any));
      const mapped = extractState(data);

      if (mapped === 'connected') {
        await supabase
          .from('whatsapp_instances')
          .update({ status: 'connected', connected_at: new Date().toISOString(), qr_code: null })
          .eq('user_id', userId!)
          .eq('instance_name', inst.instance_name);

        setInstances(prev =>
          prev.map(i =>
            i.instance_name === inst.instance_name ? { ...i, status: 'connected', qr_code: null } : i
          )
        );
        if (selectedInstance === inst.instance_name) {
          setQrCode(''); setQrTimer(0);
        }
        showToast('Estado: open (conectado)', 'success');
        addLog('Estado atual: open', 'success');
      } else if (mapped === 'disconnected') {
        await markInstanceDisconnected(inst.instance_name);
      } else if (mapped === 'connecting') {
        showToast('Estado: connecting', 'info');
        addLog('Estado atual: connecting', 'info');
        const qrb64 = extractQr(data);
        if (qrb64) {
          setSelectedInstance(inst.instance_name);
          setQrCode(qrb64);
          setQrTimer(QR_WINDOW_SECONDS);
          setQrExpired(false);
        }
      } else {
        showToast('Estado: unknown', 'info');
        addLog('Estado atual: unknown', 'info');
      }
    } catch (e) {
      showToast('Erro ao verificar status', 'error');
      addLog(`Erro ao consultar estado: ${String(e)}`, 'error');
    }
  };

  const handleDeleteInstance = async (inst: WhatsAppInstance) => {
    if (!inst.hash) { showToast('API key não encontrada', 'error'); return; }
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
        .eq('user_id', userId!)
        .eq('instance_name', inst.instance_name);
      if (error) {
        addLog(`Erro ao apagar no banco: ${error.message}`, 'error');
        showToast('Erro ao remover no banco', 'error');
        return;
      }

      setInstances(prev => prev.filter(i => i.instance_name !== inst.instance_name));
      if (selectedInstance === inst.instance_name) {
        setSelectedInstance(''); setQrCode(''); setQrTimer(0);
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
          else if (json && (json as any).id && (json as any).subject) groupsList = [json as EvolutionGroup];

          if (groupsList.length > 0) {
            setAvailableGroups(groupsList);
            setAvailGroupsPage(1); // reset pág.
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

  // ========= Adicionar pessoas ao grupo =========

  // NOVO: random com faixa [min,max] em segundos
  const computeRandomDelayMs = (): number => {
    let minS = Math.max(1, Math.floor(Number(randomMinSeconds) || 1));
    let maxS = Math.max(1, Math.floor(Number(randomMaxSeconds) || 1));
    if (minS > maxS) [minS, maxS] = [maxS, minS];
    const sec = Math.floor(Math.random() * (maxS - minS + 1)) + minS;
    return sec * 1000;
  };

  const getConfiguredDelayMs = (): number => {
    if (addRandom) return computeRandomDelayMs();
    const base = Math.max(0, Number(addDelayValue) || 0);
    const seconds = (addDelayUnit === 'minutes' ? base * 60 : base);
    return Math.max(1, seconds) * 1000;
  };

  const handleAddToGroup = async () => {
    if (!userId) { showToast('Sessão inválida', 'error'); return; }
    if (!selectedGroupJid) { showToast('Selecione um grupo', 'error'); return; }

    const chosenNames = multiInstancesMode ? instancesForAdd : [selectedInstance];
    const instPool: WhatsAppInstance[] = chosenNames
      .map(name => instances.find(i => i.instance_name === name))
      .filter((i): i is WhatsAppInstance => Boolean(i && i.hash));

    if (instPool.length === 0) {
      showToast('Nenhuma instância válida selecionada para adicionar.', 'error');
      addLog('Nenhuma instância válida no rodízio para adicionar.', 'error');
      return;
    }

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
    cancelAddRef.current = false;

    addLog(
      `ADD Grupo iniciado: grupo="${selectedGroupSubject || selectedGroupJid}" | leads=${toAdd.length} | modo=${distributionMode} | concorrência=${addConcurrency}`,
      'info'
    );
    showToast('Iniciando inclusão no grupo...', 'info');

    let ok = 0, fail = 0;
    let globalIndex = 0;

    const pickInstance = (idx: number) => {
      if (instances.length === 0) return null;
      const valid = instances
        .filter(i => (multiInstancesMode ? instancesForAdd.includes(i.instance_name) : i.instance_name === selectedInstance))
        .filter(i => i.status === 'connecting' || i.status === 'connected' || i.status === 'unknown')
        .filter(i => !!i.hash);

      if (valid.length === 0) return null;
      return distributionMode === 'sequential'
        ? valid[idx % valid.length]
        : valid[Math.floor(Math.random() * valid.length)];
    };

    const parseIsConnectionClosed = (status: number, text: string) => {
      try {
        const obj = JSON.parse(text);
        const msgs = obj?.response?.message || obj?.message;
        const flat = Array.isArray(msgs) ? msgs.join(' ').toLowerCase() : String(msgs || '').toLowerCase();
        return status === 400 && flat.includes('connection closed');
      } catch {
        return status === 400 && text.toLowerCase().includes('connection closed');
      }
    };

    const worker = async (wid: number) => {
      while (true) {
        if (cancelAddRef.current) break;

        const idx = globalIndex++;
        if (idx >= toAdd.length) break;

        await waitIfAddPaused();

        const c = toAdd[idx];
        const digits = (c.telefone || '').replace(/\D/g, '');
        const numberE164 = digits.startsWith('55') ? digits : `55${digits}`;

        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success && !cancelAddRef.current) {
          await waitIfAddPaused();
          attempts++;

          const instObj = pickInstance(idx);
          if (!instObj) {
            cancelAddRef.current = true;
            addLog('Inclusão abortada — sem instâncias ativas.', 'error');
            showToast('Todas as instâncias caíram. Inclusão abortada.', 'error');
            break;
          }

          try {
            const url = `${EVOLUTION_BASE}/group/updateParticipant/${instObj.instance_name}?groupJid=${encodeURIComponent(selectedGroupJid)}`;
            const body = { action: 'add', participants: [numberE164] };

            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: instObj.hash as string },
              body: JSON.stringify(body)
            });

            const txt = await resp.text().catch(() => '');

            if (parseIsConnectionClosed(resp.status, txt)) {
              await markInstanceDisconnected(instObj.instance_name);
              attempts = 0;
              continue;
            }

            if (resp.ok) {
              ok++;
              addLog(`✅ [${instObj.instance_name}] (${wid}) Adicionado ${numberE164} ao grupo.`, 'success');

              const { error: upErr } = await supabase
                .from('searches')
                .update({ status_add_gp: true, status: 'added', updated_at: new Date().toISOString() })
                .eq('user_id', userId!)
                .eq('id', c.id);
              if (upErr) addLog(`Falhou atualizar status do contato ${c.id}: ${upErr.message}`, 'error');

              success = true;
            } else {
              const lowerTxt = (txt || '').toLowerCase();
              const isRate = resp.status === 429 || lowerTxt.includes('rate-overlimit') || lowerTxt.includes('too many') || lowerTxt.includes('limit');
              if (isRate && attempts < 3) {
                const base = Math.max(getConfiguredDelayMs(), 2000);
                const jitter = 1000 + Math.random() * 2000;
                const wait = base + jitter;
                addLog(`⚠️ Rate-limit. Backoff ${(wait / 1000).toFixed(1)}s (tentativa ${attempts}/3)`, 'info');
                await sleep(wait);
                continue;
              }
              fail++;
              addLog(`❌ Falha ao adicionar ${numberE164}. HTTP ${resp.status} | ${txt}`, 'error');
              break;
            }
          } catch (e) {
            if (attempts < 3) {
              const wait = Math.max(getConfiguredDelayMs(), 2000);
              addLog(`⚠️ Exceção. Retentando em ${(wait / 1000).toFixed(1)}s (tentativa ${attempts}/3).`, 'info');
              await sleep(wait);
            } else {
              fail++;
              addLog(`❌ Erro final: ${String(e)}`, 'error');
            }
          }
        }

        const waitMs = getConfiguredDelayMs();
        addLog(`⏳ aguardando ${(waitMs / 1000).toFixed(1)}s...`, 'info');
        await sleep(waitMs);
      }
    };

    const N = Math.max(1, Math.min(addConcurrency, toAdd.length));
    await Promise.all(Array.from({ length: N }, (_, i) => worker(i)));

    setAddingToGroup(false);
    setAddPaused(false);
    addCtrl.current.paused = false;

    if (!cancelAddRef.current) {
      addLog(`Inclusão finalizada. Sucesso=${ok} | Falhas=${fail}`, 'info');
      showToast(`Inclusão finalizada — Sucesso: ${ok} | Falhas: ${fail}`, fail === 0 ? 'success' : 'error');
    } else {
      addLog(`Inclusão interrompida. Parcial — Sucesso=${ok} | Falhas=${fail}`, 'error');
    }

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

  // ========= Tabela — contatos =========
  const filteredContacts = contacts;
  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContacts = filteredContacts.slice(startIndex, endIndex);
  useEffect(() => { setCurrentPage(1); }, [itemsPerPage]);

  // ========= NOVO: Filtro/Paginação para grupos =========
  const filteredAvailGroups = availableGroups.filter(g => {
    const q = availGroupsSearch.toLowerCase().trim();
    if (!q) return true;
    return (g.subject || '').toLowerCase().includes(q) || (g.id || '').toLowerCase().includes(q);
  });
  const availStart = (availGroupsPage - 1) * availGroupsPerPage;
  const availEnd = availStart + availGroupsPerPage;
  const pagedAvailGroups = filteredAvailGroups.slice(availStart, availEnd);
  const availTotalPages = Math.ceil(filteredAvailGroups.length / availGroupsPerPage);
  useEffect(() => { setAvailGroupsPage(1); }, [availGroupsPerPage, availGroupsSearch]);

  const filteredSavedGroups = dbGroups.filter(g => {
    const q = savedGroupsSearch.toLowerCase().trim();
    if (!q) return true;
    return (g.group_subject || '').toLowerCase().includes(q) || (g.group_id || '').toLowerCase().includes(q);
  });
  const savedStart = (savedGroupsPage - 1) * savedGroupsPerPage;
  const savedEnd = savedStart + savedGroupsPerPage;
  const pagedSavedGroups = filteredSavedGroups.slice(savedStart, savedEnd);
  const savedTotalPages = Math.ceil(filteredSavedGroups.length / savedGroupsPerPage);
  useEffect(() => { setSavedGroupsPage(1); }, [savedGroupsPerPage, savedGroupsSearch]);

  // ========= Botões do QR =========
  const handleRegenerateQR = () => { handleShowSavedQR(); };
  const handleCloseQr = async () => {
    const inst = instances.find(i => i.instance_name === selectedInstance);
    if (inst) { await handleCheckStatus(inst); }
    setQrCode(''); setQrTimer(0); setQrExpired(false);
  };

  // ========= Render =========
  if (checking || userId === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-yellow-50">
        <div className="bg-white rounded-xl shadow-lg p-6 border border-lime-200 text-center">
          <p className="text-gray-700 font-medium">Preparando seu ambiente...</p>
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
        @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>

      {/* Header */}
      <header className="bg-white/90 backdrop-blur border-b border-yellow-300">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-12 w-auto sm:h-14 md:h-16 flex items-center">
              <img src="/zaploto.png" alt="ZapLoto" className="h-12 sm:h-14 md:h-16 w-auto object-contain" />
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-yellow-600 to-emerald-700 bg-clip-text text-transparent truncate">
              ZapLoto
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
        {/* KPIs */}
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

        {/* Instâncias WhatsApp */}
        <section className="bg-white rounded-xl shadow-lg p-6 border border-yellow-200">
          <h2 className="text-xl font-semibold text-emerald-800 mb-4">📱 Instâncias WhatsApp</h2>

          {/* Criar */}
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
            <p className="sm:col-span-3 text-xs text-gray-500">Formato do número: 81900000000 (DDD + número)</p>
          </div>

          {/* Lista */}
          {instances.length > 0 && (
            <div className="mb-2">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {instances.map(inst => {
                  const connected = inst.status === 'connected';
                  const connecting = inst.status === 'connecting';
                  return (
                    <div key={inst.id || inst.instance_name} className="p-5 rounded-xl border-2 border-yellow-200 bg-white hover:shadow-md transition">
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

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
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

          {/* QR */}
          {qrCode && (
            <div className="relative flex flex-col items-center mt-6 p-6 bg-gradient-to-br from-emerald-50 to-yellow-50 rounded-lg border-2 border-emerald-200">
              {qrTimer > 0 ? (
                <div className="mb-4 bg-gradient-to-r from-amber-500 to-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold animate-pulse">{qrTimer}s</div>
                    <div className="text-sm">
                      <div className="font-semibold">Tempo restante</div>
                      <div className="text-xs opacity-90">Escaneie antes que expire</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 bg-gray-800 text-white px-6 py-3 rounded-lg shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold">⚠️</div>
                    <div className="text-sm">
                      <div className="font-semibold">QR expirado</div>
                      <div className="text-xs opacity-90">Clique para liberar o QR salvo novamente</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="relative">
                <button
                  onClick={handleCloseQr}
                  className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full p-2 shadow hover:bg-red-700"
                  title="Fechar QR"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className={`bg-white p-6 rounded-lg shadow-xl border-4 border-emerald-500 ${qrExpired ? 'filter blur-md' : ''}`}>
                  <img src={qrCode} alt="QR Code" className="w-72 h-72 select-none pointer-events-none" />
                </div>

                {qrExpired && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-white/70 backdrop-blur-sm rounded-lg p-4 border border-emerald-300 text-center">
                      <p className="font-semibold text-emerald-900">QR expirado</p>
                      <p className="text-sm text-gray-700 mt-1">Clique para liberar o QR salvo novamente</p>
                      <button
                        onClick={handleRegenerateQR}
                        className="mt-3 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition text-sm"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Tentar reconectar (liberar QR salvo)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 text-center">
                <p className="text-lg font-semibold text-gray-800">📱 Escaneie com WhatsApp</p>
                <p className="text-sm text-gray-600 mt-1">WhatsApp → Aparelhos conectados → Conectar aparelho</p>
              </div>
            </div>
          )}

          {/* ======== GERENCIAR GRUPOS ======== */}
          <div className="mt-10">
            <h3 className="font-medium text-emerald-800 mb-3 flex items-center gap-2">
              <Users2 className="w-5 h-5 text-emerald-700" />
              Gerenciar Grupos da Instância 
            </h3>

            <div className="space-y-6">
              {/* Seletor de instância */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Instância selecionada</label>
                <select
                  value={selectedInstance}
                  onChange={e => setSelectedInstance(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
                >
                  <option value="">Escolha a instância</option>
                  {instances
                    .filter(i => i.status === 'connecting' || i.status === 'connected' || i.status === 'unknown')
                    .map(inst => (
                      <option key={inst.id || inst.instance_name} value={inst.instance_name}>
                        {inst.instance_name} (+{inst.number})
                      </option>
                    ))}
                </select>
              </div>

              {/* Botão carregar grupos da API */}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <button
                  onClick={fetchGroupsFromInstance}
                  disabled={groupsLoading || !selectedInstance}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-400 to-emerald-600 text-white rounded-lg hover:from-yellow-500 hover:to-emerald-700 transition disabled:opacity-50 text-sm font-medium border border-yellow-300"
                >
                  <RefreshCw className={`w-4 h-4 ${groupsLoading ? 'animate-spin' : ''}`} />
                  {groupsLoading ? `Carregando grupos... (${groupFetchElapsed}s)` : 'Carregar grupos da instância (API)'}
                </button>
                <span className="text-xs text-gray-500">A listagem abaixo é paginada (client-side).</span>
              </div>

              {/* ===== Tabela de GRUPOS SALVOS (Banco) — TEMA PRETO ===== */}
              <div className="border border-gray-800 rounded-xl p-4 bg-black text-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h4 className="font-semibold">Grupos salvos no banco</h4>
                    <p className="text-xs text-gray-400">Selecione um para usar no envio.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={savedGroupsSearch}
                      onChange={e => setSavedGroupsSearch(e.target.value)}
                      placeholder="Pesquisar nos grupos salvos..."
                      className="px-3 py-2 rounded-lg text-sm w-64 border border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500"
                    />
                    <select
                      value={savedGroupsPerPage}
                      onChange={e => setSavedGroupsPerPage(parseInt(e.target.value))}
                      className="px-3 py-2 rounded-lg text-sm border border-gray-700 bg-gray-900 text-gray-100"
                    >
                      {[5,10,25,50].map(n => <option key={n} value={n}>{n}/página</option>)}
                    </select>
                  </div>
                </div>

                {pagedSavedGroups.length === 0 ? (
                  <p className="text-sm text-gray-400 mt-3 italic">Nenhum grupo salvo para esta instância.</p>
                ) : (
                  <>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-black border-b border-gray-800">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-100">Nome</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-100">ID</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-100">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-black text-gray-100">
                          {pagedSavedGroups.map(g => (
                            <tr key={g.group_id} className="hover:bg-gray-900">
                              <td className="px-3 py-2">{g.group_subject || '(sem nome)'}</td>
                              <td className="px-3 py-2 font-mono text-xs break-all text-gray-300">{g.group_id}</td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={() => {
                                    setSelectedGroupJid(g.group_id);
                                    setSelectedGroupSubject(g.group_subject || '');
                                    showToast('Grupo selecionado', 'success');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                                >
                                  Selecionar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginação grupos salvos */}
                    <div className="flex items-center justify-between mt-3 text-gray-300">
                      <span className="text-xs">
                        Mostrando {savedStart + 1}–{Math.min(savedEnd, filteredSavedGroups.length)} de {filteredSavedGroups.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSavedGroupsPage(p => Math.max(1, p - 1))}
                          disabled={savedGroupsPage === 1}
                          className="px-3 py-1.5 border border-gray-700 rounded hover:bg-gray-900 disabled:opacity-50 text-gray-100"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: Math.min(5, savedTotalPages) }, (_, i) => {
                          let pageNum;
                          if (savedTotalPages <= 5) pageNum = i + 1;
                          else if (savedGroupsPage <= 3) pageNum = i + 1;
                          else if (savedGroupsPage >= savedTotalPages - 2) pageNum = savedTotalPages - 4 + i;
                          else pageNum = savedGroupsPage - 2 + i;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setSavedGroupsPage(pageNum)}
                              className={`px-3 py-1.5 rounded ${
                                savedGroupsPage === pageNum ? 'bg-emerald-600 text-white' : 'border border-gray-700 hover:bg-gray-900 text-gray-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setSavedGroupsPage(p => Math.min(savedTotalPages, p + 1))}
                          disabled={savedGroupsPage === savedTotalPages || savedTotalPages === 0}
                          className="px-3 py-1.5 border border-gray-700 rounded hover:bg-gray-900 disabled:opacity-50 text-gray-100"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ===== Tabela de GRUPOS DA API (paginada + filtro) — TEMA PRETO ===== */}
              <div className="border border-gray-800 rounded-xl p-4 bg-black text-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h4 className="font-semibold">Grupos da API (Evolution)</h4>
                    <p className="text-xs text-gray-400">Pesquise, pagine e salve no banco.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={availGroupsSearch}
                      onChange={e => setAvailGroupsSearch(e.target.value)}
                      placeholder="Pesquisar grupos da API..."
                      className="px-3 py-2 rounded-lg text-sm w-64 border border-gray-700 bg-gray-900 text-gray-100 placeholder-gray-500"
                    />
                    <select
                      value={availGroupsPerPage}
                      onChange={e => setAvailGroupsPerPage(parseInt(e.target.value))}
                      className="px-3 py-2 rounded-lg text-sm border border-gray-700 bg-gray-900 text-gray-100"
                    >
                      {[5,10,25,50].map(n => <option key={n} value={n}>{n}/página</option>)}
                    </select>
                  </div>
                </div>

                {groupsLoading ? (
                  <p className="text-sm text-gray-400 mt-3">Carregando...</p>
                ) : pagedAvailGroups.length === 0 ? (
                  <p className="text-sm text-gray-400 mt-3 italic">Nenhum grupo carregado. Use o botão acima para buscar.</p>
                ) : (
                  <>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-black border-b border-gray-800">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-gray-100">Nome</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-100">ID</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-100">Membros</th>
                            <th className="text-left px-3 py-2 font-semibold text-gray-100">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-black text-gray-100">
                          {pagedAvailGroups.map(g => (
                            <tr key={g.id} className="hover:bg-gray-900">
                              <td className="px-3 py-2">{g.subject || '(sem nome)'}</td>
                              <td className="px-3 py-2 font-mono text-xs break-all text-gray-300">{g.id}</td>
                              <td className="px-3 py-2">{typeof g.size === 'number' ? g.size : '—'}</td>
                              <td className="px-3 py-2">
                                <button
                                  onClick={async () => {
                                    if (!userId) { showToast('Sessão inválida', 'error'); return; }
                                    setSelectedGroupJid(g.id);
                                    setSelectedGroupSubject(g.subject || '');
                                    addLog(`Grupo selecionado: "${g.subject}" (${g.id})`, 'success');
                                    // tenta salvar (ignora duplicado)
                                    const { error } = await supabase.from('whatsapp_groups').insert({
                                      user_id: userId,
                                      instance_name: selectedInstance,
                                      group_id: g.id,
                                      group_subject: g.subject,
                                      picture_url: g.pictureUrl || null,
                                      size: typeof g.size === 'number' ? g.size : null
                                    });
                                    if (error) {
                                      if ((error as any).code === '23505') {
                                        addLog('Grupo já existe no banco (duplicado).', 'info');
                                      } else {
                                        addLog(`Erro ao salvar grupo: ${error.message}`, 'error');
                                      }
                                    } else {
                                      addLog('Grupo salvo no banco', 'success');
                                      // atualiza lista salvos
                                      const { data, error: e2 } = await supabase
                                        .from('whatsapp_groups')
                                        .select('group_id, group_subject')
                                        .eq('user_id', userId)
                                        .eq('instance_name', selectedInstance)
                                        .order('group_subject', { ascending: true });
                                      if (!e2 && data) setDbGroups(data as DbGroup[]);
                                    }
                                    showToast('Selecionado (e salvo, se ainda não estava).', 'success');
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700"
                                >
                                  Salvar & Selecionar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Paginação grupos da API */}
                    <div className="flex items-center justify-between mt-3 text-gray-300">
                      <span className="text-xs">
                        Mostrando {availStart + 1}–{Math.min(availEnd, filteredAvailGroups.length)} de {filteredAvailGroups.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setAvailGroupsPage(p => Math.max(1, p - 1))}
                          disabled={availGroupsPage === 1}
                          className="px-3 py-1.5 border border-gray-700 rounded hover:bg-gray-900 disabled:opacity-50 text-gray-100"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: Math.min(5, availTotalPages) }, (_, i) => {
                          let pageNum;
                          if (availTotalPages <= 5) pageNum = i + 1;
                          else if (availGroupsPage <= 3) pageNum = i + 1;
                          else if (availGroupsPage >= availTotalPages - 2) pageNum = availTotalPages - 4 + i;
                          else pageNum = availGroupsPage - 2 + i;
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setAvailGroupsPage(pageNum)}
                              className={`px-3 py-1.5 rounded ${
                                availGroupsPage === pageNum ? 'bg-emerald-600 text-white' : 'border border-gray-700 hover:bg-gray-900 text-gray-100'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setAvailGroupsPage(p => Math.min(availTotalPages, p + 1))}
                          disabled={availGroupsPage === availTotalPages || availTotalPages === 0}
                          className="px-3 py-1.5 border border-gray-700 rounded hover:bg-gray-900 disabled:opacity-50 text-gray-100"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Adicionar pessoas ao grupo */}
        <section className="bg-white rounded-xl shadow-lg p-6 border border-yellow-200">
          <h2 className="text-xl font-semibold text-emerald-800 mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" /> Adicionar pessoas ao grupo
          </h2>

          {/* Seleção base */}
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
                  .filter(i => i.status === 'connecting' || i.status === 'connected' || i.status === 'unknown')
                  .map(inst => (
                    <option key={inst.id || inst.instance_name} value={inst.instance_name}>
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
                    .filter(i => i.status === 'connecting' || i.status === 'connected' || i.status === 'unknown')
                    .map(inst => (
                      <button
                        key={inst.id || inst.instance_name}
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
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Modo de rodízio</label>
                <select
                  value={distributionMode}
                  onChange={e => setDistributionMode(e.target.value as DistributionMode)}
                  className="w-full max-w-xs px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-gray-900"
                >
                  <option value="sequential">Sequencial</option>
                  <option value="random">Aleatório</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Ajuda a reduzir risco de bloqueio.</p>
              </div>
            </div>
          </div>

          {/* Quantidade / Delay */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Atraso entre inclusões
              </label>

              <div className="flex flex-col gap-3">
                {/* Controles fixos (desabilitados quando random ON) */}
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

                {/* Botão toggle random */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAddRandom(v => !v)}
                    className={`px-4 py-3 h-[46px] rounded-lg border font-medium text-sm transition whitespace-nowrap ${
                      addRandom
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-700 border-yellow-200 hover:bg-yellow-50'
                    }`}
                    title="Usar atraso aleatório dentro de uma faixa (em segundos)"
                  >
                    {addRandom ? 'Random Time: ATIVO' : 'Random Time: DESATIVADO'}
                  </button>

                  {/* NOVO: faixa em segundos quando random ON */}
                  {addRandom && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        min={1}
                        value={randomMinSeconds}
                        onChange={(e) => setRandomMinSeconds(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-28 px-3 py-3 border-2 border-yellow-200 rounded-lg text-gray-900"
                        placeholder="mín (s)"
                      />
                      <span className="text-sm text-gray-600">a</span>
                      <input
                        type="number"
                        min={1}
                        value={randomMaxSeconds}
                        onChange={(e) => setRandomMaxSeconds(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-28 px-3 py-3 border-2 border-yellow-200 rounded-lg text-gray-900"
                        placeholder="máx (s)"
                      />
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Dica: 550s ≈ 9min10s e 950s ≈ 15min50s. Defina 0 para sem espera (não recomendado).
              </p>
            </div>
          </div>

          {/* Concorrência + Botões */}
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
            <p className="text-[11px] text-gray-500 mt-1">Use com cautela para evitar rate-limit.</p>
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

        {/* Upload CSV */}
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
              <p className="text-gray-500 text-sm mt-2">Importe contatos via CSV para começar</p>
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

              {/* Paginação contatos */}
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
