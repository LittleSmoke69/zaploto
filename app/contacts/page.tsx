'use client';

import React, { useState, useMemo } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import Layout from '@/components/Layout';
import { useDashboardData, Contact } from '@/hooks/useDashboardData';
import {
  Eye,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Download,
  RefreshCw,
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
  } = useDashboardData();

  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

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

  const handleExportCSV = () => {
    if (contacts.length === 0) {
      showToast('Não há contatos para exportar', 'error');
      return;
    }

    const headers = ['Nome', 'Telefone', 'Status', 'Status_Disparo', 'Status_Add_GP'];
    const rows = contacts.map(c => [
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
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Contatos Ativos</h1>
            <p className="text-gray-600">Gerencie seus contatos ({contacts.length} total)</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 border-2 border-emerald-600 text-emerald-600 rounded-lg hover:bg-emerald-50 transition flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Exportar CSV
            </button>
            <button
              onClick={loadInitialData}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Atualizar
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Nome ou telefone..."
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
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
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
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
        <div className="bg-white rounded-xl shadow-md p-6">
          {paginatedContacts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Nenhum contato encontrado</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginatedContacts.map(contact => (
                  <div
                    key={contact.id}
                    className="flex items-center justify-between p-4 border-2 border-gray-200 rounded-lg hover:border-emerald-300 transition"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-800">
                          {contact.name || `Contato ${contact.id.slice(0, 8)}`}
                        </h3>
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
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
                      <p className="text-sm text-gray-600 mt-1">
                        {contact.telefone ? `+55 ${contact.telefone}` : 'Sem telefone'}
                      </p>
                      <div className="flex gap-4 mt-2 text-xs text-gray-500">
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleStatus(contact)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
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
                <div className="flex justify-between items-center mt-6 pt-4 border-t">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-gray-600">
                    Página {currentPage} de {totalPages} ({filteredContacts.length} contatos)
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ContactsPage;

