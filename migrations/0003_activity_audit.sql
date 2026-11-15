ALTER TABLE work_orders ADD COLUMN deleted_reason TEXT;

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


INSERT INTO activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, details, created_at)
SELECT w.created_by, COALESCE(u.name, 'Usuario #' || COALESCE(w.created_by, 0)), COALESCE(u.role, 'operator'),
       'order_created', 'order', CAST(w.id AS TEXT), w.order_code,
       'Orden creada para ' || w.client_name || ': ' || w.quantity || ' pieza(s), total Q ' || printf('%.2f', w.total_gtq) || '.',
       w.created_at
FROM work_orders w LEFT JOIN users u ON u.id = w.created_by
WHERE NOT EXISTS (SELECT 1 FROM activity_log a WHERE a.action = 'order_created' AND a.entity_id = CAST(w.id AS TEXT));

INSERT INTO activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, details, created_at)
SELECT f.created_by, COALESCE(u.name, 'Usuario #' || COALESCE(f.created_by, 0)), COALESCE(u.role, 'operator'),
       CASE WHEN f.order_code IS NULL THEN CASE WHEN f.entry_type = 'ingreso' THEN 'capital_income_created' ELSE 'expense_created' END
            WHEN lower(f.description) LIKE 'anticipo%' THEN 'advance_registered' ELSE 'full_payment_registered' END,
       CASE WHEN f.order_code IS NULL THEN 'financial_entry' ELSE 'financial_entry' END,
       CAST(f.id AS TEXT), f.entry_code,
       CASE WHEN f.order_code IS NULL
            THEN (CASE WHEN f.entry_type = 'ingreso' THEN 'Ingreso' ELSE 'Egreso' END) || ' de Q ' || printf('%.2f', f.total_gtq) || ' · ' || f.category || ' · ' || f.description || ' · contraparte: ' || f.counterparty || '.'
            ELSE f.description || ' por Q ' || printf('%.2f', f.total_gtq) || ', estado ' || f.status || '.' END,
       f.created_at
FROM financial_entries f LEFT JOIN users u ON u.id = f.created_by
WHERE (f.order_code IS NULL OR f.entry_code <> ('FIN-' || f.order_code))
  AND NOT EXISTS (
    SELECT 1 FROM activity_log a
    WHERE a.action = CASE
      WHEN f.order_code IS NULL THEN CASE WHEN f.entry_type = 'ingreso' THEN 'capital_income_created' ELSE 'expense_created' END
      WHEN lower(f.description) LIKE 'anticipo%' THEN 'advance_registered' ELSE 'full_payment_registered'
    END
      AND a.entity_id = CAST(f.id AS TEXT)
  );

INSERT INTO activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, details, created_at)
SELECT w.deleted_by, COALESCE(w.deleted_by_name, u.name, 'Usuario #' || COALESCE(w.deleted_by, 0)), COALESCE(u.role, 'admin'),
       'order_deleted', 'order', CAST(w.id AS TEXT), w.order_code,
       'Orden de ' || w.client_name || ', total Q ' || printf('%.2f', w.total_gtq) || '. Justificación: ' || COALESCE(w.deleted_reason, 'No registrada en la versión anterior.'),
       w.deleted_at
FROM work_orders w LEFT JOIN users u ON u.id = w.deleted_by
WHERE w.deleted_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM activity_log a WHERE a.action = 'order_deleted' AND a.entity_id = CAST(w.id AS TEXT));

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log(actor_id, created_at DESC);
