/*
  # Seed Data

  Inserts initial reference data:
  - Default chat rooms (Global, departments)
  - Sample materials catalog
  - Sample machines
  - Sample products

  This seed data represents a minimal but functional starting state.
*/

-- ============================================================
-- CHAT ROOMS (Default)
-- ============================================================

INSERT INTO chat_rooms (id, type, name, description, department) VALUES
  ('00000000-0000-0000-0000-000000000001', 'global', 'Factory Floor', 'All departments - general announcements and updates', 'all'),
  ('00000000-0000-0000-0000-000000000002', 'department', 'Production', 'Production department channel', 'production'),
  ('00000000-0000-0000-0000-000000000003', 'department', 'Quality Control', 'QC team channel', 'qc'),
  ('00000000-0000-0000-0000-000000000004', 'department', 'Packing & Warehouse', 'Packing and warehouse operations', 'packing'),
  ('00000000-0000-0000-0000-000000000005', 'department', 'Planning', 'Planning and scheduling channel', 'planning'),
  ('00000000-0000-0000-0000-000000000006', 'department', 'Shipping', 'Shipping and logistics', 'shipping')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MATERIALS
-- ============================================================

INSERT INTO materials (code, name, type, unit, cost_per_unit, description) VALUES
  ('EVA-001', 'EVA Compound Grade A', 'eva', 'kg', 2.50, 'High-density EVA for outsoles'),
  ('EVA-002', 'EVA Foam Sheet 5mm', 'eva', 'sheet', 1.20, 'EVA foam sheets for midsoles'),
  ('PVC-001', 'PVC Compound Clear', 'pvc', 'kg', 1.80, 'Transparent PVC for uppers'),
  ('PVC-002', 'PVC Compound Black', 'pvc', 'kg', 1.75, 'Black PVC compound'),
  ('RUB-001', 'Synthetic Rubber SBR', 'rubber', 'kg', 3.20, 'SBR rubber for outsoles'),
  ('RUB-002', 'Natural Rubber RSS3', 'natural_rubber', 'kg', 4.50, 'Grade 3 natural rubber'),
  ('FAB-001', 'Mesh Fabric Upper Grade A', 'fabric', 'm2', 5.00, 'Breathable mesh for uppers'),
  ('FAB-002', 'Lining Non-Woven 120g', 'lining', 'm2', 1.50, 'Non-woven lining material'),
  ('ADH-001', 'Contact Cement PU-Based', 'adhesive', 'kg', 8.00, 'Polyurethane contact cement'),
  ('ADH-002', 'Hot Melt Adhesive EVA', 'adhesive', 'kg', 6.50, 'EVA hot melt for assembly'),
  ('OUT-001', 'TPR Outsole Unit Size 38-42', 'outsole', 'pair', 1.20, 'Pre-molded TPR outsole'),
  ('INS-001', 'Memory Foam Insole', 'insole', 'pair', 0.80, 'Comfort memory foam insole')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- MATERIAL STOCK
-- ============================================================

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 500, 0, 'W-A1' FROM materials WHERE code = 'EVA-001'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 2000, 0, 'W-A2' FROM materials WHERE code = 'EVA-002'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 800, 0, 'W-B1' FROM materials WHERE code = 'PVC-001'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 600, 0, 'W-B2' FROM materials WHERE code = 'PVC-002'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 400, 0, 'W-C1' FROM materials WHERE code = 'RUB-001'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 300, 0, 'W-C2' FROM materials WHERE code = 'RUB-002'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 1500, 0, 'W-D1' FROM materials WHERE code = 'FAB-001'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 3000, 0, 'W-D2' FROM materials WHERE code = 'FAB-002'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 200, 0, 'W-E1' FROM materials WHERE code = 'ADH-001'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 150, 0, 'W-E2' FROM materials WHERE code = 'ADH-002'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 5000, 0, 'W-F1' FROM materials WHERE code = 'OUT-001'
ON CONFLICT (material_id) DO NOTHING;

INSERT INTO material_stock (material_id, quantity, reserved_quantity, warehouse_location)
SELECT id, 4000, 0, 'W-F2' FROM materials WHERE code = 'INS-001'
ON CONFLICT (material_id) DO NOTHING;

