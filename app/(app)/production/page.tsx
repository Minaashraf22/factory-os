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
import { Plus, ChevronDown, ChevronUp, ArrowRight, RotateCcw, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { WORKFLOW_STAGE_COLORS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { OrderItemSize } from '@/lib/types';

interface ProductionItem {
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

interface ProductionBatch {
  id: string;
  order_item_id: string;
  batch_number: number;
  status: string;
  total_qty: number;
  notes: string;
  created_at: string;
  created_by: string | null;
  batch_sizes?: { size_value: string; quantity: number }[];
  order_item?: ProductionItem;
}

export default function ProductionPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [tab, setTab] = useState<'pending' | 'active' | 'done'>('pending');
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Batch creation dialog
  const [batchDialog, setBatchDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProductionItem | null>(null);
  const [batchSizes, setBatchSizes] = useState<Record<string, number>>({});
  const [batchNotes, setBatchNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Send to finishing dialog
  const [sendDialog, setSendDialog] = useState(false);
  const [sendItem, setSendItem] = useState<ProductionItem | null>(null);
  const [sendQty, setSendQty] = useState<Record<string, number>>({});
  const [sendReason, setSendReason] = useState('');

  // Return dialog
  const [returnDialog, setReturnDialog] = useState(false);
  const [returnItem, setReturnItem] = useState<ProductionItem | null>(null);
  const [returnReason, setReturnReason] = useState('');

  useEffect(() => {
    fetchData();
  }, [tab]);

  async function fetchData() {
    try {
      setLoading(true);
      const stageFilter = 'production';

      const statusMap = {
        pending: ['pending'],
        active: ['active'],
        done: ['completed'],
      };

      const [itemsRes, batchesRes] = await Promise.all([
        supabase
          .from('order_items')
          .select(`
            *,
            order:orders(id, order_code, product_model, brand_type_override),
            order_item_sizes(*)
          `)
          .eq('workflow_stage', stageFilter)
          .in('status', statusMap[tab])
          .order('created_at', { ascending: false }),
        supabase
          .from('production_batches')
          .select(`
            *,
            batch_sizes:production_batch_sizes(*),
            order_item:order_items(id, color_name, color_hex, order:orders(order_code, product_model))
          `)
          .in('status', ['active', 'completed'])
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      setItems((itemsRes.data as unknown as ProductionItem[]) || []);

      if (!batchesRes.error) {
        setBatches((batchesRes.data as unknown as ProductionBatch[]) || []);
      }
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

  function openBatchDialog(item: ProductionItem) {
    setSelectedItem(item);
    const initial: Record<string, number> = {};
    (item.order_item_sizes || []).forEach(sz => { initial[sz.size_value] = 0; });
    setBatchSizes(initial);
    setBatchNotes('');
    setBatchDialog(true);
  }

  async function createBatch() {
    if (!selectedItem || !profile) return;
    const totalQty = Object.values(batchSizes).reduce((s, v) => s + v, 0);
    if (totalQty === 0) {
      toast.error(t('production.batchQtyRequired'));
      return;
    }

    setSubmitting(true);
    try {
      // Get next batch number
      const { count } = await supabase
        .from('production_batches')
        .select('id', { count: 'exact', head: true })
        .eq('order_item_id', selectedItem.id);

      const batchNumber = (count || 0) + 1;

      const { data: batch, error: batchErr } = await supabase
        .from('production_batches')
        .insert({
          order_item_id: selectedItem.id,
          batch_number: batchNumber,
          status: 'active',
          total_qty: totalQty,
          notes: batchNotes,
          created_by: profile.id,
        })
        .select()
        .single();

      if (batchErr) throw batchErr;

      // Insert batch sizes
      const sizeRows = Object.entries(batchSizes)
        .filter(([, qty]) => qty > 0)
        .map(([size_value, quantity]) => ({ batch_id: batch.id, size_value, quantity }));

      if (sizeRows.length > 0) {
        const { error: sizeErr } = await supabase
          .from('production_batch_sizes')
          .insert(sizeRows);
        if (sizeErr) throw sizeErr;
      }

      // Update produced_qty on order_item_sizes
      for (const [size_value, qty] of Object.entries(batchSizes)) {
        if (qty > 0) {
          const existing = selectedItem.order_item_sizes?.find(s => s.size_value === size_value);
          const newQty = (existing?.produced_qty || 0) + qty;
          await supabase
            .from('order_item_sizes')
            .update({ produced_qty: newQty })
            .eq('order_item_id', selectedItem.id)
            .eq('size_value', size_value);
        }
      }

      // Log workflow event
      await supabase.from('workflow_events').insert({
        order_item_id: selectedItem.id,
        from_stage: 'production',
        to_stage: 'production',
        action: 'batch_created',
        performed_by: profile.id,
        reason: batchNotes || `Batch ${batchNumber} created`,
        metadata: { batch_id: batch.id, batch_number: batchNumber, total_qty: totalQty },
      });

      toast.success(t('production.batchCreated'));
      setBatchDialog(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(t('error.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  function openSendDialog(item: ProductionItem) {
    setSendItem(item);
    const initial: Record<string, number> = {};
    (item.order_item_sizes || []).forEach(sz => {
      initial[sz.size_value] = sz.produced_qty || 0;
    });
    setSendQty(initial);
    setSendReason('');
    setSendDialog(true);
  }

  async function handleSendToFinishing() {
    if (!sendItem || !profile) return;

    // Gate: validate produced qty
    const totalQty = Object.values(sendQty).reduce((s, v) => s + v, 0);
    if (totalQty === 0) {
      toast.error(t('workflow.gate.noQty'));
      return;
    }

    const brand = sendItem.order?.brand_type_override || 'carlos';
    // Production → Finishing for carlos/external; Production → QC for arrow
    const nextStage = brand === 'arrow' ? 'qc' : 'finishing';

    setSubmitting(true);
    try {
      await supabase.from('stage_transitions').insert({
        order_item_id: sendItem.id,
        from_stage: 'production',
        to_stage: nextStage,
        performed_by: profile.id,
        reason: sendReason || 'Production completed',
        qty_moved: totalQty,
        is_rejection: false,
      });

      await supabase.from('workflow_events').insert({
        order_item_id: sendItem.id,
        from_stage: 'production',
        to_stage: nextStage,
        action: 'stage_advance',
        performed_by: profile.id,
        reason: sendReason || 'Production completed',
        qty_moved: totalQty,
        metadata: {},
      });

      await supabase
        .from('order_items')
        .update({ workflow_stage: nextStage, status: 'active' })
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

  function openReturnDialog(item: ProductionItem) {
    setReturnItem(item);
    setReturnReason('');
    setReturnDialog(true);
  }

  async function handleReturnToPlanning() {
    if (!returnItem || !profile) return;
    if (!returnReason.trim()) {
      toast.error(t('workflow.gate.reasonRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await supabase.from('stage_transitions').insert({
        order_item_id: returnItem.id,
        from_stage: 'production',
        to_stage: 'production',
        performed_by: profile.id,
        reason: returnReason,
        qty_moved: 0,
        is_rejection: true,
      });

      await supabase.from('workflow_events').insert({
        order_item_id: returnItem.id,
        from_stage: 'production',
        to_stage: 'production',
        action: 'returned_to_planning',
        performed_by: profile.id,
        reason: returnReason,
        metadata: {},
      });

      await supabase
        .from('order_items')
        .update({ status: 'on_hold', notes: returnReason })
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

  const itemBatches = (itemId: string) =>
    batches.filter(b => b.order_item_id === itemId);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('production.title')} subtitle={t('production.subtitle')} />

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="mb-6">
            <TabsTrigger value="pending">{t('production.tab.pending')}</TabsTrigger>
            <TabsTrigger value="active">{t('production.tab.active')}</TabsTrigger>
            <TabsTrigger value="done">{t('production.tab.done')}</TabsTrigger>
          </TabsList>

          {(['pending', 'active', 'done'] as const).map(tabVal => (
            <TabsContent key={tabVal} value={tabVal}>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-24 bg-card rounded-lg animate-pulse" />)}
                </div>
              ) : items.length === 0 ? (
                <Card className="p-8 text-center bg-card border-border">
                  <Layers className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">{t('production.noItems')}</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {items.map(item => {
                    const sizes = item.order_item_sizes || [];
                    const totalRequired = sizes.reduce((s, sz) => s + sz.required_qty, 0);
                    const totalProduced = sizes.reduce((s, sz) => s + sz.produced_qty, 0);
                    const progress = totalRequired > 0 ? Math.round((totalProduced / totalRequired) * 100) : 0;
                    const isExpanded = expandedItems.has(item.id);
                    const myBatches = itemBatches(item.id);

                    return (
                      <Card key={item.id} className="bg-card border-border overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
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
                                <p className="text-xs text-muted-foreground">{t('label.progress')}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 bg-secondary rounded-full h-1.5">
                                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} />
                                  </div>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{totalProduced}/{totalRequired}</span>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">{t('label.batches')}</p>
                                <p className="text-sm font-medium text-blue-400">{myBatches.length}</p>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 flex-shrink-0">
                              {tabVal === 'active' && (
                                <>
                                  <Button size="sm" variant="outline" className="text-xs" onClick={() => openBatchDialog(item)}>
                                    <Plus className="w-3 h-3 mr-1" />
                                    {t('production.addBatch')}
                                  </Button>
                                  <Button size="sm" className="text-xs" onClick={() => openSendDialog(item)}>
                                    <ArrowRight className="w-3 h-3 mr-1" />
                                    {t('production.sendForward')}
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
                          <div className="border-t border-border bg-background/30 px-4 py-3 space-y-4">
                            {/* Size table */}
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground mb-2">{t('label.sizes')}</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border">
                                      <th className="text-start pb-1.5 pr-4">{t('label.size')}</th>
                                      <th className="text-center pb-1.5 px-3">{t('label.required')}</th>
                                      <th className="text-center pb-1.5 px-3">{t('label.produced')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sizes.sort((a, b) => Number(a.size_value) - Number(b.size_value)).map(sz => (
                                      <tr key={sz.id} className="border-b border-border/40 last:border-0">
                                        <td className="py-1.5 pr-4 font-semibold">{sz.size_value}</td>
                                        <td className="py-1.5 px-3 text-center text-muted-foreground">{sz.required_qty}</td>
                                        <td className="py-1.5 px-3 text-center text-blue-400">{sz.produced_qty}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Batches */}
                            {myBatches.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-2">{t('production.batches')}</p>
                                <div className="space-y-1.5">
                                  {myBatches.map(batch => (
                                    <div key={batch.id} className="flex items-center justify-between bg-card/60 rounded-md px-3 py-2">
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs font-semibold text-blue-400">{t('production.batchNum', { num: batch.batch_number })}</span>
                                        <span className="text-xs text-muted-foreground">{batch.total_qty} {t('label.pairs')}</span>
                                        {batch.notes && <span className="text-xs text-muted-foreground/60 truncate max-w-32">{batch.notes}</span>}
                                      </div>
                                      <StatusBadge
                                        label={batch.status}
                                        colorClass={batch.status === 'active' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}
                                        size="sm"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
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

      {/* Batch creation dialog */}
      <Dialog open={batchDialog} onOpenChange={setBatchDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('production.createBatch')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-card/50 p-3 rounded-lg border border-border text-sm">
              <span className="text-muted-foreground">{t('orders.orderCode')}: </span>
              <span className="font-semibold">{selectedItem?.order?.order_code}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span>{selectedItem?.color_name}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-3">{t('production.batchQtyPerSize')}</p>
              <div className="space-y-2">
                {(selectedItem?.order_item_sizes || []).sort((a, b) => Number(a.size_value) - Number(b.size_value)).map(sz => (
                  <div key={sz.size_value} className="flex items-center gap-3">
                    <span className="text-sm font-semibold w-10 text-center bg-secondary rounded px-2 py-0.5">{sz.size_value}</span>
                    <span className="text-xs text-muted-foreground flex-1">{t('label.required')}: {sz.required_qty} · {t('label.produced')}: {sz.produced_qty}</span>
                    <Input
                      type="number"
                      min={0}
                      max={sz.required_qty - sz.produced_qty}
                      value={batchSizes[sz.size_value] || 0}
                      onChange={e => setBatchSizes(prev => ({ ...prev, [sz.size_value]: parseInt(e.target.value) || 0 }))}
                      className="w-24 h-8 text-sm bg-card border-border"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="text-sm font-medium text-foreground/60 text-end">
              {t('label.total')}: <span className="text-foreground font-bold">{Object.values(batchSizes).reduce((s, v) => s + v, 0)}</span> {t('label.pairs')}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t('label.notes')}</label>
              <Input value={batchNotes} onChange={e => setBatchNotes(e.target.value)} className="bg-card border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialog(false)}>{t('action.cancel')}</Button>
            <Button onClick={createBatch} disabled={submitting}>{t('production.createBatch')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to next stage dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('production.sendForward')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-blue-950/40 border border-blue-500/30 rounded-lg p-3 text-sm">
              <p className="text-blue-300 font-medium mb-1">{t('workflow.gate.title')}</p>
              <p className="text-blue-200/70 text-xs">{t('workflow.gate.productionToNext')}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-2">{t('production.confirmQtyPerSize')}</p>
              <div className="space-y-2">
                {(sendItem?.order_item_sizes || []).sort((a, b) => Number(a.size_value) - Number(b.size_value)).map(sz => (
                  <div key={sz.size_value} className="flex items-center gap-3">
                    <span className="text-sm font-semibold w-10 text-center bg-secondary rounded px-2 py-0.5">{sz.size_value}</span>
                    <span className="text-xs text-muted-foreground flex-1">{t('label.required')}: {sz.required_qty}</span>
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
              <Input value={sendReason} onChange={e => setSendReason(e.target.value)} className="bg-card border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>{t('action.cancel')}</Button>
            <Button onClick={handleSendToFinishing} disabled={submitting}>
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
            <Button variant="destructive" onClick={handleReturnToPlanning} disabled={submitting || !returnReason.trim()}>
              {t('workflow.returnToPrev')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
