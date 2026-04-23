import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'hot' | 'warm' | 'cold' | 'success' | 'warning' | 'error' | 'neutral' | 'info';
  size?: 'sm' | 'md';
}

export function Badge({ children, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const variants = {
    hot: 'bg-red-50 text-red-600 border border-red-100',
    warm: 'bg-amber-50 text-amber-600 border border-amber-100',
    cold: 'bg-blue-50 text-blue-600 border border-blue-100',
    success: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    warning: 'bg-yellow-50 text-yellow-600 border border-yellow-100',
    error: 'bg-red-50 text-red-600 border border-red-100',
    neutral: 'bg-gray-100 text-gray-600 border border-gray-200',
    info: 'bg-sky-50 text-sky-600 border border-sky-100',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-full ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}
