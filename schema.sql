-- PrecisionHub — Cloudflare D1 / SQLite Schema
-- Compatible with `wrangler d1 execute <DB_NAME> --file=./schema.sql`

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'operator', 'finance')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('3d_printing', 'laser', 'uv_dtf')),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('operativo', 'en_produccion', 'calentando', 'cola_espera', 'mantenimiento')),
  progress_pct INTEGER NOT NULL DEFAULT 0,
  current_job_code TEXT,
  telemetry_json TEXT NOT NULL,
  hours_total REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_nit TEXT NOT NULL DEFAULT 'CF',
  process_type TEXT NOT NULL CHECK(process_type IN ('3d_printing', 'laser', 'uv_dtf')),
  machine_id TEXT REFERENCES machines(id),
  material TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  estimated_minutes INTEGER NOT NULL DEFAULT 60,
  unit_price_gtq REAL NOT NULL,
  subtotal_gtq REAL NOT NULL,
  iva_gtq REAL NOT NULL,
  total_gtq REAL NOT NULL,
  doc_type TEXT NOT NULL CHECK(doc_type IN ('factura_sat', 'comprobante_taller')),
  sat_series TEXT,
  sat_number TEXT,
  payment_status TEXT NOT NULL CHECK(payment_status IN ('cobrado', 'pendiente', 'anulado')),
  production_status TEXT NOT NULL CHECK(production_status IN ('cola_espera', 'en_produccion', 'calentando', 'completado', 'mantenimiento')),
  due_date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('filamento_3d', 'resina_3d', 'lamina_laser', 'tinta_uv_dtf', 'film_dtf')),
  unit TEXT NOT NULL,
  stock_qty REAL NOT NULL,
  min_stock_qty REAL NOT NULL,
  unit_cost_gtq REAL NOT NULL,
  supplier TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS financial_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_code TEXT UNIQUE NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('ingreso', 'egreso')),
  doc_type TEXT NOT NULL CHECK(doc_type IN ('factura_sat', 'comprobante_taller')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  nit TEXT NOT NULL DEFAULT 'CF',
  order_code TEXT,
  subtotal_gtq REAL NOT NULL,
  iva_gtq REAL NOT NULL,
  total_gtq REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('cobrado', 'pendiente', 'egreso', 'anulado')),
  entry_date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_work_orders_process ON work_orders(process_type);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(production_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_financial_entries_date ON financial_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_financial_entries_doc ON financial_entries(doc_type, entry_type);
