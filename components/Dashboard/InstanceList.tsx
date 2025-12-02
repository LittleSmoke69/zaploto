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
  const displayInstances = instances.slice(0, 5);

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Lista de Instâncias</h3>
        {instances.length > 5 && (
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
          <p className="text-gray-500 text-sm">Nenhuma instância cadastrada</p>
        ) : (
          displayInstances.map((instance, index) => (
            <div
              key={instance.id || index}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
            >
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <div className="flex-1">
                <p className="font-medium text-gray-800">{instance.instance_name}</p>
                <p className="text-xs text-gray-500">
                  {instance.number || 'N/A'} • {instance.status}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default InstanceList;

