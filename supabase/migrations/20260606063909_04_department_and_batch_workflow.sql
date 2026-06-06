-- Add department enum type
DO $$ BEGIN
  CREATE TYPE department_type AS ENUM (
    'planning', 'production', 'finishing', 'qc', 'packing', 'warehouse', 'shipping', 'admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add department column to profiles if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department department_type DEFAULT 'production';

-- Add qty_produced/approved/packed/shipped to workflow_events for gate tracking
ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS qty_produced INTEGER DEFAULT 0;
ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS qty_approved INTEGER DEFAULT 0;

-- production_batches: ensure status is checked correctly
ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS total_qty INTEGER DEFAULT 0;

-- Add batch_id to order_items so a single color can have multiple batches, 
-- but order_items themselves represent the full color — batches are children
-- (already correct in existing schema: production_batches.order_item_id FK)

-- Add shipped_qty to order_item_sizes
ALTER TABLE order_item_sizes ADD COLUMN IF NOT EXISTS shipped_qty INTEGER DEFAULT 0;

-- stage_transitions table for strict audit trail of all movements
CREATE TABLE IF NOT EXISTS stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT DEFAULT '',
  qty_moved INTEGER DEFAULT 0,
  is_rejection BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_transitions_order_item ON stage_transitions(order_item_id);
CREATE INDEX IF NOT EXISTS idx_stage_transitions_batch ON stage_transitions(batch_id);

ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transitions_select" ON stage_transitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "transitions_insert" ON stage_transitions FOR INSERT TO authenticated WITH CHECK (true);

-- Update department in seed profiles to match their roles
UPDATE profiles SET department = 'production'::department_type WHERE role = 'production' AND department IS NULL;
UPDATE profiles SET department = 'qc'::department_type WHERE role = 'qc' AND department IS NULL;
UPDATE profiles SET department = 'packing'::department_type WHERE role = 'packing' AND department IS NULL;
UPDATE profiles SET department = 'warehouse'::department_type WHERE role = 'warehouse' AND department IS NULL;
UPDATE profiles SET department = 'shipping'::department_type WHERE role = 'shipping' AND department IS NULL;
UPDATE profiles SET department = 'planning'::department_type WHERE role = 'planning' AND department IS NULL;
UPDATE profiles SET department = 'admin'::department_type WHERE role = 'admin' AND department IS NULL;
