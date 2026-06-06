/*
  # Production Batches & Workflow Quantity Tracking (safe)
*/

ALTER TABLE orders ALTER COLUMN product_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'product_model') THEN
    ALTER TABLE orders ADD COLUMN product_model text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'brand_type_override') THEN
    ALTER TABLE orders ADD COLUMN brand_type_override brand_type DEFAULT 'carlos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'external_brand_name') THEN
    ALTER TABLE orders ADD COLUMN external_brand_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workflow_events' AND column_name = 'qty_moved') THEN
    ALTER TABLE workflow_events ADD COLUMN qty_moved integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'language') THEN
    ALTER TABLE profiles ADD COLUMN language text NOT NULL DEFAULT 'ar';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  batch_number integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  notes text DEFAULT '',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id, batch_number)
);

ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_batches' AND policyname = 'Authenticated users can view batches') THEN
    CREATE POLICY "Authenticated users can view batches" ON production_batches FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_batches' AND policyname = 'Authenticated users can insert batches') THEN
    CREATE POLICY "Authenticated users can insert batches" ON production_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_batches' AND policyname = 'Authenticated users can update batches') THEN
    CREATE POLICY "Authenticated users can update batches" ON production_batches FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS production_batch_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  size_value text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(batch_id, size_value)
);

ALTER TABLE production_batch_sizes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_batch_sizes' AND policyname = 'Authenticated users can view batch sizes') THEN
    CREATE POLICY "Authenticated users can view batch sizes" ON production_batch_sizes FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'production_batch_sizes' AND policyname = 'Authenticated users can insert batch sizes') THEN
    CREATE POLICY "Authenticated users can insert batch sizes" ON production_batch_sizes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS qc_size_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qc_check_id uuid NOT NULL REFERENCES qc_checks(id) ON DELETE CASCADE,
  size_value text NOT NULL,
  approved_qty integer NOT NULL DEFAULT 0,
  rejected_qty integer NOT NULL DEFAULT 0,
  defect_type text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(qc_check_id, size_value)
);

ALTER TABLE qc_size_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qc_size_decisions' AND policyname = 'Authenticated users can view qc size decisions') THEN
    CREATE POLICY "Authenticated users can view qc size decisions" ON qc_size_decisions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'qc_size_decisions' AND policyname = 'Authenticated users can insert qc size decisions') THEN
    CREATE POLICY "Authenticated users can insert qc size decisions" ON qc_size_decisions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_production_batches_order_item_id ON production_batches(order_item_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'production_batches_updated_at') THEN
    CREATE TRIGGER production_batches_updated_at BEFORE UPDATE ON production_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
