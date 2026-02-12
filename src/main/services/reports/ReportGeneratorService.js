const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const { newId } = require('../../utils/ids');
const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { ReportDataService } = require('./ReportDataService');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFilePart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'seller';
}

function waitForReady(jobChannel, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout aguardando renderização do relatório')), timeoutMs);
    const handler = (event, payload) => {
      clearTimeout(t);
      resolve(payload);
    };
    const { ipcMain } = require('electron');
    ipcMain.once(jobChannel, handler);
  });
}

class ReportGeneratorService {
  constructor() {
    this.dataSvc = new ReportDataService();
  }

  async generate({ sellerReportId, output = { pdf: true, png: false } } = {}) {
    if (!sellerReportId) throw new ValidationError('sellerReportId é obrigatório');

    const wantsPdf = !!output.pdf;
    const wantsPng = !!output.png;
    if (!wantsPdf && !wantsPng) throw new ValidationError('output precisa ter pdf e/ou png');

    const data = this.dataSvc.getSellerReportData(sellerReportId);

    const jobId = newId();
    const readyChannel = `report:ready:${jobId}`;

    const outBase = path.join(app.getPath('userData'), 'reports', data.importId);
    ensureDir(outBase);

    const fileBaseName = `${safeFilePart(data.sellerNameNorm)}-${data.periodRef}`;

    const win = new BrowserWindow({
      show: false,
      width: 1240,
      height: 1754,
      backgroundColor: '#0f0f1a',
      webPreferences: {
        preload: path.join(__dirname, '../../printPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    try {
      const printHtml = path.join(__dirname, '../../../renderer/print.html');
      await win.loadFile(printHtml);

      // Send data to print renderer
      win.webContents.send('report:load', { jobId, readyChannel, data });

      await waitForReady(readyChannel, 25000);

      const artifacts = {};

      const db = require('../../database/connection').getDb();
      const upsertArtifact = db.prepare(`
        INSERT INTO report_artifacts (id, seller_report_id, kind, file_path, mime_type, file_size)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const deleteExisting = db.prepare(`
        DELETE FROM report_artifacts WHERE seller_report_id = ? AND kind = ?
      `);

      if (wantsPdf) {
        const pdfBuffer = await win.webContents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          marginsType: 1,
        });

        const pdfPath = path.join(outBase, `${fileBaseName}.pdf`);
        fs.writeFileSync(pdfPath, pdfBuffer);
        artifacts.pdfPath = pdfPath;

        // persist artifact
        deleteExisting.run(sellerReportId, 'PDF');
        const size = fs.statSync(pdfPath).size;
        upsertArtifact.run(newId(), sellerReportId, 'PDF', pdfPath, 'application/pdf', size);
      }

      if (wantsPng) {
        // capture bounding rect of report container
        const rect = await win.webContents.executeJavaScript(`(() => {
          const el = document.getElementById('report');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
        })()`);

        const image = await win.webContents.capturePage(rect || undefined);
        const pngPath = path.join(outBase, `${fileBaseName}.png`);
        fs.writeFileSync(pngPath, image.toPNG());
        artifacts.pngPath = pngPath;

        deleteExisting.run(sellerReportId, 'PNG');
        const size = fs.statSync(pngPath).size;
        upsertArtifact.run(newId(), sellerReportId, 'PNG', pngPath, 'image/png', size);
      }

      return {
        sellerReportId,
        importId: data.importId,
        artifacts,
      };
    } catch (err) {
      logger.error('Report generation failed', { message: err?.message, stack: err?.stack });
      throw err;
    } finally {
      win.destroy();
    }
  }
}

module.exports = { ReportGeneratorService };
