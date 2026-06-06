'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/components/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';
import { formatDate, formatNumber } from '@/lib/utils';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, BRAND_TYPE_COLORS, BRAND_TYPE_LABELS } from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Search, Plus, Eye, Package, MoreHorizontal, XCircle, Archive, Trash2 } from 'lucide-react';
import type { Order, OrderStatus, BrandType } from '@/lib/types';
import { toast } from 'sonner';

type OrderWithRelations = Order & {
  order_items?: { id: string }[];
};

type QuickActionType = 'cancel' | 'archive' | null;

export default function OrdersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { profile } = useAuth();
  const [orders, setOrders] = useState<OrderWithRelations[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrderWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<OrderStatus | 'all'>('all');
  const [actionOrder, setActionOrder] = useState<OrderWithRelations | null>(null);
  const [actionType, setActionType] = useState<QuickActionType>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const tabs: Array<{ value: OrderStatus | 'all'; label: string }> = [
    { value: 'all', label: t('label.all') },
    { value: 'draft', label: t('status.draft') },
    { value: 'planning', label: t('status.planning') },
    { value: 'in_production', label: t('status.in_production') },
    { value: 'completed', label: t('status.completed') },
    { value: 'on_hold', label: t('status.on_hold') },
    { value: 'cancelled', label: t('status.cancelled') },
    { value: 'archived', label: t('status.archived') },
  ];

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, activeTab]);

  async function fetchOrders() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(id)')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders((data as unknown as OrderWithRelations[]) || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function openAction(order: OrderWithRelations, type: QuickActionType) {
    setActionOrder(order);
    setActionType(type);
    setActionReason('');
  }

  function closeAction() {
    setActionOrder(null);
    setActionType(null);
    setActionReason('');
  }

  async function handleQuickCancel() {
    if (!actionOrder || !actionReason.trim()) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('orders').update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: profile?.id ?? null,
        cancellation_reason: actionReason,
      }).eq('id', actionOrder.id);
      if (error) throw error;
      await supabase.from('material_allocations')
        .update({ status: 'cancelled' })
        .eq('order_id', actionOrder.id)
        .eq('status', 'pending');
      await supabase.from('audit_logs').insert({
        action: 'cancel_order',
        entity_type: 'order',
        entity_id: actionOrder.id,
        user_id: profile?.id ?? null,
        before_state: { status: actionOrder.status },
        after_state: { status: 'cancelled' },
        metadata: { order_code: actionOrder.order_code, reason: actionReason },
      });
      toast.success(t('orders.action.cancelled'));
      closeAction();
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast.error(t('orders.action.failed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleQuickArchive() {
    if (!actionOrder || !actionReason.trim()) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('orders').update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        archived_by: profile?.id ?? null,
      }).eq('id', actionOrder.id);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        action: 'archive_order',
        entity_type: 'order',
        entity_id: actionOrder.id,
        user_id: profile?.id ?? null,
        before_state: { status: actionOrder.status },
        after_state: { status: 'archived' },
        metadata: { order_code: actionOrder.order_code, reason: actionReason },
      });
      toast.success(t('orders.action.archived'));
      closeAction();
      fetchOrders();
    } catch (err) {
      console.error(err);
      toast.error(t('orders.action.failed'));
    } finally {
      setActionLoading(false);
    }
  }

  function filterOrders() {
    let result = [...orders];

    if (activeTab !== 'all') {
      result = result.filter((order) => order.status === activeTab);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (order) =>
          order.order_code?.toLowerCase().includes(term) ||
          order.product_model?.toLowerCase().includes(term) ||
          order.external_brand_name?.toLowerCase().includes(term)
      );
    }

    setFilteredOrders(result);
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('orders.title')} />
        <div className="flex-1 p-6">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-card rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('orders.title')}>
          <Link href="/orders/new">
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              {t('orders.new')}
            </Button>
          </Link>
        </PageHeader>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Package className="w-12 h-12 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold text-foreground">{t('orders.noOrders')}</h2>
            <p className="text-muted-foreground">{t('orders.createFirst')}</p>
            <Link href="/orders/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                {t('orders.new')}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('orders.title')}>
        <Link href="/orders/new">
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            {t('orders.new')}
          </Button>
        </Link>
      </PageHeader>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-border bg-card/50 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('label.searchBy')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">{t('orders.orderCode')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">{t('orders.productModel')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">{t('orders.brandType')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">{t('label.status')}</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground">{t('orders.totalPairs')}</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground">{t('orders.items')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">{t('orders.deliveryDate')}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground">{t('orders.created')}</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-muted-foreground">{t('label.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="hover:bg-card/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  <td className="px-6 py-4 text-sm font-semibold text-foreground">{order.order_code}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{order.product_model || '—'}</td>
                  <td className="px-6 py-4 text-sm">
                    {order.brand_type_override && (
                      <StatusBadge
                        label={BRAND_TYPE_LABELS[order.brand_type_override as BrandType]}
                        colorClass={BRAND_TYPE_COLORS[order.brand_type_override as BrandType]}
                        size="sm"
                      />
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <StatusBadge
                      label={ORDER_STATUS_LABELS[order.status]}
                      colorClass={ORDER_STATUS_COLORS[order.status]}
                      size="sm"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-foreground">{formatNumber(order.total_pairs)}</td>
                  <td className="px-6 py-4 text-sm text-right text-muted-foreground">{order.order_items?.length || 0}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(order.delivery_date)}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{formatDate(order.created_at)}</td>
                  <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/orders/${order.id}`)}>
                          <Eye className="w-4 h-4 mr-2" />
                          {t('action.view')}
                        </DropdownMenuItem>
                        {!['cancelled', 'archived', 'completed'].includes(order.status) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-amber-500"
                              onClick={() => openAction(order, 'cancel')}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              {t('orders.action.cancel')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-slate-400"
                              onClick={() => openAction(order, 'archive')}
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              {t('orders.action.archive')}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">{t('orders.noMatch')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={actionType === 'cancel'} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orders.action.cancel')} — {actionOrder?.order_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('orders.action.cancelWarning')}</p>
            <div className="space-y-2">
              <Label>{t('orders.action.cancelReason')} *</Label>
              <Textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={t('orders.action.reasonPlaceholder').replace('{{action}}', 'cancelled')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>{t('action.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={handleQuickCancel}
              disabled={!actionReason.trim() || actionLoading}
            >
              {actionLoading ? t('label.loading') : t('orders.action.confirmCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <Dialog open={actionType === 'archive'} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orders.action.archive')} — {actionOrder?.order_code}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t('orders.action.archiveWarning')}</p>
            <div className="space-y-2">
              <Label>{t('orders.action.archiveReason')} *</Label>
              <Textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={t('orders.action.reasonPlaceholder').replace('{{action}}', 'archived')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>{t('action.cancel')}</Button>
            <Button
              onClick={handleQuickArchive}
              disabled={!actionReason.trim() || actionLoading}
            >
              {actionLoading ? t('label.loading') : t('orders.action.confirmArchive')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
