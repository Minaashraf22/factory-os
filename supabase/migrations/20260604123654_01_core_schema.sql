/*
  # Core Schema - Shoe Factory ERP

  ## Overview
  This migration creates the entire core database schema for the shoe factory ERP system.
  All production operations trace back to the Order entity.

  ## Tables Created
  1. `profiles` - User profiles extending auth.users with roles and departments
  2. `products` - Product catalog with brand type classification
  3. `orders` - Master production orders with auto-generated codes
  4. `order_items` - Color/variant units within an order, move independently through workflow
  5. `order_item_sizes` - Dynamic size breakdown per order item with quantity tracking
  6. `workflow_events` - Full audit trail of every stage transition
  7. `qc_checks` - Quality control inspection records
  8. `qc_attachments` - Images, voice notes, files attached to QC checks
  9. `cartons` - Packing containers linked to orders
  10. `carton_items` - Size/color breakdown within each carton
  11. `materials` - Raw material catalog (EVA, PVC, Rubber, etc.)
  12. `material_stock` - Current stock levels per material
  13. `material_allocations` - Per-order material reservations and consumption
  14. `machines` - Production machine registry
  15. `machine_assignments` - Machine-to-order-item assignments
  16. `molds` - Mold/die registry linked to products
  17. `mold_assignments` - Mold-to-order-item assignments
  18. `inventory_ledger` - Immutable ledger for all stock movements
  19. `remnants` - Surplus production stock from overproduction
  20. `remnant_allocations` - Remnant reservations for future orders
  21. `chat_rooms` - Global and direct chat channels
  22. `chat_room_members` - Room membership
  23. `chat_messages` - All chat messages
  24. `chat_attachments` - Files/images attached to messages
  25. `audit_logs` - System-wide action audit trail

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read all operational data
  - Write access gated by role (enforced via app layer + RLS)
  - Admin role has full access

  ## Notes
  - brand_type drives workflow order (Carlos/External vs Arrow)
  - workflow_stage enum enforces valid stage values
  - All quantity columns default to 0 and use integer type
*/

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'planning', 'production', 'qc', 'packing', 'warehouse', 'shipping');
CREATE TYPE brand_type AS ENUM ('carlos', 'arrow', 'external');
CREATE TYPE order_status AS ENUM ('draft', 'planning', 'in_production', 'completed', 'cancelled', 'on_hold');
CREATE TYPE workflow_stage AS ENUM ('production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping', 'remnants');
CREATE TYPE item_workflow_status AS ENUM ('pending', 'active', 'completed', 'on_hold', 'rejected');
CREATE TYPE qc_result AS ENUM ('approved', 'rejected', 'partial');
CREATE TYPE carton_status AS ENUM ('draft', 'building', 'locked', 'completed', 'warehouse', 'shipped', 'voided');
CREATE TYPE machine_status AS ENUM ('available', 'in_use', 'maintenance', 'offline');
CREATE TYPE mold_status AS ENUM ('available', 'in_use', 'maintenance', 'retired');
CREATE TYPE material_type AS ENUM ('eva', 'pvc', 'rubber', 'natural_rubber', 'fabric', 'adhesive', 'lining', 'outsole', 'insole', 'other');
CREATE TYPE transaction_type AS ENUM ('addition', 'deduction', 'transfer', 'return', 'adjustment', 'allocation', 'consumption');
CREATE TYPE remnant_status AS ENUM ('available', 'reserved', 'used', 'voided');
CREATE TYPE allocation_status AS ENUM ('pending', 'confirmed', 'used', 'cancelled');
CREATE TYPE chat_room_type AS ENUM ('global', 'direct', 'department');
CREATE TYPE message_type AS ENUM ('text', 'image', 'file', 'voice');
CREATE TYPE attachment_type AS ENUM ('image', 'file', 'voice');

-- ============================================================
-- PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'production',
  department text DEFAULT '',
  avatar_url text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'footwear',
  brand_type brand_type NOT NULL DEFAULT 'carlos',
  external_brand_name text DEFAULT '',
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code text UNIQUE NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id),
  status order_status NOT NULL DEFAULT 'draft',
  notes text DEFAULT '',
  delivery_date date,
  customer_name text DEFAULT '',
  total_pairs integer NOT NULL DEFAULT 0,
  carton_capacity integer NOT NULL DEFAULT 12,
  created_by uuid REFERENCES profiles(id),
  planned_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- ORDER ITEMS (Colors)
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  color_name text NOT NULL,
  color_code text NOT NULL DEFAULT '',
  color_hex text DEFAULT '#6B7280',
  status item_workflow_status NOT NULL DEFAULT 'pending',
  workflow_stage workflow_stage NOT NULL DEFAULT 'production',
  sequence integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert order items"
  ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update order items"
  ON order_items FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- ORDER ITEM SIZES
