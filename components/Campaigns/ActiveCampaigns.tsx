'use client';

import React from 'react';
import { Pause, Play, Trash2, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Campaign } from '@/hooks/useDashboardData';

interface ActiveCampaignsProps {
  campaigns: Campaign[];
  onPause?: (campaignId: string) => void;
  onResume?: (campaignId: string) => void;
  onDelete?: (campaignId: string) => void;
}

const ActiveCampaigns: React.FC<ActiveCampaignsProps> = ({
  campaigns,
  onPause,
  onResume,
  onDelete,
}) => {
  const activeCampaigns = campaigns.filter(
    c => c.status === 'running' || c.status === 'paused'
  );

  if (activeCampaigns.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Campanhas Ativas</h2>
        <p className="text-sm text-gray-500 text-center py-4">Nenhuma campanha ativa no momento</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Campanhas Ativas</h2>
      <div className="space-y-4">
        {activeCampaigns.map(campaign => {
          const total = campaign.total_contacts || 1;
          const processed = campaign.processed_contacts || 0;
          const failed = campaign.failed_contacts || 0;
          const completed = processed + failed;
          const progressPercentage = Math.round((completed / total) * 100);
          const successPercentage = completed > 0 ? Math.round((processed / completed) * 100) : 0;
          const failedPercentage = completed > 0 ? Math.round((failed / completed) * 100) : 0;
          const isPaused = campaign.status === 'paused';

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
                        isPaused
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isPaused ? 'Pausada' : 'Em Execução'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mb-2">{campaign.id}</p>
                </div>
                <div className="flex gap-2">
                  {isPaused ? (
                    <button
                      onClick={() => onResume?.(campaign.id)}
                      className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition"
                      title="Retomar"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => onPause?.(campaign.id)}
                      className="p-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded transition"
                      title="Pausar"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => onDelete?.(campaign.id)}
                    className="p-2 bg-red-600 hover:bg-red-700 text-white rounded transition"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
                    className="bg-emerald-600 h-2.5 rounded-full transition-all"
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
                    Criada em: {new Date(campaign.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ActiveCampaigns;

