const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { app } = require('electron');

let db;

function getDbPath() {
  const baseDir = app.getPath('userData');
  const dbDir = path.join(baseDir, 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  return path.join(dbDir, 'commissions.sqlite3');
}

function getDb() {
  if (db) return db;

  const dbPath = getDbPath();

  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return db;
  } catch (err) {
    if (err.code === 'ERR_DLOPEN_FAILED' || err.message.includes('NODE_MODULE_VERSION')) {
      throw new Error(
        `Falha ao carregar o módulo nativo do banco de dados.\n\n` +
        `Isso geralmente ocorre quando o módulo foi compilado para uma versão diferente do Node/Electron.\n` +
        `Por favor, execute "npm run rebuild" e tente novamente.\n\n` +
        `Erro original: ${err.message}`
      );
    }
    throw err;
  }
}

function closeDb() {
  if (db) {
    console.log('Closing database connection');
    try {
      db.close();
      db = null;
    } catch (err) {
      console.error('Failed to close database:', err);
    }
  }
}

module.exports = {
  getDb,
  getDbPath,
  closeDb,
};
