import type { BrandType, WorkflowStage } from '@/lib/types';

export const WORKFLOW_STAGES: WorkflowStage[] = [
  'production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping', 'remnants'
];

// Carlos and External brands: Production → Finishing → QC → Packing → Warehouse → Shipping
// Arrow brand: Production → QC → Finishing → Packing → Warehouse → Shipping
export const BRAND_WORKFLOWS: Record<BrandType, WorkflowStage[]> = {
  carlos: ['production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping'],
  external: ['production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping'],
  arrow: ['production', 'qc', 'finishing', 'packing_pool', 'warehouse', 'shipping'],
};

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  production: 'Production',
  finishing: 'Finishing',
  qc: 'Quality Control',
  packing_pool: 'Packing Pool',
  warehouse: 'Warehouse',
  shipping: 'Shipping',
  remnants: 'Remnants',
};

export const WORKFLOW_STAGE_COLORS: Record<WorkflowStage, string> = {
  production: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  finishing: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  qc: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  packing_pool: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warehouse: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  shipping: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  remnants: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export const ORDER_STATUS_LABELS = {
  draft: 'Draft',
  planning: 'Planning',
  in_production: 'In Production',
  completed: 'Completed',
  cancelled: 'Cancelled',
  on_hold: 'On Hold',
  archived: 'Archived',
};

export const ORDER_STATUS_COLORS = {
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  planning: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  in_production: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  on_hold: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  archived: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

export const BRAND_TYPE_LABELS: Record<BrandType, string> = {
  carlos: 'Carlos',
  arrow: 'Arrow',
  external: 'External Brand',
};

export const BRAND_TYPE_COLORS: Record<BrandType, string> = {
  carlos: 'bg-blue-500/20 text-blue-400',
  arrow: 'bg-emerald-500/20 text-emerald-400',
  external: 'bg-orange-500/20 text-orange-400',
};

export const MACHINE_STATUS_COLORS = {
  available: 'bg-emerald-500/20 text-emerald-400',
  in_use: 'bg-amber-500/20 text-amber-400',
  maintenance: 'bg-orange-500/20 text-orange-400',
  offline: 'bg-red-500/20 text-red-400',
};

export const CARTON_STATUS_LABELS = {
  draft: 'Draft',
  building: 'Building',
  locked: 'Locked',
  completed: 'Completed',
  warehouse: 'In Warehouse',
  shipped: 'Shipped',
  voided: 'Voided',
};

export const CARTON_STATUS_COLORS = {
  draft: 'bg-slate-500/20 text-slate-400',
  building: 'bg-blue-500/20 text-blue-400',
  locked: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  warehouse: 'bg-teal-500/20 text-teal-400',
  shipped: 'bg-sky-500/20 text-sky-400',
  voided: 'bg-red-500/20 text-red-400',
};

export const ROLE_LABELS = {
  admin: 'Administrator',
  planning: 'Planning',
  production: 'Production',
  qc: 'Quality Control',
  packing: 'Packing',
  warehouse: 'Warehouse',
  shipping: 'Shipping',
};

export const ROLE_PERMISSIONS: Record<string, WorkflowStage[]> = {
  admin: ['production', 'finishing', 'qc', 'packing_pool', 'warehouse', 'shipping', 'remnants'],
  planning: [],
  production: ['production'],
  qc: ['qc'],
  packing: ['packing_pool'],
  warehouse: ['warehouse'],
  shipping: ['shipping'],
};

export const STANDARD_SIZES = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'];

export const SIZE_GROUPS = [
  { key: 'babies', label: 'Babies (17-21)', sizes: ['17', '18', '19', '20', '21'] },
  { key: 'pharmacy', label: 'Pharmacy (22-25)', sizes: ['22', '23', '24', '25'] },
  { key: 'kids', label: 'Kids (26-30)', sizes: ['26', '27', '28', '29', '30'] },
  { key: 'youth', label: 'Youth (31-35)', sizes: ['31', '32', '33', '34', '35'] },
  { key: 'women_men', label: 'Women/Men (36-41)', sizes: ['36', '37', '38', '39', '40', '41'] },
  { key: 'men', label: 'Men (41-47)', sizes: ['41', '42', '43', '44', '45', '46', '47'] },
];

export const MATERIAL_TYPE_LABELS = {
  eva: 'EVA',
  pvc: 'PVC',
  rubber: 'Rubber',
  natural_rubber: 'Natural Rubber',
  fabric: 'Fabric',
  adhesive: 'Adhesive',
  lining: 'Lining',
  outsole: 'Outsole',
  insole: 'Insole',
  other: 'Other',
};

export const DEFAULT_CARTON_CAPACITY = 12;
