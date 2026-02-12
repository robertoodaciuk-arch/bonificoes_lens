PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  seller_name_norm TEXT,
  seller_aliases_json TEXT,
  phone_e164 TEXT NOT NULL,
  email TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_mtime_ms INTEGER NOT NULL,
  sha256 TEXT,
  period_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seller_reports (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  seller_name_raw TEXT NOT NULL,
  seller_name_norm TEXT NOT NULL,
  matched_contact_id TEXT,
  rows_count INTEGER NOT NULL DEFAULT 0,
  sales_total_cents INTEGER NOT NULL DEFAULT 0,
  commission_total_cents INTEGER NOT NULL DEFAULT 0,
  ticket_avg_cents INTEGER NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  anomalies_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE CASCADE,
  FOREIGN KEY(matched_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS seller_sales (
  id TEXT PRIMARY KEY,
  seller_report_id TEXT NOT NULL,
  vendor_name_raw TEXT,
  store TEXT,
  client_name TEXT,
  os TEXT,
  sale_date TEXT,
  sale_value_cents INTEGER,
  commission_cents INTEGER,
  row_index INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(seller_report_id) REFERENCES seller_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_artifacts (
  id TEXT PRIMARY KEY,
  seller_report_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(seller_report_id) REFERENCES seller_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dispatch_jobs (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  channels_json TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY(import_id) REFERENCES imports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dispatch_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  seller_report_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  output_json TEXT NOT NULL,
  channel_overrides_json TEXT NOT NULL DEFAULT '{}',
  last_error_code TEXT,
  last_error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(job_id) REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY(seller_report_id) REFERENCES seller_reports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dispatch_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  dispatch_item_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  message_text TEXT,
  artifact_kind TEXT,
  artifact_path TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  FOREIGN KEY(job_id) REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY(dispatch_item_id) REFERENCES dispatch_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  cursor TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(job_id) REFERENCES dispatch_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
