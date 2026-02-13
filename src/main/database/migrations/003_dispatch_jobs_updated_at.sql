ALTER TABLE dispatch_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));
