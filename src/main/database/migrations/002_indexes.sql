CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(active);
CREATE INDEX IF NOT EXISTS idx_contacts_seller_norm ON contacts(seller_name_norm);

CREATE INDEX IF NOT EXISTS idx_imports_period ON imports(period_ref);

CREATE INDEX IF NOT EXISTS idx_seller_reports_import ON seller_reports(import_id);
CREATE INDEX IF NOT EXISTS idx_seller_reports_norm ON seller_reports(seller_name_norm);
CREATE INDEX IF NOT EXISTS idx_seller_sales_report ON seller_sales(seller_report_id);
CREATE INDEX IF NOT EXISTS idx_seller_sales_os ON seller_sales(os);

CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_import ON dispatch_jobs(import_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_job ON dispatch_items(job_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_items_status ON dispatch_items(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_scope ON audit_logs(scope);
CREATE INDEX IF NOT EXISTS idx_audit_logs_level ON audit_logs(level);
