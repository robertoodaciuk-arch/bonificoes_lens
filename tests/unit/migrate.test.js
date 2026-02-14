const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../src/main/database/migrate');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
}

test('runMigrations aplica todas as migrações sem erro', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const migrationsDir = path.join(__dirname, '../../src/main/database/migrations');
  runMigrations(db, migrationsDir);

  // Verify dispatch_jobs table has updated_at column
  const cols = db.prepare("PRAGMA table_info(dispatch_jobs)").all();
  const updatedAtCol = cols.find(c => c.name === 'updated_at');
  assert.ok(updatedAtCol, 'dispatch_jobs deve ter coluna updated_at');
  assert.equal(updatedAtCol.notnull, 1, 'updated_at deve ser NOT NULL');

  db.close();
  fs.rmSync(tmpDir, { recursive: true });
});

test('migration 003 funciona com dados existentes em dispatch_jobs', () => {
  const tmpDir = createTempDir();
  const dbPath = path.join(tmpDir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run only migrations 001 and 002 first
  const migrationsDir = path.join(__dirname, '../../src/main/database/migrations');

  // Create a temp migrations dir with only 001 and 002
  const partialDir = path.join(tmpDir, 'migrations');
  fs.mkdirSync(partialDir);
  fs.copyFileSync(
    path.join(migrationsDir, '001_init.sql'),
    path.join(partialDir, '001_init.sql')
  );
  fs.copyFileSync(
    path.join(migrationsDir, '002_indexes.sql'),
    path.join(partialDir, '002_indexes.sql')
  );

  runMigrations(db, partialDir);

  // Insert prerequisite import row and a dispatch_jobs row (before migration 003)
  db.prepare(`INSERT INTO imports (id, file_name, file_path, file_size, file_mtime_ms, period_ref, status)
    VALUES ('imp1', 'test.xlsx', '/tmp/test.xlsx', 1024, 0, '2026-01', 'done')`).run();
  db.prepare(`INSERT INTO dispatch_jobs (id, import_id, mode, status, channels_json, config_json)
    VALUES ('job1', 'imp1', 'auto', 'pending', '[]', '{}')`).run();

  // Now copy migration 003 and run it
  fs.copyFileSync(
    path.join(migrationsDir, '003_dispatch_jobs_updated_at.sql'),
    path.join(partialDir, '003_dispatch_jobs_updated_at.sql')
  );

  // This should NOT throw "Cannot add a column with non-constant default"
  runMigrations(db, partialDir);

  // Verify existing row got updated_at populated
  const row = db.prepare("SELECT updated_at FROM dispatch_jobs WHERE id = 'job1'").get();
  assert.ok(row.updated_at, 'updated_at deve ter sido preenchido para linhas existentes');
  assert.notEqual(row.updated_at, '', 'updated_at não deve estar vazio');

  db.close();
  fs.rmSync(tmpDir, { recursive: true });
});
