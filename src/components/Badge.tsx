import type { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

export default function Badge({
  variant = 'default',
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
        ${variantStyles[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

// Helper to map status to badge variant
export function getStatusBadgeVariant(
  status: string
): BadgeVariant {
  const statusMap: Record<string, BadgeVariant> = {
    // General
    ACTIVE: 'success',
    INACTIVE: 'default',
    BLOCKED: 'danger',
    
    // PO / GRN
    DRAFT: 'default',
    PENDING: 'warning',
    APPROVED: 'success',
    RECEIVED: 'success',
    CANCELLED: 'danger',
    REJECTED: 'danger',
    
    // Sale
    OPEN: 'warning',
    PARTIALLY_PAID: 'info',
    FULLY_PAID: 'success',
    COMPLETED: 'success',
    VOIDED: 'danger',
    
    // Batch alerts
    NORMAL: 'success',
    WARNING: 'warning',
    CRITICAL: 'danger',
    EXPIRED: 'danger',
    DEPLETED: 'default',
    
    // Quality
    ACCEPTED: 'success',
    PARTIAL: 'warning',
    
    // Customer tiers
    BASIC: 'default',
    SILVER: 'info',
    GOLD: 'warning',
    PLATINUM: 'success',
  };

  return statusMap[status] || 'default';
}
