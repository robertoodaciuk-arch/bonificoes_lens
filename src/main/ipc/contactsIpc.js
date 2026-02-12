const { ContactService } = require('../services/ContactService');
const { ContactImportService } = require('../services/contacts/ContactImportService');
const { dialog } = require('electron');
const logger = require('../utils/logger');

function registerContactsIpc(ipcMain) {
  const svc = new ContactService();
  const importSvc = new ContactImportService();

  ipcMain.handle('contacts:getAll', async () => {
    logger.info('IPC: contacts:getAll');
    try {
      return { ok: true, data: svc.getAll() };
    } catch (err) {
      logger.error('contacts:getAll failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:create', async (_, data) => {
    logger.info('IPC: contacts:create', data);
    try {
      const res = svc.create(data);
      return { ok: true, data: res };
    } catch (err) {
      logger.error('contacts:create failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:update', async (_, { id, data }) => {
    logger.info('IPC: contacts:update', id);
    try {
      const res = svc.update(id, data);
      return { ok: true, data: res };
    } catch (err) {
      logger.error('contacts:update failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:delete', async (_, id) => {
    logger.info('IPC: contacts:delete', id);
    try {
      const res = svc.delete(id);
      return { ok: true, data: res };
    } catch (err) {
      logger.error('contacts:delete failed', err);
      return { ok: false, error: err.message };
    }
  });
  
  ipcMain.handle('contacts:findMatch', async (_, sellerName) => {
    try {
      const match = svc.findMatch(sellerName);
      return { ok: true, data: match };
    } catch (err) {
      logger.error('contacts:findMatch failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:pickImportFile', async () => {
    logger.info('[IPC] contacts:pickImportFile called');
    try {
      const res = await dialog.showOpenDialog({
        title: 'Selecionar planilha de contatos',
        properties: ['openFile'],
        filters: [
          { name: 'Planilhas e CSV', extensions: ['xlsx', 'csv'] },
        ],
      });

      if (res.canceled || !res.filePaths?.length) {
        return { ok: true, data: { canceled: true } };
      }

      return { ok: true, data: { canceled: false, filePath: res.filePaths[0] } };
    } catch (err) {
      logger.error('[IPC] contacts:pickImportFile failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:importPreview', async (_, payload) => {
    try {
      const result = importSvc.preview(payload || {});
      return { ok: true, data: result };
    } catch (err) {
      logger.error('[IPC] contacts:importPreview failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:importCommit', async (_, payload) => {
    try {
      const result = importSvc.commit(payload || {});
      return { ok: true, data: result };
    } catch (err) {
      logger.error('[IPC] contacts:importCommit failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:getUnmatchedReports', async (_, importId) => {
    try {
      const rows = svc.getUnmatchedSellers(importId);
      return { ok: true, data: rows };
    } catch (err) {
      logger.error('contacts:getUnmatchedReports failed', err);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('contacts:linkReport', async (_, { reportId, contactId }) => {
    try {
      const res = svc.linkContactToReport(reportId, contactId);
      return { ok: true, data: res };
    } catch (err) {
      logger.error('contacts:linkReport failed', err);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerContactsIpc };
