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
import { Package, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { WORKFLOW_STAGE_COLORS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { OrderItem, OrderItemSize, Order } from '@/lib/types';

type ShippingItem = OrderItem & {
  order?: Order;
  order_item_sizes?: OrderItemSize[];
};

export default function ShippingPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [shippingItems, setShippingItems] = useState<ShippingItem[]>([]);
  const [completedItems, setCompletedItems] = useState<ShippingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('ready');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);

      const [readyRes, completedRes] = await Promise.all([
        supabase
          .from('order_items')
          .select(
            `
            *,
            order:orders(id, order_code, product_model, brand_type_override, external_brand_name),
            order_item_sizes(packed_qty)
          `
          )
          .eq('workflow_stage', 'shipping')
          .eq('status', 'active'),
        supabase
          .from('order_items')
          .select(
            `
            *,
            order:orders(id, order_code, product_model, brand_type_override, external_brand_name),
            order_item_sizes(packed_qty)
          `
          )
          .eq('workflow_stage', 'shipping')
          .eq('status', 'completed')
          .order('updated_at', { ascending: false })
          .limit(20),
      ]);

      if (readyRes.error) throw readyRes.error;
      if (completedRes.error) throw completedRes.error;

      setShippingItems((readyRes.data as ShippingItem[]) || []);
      setCompletedItems((completedRes.data as ShippingItem[]) || []);
    } catch (error) {
      console.error('Error fetching shipping data:', error);
      toast.error('Failed to load shipping data');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteShipment(itemId: string, orderId: string) {
    if (!profile) return;

    setSubmitting(true);
    try {
      await supabase.from('stage_transitions').insert({
        order_item_id: itemId,
        from_stage: 'shipping',
        to_stage: 'shipping',
        performed_by: profile.id,
        reason: 'Shipment completed',
        qty_moved: 0,
        is_rejection: false,
      });

      const { error: updateError } = await supabase
        .from('order_items')
        .update({ status: 'completed' })
        .eq('id', itemId);

      if (updateError) throw updateError;

      const { error: eventError } = await supabase.from('workflow_events').insert({
        order_item_id: itemId,
        from_stage: 'shipping',
        to_stage: 'shipping',
        action: 'complete_shipment',
        performed_by: profile.id,
        reason: 'Shipment completed',
        metadata: {},
      });

      if (eventError) throw eventError;

      toast.success(t('shipping.shipmentComplete'));
      fetchData();
    } catch (error) {
      console.error('Error completing shipment:', error);
      toast.error(t('error.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('shipping.title')} />
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
        title={t('shipping.title')}
        subtitle={`${shippingItems.length} ${t('shipping.ready').toLowerCase()}, ${completedItems.length} ${t('shipping.completed').toLowerCase()}`}
      />

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="ready">
              <Package className="w-4 h-4 mr-2" />
              {t('shipping.ready')} ({shippingItems.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              <CheckCircle className="w-4 h-4 mr-2" />
              {t('shipping.completed')} ({completedItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ready" className="space-y-4">
            {shippingItems.length === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('shipping.noReady')}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {shippingItems.map((item) => {
                  const totalPairs = item.order_item_sizes?.reduce((sum, size) => sum + size.packed_qty, 0) || 0;
                  const destination = item.order?.product_model || 'Unknown';

                  return (
                    <Card key={item.id} className="bg-card border-border p-4">
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-7 items-center">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('shipping.orderCode')}</p>
                          <p className="font-medium text-sm">{item.order?.order_code}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.productModel')}</p>
                          <p className="font-medium text-sm">{item.order?.product_model || '—'}</p>
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
                          <p className="text-xs text-muted-foreground">{t('label.pairs')}</p>
                          <p className="font-medium text-sm">{totalPairs}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.productModel')}</p>
                          <p className="font-medium text-sm text-sky-400">{destination}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.status')}</p>
                          <StatusBadge
                            label={t('shipping.ready')}
                            colorClass={WORKFLOW_STAGE_COLORS.shipping}
                            size="sm"
                          />
                        </div>
                        <div>
                          <Button
                            size="sm"
                            onClick={() => handleCompleteShipment(item.id, item.order_id)}
                            disabled={submitting}
                            className="w-full"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {t('action.complete')}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            {completedItems.length === 0 ? (
              <Card className="bg-card border-border p-6 text-center">
                <p className="text-muted-foreground">{t('shipping.noCompleted')}</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {completedItems.map((item) => {
                  const totalPairs = item.order_item_sizes?.reduce((sum, size) => sum + size.packed_qty, 0) || 0;
                  const destination = item.order?.product_model || 'Unknown';

                  return (
                    <Card key={item.id} className="bg-card/50 border-border p-4">
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-7 items-center opacity-75">
                        <div>
                          <p className="text-xs text-muted-foreground">{t('shipping.orderCode')}</p>
                          <p className="font-medium text-sm">{item.order?.order_code}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.productModel')}</p>
                          <p className="font-medium text-sm">{item.order?.product_model || '—'}</p>
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
                          <p className="text-xs text-muted-foreground">{t('label.pairs')}</p>
                          <p className="font-medium text-sm">{totalPairs}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('label.productModel')}</p>
                          <p className="font-medium text-sm">{destination}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t('shipping.shippedAt')}</p>
                          <p className="text-sm">{formatDate(item.updated_at)}</p>
                        </div>
                        <div>
                          <StatusBadge
                            label={t('label.shipped')}
                            colorClass="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
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
      </div>
    </div>
  );
}
