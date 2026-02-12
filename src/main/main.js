const path = require('path');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { getDb, closeDb } = require('./database/connection');
const { runMigrations } = require('./database/migrate');
const { registerImportIpc } = require('./ipc/importIpc');
const { registerContactsIpc } = require('./ipc/contactsIpc');
const { registerReportsIpc } = require('./ipc/reportsIpc');
const { registerDispatchIpc } = require('./ipc/dispatchIpc');
const { registerWaIpc } = require('./ipc/waIpc');
const logger = require('./utils/logger');

let mainWindow;

function showFatal(err) {
  try {
    dialog.showErrorBox('Falha ao iniciar o app', `${err?.stack || err}`);
  } catch {
    // ignore
  }
}

function createWindow() {
  logger.info('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#0f0f1a',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('render-process-gone', (e, details) => {
    logger.error('Renderer process gone', details);
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    logger.error('did-fail-load', { code, desc, url });
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function bootstrapDatabase() {
  logger.info('Bootstrapping database');
  const db = getDb();
  const migrationsDir = path.join(__dirname, 'database', 'migrations');
  runMigrations(db, migrationsDir);
  logger.info('Database ready');
}

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { message: err?.message, stack: err?.stack });
  showFatal(err);
  app.quit();
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: String(reason) });
});

app.whenReady().then(() => {
  logger.info('App ready', { userData: app.getPath('userData'), logFile: logger.getLogFilePath() });

  bootstrapDatabase();
  registerImportIpc(ipcMain);
  registerContactsIpc(ipcMain);
  registerReportsIpc(ipcMain);
  registerWaIpc(ipcMain);
  registerDispatchIpc(ipcMain);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  logger.error('whenReady failed', { message: err?.message, stack: err?.stack });
  showFatal(err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  closeDb();
});
