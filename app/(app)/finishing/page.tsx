'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, RotateCcw, ChevronDown, ChevronUp, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import { WORKFLOW_STAGE_COLORS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { OrderItemSize } from '@/lib/types';

interface FinishingItem {
  id: string;
  order_id: string;
  color_name: string;
  color_code: string;
  color_hex: string;
  status: string;
  workflow_stage: string;
  notes: string;
  created_at: string;
  order?: { id: string; order_code: string; product_model: string; brand_type_override: string };
  order_item_sizes?: OrderItemSize[];
}

export default function FinishingPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [tab, setTab] = useState<'queue' | 'done'>('queue');
  const [items, setItems] = useState<FinishingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [sendDialog, setSendDialog] = useState(false);
  const [sendItem, setSendItem] = useState<FinishingItem | null>(null);
  const [sendQty, setSendQty] = useState<Record<string, number>>({});
  const [sendNotes, setSendNotes] = useState('');

  const [returnDialog, setReturnDialog] = useState(false);
  const [returnItem, setReturnItem] = useState<FinishingItem | null>(null);
  const [returnReason, setReturnReason] = useState('');

  useEffect(() => { fetchData(); }, [tab]);

  async function fetchData() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          order:orders(id, order_code, product_model, brand_type_override),
          order_item_sizes(*)
        `)
        .eq('workflow_stage', 'finishing')
        .in('status', tab === 'queue' ? ['pending', 'active'] : ['completed'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data as unknown as FinishingItem[]) || []);
    } catch (err) {
      console.error(err);
      toast.error(t('error.failedLoad'));
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function openSendDialog(item: FinishingItem) {
    setSendItem(item);
    const initial: Record<string, number> = {};
    (item.order_item_sizes || []).forEach(sz => { initial[sz.size_value] = sz.produced_qty || 0; });
    setSendQty(initial);
    setSendNotes('');
    setSendDialog(true);
  }

  async function handleSendToQC() {
    if (!sendItem || !profile) return;

    const totalQty = Object.values(sendQty).reduce((s, v) => s + v, 0);
    if (totalQty === 0) {
      toast.error(t('workflow.gate.noQty'));
      return;
    }

    setSubmitting(true);
    try {
      await supabase.from('stage_transitions').insert({
        order_item_id: sendItem.id,
        from_stage: 'finishing',
        to_stage: 'qc',
        performed_by: profile.id,
        reason: sendNotes || 'Finishing completed',
        qty_moved: totalQty,
        is_rejection: false,
      });

      await supabase.from('workflow_events').insert({
        order_item_id: sendItem.id,
        from_stage: 'finishing',
        to_stage: 'qc',
        action: 'stage_advance',
        performed_by: profile.id,
        reason: sendNotes || 'Finishing completed',
        qty_moved: totalQty,
        metadata: {},
      });

      await supabase
        .from('order_items')
        .update({ workflow_stage: 'qc', status: 'active' })
        .eq('id', sendItem.id);

      toast.success(t('workflow.sentToNext'));
      setSendDialog(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(t('error.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  function openReturnDialog(item: FinishingItem) {
    setReturnItem(item);
    setReturnReason('');
    setReturnDialog(true);
  }

  async function handleReturnToProduction() {
    if (!returnItem || !profile) return;
    if (!returnReason.trim()) {
      toast.error(t('workflow.gate.reasonRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await supabase.from('stage_transitions').insert({
        order_item_id: returnItem.id,
        from_stage: 'finishing',
        to_stage: 'production',
        performed_by: profile.id,
        reason: returnReason,
        qty_moved: 0,
        is_rejection: true,
      });

      await supabase.from('workflow_events').insert({
        order_item_id: returnItem.id,
        from_stage: 'finishing',
        to_stage: 'production',
        action: 'returned_to_previous',
        performed_by: profile.id,
        reason: returnReason,
        metadata: {},
      });

      await supabase
        .from('order_items')
        .update({ workflow_stage: 'production', status: 'active' })
        .eq('id', returnItem.id);

      toast.success(t('workflow.returnedToPrev'));
      setReturnDialog(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(t('error.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  const stageLabel = tab === 'queue' ? t('finishing.queue') : t('finishing.done');

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('finishing.title')} subtitle={t('finishing.subtitle')} />

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-6">
            <TabsTrigger value="queue">{t('finishing.queue')}</TabsTrigger>
            <TabsTrigger value="done">{t('finishing.done')}</TabsTrigger>
          </TabsList>

          {(['queue', 'done'] as const).map(tabVal => (
            <TabsContent key={tabVal} value={tabVal}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}
                </div>
              ) : items.length === 0 ? (
                <Card className="p-8 text-center bg-card border-border">
                  <Scissors className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{t('finishing.noItems')}</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {items.map(item => {
                    const sizes = item.order_item_sizes || [];
                    const totalProduced = sizes.reduce((s, sz) => s + sz.produced_qty, 0);
                    const isExpanded = expandedItems.has(item.id);

                    return (
                      <Card key={item.id} className="bg-card border-border overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground">{t('orders.orderCode')}</p>
                                <p className="font-semibold text-sm">{item.order?.order_code}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">{t('label.productModel')}</p>
                                <p className="text-sm text-foreground/80 truncate">{item.order?.product_model || '—'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">{t('label.color')}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="w-4 h-4 rounded-full border border-border flex-shrink-0"
                                    style={{ backgroundColor: item.color_hex || '#ccc' }} />
                                  <p className="text-sm">{item.color_name}</p>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">{t('label.produced')}</p>
                                <p className="text-sm font-medium text-amber-400">{totalProduced} {t('label.pairs')}</p>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 flex-shrink-0">
                              {tabVal === 'queue' && (
                                <>
                                  <Button size="sm" className="text-xs" onClick={() => openSendDialog(item)}>
                                    <ArrowRight className="w-3 h-3 mr-1" />
                                    {t('finishing.sendToQC')}
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-xs text-amber-400 hover:text-amber-300" onClick={() => openReturnDialog(item)}>
                                    <RotateCcw className="w-3 h-3 mr-1" />
                                    {t('workflow.returnToPrev')}
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" className="text-xs" onClick={() => toggleExpand(item.id)}>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-border bg-background/30 px-4 py-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">{t('label.sizes')}</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground border-b border-border">
                                    <th className="text-start pb-1.5 pr-4">{t('label.size')}</th>
                                    <th className="text-center pb-1.5 px-3">{t('label.required')}</th>
                                    <th className="text-center pb-1.5 px-3">{t('label.produced')}</th>
                                    <th className="text-center pb-1.5 px-3">{t('label.approved')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sizes.sort((a, b) => Number(a.size_value) - Number(b.size_value)).map(sz => (
                                    <tr key={sz.id} className="border-b border-border/40 last:border-0">
                                      <td className="py-1.5 pr-4 font-semibold">{sz.size_value}</td>
                                      <td className="py-1.5 px-3 text-center text-muted-foreground">{sz.required_qty}</td>
                                      <td className="py-1.5 px-3 text-center text-amber-400">{sz.produced_qty}</td>
                                      <td className="py-1.5 px-3 text-center text-emerald-400">{sz.approved_qty}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Send to QC dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('finishing.sendToQC')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-3 text-sm">
              <p className="text-amber-300 font-medium mb-1">{t('workflow.gate.title')}</p>
              <p className="text-amber-200/70 text-xs">{t('workflow.gate.finishingToQC')}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">{t('finishing.confirmQty')}</p>
              <div className="space-y-2">
                {(sendItem?.order_item_sizes || []).sort((a, b) => Number(a.size_value) - Number(b.size_value)).map(sz => (
                  <div key={sz.size_value} className="flex items-center gap-3">
                    <span className="text-sm font-semibold w-10 text-center bg-secondary rounded px-2 py-0.5">{sz.size_value}</span>
                    <span className="text-xs text-muted-foreground flex-1">{t('label.produced')}: {sz.produced_qty}</span>
                    <Input
                      type="number"
                      min={0}
                      value={sendQty[sz.size_value] || 0}
                      onChange={e => setSendQty(prev => ({ ...prev, [sz.size_value]: parseInt(e.target.value) || 0 }))}
                      className="w-24 h-8 text-sm bg-card border-border"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('label.notes')}</label>
              <Input value={sendNotes} onChange={e => setSendNotes(e.target.value)} className="bg-card border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>{t('action.cancel')}</Button>
            <Button onClick={handleSendToQC} disabled={submitting}>
              <ArrowRight className="w-4 h-4 mr-1" />
              {t('workflow.advance')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <Dialog open={returnDialog} onOpenChange={setReturnDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workflow.returnToPrev')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-3 text-sm">
              <p className="text-amber-200 text-xs">{t('workflow.gate.reasonRequired')}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('workflow.returnReason')} *</label>
              <Input
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                placeholder={t('workflow.returnReasonPlaceholder')}
                className="bg-card border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialog(false)}>{t('action.cancel')}</Button>
            <Button variant="destructive" onClick={handleReturnToProduction} disabled={submitting || !returnReason.trim()}>
              {t('workflow.returnToPrev')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
