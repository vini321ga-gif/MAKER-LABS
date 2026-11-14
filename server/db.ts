import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.ts';

export type SqlParam = string | number | null;

export interface DbStatus {
  mode: 'cloudflare_d1' | 'local_sqlite';
  driverLabel: string;
  databaseName: string;
  d1Configured: boolean;
  connected: boolean;
  lastError: string | null;
}

interface CloudflareD1Response<T> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: Array<{
    results?: T[];
    success: boolean;
    meta?: { changes?: number; last_row_id?: number };
  }>;
}

class WorkshopDatabase {
  private sqlite: DatabaseSync | null = null;
  private d1AccountId: string;
  private d1DatabaseId: string;
  private d1ApiToken: string;
  private lastError: string | null = null;

  constructor() {
    this.d1AccountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    this.d1DatabaseId = (process.env.CLOUDFLARE_D1_DATABASE_ID || '').trim();
    this.d1ApiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  }

  public isD1Configured(): boolean {
    return Boolean(this.d1AccountId && this.d1DatabaseId && this.d1ApiToken);
  }

  private getLocalSqlite(): DatabaseSync {
    if (!this.sqlite) {
      const dataDir = path.resolve(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dbPath = path.join(dataDir, 'workshop.db');
      this.sqlite = new DatabaseSync(dbPath);
      this.sqlite.exec('PRAGMA foreign_keys = ON;');
      this.sqlite.exec('PRAGMA journal_mode = WAL;');
    }
    return this.sqlite;
  }

  public async queryAll<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    if (this.isD1Configured()) {
      const rows = await this.executeD1<T>(sql, params);
      return rows.results;
    }
    const db = this.getLocalSqlite();
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public async queryOne<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T | null> {
    const rows = await this.queryAll<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  public async run(sql: string, params: SqlParam[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
    if (this.isD1Configured()) {
      const res = await this.executeD1(sql, params);
      return {
        changes: res.changes,
        lastInsertRowid: res.lastInsertRowid,
      };
    }
    const db = this.getLocalSqlite();
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes || 0),
      lastInsertRowid: Number(result.lastInsertRowid || 0),
    };
  }

  public async execScript(sqlScript: string): Promise<void> {
    if (this.isD1Configured()) {
      const statements = sqlScript
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));
      for (const stmt of statements) {
        await this.executeD1(stmt, []);
      }
      return;
    }
    const db = this.getLocalSqlite();
    db.exec(sqlScript);
  }

  private async executeD1<T = Record<string, unknown>>(
    sql: string,
    params: SqlParam[]
  ): Promise<{ results: T[]; changes: number; lastInsertRowid: number }> {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.d1AccountId}/d1/database/${this.d1DatabaseId}/query`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.d1ApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      const errText = await response.text();
      this.lastError = `Cloudflare D1 HTTP ${response.status}: ${errText}`;
      throw new Error(this.lastError);
    }

    const payload = (await response.json()) as CloudflareD1Response<T>;
    if (!payload.success) {
      const msg = payload.errors?.map((e) => e.message).join('; ') || 'D1 query failed';
      this.lastError = msg;
      throw new Error(msg);
    }

    this.lastError = null;
    const first = payload.result?.[0];
    return {
      results: first?.results || [],
      changes: Number(first?.meta?.changes || 0),
      lastInsertRowid: Number(first?.meta?.last_row_id || 0),
    };
  }

  public async getStatus(): Promise<DbStatus> {
    const d1Configured = this.isD1Configured();
    try {
      await this.queryOne('SELECT 1 AS ok');
      return {
        mode: d1Configured ? 'cloudflare_d1' : 'local_sqlite',
        driverLabel: d1Configured ? 'Cloudflare D1 (REST API)' : 'SQLite Local Compatible D1 (data/workshop.db)',
        databaseName: d1Configured ? this.d1DatabaseId : 'workshop.db',
        d1Configured,
        connected: true,
        lastError: this.lastError,
      };
    } catch (err) {
      return {
        mode: d1Configured ? 'cloudflare_d1' : 'local_sqlite',
        driverLabel: d1Configured ? 'Cloudflare D1 (REST API)' : 'SQLite Local Compatible D1',
        databaseName: d1Configured ? this.d1DatabaseId : 'workshop.db',
        d1Configured,
        connected: false,
        lastError: err instanceof Error ? err.message : 'Error de conexión',
      };
    }
  }

  public async initializeAndSeed(): Promise<void> {
    const schemaPath = path.resolve(process.cwd(), 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await this.execScript(schemaSql);

    const userCountRow = await this.queryOne<{ total: number }>('SELECT COUNT(*) AS total FROM users');
    if (userCountRow && Number(userCountRow.total) > 0) {
      return;
    }

    // Seed initial users
    await this.run(
      'INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)',
      ['admin@fablab.gt', 'Ing. Alejandro Méndez', 'admin', hashPassword('Admin2026!')]
    );
    await this.run(
      'INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)',
      ['operador@fablab.gt', 'Carlos Rodas', 'operator', hashPassword('Operador2026!')]
    );
    await this.run(
      'INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)',
      ['finanzas@fablab.gt', 'Lic. Sofía Castillo', 'finance', hashPassword('Finanzas2026!')]
    );

    // Seed machine fleet
    const machines = [
      {
        id: 'PRN-3D-01',
        name: 'Bambu Lab X1E #01',
        category: '3d_printing',
        model: 'CoreXY Industrial · 300°C',
        status: 'en_produccion',
        progress_pct: 74,
        current_job_code: 'OP-2026-0142',
        telemetry_json: JSON.stringify({
          layer_height_mm: 0.16,
          bed_temp_c: 65,
          nozzle_temp_c: 220,
          filament: 'PETG-CF Negro',
          remaining_min: 48,
        }),
        hours_total: 1248.5,
      },
      {
        id: 'PRN-3D-02',
        name: 'Prusa XL 5-Tool #02',
        category: '3d_printing',
        model: 'Multi-Material · 360mm³',
        status: 'calentando',
        progress_pct: 12,
        current_job_code: 'OP-2026-0145',
        telemetry_json: JSON.stringify({
          layer_height_mm: 0.2,
          bed_temp_c: 82,
          nozzle_temp_c: 245,
          filament: 'ASA Técnico Blanco',
          remaining_min: 195,
        }),
        hours_total: 892.0,
      },
      {
        id: 'PRN-3D-03',
        name: 'Formlabs Form 4 #03',
        category: '3d_printing',
        model: 'SLA Resina Ingeniería',
        status: 'cola_espera',
        progress_pct: 0,
        current_job_code: null,
        telemetry_json: JSON.stringify({
          layer_height_mm: 0.05,
          bed_temp_c: 35,
          nozzle_temp_c: 35,
          filament: 'Resina Tough 2000',
          remaining_min: 0,
        }),
        hours_total: 410.2,
      },
      {
        id: 'LSR-CO2-01',
        name: 'Trotec Speedy 400 #01',
        category: 'laser',
        model: 'CO2 120W · 1016x610mm',
        status: 'en_produccion',
        progress_pct: 61,
        current_job_code: 'OP-2026-0143',
        telemetry_json: JSON.stringify({
          tube_life_pct: 84,
          power_pct: 78,
          speed_mm_s: 32,
          air_assist: true,
          exhaust_kpa: 2.4,
        }),
        hours_total: 1620.0,
      },
      {
        id: 'LSR-FBR-02',
        name: 'Raycus Fibra Galvo #02',
        category: 'laser',
        model: 'Fibra 50W · Marcado Metal',
        status: 'operativo',
        progress_pct: 100,
        current_job_code: null,
        telemetry_json: JSON.stringify({
          tube_life_pct: 96,
          power_pct: 45,
          speed_mm_s: 800,
          air_assist: false,
          exhaust_kpa: 1.9,
        }),
        hours_total: 530.8,
      },
      {
        id: 'UV-DTF-01',
        name: 'Mimaki UJF-6042 MkII #01',
        category: 'uv_dtf',
        model: 'UV DTF CMYK+W+Barniz',
        status: 'en_produccion',
        progress_pct: 88,
        current_job_code: 'OP-2026-0144',
        telemetry_json: JSON.stringify({
          ink_c: 78,
          ink_m: 64,
          ink_y: 82,
          ink_k: 55,
          ink_w: 38,
          ink_varnish: 71,
          lamp_temp_c: 41,
        }),
        hours_total: 984.4,
      },
    ];

    for (const m of machines) {
      await this.run(
        `INSERT INTO machines (id, name, category, model, status, progress_pct, current_job_code, telemetry_json, hours_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [m.id, m.name, m.category, m.model, m.status, m.progress_pct, m.current_job_code, m.telemetry_json, m.hours_total]
      );
    }

    // Seed inventory
    const inventory = [
      { sku: 'FIL-PETG-CF-1K', name: 'Filamento PETG Carbon Fiber Negro 1.75mm', category: 'filamento_3d', unit: 'kg', stock_qty: 14.5, min_stock_qty: 5.0, unit_cost_gtq: 285.0, supplier: '3DTech Guatemala' },
      { sku: 'FIL-ASA-WHT-1K', name: 'Filamento ASA Técnico Blanco 1.75mm', category: 'filamento_3d', unit: 'kg', stock_qty: 6.2, min_stock_qty: 4.0, unit_cost_gtq: 245.0, supplier: '3DTech Guatemala' },
      { sku: 'RES-TOUGH-1L', name: 'Resina Ingeniería Tough 2000 Gris', category: 'resina_3d', unit: 'L', stock_qty: 2.5, min_stock_qty: 3.0, unit_cost_gtq: 1120.0, supplier: 'FormLabs Latam' },
      { sku: 'LAS-ACR-3MM', name: 'Plancha Acrílico Negro Mate 3mm (122x244)', category: 'lamina_laser', unit: 'plancha', stock_qty: 18, min_stock_qty: 6, unit_cost_gtq: 390.0, supplier: 'Plásticos Industriales S.A.' },
      { sku: 'LAS-MDF-6MM', name: 'Tablero MDF Trupan Hidrófugo 6mm', category: 'lamina_laser', unit: 'plancha', stock_qty: 24, min_stock_qty: 8, unit_cost_gtq: 145.0, supplier: 'Maderas del Sur' },
      { sku: 'DTF-INK-W-1L', name: 'Tinta UV DTF Blanca Alta Opacidad 1000ml', category: 'tinta_uv_dtf', unit: 'ml', stock_qty: 380, min_stock_qty: 500, unit_cost_gtq: 0.72, supplier: 'SignSupply GT' },
      { sku: 'DTF-INK-CMYK-1L', name: 'Set Tintas UV DTF CMYK + Barniz 1000ml', category: 'tinta_uv_dtf', unit: 'ml', stock_qty: 2800, min_stock_qty: 1000, unit_cost_gtq: 0.65, supplier: 'SignSupply GT' },
      { sku: 'DTF-FILM-AB-60', name: 'Rollo Film UV DTF A+B 60cm x 100m', category: 'film_dtf', unit: 'm', stock_qty: 64, min_stock_qty: 20, unit_cost_gtq: 42.5, supplier: 'SignSupply GT' },
    ];

    for (const item of inventory) {
      await this.run(
        `INSERT INTO inventory_items (sku, name, category, unit, stock_qty, min_stock_qty, unit_cost_gtq, supplier)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.sku, item.name, item.category, item.unit, item.stock_qty, item.min_stock_qty, item.unit_cost_gtq, item.supplier]
      );
    }

    // Seed work orders + matching financial entries
    const orders = [
      {
        order_code: 'OP-2026-0139',
        client_name: 'AgroIndustria Los Altos S.A.',
        client_nit: '4589210-3',
        process_type: 'laser',
        machine_id: 'LSR-FBR-02',
        material: 'Acero Inoxidable 304 (Marcado)',
        description: '80 placas serializadas con código QR industrial para maquinaria',
        quantity: 80,
        estimated_minutes: 90,
        unit_price_gtq: 45.0,
        subtotal_gtq: 3214.29,
        iva_gtq: 385.71,
        total_gtq: 3600.0,
        doc_type: 'factura_sat',
        sat_series: 'A1B2',
        sat_number: '00481920',
        payment_status: 'cobrado',
        production_status: 'completado',
        due_date: '2026-11-10',
        entry_date: '2026-11-10',
      },
      {
        order_code: 'OP-2026-0140',
        client_name: 'Café Antigua Export',
        client_nit: '8920144-7',
        process_type: 'uv_dtf',
        machine_id: 'UV-DTF-01',
        material: 'Film UV DTF AB + Barniz Relieve',
        description: '450 transfers UV DTF dorados y relieve para empaques metálicos',
        quantity: 450,
        estimated_minutes: 150,
        unit_price_gtq: 14.0,
        subtotal_gtq: 5625.0,
        iva_gtq: 675.0,
        total_gtq: 6300.0,
        doc_type: 'factura_sat',
        sat_series: 'A1B2',
        sat_number: '00481921',
        payment_status: 'cobrado',
        production_status: 'completado',
        due_date: '2026-11-11',
        entry_date: '2026-11-11',
      },
      {
        order_code: 'OP-2026-0141',
        client_name: 'Estudio Arquitectónico Kukul',
        client_nit: 'CF',
        process_type: '3d_printing',
        machine_id: 'PRN-3D-01',
        material: 'Filamento ASA Técnico Blanco',
        description: 'Maqueta topográfica modular escala 1:250 en 6 cuadrantes',
        quantity: 6,
        estimated_minutes: 640,
        unit_price_gtq: 425.0,
        subtotal_gtq: 2550.0,
        iva_gtq: 0.0,
        total_gtq: 2550.0,
        doc_type: 'comprobante_taller',
        sat_series: null,
        sat_number: null,
        payment_status: 'cobrado',
        production_status: 'completado',
        due_date: '2026-11-12',
        entry_date: '2026-11-12',
      },
      {
        order_code: 'OP-2026-0142',
        client_name: 'Robótica Centroamericana',
        client_nit: '1049281-K',
        process_type: '3d_printing',
        machine_id: 'PRN-3D-01',
        material: 'PETG Carbon Fiber Negro',
        description: '24 carcasas para sensores LIDAR con insertos roscados M3',
        quantity: 24,
        estimated_minutes: 420,
        unit_price_gtq: 185.0,
        subtotal_gtq: 3964.29,
        iva_gtq: 475.71,
        total_gtq: 4440.0,
        doc_type: 'factura_sat',
        sat_series: 'A1B2',
        sat_number: '00481922',
        payment_status: 'pendiente',
        production_status: 'en_produccion',
        due_date: '2026-11-15',
        entry_date: '2026-11-13',
      },
      {
        order_code: 'OP-2026-0143',
        client_name: 'Señalética Urbana GT',
        client_nit: '7741290-1',
        process_type: 'laser',
        machine_id: 'LSR-CO2-01',
        material: 'Acrílico Negro Mate 3mm',
        description: '35 directorios corporativos calados con biselado a 45°',
        quantity: 35,
        estimated_minutes: 180,
        unit_price_gtq: 160.0,
        subtotal_gtq: 5000.0,
        iva_gtq: 600.0,
        total_gtq: 5600.0,
        doc_type: 'factura_sat',
        sat_series: 'A1B2',
        sat_number: '00481923',
        payment_status: 'cobrado',
        production_status: 'en_produccion',
        due_date: '2026-11-14',
        entry_date: '2026-11-14',
      },
      {
        order_code: 'OP-2026-0144',
        client_name: 'Laboratorio Biomédico Ixchel',
        client_nit: '3329104-8',
        process_type: 'uv_dtf',
        machine_id: 'UV-DTF-01',
        material: 'Film UV DTF AB + Tinta Blanca',
        description: '300 etiquetas técnicas resistentes a solventes para frascos clínicos',
        quantity: 300,
        estimated_minutes: 110,
        unit_price_gtq: 9.5,
        subtotal_gtq: 2544.64,
        iva_gtq: 305.36,
        total_gtq: 2850.0,
        doc_type: 'factura_sat',
        sat_series: 'A1B2',
        sat_number: '00481924',
        payment_status: 'pendiente',
        production_status: 'en_produccion',
        due_date: '2026-11-15',
        entry_date: '2026-11-14',
      },
      {
        order_code: 'OP-2026-0145',
        client_name: 'Taller Prototipos Zona 4',
        client_nit: 'CF',
        process_type: '3d_printing',
        machine_id: 'PRN-3D-02',
        material: 'ASA Técnico Blanco',
        description: '12 ductos de ventilación automotriz alta temperatura',
        quantity: 12,
        estimated_minutes: 280,
        unit_price_gtq: 110.0,
        subtotal_gtq: 1320.0,
        iva_gtq: 0.0,
        total_gtq: 1320.0,
        doc_type: 'comprobante_taller',
        sat_series: null,
        sat_number: null,
        payment_status: 'pendiente',
        production_status: 'calentando',
        due_date: '2026-11-16',
        entry_date: '2026-11-14',
      },
      {
        order_code: 'OP-2026-0146',
        client_name: 'Distribuidora Quetzal S.A.',
        client_nit: '6129301-2',
        process_type: '3d_printing',
        machine_id: 'PRN-3D-03',
        material: 'Resina Tough 2000',
        description: '18 engranajes de precisión paso 0.8mm para dosificadora',
        quantity: 18,
        estimated_minutes: 210,
        unit_price_gtq: 95.0,
        subtotal_gtq: 1526.79,
        iva_gtq: 183.21,
        total_gtq: 1710.0,
        doc_type: 'factura_sat',
        sat_series: 'A1B2',
        sat_number: '00481925',
        payment_status: 'pendiente',
        production_status: 'cola_espera',
        due_date: '2026-11-17',
        entry_date: '2026-11-14',
      },
    ];

    for (const o of orders) {
      await this.run(
        `INSERT INTO work_orders (
          order_code, client_name, client_nit, process_type, machine_id, material,
          description, quantity, estimated_minutes, unit_price_gtq, subtotal_gtq,
          iva_gtq, total_gtq, doc_type, sat_series, sat_number, payment_status,
          production_status, due_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          o.order_code, o.client_name, o.client_nit, o.process_type, o.machine_id, o.material,
          o.description, o.quantity, o.estimated_minutes, o.unit_price_gtq, o.subtotal_gtq,
          o.iva_gtq, o.total_gtq, o.doc_type, o.sat_series, o.sat_number, o.payment_status,
          o.production_status, o.due_date,
        ]
      );

      await this.run(
        `INSERT INTO financial_entries (
          entry_code, entry_type, doc_type, category, description, counterparty,
          nit, order_code, subtotal_gtq, iva_gtq, total_gtq, status, entry_date, created_by
        ) VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          `FIN-${o.order_code}`,
          o.doc_type,
          o.process_type === '3d_printing' ? 'Impresión 3D' : o.process_type === 'laser' ? 'Corte Láser' : 'Impresión UV DTF',
          o.description,
          o.client_name,
          o.client_nit,
          o.order_code,
          o.subtotal_gtq,
          o.iva_gtq,
          o.total_gtq,
          o.payment_status === 'cobrado' ? 'cobrado' : 'pendiente',
          o.entry_date,
        ]
      );
    }

    // Seed operational expenses
    const expenses = [
      {
        entry_code: 'EGR-2026-0081',
        doc_type: 'factura_sat',
        category: 'Insumos y Filamentos',
        description: 'Reposición 10kg PETG-CF y 4kg ASA Técnico',
        counterparty: '3DTech Guatemala S.A.',
        nit: '5510293-4',
        subtotal_gtq: 3419.64,
        iva_gtq: 410.36,
        total_gtq: 3830.0,
        entry_date: '2026-11-08',
      },
      {
        entry_code: 'EGR-2026-0082',
        doc_type: 'factura_sat',
        category: 'Energía y Servicios',
        description: 'Consumo eléctrico trifásico nave de producción (Nov)',
        counterparty: 'EEGSA Guatemala',
        nit: '32644-5',
        subtotal_gtq: 1946.43,
        iva_gtq: 233.57,
        total_gtq: 2180.0,
        entry_date: '2026-11-10',
      },
      {
        entry_code: 'EGR-2026-0083',
        doc_type: 'comprobante_taller',
        category: 'Mantenimiento Preventivo',
        description: 'Calibración óptica y limpieza de espejos ZnSe Trotec 400',
        counterparty: 'Servicios Técnicos LaserGT',
        nit: 'CF',
        subtotal_gtq: 850.0,
        iva_gtq: 0.0,
        total_gtq: 850.0,
        entry_date: '2026-11-12',
      },
      {
        entry_code: 'EGR-2026-0084',
        doc_type: 'factura_sat',
        category: 'Tintas y Consumibles DTF',
        description: '2x Botella Tinta UV DTF Blanca + Rollos Film AB 60cm',
        counterparty: 'SignSupply GT',
        nit: '9021844-1',
        subtotal_gtq: 2366.07,
        iva_gtq: 283.93,
        total_gtq: 2650.0,
        entry_date: '2026-11-13',
      },
    ];

    for (const e of expenses) {
      await this.run(
        `INSERT INTO financial_entries (
          entry_code, entry_type, doc_type, category, description, counterparty,
          nit, order_code, subtotal_gtq, iva_gtq, total_gtq, status, entry_date, created_by
        ) VALUES (?, 'egreso', ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'egreso', ?, 1)`,
        [
          e.entry_code,
          e.doc_type,
          e.category,
          e.description,
          e.counterparty,
          e.nit,
          e.subtotal_gtq,
          e.iva_gtq,
          e.total_gtq,
          e.entry_date,
        ]
      );
    }
  }
}

export const db = new WorkshopDatabase();
