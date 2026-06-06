export type UserRole = 'admin' | 'planning' | 'production' | 'qc' | 'packing' | 'warehouse' | 'shipping';
export type DepartmentType = 'planning' | 'production' | 'finishing' | 'qc' | 'packing' | 'warehouse' | 'shipping' | 'admin';
export type BrandType = 'carlos' | 'arrow' | 'external';
export type OrderStatus = 'draft' | 'planning' | 'in_production' | 'completed' | 'cancelled' | 'on_hold' | 'archived';
export type WorkflowStage = 'production' | 'finishing' | 'qc' | 'packing_pool' | 'warehouse' | 'shipping' | 'remnants';
export type ItemWorkflowStatus = 'pending' | 'active' | 'completed' | 'on_hold' | 'rejected';
export type QcResult = 'approved' | 'rejected' | 'partial';
export type CartonStatus = 'draft' | 'building' | 'locked' | 'completed' | 'warehouse' | 'shipped' | 'voided';
export type MachineStatus = 'available' | 'in_use' | 'maintenance' | 'offline';
export type MoldStatus = 'available' | 'in_use' | 'maintenance' | 'retired';
export type MaterialType = 'eva' | 'pvc' | 'rubber' | 'natural_rubber' | 'fabric' | 'adhesive' | 'lining' | 'outsole' | 'insole' | 'other';
export type TransactionType = 'addition' | 'deduction' | 'transfer' | 'return' | 'adjustment' | 'allocation' | 'consumption';
export type RemnantStatus = 'available' | 'reserved' | 'used' | 'voided';
export type AllocationStatus = 'pending' | 'confirmed' | 'used' | 'cancelled';
export type ChatRoomType = 'global' | 'direct' | 'department';
export type MessageType = 'text' | 'image' | 'file' | 'voice';
export type AttachmentType = 'image' | 'file' | 'voice';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string;
  avatar_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  brand_type: BrandType;
  external_brand_name: string;
  description: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_code: string;
  product_id: string;
  status: OrderStatus;
  notes: string;
  delivery_date: string | null;
  customer_name: string;
  product_model: string;
  brand_type_override: BrandType;
  external_brand_name: string;
  total_pairs: number;
  carton_capacity: number;
  created_by: string | null;
  planned_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string;
  archived_at: string | null;
  archived_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  product?: Product;
  order_items?: OrderItem[];
  created_by_profile?: Profile;
}

export interface OrderItem {
  id: string;
  order_id: string;
  color_name: string;
  color_code: string;
  color_hex: string;
  status: ItemWorkflowStatus;
  workflow_stage: WorkflowStage;
  sequence: number;
  notes: string;
  created_at: string;
  updated_at: string;
  order?: Order;
  order_item_sizes?: OrderItemSize[];
}

