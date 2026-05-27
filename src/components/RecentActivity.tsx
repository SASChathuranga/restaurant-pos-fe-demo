import React from 'react';
import { formatMoney } from '../money';

interface Activity {
  id: string;
  type: 'sale' | 'payment' | 'stock' | 'order';
  message: string;
  timestamp: string;
  amount?: number;
  icon: string;
  iconColor: string;
}

interface RecentActivityProps {
  activities: Activity[];
  limit?: number;
}

const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
};

export const RecentActivity: React.FC<RecentActivityProps> = ({ 
  activities, 
  limit = 5 
}) => {
  const displayActivities = activities.slice(0, limit);

  const getIconBg = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-600',
      green: 'bg-green-100 text-green-600',
      orange: 'bg-orange-100 text-orange-600',
      red: 'bg-red-100 text-red-600'
    };
    return colors[color] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Recent Activity</h3>
        <span className="text-xs text-slate-500">{displayActivities.length} recent</span>
      </div>
      
      {displayActivities.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No recent activity</p>
      ) : (
        <div className="space-y-3">
          {displayActivities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${getIconBg(activity.iconColor)}`}>
                <span className="text-sm">{activity.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{activity.message}</p>
                {activity.amount !== undefined && (
                  <p className="text-xs text-slate-600">{formatMoney(activity.amount)}</p>
                )}
                <p className="text-xs text-slate-500">
                  {formatTimeAgo(activity.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