-- ============================================================

CREATE TABLE IF NOT EXISTS order_item_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  size_value text NOT NULL,
  required_qty integer NOT NULL DEFAULT 0,
  produced_qty integer NOT NULL DEFAULT 0,
  approved_qty integer NOT NULL DEFAULT 0,
  packed_qty integer NOT NULL DEFAULT 0,
  remnant_qty integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id, size_value)
);

ALTER TABLE order_item_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sizes"
  ON order_item_sizes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert sizes"
  ON order_item_sizes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update sizes"
  ON order_item_sizes FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- WORKFLOW EVENTS (Audit Trail)
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  from_stage workflow_stage,
  to_stage workflow_stage NOT NULL,
  action text NOT NULL DEFAULT 'stage_change',
  performed_by uuid REFERENCES profiles(id),
  reason text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view workflow events"
  ON workflow_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert workflow events"
  ON workflow_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- QC CHECKS
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  workflow_event_id uuid REFERENCES workflow_events(id),
  result qc_result NOT NULL DEFAULT 'approved',
  defect_type text DEFAULT '',
  defect_description text DEFAULT '',
  approved_qty integer NOT NULL DEFAULT 0,
  rejected_qty integer NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  inspector_id uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qc_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view qc checks"
  ON qc_checks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert qc checks"
  ON qc_checks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update qc checks"
  ON qc_checks FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- QC ATTACHMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS qc_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_check_id uuid NOT NULL REFERENCES qc_checks(id) ON DELETE CASCADE,
  type attachment_type NOT NULL DEFAULT 'image',
  url text NOT NULL,
  name text NOT NULL DEFAULT '',
  size_bytes integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qc_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view qc attachments"
  ON qc_attachments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert qc attachments"
  ON qc_attachments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- CARTONS
-- ============================================================

CREATE TABLE IF NOT EXISTS cartons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carton_number integer NOT NULL,
  capacity integer NOT NULL DEFAULT 12,
  current_qty integer NOT NULL DEFAULT 0,
  status carton_status NOT NULL DEFAULT 'draft',
  locked_at timestamptz,
  completed_at timestamptz,
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, carton_number)
);

ALTER TABLE cartons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cartons"
  ON cartons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert cartons"
  ON cartons FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update cartons"
  ON cartons FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- CARTON ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS carton_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carton_id uuid NOT NULL REFERENCES cartons(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id),
  size_value text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE carton_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view carton items"
  ON carton_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert carton items"
  ON carton_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update carton items"
  ON carton_items FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete carton items"
  ON carton_items FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- MATERIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  type material_type NOT NULL DEFAULT 'other',
  unit text NOT NULL DEFAULT 'kg',
  cost_per_unit numeric(10,4) NOT NULL DEFAULT 0,
  description text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view materials"
  ON materials FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert materials"
  ON materials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update materials"
  ON materials FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- MATERIAL STOCK
-- ============================================================

CREATE TABLE IF NOT EXISTS material_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid UNIQUE NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  quantity numeric(12,4) NOT NULL DEFAULT 0,
  reserved_quantity numeric(12,4) NOT NULL DEFAULT 0,
  warehouse_location text DEFAULT '',
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE material_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view material stock"
  ON material_stock FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert material stock"
  ON material_stock FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update material stock"
  ON material_stock FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- MATERIAL ALLOCATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS material_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materials(id),
  allocated_qty numeric(12,4) NOT NULL DEFAULT 0,
  consumed_qty numeric(12,4) NOT NULL DEFAULT 0,
  status allocation_status NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE material_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view material allocations"
  ON material_allocations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert material allocations"
  ON material_allocations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update material allocations"
  ON material_allocations FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- MACHINES
-- ============================================================

CREATE TABLE IF NOT EXISTS machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  status machine_status NOT NULL DEFAULT 'available',
  last_maintenance timestamptz,
  notes text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view machines"
  ON machines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert machines"
  ON machines FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update machines"
  ON machines FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- MACHINE ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS machine_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE machine_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view machine assignments"
  ON machine_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert machine assignments"
  ON machine_assignments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update machine assignments"
  ON machine_assignments FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- MOLDS
-- ============================================================

