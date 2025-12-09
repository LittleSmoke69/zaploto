'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import Layout from '@/components/Layout';
import QRCodeModal from '@/components/QRCodeModal';
import { useDashboardData, WhatsAppInstance, DbGroup, EvolutionGroup } from '@/hooks/useDashboardData';
import {
  Copy,
  Trash2,
  RefreshCw,
  Link as LinkIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  Info,
  Menu,
} from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';
import { supabase } from '@/lib/supabase';

const EVOLUTION_BASE = process.env.NEXT_PUBLIC_EVOLUTION_BASE!;
const QR_WINDOW_SECONDS = 30;

const InstancesPage = () => {
  const { checking } = useRequireAuth();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  const {
    userId,
    instances,
    dbGroups,
    availableGroups,
    setInstances,
    setDbGroups,
    setAvailableGroups,
    showToast,
    addLog,
    toasts,
    setToasts,
    loadInitialData,
  } = useDashboardData();

  const [instanceName, setInstanceName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedInstance, setSelectedInstance] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [qrTimer, setQrTimer] = useState(0);
  const [qrExpired, setQrExpired] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [currentConnectingInstance, setCurrentConnectingInstance] = useState<string | null>(null);
  
  // Busca e paginação
  const [savedGroupsSearch, setSavedGroupsSearch] = useState('');
  const [savedGroupsPage, setSavedGroupsPage] = useState(1);
  const [savedGroupsPerPage, setSavedGroupsPerPage] = useState(10);
  const [availGroupsSearch, setAvailGroupsSearch] = useState('');
  const [availGroupsPage, setAvailGroupsPage] = useState(1);
  const [availGroupsPerPage, setAvailGroupsPerPage] = useState(10);
  
  // Contatos extraídos
  const [extractedContacts, setExtractedContacts] = useState<any[]>([]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) setPhoneNumber(value);
  };

  const handleCreateInstance = async () => {
    if (!userId) { showToast('Sessão inválida', 'error'); return; }
    if (!instanceName) { showToast('Digite um nome para a instância', 'error'); return; }
    if (!phoneNumber || phoneNumber.length < 10) { showToast('Digite um número válido com DDD', 'error'); return; }

    // Verifica limite de instâncias antes de criar
    try {
      const limitResponse = await fetch('/api/instances', {
        method: 'GET',
        headers: { 'X-User-Id': userId },
      });
      const limitData = await limitResponse.json();
      
      // Verifica se há informação de limite na resposta
      // A propriedade __limit é não enumerável, então acessamos diretamente
      const limitInfo = (limitData.data as any)?.__limit || limitData.data?.limit;
      if (limitInfo) {
        const { current, max, allowed } = limitInfo;
        if (!allowed) {
          showToast(`Limite de instâncias atingido! Você possui ${current} de ${max} instâncias permitidas.`, 'error');
          addLog(`Limite de instâncias atingido: ${current}/${max}`, 'error');
          return;
        }
      } else {
        // Fallback: verifica usando o número de instâncias carregadas
        // Se não conseguir obter o limite, usa o padrão de 20
        if (instances.length >= 20) {
          showToast(`Limite de instâncias atingido! Você possui ${instances.length} instâncias.`, 'error');
          addLog(`Limite de instâncias atingido: ${instances.length}`, 'error');
          return;
        }
      }
    } catch (limitError) {
      // Se falhar ao verificar limite, continua (a API também verifica)
      console.warn('Erro ao verificar limite de instâncias:', limitError);
    }

    setLoading(true);
    try {
      const fullNumber = `55${phoneNumber}`;
      addLog(`Criando instância ${instanceName} (${fullNumber})...`, 'info');

      const response = await fetch('/api/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({ instanceName, phoneNumber }),
      });

      const data = await response.json().catch((err) => {
        console.error('Erro ao parsear resposta:', err);
        return { success: false, error: 'Erro ao processar resposta do servidor' };
      });

      console.log('Resposta da API:', { response: { ok: response.ok, status: response.status }, data });

      if (response.ok && data.success && data.data) {
        const instanceData = data.data;
        // Tenta diferentes formatos de QR code
        const qrCodeValue = instanceData.qr_code || 
                          instanceData.qrcode?.base64 || 
                          instanceData.qrcode || 
                          '';
        
        console.log('QR Code recebido:', { 
          hasQrCode: !!qrCodeValue, 
          qrCodeLength: qrCodeValue?.length || 0,
          instanceDataKeys: Object.keys(instanceData)
        });
        
        if (qrCodeValue && qrCodeValue.trim().length > 0) {
          // Limpa o QR code removendo espaços e quebras de linha
          const cleanQrCode = qrCodeValue.trim().replace(/\s/g, '');
          
          // Valida se parece ser base64 válido
          if (/^[A-Za-z0-9+/=]+$/.test(cleanQrCode) && cleanQrCode.length >= 100) {
            showToast('Instância criada com sucesso!', 'success');
            addLog(`Instância ${instanceName} criada com QR Code válido`, 'success');
            
            // Define o QR code e abre o modal ANTES de recarregar os dados
            setQrCode(cleanQrCode);
            setQrTimer(QR_WINDOW_SECONDS);
            setQrExpired(false);
            setCurrentConnectingInstance(instanceName); // Marca qual instância está conectando
            setIsQRModalOpen(true); // Abre o modal
            
            // Limpa os campos
            setInstanceName('');
            setPhoneNumber('');
            
            // Recarrega os dados DEPOIS de abrir o modal (com pequeno delay para garantir que o modal abra)
            setTimeout(async () => {
              await loadInitialData();
            }, 100);
          } else {
            console.warn('QR Code recebido não parece ser válido:', {
              length: cleanQrCode.length,
              startsWith: cleanQrCode.substring(0, 20),
            });
            showToast('Instância criada, mas QR Code inválido. Verifique o status da instância.', 'info');
            addLog(`Instância ${instanceName} criada com QR Code inválido. Verifique o status.`, 'info');
            // Ainda tenta exibir, mas pode falhar
            setQrCode(cleanQrCode);
            setQrTimer(QR_WINDOW_SECONDS);
            setQrExpired(false);
            setCurrentConnectingInstance(instanceName); // Marca qual instância está conectando
            setIsQRModalOpen(true); // Abre o modal mesmo com QR inválido
            
            setInstanceName('');
            setPhoneNumber('');
            setTimeout(async () => {
              await loadInitialData();
            }, 100);
          }
        } else {
          showToast('Instância criada, mas QR Code não foi retornado. Verifique o status da instância.', 'info');
          addLog(`Instância ${instanceName} criada sem QR Code. Verifique o status.`, 'info');
          setInstanceName('');
          setPhoneNumber('');
          await loadInitialData();
        }
      } else {
        const errorMsg = data.error || data.message || 'Erro ao criar instância';
        
        // Verifica se é erro de limite atingido
        if (response.status === 429 || errorMsg.includes('Limite de instâncias')) {
          showToast(errorMsg, 'error');
          addLog(`Limite de instâncias atingido: ${errorMsg}`, 'error');
        } else {
          showToast(errorMsg, 'error');
          addLog(`Erro ao criar instância: ${errorMsg}`, 'error');
        }
        console.error('Erro na criação:', { response, data });
      }
    } catch (error) {
      showToast('Erro ao criar instância', 'error');
      addLog(`Erro: ${String(error)}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async (inst: WhatsAppInstance) => {
    if (!userId || !inst.instance_name) return;
    try {
      const response = await fetch(`/api/instances/${inst.instance_name}/status`, {
        headers: { 'X-User-Id': userId },
      });
      const data = await response.json();
      if (data.data) {
        // Se conectou, fecha o modal
        if (data.data.status === 'connected') {
          setIsQRModalOpen(false);
          setQrCode('');
          setQrTimer(0);
          showToast('Instância conectada com sucesso!', 'success');
        } else if (data.data.qrCode) {
          // Se tem QR code, abre o modal
          setQrCode(data.data.qrCode);
          setQrTimer(QR_WINDOW_SECONDS);
          setQrExpired(false);
          setIsQRModalOpen(true);
        }
        await loadInitialData();
        if (data.data.status !== 'connected') {
          showToast('Status atualizado', 'success');
        }
      }
    } catch (error) {
      showToast('Erro ao verificar status', 'error');
    }
  };

  const handleDeleteInstance = async (inst: WhatsAppInstance) => {
    if (!userId || !inst.instance_name) return;
    if (!confirm(`Tem certeza que deseja deletar a instância ${inst.instance_name}?`)) return;

    try {
      const response = await fetch(`/api/instances/${inst.instance_name}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userId },
      });
      const data = await response.json();
      if (response.ok) {
        showToast('Instância deletada', 'success');
        await loadInitialData();
      } else {
        showToast(data.error || 'Erro ao deletar', 'error');
      }
    } catch (error) {
      showToast('Erro ao deletar instância', 'error');
    }
  };

  const handleLoadGroups = async () => {
    if (!userId || !selectedInstance) {
      showToast('Selecione uma instância', 'error');
      return;
    }

    setGroupsLoading(true);
    try {
      const response = await fetch('/api/groups/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({ instanceName: selectedInstance }),
      });

      const data = await response.json();
      if (response.ok && data.data) {
        setAvailableGroups(data.data);
        showToast(`${data.data.length} grupo(s) carregado(s)`, 'success');
      } else {
        showToast(data.error || 'Erro ao carregar grupos', 'error');
      }
    } catch (error) {
      showToast('Erro ao carregar grupos', 'error');
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleSaveGroup = async (group: EvolutionGroup) => {
    if (!userId || !selectedInstance) return;
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({
          instanceName: selectedInstance,
          groupId: group.id,
          groupSubject: group.subject,
          pictureUrl: group.pictureUrl,
          size: group.size,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        showToast('Grupo salvo com sucesso', 'success');
        await loadDbGroups();
      } else {
        showToast(data.error || 'Erro ao salvar grupo', 'error');
      }
    } catch (error) {
      showToast('Erro ao salvar grupo', 'error');
    }
  };

  const handleExtractContacts = async () => {
    if (!userId || !selectedInstance || !selectedGroup) {
      showToast('Selecione uma instância e um grupo', 'error');
      return;
    }

    try {
      showToast('Extraindo contatos...', 'info');
      addLog(`Extraindo contatos do grupo ${selectedGroup}...`, 'info');

      const response = await fetch('/api/groups/extract-contacts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': userId 
        },
        body: JSON.stringify({ 
          instanceName: selectedInstance, 
          groupId: selectedGroup 
        }),
      });

      const data = await response.json();

      if (response.ok && data.data) {
        // Formata os contatos para o formato esperado pela página de instâncias
        const formatted = data.data.map((p: any) => ({
          id: p.id || '',
          name: p.name || '',
          phone: p.telefone || '',
          group: selectedGroup,
        }));

        setExtractedContacts(formatted);
        showToast(`${formatted.length} contato(s) extraído(s)`, 'success');
        addLog(`${formatted.length} contatos extraídos do grupo`, 'success');
      } else {
        showToast(data.error || 'Erro ao extrair contatos', 'error');
        addLog(`Erro: ${data.error || 'Erro desconhecido'}`, 'error');
      }
    } catch (error) {
      showToast('Erro ao extrair contatos', 'error');
      addLog(`Erro: ${String(error)}`, 'error');
    }
  };

  const handleDownloadExtractedContacts = () => {
    if (extractedContacts.length === 0) {
      showToast('Nenhum contato para baixar', 'error');
      return;
    }

    const headers = ['Nome', 'Telefone', 'Grupo'];
    const rows = extractedContacts.map(c => [
      c.name || '',
      c.phone || '',
      c.group || '',
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contatos_extraidos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('Lista de contatos baixada!', 'success');
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

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (qrTimer > 0) {
      setQrExpired(false);
      interval = setInterval(() => {
        setQrTimer(prev => {
          if (prev <= 1) {
            setQrExpired(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [qrTimer]);

  // Verifica se a instância que está conectando realmente conectou
  // Só fecha o modal se a instância específica que está mostrando o QR code conectou
  useEffect(() => {
    if (isQRModalOpen && currentConnectingInstance && instances.length > 0) {
      // Busca a instância específica que está conectando
      const targetInstance = instances.find(inst => inst.instance_name === currentConnectingInstance);
      
      // Se a instância específica conectou, fecha o modal
      if (targetInstance && targetInstance.status === 'connected') {
        setIsQRModalOpen(false);
        setQrCode('');
        setQrTimer(0);
        setCurrentConnectingInstance(null);
        showToast('Instância conectada com sucesso!', 'success');
      }
    }
  }, [instances, isQRModalOpen, currentConnectingInstance, showToast]);

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('user_id');
      sessionStorage.removeItem('profile_id');
      window.localStorage.removeItem('profile_id');
      document.cookie = 'user_id=; Path=/; Max-Age=0; SameSite=Lax';
    }
    window.location.href = '/login';
  };

  const copyApiKey = (hash: string) => {
    navigator.clipboard.writeText(hash);
    showToast('API Key copiada!', 'success');
  };

  const filteredSavedGroups = dbGroups.filter(g => {
    const q = savedGroupsSearch.toLowerCase().trim();
    if (!q) return true;
    return (g.group_subject || '').toLowerCase().includes(q) || (g.group_id || '').toLowerCase().includes(q);
  });

  const filteredAvailGroups = availableGroups.filter(g => {
    const q = availGroupsSearch.toLowerCase().trim();
    if (!q) return true;
    return (g.subject || '').toLowerCase().includes(q) || (g.id || '').toLowerCase().includes(q);
  });

  const pagedSavedGroups = filteredSavedGroups.slice(
    (savedGroupsPage - 1) * savedGroupsPerPage,
    savedGroupsPage * savedGroupsPerPage
  );

  const pagedAvailGroups = filteredAvailGroups.slice(
    (availGroupsPage - 1) * availGroupsPerPage,
    availGroupsPage * availGroupsPerPage
  );

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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Instâncias WhatsApp</h1>
            <p className="text-sm sm:text-base text-gray-600">Gerencie suas instâncias e grupos</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coluna Esquerda */}
          <div className="space-y-6">
            {/* Configure sua Instância */}
            <div className="bg-white rounded-xl shadow-md p-6" data-tour-id="instancias-criar">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Configure sua Instância</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome da Instância*
                  </label>
                  <input
                    type="text"
                    value={instanceName}
                    onChange={e => setInstanceName(e.target.value)}
                    placeholder="Ex: Instância 01"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black placeholder:text-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    (DDD) + Número*
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="81900000000"
                    maxLength={11}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black placeholder:text-black"
                  />
                  <p className="text-xs text-gray-500 mt-1">Formato: DDD + número (ex: 81900000000)</p>
                </div>
                <button
                  onClick={handleCreateInstance}
                  disabled={loading}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  {loading ? 'Criando...' : 'Criar Instância'}
                </button>
              </div>
            </div>

            {/* Gerenciar Grupos da Instância */}
            <div className="bg-white rounded-xl shadow-md p-6" data-tour-id="instancias-gerenciar-grupos">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Gerenciar Grupos da Instância</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Escolha a Instância*
                  </label>
                  <select
                    value={selectedInstance}
                    onChange={e => setSelectedInstance(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black"
                  >
                    <option value="">Selecione uma Instância</option>
                    {instances.map(inst => (
                      <option key={inst.id || inst.instance_name} value={inst.instance_name}>
                        {inst.instance_name} ({inst.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Grupos Salvos no Banco */}
            <div className="bg-white rounded-xl shadow-md p-6" data-tour-id="instancias-marcar-grupos">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-gray-800 break-words">Grupos Salvos no Banco</h2>
                  <p className="text-sm text-gray-500">Selecione um para usar no envio</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={savedGroupsSearch}
                      onChange={e => setSavedGroupsSearch(e.target.value)}
                      placeholder="Pesquisar..."
                      className="w-full sm:w-auto pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 text-black placeholder:text-black"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pagedSavedGroups.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Nenhum grupo salvo</p>
                ) : (
                  pagedSavedGroups.map(group => (
                    <div
                      key={group.group_id}
                      className={`p-3 border rounded-lg cursor-pointer transition ${
                        selectedGroup === group.group_id
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedGroup(group.group_id)}
                    >
                      <p className="font-medium text-gray-800">{group.group_subject || 'Sem nome'}</p>
                      <p className="text-xs text-gray-500 font-mono">{group.group_id}</p>
                    </div>
                  ))
                )}
              </div>
              {filteredSavedGroups.length > savedGroupsPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => setSavedGroupsPage(p => Math.max(1, p - 1))}
                    disabled={savedGroupsPage === 1}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    Página {savedGroupsPage} de {Math.ceil(filteredSavedGroups.length / savedGroupsPerPage)}
                  </span>
                  <button
                    onClick={() => setSavedGroupsPage(p => Math.min(Math.ceil(filteredSavedGroups.length / savedGroupsPerPage), p + 1))}
                    disabled={savedGroupsPage >= Math.ceil(filteredSavedGroups.length / savedGroupsPerPage)}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Grupos da API (Evolution) */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Grupos da API (Evolution)</h2>
                  <p className="text-sm text-gray-500">Pesquise, págine e salve no banco</p>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={availGroupsSearch}
                    onChange={e => setAvailGroupsSearch(e.target.value)}
                    placeholder="Pesquisar nos grupos da API..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 text-black placeholder:text-black"
                  />
                </div>
                <button
                  onClick={handleLoadGroups}
                  disabled={!selectedInstance || groupsLoading}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                  data-tour-id="instancias-carregar-grupos"
                >
                  {groupsLoading ? 'Carregando...' : 'Carregar Grupos da instância'}
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pagedAvailGroups.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    {availableGroups.length === 0 ? 'Nenhum grupo carregado' : 'Nenhum grupo encontrado na busca'}
                  </p>
                ) : (
                  pagedAvailGroups.map(group => (
                    <div
                      key={group.id}
                      className="p-3 border border-gray-200 rounded-lg flex justify-between items-center"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">{group.subject || 'Sem nome'}</p>
                        <p className="text-xs text-gray-500 font-mono">{group.id}</p>
                        {group.size && <p className="text-xs text-gray-500">{group.size} membros</p>}
                      </div>
                      <button
                        onClick={() => handleSaveGroup(group)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm transition"
                      >
                        Salvar
                      </button>
                    </div>
                  ))
                )}
              </div>
              {filteredAvailGroups.length > availGroupsPerPage && (
                <div className="flex justify-between items-center mt-4">
                  <button
                    onClick={() => setAvailGroupsPage(p => Math.max(1, p - 1))}
                    disabled={availGroupsPage === 1}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    Página {availGroupsPage} de {Math.ceil(filteredAvailGroups.length / availGroupsPerPage)}
                  </span>
                  <button
                    onClick={() => setAvailGroupsPage(p => Math.min(Math.ceil(filteredAvailGroups.length / availGroupsPerPage), p + 1))}
                    disabled={availGroupsPage >= Math.ceil(filteredAvailGroups.length / availGroupsPerPage)}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita */}
          <div className="space-y-6">
            {/* Extrair Contatos do Grupo */}
            <div className="bg-white rounded-xl shadow-md p-6" data-tour-id="instancias-extrair-contatos">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Extrair Contatos do Grupo</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecione o Grupo*
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={e => setSelectedGroup(e.target.value)}
                    disabled={!selectedInstance || dbGroups.length === 0}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 text-black"
                  >
                    <option value="">Selecione um Grupo</option>
                    {dbGroups.map(group => (
                      <option key={group.group_id} value={group.group_id}>
                        {group.group_subject || group.group_id}
                      </option>
                    ))}
                  </select>
                  {!selectedInstance && (
                    <p className="text-xs text-gray-500 mt-1">Selecione uma instância primeiro</p>
                  )}
                </div>
                <button
                  onClick={handleExtractContacts}
                  disabled={!selectedGroup || !selectedInstance}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                >
                  Extrair Contatos
                </button>
              </div>
            </div>

            {/* Contatos Extraídos */}
            <div className="bg-white rounded-xl shadow-md p-6" data-tour-id="instancias-lista-contatos">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Contatos Extraídos</h2>
                <select className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-black">
                  <option>Últimos 7 dias</option>
                  <option>Últimos 30 dias</option>
                </select>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {extractedContacts.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">Nenhum contato extraído</p>
                ) : (
                  extractedContacts.map((contact, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded-lg">
                      <p className="font-medium text-gray-800">{contact.name || 'Sem nome'}</p>
                      <p className="text-sm text-gray-600">Grupo Selecionado: {dbGroups.find(g => g.group_id === selectedGroup)?.group_subject || selectedGroup}</p>
                      <p className="text-sm text-gray-600">Número de Telefone: {contact.phone}</p>
                    </div>
                  ))
                )}
              </div>
              {extractedContacts.length > 0 && (
                <button
                  onClick={handleDownloadExtractedContacts}
                  className="w-full mt-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
                >
                  Baixar Lista Contatos Extraídos ({extractedContacts.length})
                </button>
              )}
            </div>

            {/* Lista de Instâncias */}
            {instances.length > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6" data-tour-id="instancias-conectadas">
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Lista de Instâncias</h2>
                <div className="space-y-3">
                  {instances.map(inst => {
                    const connected = inst.status === 'connected';
                    const connecting = inst.status === 'connecting';
                    return (
                      <div key={inst.id || inst.instance_name} className="p-4 border-2 border-gray-200 rounded-lg">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-gray-800">{inst.instance_name}</span>
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  connected
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : connecting
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {connected ? 'Conectado' : connecting ? 'Conectando' : inst.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600">+{inst.number || '—'}</p>
                          </div>
                          {inst.hash && (
                            <button
                              onClick={() => copyApiKey(inst.hash!)}
                              className="p-2 hover:bg-gray-100 rounded transition"
                              title="Copiar API Key"
                            >
                              <Copy className="w-4 h-4 text-gray-600" />
                            </button>
                          )}
                        </div>
                        {inst.hash && (
                          <div className="mb-3 p-2 bg-gray-50 rounded text-xs font-mono break-all text-gray-600">
                            {inst.hash}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleCheckStatus(inst)}
                            className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition"
                          >
                            <RefreshCw className="w-4 h-4 inline mr-1" />
                            Verificar
                          </button>
                          <button
                            onClick={() => handleDeleteInstance(inst)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition"
                          >
                            <Trash2 className="w-4 h-4 inline" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* QR Code Modal - Removido o bloco antigo, agora é um modal */}
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={isQRModalOpen}
        onClose={() => {
          setIsQRModalOpen(false);
          setQrCode('');
          setQrTimer(0);
          setCurrentConnectingInstance(null);
        }}
        qrCode={qrCode}
        qrTimer={qrTimer}
        qrExpired={qrExpired}
      />
    </Layout>
  );
};

export default InstancesPage;

