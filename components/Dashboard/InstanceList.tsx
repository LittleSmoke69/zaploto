'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';

interface Instance {
  id?: string;
  instance_name: string;
  status: string;
  number?: string;
}

interface InstanceListProps {
  instances: Instance[];
  onViewAll?: () => void;
}

const InstanceList: React.FC<InstanceListProps> = ({ instances, onViewAll }) => {
  // Filtra apenas instâncias conectadas e pega as 5 primeiras
  const connectedInstances = instances.filter(inst => inst.status === 'connected');
  const displayInstances = connectedInstances.slice(0, 5);

  // Função para traduzir status
  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      'connected': 'Conectada',
      'disconnected': 'Desconectada',
      'connecting': 'Conectando...',
      'error': 'Erro',
    };
    return statusMap[status] || status;
  };

  // Função para obter cor do status
  const getStatusColor = (status: string) => {
    if (status === 'connected') return 'text-emerald-600';
    if (status === 'connecting') return 'text-amber-600';
    if (status === 'disconnected') return 'text-gray-500';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Instâncias Conectadas</h3>
        {connectedInstances.length > 5 && (
          <button
            onClick={onViewAll}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Ver todas
          </button>
        )}
      </div>
      <div className="space-y-3">
        {displayInstances.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma instância conectada</p>
        ) : (
          displayInstances.map((instance, index) => (
            <div
              key={instance.id || index}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
            >
              <MessageSquare className={`w-5 h-5 ${getStatusColor(instance.status)}`} />
              <div className="flex-1">
                <p className="font-medium text-gray-800">{instance.instance_name}</p>
                <p className="text-xs text-gray-500">
                  {instance.number || 'N/A'} • <span className={getStatusColor(instance.status)}>{getStatusLabel(instance.status)}</span>
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      {connectedInstances.length === 0 && instances.length > 0 && (
        <p className="text-xs text-amber-600 mt-2">
          Total de instâncias: {instances.length} (nenhuma conectada no momento)
        </p>
      )}
    </div>
  );
};

export default InstanceList;

