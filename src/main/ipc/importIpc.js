const { dialog } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const logger = require('../utils/logger');

// Serviço de commit mantido (banco de dados)
const { ImportCommitService } = require('../services/import/ImportCommitService');

function runImportWorker(filePath) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, '../workers/importWorker.js');
    const worker = new Worker(workerPath);

    // TIMEOUT DE SEGURANÇA: 45 segundos
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('TIMEOUT: O processamento do arquivo excedeu 45 segundos e foi abortado.'));
    }, 45000);

    worker.postMessage({ type: 'PARSE', filePath });

    worker.on('message', (msg) => {
      clearTimeout(timeout);
      if (msg.type === 'SUCCESS') {
        resolve(msg.data);
      } else {
        reject(new Error(msg.error?.message || 'Erro desconhecido no processamento do Excel.'));
      }
      worker.terminate();
    });

    worker.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Falha crítica no Worker: ${err.message}`));
      worker.terminate();
    });

    worker.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`O processo de leitura parou inesperadamente (Código ${code}).`));
    });
  });
}

function registerImportIpc(ipcMain) {
  const commitSvc = new ImportCommitService();

  ipcMain.handle('import:pickFile', async () => {
    logger.info('[IPC] import:pickFile called');
    try {
      const res = await dialog.showOpenDialog({
        title: 'Selecionar planilha de bonificações',
        properties: ['openFile'],
        filters: [{ name: 'Planilhas Excel', extensions: ['xlsx'] }],
      });
      
      if (res.canceled || !res.filePaths?.length) {
        return { ok: true, data: { canceled: true } };
      }

      // IMEDIATAMENTE Disparar o Worker para validar o arquivo
      // Isso garante que se o arquivo for "mortal", morre no worker, não aqui.
      logger.info('Spawnando worker para pré-validar arquivo...');
      try {
        const previewData = await runImportWorker(res.filePaths[0]);
        logger.info('Worker sucesso:', { rows: previewData.rows.length });
        
        // Retornamos o caminho E os dados já processados
        return { 
          ok: true, 
          data: { 
            canceled: false, 
            filePath: res.filePaths[0],
            preloadedPreview: previewData // Envia junto para o front não precisar pedir de novo
          } 
        };
      } catch (workerErr) {
        logger.error('Worker falhou:', workerErr);
        return {
          ok: false,
          error: {
            message: 'O arquivo parece corrompido ou inválido (Worker Crash).',
            details: workerErr.message
          }
        };
      }

    } catch (err) {
      logger.error('[IPC] import:pickFile failed', err);
      return { ok: false, error: { message: err.message } };
    }
  });

  // Mantido para compatibilidade, mas agora pode usar o cache do worker se quiser
  ipcMain.handle('import:preview', async (event, payload) => {
    // Se o frontend mandar o 'preloadedPreview' de volta, usamos ele direto
    if (payload.preloadedPreview) {
      return { ok: true, data: payload.preloadedPreview };
    }
    
    // Fallback: roda worker de novo
    try {
      const data = await runImportWorker(payload.filePath);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: { message: err.message } };
    }
  });

  ipcMain.handle('import:commit', async (event, payload) => {
    try {
      const result = commitSvc.commit(payload || {});
      return { ok: true, data: result };
    } catch (err) {
      logger.error('[IPC] import:commit failed', err);
      return { ok: false, error: { message: err.message } };
    }
  });
}

module.exports = {
  registerImportIpc,
};
