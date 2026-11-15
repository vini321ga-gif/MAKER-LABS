export type UserRole = 'admin' | 'operator' | 'finance'; // finance se presenta como Supervisor

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export type MachineCategory = '3d_printing' | 'laser' | 'uv_dtf';
export type MachineStatus = 'operativo' | 'en_produccion' | 'calentando' | 'cola_espera' | 'mantenimiento';

export interface MachineTelemetry3D {
  layer_height_mm?: number;
  bed_temp_c?: number;
  nozzle_temp_c?: number;
  filament?: string;
  remaining_min?: number;
}

export interface MachineTelemetryLaser {
  tube_life_pct?: number;
  power_pct?: number;
  speed_mm_s?: number;
  air_assist?: boolean;
  exhaust_kpa?: number;
}

export interface MachineTelemetryDtf {
  ink_c?: number;
  ink_m?: number;
  ink_y?: number;
  ink_k?: number;
  ink_w?: number;
  ink_varnish?: number;
  lamp_temp_c?: number;
}

export type MachineTelemetry = MachineTelemetry3D & MachineTelemetryLaser & MachineTelemetryDtf;

export interface Machine {
  id: string;
  name: string;
  category: MachineCategory;
  model: string;
  status: MachineStatus;
  progress_pct: number;
  current_job_code: string | null;
  telemetry_json: string;
  telemetry: MachineTelemetry;
  hours_total: number;
  updated_at: string;
}

export type DocType = 'factura_sat' | 'comprobante_taller';
export type DocTypeFilter = 'all' | DocType;
export type PaymentStatus = 'cobrado' | 'pendiente' | 'anulado';
export type ProductionStatus = 'cola_espera' | 'en_produccion' | 'calentando' | 'completado' | 'mantenimiento';

export interface WorkOrder {
  id: number;
  order_code: string;
  client_name: string;
  client_nit: string;
  process_type: MachineCategory;
  machine_id: string | null;
  material: string;
  description: string;
  quantity: number;
  estimated_minutes: number;
  unit_price_gtq: number;
  subtotal_gtq: number;
  iva_gtq: number;
  total_gtq: number;
  doc_type: DocType;
  sat_series: string | null;
  sat_number: string | null;
  payment_status: PaymentStatus;
  production_status: ProductionStatus;
  due_date: string;
  created_by: number | null;
  created_by_name?: string | null;
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_by_name?: string | null;
  deleted_reason?: string | null;
  can_register_payment?: boolean;
  created_at: string;
}

export type InventoryCategory =
  | 'filamento_3d'
  | 'resina_3d'
  | 'lamina_laser'
  | 'tinta_uv_dtf'
  | 'film_dtf';

export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  stock_qty: number;
  min_stock_qty: number;
  unit_cost_gtq: number;
  supplier: string;
  updated_at: string;
}

export interface FinancialEntry {
  id: number;
  entry_code: string;
  entry_type: 'ingreso' | 'egreso';
  doc_type: DocType;
  category: string;
  description: string;
  counterparty: string;
  nit: string;
  order_code: string | null;
  subtotal_gtq: number;
  iva_gtq: number;
  total_gtq: number;
  status: 'cobrado' | 'pendiente' | 'egreso' | 'anulado';
  entry_date: string;
  created_by: number | null;
  created_by_name?: string | null;
  created_at: string;
}

export interface ActivityEvent {
  id: number;
  actor_id: number | null;
  actor_name: string;
  actor_role: UserRole | string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  details: string;
  created_at: string;
}

export interface FinancialAttachment {
  id: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface DashboardPayload {
  kpis: {
    collectedGtq: number;
    pendingGtq: number;
    expensesGtq: number;
    netProfitGtq: number;
    ivaBalanceGtq: number;
    activeOrdersCount: number;
    completedOrdersCount: number;
  };
  machines: Machine[];
  recentOrders: WorkOrder[];
  lowStockItems: InventoryItem[];
}

export interface FinancesPayload {
  summary: {
    collectedGtq: number;
    pendingGtq: number;
    expensesGtq: number;
    netMarginGtq: number;
    ivaDebitGtq: number;
    ivaCreditGtq: number;
    ivaNetPayableGtq: number;
  } | null;
  entries: FinancialEntry[];
}

export interface DbStatusPayload {
  status: {
    mode: 'cloudflare_d1' | 'local_sqlite';
    driverLabel: string;
    databaseName: string;
    d1Configured: boolean;
    connected: boolean;
    lastError: string | null;
  };
  counts: Record<string, number>;
  schemaSql: string;
}

export type NavSection =
  | 'dashboard'
  | 'printing_3d'
  | 'laser'
  | 'uv_dtf'
  | 'orders'
  | 'finances'
  | 'admin'
  | 'activity';
