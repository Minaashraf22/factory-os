-- Add 'archived' to order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'archived';

-- Add soft-delete and cancellation columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Daily sequence table for YYMMDD+seq order codes
CREATE TABLE IF NOT EXISTS order_code_sequences (
  date_key TEXT PRIMARY KEY,  -- YYMMDD
  last_seq INTEGER DEFAULT 0
);

ALTER TABLE order_code_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seq_select" ON order_code_sequences FOR SELECT TO authenticated USING (true);
CREATE POLICY "seq_insert" ON order_code_sequences FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "seq_update" ON order_code_sequences FOR UPDATE TO authenticated USING (true);

-- Replace the generate_order_code RPC with one that uses the daily sequence
CREATE OR REPLACE FUNCTION generate_order_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  date_key TEXT;
  new_seq INTEGER;
  result TEXT;
BEGIN
  date_key := TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYMMDD');

  INSERT INTO order_code_sequences (date_key, last_seq)
  VALUES (date_key, 1)
  ON CONFLICT (date_key) DO UPDATE
    SET last_seq = order_code_sequences.last_seq + 1
  RETURNING last_seq INTO new_seq;

  result := date_key || LPAD(new_seq::TEXT, 2, '0');
  RETURN result;
END;
$$;

-- Index for soft-delete queries
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON orders(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
