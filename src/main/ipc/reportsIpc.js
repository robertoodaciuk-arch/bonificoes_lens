const logger = require('../utils/logger');
const { ReportGeneratorService } = require('../services/reports/ReportGeneratorService');

function registerReportsIpc(ipcMain) {
  const svc = new ReportGeneratorService();

  ipcMain.handle('reports:generate', async (event, payload) => {
    logger.info('[IPC] reports:generate called', { sellerReportId: payload?.sellerReportId, output: payload?.output });
    try {
      const res = await svc.generate(payload || {});
      return { ok: true, data: res };
    } catch (err) {
      logger.error('[IPC] reports:generate failed', { message: err?.message, stack: err?.stack });
      return {
        ok: false,
        error: {
          code: err.code || 'REPORTS_GENERATE_FAILED',
          message: err.message || 'Falha ao gerar relatório',
          details: err.details,
        },
      };
    }
  });
}

module.exports = { registerReportsIpc };
