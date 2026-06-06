'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/client';
import { formatDate, formatRelative } from '@/lib/utils';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, WORKFLOW_STAGE_LABELS, WORKFLOW_STAGE_COLORS } from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Package, Layers, ClipboardCheck, Truck, Cpu, AlertTriangle, ArrowRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Order, OrderItem, Machine } from '@/lib/types';
import type { WorkflowStage, OrderStatus } from '@/lib/types';

interface StageCount { stage: WorkflowStage; count: number; }
interface MachineStatusCount { status: string; count: number; }

export default function DashboardPage() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeItems, setActiveItems] = useState<OrderItem[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      const [ordersRes, itemsRes, machinesRes, stockRes] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(8),
        supabase.from('order_items').select('id, workflow_stage, status, order_id').in('status', ['active', 'pending']),
        supabase.from('machines').select('id, status, is_active').eq('is_active', true),
        supabase.from('material_stock').select('quantity, material:materials(name, unit)'),
      ]);

      const fetchedOrders = (ordersRes.data || []) as Order[];
      const fetchedItems = (itemsRes.data || []) as OrderItem[];
      const fetchedMachines = (machinesRes.data || []) as Machine[];

      setOrders(fetchedOrders);
      setActiveItems(fetchedItems);
      setMachines(fetchedMachines);

      // Stage distribution
      const stageMap: Partial<Record<WorkflowStage, number>> = {};
      for (const item of fetchedItems) {
        stageMap[item.workflow_stage] = (stageMap[item.workflow_stage] || 0) + 1;
      }
      const stages: WorkflowStage[] = ['production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping'];
      setStageCounts(stages.map(s => ({ stage: s, count: stageMap[s] || 0 })));

      // Low stock alerts (< 100 units)
      const alerts: string[] = [];
      for (const entry of (stockRes.data || [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mat = entry as any;
        const matName = Array.isArray(mat.material) ? mat.material[0] : mat.material;
        if (mat.quantity < 100 && matName) {
          alerts.push(`${matName.name} (${mat.quantity} ${matName.unit} remaining)`);
        }
      }
      setLowStockAlerts(alerts.slice(0, 4));
      setLoading(false);
    }
    load();
  }, []);

  const activeOrdersCount = orders.filter(o => o.status === 'in_production').length;
  const inProductionCount = activeItems.filter(i => i.workflow_stage === 'production').length;
  const qcPendingCount = activeItems.filter(i => i.workflow_stage === 'qc').length;
  const shippingCount = activeItems.filter(i => i.workflow_stage === 'shipping').length;

  const machineStats = machines.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const stageColors: Record<WorkflowStage, string> = {
    production: '#3b82f6', finishing: '#f59e0b', qc: '#f97316',
    packing_pool: '#10b981', warehouse: '#14b8a6', shipping: '#38bdf8', remnants: '#64748b',
  };

  if (loading) {
    return (
      <div>
        <div className="px-6 py-5 border-b border-border">
          <div className="h-7 w-48 bg-muted rounded animate-pulse" />
        </div>
        <div className="p-6 grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      >
        <Link href="/orders/new">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
            <Package className="w-4 h-4" />
            {t('dashboard.newOrder')}
          </Button>
        </Link>
      </PageHeader>

      <div className="p-6 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title={t('dashboard.activeOrders')} value={activeOrdersCount} subtitle={t('dashboard.inProductionSub')} icon={Package} />
          <StatCard title={t('dashboard.inProduction')} value={inProductionCount} subtitle={t('dashboard.inProductionSub')} icon={Layers} iconColor="text-blue-400" />
          <StatCard title={t('dashboard.qcPending')} value={qcPendingCount} subtitle={t('dashboard.qcPendingSub')} icon={ClipboardCheck} iconColor="text-amber-400" />
          <StatCard title={t('dashboard.readyToShip')} value={shippingCount} subtitle={t('dashboard.readyToShipSub')} icon={Truck} iconColor="text-sky-400" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Stage Distribution Chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('dashboard.pipeline')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.pipelineDesc')}</p>
              </div>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stageCounts} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="stage"
                  tickFormatter={s => WORKFLOW_STAGE_LABELS[s as WorkflowStage]?.split(' ')[0] || s}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#f1f5f9', fontSize: '12px' }}
                  formatter={(v, _, p) => [v, WORKFLOW_STAGE_LABELS[p.payload?.stage as WorkflowStage] || p.name]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {stageCounts.map(entry => (
                    <Cell key={entry.stage} fill={stageColors[entry.stage] || '#64748b'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Machine Status */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('dashboard.machineStatus')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.machinesTotal', { count: machines.length })}</p>
              </div>
              <Cpu className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-3">
              {[
                { key: 'available', label: t('machines.available'), color: 'bg-emerald-500' },
                { key: 'in_use', label: t('machines.inUse'), color: 'bg-amber-500' },
                { key: 'maintenance', label: t('machines.maintenance'), color: 'bg-orange-500' },
                { key: 'offline', label: t('machines.offline'), color: 'bg-red-500' },
              ].map(({ key, label, color }) => {
                const count = machineStats[key] || 0;
                const pct = machines.length ? Math.round((count / machines.length) * 100) : 0;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${color}`} />
                        <span className="text-muted-foreground">{label}</span>
                      </div>
                      <span className="text-foreground font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <Link href="/machines" className="mt-4 flex items-center gap-1 text-xs text-primary hover:underline">
              {t('dashboard.manageMachines')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Orders */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{t('dashboard.recentOrders')}</h3>
              <Link href="/orders" className="text-xs text-primary hover:underline flex items-center gap-1">
                {t('dashboard.viewAll')} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {orders.length === 0 ? (
                <div className="px-5 py-8 text-center text-muted-foreground text-sm">
                  {t('dashboard.noOrders')} <Link href="/orders/new" className="text-primary hover:underline">{t('dashboard.createFirst')}</Link>
                </div>
              ) : (
                orders.slice(0, 6).map(order => (
                  <Link key={order.id} href={`/orders/${order.id}`}>
                    <div className="px-5 py-3 flex items-center gap-4 hover:bg-secondary/50 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-primary">{order.order_code.slice(-2)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{order.order_code}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {order.product_model || t('dashboard.unknownProduct')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge
                          label={ORDER_STATUS_LABELS[order.status as OrderStatus]}
                          colorClass={ORDER_STATUS_COLORS[order.status as OrderStatus]}
                          size="sm"
                        />
                        <span className="text-xs text-muted-foreground hidden sm:block">{formatRelative(order.created_at)}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{t('dashboard.stockAlerts')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.stockAlertsSub')}</p>
              </div>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            {lowStockAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <span className="text-emerald-400 text-lg">✓</span>
                </div>
                <p className="text-sm text-emerald-400 font-medium">{t('dashboard.allStocksHealthy')}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('dashboard.noAlerts')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lowStockAlerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200">{alert}</p>
                  </div>
                ))}
              </div>
            )}
            <Link href="/materials" className="mt-4 flex items-center gap-1 text-xs text-primary hover:underline">
              {t('dashboard.manageMaterials')} <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