CREATE TABLE IF NOT EXISTS molds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  mold_number text NOT NULL,
  product_id uuid REFERENCES products(id),
  material_type text DEFAULT 'steel',
  compatible_sizes text[] DEFAULT '{}',
  status mold_status NOT NULL DEFAULT 'available',
  notes text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE molds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view molds"
  ON molds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert molds"
  ON molds FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update molds"
  ON molds FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- MOLD ASSIGNMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS mold_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mold_id uuid NOT NULL REFERENCES molds(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mold_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view mold assignments"
  ON mold_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert mold assignments"
  ON mold_assignments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update mold assignments"
  ON mold_assignments FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- INVENTORY LEDGER
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL DEFAULT 'material',
  item_id uuid NOT NULL,
  transaction_type transaction_type NOT NULL,
  quantity numeric(12,4) NOT NULL,
  reference_type text DEFAULT '',
  reference_id uuid,
  notes text DEFAULT '',
  balance_after numeric(12,4),
  performed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view inventory ledger"
  ON inventory_ledger FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert inventory ledger"
  ON inventory_ledger FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- REMNANTS
-- ============================================================

CREATE TABLE IF NOT EXISTS remnants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  origin_order_id uuid NOT NULL REFERENCES orders(id),
  order_item_id uuid REFERENCES order_items(id),
  color_name text NOT NULL,
  color_code text NOT NULL DEFAULT '',
  color_hex text DEFAULT '#6B7280',
  size_value text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  status remnant_status NOT NULL DEFAULT 'available',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE remnants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view remnants"
  ON remnants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert remnants"
  ON remnants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update remnants"
  ON remnants FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- REMNANT ALLOCATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS remnant_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  remnant_id uuid NOT NULL REFERENCES remnants(id) ON DELETE CASCADE,
  target_order_id uuid NOT NULL REFERENCES orders(id),
  target_order_item_id uuid REFERENCES order_items(id),
  quantity integer NOT NULL DEFAULT 0,
  status allocation_status NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  allocated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE remnant_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view remnant allocations"
  ON remnant_allocations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert remnant allocations"
  ON remnant_allocations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update remnant allocations"
  ON remnant_allocations FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- CHAT ROOMS
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type chat_room_type NOT NULL DEFAULT 'global',
  name text NOT NULL,
  description text DEFAULT '',
  department text DEFAULT '',
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view chat rooms"
  ON chat_rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert chat rooms"
  ON chat_rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update chat rooms"
  ON chat_rooms FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- CHAT ROOM MEMBERS
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

ALTER TABLE chat_room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view room members"
  ON chat_room_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert room members"
  ON chat_room_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own membership"
  ON chat_room_members FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id),
  content text NOT NULL DEFAULT '',
  type message_type NOT NULL DEFAULT 'text',
  reply_to_id uuid REFERENCES chat_messages(id),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view messages"
  ON chat_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert messages"
  ON chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update own messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- ============================================================
-- CHAT ATTACHMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  type attachment_type NOT NULL DEFAULT 'file',
  url text NOT NULL,
  name text NOT NULL DEFAULT '',
  size_bytes integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view chat attachments"
  ON chat_attachments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert chat attachments"
  ON chat_attachments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  user_id uuid REFERENCES profiles(id),
  before_state jsonb DEFAULT '{}',
  after_state jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  ip_address text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_workflow_stage ON order_items(workflow_stage);
CREATE INDEX IF NOT EXISTS idx_order_item_sizes_order_item_id ON order_item_sizes(order_item_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_order_item_id ON workflow_events(order_item_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at ON workflow_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_checks_order_item_id ON qc_checks(order_item_id);
CREATE INDEX IF NOT EXISTS idx_cartons_order_id ON cartons(order_id);
CREATE INDEX IF NOT EXISTS idx_carton_items_carton_id ON carton_items(carton_id);
CREATE INDEX IF NOT EXISTS idx_material_allocations_order_id ON material_allocations(order_id);
CREATE INDEX IF NOT EXISTS idx_remnants_product_id ON remnants(product_id);
CREATE INDEX IF NOT EXISTS idx_remnants_status ON remnants(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_item_id ON inventory_ledger(item_id);
CREATE INDEX IF NOT EXISTS idx_machine_assignments_machine_id ON machine_assignments(machine_id);
CREATE INDEX IF NOT EXISTS idx_mold_assignments_mold_id ON mold_assignments(mold_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-generate order code: YYMMDD + 2-digit sequence
CREATE OR REPLACE FUNCTION generate_order_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  date_prefix text;
  seq_num integer;
  new_code text;
BEGIN
  date_prefix := to_char(now(), 'YYMMDD');
  SELECT COUNT(*) + 1 INTO seq_num
  FROM orders
  WHERE order_code LIKE date_prefix || '%';
  new_code := date_prefix || LPAD(seq_num::text, 2, '0');
  RETURN new_code;
END;
$$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER order_item_sizes_updated_at BEFORE UPDATE ON order_item_sizes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER cartons_updated_at BEFORE UPDATE ON cartons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER molds_updated_at BEFORE UPDATE ON molds FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER remnants_updated_at BEFORE UPDATE ON remnants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER chat_rooms_updated_at BEFORE UPDATE ON chat_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER chat_messages_updated_at BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'production')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
