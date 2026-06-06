import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, iconColor = 'text-primary', trend, className }: StatCardProps) {
  return (
    <div className={cn('bg-card border border-border rounded-xl p-5 stat-card', className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-muted-foreground text-sm font-medium">{title}</span>
        <div className={cn('w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center')}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {trend && (
        <div className={cn('flex items-center gap-1 mt-2 text-xs', trend.value >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          <span>{trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
          <span className="text-muted-foreground">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
