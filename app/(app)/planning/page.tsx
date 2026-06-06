'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/lib/i18n';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Play, Zap, TrendingUp, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, BRAND_TYPE_LABELS, BRAND_TYPE_COLORS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { Order, OrderItem, OrderItemSize, Product } from '@/lib/types';

type PlanningOrder = Order & {
  product?: Product;
  order_items?: (OrderItem & { order_item_sizes?: OrderItemSize[] })[];
};

export default function PlanningPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [planningOrders, setplanningOrders] = useState<PlanningOrder[]>([]);
  const [inProductionOrders, setInProductionOrders] = useState<PlanningOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [upcomingDeliveries, setUpcomingDeliveries] = useState<PlanningOrder[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          product:products(*),
          order_items(id, status, workflow_stage, order_item_sizes(required_qty))
        `
        )
        .in('status', ['planning', 'in_production'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      const orders = (data as PlanningOrder[]) || [];
      const planning = orders.filter((o) => o.status === 'planning');
      const inProduction = orders.filter((o) => o.status === 'in_production');

      setplanningOrders(planning);
      setInProductionOrders(inProduction);

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const upcoming = [...planning, ...inProduction].filter((order) => {
        if (!order.delivery_date) return false;
        const deliveryDate = new Date(order.delivery_date);
        return deliveryDate >= now && deliveryDate <= thirtyDaysFromNow;
      });

      setUpcomingDeliveries(upcoming.sort((a, b) => {
        const dateA = new Date(a.delivery_date || '');
        const dateB = new Date(b.delivery_date || '');
        return dateA.getTime() - dateB.getTime();
      }));
    } catch (error) {
      console.error('Error fetching planning data:', error);
      toast.error('Failed to load planning data');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartProduction(orderId: string) {
    if (!profile) return;

    setSubmitting(true);
    try {
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'in_production' })
        .eq('id', orderId);

      if (orderError) throw orderError;

      const { error: itemsError } = await supabase
        .from('order_items')
        .update({ status: 'active' })
        .eq('order_id', orderId);

      if (itemsError) throw itemsError;

      toast.success('Production started');
      fetchData();
    } catch (error) {
      console.error('Error starting production:', error);
      toast.error('Failed to start production');
    } finally {
      setSubmitting(false);
    }
  }

  function getCompletionPercentage(order: PlanningOrder): number {
    if (!order.order_items || order.order_items.length === 0) return 0;

    const completedItems = order.order_items.filter((item) => item.status === 'completed').length;
    return Math.round((completedItems / order.order_items.length) * 100);
  }

  function getTotalRequired(order: PlanningOrder): number {
    if (!order.order_items) return 0;
    return order.order_items.reduce((sum, item) => {
      return sum + (item.order_item_sizes?.reduce((s, size) => s + size.required_qty, 0) || 0);
    }, 0);
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('planning.title')} />
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
      <PageHeader
        title={t('planning.title')}
        subtitle={t('planning.title')}
      />

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="planning" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="planning">
              {t('planning.tab.planning')} ({planningOrders.length})
            </TabsTrigger>
            <TabsTrigger value="production">
              {t('planning.tab.inProduction')} ({inProductionOrders.length})
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              {t('planning.tab.upcoming')} ({upcomingDeliveries.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planning" className="space-y-4">
            {planningOrders.length === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('planning.noPlanning')}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {planningOrders.map((order) => (
                  <Card key={order.id} className="bg-card border-border p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-foreground">{order.order_code}</p>
                            <StatusBadge
                              label={BRAND_TYPE_LABELS[(order.brand_type_override || 'carlos') as keyof typeof BRAND_TYPE_LABELS]}
                              colorClass={BRAND_TYPE_COLORS[(order.brand_type_override || 'carlos') as keyof typeof BRAND_TYPE_COLORS]}
                              size="sm"
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">{order.product_model || order.product?.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {order.external_brand_name || ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleStartProduction(order.id)}
                          disabled={submitting}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          {t('planning.start')}
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.totalPairs')}</p>
                          <p className="font-medium text-foreground">{order.total_pairs}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.deliveryDate')}</p>
                          <p className="font-medium text-foreground">
                            {order.delivery_date ? formatDate(order.delivery_date) : t('label.noData')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.orderItems')}</p>
                          <p className="font-medium text-foreground">
                            {order.order_items?.length || 0} {t('planning.colors')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.required')}</p>
                          <p className="font-medium text-foreground">{getTotalRequired(order)}</p>
                        </div>
                      </div>

                      {order.notes && (
                        <div className="bg-card/50 p-2 rounded border border-border/50">
                          <p className="text-xs text-muted-foreground">Notes</p>
                          <p className="text-sm text-foreground">{order.notes}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="production" className="space-y-4">
            {inProductionOrders.length === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('planning.noProduction')}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {inProductionOrders.map((order) => {
                  const completionPercentage = getCompletionPercentage(order);

                  return (
                    <Card key={order.id} className="bg-card border-border p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-foreground">{order.order_code}</p>
                              <StatusBadge
                                label={BRAND_TYPE_LABELS[order.product?.brand_type || 'carlos']}
                                colorClass={BRAND_TYPE_COLORS[order.product?.brand_type || 'carlos']}
                                size="sm"
                              />
                            </div>
                            <p className="text-sm text-muted-foreground">{order.product_model || order.product?.name}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-amber-400">{completionPercentage}%</p>
                            <p className="text-xs text-muted-foreground">{t('planning.progress')}</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-muted-foreground">{t('label.progress')}</p>
                            <p className="text-xs font-medium">
                              {order.order_items?.filter((i) => i.status === 'completed').length || 0}/
                              {order.order_items?.length || 0} {t('planning.colors')}
                            </p>
                          </div>
                          <Progress value={completionPercentage} className="h-2" />
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.totalPairs')}</p>
                            <p className="font-medium text-foreground">{order.total_pairs}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.deliveryDate')}</p>
                            <p className="font-medium text-foreground">
                              {order.delivery_date ? formatDate(order.delivery_date) : t('label.noData')}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.cartonCapacity')}</p>
                            <p className="font-medium text-foreground">{order.carton_capacity}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t('label.orderItems')}</p>
                            <p className="font-medium text-foreground">
                              {order.order_items?.length || 0} {t('planning.colors')}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingDeliveries.length === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('planning.noUpcoming')}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {upcomingDeliveries.map((order) => {
                  const completionPercentage = getCompletionPercentage(order);
                  const daysUntilDelivery = Math.ceil(
                    (new Date(order.delivery_date || '').getTime() - new Date().getTime()) /
                      (1000 * 60 * 60 * 24)
                  );

                  return (
                    <Card
                      key={order.id}
                      className="bg-card border-border p-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                        <div>
                          <p className="font-semibold text-foreground">{order.order_code}</p>
                          <p className="text-sm text-muted-foreground">{order.product_model || order.product?.name}</p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">{t('planning.progress')}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={completionPercentage} className="h-1.5 flex-1" />
                            <p className="text-xs font-medium w-8">{completionPercentage}%</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Delivery</p>
                          <p className="font-medium text-foreground">
                            {formatDate(order.delivery_date || '')}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs text-muted-foreground">Days Left</p>
                          <p className={`font-bold ${daysUntilDelivery <= 5 ? 'text-red-400' : 'text-amber-400'}`}>
                            {daysUntilDelivery} days
                          </p>
                        </div>

                        <div>
                          <StatusBadge
                            label={ORDER_STATUS_LABELS[order.status]}
                            colorClass={ORDER_STATUS_COLORS[order.status]}
                            size="sm"
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {inProductionOrders.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Production Capacity
            </h2>
            <Card className="bg-card border-border p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('dashboard.activeOrders')}</p>
                  <p className="text-2xl font-bold text-amber-400">{inProductionOrders.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('planning.progress')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('planning.progress')}</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.round(
                      inProductionOrders.reduce((sum, order) => sum + getCompletionPercentage(order), 0) /
                        inProductionOrders.length
                    )}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t('planning.progress')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{t('label.total')}</p>
                  <p className="text-2xl font-bold text-sky-400">
                    {inProductionOrders.reduce((sum, order) => sum + order.total_pairs, 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t('label.total')}</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
