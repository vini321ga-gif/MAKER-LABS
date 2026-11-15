ALTER TABLE work_orders ADD COLUMN deleted_at TEXT;
ALTER TABLE work_orders ADD COLUMN deleted_by INTEGER;
ALTER TABLE work_orders ADD COLUMN deleted_by_name TEXT;
