const fs = require('fs');
const path = require('path');

function ensureSchemaVersionTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    );
  `);
  const row = db.prepare('SELECT COUNT(1) as c FROM schema_version').get();
  if (!row || row.c === 0) {
    db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  }
}

function getCurrentVersion(db) {
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
  return row?.v ?? 0;
}

function setVersion(db, version) {
  db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
}

function parseMigrationVersion(filename) {
  const m = filename.match(/^(\d+)_/);
  if (!m) return null;
  return Number(m[1]);
}

function runMigrations(db, migrationsDir) {
  ensureSchemaVersionTable(db);
  const current = getCurrentVersion(db);

  const files = fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => ({ file: f, v: parseMigrationVersion(f) }))
    .filter(x => Number.isFinite(x.v))
    .sort((a, b) => a.v - b.v);

  for (const { file, v } of files) {
    if (v <= current) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      setVersion(db, v);
    })();
  }
}

module.exports = {
  runMigrations,
};
