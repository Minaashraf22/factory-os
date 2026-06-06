'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { moveOrderItem } from '@/lib/workflow';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/lib/i18n';
import { WORKFLOW_STAGE_LABELS, WORKFLOW_STAGE_COLORS, BRAND_TYPE_LABELS, BRAND_TYPE_COLORS } from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { OrderItem, WorkflowStage, BrandType } from '@/lib/types';

interface KanbanItem extends OrderItem {
  order_code: string;
  product_name: string;
  brand_type: BrandType;
  total_required: number;
  product_id: string;
}

const ACTIVE_STAGES: WorkflowStage[] = ['production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping'];

const STAGE_BORDER_COLORS: Record<WorkflowStage, string> = {
  production: 'border-t-blue-500',
  finishing: 'border-t-amber-500',
  qc: 'border-t-orange-500',
  packing_pool: 'border-t-emerald-500',
  warehouse: 'border-t-teal-500',
  shipping: 'border-t-sky-500',
  remnants: 'border-t-slate-500',
};

export default function KanbanPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<KanbanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dragItem, setDragItem] = useState<KanbanItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<WorkflowStage | null>(null);
  const [moving, setMoving] = useState(false);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('order_items')
      .select(`
        *,
        order:orders(order_code, product:products(name, brand_type, id)),
        order_item_sizes(required_qty)
      `)
      .in('status', ['active', 'pending'])
      .in('workflow_stage', ACTIVE_STAGES);

    const mapped: KanbanItem[] = (data || []).map((item: any) => ({
      ...item,
      order_code: item.order?.order_code || '',
      product_name: item.order?.product?.name || 'Unknown',
      brand_type: item.order?.product?.brand_type || 'carlos',
      product_id: item.order?.product?.id || '',
      total_required: (item.order_item_sizes || []).reduce((sum: number, s: any) => sum + (s.required_qty || 0), 0),
    }));
    setItems(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
    // Realtime subscription
    const channel = supabase
      .channel('kanban-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadItems]);

  const handleDragStart = (item: KanbanItem) => setDragItem(item);
  const handleDragEnd = () => { setDragItem(null); setDragOverStage(null); };
  const handleDragOver = (e: React.DragEvent, stage: WorkflowStage) => {
    e.preventDefault();
    setDragOverStage(stage);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: WorkflowStage) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!dragItem || dragItem.workflow_stage === targetStage || !profile) return;

    setMoving(true);
    // Optimistic update
    setItems(prev => prev.map(i => i.id === dragItem.id ? { ...i, workflow_stage: targetStage } : i));

    const result = await moveOrderItem(
      { ...dragItem, workflow_stage: dragItem.workflow_stage } as any,
      targetStage,
      dragItem.brand_type,
      profile.id,
      'Moved via Kanban board'
    );

    if (result.success) {
      toast.success(t('kanban.moveSuccess', { stage: WORKFLOW_STAGE_LABELS[targetStage] }));
    } else {
      // Revert
      setItems(prev => prev.map(i => i.id === dragItem.id ? { ...i, workflow_stage: dragItem.workflow_stage } : i));
      toast.error(result.error || t('kanban.moveFailed'));
    }
    setMoving(false);
  };

  const filtered = items.filter(item =>
    !search || item.order_code.toLowerCase().includes(search.toLowerCase()) ||
    item.product_name.toLowerCase().includes(search.toLowerCase()) ||
    item.color_name.toLowerCase().includes(search.toLowerCase())
  );

  const getStageItems = (stage: WorkflowStage) => filtered.filter(i => i.workflow_stage === stage);

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-6 py-5 border-b border-border">
          <div className="h-7 w-40 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex gap-4 p-6 overflow-x-auto">
          {ACTIVE_STAGES.map(s => (
            <div key={s} className="w-64 flex-shrink-0 bg-card border border-border rounded-xl h-96 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('kanban.title')} subtitle={t('kanban.title')}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('action.search')}
            className="pl-9 w-64 bg-input border-border h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={loadItems} className="gap-2 border-border">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </PageHeader>

      {/* Stats bar */}
      <div className="px-6 py-2 border-b border-border bg-card/30 flex gap-6">
        {ACTIVE_STAGES.map(stage => {
          const count = getStageItems(stage).length;
          return (
            <div key={stage} className="flex items-center gap-1.5 text-xs">
              <div className={`w-2 h-2 rounded-full ${STAGE_BORDER_COLORS[stage].replace('border-t-', 'bg-')}`} />
              <span className="text-muted-foreground">{WORKFLOW_STAGE_LABELS[stage]}:</span>
              <span className="font-semibold text-foreground">{count}</span>
            </div>
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} total items</span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max pb-4">
          {ACTIVE_STAGES.map(stage => {
            const stageItems = getStageItems(stage);
            const isDragTarget = dragOverStage === stage;
            return (
              <div
                key={stage}
                className={`w-[264px] flex-shrink-0 flex flex-col rounded-xl border border-border transition-colors ${
                  isDragTarget ? 'border-primary/50 bg-primary/5' : 'bg-card'
                } border-t-[3px] ${STAGE_BORDER_COLORS[stage]}`}
                onDragOver={e => handleDragOver(e, stage)}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={e => handleDrop(e, stage)}
              >
                {/* Column header */}
                <div className="px-3 py-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">{WORKFLOW_STAGE_LABELS[stage]}</h3>
                    <span className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium text-muted-foreground">
                      {stageItems.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageItems.length === 0 ? (
                    <div className={`h-20 rounded-lg border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground transition-colors ${isDragTarget ? 'border-primary/40 text-primary' : 'border-border/50'}`}>
                      {isDragTarget ? t('kanban.dropHere') : t('kanban.noItems')}
                    </div>
                  ) : (
                    stageItems.map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => handleDragStart(item)}
                        onDragEnd={handleDragEnd}
                        className={`kanban-card bg-secondary border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none ${
                          dragItem?.id === item.id ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <div
                            className="w-4 h-4 rounded flex-shrink-0 mt-0.5 border border-white/10"
                            style={{ backgroundColor: item.color_hex }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground leading-tight truncate">{item.color_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{item.product_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <Link
                            href={`/orders/${item.order_id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-[10px] font-mono text-primary hover:underline"
                          >
                            #{item.order_code}
                          </Link>
                          <span className="text-[10px] text-muted-foreground">{item.total_required} pairs</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${BRAND_TYPE_COLORS[item.brand_type]}`}>
                            {BRAND_TYPE_LABELS[item.brand_type]}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
