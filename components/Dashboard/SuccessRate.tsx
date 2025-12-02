'use client';

import React from 'react';

interface SuccessRateProps {
  rate: number;
}

const SuccessRate: React.FC<SuccessRateProps> = ({ rate }) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Sucesso de Adição aos Grupos</h3>
      <div className="text-center">
        <div className="text-6xl font-bold text-emerald-600 mb-4">{rate}%</div>
        <div className="relative w-full h-8 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500 rounded-full"
            style={{ width: `${rate}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">Taxa de sucesso</p>
      </div>
    </div>
  );
};

export default SuccessRate;

