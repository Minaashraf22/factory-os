import { supabase } from '@/lib/supabase/client';
import type { WorkflowStage, BrandType, OrderItem, WorkflowEvent } from '@/lib/types';
import { BRAND_WORKFLOWS } from '@/lib/constants';

export function getWorkflowForBrand(brandType: BrandType): WorkflowStage[] {
  return BRAND_WORKFLOWS[brandType] || BRAND_WORKFLOWS.carlos;
}

export function getNextStage(currentStage: WorkflowStage, brandType: BrandType): WorkflowStage | null {
  const workflow = getWorkflowForBrand(brandType);
  const idx = workflow.indexOf(currentStage);
  if (idx === -1 || idx === workflow.length - 1) return null;
  return workflow[idx + 1];
}

export function getPrevStage(currentStage: WorkflowStage, brandType: BrandType): WorkflowStage | null {
  const workflow = getWorkflowForBrand(brandType);
  const idx = workflow.indexOf(currentStage);
  if (idx <= 0) return null;
  return workflow[idx - 1];
}

export function canMoveToStage(
  currentStage: WorkflowStage,
  targetStage: WorkflowStage,
  brandType: BrandType
): boolean {
  const workflow = getWorkflowForBrand(brandType);
  const currentIdx = workflow.indexOf(currentStage);
  const targetIdx = workflow.indexOf(targetStage);
  // Allow moving forward by one step, or backwards (returns/rejections)
  return targetIdx !== -1 && (targetIdx === currentIdx + 1 || targetIdx < currentIdx);
}

export async function moveOrderItem(
  orderItem: OrderItem,
  targetStage: WorkflowStage,
  brandType: BrandType,
  performedBy: string,
  reason: string = '',
  metadata: Record<string, unknown> = {}
): Promise<{ success: boolean; error?: string; event?: WorkflowEvent }> {
  const fromStage = orderItem.workflow_stage;

  if (fromStage === targetStage) {
    return { success: false, error: 'Item is already in this stage' };
  }

  // Create workflow event
  const { data: event, error: eventError } = await supabase
    .from('workflow_events')
    .insert({
      order_item_id: orderItem.id,
      from_stage: fromStage,
      to_stage: targetStage,
      action: 'stage_change',
      performed_by: performedBy,
      reason,
      metadata,
    })
    .select()
    .single();

  if (eventError) {
    return { success: false, error: eventError.message };
  }

  // Update order item
  const { error: updateError } = await supabase
    .from('order_items')
    .update({
      workflow_stage: targetStage,
      status: targetStage === 'shipping' ? 'completed' : 'active',
    })
    .eq('id', orderItem.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log audit
  await supabase.from('audit_logs').insert({
    action: 'workflow_stage_change',
    entity_type: 'order_item',
    entity_id: orderItem.id,
    user_id: performedBy,
    before_state: { workflow_stage: fromStage },
    after_state: { workflow_stage: targetStage },
    metadata: { reason, ...metadata },
  });

  return { success: true, event: event as WorkflowEvent };
}

export async function generateOrderCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_order_code');
  if (error || !data) {
    // Fallback: generate client-side
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    return `${yy}${mm}${dd}${seq}`;
  }
  return data as string;
}

export async function detectSurplusAndCreateRemnants(
  orderItemId: string,
  productId: string,
  originOrderId: string
): Promise<void> {
  const { data: sizes } = await supabase
    .from('order_item_sizes')
    .select('*')
    .eq('order_item_id', orderItemId);

  if (!sizes) return;

  const { data: orderItem } = await supabase
    .from('order_items')
    .select('color_name, color_code, color_hex')
    .eq('id', orderItemId)
    .single();

  if (!orderItem) return;

  for (const size of sizes) {
    const surplus = size.produced_qty - size.required_qty;
    if (surplus > 0) {
      await supabase.from('remnants').insert({
        product_id: productId,
        origin_order_id: originOrderId,
        order_item_id: orderItemId,
        color_name: orderItem.color_name,
        color_code: orderItem.color_code,
        color_hex: orderItem.color_hex,
        size_value: size.size_value,
        quantity: surplus,
        status: 'available',
      });

      // Update remnant_qty on the size record
      await supabase
        .from('order_item_sizes')
        .update({ remnant_qty: surplus })
        .eq('id', size.id);
    }
  }
}