export interface OrderItemSize {
  id: string;
  order_item_id: string;
  size_value: string;
  required_qty: number;
  produced_qty: number;
  approved_qty: number;
  packed_qty: number;
  remnant_qty: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowEvent {
  id: string;
  order_item_id: string;
  from_stage: WorkflowStage | null;
  to_stage: WorkflowStage;
  action: string;
  performed_by: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
  performed_by_profile?: Profile;
  order_item?: OrderItem;
}

export interface QcCheck {
  id: string;
  order_item_id: string;
  workflow_event_id: string | null;
  result: QcResult;
  defect_type: string;
  defect_description: string;
  approved_qty: number;
  rejected_qty: number;
  notes: string;
  inspector_id: string | null;
  created_at: string;
  updated_at: string;
  order_item?: OrderItem;
  inspector?: Profile;
  qc_attachments?: QcAttachment[];
}

export interface QcAttachment {
  id: string;
  qc_check_id: string;
  type: AttachmentType;
  url: string;
  name: string;
  size_bytes: number;
  created_at: string;
}

export interface Carton {
  id: string;
  order_id: string;
  carton_number: number;
  capacity: number;
  current_qty: number;
  status: CartonStatus;
  locked_at: string | null;
  completed_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  order?: Order;
  carton_items?: CartonItem[];
}

export interface CartonItem {
  id: string;
  carton_id: string;
  order_item_id: string;
  size_value: string;
  quantity: number;
  created_at: string;
  order_item?: OrderItem;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  type: MaterialType;
  unit: string;
  cost_per_unit: number;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  material_stock?: MaterialStock;
}

export interface MaterialStock {
  id: string;
  material_id: string;
  quantity: number;
  reserved_quantity: number;
  warehouse_location: string;
  last_updated: string;
  created_at: string;
}

export interface MaterialAllocation {
  id: string;
  order_id: string;
  material_id: string;
  allocated_qty: number;
  consumed_qty: number;
  status: AllocationStatus;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  material?: Material;
  order?: Order;
}

export interface Machine {
  id: string;
  code: string;
  name: string;
  type: string;
  status: MachineStatus;
  last_maintenance: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MachineAssignment {
  id: string;
  machine_id: string;
  order_item_id: string;
  assigned_at: string;
  released_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  machine?: Machine;
  order_item?: OrderItem;
}

export interface Mold {
  id: string;
  code: string;
  mold_number: string;
  product_id: string | null;
  material_type: string;
  compatible_sizes: string[];
  status: MoldStatus;
  notes: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product?: Product;
}

export interface MoldAssignment {
  id: string;
  mold_id: string;
  order_item_id: string;
  assigned_at: string;
  released_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  mold?: Mold;
  order_item?: OrderItem;
}

export interface InventoryLedgerEntry {
  id: string;
  item_type: string;
  item_id: string;
  transaction_type: TransactionType;
  quantity: number;
  reference_type: string;
  reference_id: string | null;
  notes: string;
  balance_after: number | null;
  performed_by: string | null;
  created_at: string;
  performed_by_profile?: Profile;
}

export interface Remnant {
  id: string;
  product_id: string;
  origin_order_id: string;
  order_item_id: string | null;
  color_name: string;
  color_code: string;
  color_hex: string;
  size_value: string;
  quantity: number;
  reserved_quantity: number;
  status: RemnantStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  product?: Product;
  origin_order?: Order;
}

export interface RemnantAllocation {
  id: string;
  remnant_id: string;
  target_order_id: string;
  target_order_item_id: string | null;
  quantity: number;
  status: AllocationStatus;
  notes: string;
  allocated_by: string | null;
  created_at: string;
  updated_at: string;
  remnant?: Remnant;
  target_order?: Order;
}

export interface ChatRoom {
  id: string;
  type: ChatRoomType;
  name: string;
  description: string;
  department: string;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  chat_room_members?: ChatRoomMember[];
  last_message?: ChatMessage;
}

export interface ChatRoomMember {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  profile?: Profile;
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  type: MessageType;
  reply_to_id: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  sender?: Profile;
  reply_to?: ChatMessage;
  chat_attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  message_id: string;
  type: AttachmentType;
  url: string;
  name: string;
  size_bytes: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  user_id: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  metadata: Record<string, unknown>;
  ip_address: string;
  created_at: string;
  user?: Profile;
}

// Workflow stage configs per brand type
export interface WorkflowConfig {
  stages: WorkflowStage[];
  label: string;
}

export interface ProductionBatch {
  id: string;
  order_item_id: string;
  batch_number: number;
  status: string;
  total_qty: number;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  batch_sizes?: { id: string; batch_id: string; size_value: string; quantity: number }[];
  order_item?: OrderItem;
}

export interface StageTransition {
  id: string;
  order_item_id: string;
  batch_id: string | null;
  from_stage: string | null;
  to_stage: string;
  performed_by: string | null;
  reason: string;
  qty_moved: number;
  is_rejection: boolean;
  created_at: string;
  performed_by_profile?: Profile;
  order_item?: OrderItem;
}

// Database type stub for supabase client typing
export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>;
  };
};
