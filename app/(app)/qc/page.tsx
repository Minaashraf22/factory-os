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
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { WORKFLOW_STAGE_COLORS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { OrderItem, OrderItemSize } from '@/lib/types';

type QCItem = OrderItem & {
  order?: { id: string; order_code: string; product_model?: string; brand_type_override?: string; product?: { name: string; brand_type: 'carlos' | 'arrow' | 'external' } };
  order_item_sizes?: OrderItemSize[];
};

interface SizeDecision {
  sizeValue: string;
  producedQty: number;
  approvedQty: number;
  rejectedQty: number;
  defectType: string;
  notes: string;
}

const DEFECT_TYPES = [
  { value: 'stitching_defect', label: 'qc.defect.stitching' },
  { value: 'sole_separation', label: 'qc.defect.sole' },
  { value: 'material_defect', label: 'qc.defect.material' },
  { value: 'color_issue', label: 'qc.defect.color' },
  { value: 'size_issue', label: 'qc.defect.sizing' },
  { value: 'contamination', label: 'qc.defect.finishing' },
  { value: 'other', label: 'qc.defect.other' },
];

export default function QCPage() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [items, setItems] = useState<QCItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewDialog, setReviewDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QCItem | null>(null);
  const [sizeDecisions, setSizeDecisions] = useState<SizeDecision[]>([]);
  const [rejectAction, setRejectAction] = useState<'return_production' | 'remnants'>('remnants');
  const [overallNotes, setOverallNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchQCItems();
  }, []);

  async function fetchQCItems() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('order_items')
        .select(
          `
          *,
          order:orders(id, order_code, product_model, brand_type_override, product:products(name, brand_type)),
          order_item_sizes(*)
        `
        )
        .eq('workflow_stage', 'qc')
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data as QCItem[]) || []);
    } catch (error) {
      console.error('Error fetching QC items:', error);
      toast.error('Failed to load QC items');
    } finally {
      setLoading(false);
    }
  }

  function openReviewDialog(item: QCItem) {
    setSelectedItem(item);
    const decisions: SizeDecision[] = (item.order_item_sizes || []).map((size) => ({
      sizeValue: size.size_value || '',
      producedQty: size.produced_qty || 0,
      approvedQty: size.produced_qty || 0,
      rejectedQty: 0,
      defectType: '',
      notes: '',
    }));
    setSizeDecisions(decisions);
    setRejectAction('remnants');
    setOverallNotes('');
    setReviewDialog(true);
  }

  function updateSizeDecision(index: number, field: string, value: any) {
    const updated = [...sizeDecisions];
    updated[index] = { ...updated[index], [field]: value };
    setSizeDecisions(updated);
  }

  async function handleSubmitQCDecision() {
    if (!selectedItem || !profile) {
      toast.error(t('error.invalidState'));
      return;
    }

    setSubmitting(true);
    try {
      const totalApproved = sizeDecisions.reduce((sum, d) => sum + d.approvedQty, 0);
      const totalRejected = sizeDecisions.reduce((sum, d) => sum + d.rejectedQty, 0);
      const hasRejections = totalRejected > 0;

      for (const decision of sizeDecisions) {
        const total = decision.approvedQty + decision.rejectedQty;
        if (total !== decision.producedQty) {
          toast.error(t('qc.validation.sumMismatch'));
          setSubmitting(false);
          return;
        }
        if (decision.rejectedQty > 0 && !decision.defectType) {
          toast.error(t('qc.validation.defectRequired'));
          setSubmitting(false);
          return;
        }
      }

      const overallResult = hasRejections ? (totalApproved > 0 ? 'partial' : 'rejected') : 'approved';

      // Create qc_check record
      const { data: qcCheck, error: qcError } = await supabase
        .from('qc_checks')
        .insert({
          order_item_id: selectedItem.id,
          result: overallResult,
          approved_qty: totalApproved,
          rejected_qty: totalRejected,
          notes: overallNotes,
          inspector_id: profile.id,
        })
        .select()
        .single();

      if (qcError) throw qcError;

      // Insert qc_size_decisions
      for (const decision of sizeDecisions) {
        if (decision.rejectedQty > 0 || decision.approvedQty > 0) {
          await supabase.from('qc_size_decisions').insert({
            qc_check_id: qcCheck.id,
            size_value: decision.sizeValue,
            approved_qty: decision.approvedQty,
            rejected_qty: decision.rejectedQty,
            defect_type: decision.defectType || null,
            notes: decision.notes || null,
          });
        }
      }

      // Update order_item_sizes approved_qty
      for (const decision of sizeDecisions) {
        await supabase
          .from('order_item_sizes')
          .update({ approved_qty: decision.approvedQty })
          .eq('order_item_id', selectedItem.id)
          .eq('size_value', decision.sizeValue);
      }

      // Determine next stage based on brand
      const brandType = selectedItem.order?.product?.brand_type || selectedItem.order?.brand_type_override || 'carlos';
      const nextStage = brandType === 'arrow' ? 'finishing' : 'packing_pool';

      // Log stage transition
      if (overallResult !== 'rejected') {
        await supabase.from('stage_transitions').insert({
          order_item_id: selectedItem.id,
          from_stage: 'qc',
          to_stage: nextStage,
          performed_by: profile.id,
          reason: overallNotes || 'QC completed',
          qty_moved: totalApproved,
          is_rejection: false,
        });
      } else {
        await supabase.from('stage_transitions').insert({
          order_item_id: selectedItem.id,
          from_stage: 'qc',
          to_stage: 'production',
          performed_by: profile.id,
          reason: overallNotes || 'QC rejected',
          qty_moved: totalRejected,
          is_rejection: true,
        });
      }

      // Handle partial rejection
      if (overallResult === 'partial') {
        // Move approved qty to next stage
        await supabase.from('workflow_events').insert({
          order_item_id: selectedItem.id,
          from_stage: 'qc',
          to_stage: nextStage,
          action: 'qc_partial',
          performed_by: profile.id,
          qty_moved: totalApproved,
          reason: overallNotes,
          metadata: { qc_check_id: qcCheck.id },
        });

        // If rejected items going to remnants, create remnant record
        if (rejectAction === 'remnants' && totalRejected > 0) {
          await supabase.from('remnants').insert({
            order_item_id: selectedItem.id,
            quantity: totalRejected,
            reason: 'qc_rejection',
            created_by: profile.id,
          });
        }
        // If returning to production, create production event
        else if (rejectAction === 'return_production' && totalRejected > 0) {
          await supabase.from('workflow_events').insert({
            order_item_id: selectedItem.id,
            from_stage: 'qc',
            to_stage: 'production',
            action: 'qc_rework_requested',
            performed_by: profile.id,
            qty_moved: totalRejected,
          });
        }
      } else if (overallResult === 'approved') {
        // All approved, move to next stage
        await supabase.from('workflow_events').insert({
          order_item_id: selectedItem.id,
          from_stage: 'qc',
          to_stage: nextStage,
          action: 'qc_approved',
          performed_by: profile.id,
          qty_moved: totalApproved,
          metadata: { qc_check_id: qcCheck.id },
        });
      }

      // Update order_item workflow_stage
      await supabase
        .from('order_items')
        .update({ workflow_stage: overallResult === 'rejected' ? 'production' : nextStage })
        .eq('id', selectedItem.id);

      toast.success(t('qc.success.approved'));
      setReviewDialog(false);
      fetchQCItems();
    } catch (error) {
      console.error('Error submitting QC decision:', error);
      toast.error(t('error.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('qc.title')} subtitle={t('qc.review')} />
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

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title={t('qc.title')} subtitle={t('qc.review')} />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-muted-foreground mb-2">{t('qc.noItems')}</p>
            <p className="text-sm text-muted-foreground">{t('qc.received')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={t('qc.title')} subtitle={t('qc.reviewFor', { code: items[0]?.order?.order_code || '' })} />
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-4">
          {items.map((item) => {
            const totalProduced = item.order_item_sizes?.reduce((sum, size) => sum + (size.produced_qty || 0), 0) || 0;

            return (
              <Card key={item.id} className="bg-card border-border p-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-6 items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('orders.orderCode')}</p>
                    <p className="font-medium text-sm">{item.order?.order_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('label.product')}</p>
                    <p className="font-medium text-sm">{item.order?.product_model || item.order?.product?.name}</p>
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
                    <p className="text-xs text-muted-foreground">{t('label.produced')}</p>
                    <p className="font-medium text-sm">{totalProduced} {t('label.pairs')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('label.workflow')}</p>
                    <StatusBadge label={t('stage.qc')} colorClass={WORKFLOW_STAGE_COLORS.qc} size="sm" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => openReviewDialog(item)}
                      className="w-full"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      {t('action.view')}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('qc.reviewFor', { code: selectedItem?.order?.order_code || '' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedItem && (
              <>
                <div className="bg-card/50 p-3 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground mb-1">{t('label.product')}</p>
                  <p className="font-medium">{selectedItem.order?.product_model || selectedItem.order?.product?.name}</p>
                </div>

                <div>
                  <label className="text-sm font-semibold text-foreground mb-3 block">{t('qc.perSize')}</label>
                  <div className="space-y-4 bg-card/50 p-4 rounded-lg border border-border">
                    {sizeDecisions.map((decision, idx) => (
                      <div key={idx} className="border-b border-border/50 pb-4 last:border-0">
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-xs text-muted-foreground">{t('label.size')}</label>
                            <p className="font-medium">{decision.sizeValue}</p>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">{t('label.produced')}</label>
                            <p className="font-medium">{decision.producedQty}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">{t('qc.approvedQty')}</label>
                            <Input
                              type="number"
                              min="0"
                              max={decision.producedQty}
                              value={decision.approvedQty}
                              onChange={(e) => updateSizeDecision(idx, 'approvedQty', parseInt(e.target.value) || 0)}
                              className="bg-card border-border h-8 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">{t('qc.rejectedQty')}</label>
                            <Input
                              type="number"
                              min="0"
                              max={decision.producedQty}
                              value={decision.rejectedQty}
                              onChange={(e) => updateSizeDecision(idx, 'rejectedQty', parseInt(e.target.value) || 0)}
                              className="bg-card border-border h-8 text-sm"
                            />
                          </div>
                        </div>

                        {decision.rejectedQty > 0 && (
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">{t('qc.defectType')}</label>
                            <Select value={decision.defectType} onValueChange={(val) => updateSizeDecision(idx, 'defectType', val)}>
                              <SelectTrigger className="bg-card border-border h-8">
                                <SelectValue placeholder={t('qc.selectDefect')} />
                              </SelectTrigger>
                              <SelectContent>
                                {DEFECT_TYPES.map((defect) => (
                                  <SelectItem key={defect.value} value={defect.value}>
                                    {t(defect.label as any)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">{t('label.notes')}</label>
                          <Input
                            value={decision.notes}
                            onChange={(e) => updateSizeDecision(idx, 'notes', e.target.value)}
                            placeholder={t('label.notes')}
                            className="bg-card border-border h-8 text-sm"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-emerald-950/50 border border-emerald-500/30 rounded-lg p-3">
                  <p className="text-xs text-emerald-300 mb-2">{t('label.overview')}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">{t('qc.approvedQty')}</p>
                      <p className="font-semibold text-emerald-400">{sizeDecisions.reduce((sum, d) => sum + d.approvedQty, 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('qc.rejectedQty')}</p>
                      <p className="font-semibold text-red-400">{sizeDecisions.reduce((sum, d) => sum + d.rejectedQty, 0)}</p>
                    </div>
                  </div>
                </div>

                {sizeDecisions.some((d) => d.rejectedQty > 0) && (
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">{t('qc.returnToPrev')}</label>
                    <Select value={rejectAction} onValueChange={(val) => setRejectAction(val as any)}>
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remnants">{t('qc.sendToRemnants')}</SelectItem>
                        <SelectItem value="return_production">{t('qc.returnToPrev')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">{t('label.completionNotes')}</label>
                  <Input
                    value={overallNotes}
                    onChange={(e) => setOverallNotes(e.target.value)}
                    placeholder={t('label.notes')}
                    className="bg-card border-border"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(false)}>
              {t('action.cancel')}
            </Button>
            <Button onClick={handleSubmitQCDecision} disabled={submitting}>
              {submitting ? t('action.submit') : t('action.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
