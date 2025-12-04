'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import Layout from '@/components/Layout';
import { useDashboardData, Contact, WhatsAppInstance } from '@/hooks/useDashboardData';
import {
  Eye,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Download,
  RefreshCw,
  Eraser,
  Users,
  List,
  Plus,
  Save,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

const ContactsPage = () => {
  const { checking } = useRequireAuth();
  const {
    userId,
    contacts,
    showToast,
    addLog,
    toasts,
    setToasts,
    loadInitialData,
    instances: dashboardInstances,
  } = useDashboardData();

  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [dbGroups, setDbGroups] = useState<Array<{ group_id: string; group_subject: string }>>([]);
  const [availableGroups, setAvailableGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [extractedContacts, setExtractedContacts] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [extractingContacts, setExtractingContacts] = useState(false);
  const [customListName, setCustomListName] = useState('');
  const [showCustomListModal, setShowCustomListModal] = useState(false);

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('user_id');
      sessionStorage.removeItem('profile_id');
      window.localStorage.removeItem('profile_id');
      document.cookie = 'user_id=; Path=/; Max-Age=0; SameSite=Lax';
    }
    window.location.href = '/login';
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!userId) return;
    if (!confirm('Tem certeza que deseja excluir este contato?')) return;

    try {
      const { error } = await supabase
        .from('searches')
        .delete()
        .eq('id', contactId)
        .eq('user_id', userId);

      if (error) {
        showToast('Erro ao excluir contato', 'error');
      } else {
        showToast('Contato excluído com sucesso', 'success');
        await loadInitialData();
      }
    } catch (error) {
      showToast('Erro ao excluir contato', 'error');
    }
  };

  const handleToggleStatus = async (contact: Contact) => {
    if (!userId) return;
    try {
      const newStatus = contact.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('searches')
        .update({ status: newStatus })
        .eq('id', contact.id)
        .eq('user_id', userId);

      if (error) {
        showToast('Erro ao atualizar status', 'error');
      } else {
        showToast('Status atualizado', 'success');
        await loadInitialData();
      }
    } catch (error) {
      showToast('Erro ao atualizar status', 'error');
    }
  };

  useEffect(() => {
    if (dashboardInstances) {
      setInstances(dashboardInstances);
    }
  }, [dashboardInstances]);

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
      setDbGroups((data || []) as Array<{ group_id: string; group_subject: string }>);
    }
  }, [selectedInstance, userId, addLog]);

  useEffect(() => {
    loadDbGroups();
  }, [loadDbGroups]);

  const handleClearList = () => {
    if (!confirm('Tem certeza que deseja limpar a lista de contatos? (Isso não exclui do banco de dados)')) return;
    setSelectedContacts(new Set());
    setSearchTerm('');
    setFilterStatus('all');
    setCurrentPage(1);
    showToast('Lista limpa com sucesso', 'success');
  };

  const handleDeleteAllContacts = async () => {
    if (!userId) return;
    if (!confirm('Tem certeza que deseja deletar TODOS os contatos? Esta ação não pode ser desfeita!')) return;

    try {
      const response = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'X-User-Id': userId },
      });

      const data = await response.json();
      if (response.ok) {
        showToast(`${data.data?.deleted || 0} contato(s) deletado(s) com sucesso`, 'success');
        await loadInitialData();
      } else {
        showToast(data.error || 'Erro ao deletar contatos', 'error');
      }
    } catch (error) {
      showToast('Erro ao deletar contatos', 'error');
    }
  };

  const handleExportCSV = () => {
    const contactsToExport = selectedContacts.size > 0
      ? contacts.filter(c => selectedContacts.has(c.id))
      : contacts;

    if (contactsToExport.length === 0) {
      showToast('Não há contatos para exportar', 'error');
      return;
    }

    const headers = ['Nome', 'Telefone', 'Status', 'Status_Disparo', 'Status_Add_GP'];
    const rows = contactsToExport.map(c => [
      c.name || '',
      c.telefone || '',
      c.status || '',
      c.status_disparo ? 'Sim' : 'Não',
      c.status_add_gp ? 'Sim' : 'Não',
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contatos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('CSV exportado com sucesso!', 'success');
  };

  const handleToggleSelectContact = (contactId: string) => {
    setSelectedContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedContacts.size === paginatedContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(paginatedContacts.map(c => c.id)));
    }
  };

  const handleLoadGroups = async () => {
    if (!userId || !selectedInstance) {
      showToast('Selecione uma instância', 'error');
      return;
    }

    setLoadingGroups(true);
    try {
      const response = await fetch('/api/groups/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({ instanceName: selectedInstance }),
      });

      const data = await response.json();
      if (response.ok && data.data) {
        const groups = data.data;
        setAvailableGroups(groups);
        
        // Salva todos os grupos no banco automaticamente
        let savedCount = 0;
        let errorCount = 0;
        
        for (const group of groups) {
          try {
            const saveResponse = await fetch('/api/groups', {
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
            
            if (saveResponse.ok) {
              savedCount++;
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
          }
        }
        
        // Recarrega os grupos do banco
        await loadDbGroups();
        
        if (savedCount > 0) {
          showToast(`${savedCount} grupo(s) carregado(s) e salvos${errorCount > 0 ? ` (${errorCount} erros)` : ''}`, 'success');
        } else {
          showToast('Grupos carregados, mas nenhum foi salvo', 'info');
        }
      } else {
        showToast(data.error || 'Erro ao carregar grupos', 'error');
      }
    } catch (error) {
      showToast('Erro ao carregar grupos', 'error');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleExtractContactsFromGroup = async () => {
    if (!userId || !selectedInstance || !selectedGroup) {
      showToast('Selecione uma instância e um grupo', 'error');
      return;
    }

    setExtractingContacts(true);
    try {
      const response = await fetch('/api/groups/extract-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({ instanceName: selectedInstance, groupId: selectedGroup }),
      });

      const data = await response.json();
      if (response.ok && data.data) {
        setExtractedContacts(data.data);
        showToast(`${data.data.length} contato(s) extraído(s)`, 'success');
      } else {
        showToast(data.error || 'Erro ao extrair contatos', 'error');
      }
    } catch (error) {
      showToast('Erro ao extrair contatos', 'error');
    } finally {
      setExtractingContacts(false);
    }
  };

  const handleDownloadExtractedContacts = () => {
    if (extractedContacts.length === 0) {
      showToast('Nenhum contato para baixar', 'error');
      return;
    }

    const headers = ['Nome', 'Telefone', 'Grupo'];
    const groupName = dbGroups.find(g => g.group_id === selectedGroup)?.group_subject || selectedGroup;
    const rows = extractedContacts.map(c => [
      c.name || '',
      c.telefone || '',
      groupName,
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contatos_extraidos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('Lista de contatos baixada!', 'success');
  };

  const handleImportExtractedContacts = async () => {
    if (!userId || extractedContacts.length === 0) {
      showToast('Nenhum contato extraído para importar', 'error');
      return;
    }

    try {
      const contactsToImport = extractedContacts.map(c => ({
        name: c.name || '',
        telefone: c.telefone || '',
      }));

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({ contacts: contactsToImport }),
      });

      const data = await response.json();
      if (response.ok) {
        showToast(`${data.data?.inserted || 0} contato(s) importado(s) com sucesso`, 'success');
        setExtractedContacts([]);
        await loadInitialData();
      } else {
        showToast(data.error || 'Erro ao importar contatos', 'error');
      }
    } catch (error) {
      showToast('Erro ao importar contatos', 'error');
    }
  };

  const handleCreateCustomList = async () => {
    if (!userId || !customListName.trim()) {
      showToast('Digite um nome para a lista', 'error');
      return;
    }

    const selectedContactsList = contacts.filter(c => selectedContacts.has(c.id));
    if (selectedContactsList.length === 0) {
      showToast('Selecione pelo menos um contato', 'error');
      return;
    }

    try {
      const response = await fetch('/api/contacts/custom-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({
          name: customListName.trim(),
          contactIds: Array.from(selectedContacts),
        }),
      });

      const data = await response.json();
      if (response.ok) {
        showToast('Lista personalizada criada com sucesso', 'success');
        setCustomListName('');
        setShowCustomListModal(false);
        setSelectedContacts(new Set());
      } else {
        showToast(data.error || 'Erro ao criar lista', 'error');
      }
    } catch (error) {
      showToast('Erro ao criar lista personalizada', 'error');
    }
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      const matchesSearch = !searchTerm || 
        (contact.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (contact.telefone?.includes(searchTerm));
      
      const matchesFilter = filterStatus === 'all' ||
        (filterStatus === 'active' && contact.status === 'active') ||
        (filterStatus === 'pending' && contact.status === 'pending') ||
        (filterStatus === 'added' && contact.status_add_gp) ||
        (filterStatus === 'sent' && contact.status_disparo);

      return matchesSearch && matchesFilter;
    });
  }, [contacts, searchTerm, filterStatus]);

  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedContacts = filteredContacts.slice(startIndex, startIndex + itemsPerPage);

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
      <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-4 z-50 space-y-2 max-w-sm sm:max-w-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 w-full sm:min-w-[320px] px-4 sm:px-6 py-4 rounded-lg shadow-lg text-white ${
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

      <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2">Contatos Ativos</h1>
            <p className="text-sm sm:text-base text-gray-600">Gerencie seus contatos ({contacts.length} total)</p>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <button
              onClick={handleExportCSV}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border-2 border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50 transition flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
            <button
              onClick={handleClearList}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border-2 border-amber-600 text-amber-600 rounded-lg hover:bg-amber-50 transition flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Eraser className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Limpar Lista</span>
              <span className="sm:hidden">Limpar</span>
            </button>
            <button
              onClick={handleDeleteAllContacts}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Deletar Contatos</span>
              <span className="sm:hidden">Deletar</span>
            </button>
            <button
              onClick={loadInitialData}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Atualizar</span>
              <span className="sm:hidden">Atualizar</span>
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Nome ou telefone..."
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 placeholder:text-black text-black bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-black bg-white"
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="pending">Pendentes</option>
                <option value="added">Adicionados</option>
                <option value="sent">Enviados</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Itens por página</label>
              <select
                value={itemsPerPage}
                onChange={e => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-black bg-white"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de Contatos */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6 overflow-x-hidden">
          {paginatedContacts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Nenhum contato encontrado</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedContacts.size === paginatedContacts.length && paginatedContacts.length > 0}
                    onChange={handleSelectAll}
                    className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-600">
                    {selectedContacts.size > 0 ? `${selectedContacts.size} selecionado(s)` : 'Selecionar todos'}
                  </span>
                </div>
                {selectedContacts.size > 0 && (
                  <button
                    onClick={() => setShowCustomListModal(true)}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm sm:text-base"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Criar Lista Personalizada</span>
                    <span className="sm:hidden">Criar Lista</span>
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {paginatedContacts.map(contact => (
                  <div
                    key={contact.id}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 border-2 rounded-lg transition ${
                      selectedContacts.has(contact.id)
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-start sm:items-center gap-3 flex-1 w-full sm:w-auto min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedContacts.has(contact.id)}
                        onChange={() => handleToggleSelectContact(contact.id)}
                        className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 flex-shrink-0 mt-1 sm:mt-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <h3 className="font-semibold text-gray-800 text-sm sm:text-base truncate">
                            {contact.name || `Contato ${contact.id.slice(0, 8)}`}
                          </h3>
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                              contact.status === 'active'
                                ? 'bg-emerald-100 text-emerald-700'
                                : contact.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {contact.status || 'N/A'}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1 break-all sm:break-normal">
                          {contact.telefone ? `+55 ${contact.telefone}` : 'Sem telefone'}
                        </p>
                        <div className="flex flex-wrap gap-2 sm:gap-4 mt-2 text-xs text-gray-500">
                          {contact.status_disparo && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Mensagem enviada
                            </span>
                          )}
                          {contact.status_add_gp && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Adicionado ao grupo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 sm:mt-0 w-full sm:w-auto justify-end sm:justify-start">
                      <button
                        onClick={() => handleToggleStatus(contact)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition flex-shrink-0 ${
                          contact.status === 'active' ? 'bg-emerald-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            contact.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(contact.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Excluir"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Paginação */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-6 pt-4 border-t border-gray-300">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="w-full sm:w-auto px-4 py-2 border-2 border-gray-400 text-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 hover:border-gray-500 transition font-medium"
                  >
                    Anterior
                  </button>
                  <span className="text-sm font-medium text-gray-800 text-center">
                    Página {currentPage} de {totalPages} ({filteredContacts.length} contatos)
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="w-full sm:w-auto px-4 py-2 border-2 border-gray-400 text-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 hover:border-gray-500 transition font-medium"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Seção: Gerenciar Instância */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Gerenciar Grupos da Instância</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Escolha a Instância*
              </label>
              <select
                value={selectedInstance}
                onChange={e => {
                  setSelectedInstance(e.target.value);
                  setAvailableGroups([]);
                  setSelectedGroup('');
                }}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-black bg-white"
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

        {/* Seção: Extrair Contatos do Grupo */}
        <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Extrair Contatos do Grupo</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selecione o Grupo*
              </label>
              <select
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
                disabled={!selectedInstance}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:opacity-50 text-black bg-white"
              >
                <option value="">
                  {!selectedInstance 
                    ? 'Selecione uma instância primeiro' 
                    : dbGroups.length === 0 
                    ? 'Carregue os grupos primeiro' 
                    : 'Selecione um Grupo'}
                </option>
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
            {selectedInstance && (
              <button
                onClick={handleLoadGroups}
                disabled={!selectedInstance || loadingGroups}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loadingGroups ? 'animate-spin' : ''}`} />
                {loadingGroups ? 'Carregando...' : 'Carregar Grupos da instância'}
              </button>
            )}
            <button
              onClick={handleExtractContactsFromGroup}
              disabled={!selectedGroup || !selectedInstance || extractingContacts}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50"
            >
              {extractingContacts ? 'Extraindo...' : 'Extrair Contatos'}
            </button>
          </div>
        </div>

        {/* Contatos Extraídos */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Contatos Extraídos</h2>
            <select className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-black bg-white">
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
                  <p className="text-sm text-gray-600">Número de Telefone: {contact.telefone}</p>
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
      </div>

      {/* Modal: Criar Lista Personalizada */}
      {showCustomListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-800">Criar Lista Personalizada</h3>
              <button
                onClick={() => {
                  setShowCustomListModal(false);
                  setCustomListName('');
                }}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome da Lista*
                </label>
                <input
                  type="text"
                  value={customListName}
                  onChange={e => setCustomListName(e.target.value)}
                  placeholder="Ex: Lista de Vendas"
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 placeholder:text-black text-black bg-white"
                />
              </div>
              <p className="text-sm text-gray-600">
                {selectedContacts.size} contato(s) selecionado(s) serão adicionados à lista
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setShowCustomListModal(false);
                    setCustomListName('');
                  }}
                  className="flex-1 px-4 py-2 border-2 border-gray-400 text-gray-800 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateCustomList}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center justify-center gap-2 font-medium"
                >
                  <Save className="w-4 h-4" />
                  Criar Lista
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ContactsPage;

