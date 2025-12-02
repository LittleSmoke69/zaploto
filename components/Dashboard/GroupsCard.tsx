'use client';

import React from 'react';

interface GroupsCardProps {
  title: string;
  count: number;
  onViewAll?: () => void;
}

const GroupsCard: React.FC<GroupsCardProps> = ({ title, count, onViewAll }) => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Ver todas
          </button>
        )}
      </div>
      <div className="text-center">
        <div className="text-4xl font-bold text-emerald-600">{count}</div>
        <p className="text-sm text-gray-500 mt-2">grupos cadastrados</p>
      </div>
    </div>
  );
};

export default GroupsCard;

