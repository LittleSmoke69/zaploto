'use client';

import React, { useState } from 'react';
import { useRequireAuth } from '@/utils/useRequireAuth';
import Layout from '@/components/Layout';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  Upload,
  Send,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  FileText,
  Menu,
} from 'lucide-react';
import { useSidebar } from '@/contexts/SidebarContext';

const ImportContactsPage = () => {
  const { checking } = useRequireAuth();
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  const {
    userId,
    showToast,
    addLog,
    toasts,
    setToasts,
    loadInitialData,
  } = useDashboardData();

  const [csvContacts, setCsvContacts] = useState<Partial<any>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvImporting, setCsvImporting] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>('');

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('user_id');
      sessionStorage.removeItem('profile_id');
      window.localStorage.removeItem('profile_id');
      document.cookie = 'user_id=; Path=/; Max-Age=0; SameSite=Lax';
    }
    window.location.href = '/login';
  };

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

    const parsed: Partial<any>[] = [];
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
        setCsvText(text);
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          showToast('Nenhum contato válido encontrado', 'error');
          setCsvContacts([]);
          return;
        }
        if (parsed.length > 10000) {
          showToast('Limite de 10.000 contatos', 'error');
          setCsvContacts([]);
          return;
        }
        setCsvContacts(parsed);
        showToast(`Arquivo lido: ${parsed.length} contato(s)`, 'success');
        addLog(`CSV carregado (${file.name}) com ${parsed.length} contatos`, 'success');
      } catch {
        showToast('Erro ao ler CSV', 'error');
        addLog('Erro parse CSV', 'error');
        setCsvContacts([]);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImportCSV = async () => {
    if (!userId) {
      showToast('Sessão inválida', 'error');
      return;
    }
    if (csvContacts.length === 0) {
      showToast('Nenhum contato carregado', 'error');
      return;
    }
    if (csvContacts.length > 10000) {
      showToast('Máximo 10.000 contatos', 'error');
      return;
    }

    setCsvImporting(true);
    addLog(`Importando ${csvContacts.length} contatos...`, 'info');
    showToast('Importando contatos...', 'info');

    try {
      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
        },
        body: JSON.stringify({ csvText }),
      });

      const data = await response.json();

      if (response.ok) {
        showToast(
          `Importação concluída: ${data.data.inserted} sucesso, ${data.data.failed} falhas`,
          data.data.failed === 0 ? 'success' : 'error'
        );
        addLog(
          `Importação finalizada. Sucesso=${data.data.inserted}, Falha=${data.data.failed}`,
          data.data.failed === 0 ? 'success' : 'error'
        );
        await loadInitialData();
        setCsvContacts([]);
        setCsvFileName('');
        setCsvText('');
      } else {
        showToast(data.error || 'Erro ao importar', 'error');
      }
    } catch (error) {
      showToast('Erro ao importar contatos', 'error');
      addLog(`Erro: ${String(error)}`, 'error');
    } finally {
      setCsvImporting(false);
    }
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Importar Contatos</h1>
            <p className="text-sm sm:text-base text-gray-600">Importe contatos via arquivo CSV</p>
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

        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Importar Contatos via CSV</h2>

          {/* Regras do arquivo */}
          <div className="mb-6 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-lg" data-tour-id="importar-regras">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Regras do arquivo:
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span><strong>Formato:</strong> .csv (até 10.000 linhas)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span>
                  <strong>Campo obrigatório de telefone</strong> (case-insensitive): telefone, phone, phone_number, number, phone_numbwer_number
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span><strong>Opcional:</strong> name ou nome</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-1">•</span>
                <span><strong>Telefone com DDD:</strong> ex. 81999998888</span>
              </li>
            </ul>
          </div>

          {/* Upload */}
          <div className="space-y-4">
            <div data-tour-id="importar-upload">
              <label className="block w-full">
                <div className="cursor-pointer flex flex-col items-center justify-center gap-3 px-6 py-8 bg-white border-2 border-dashed border-emerald-300 rounded-lg hover:bg-emerald-50 transition text-center">
                  <Upload className="w-8 h-8 text-emerald-600" />
                  <div>
                    <span className="text-emerald-600 font-medium">Clique para escolher arquivo</span>
                    <span className="text-gray-600"> ou arraste e solte</span>
                  </div>
                  {csvFileName && (
                    <p className="text-sm text-gray-600 mt-2">
                      Arquivo selecionado: <strong>{csvFileName}</strong>
                    </p>
                  )}
                  <p className="text-xs text-gray-500" data-tour-id="importar-exemplo">CSV até 10.000 linhas</p>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVSelect}
                  className="hidden"
                />
              </label>
            </div>

            {csvContacts.length > 0 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>{csvContacts.length}</strong> contato(s) carregado(s) e pronto(s) para importar
                </p>
              </div>
            )}

            <button
              onClick={handleImportCSV}
              disabled={csvImporting || csvContacts.length === 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {csvImporting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Importar {csvContacts.length || 0} contato(s)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ImportContactsPage;

