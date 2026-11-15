import express from 'express';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DbStatus } from './db.ts';
import {
  clearSessionCookie,
  createSessionToken,
  getSessionIdFromRequest,
  hashPassword,
  requireRole,
  setSessionCookie,
  verifyPassword,
} from './auth.ts';
import type { AuthenticatedRequest, AuthUser, UserRole } from './auth.ts';

export interface AppDatabase {
  queryAll<T = Record<string, unknown>>(sql: string, params?: Array<string | number | null>): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: Array<string | number | null>): Promise<T | null>;
  run(sql: string, params?: Array<string | number | null>): Promise<{ changes: number; lastInsertRowid: number }>;
  getStatus(): Promise<DbStatus>;
}

export interface AppFileBucket {
  put(key: string, value: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function deleteFinancialEntry(db: AppDatabase, files: AppFileBucket | undefined, id: number): Promise<void> {
  if (files) {
    const attachments = await db.queryAll<{ object_key: string }>(
      'SELECT object_key FROM financial_attachments WHERE financial_entry_id = ?',
      [id]
    );
    await Promise.all(attachments.map(({ object_key }) => files.delete(object_key)));
  }
  await db.run('DELETE FROM financial_entries WHERE id = ?', [id]);
}

function computeGuatemalanTotals(grossTotal: number): { subtotal: number; iva: number; total: number } {
  const total = round2(Math.max(0, grossTotal));
  return { subtotal: total, iva: 0, total };
}

type OrderPaymentInput = { type: 'advance' | 'full'; status: 'pendiente' | 'cobrado'; amount?: number };
type OrderPaymentOrder = {
  id: number;
  order_code: string;
  client_name: string;
  client_nit: string;
  process_type: string;
  total_gtq: number;
  payment_status: string;
};

async function recordOrderPayment(
  db: AppDatabase,
  order: OrderPaymentOrder,
  input: OrderPaymentInput,
  userId: number | null
): Promise<{ order: Record<string, unknown> | null; payment: Record<string, unknown> | null }> {
  const baselineCode = `FIN-${order.order_code}`;
  const baseline = await db.queryOne<{ id: number; total_gtq: number; status: string }>(
    'SELECT id, total_gtq, status FROM financial_entries WHERE entry_code = ?',
    [baselineCode]
  );
  const payments = await db.queryAll<{ id: number; total_gtq: number; status: string }>(
    'SELECT id, total_gtq, status FROM financial_entries WHERE order_code = ? AND entry_code <> ?',
    [order.order_code, baselineCode]
  );
  const total = round2(Number(order.total_gtq) || 0);
  const legacyPaidBaseline = Boolean(baseline && baseline.status === 'cobrado' && Number(baseline.total_gtq) > 0 && payments.length === 0);
  let outstanding = baseline
    ? round2(Math.max(0, Number(baseline.total_gtq) || 0))
    : round2(Math.max(0, total - payments.reduce((sum, payment) => sum + Number(payment.total_gtq || 0), 0)));
  if (legacyPaidBaseline) outstanding = 0;

  if (input.type === 'advance') {
    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
      throw new Error('El anticipo debe ser mayor a Q 0.00 y no superar el saldo pendiente de la orden');
    }
    outstanding = round2(outstanding - amount);
  } else if (input.type !== 'full') {
    throw new Error('Tipo de pago no válido');
  }

  if (input.type === 'full' && input.status === 'cobrado') {
    await db.run(
      'UPDATE financial_entries SET status = ? WHERE order_code = ? AND entry_code <> ? AND status = ?',
      ['cobrado', order.order_code, baselineCode, 'pendiente']
    );
  }

  if (baseline) {
    await db.run(
      'UPDATE financial_entries SET subtotal_gtq = ?, iva_gtq = 0, total_gtq = ?, status = ? WHERE id = ?',
      [outstanding, outstanding, 'pendiente', baseline.id]
    );
  }

  const amountToRecord = input.type === 'advance' ? round2(Number(input.amount)) : input.status === 'cobrado' ? outstanding : outstanding;
  let payment: Record<string, unknown> | null = null;
  if (amountToRecord > 0) {
    const paymentCode = `FIN-${order.order_code}-PAY-${randomUUID().slice(0, 8).toUpperCase()}`;
    const processLabel = order.process_type === '3d_printing' ? 'Impresión 3D' : order.process_type === 'laser' ? 'Corte Láser' : 'Impresión UV DTF';
    const paymentDescription = input.type === 'advance' ? `Anticipo de orden ${order.order_code}` : `Pago total de orden ${order.order_code}`;
    const inserted = await db.run(
      `INSERT INTO financial_entries (
        entry_code, entry_type, doc_type, category, description, counterparty,
        nit, order_code, subtotal_gtq, iva_gtq, total_gtq, status, entry_date, created_by
      ) VALUES (?, 'ingreso', 'comprobante_taller', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        paymentCode, processLabel, paymentDescription, order.client_name, order.client_nit || 'CF',
        order.order_code, amountToRecord, amountToRecord, input.status,
        new Date().toISOString().slice(0, 10), userId,
      ]
    );
    payment = await db.queryOne<Record<string, unknown>>('SELECT * FROM financial_entries WHERE id = ?', [inserted.lastInsertRowid]);
  }

  const refreshed = await db.queryAll<{ total_gtq: number; status: string }>(
    'SELECT total_gtq, status FROM financial_entries WHERE order_code = ? AND entry_code <> ?',
    [order.order_code, baselineCode]
  );
  const paidTotal = refreshed.reduce((sum, entry) => sum + (entry.status === 'cobrado' ? Number(entry.total_gtq || 0) : 0), legacyPaidBaseline ? total : 0);
  const nextStatus = paidTotal >= total ? 'cobrado' : 'pendiente';
  await db.run('UPDATE work_orders SET payment_status = ? WHERE id = ?', [nextStatus, order.id]);
  const updatedOrder = await db.queryOne<Record<string, unknown>>('SELECT * FROM work_orders WHERE id = ?', [order.id]);
  return { order: updatedOrder, payment };
}

function hideFinancialOrderFields(order: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...order };
  delete sanitized.unit_price_gtq;
  delete sanitized.subtotal_gtq;
  delete sanitized.iva_gtq;
  delete sanitized.total_gtq;
  delete sanitized.payment_status;
  return sanitized;
}

async function attachAuth(db: AppDatabase, req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
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

export function createApiApp(db: AppDatabase, schemaSql: string, files?: AppFileBucket) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => attachAuth(db, req as AuthenticatedRequest, res, next));

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
        `INSERT INTO users (email, name, role, password_hash)
         VALUES (?, ?, CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'admin' ELSE 'operator' END, ?)`,
        [email, name, passwordHash]
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

  if (files) {
    const allowedAttachmentTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

    app.get(
      '/api/finances/:entryId/attachments',
      requireAuth,
      requireRole('admin', 'finance'),
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const entryId = Number(req.params.entryId);
          const attachments = await db.queryAll<Record<string, unknown>>(
            `SELECT id, original_name, content_type, size_bytes, created_at
             FROM financial_attachments WHERE financial_entry_id = ? ORDER BY created_at DESC`,
            [entryId]
          );
          res.json({ attachments });
        } catch (err) {
          res.status(500).json({ error: err instanceof Error ? err.message : 'Error leyendo adjuntos' });
        }
      }
    );

    app.post(
      '/api/finances/:entryId/attachments',
      requireAuth,
      requireRole('admin', 'finance'),
      express.raw({ type: 'application/octet-stream', limit: '10mb' }),
      async (req: AuthenticatedRequest, res: Response) => {
        let objectKey: string | null = null;
        try {
          const entryId = Number(req.params.entryId);
          const entry = await db.queryOne<{ id: number }>('SELECT id FROM financial_entries WHERE id = ?', [entryId]);
          if (!entry) {
            res.status(404).json({ error: 'Movimiento financiero no encontrado' });
            return;
          }

          const body = req.body;
          const contentType = String(req.headers['x-file-content-type'] || '').toLowerCase();
          const rawName = String(req.headers['x-file-name'] || '');
          const originalName = decodeURIComponent(rawName).replace(/[\\/\r\n\0]/g, '_').slice(0, 180);
          if (!Buffer.isBuffer(body) || body.length === 0) {
            res.status(400).json({ error: 'Seleccione un archivo válido' });
            return;
          }
          if (!allowedAttachmentTypes.has(contentType)) {
            res.status(415).json({ error: 'Solo se permiten PDF, JPEG, PNG o WebP' });
            return;
          }
          if (!originalName) {
            res.status(400).json({ error: 'El archivo debe tener un nombre válido' });
            return;
          }

          const id = randomUUID();
          objectKey = `financial/${entryId}/${id}`;
          await files.put(objectKey, new Uint8Array(body), { httpMetadata: { contentType } });
          await db.run(
            `INSERT INTO financial_attachments
              (id, financial_entry_id, object_key, original_name, content_type, size_bytes, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, entryId, objectKey, originalName, contentType, body.length, req.user?.id || null]
          );

          res.status(201).json({ attachment: { id, original_name: originalName, content_type: contentType, size_bytes: body.length } });
        } catch (err) {
          if (objectKey) await files.delete(objectKey).catch(() => undefined);
          res.status(500).json({ error: err instanceof Error ? err.message : 'Error guardando adjunto' });
        }
      }
    );

    app.get(
      '/api/finances/:entryId/attachments/:attachmentId',
      requireAuth,
      requireRole('admin'),
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const attachment = await db.queryOne<{
            id: string;
            object_key: string;
            original_name: string;
            content_type: string;
          }>(
            `SELECT id, object_key, original_name, content_type FROM financial_attachments
             WHERE id = ? AND financial_entry_id = ?`,
            [req.params.attachmentId, Number(req.params.entryId)]
          );
          if (!attachment) {
            res.status(404).json({ error: 'Adjunto no encontrado' });
            return;
          }
          const object = await files.get(attachment.object_key);
          if (!object) {
            res.status(404).json({ error: 'El archivo ya no está disponible' });
            return;
          }
          res.setHeader('Content-Type', attachment.content_type);
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`);
          res.setHeader('Cache-Control', 'private, no-store');
          res.send(Buffer.from(await object.arrayBuffer()));
        } catch (err) {
          res.status(500).json({ error: err instanceof Error ? err.message : 'Error descargando adjunto' });
        }
      }
    );

    app.delete(
      '/api/finances/:entryId/attachments/:attachmentId',
      requireAuth,
      requireRole('admin', 'finance'),
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const attachment = await db.queryOne<{ object_key: string }>(
            'SELECT object_key FROM financial_attachments WHERE id = ? AND financial_entry_id = ?',
            [req.params.attachmentId, Number(req.params.entryId)]
          );
          if (!attachment) {
            res.status(404).json({ error: 'Adjunto no encontrado' });
            return;
          }
          await files.delete(attachment.object_key);
          await db.run('DELETE FROM financial_attachments WHERE id = ?', [req.params.attachmentId]);
          res.json({ ok: true });
        } catch (err) {
          res.status(500).json({ error: err instanceof Error ? err.message : 'Error eliminando adjunto' });
        }
      }
    );
  }

  // System DB & Cloudflare D1 Status
  app.get('/api/system/db-status', requireAuth, requireRole('admin'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const status = await db.getStatus();
      const tables = ['users', 'machines', 'work_orders', 'inventory_items', 'financial_entries', 'financial_attachments'] as const;
      const counts: Record<string, number> = {};
      for (const table of tables) {
        const row = await db.queryOne<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
        counts[table] = Number(row?.total || 0);
      }
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
      const docTypeFilter = 'all';
      const hasDocFilter = false;

      const canViewBalances = req.user?.role !== 'operator';
      const entries = canViewBalances
        ? hasDocFilter
          ? await db.queryAll<Record<string, unknown>>(
              'SELECT * FROM financial_entries WHERE doc_type = ? ORDER BY entry_date DESC, id DESC',
              [docTypeFilter]
            )
          : await db.queryAll<Record<string, unknown>>(
              'SELECT * FROM financial_entries ORDER BY entry_date DESC, id DESC'
            )
        : [];

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
            'SELECT * FROM work_orders WHERE deleted_at IS NULL AND doc_type = ? ORDER BY id DESC',
            [docTypeFilter]
          )
        : await db.queryAll<Record<string, unknown>>('SELECT * FROM work_orders WHERE deleted_at IS NULL ORDER BY id DESC');

      const machines = await db.queryAll<Record<string, unknown>>(
        'SELECT * FROM machines ORDER BY category ASC, id ASC'
      );
      const lowStockItems = await db.queryAll<Record<string, unknown>>(
        'SELECT * FROM inventory_items WHERE stock_qty <= min_stock_qty ORDER BY stock_qty ASC'
      );

      res.json({
        kpis: {
          ...(canViewBalances
            ? {
                collectedGtq: round2(collectedGtq),
                pendingGtq: round2(pendingGtq),
                expensesGtq: round2(expensesGtq),
                netProfitGtq: round2(collectedGtq - expensesGtq),
                ivaBalanceGtq: round2(Math.max(0, ivaDebitGtq - ivaCreditGtq)),
              }
            : {}),
          activeOrdersCount: orders.filter((o) => o.production_status !== 'completado').length,
          completedOrdersCount: orders.filter((o) => o.production_status === 'completado').length,
        },
        machines: machines.map((m) => ({
          ...m,
          telemetry: JSON.parse(String(m.telemetry_json || '{}')),
        })),
        recentOrders: orders.slice(0, 8).map((order) =>
          req.user?.role === 'operator' ? hideFinancialOrderFields(order) : order
        ),
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

      conditions.push('deleted_at IS NULL');
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orders = await db.queryAll<Record<string, unknown>>(
        `SELECT work_orders.*, creator.name AS created_by_name
         FROM work_orders
         LEFT JOIN users creator ON creator.id = work_orders.created_by
         ${whereClause} ORDER BY work_orders.id DESC`,
        params
      );
      res.json({
        orders: req.user?.role === 'operator' ? orders.map(hideFinancialOrderFields) : orders,
      });
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
      const docType = 'comprobante_taller';
      const initialPaymentType = req.body?.initial_payment_type === 'advance' || req.body?.initial_payment_type === 'full' ? req.body.initial_payment_type : 'none';
      const initialPaymentStatus = req.body?.initial_payment_status === 'cobrado' ? 'cobrado' : 'pendiente';
      const initialPaymentAmount = round2(Number(req.body?.initial_payment_amount || 0));
      const paymentStatus = initialPaymentType === 'full' && initialPaymentStatus === 'cobrado' ? 'cobrado' : 'pendiente';
      const productionStatus = String(req.body?.production_status || 'cola_espera');
      const dueDate = String(req.body?.due_date || new Date().toISOString().slice(0, 10));

      if (!clientName || !material || !description || unitPriceGtq <= 0 || !Number.isFinite(quantity) || !Number.isFinite(estimatedMinutes)) {
        res.status(400).json({ error: 'Cliente, material, descripción y precio unitario mayor a Q 0.00 son requeridos' });
        return;
      }

      const grossTotal = round2(quantity * unitPriceGtq);
      if (initialPaymentType === 'advance' && (initialPaymentAmount <= 0 || initialPaymentAmount > grossTotal)) {
        res.status(400).json({ error: 'El anticipo debe ser mayor a Q 0.00 y no superar el total de la orden' });
        return;
      }
      const { subtotal, iva, total } = computeGuatemalanTotals(grossTotal);

      const countRow = await db.queryOne<{ max_id: number }>('SELECT COALESCE(MAX(id), 0) AS max_id FROM work_orders');
      const nextNum = Number(countRow?.max_id || 0) + 140;
      const orderCode = `OP-2026-${String(nextNum).padStart(4, '0')}`;
      const satSeries = null;
      const satNumber = null;

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
          'pendiente',
          new Date().toISOString().slice(0, 10),
          req.user?.id || null,
        ]
      );
      if (initialPaymentType !== 'none') {
        await recordOrderPayment(
          db,
          { id: insertRes.lastInsertRowid, order_code: orderCode, client_name: clientName, client_nit: clientNit, process_type: processType, total_gtq: total, payment_status: paymentStatus },
          { type: initialPaymentType, status: initialPaymentStatus, amount: initialPaymentAmount },
          req.user?.id || null
        );
      }

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
      res.status(201).json({
        order: req.user?.role === 'operator' && created ? hideFinancialOrderFields(created) : created,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error creando orden de producción' });
    }
  });

  app.post('/api/orders/:id/payments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const order = await db.queryOne<OrderPaymentOrder & { deleted_at?: string | null }>(
        'SELECT id, order_code, client_name, client_nit, process_type, total_gtq, payment_status, deleted_at FROM work_orders WHERE id = ?',
        [id]
      );
      if (!order || order.deleted_at) {
        res.status(404).json({ error: 'Orden no encontrada o borrada' });
        return;
      }
      const type = req.body?.type === 'full' ? 'full' : req.body?.type === 'advance' ? 'advance' : null;
      const status = req.body?.status === 'pendiente' ? 'pendiente' : req.body?.status === 'cobrado' ? 'cobrado' : null;
      if (!type || !status) {
        res.status(400).json({ error: 'Seleccione un tipo de pago y un estado válido' });
        return;
      }
      const result = await recordOrderPayment(
        db,
        order,
        { type, status, amount: req.body?.amount === undefined ? undefined : Number(req.body.amount) },
        req.user?.id || null
      );
      const updatedOrder = result.order;
      res.status(201).json({
        order: req.user?.role === 'operator' && updatedOrder ? hideFinancialOrderFields(updatedOrder) : updatedOrder,
        payment: result.payment,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Error registrando pago' });
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

      const canEditFinancialFields = req.user?.role !== 'operator';
      const productionStatus = req.body?.production_status
        ? String(req.body.production_status)
        : String(existing.production_status);
      const paymentStatus = String(existing.payment_status);
      const machineId = req.body?.machine_id !== undefined ? req.body.machine_id : existing.machine_id;
      const docType = 'comprobante_taller';

      const quantity =
        canEditFinancialFields && req.body?.quantity !== undefined
          ? Math.max(1, Math.floor(Number(req.body.quantity)))
          : Number(existing.quantity);
      const unitPriceGtq =
        canEditFinancialFields && req.body?.unit_price_gtq !== undefined
          ? round2(Math.max(0.01, Number(req.body.unit_price_gtq)))
          : Number(existing.unit_price_gtq);

      const { subtotal, iva, total } = computeGuatemalanTotals(round2(quantity * unitPriceGtq));
      const satSeries = null;
      const satNumber = null;

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
      res.json({
        order: req.user?.role === 'operator' && updated ? hideFinancialOrderFields(updated) : updated,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error actualizando orden' });
    }
  });

  app.get('/api/orders/deleted', requireAuth, requireRole('admin', 'finance'), async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const orders = await db.queryAll<Record<string, unknown>>(
        `SELECT work_orders.*, creator.name AS created_by_name
         FROM work_orders
         LEFT JOIN users creator ON creator.id = work_orders.created_by
         WHERE work_orders.deleted_at IS NOT NULL
         ORDER BY work_orders.deleted_at DESC, work_orders.id DESC`
      );
      res.json({ orders });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error consultando órdenes eliminadas' });
    }
  });

  app.delete('/api/orders/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.queryOne<{ order_code: string; deleted_at: string | null }>(
        'SELECT order_code, deleted_at FROM work_orders WHERE id = ?',
        [id]
      );
      if (!existing) {
        res.status(404).json({ error: 'Orden no encontrada' });
        return;
      }
      if (existing.deleted_at) {
        res.status(409).json({ error: 'La orden ya estaba marcada como borrada' });
        return;
      }
      await db.run(
        `UPDATE work_orders
         SET deleted_at = datetime('now'), deleted_by = ?, deleted_by_name = ?, payment_status = 'anulado'
         WHERE id = ? AND deleted_at IS NULL`,
        [req.user?.id || null, req.user?.name || 'Administrador', id]
      );
      await db.run(
        `UPDATE financial_entries SET status = 'anulado' WHERE order_code = ?`,
        [existing.order_code]
      );
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

      if (req.user?.role === 'operator') {
        conditions.push('created_by = ?');
        params.push(req.user?.id ?? 0);
      }
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
        `SELECT financial_entries.*, creator.name AS created_by_name
         FROM financial_entries
         LEFT JOIN users creator ON creator.id = financial_entries.created_by
         ${whereClause} ORDER BY financial_entries.entry_date DESC, financial_entries.id DESC`,
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
        summary:
          req.user?.role !== 'operator'
            ? {
                collectedGtq: round2(collectedGtq),
                pendingGtq: round2(pendingGtq),
                expensesGtq: round2(expensesGtq),
                netMarginGtq: round2(collectedGtq - expensesGtq),
                ivaDebitGtq: round2(ivaDebitGtq),
                ivaCreditGtq: round2(ivaCreditGtq),
                ivaNetPayableGtq: round2(Math.max(0, ivaDebitGtq - ivaCreditGtq)),
              }
            : null,
        entries,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error listando movimientos financieros' });
    }
  });

  app.post('/api/finances', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const entryType = req.body?.entry_type === 'ingreso' ? 'ingreso' : 'egreso';
      const docType = 'comprobante_taller';
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

      const { subtotal, iva, total } = computeGuatemalanTotals(grossTotal);
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

      if (existing.order_code) {
        res.status(409).json({ error: 'Los pagos de una orden se registran desde el detalle de la orden' });
        return;
      }

      const status = String(req.body?.status || existing.status);
      const docType = 'comprobante_taller';

      const { subtotal, iva, total } = computeGuatemalanTotals(Number(existing.total_gtq));

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

  app.delete('/api/finances/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await deleteFinancialEntry(db, files, id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Error eliminando movimiento' });
    }
  });

  return app;
}
