import React from 'react';
import { useNavigate } from 'react-router-dom';

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();

  const actions = [
    {
      label: 'New Sale',
      icon: '🛒',
      path: '/pos',
      color: 'bg-blue-500 hover:bg-blue-600'
    },
    {
      label: 'Inventory',
      icon: '📦',
      path: '/inventory',
      color: 'bg-orange-500 hover:bg-orange-600'
    },
    {
      label: 'Shifts',
      icon: '👥',
      path: '/shifts',
      color: 'bg-purple-500 hover:bg-purple-600'
    },
    {
      label: 'GRN',
      icon: '📋',
      path: '/grn',
      color: 'bg-indigo-500 hover:bg-indigo-600'
    },
    {
      label: 'Settings',
      icon: '⚙️',
      path: '/settings',
      color: 'bg-gray-500 hover:bg-gray-600'
    }
  ];

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className={`flex flex-col items-center gap-1 rounded-lg p-3 text-white transition ${action.color}`}
          >
            <span className="text-2xl">{action.icon}</span>
            <span className="text-xs font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
