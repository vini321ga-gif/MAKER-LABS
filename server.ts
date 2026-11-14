import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionIdFromRequest,
  hashPassword,
  requireRole,
  setSessionCookie,
  verifyPassword,
} from './server/auth.ts';
import type { AuthenticatedRequest, AuthUser, UserRole } from './server/auth.ts';
import { db } from './server/db.ts';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeGuatemalanTotals(
  grossTotal: number,
  docType: 'factura_sat' | 'comprobante_taller'
): { subtotal: number; iva: number; total: number } {
  const total = round2(Math.max(0, grossTotal));
  if (docType === 'factura_sat') {
    const subtotal = round2(total / 1.12);
    const iva = round2(total - subtotal);
    return { subtotal, iva, total };
  }
  return { subtotal: total, iva: 0, total };
}

async function attachAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionId = getSessionIdFromRequest(req);
    if (!sessionId) {
      next();
      return;
    }
    const row = await db.queryOne<{
      session_id: string;
      expires_at: string;
      id: number;
      email: string;
      name: string;
      role: UserRole;
      created_at: string;
    }>(
      `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.name, u.role, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
      [sessionId]
    );
    if (!row) {
      next();
      return;
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      next();
      return;
    }
    req.sessionId = row.session_id;
    req.user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      created_at: row.created_at,
    };
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Debe iniciar sesión para continuar' });
    return;
  }
  next();
}

async function bootstrap(): Promise<void> {
  await db.initializeAndSeed();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(attachAuth);

  // Health
  app.get('/api/health', async (_req: Request, res: Response) => {
    const status = await db.getStatus();
    res.json({ ok: status.connected, database: status });
  });

  // Auth routes
  app.get('/api/auth/me', (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    res.json({ user: req.user });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      if (!email || !password) {
        res.status(400).json({ error: 'Ingrese correo y contraseña' });
        return;
      }

      const userRow = await db.queryOne<AuthUser & { password_hash: string }>(
        'SELECT id, email, name, role, password_hash, created_at FROM users WHERE lower(email) = ?',
        [email]
      );
      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        res.status(401).json({ error: 'Credenciales inválidas' });
        return;
      }

      const { rawId, signedToken, expiresAt } = createSessionToken();
      await db.run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [
        rawId,
        userRow.id,
        expiresAt,
      ]);
      setSessionCookie(res, signedToken);

      const user: AuthUser = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        role: userRow.role,
        created_at: userRow.created_at,
      };
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error al iniciar sesión' });
    }
  });

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = String(req.body?.name || '').trim();
      const password = String(req.body?.password || '');
      if (!email || !name || password.length < 6) {
        res.status(400).json({ error: 'Nombre, correo válido y contraseña (mín. 6 caracteres) son obligatorios' });
        return;
      }

      const existing = await db.queryOne<{ id: number }>('SELECT id FROM users WHERE lower(email) = ?', [email]);
      if (existing) {
        res.status(409).json({ error: 'Ya existe una cuenta con ese correo electrónico' });
        return;
      }

      const passwordHash = hashPassword(password);
      const inserted = await db.run(
        'INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)',
        [email, name, 'operator', passwordHash]
      );
      const userId = inserted.lastInsertRowid;
      const userRow = await db.queryOne<AuthUser>(
        'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
        [userId]
      );

      if (!userRow) {
        res.status(500).json({ error: 'No se pudo recuperar el usuario creado' });
        return;
      }

      const { rawId, signedToken, expiresAt } = createSessionToken();
      await db.run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [
        rawId,
        userRow.id,
        expiresAt,
      ]);
      setSessionCookie(res, signedToken);
      res.status(201).json({ user: userRow });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error al registrar cuenta' });
    }
  });

  app.post('/api/auth/logout', async (req: AuthenticatedRequest, res: Response) => {
    if (req.sessionId) {
      await db.run('DELETE FROM sessions WHERE id = ?', [req.sessionId]);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // System DB & Cloudflare D1 Status
  app.get('/api/system/db-status', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await db.getStatus();
      const tables = ['users', 'machines', 'work_orders', 'inventory_items', 'financial_entries'] as const;
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const row = await db.queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
        counts[table] = Number(row?.total || 0);
      }
      const schemaPath = path.resolve(process.cwd(), 'schema.sql');
      const schemaSql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '';
      res.json({ status, counts, schemaSql });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error leyendo estado de BD' });
    }
  });

  // Users RBAC (Admin only)
  app.get('/api/users', requireAuth, requireRole('admin'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const users = await db.queryAll<AuthUser>(
        'SELECT id, email, name, role, created_at FROM users ORDER BY id ASC'
      );
      res.json({ users });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error al listar usuarios' });
    }
  });

  app.post('/api/users', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = String(req.body?.name || '').trim();
      const password = String(req.body?.password || '');
      const role = String(req.body?.role || 'operator') as UserRole;
      if (!email || !name || password.length < 6 || !['admin', 'operator', 'finance'].includes(role)) {
        res.status(400).json({ error: 'Datos de usuario inválidos' });
        return;
      }
      const existing = await db.queryOne<{ id: number }>('SELECT id FROM users WHERE lower(email) = ?', [email]);
      if (existing) {
        res.status(409).json({ error: 'El correo ya está registrado' });
        return;
      }
      const resInsert = await db.run(
        'INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)',
        [email, name, role, hashPassword(password)]
      );
      const user = await db.queryOne<AuthUser>(
        'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
        [resInsert.lastInsertRowid]
      );
      res.status(201).json({ user });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error al crear usuario' });
    }
  });

  app.patch('/api/users/:id/role', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const role = String(req.body?.role || '') as UserRole;
      if (!['admin', 'operator', 'finance'].includes(role)) {
        res.status(400).json({ error: 'Rol inválido' });
        return;
      }
      if (req.user?.id === id && role !== 'admin') {
        res.status(400).json({ error: 'No puede degradar su propio rol de administrador' });
        return;
      }
      await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
      const user = await db.queryOne<AuthUser>('SELECT id, email, name, role, created_at FROM users WHERE id = ?', [id]);
      res.json({ user });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error al actualizar rol' });
    }
  });

  app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (req.user?.id === id) {
        res.status(400).json({ error: 'No puede eliminar su propio usuario activo' });
        return;
      }
      await db.run('DELETE FROM users WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error al eliminar usuario' });
    }
  });

  // Dashboard aggregation
  app.get('/api/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const docTypeFilter = String(req.query.doc_type || 'all');
      const hasDocFilter = docTypeFilter === 'factura_sat' || docTypeFilter === 'comprobante_taller';

      const entries = hasDocFilter
        ? await db.queryAll<Record<string, unknown>>(
            'SELECT * FROM financial_entries WHERE doc_type = ? ORDER BY entry_date DESC, id DESC',
            [docTypeFilter]
          )
        : await db.queryAll<Record<string, unknown>>(
            'SELECT * FROM financial_entries ORDER BY entry_date DESC, id DESC'
          );

      let collectedGtq = 0;
      let pendingGtq = 0;
      let expensesGtq = 0;
      let ivaDebitGtq = 0;
      let ivaCreditGtq = 0;

      for (const e of entries) {
        const total = Number(e.total_gtq || 0);
        const iva = Number(e.iva_gtq || 0);
        if (e.entry_type === 'ingreso' && e.status === 'cobrado') {
          collectedGtq += total;
          ivaDebitGtq += iva;
        } else if (e.entry_type === 'ingreso' && e.status === 'pendiente') {
          pendingGtq += total;
          ivaDebitGtq += iva;
        } else if (e.entry_type === 'egreso' && e.status !== 'anulado') {
          expensesGtq += total;
          ivaCreditGtq += iva;
        }
      }

      const orders = hasDocFilter
        ? await db.queryAll<Record<string, unknown>>(
            'SELECT * FROM work_orders WHERE doc_type = ? ORDER BY id DESC',
            [docTypeFilter]
          )
        : await db.queryAll<Record<string, unknown>>('SELECT * FROM work_orders ORDER BY id DESC');

      const machines = await db.queryAll<Record<string, unknown>>(
        'SELECT * FROM machines ORDER BY category ASC, id ASC'
      );
      const lowStockItems = await db.queryAll<Record<string, unknown>>(
        'SELECT * FROM inventory_items WHERE stock_qty <= min_stock_qty ORDER BY stock_qty ASC'
      );

      res.json({
        kpis: {
          collectedGtq: round2(collectedGtq),
          pendingGtq: round2(pendingGtq),
          expensesGtq: round2(expensesGtq),
          netProfitGtq: round2(collectedGtq - expensesGtq),
          ivaBalanceGtq: round2(Math.max(0, ivaDebitGtq - ivaCreditGtq)),
          activeOrdersCount: orders.filter((o) => o.production_status !== 'completado').length,
          completedOrdersCount: orders.filter((o) => o.production_status === 'completado').length,
        },
        machines: machines.map((m) => ({
          ...m,
          telemetry: JSON.parse(String(m.telemetry_json || '{}')),
        })),
        recentOrders: orders.slice(0, 8),
        lowStockItems,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error cargando resumen' });
    }
  });

  // Machines telemetry
  app.get('/api/machines', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const category = String(req.query.category || '');
      const rows = category
        ? await db.queryAll<Record<string, unknown>>(
            'SELECT * FROM machines WHERE category = ? ORDER BY id ASC',
            [category]
          )
        : await db.queryAll<Record<string, unknown>>('SELECT * FROM machines ORDER BY category ASC, id ASC');

      res.json({
        machines: rows.map((m) => ({
          ...m,
          telemetry: JSON.parse(String(m.telemetry_json || '{}')),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error listando maquinaria' });
    }
  });

  app.patch('/api/machines/:id', requireAuth, requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM machines WHERE id = ?', [id]);
      if (!existing) {
        res.status(404).json({ error: 'Equipo no encontrado' });
        return;
      }

      const currentTelemetry = JSON.parse(String(existing.telemetry_json || '{}'));
      const nextTelemetry =
        req.body?.telemetry && typeof req.body.telemetry === 'object'
          ? { ...currentTelemetry, ...req.body.telemetry }
          : currentTelemetry;

      const status = req.body?.status ? String(req.body.status) : String(existing.status);
      const progressPct =
        req.body?.progress_pct !== undefined
          ? Math.min(100, Math.max(0, Number(req.body.progress_pct)))
          : Number(existing.progress_pct);
      const currentJobCode =
        req.body?.current_job_code !== undefined
          ? req.body.current_job_code
          : existing.current_job_code;
      const hoursTotal =
        req.body?.hours_total !== undefined
          ? round2(Number(req.body.hours_total))
          : Number(existing.hours_total);

      await db.run(
        `UPDATE machines
         SET status = ?, progress_pct = ?, current_job_code = ?, telemetry_json = ?, hours_total = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [status, progressPct, currentJobCode as string | null, JSON.stringify(nextTelemetry), hoursTotal, id]
      );

      const updated = await db.queryOne<Record<string, unknown>>('SELECT * FROM machines WHERE id = ?', [id]);
      res.json({
        machine: {
          ...updated,
          telemetry: JSON.parse(String(updated?.telemetry_json || '{}')),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error actualizando telemetría' });
    }
  });

  // Work orders CRUD
  app.get('/api/orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = String(req.query.search || '').trim().toLowerCase();
      const processType = String(req.query.process_type || 'all');
      const prodStatus = String(req.query.production_status || 'all');
      const payStatus = String(req.query.payment_status || 'all');
      const docType = String(req.query.doc_type || 'all');

      const conditions: string[] = [];
      const params: (string | number | null)[] = [];

      if (processType !== 'all') {
        conditions.push('process_type = ?');
        params.push(processType);
      }
      if (prodStatus !== 'all') {
        conditions.push('production_status = ?');
        params.push(prodStatus);
      }
      if (payStatus !== 'all') {
        conditions.push('payment_status = ?');
        params.push(payStatus);
      }
      if (docType !== 'all') {
        conditions.push('doc_type = ?');
        params.push(docType);
      }
      if (search) {
        conditions.push(
          '(lower(order_code) LIKE ? OR lower(client_name) LIKE ? OR lower(description) LIKE ? OR lower(material) LIKE ? OR lower(client_nit) LIKE ?)'
        );
        const like = `%${search}%`;
        params.push(like, like, like, like, like);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orders = await db.queryAll<Record<string, unknown>>(
        `SELECT * FROM work_orders ${whereClause} ORDER BY id DESC`,
        params
      );
      res.json({ orders });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error consultando órdenes' });
    }
  });

  app.post('/api/orders', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const clientName = String(req.body?.client_name || '').trim();
      const clientNit = String(req.body?.client_nit || 'CF').trim() || 'CF';
      const processType = String(req.body?.process_type || '3d_printing');
      const machineId = req.body?.machine_id ? String(req.body.machine_id) : null;
      const material = String(req.body?.material || '').trim();
      const description = String(req.body?.description || '').trim();
      const quantity = Math.max(1, Math.floor(Number(req.body?.quantity || 1)));
      const estimatedMinutes = Math.max(5, Math.floor(Number(req.body?.estimated_minutes || 60)));
      const unitPriceGtq = round2(Math.max(0.01, Number(req.body?.unit_price_gtq || 0)));
      const docType = req.body?.doc_type === 'comprobante_taller' ? 'comprobante_taller' : 'factura_sat';
      const paymentStatus = req.body?.payment_status === 'cobrado' ? 'cobrado' : 'pendiente';
      const productionStatus = String(req.body?.production_status || 'cola_espera');
      const dueDate = String(req.body?.due_date || new Date().toISOString().slice(0, 10));

      if (!clientName || !material || !description || unitPriceGtq <= 0) {
        res.status(400).json({ error: 'Cliente, material, descripción y precio unitario mayor a Q 0.00 son requeridos' });
        return;
      }

      const grossTotal = round2(quantity * unitPriceGtq);
      const { subtotal, iva, total } = computeGuatemalanTotals(grossTotal, docType);

      const countRow = await db.queryOne<{ max_id: number }>('SELECT COALESCE(MAX(id), 0) AS max_id FROM work_orders');
      const nextNum = Number(countRow?.max_id || 0) + 140;
      const orderCode = `OP-2026-${String(nextNum).padStart(4, '0')}`;
      const satSeries = docType === 'factura_sat' ? 'A1B2' : null;
      const satNumber = docType === 'factura_sat' ? String(481920 + nextNum).padStart(8, '0') : null;

      const insertRes = await db.run(
        `INSERT INTO work_orders (
          order_code, client_name, client_nit, process_type, machine_id, material,
          description, quantity, estimated_minutes, unit_price_gtq, subtotal_gtq,
          iva_gtq, total_gtq, doc_type, sat_series, sat_number, payment_status,
          production_status, due_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderCode,
          clientName,
          clientNit,
          processType,
          machineId,
          material,
          description,
          quantity,
          estimatedMinutes,
          unitPriceGtq,
          subtotal,
          iva,
          total,
          docType,
          satSeries,
          satNumber,
          paymentStatus,
          productionStatus,
          dueDate,
          req.user?.id || null,
        ]
      );

      // Sync financial ledger entry
      const categoryLabel =
        processType === '3d_printing' ? 'Impresión 3D' : processType === 'laser' ? 'Corte Láser' : 'Impresión UV DTF';
      await db.run(
        `INSERT INTO financial_entries (
          entry_code, entry_type, doc_type, category, description, counterparty,
          nit, order_code, subtotal_gtq, iva_gtq, total_gtq, status, entry_date, created_by
        ) VALUES (?, 'ingreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `FIN-${orderCode}`,
          docType,
          categoryLabel,
          description,
          clientName,
          clientNit,
          orderCode,
          subtotal,
          iva,
          total,
          paymentStatus,
          new Date().toISOString().slice(0, 10),
          req.user?.id || null,
        ]
      );

      // If assigned machine and status is active, reflect on machine
      if (machineId && (productionStatus === 'en_produccion' || productionStatus === 'calentando')) {
        await db.run(
          `UPDATE machines SET status = ?, current_job_code = ?, progress_pct = 5, updated_at = datetime('now') WHERE id = ?`,
          [productionStatus, orderCode, machineId]
        );
      }

      const created = await db.queryOne<Record<string, unknown>>('SELECT * FROM work_orders WHERE id = ?', [
        insertRes.lastInsertRowid,
      ]);
      res.status(201).json({ order: created });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error creando orden de producción' });
    }
  });

  app.patch('/api/orders/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM work_orders WHERE id = ?', [id]);
      if (!existing) {
        res.status(404).json({ error: 'Orden no encontrada' });
        return;
      }

      const productionStatus = req.body?.production_status
        ? String(req.body.production_status)
        : String(existing.production_status);
      const paymentStatus = req.body?.payment_status
        ? String(req.body.payment_status)
        : String(existing.payment_status);
      const machineId = req.body?.machine_id !== undefined ? req.body.machine_id : existing.machine_id;
      const docType =
        req.body?.doc_type === 'comprobante_taller' || req.body?.doc_type === 'factura_sat'
          ? (req.body.doc_type as 'factura_sat' | 'comprobante_taller')
          : (String(existing.doc_type) as 'factura_sat' | 'comprobante_taller');

      const quantity =
        req.body?.quantity !== undefined ? Math.max(1, Math.floor(Number(req.body.quantity))) : Number(existing.quantity);
      const unitPriceGtq =
        req.body?.unit_price_gtq !== undefined
          ? round2(Math.max(0.01, Number(req.body.unit_price_gtq)))
          : Number(existing.unit_price_gtq);

      const { subtotal, iva, total } = computeGuatemalanTotals(round2(quantity * unitPriceGtq), docType);
      const satSeries = docType === 'factura_sat' ? (existing.sat_series || 'A1B2') : null;
      const satNumber =
        docType === 'factura_sat'
          ? existing.sat_number || String(481920 + id).padStart(8, '0')
          : null;

      await db.run(
        `UPDATE work_orders
         SET production_status = ?, payment_status = ?, machine_id = ?, doc_type = ?,
             sat_series = ?, sat_number = ?, quantity = ?, unit_price_gtq = ?,
             subtotal_gtq = ?, iva_gtq = ?, total_gtq = ?
         WHERE id = ?`,
        [
          productionStatus,
          paymentStatus,
          machineId as string | null,
          docType,
          satSeries as string | null,
          satNumber as string | null,
          quantity,
          unitPriceGtq,
          subtotal,
          iva,
          total,
          id,
        ]
      );

      // Sync financial entry
      await db.run(
        `UPDATE financial_entries
         SET status = ?, doc_type = ?, subtotal_gtq = ?, iva_gtq = ?, total_gtq = ?
         WHERE order_code = ?`,
        [paymentStatus, docType, subtotal, iva, total, String(existing.order_code)]
      );

      // Update machine state if applicable
      if (machineId) {
        if (productionStatus === 'completado') {
          await db.run(
            `UPDATE machines SET status = 'operativo', progress_pct = 100, current_job_code = NULL, updated_at = datetime('now')
             WHERE id = ? AND current_job_code = ?`,
            [String(machineId), String(existing.order_code)]
          );
        } else if (productionStatus === 'en_produccion' || productionStatus === 'calentando') {
          await db.run(
            `UPDATE machines SET status = ?, current_job_code = ?, updated_at = datetime('now') WHERE id = ?`,
            [productionStatus, String(existing.order_code), String(machineId)]
          );
        }
      }

      const updated = await db.queryOne<Record<string, unknown>>('SELECT * FROM work_orders WHERE id = ?', [id]);
      res.json({ order: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error actualizando orden' });
    }
  });

  app.delete('/api/orders/:id', requireAuth, requireRole('admin', 'finance'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.queryOne<{ order_code: string }>('SELECT order_code FROM work_orders WHERE id = ?', [id]);
      if (!existing) {
        res.status(404).json({ error: 'Orden no encontrada' });
        return;
      }
      await db.run('DELETE FROM financial_entries WHERE order_code = ?', [existing.order_code]);
      await db.run('DELETE FROM work_orders WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error eliminando orden' });
    }
  });

  // Inventory CRUD
  app.get('/api/inventory', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = String(req.query.search || '').trim().toLowerCase();
      const category = String(req.query.category || 'all');
      const onlyLow = req.query.low_stock === 'true';

      const conditions: string[] = [];
      const params: (string | number | null)[] = [];

      if (category !== 'all') {
        conditions.push('category = ?');
        params.push(category);
      }
      if (onlyLow) {
        conditions.push('stock_qty <= min_stock_qty');
      }
      if (search) {
        conditions.push('(lower(sku) LIKE ? OR lower(name) LIKE ? OR lower(supplier) LIKE ?)');
        const like = `%${search}%`;
        params.push(like, like, like);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const items = await db.queryAll<Record<string, unknown>>(
        `SELECT * FROM inventory_items ${whereClause} ORDER BY (stock_qty <= min_stock_qty) DESC, id ASC`,
        params
      );
      res.json({ items });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error listando inventario' });
    }
  });

  app.post('/api/inventory', requireAuth, requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const sku = String(req.body?.sku || '').trim().toUpperCase();
      const name = String(req.body?.name || '').trim();
      const category = String(req.body?.category || 'filamento_3d');
      const unit = String(req.body?.unit || 'kg').trim();
      const stockQty = round2(Math.max(0, Number(req.body?.stock_qty || 0)));
      const minStockQty = round2(Math.max(0, Number(req.body?.min_stock_qty || 1)));
      const unitCostGtq = round2(Math.max(0, Number(req.body?.unit_cost_gtq || 0)));
      const supplier = String(req.body?.supplier || '').trim();

      if (!sku || !name || !supplier) {
        res.status(400).json({ error: 'SKU, nombre y proveedor son obligatorios' });
        return;
      }

      const existing = await db.queryOne<{ id: number }>('SELECT id FROM inventory_items WHERE sku = ?', [sku]);
      if (existing) {
        res.status(409).json({ error: 'Ya existe un insumo con ese SKU' });
        return;
      }

      const insertRes = await db.run(
        `INSERT INTO inventory_items (sku, name, category, unit, stock_qty, min_stock_qty, unit_cost_gtq, supplier)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sku, name, category, unit, stockQty, minStockQty, unitCostGtq, supplier]
      );
      const item = await db.queryOne<Record<string, unknown>>('SELECT * FROM inventory_items WHERE id = ?', [
        insertRes.lastInsertRowid,
      ]);
      res.status(201).json({ item });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error creando insumo' });
    }
  });

  app.patch('/api/inventory/:id', requireAuth, requireRole('admin', 'operator'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM inventory_items WHERE id = ?', [id]);
      if (!existing) {
        res.status(404).json({ error: 'Insumo no encontrado' });
        return;
      }

      const nextStock =
        req.body?.delta_qty !== undefined
          ? round2(Math.max(0, Number(existing.stock_qty) + Number(req.body.delta_qty)))
          : req.body?.stock_qty !== undefined
            ? round2(Math.max(0, Number(req.body.stock_qty)))
            : Number(existing.stock_qty);

      const minStockQty =
        req.body?.min_stock_qty !== undefined
          ? round2(Math.max(0, Number(req.body.min_stock_qty)))
          : Number(existing.min_stock_qty);

      const unitCostGtq =
        req.body?.unit_cost_gtq !== undefined
          ? round2(Math.max(0, Number(req.body.unit_cost_gtq)))
          : Number(existing.unit_cost_gtq);

      await db.run(
        `UPDATE inventory_items SET stock_qty = ?, min_stock_qty = ?, unit_cost_gtq = ?, updated_at = datetime('now') WHERE id = ?`,
        [nextStock, minStockQty, unitCostGtq, id]
      );
      const item = await db.queryOne<Record<string, unknown>>('SELECT * FROM inventory_items WHERE id = ?', [id]);
      res.json({ item });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error actualizando inventario' });
    }
  });

  app.delete('/api/inventory/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.run('DELETE FROM inventory_items WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error eliminando insumo' });
    }
  });

  // Finances & SAT ledger
  app.get('/api/finances', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const search = String(req.query.search || '').trim().toLowerCase();
      const entryType = String(req.query.entry_type || 'all');
      const docType = String(req.query.doc_type || 'all');
      const status = String(req.query.status || 'all');

      const conditions: string[] = [];
      const params: (string | number | null)[] = [];

      if (entryType !== 'all') {
        conditions.push('entry_type = ?');
        params.push(entryType);
      }
      if (docType !== 'all') {
        conditions.push('doc_type = ?');
        params.push(docType);
      }
      if (status !== 'all') {
        conditions.push('status = ?');
        params.push(status);
      }
      if (search) {
        conditions.push(
          '(lower(entry_code) LIKE ? OR lower(counterparty) LIKE ? OR lower(description) LIKE ? OR lower(category) LIKE ? OR lower(nit) LIKE ?)'
        );
        const like = `%${search}%`;
        params.push(like, like, like, like, like);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const entries = await db.queryAll<Record<string, unknown>>(
        `SELECT * FROM financial_entries ${whereClause} ORDER BY entry_date DESC, id DESC`,
        params
      );

      let collectedGtq = 0;
      let pendingGtq = 0;
      let expensesGtq = 0;
      let ivaDebitGtq = 0;
      let ivaCreditGtq = 0;

      for (const e of entries) {
        const total = Number(e.total_gtq || 0);
        const iva = Number(e.iva_gtq || 0);
        if (e.entry_type === 'ingreso' && e.status === 'cobrado') {
          collectedGtq += total;
          ivaDebitGtq += iva;
        } else if (e.entry_type === 'ingreso' && e.status === 'pendiente') {
          pendingGtq += total;
          ivaDebitGtq += iva;
        } else if (e.entry_type === 'egreso' && e.status !== 'anulado') {
          expensesGtq += total;
          ivaCreditGtq += iva;
        }
      }

      res.json({
        summary: {
          collectedGtq: round2(collectedGtq),
          pendingGtq: round2(pendingGtq),
          expensesGtq: round2(expensesGtq),
          netMarginGtq: round2(collectedGtq - expensesGtq),
          ivaDebitGtq: round2(ivaDebitGtq),
          ivaCreditGtq: round2(ivaCreditGtq),
          ivaNetPayableGtq: round2(Math.max(0, ivaDebitGtq - ivaCreditGtq)),
        },
        entries,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error listando movimientos financieros' });
    }
  });

  app.post('/api/finances', requireAuth, requireRole('admin', 'finance'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const entryType = req.body?.entry_type === 'ingreso' ? 'ingreso' : 'egreso';
      const docType = req.body?.doc_type === 'comprobante_taller' ? 'comprobante_taller' : 'factura_sat';
      const category = String(req.body?.category || '').trim();
      const description = String(req.body?.description || '').trim();
      const counterparty = String(req.body?.counterparty || '').trim();
      const nit = String(req.body?.nit || 'CF').trim() || 'CF';
      const grossTotal = round2(Number(req.body?.total_gtq || 0));
      const entryDate = String(req.body?.entry_date || new Date().toISOString().slice(0, 10));
      const status =
        entryType === 'egreso' ? 'egreso' : req.body?.status === 'pendiente' ? 'pendiente' : 'cobrado';

      if (!category || !description || !counterparty || grossTotal <= 0) {
        res.status(400).json({ error: 'Categoría, contraparte, descripción y monto mayor a Q 0.00 son obligatorios' });
        return;
      }

      const { subtotal, iva, total } = computeGuatemalanTotals(grossTotal, docType);
      const countRow = await db.queryOne<{ max_id: number }>(
        'SELECT COALESCE(MAX(id), 0) AS max_id FROM financial_entries'
      );
      const nextNum = Number(countRow?.max_id || 0) + 100;
      const prefix = entryType === 'egreso' ? 'EGR' : 'ING';
      const entryCode = `${prefix}-2026-${String(nextNum).padStart(4, '0')}`;

      const insertRes = await db.run(
        `INSERT INTO financial_entries (
          entry_code, entry_type, doc_type, category, description, counterparty,
          nit, order_code, subtotal_gtq, iva_gtq, total_gtq, status, entry_date, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          entryCode,
          entryType,
          docType,
          category,
          description,
          counterparty,
          nit,
          subtotal,
          iva,
          total,
          status,
          entryDate,
          req.user?.id || null,
        ]
      );

      const entry = await db.queryOne<Record<string, unknown>>('SELECT * FROM financial_entries WHERE id = ?', [
        insertRes.lastInsertRowid,
      ]);
      res.status(201).json({ entry });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error registrando movimiento financiero' });
    }
  });

  app.patch('/api/finances/:id', requireAuth, requireRole('admin', 'finance'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.queryOne<Record<string, unknown>>('SELECT * FROM financial_entries WHERE id = ?', [id]);
      if (!existing) {
        res.status(404).json({ error: 'Movimiento financiero no encontrado' });
        return;
      }

      const status = String(req.body?.status || existing.status);
      const docType =
        req.body?.doc_type === 'factura_sat' || req.body?.doc_type === 'comprobante_taller'
          ? (req.body.doc_type as 'factura_sat' | 'comprobante_taller')
          : (String(existing.doc_type) as 'factura_sat' | 'comprobante_taller');

      const { subtotal, iva, total } = computeGuatemalanTotals(Number(existing.total_gtq), docType);

      await db.run(
        'UPDATE financial_entries SET status = ?, doc_type = ?, subtotal_gtq = ?, iva_gtq = ?, total_gtq = ? WHERE id = ?',
        [status, docType, subtotal, iva, total, id]
      );

      if (existing.order_code && (status === 'cobrado' || status === 'pendiente' || status === 'anulado')) {
        await db.run(
          'UPDATE work_orders SET payment_status = ?, doc_type = ?, subtotal_gtq = ?, iva_gtq = ?, total_gtq = ? WHERE order_code = ?',
          [status, docType, subtotal, iva, total, String(existing.order_code)]
        );
      }

      const updated = await db.queryOne<Record<string, unknown>>('SELECT * FROM financial_entries WHERE id = ?', [id]);
      res.json({ entry: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error actualizando movimiento' });
    }
  });

  app.delete('/api/finances/:id', requireAuth, requireRole('admin', 'finance'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db.run('DELETE FROM financial_entries WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error eliminando movimiento' });
    }
  });

  // Vite dev middleware vs production static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`PrecisionHub server listening on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