-- ============================================================
-- MACHINES
-- ============================================================

INSERT INTO machines (code, name, type, status, notes) VALUES
  ('INJ-001', 'Injection Molding Machine #1', 'injection', 'available', 'Primary outsole injection'),
  ('INJ-002', 'Injection Molding Machine #2', 'injection', 'available', 'Secondary outsole injection'),
  ('INJ-003', 'Injection Molding Machine #3', 'injection', 'maintenance', 'Scheduled maintenance Q1'),
  ('STI-001', 'Stitching Machine #1', 'stitching', 'available', 'Upper assembly stitching'),
  ('STI-002', 'Stitching Machine #2', 'stitching', 'available', 'Heavy-duty stitching'),
  ('STI-003', 'Stitching Machine #3', 'stitching', 'in_use', 'Currently assigned'),
  ('CEM-001', 'Cementing Line #1', 'cementing', 'available', 'Automated cement line'),
  ('CEM-002', 'Cementing Line #2', 'cementing', 'available', 'Manual assist cement line'),
  ('FIN-001', 'Finishing Station #1', 'finishing', 'available', 'Heat setting and trimming'),
  ('FIN-002', 'Finishing Station #2', 'finishing', 'available', 'Edge finishing'),
  ('LAST-001', 'Lasting Machine #1', 'lasting', 'available', 'Standard lasting'),
  ('LAST-002', 'Lasting Machine #2', 'lasting', 'in_use', 'Currently producing'),
  ('SOLE-001', 'Sole Press #1', 'sole_press', 'available', 'Hydraulic sole press 200T'),
  ('SOLE-002', 'Sole Press #2', 'sole_press', 'available', 'Hydraulic sole press 150T'),
  ('PACK-001', 'Packing Station #1', 'packing', 'available', 'Manual packing with scale'),
  ('PACK-002', 'Packing Station #2', 'packing', 'available', 'Automated box sealing')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- PRODUCTS
-- ============================================================

INSERT INTO products (code, name, category, brand_type, external_brand_name, description) VALUES
  ('CAR-DEVO-001', 'Devo Classic', 'casual', 'carlos', '', 'Carlos classic casual shoe'),
  ('CAR-SPORT-001', 'Sportivo Pro', 'sport', 'carlos', '', 'Carlos sports performance shoe'),
  ('CAR-FORM-001', 'Formal Elite', 'formal', 'carlos', '', 'Carlos formal dress shoe'),
  ('ARR-RUNNER-001', 'Arrow Runner X', 'sport', 'arrow', '', 'Arrow high-performance runner'),
  ('ARR-CASUAL-001', 'Arrow Urban', 'casual', 'arrow', '', 'Arrow urban casual'),
  ('EXT-NIKE-001', 'Air Max Clone', 'sport', 'external', 'Nike', 'External production - Nike style'),
  ('EXT-PVTLBL-001', 'Private Label Sport', 'sport', 'external', 'SportZone', 'Private label for SportZone'),
  ('CAR-KIDS-001', 'Devo Kids', 'kids', 'carlos', '', 'Carlos kids casual')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- MOLDS
-- ============================================================

INSERT INTO molds (code, mold_number, material_type, compatible_sizes, status, notes)
SELECT
  'MLD-' || p.code || '-38-42',
  'M-' || ROW_NUMBER() OVER (ORDER BY p.created_at)::text,
  'steel',
  ARRAY['38', '39', '40', '41', '42'],
  'available',
  'Standard size run mold for ' || p.name
FROM products p
ON CONFLICT (code) DO NOTHING;

INSERT INTO molds (code, mold_number, material_type, compatible_sizes, status, notes)
SELECT
  'MLD-' || p.code || '-43-46',
  'M-' || (ROW_NUMBER() OVER (ORDER BY p.created_at) + 100)::text,
  'steel',
  ARRAY['43', '44', '45', '46'],
  'available',
  'Large size run mold for ' || p.name
FROM products p
ON CONFLICT (code) DO NOTHING;
