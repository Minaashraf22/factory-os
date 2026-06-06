'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Eye, Lock, Check, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { CARTON_STATUS_COLORS, CARTON_STATUS_LABELS, DEFAULT_CARTON_CAPACITY } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { Order, Carton, CartonItem, OrderItem, OrderItemSize } from '@/lib/types';

type PackingPoolOrder = Order & {
  product_model?: string;
  order_items?: (OrderItem & { order_item_sizes?: OrderItemSize[] })[];
};

type CartonWithRelations = Carton & {
  order?: Order;
  carton_items?: CartonItem[];
};

export default function PackingPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [packingOrders, setPackingOrders] = useState<PackingPoolOrder[]>([]);
  const [cartons, setCartons] = useState<CartonWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialog, setCreateDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [itemQuantities, setItemQuantities] = useState<Record<string, Record<string, number>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);

      const [ordersRes, cartonsRes] = await Promise.all([
        supabase
          .from('orders')
          .select(
            `
            id, order_code, product_model, brand_type_override,
            order_items!inner(id, color_name, color_hex, workflow_stage,
              order_item_sizes(size_value, approved_qty, packed_qty))
          `
          )
          .eq('order_items.workflow_stage', 'packing_pool'),
        supabase
          .from('cartons')
          .select(
            `
            *,
            order:orders(order_code),
            carton_items(quantity)
          `
          )
          .order('created_at', { ascending: false }),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (cartonsRes.error) throw cartonsRes.error;

      setPackingOrders((ordersRes.data as unknown as PackingPoolOrder[]) || []);
      setCartons((cartonsRes.data as unknown as CartonWithRelations[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('error.loadError'));
    } finally {
      setLoading(false);
    }
  }

  function validateCartonCreation(order: PackingPoolOrder): { valid: boolean; message?: string } {
    const items = order.order_items || [];
    for (const item of items) {
      for (const size of item.order_item_sizes || []) {
        if (!size.approved_qty || size.approved_qty <= 0) {
          return { valid: false, message: t('packing.validation.incomplete') };
        }
        if ((size.packed_qty || 0) >= size.approved_qty) {
          return { valid: false, message: t('packing.validation.exceedsApproved') };
        }
      }
    }
    return { valid: true };
  }

  async function handleCreateCarton() {
    if (!selectedOrder || !profile) {
      toast.error(t('action.select'));
      return;
    }

    const order = packingOrders.find((o) => o.id === selectedOrder);
    if (!order) {
      toast.error(t('error.notFound'));
      return;
    }

    const validation = validateCartonCreation(order);
    if (!validation.valid) {
      toast.error(validation.message || t('error.generic'));
      setSubmitting(false);
      return;
    }

    setSubmitting(true);
    try {
      const { data: carton, error: cartonError } = await supabase
        .from('cartons')
        .insert({
          order_id: selectedOrder,
          status: 'building',
          capacity: DEFAULT_CARTON_CAPACITY,
          current_qty: 0,
          created_by: profile.id,
        })
        .select()
        .single();

      if (cartonError) throw cartonError;

      const cartonItems: any[] = [];
      const items = order.order_items || [];

      for (const item of items) {
        const quantities = itemQuantities[item.id] || {};

        for (const size of item.order_item_sizes || []) {
          const qty = Number(quantities[size.size_value] ?? 0);
          const availableToPack = (size.approved_qty || 0) - (size.packed_qty || 0);

          if (qty > 0 && qty <= availableToPack) {
            cartonItems.push({
              carton_id: carton.id,
              order_item_id: item.id,
              size_value: size.size_value,
              quantity: qty,
            });
          }
        }
      }

      if (cartonItems.length === 0) {
        await supabase.from('cartons').delete().eq('id', carton.id);
        toast.error(t('packing.validation.noQty'));
        setSubmitting(false);
        return;
      }

      await supabase.from('carton_items').insert(cartonItems);

      for (const cartonItem of cartonItems) {
        const { data: sizeRecord } = await supabase
          .from('order_item_sizes')
          .select('packed_qty')
          .eq('order_item_id', cartonItem.order_item_id)
          .eq('size_value', cartonItem.size_value)
          .single();

        if (sizeRecord) {
          const newPackedQty = (sizeRecord.packed_qty || 0) + cartonItem.quantity;
          await supabase
            .from('order_item_sizes')
            .update({ packed_qty: newPackedQty })
            .eq('order_item_id', cartonItem.order_item_id)
            .eq('size_value', cartonItem.size_value);
        }
      }

      toast.success(t('packing.cartonCreated'));
      setCreateDialog(false);
      setSelectedOrder('');
      setItemQuantities({});
      fetchData();
    } catch (error) {
      console.error('Error creating carton:', error);
      toast.error(t('error.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLockCarton(cartonId: string) {
    try {
      const { error } = await supabase
        .from('cartons')
        .update({ status: 'locked', locked_at: new Date().toISOString() })
        .eq('id', cartonId);

      if (error) throw error;
      toast.success(t('packing.cartonLocked'));
      fetchData();
    } catch (error) {
      console.error('Error locking carton:', error);
      toast.error(t('error.saveError'));
    }
  }

  async function handleCompleteCarton(cartonId: string) {
    try {
      const { error } = await supabase
        .from('cartons')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', cartonId);

      if (error) throw error;
      toast.success(t('packing.cartonCompleted'));
      fetchData();
    } catch (error) {
      console.error('Error completing carton:', error);
      toast.error(t('error.saveError'));
    }
  }

  async function handleSendToWarehouse(itemId: string) {
    if (!profile) return;
    setSubmitting(true);
    try {
      await supabase.from('stage_transitions').insert({
        order_item_id: itemId,
        from_stage: 'packing_pool',
        to_stage: 'warehouse',
        performed_by: profile.id,
        reason: 'Packing completed',
        qty_moved: 0,
        is_rejection: false,
      });

      await supabase.from('workflow_events').insert({
        order_item_id: itemId,
        from_stage: 'packing_pool',
        to_stage: 'warehouse',
        action: 'stage_advance',
        performed_by: profile.id,
        reason: 'Packing completed, moving to warehouse',
        metadata: {},
      });

      await supabase
        .from('order_items')
        .update({ workflow_stage: 'warehouse', status: 'active' })
        .eq('id', itemId);

      toast.success(t('workflow.sentToNext'));
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(t('error.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('packing.title')} />
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

  const poolItemCount = packingOrders.reduce(
    (sum, order) => sum + (order.order_items?.length || 0),
    0
  );

  const selectedOrderData = packingOrders.find((o) => o.id === selectedOrder);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={t('packing.title')}
        subtitle={t('packing.pool')}
      >
        <Button onClick={() => setCreateDialog(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          {t('packing.createCarton')}
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('packing.pool')}</h2>
            {poolItemCount === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('packing.noPool')}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {packingOrders.map((order) =>
                  (order.order_items || []).map((item) => {
                    const totalApproved = item.order_item_sizes?.reduce((sum, size) => sum + (size.approved_qty || 0), 0) || 0;
                    const totalPacked = item.order_item_sizes?.reduce((sum, size) => sum + (size.packed_qty || 0), 0) || 0;
                    const availableToPack = totalApproved - totalPacked;

                    return (
                      <Card key={item.id} className="bg-card border-border p-4">
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-7 items-center">
                          <div>
                            <p className="text-xs text-muted-foreground">{t('packing.order')}</p>
                            <p className="font-medium text-sm">{order.order_code}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.product')}</p>
                            <p className="font-medium text-sm">{order.product_model}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.color')}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <div
                                className="w-4 h-4 rounded-full border border-border"
                                style={{ backgroundColor: item.color_hex || '#ccc' }}
                              />
                              <p className="text-sm">{item.color_name}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('packing.approvedQty')}</p>
                            <p className="font-medium text-sm">{totalApproved}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('packing.packedQty')}</p>
                            <p className="font-medium text-sm">{totalPacked}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('packing.availableQty')}</p>
                            <p className="font-medium text-sm text-emerald-400">{availableToPack}</p>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => handleSendToWarehouse(item.id)}
                              disabled={submitting || availableToPack > 0}
                            >
                              <ArrowRight className="w-3 h-3 mr-1" />
                              {t('workflow.advance')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">{t('packing.cartons')}</h2>
            {cartons.length === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('packing.noCartons')}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {cartons.map((carton) => {
                  const itemCount = carton.carton_items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
                  const fillPercentage = (itemCount / (carton.capacity || DEFAULT_CARTON_CAPACITY)) * 100;

                  return (
                    <Card key={carton.id} className="bg-card border-border p-4">
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-6 items-center">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('packing.cartonNumber')}</p>
                          <p className="font-medium text-sm">{carton.carton_number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('packing.order')}</p>
                          <p className="font-medium text-sm">{carton.order?.order_code}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.filled')}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-20 h-2 bg-card/50 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 transition-all"
                                style={{ width: `${fillPercentage}%` }}
                              />
                            </div>
                            <p className="text-sm font-medium">{itemCount}/{carton.capacity}</p>
                          </div>
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
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost">
                            <Eye className="w-4 h-4" />
                          </Button>
                          {carton.status === 'building' && (
                            <Button size="sm" variant="ghost" onClick={() => handleLockCarton(carton.id)}>
                              <Lock className="w-4 h-4" />
                            </Button>
                          )}
                          {carton.status === 'locked' && (
                            <Button size="sm" variant="ghost" onClick={() => handleCompleteCarton(carton.id)}>
                              <Check className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('packing.createCarton')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground">{t('packing.selectOrder')}</label>
              <Select value={selectedOrder} onValueChange={setSelectedOrder}>
                <SelectTrigger className="mt-1 bg-card border-border">
                  <SelectValue placeholder={t('packing.selectOrder')} />
                </SelectTrigger>
                <SelectContent>
                  {packingOrders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedOrderData && selectedOrderData.order_items && selectedOrderData.order_items.length > 0 && (
              <div>
                <label className="text-sm font-medium text-foreground mb-3 block">{t('packing.assignSizes')}</label>
                <div className="bg-card/50 border border-border rounded-lg p-4 space-y-3 max-h-64 overflow-auto">
                  {selectedOrderData.order_items.map((item) => (
                    <div key={item.id} className="border-b border-border/50 pb-3 last:border-0">
                      <p className="text-xs text-muted-foreground mb-2">{item.color_name}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {item.order_item_sizes?.map((size) => {
                          const key = `${item.id}-${size.size_value}`;
                          const availableToPack = (size.approved_qty || 0) - (size.packed_qty || 0);

                          return (
                            <div key={key}>
                              <label className="text-xs text-muted-foreground">
                                {t('label.size')} {size.size_value} ({t('packing.availableToPack')}: {availableToPack})
                              </label>
                              <Input
                                type="number"
                                min="0"
                                max={availableToPack}
                                value={itemQuantities[item.id]?.[size.size_value] || ''}
                                onChange={(e) => {
                                  setItemQuantities((prev) => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      [size.size_value]: parseInt(e.target.value) || 0,
                                    },
                                  }));
                                }}
                                className="mt-1 bg-card border-border h-8 text-sm"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={handleCreateCarton} disabled={submitting}>
              {submitting ? t('action.create') : t('packing.createCarton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
