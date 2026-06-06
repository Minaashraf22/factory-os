'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/components/auth/auth-provider';
import { supabase } from '@/lib/supabase/client';
import { formatDate, formatDateTime, formatNumber, calculateProgress } from '@/lib/utils';
import {
  ORDER_STATUS_COLORS, ORDER_STATUS_LABELS,
  BRAND_TYPE_COLORS, BRAND_TYPE_LABELS,
  WORKFLOW_STAGE_LABELS,
} from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Package, MoreVertical, XCircle, Archive, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Order, OrderItem, OrderItemSize, WorkflowEvent, OrderStatus } from '@/lib/types';

interface OrderWithRelations extends Order {
  product?: any;
  order_items?: (OrderItem & { order_item_sizes?: OrderItemSize[] })[];
  created_by_profile?: any;
}

interface WorkflowEventWithProfile extends WorkflowEvent {
  performed_by_profile?: any;
  order_item?: OrderItem;
}

type ActionType = 'cancel' | 'archive' | 'delete' | null;

const TERMINAL_STATUSES: OrderStatus[] = ['cancelled', 'archived', 'completed'];
const ACTIVE_PRODUCTION_STAGES = ['production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping'];

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { profile } = useAuth();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderWithRelations | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEventWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Action dialog state
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionReason, setActionReason] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => { fetchOrderDetail(); }, [orderId]);

  async function fetchOrderDetail() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          product:products(*),
          order_items(*, order_item_sizes(*)),
          created_by_profile:profiles!orders_created_by_fkey(full_name, email, role)
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;
      setOrder(data as OrderWithRelations);

      if (data.order_items?.length > 0) {
        const itemIds = data.order_items.map((item: OrderItem) => item.id);
        const { data: events } = await supabase
          .from('workflow_events')
          .select(`*, performed_by_profile:profiles(full_name, role), order_item:order_items(color_name, color_code)`)
          .in('order_item_id', itemIds)
          .order('created_at', { ascending: false });
        setWorkflowEvents((events as WorkflowEventWithProfile[]) || []);
      }
    } catch (err) {
      console.error('Error fetching order:', err);
    } finally {
      setLoading(false);
    }
  }

  // Check if order has any active production records
  function hasProductionActivity(): boolean {
    if (!order?.order_items) return false;
    return order.order_items.some(item =>
      ACTIVE_PRODUCTION_STAGES.includes(item.workflow_stage) && item.status !== 'pending'
    );
  }

  function openAction(type: ActionType) {
    setActionType(type);
    setActionReason('');
    setDeleteConfirmText('');
  }

  async function handleCancelOrder() {
    if (!actionReason.trim()) {
      toast.error(t('orders.action.reasonRequired'));
      return;
    }
    if (!order || !profile) return;
    setSubmitting(true);

    try {
      // Update order status
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: profile.id,
          cancellation_reason: actionReason,
        })
        .eq('id', orderId);

      if (error) throw error;

      // Release material allocations
      await supabase
        .from('material_allocations')
        .update({ status: 'cancelled' })
        .eq('order_id', orderId)
        .eq('status', 'pending');

      // Release remnant allocations
      await supabase
        .from('remnant_allocations')
        .update({ status: 'cancelled' })
        .eq('target_order_id', orderId)
        .eq('status', 'pending');

      // Put all pending order items on hold
      await supabase
        .from('order_items')
        .update({ status: 'on_hold' })
        .eq('order_id', orderId)
        .eq('status', 'pending');

      // Audit log
      await supabase.from('audit_logs').insert({
        action: 'order_cancelled',
        entity_type: 'order',
        entity_id: orderId,
        user_id: profile.id,
        before_state: { status: order.status },
        after_state: { status: 'cancelled' },
        metadata: { reason: actionReason, order_code: order.order_code },
      });

      toast.success(t('orders.action.cancelled'));
      setActionType(null);
      fetchOrderDetail();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('orders.action.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchiveOrder() {
    if (!actionReason.trim()) {
      toast.error(t('orders.action.reasonRequired'));
      return;
    }
    if (!order || !profile) return;
    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          archived_by: profile.id,
        })
        .eq('id', orderId);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'order_archived',
        entity_type: 'order',
        entity_id: orderId,
        user_id: profile.id,
        before_state: { status: order.status },
        after_state: { status: 'archived' },
        metadata: { reason: actionReason, order_code: order.order_code },
      });

      toast.success(t('orders.action.archived'));
      setActionType(null);
      fetchOrderDetail();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('orders.action.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteOrder() {
    if (!actionReason.trim()) {
      toast.error(t('orders.action.reasonRequired'));
      return;
    }
    if (!order || !profile) return;

    // Only admins
    if (profile.role !== 'admin') {
      toast.error(t('orders.action.deleteAdminOnly'));
      return;
    }

    // Block if production activity exists
    if (hasProductionActivity()) {
      toast.error(t('orders.action.cannotDeleteActive'));
      return;
    }

    setSubmitting(true);
    try {
      // Audit log first (before delete)
      await supabase.from('audit_logs').insert({
        action: 'order_deleted',
        entity_type: 'order',
        entity_id: orderId,
        user_id: profile.id,
        before_state: { order_code: order.order_code, status: order.status, total_pairs: order.total_pairs },
        after_state: { is_deleted: true },
        metadata: { reason: actionReason, order_code: order.order_code },
      });

      // Soft delete — preserve records
      const { error } = await supabase
        .from('orders')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: profile.id,
          deletion_reason: actionReason,
          status: 'cancelled',
        })
        .eq('id', orderId);

      if (error) throw error;

      toast.success(t('orders.action.deleted'));
      setActionType(null);
      router.push('/orders');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || t('orders.action.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReopenOrder() {
    if (!order || !profile) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'planning', cancelled_at: null, cancellation_reason: '' })
        .eq('id', orderId);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        action: 'order_reopened',
        entity_type: 'order',
        entity_id: orderId,
        user_id: profile.id,
        before_state: { status: order.status },
        after_state: { status: 'planning' },
        metadata: { order_code: order.order_code },
      });

      toast.success(t('orders.action.reopened'));
      fetchOrderDetail();
    } catch (err: any) {
      toast.error(err.message || t('orders.action.failed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="...">
          <Link href="/orders"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />{t('action.back')}</Button></Link>
        </PageHeader>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{t('label.loading')}</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('orders.detailTitle', { code: '' })}>
          <Link href="/orders"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />{t('action.back')}</Button></Link>
        </PageHeader>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{t('orders.notFound')}</p>
        </div>
      </div>
    );
  }

  const cartonEstimate = Math.ceil(order.total_pairs / Math.max(order.carton_capacity, 1));
  const isTerminal = TERMINAL_STATUSES.includes(order.status);
  const isAdmin = profile?.role === 'admin';
  const canDelete = isAdmin && !hasProductionActivity();

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('orders.detailTitle', { code: order.order_code })}>
        <div className="flex items-center gap-2">
          <Link href="/orders">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {t('action.back')}
            </Button>
          </Link>

          {/* Action menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-popover border-border">
              {/* Cancel */}
              {!isTerminal && (
                <DropdownMenuItem
                  className="gap-2 text-amber-400 focus:text-amber-300"
                  onClick={() => openAction('cancel')}
                >
                  <XCircle className="w-4 h-4" />
                  {t('orders.action.cancel')}
                </DropdownMenuItem>
              )}

              {/* Reopen */}
              {(order.status === 'cancelled') && (
                <DropdownMenuItem className="gap-2" onClick={handleReopenOrder}>
                  <RotateCcw className="w-4 h-4" />
                  {t('orders.action.reopen')}
                </DropdownMenuItem>
              )}

              {/* Archive */}
              {order.status !== 'archived' && (
                <DropdownMenuItem
                  className="gap-2"
                  onClick={() => openAction('archive')}
                >
                  <Archive className="w-4 h-4" />
                  {t('orders.action.archive')}
                </DropdownMenuItem>
              )}

              {/* Delete — admin only */}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="gap-2 text-destructive focus:text-destructive"
                    onClick={() => openAction('delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('orders.action.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Cancelled / Archived banner */}
          {order.status === 'cancelled' && order.cancellation_reason && (
            <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">{t('orders.action.cancel')}</p>
                <p className="text-sm text-red-300/80 mt-1">{order.cancellation_reason}</p>
                {order.cancelled_at && <p className="text-xs text-muted-foreground mt-1">{formatDateTime(order.cancelled_at)}</p>}
              </div>
            </div>
          )}
          {order.status === 'archived' && (
            <div className="bg-slate-800/40 border border-slate-500/30 rounded-lg p-4 flex items-start gap-3">
              <Archive className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-300">{t('status.archived')}</p>
                {order.archived_at && <p className="text-xs text-muted-foreground mt-1">{formatDateTime(order.archived_at)}</p>}
              </div>
            </div>
          )}

          {/* Header Card */}
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('orders.orderCode')}</p>
                <p className="font-semibold">{order.order_code}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('orders.productModel')}</p>
                <p className="font-semibold">{order.product_model || order.product?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('orders.brandType')}</p>
                {order.brand_type_override && (
                  <StatusBadge
                    label={BRAND_TYPE_LABELS[order.brand_type_override as keyof typeof BRAND_TYPE_LABELS] || order.brand_type_override}
                    colorClass={BRAND_TYPE_COLORS[order.brand_type_override as keyof typeof BRAND_TYPE_COLORS] || ''}
                    size="sm"
                  />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('label.externalBrand')}</p>
                <p className="font-semibold">{order.external_brand_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('label.totalPairs')}</p>
                <p className="font-semibold">{formatNumber(order.total_pairs)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('label.deliveryDate')}</p>
                <p className="font-semibold">{formatDate(order.delivery_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('label.created')}</p>
                <p className="font-semibold text-sm">{formatDate(order.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('label.status')}</p>
                <StatusBadge
                  label={ORDER_STATUS_LABELS[order.status] || order.status}
                  colorClass={ORDER_STATUS_COLORS[order.status] || 'bg-slate-500/20 text-slate-400'}
                  size="sm"
                />
              </div>
            </div>

            {order.notes && (
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">{t('label.notes')}</p>
                <p className="text-sm text-foreground">{order.notes}</p>
              </div>
            )}
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">{t('label.overview')}</TabsTrigger>
              <TabsTrigger value="workflow">{t('label.workflow')}</TabsTrigger>
              <TabsTrigger value="planning">{t('label.planning')}</TabsTrigger>
              <TabsTrigger value="audit">{t('orders.detail.auditHistory')}</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <h3 className="font-semibold">{t('label.orderItems')}</h3>
              <div className="grid grid-cols-1 gap-4">
                {order.order_items?.map((item) => (
                  <Card key={item.id} className="p-4 bg-card/50">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm font-semibold">{item.color_name}</p>
                        <p className="text-xs text-muted-foreground">{item.color_code}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge
                          label={item.workflow_stage}
                          colorClass="bg-blue-500/20 text-blue-400 border-blue-500/30"
                          size="sm"
                        />
                        <div className="w-8 h-8 rounded-full border-2 border-border" style={{ backgroundColor: item.color_hex }} />
                      </div>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground">{t('label.size')}</th>
                          <th className="text-right py-2 px-2 text-muted-foreground">{t('label.required')}</th>
                          <th className="text-right py-2 px-2 text-muted-foreground">{t('label.produced')}</th>
                          <th className="text-right py-2 px-2 text-muted-foreground">{t('label.approved')}</th>
                          <th className="text-right py-2 px-2 text-muted-foreground">{t('label.packed')}</th>
                          <th className="py-2 px-2 text-muted-foreground">{t('label.progress')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {item.order_item_sizes?.map((size) => {
                          const progress = calculateProgress(size.produced_qty, size.required_qty);
                          return (
                            <tr key={size.id}>
                              <td className="py-2 px-2 font-medium">{size.size_value}</td>
                              <td className="text-right py-2 px-2">{size.required_qty}</td>
                              <td className="text-right py-2 px-2 text-blue-400">{size.produced_qty}</td>
                              <td className="text-right py-2 px-2 text-emerald-400">{size.approved_qty}</td>
                              <td className="text-right py-2 px-2 text-teal-400">{size.packed_qty}</td>
                              <td className="py-2 px-2">
                                <Progress value={progress} className="w-16 h-1" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Workflow Tab */}
            <TabsContent value="workflow" className="space-y-4">
              {workflowEvents.length === 0 ? (
                <Card className="p-8 text-center">
                  <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">{t('orders.detail.noWorkflow')}</p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {workflowEvents.map((event) => (
                    <Card key={event.id} className="p-4 bg-card/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-sm">{event.order_item?.color_name}</p>
                            {event.from_stage && (
                              <span className="text-xs text-muted-foreground">
                                {WORKFLOW_STAGE_LABELS[event.from_stage as keyof typeof WORKFLOW_STAGE_LABELS]} → {WORKFLOW_STAGE_LABELS[event.to_stage as keyof typeof WORKFLOW_STAGE_LABELS]}
                              </span>
                            )}
                            <span className="text-xs bg-secondary px-2 py-0.5 rounded">{event.action}</span>
                          </div>
                          {event.reason && <p className="text-xs text-muted-foreground mb-1">{event.reason}</p>}
                          <p className="text-xs text-muted-foreground">
                            {event.performed_by_profile?.full_name || 'System'} • {formatDateTime(event.created_at)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Planning Tab */}
            <TabsContent value="planning" className="space-y-4">
              <Card className="p-4">
                <h4 className="font-semibold mb-4">{t('label.productionPlanning')}</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">{t('label.totalPairs')}</p>
                    <p className="text-2xl font-bold">{formatNumber(order.total_pairs)}</p>
                  </div>
                  <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">{t('label.cartonCapacity')}</p>
                    <p className="text-2xl font-bold">{order.carton_capacity}</p>
                  </div>
                  <div className="p-3 bg-card/50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">{t('label.estimatedCartons')}</p>
                    <p className="text-2xl font-bold">{cartonEstimate}</p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-sm text-amber-400">
                    {t('orders.detail.cartonsNeeded', { count: cartonEstimate, pairs: formatNumber(order.total_pairs), capacity: order.carton_capacity })}
                  </p>
                </div>
              </Card>

              {order.order_items && order.order_items.length > 0 && (
                <Card className="p-4">
                  <h4 className="font-semibold mb-4">{t('label.colorDistribution')}</h4>
                  <div className="space-y-3">
                    {order.order_items.map((item) => {
                      const itemTotal = item.order_item_sizes?.reduce((sum, s) => sum + s.required_qty, 0) || 0;
                      const percentage = order.total_pairs > 0 ? Math.round((itemTotal / order.total_pairs) * 100) : 0;
                      return (
                        <div key={item.id}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: item.color_hex }} />
                              <span className="text-sm">{item.color_name}</span>
                            </div>
                            <span className="text-sm font-medium">{formatNumber(itemTotal)} ({percentage}%)</span>
                          </div>
                          <Progress value={percentage} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </TabsContent>

            {/* Audit History Tab */}
            <TabsContent value="audit" className="space-y-4">
              <AuditHistoryTab orderId={orderId} t={t} formatDateTime={formatDateTime} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={actionType === 'cancel'} onOpenChange={(o) => !o && setActionType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <XCircle className="w-5 h-5" />
              {t('orders.action.confirmCancel')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-200/80">
              {t('orders.action.cancelWarning')}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('orders.action.cancelReason')} *</label>
              <Textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={t('orders.action.reasonPlaceholder', { action: 'cancelling' })}
                className="bg-card border-border resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)}>{t('action.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={submitting || !actionReason.trim()}
            >
              {t('orders.action.confirmCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Dialog */}
      <Dialog open={actionType === 'archive'} onOpenChange={(o) => !o && setActionType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-5 h-5" />
              {t('orders.action.confirmArchive')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-slate-800/50 border border-slate-500/30 rounded-lg p-3 text-sm text-slate-300/80">
              {t('orders.action.archiveWarning')}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">{t('orders.action.archiveReason')} *</label>
              <Textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={t('orders.action.reasonPlaceholder', { action: 'archiving' })}
                className="bg-card border-border resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)}>{t('action.cancel')}</Button>
            <Button onClick={handleArchiveOrder} disabled={submitting || !actionReason.trim()}>
              {t('orders.action.confirmArchive')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog — Admin only */}
      <Dialog open={actionType === 'delete'} onOpenChange={(o) => !o && setActionType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t('orders.action.confirmDelete')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!canDelete ? (
              <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                {!isAdmin ? t('orders.action.deleteAdminOnly') : t('orders.action.cannotDeleteActive')}
              </div>
            ) : (
              <>
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                  {t('orders.action.deleteWarning')}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">{t('orders.action.deleteReason')} *</label>
                  <Textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder={t('orders.action.reasonPlaceholder', { action: 'deleting' })}
                    className="bg-card border-border resize-none"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">
                    Type <span className="font-mono text-destructive">{order.order_code}</span> to confirm
                  </label>
                  <Input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={order.order_code}
                    className="bg-card border-border font-mono"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionType(null)}>{t('action.cancel')}</Button>
            {canDelete && (
              <Button
                variant="destructive"
                onClick={handleDeleteOrder}
                disabled={submitting || !actionReason.trim() || deleteConfirmText !== order.order_code}
              >
                {t('orders.action.confirmDelete')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Separate component to avoid cluttering main component
function AuditHistoryTab({ orderId, t, formatDateTime }: { orderId: string; t: any; formatDateTime: any }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('audit_logs')
      .select('*, user:profiles(full_name, role)')
      .eq('entity_id', orderId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setLogs(data || []);
        setLoading(false);
      });
  }, [orderId]);

  if (loading) return <div className="h-20 bg-card rounded-lg animate-pulse" />;

  if (logs.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">{t('orders.detail.noAudit')}</p>
      </Card>
    );
  }

  const ACTION_COLORS: Record<string, string> = {
    order_cancelled: 'text-red-400',
    order_archived: 'text-slate-400',
    order_deleted: 'text-red-600',
    order_reopened: 'text-emerald-400',
    workflow_stage_change: 'text-blue-400',
  };

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <Card key={log.id} className="p-4 bg-card/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-semibold ${ACTION_COLORS[log.action] || 'text-foreground'}`}>
                  {log.action.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                </span>
              </div>
              {log.metadata?.reason && (
                <p className="text-xs text-muted-foreground mb-1">{log.metadata.reason}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {log.user?.full_name || 'System'} • {formatDateTime(log.created_at)}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
