const { ipcMain } = require('electron');
const wa = require('../services/WhatsAppManager');
const logger = require('../utils/logger');

function registerWaIpc(ipc) {
  ipc.handle('wa:getStatus', async () => {
    try {
      return wa.getStatus();
    } catch (error) {
      logger.error('wa:getStatus failed', error);
      throw error;
    }
  });

  ipc.handle('wa:getQr', async () => {
    try {
      return wa.getQr();
    } catch (error) {
      logger.error('wa:getQr failed', error);
      throw error;
    }
  });

  ipc.handle('wa:connect', async () => {
    try {
      await wa.connect();
      return true;
    } catch (error) {
      logger.error('wa:connect failed', error);
      throw error;
    }
  });

  ipc.handle('wa:logout', async () => {
    try {
      await wa.logout();
      return true;
    } catch (error) {
      logger.error('wa:logout failed', error);
      throw error;
    }
  });

  ipc.handle('wa:sendText', async (_, { to, text }) => {
    try {
      return await wa.sendText(to, text);
    } catch (error) {
      logger.error('wa:sendText failed', error);
      throw error;
    }
  });

  ipc.handle('wa:sendMedia', async (_, { to, caption, mediaPath, mediaType }) => {
    try {
      return await wa.sendMedia(to, caption, mediaPath, mediaType);
    } catch (error) {
      logger.error('wa:sendMedia failed', error);
      throw error;
    }
  });
}

module.exports = { registerWaIpc };
