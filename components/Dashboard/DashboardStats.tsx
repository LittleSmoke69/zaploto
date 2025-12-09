'use client';

import React from 'react';
import { MessageSquare, UserPlus, Clock, Wifi, XCircle, AlertCircle } from 'lucide-react';
import KPICard from './KPICard';

interface DashboardStatsProps {
  kpiSent: number;
  kpiAdded: number;
  kpiPending: number;
  kpiConnected: number;
  kpiFailedSends: number;
  kpiFailedAdds: number;
}

const DashboardStats: React.FC<DashboardStatsProps> = ({
  kpiSent,
  kpiAdded,
  kpiPending,
  kpiConnected,
  kpiFailedSends,
  kpiFailedAdds,
}) => {
  const kpis = [
    { label: 'Mensagens Enviadas', value: kpiSent, icon: MessageSquare, gradient: 'from-blue-400 to-blue-600' },
    { label: 'Adicionados ao Grupo', value: kpiAdded, icon: UserPlus, gradient: 'from-emerald-400 to-emerald-600' },
    { label: 'Pendentes', value: kpiPending, icon: Clock, gradient: 'from-yellow-400 to-yellow-600' },
    { label: 'Instâncias Conectadas', value: kpiConnected, icon: Wifi, gradient: 'from-green-400 to-green-600' },
    { label: 'Disparos com Falha', value: kpiFailedSends, icon: XCircle, gradient: 'from-red-400 to-red-600' },
    { label: 'Falhas ao Adicionar', value: kpiFailedAdds, icon: AlertCircle, gradient: 'from-orange-400 to-orange-600' },
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 w-full">
      {kpis.map((kpi, index) => (
        <KPICard
          key={index}
          label={kpi.label}
          value={kpi.value}
          icon={kpi.icon}
          gradient={kpi.gradient}
        />
      ))}
    </section>
  );
};

export default DashboardStats;

