ALTER TABLE dispatch_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE dispatch_jobs SET updated_at = datetime('now') WHERE updated_at = '';
