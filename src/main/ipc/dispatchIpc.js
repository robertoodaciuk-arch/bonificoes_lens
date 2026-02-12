const DispatchOrchestrator = require('../services/DispatchOrchestrator');
const logger = require('../utils/logger');

function registerDispatchIpc(ipcMain) {
  ipcMain.handle('dispatch:create-job', async (event, importId, config) => {
    try {
      logger.info('IPC dispatch:create-job', { importId });
      return await DispatchOrchestrator.createJob(importId, config);
    } catch (error) {
      logger.error('IPC dispatch:create-job error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:start', async (event, jobId) => {
    try {
      logger.info('IPC dispatch:start', { jobId });
      await DispatchOrchestrator.startJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error('IPC dispatch:start error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:pause', async (event) => {
    try {
      logger.info('IPC dispatch:pause');
      await DispatchOrchestrator.pauseJob();
      return { success: true };
    } catch (error) {
      logger.error('IPC dispatch:pause error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:resume', async (event, jobId) => {
    try {
      logger.info('IPC dispatch:resume', { jobId });
      await DispatchOrchestrator.resumeJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error('IPC dispatch:resume error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:stop', async (event) => {
    try {
      logger.info('IPC dispatch:stop');
      await DispatchOrchestrator.stopJob();
      return { success: true };
    } catch (error) {
      logger.error('IPC dispatch:stop error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:get-status', async (event) => {
    try {
      return DispatchOrchestrator.getStatus();
    } catch (error) {
      logger.error('IPC dispatch:get-status error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:get-jobs', async (event) => {
    try {
      return DispatchOrchestrator.getJobs();
    } catch (error) {
      logger.error('IPC dispatch:get-jobs error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:retry-failed', async (event, jobId) => {
    try {
      logger.info('IPC dispatch:retry-failed', { jobId });
      return await DispatchOrchestrator.retryFailed(jobId);
    } catch (error) {
      logger.error('IPC dispatch:retry-failed error', error);
      throw error;
    }
  });

  ipcMain.handle('dispatch:get-dashboard', async (event, jobId) => {
    try {
      return DispatchOrchestrator.getDashboard(jobId);
    } catch (error) {
      logger.error('IPC dispatch:get-dashboard error', error);
      throw error;
    }
  });
}

module.exports = { registerDispatchIpc };
