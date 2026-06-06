'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/lib/i18n';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Package, Truck, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { CARTON_STATUS_COLORS, CARTON_STATUS_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { OrderItem, OrderItemSize, Carton, Order } from '@/lib/types';

type WarehouseItem = OrderItem & {
  order?: Order & { product_model?: string };
  order_item_sizes?: OrderItemSize[];
};

type WarehouseCarton = Carton & {
  order?: Order;
};

export default function WarehousePage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);
  const [warehouseCartons, setWarehouseCartons] = useState<WarehouseCarton[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState({
    totalPairs: 0,
    cartonCount: 0,
    orderCount: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function fetchData() {
    try {
      setLoading(true);

      const [itemsRes, cartonsRes] = await Promise.all([
        supabase
          .from('order_items')
          .select(
            `
            *,
            order:orders(id, order_code, product_model, brand_type_override),
            order_item_sizes(size_value, required_qty, produced_qty, approved_qty, packed_qty, remnant_qty)
          `
          )
          .eq('workflow_stage', 'warehouse')
          .order('created_at', { ascending: false }),
        supabase
          .from('cartons')
          .select(`
            *,
            order:orders(order_code),
            carton_items(quantity)
          `)
          .eq('status', 'warehouse')
          .order('created_at', { ascending: false }),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (cartonsRes.error) throw cartonsRes.error;

      const items = (itemsRes.data as unknown as WarehouseItem[]) || [];
      const cartons = (cartonsRes.data as unknown as WarehouseCarton[]) || [];

      setWarehouseItems(items);
      setWarehouseCartons(cartons);

      const totalPairs = items.reduce((sum, item) => {
        return sum + (item.order_item_sizes?.reduce((s, size) => s + size.packed_qty, 0) || 0);
      }, 0);

      const uniqueOrders = new Set(items.map((item) => item.order_id));

      setSummary({
        totalPairs,
        cartonCount: cartons.length,
        orderCount: uniqueOrders.size,
      });
    } catch (error) {
      console.error('Error fetching warehouse data:', error);
      toast.error(t('error.failedLoad'));
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkForShipping(itemId: string) {
    if (!profile) return;

    setSubmitting(true);
    try {
      await supabase.from('stage_transitions').insert({
        order_item_id: itemId,
        from_stage: 'warehouse',
        to_stage: 'shipping',
        performed_by: profile.id,
        reason: 'Ready for shipment',
        qty_moved: 0,
        is_rejection: false,
      });

      const { error: updateError } = await supabase
        .from('order_items')
        .update({ workflow_stage: 'shipping' })
        .eq('id', itemId);

      if (updateError) throw updateError;

      const { error: eventError } = await supabase.from('workflow_events').insert({
        order_item_id: itemId,
        from_stage: 'warehouse',
        to_stage: 'shipping',
        action: 'mark_for_shipping',
        performed_by: profile.id,
        reason: 'Item ready for shipment',
        metadata: {},
      });

      if (eventError) throw eventError;

      toast.success(t('warehouse.markForShipping'));
      fetchData();
    } catch (error) {
      console.error('Error marking item for shipping:', error);
      toast.error(t('error.failedLoad'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('warehouse.title')} />
        <div className="flex-1 p-6">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('warehouse.title')} />

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-card border-border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t('warehouse.totalItems')}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{summary.totalPairs}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('label.pairs')}</p>
                </div>
                <Package className="w-5 h-5 text-emerald-400" />
              </div>
            </Card>
            <Card className="bg-card border-border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t('warehouse.totalCartons')}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{summary.cartonCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('packing.cartons')}</p>
                </div>
                <Package className="w-5 h-5 text-teal-400" />
              </div>
            </Card>
            <Card className="bg-card border-border p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t('label.order')}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{summary.orderCount}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('nav.orders')}</p>
                </div>
                <Truck className="w-5 h-5 text-sky-400" />
              </div>
            </Card>
          </div>

          {/* Warehouse Items */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('warehouse.items')}</h2>
            {warehouseItems.length === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('warehouse.noItems')}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {warehouseItems.map((item) => {
                  const sizes = item.order_item_sizes || [];
                  const totalRequired = sizes.reduce((s, sz) => s + sz.required_qty, 0);
                  const totalProduced = sizes.reduce((s, sz) => s + sz.produced_qty, 0);
                  const totalApproved = sizes.reduce((s, sz) => s + sz.approved_qty, 0);
                  const totalPacked = sizes.reduce((s, sz) => s + sz.packed_qty, 0);
                  const isExpanded = expandedItems.has(item.id);

                  return (
                    <Card key={item.id} className="bg-card border-border overflow-hidden">
                      {/* Main row */}
                      <div className="p-4">
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-7 items-center">
                          <div>
                            <p className="text-xs text-muted-foreground">{t('orders.orderCode')}</p>
                            <p className="font-medium text-sm">{item.order?.order_code}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.productModel')}</p>
                            <p className="font-medium text-sm text-foreground/80">
                              {(item.order as any)?.product_model || '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.color')}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div
                                className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                                style={{ backgroundColor: item.color_hex || '#ccc' }}
                              />
                              <p className="text-sm truncate">{item.color_name}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.required')}</p>
                            <p className="font-medium text-sm">{totalRequired}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.approved')}</p>
                            <p className="font-medium text-sm text-emerald-400">{totalApproved}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.packed')}</p>
                            <p className="font-medium text-sm text-teal-400">{totalPacked}</p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleMarkForShipping(item.id)}
                              disabled={submitting}
                              className="w-full"
                            >
                              <Truck className="w-3 h-3 mr-1" />
                              {t('warehouse.markForShipping')}
                            </Button>
                            {sizes.length > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="w-full text-xs"
                                onClick={() => toggleExpand(item.id)}
                              >
                                {isExpanded ? (
                                  <><ChevronUp className="w-3 h-3 mr-1" />{t('label.sizes')}</>
                                ) : (
                                  <><ChevronDown className="w-3 h-3 mr-1" />{t('label.sizes')}</>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Per-size breakdown */}
                      {isExpanded && sizes.length > 0 && (
                        <div className="border-t border-border bg-background/30 px-4 py-3">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground border-b border-border">
                                  <th className="text-start pb-2 pr-4 font-medium">{t('label.size')}</th>
                                  <th className="text-center pb-2 px-3 font-medium">{t('label.required')}</th>
                                  <th className="text-center pb-2 px-3 font-medium">{t('label.produced')}</th>
                                  <th className="text-center pb-2 px-3 font-medium">{t('label.approved')}</th>
                                  <th className="text-center pb-2 px-3 font-medium">{t('label.packed')}</th>
                                  <th className="text-center pb-2 px-3 font-medium">{t('label.remnant')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sizes
                                  .slice()
                                  .sort((a, b) => Number(a.size_value) - Number(b.size_value))
                                  .map((sz) => (
                                    <tr key={sz.id} className="border-b border-border/40 last:border-0">
                                      <td className="py-1.5 pr-4 font-semibold text-foreground">{sz.size_value}</td>
                                      <td className="py-1.5 px-3 text-center text-muted-foreground">{sz.required_qty}</td>
                                      <td className="py-1.5 px-3 text-center text-blue-400">{sz.produced_qty}</td>
                                      <td className="py-1.5 px-3 text-center text-emerald-400">{sz.approved_qty}</td>
                                      <td className="py-1.5 px-3 text-center text-teal-400">{sz.packed_qty}</td>
                                      <td className="py-1.5 px-3 text-center text-amber-400">{sz.remnant_qty}</td>
                                    </tr>
                                  ))}
                              </tbody>
                              <tfoot>
                                <tr className="text-muted-foreground font-semibold border-t border-border">
                                  <td className="pt-2 pr-4">{t('label.total')}</td>
                                  <td className="pt-2 px-3 text-center">{totalRequired}</td>
                                  <td className="pt-2 px-3 text-center text-blue-400">{totalProduced}</td>
                                  <td className="pt-2 px-3 text-center text-emerald-400">{totalApproved}</td>
                                  <td className="pt-2 px-3 text-center text-teal-400">{totalPacked}</td>
                                  <td className="pt-2 px-3 text-center text-amber-400">
                                    {sizes.reduce((s, sz) => s + sz.remnant_qty, 0)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cartons in Warehouse */}
          {warehouseCartons.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">{t('warehouse.cartons')}</h2>
              <div className="space-y-3">
                {warehouseCartons.map((carton) => {
                  const itemCount = carton.carton_items?.reduce((sum, ci) => sum + ci.quantity, 0) || 0;

                  return (
                    <Card key={carton.id} className="bg-card border-border p-4">
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-5 items-center">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('packing.cartonNumber')}</p>
                          <p className="font-medium text-sm">{carton.carton_number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.order')}</p>
                          <p className="font-medium text-sm">{carton.order?.order_code}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.pairs')}</p>
                          <p className="font-medium text-sm">{itemCount} / {carton.capacity}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.status')}</p>
                          <StatusBadge
                            label={CARTON_STATUS_LABELS[carton.status]}
                            colorClass={CARTON_STATUS_COLORS[carton.status]}
                            size="sm"
                          />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.created')}</p>
                          <p className="text-sm">{formatDate(carton.created_at)}</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
