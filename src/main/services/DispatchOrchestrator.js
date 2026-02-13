const fs = require('fs');
const { getDb } = require('../database/connection');
const { newId } = require('../utils/ids');
const logger = require('../utils/logger');
const { ReportGeneratorService } = require('./reports/ReportGeneratorService');
// Tente importar o WhatsAppManager, se falhar use mock para não quebrar o build se o arquivo não existir
let whatsappManager;
try {
  whatsappManager = require('./WhatsAppManager');
} catch (e) {
  logger.warn('WhatsAppManager not found or failed to load. Using mock.', e);
  whatsappManager = {
    sendText: async () => ({ messageId: 'mock-' + Date.now(), status: 'SENT' }),
    sendMedia: async () => ({ messageId: 'mock-' + Date.now(), status: 'SENT' })
  };
}

class DispatchOrchestrator {
  constructor() {
    this.activeJobId = null;
    this.status = 'IDLE'; // IDLE, RUNNING, PAUSED, COMPLETED, ERROR, STOPPED
    this.config = {
      minDelay: 5000,
      maxDelay: 15000,
      retryLimit: 3,
      output: { pdf: true, png: false },
      messageTemplate: '{Oi|Olá|Oii|Oi, tudo bem?} {vendedor}, {segue seu relatório de bonificações|aqui está o relatório de bonificações|te envio o relatório de bonificações} do período {periodo}.',
    };
    this.timeoutId = null;
    this.running = false;
  }

  getDb() {
    return getDb();
  }

  normalizeConfig(config = {}) {
    const output = config.output || {};
    const normalized = {
      minDelay: Number(config.minDelay || 5000),
      maxDelay: Number(config.maxDelay || 15000),
      retryLimit: Number(config.retryLimit || 3),
      mode: config.mode || 'whatsapp',
      channels: config.channels || ['whatsapp'],
      output: {
        pdf: !!output.pdf,
        png: !!output.png,
      },
      messageTemplate: String(config.messageTemplate || '').trim() ||
        '{Oi|Olá|Oii|Oi, tudo bem?} {vendedor}, {segue seu relatório de bonificações|aqui está o relatório de bonificações|te envio o relatório de bonificações} do período {periodo}.',
    };

    if (!normalized.output.pdf && !normalized.output.png) {
      normalized.output.pdf = true;
    }

    return normalized;
  }

  async createJob(importId, config = {}) {
    const db = this.getDb();
    const jobId = newId();
    
    const jobConfig = this.normalizeConfig({
      minDelay: 5000,
      maxDelay: 15000,
      retryLimit: 3,
      output: { pdf: true, png: false },
      messageTemplate: '{Oi|Olá|Oii|Oi, tudo bem?} {vendedor}, {segue seu relatório de bonificações|aqui está o relatório de bonificações|te envio o relatório de bonificações} do período {periodo}.',
      ...config
    });

    try {
      db.prepare('BEGIN').run();

      // Create Job
      db.prepare(`
        INSERT INTO dispatch_jobs (id, import_id, mode, status, channels_json, config_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        jobId,
        importId,
        jobConfig.mode || 'whatsapp',
        'PENDING',
        JSON.stringify(jobConfig.channels || ['whatsapp']),
        JSON.stringify(jobConfig)
      );

      // Create Dispatch Items from all seller reports.
      // Unmatched/invalid contacts will surface as FAILED (MISSING_PHONE) in dashboard.
      const reports = db.prepare(`
        SELECT id, matched_contact_id 
        FROM seller_reports 
        WHERE import_id = ?
      `).all(importId);

      const insertItem = db.prepare(`
        INSERT INTO dispatch_items (id, job_id, seller_report_id, status, output_json)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const report of reports) {
        insertItem.run(
          newId(),
          jobId,
          report.id,
          'PENDING',
          JSON.stringify({ sent: {} })
        );
      }

      db.prepare('COMMIT').run();
      logger.info(`Job created: ${jobId} with ${reports.length} items`);
      
      return { jobId, count: reports.length };
    } catch (error) {
      if (db.inTransaction) db.prepare('ROLLBACK').run();
      logger.error('Failed to create job', error);
      throw error;
    }
  }

  async startJob(jobId) {
    if (this.status === 'RUNNING') {
      throw new Error('A job is already running');
    }

    const db = this.getDb();
    const job = db.prepare('SELECT * FROM dispatch_jobs WHERE id = ?').get(jobId);

    if (!job) {
      throw new Error('Job not found');
    }

    this.activeJobId = jobId;
    this.config = this.normalizeConfig(JSON.parse(job.config_json));
    this.status = 'RUNNING';
    this.pauseReason = null;
    this.running = true;

    // Update job status
    db.prepare("UPDATE dispatch_jobs SET status = ?, started_at = datetime('now') WHERE id = ?")
      .run('RUNNING', jobId);

    // Reset any stuck PROCESSING items back to RETRY for consistency
    db.prepare("UPDATE dispatch_items SET status = 'RETRY', updated_at = datetime('now') WHERE job_id = ? AND status = 'PROCESSING'")
      .run(jobId);

    logger.info(`Starting job ${jobId}`);
    this.processLoop();
  }

  async pauseJob(reason = null) {
    if (this.status !== 'RUNNING') return;
    
    this.status = 'PAUSED';
    this.pauseReason = reason;
    this.running = false;
    if (this.timeoutId) clearTimeout(this.timeoutId);
    
    const db = this.getDb();
    if (this.activeJobId) {
      db.prepare('UPDATE dispatch_jobs SET status = ? WHERE id = ?')
        .run('PAUSED', this.activeJobId);
    }
    logger.info(`Job ${this.activeJobId} paused${reason ? ': ' + reason : ''}`);
  }

  async resumeJob(jobId) {
    if (this.status === 'RUNNING') return;
    
    // If no jobId provided, try to resume active job or find last paused job
    let targetJobId = jobId || this.activeJobId;
    
    if (!targetJobId) {
       const lastPaused = this.getDb().prepare("SELECT id FROM dispatch_jobs WHERE status = 'PAUSED' ORDER BY updated_at DESC LIMIT 1").get();
       if (lastPaused) targetJobId = lastPaused.id;
    }

    if (!targetJobId) throw new Error('No job specified to resume');

    this.pauseReason = null;
    return this.startJob(targetJobId);
  }

  async stopJob() {
    this.status = 'STOPPED';
    this.running = false;
    if (this.timeoutId) clearTimeout(this.timeoutId);

    const db = this.getDb();
    if (this.activeJobId) {
      db.prepare("UPDATE dispatch_jobs SET status = ?, finished_at = datetime('now') WHERE id = ?")
        .run('STOPPED', this.activeJobId);
    }
    this.activeJobId = null;
  }

  async retryFailed(jobId) {
    const targetJobId = jobId || this.activeJobId;
    if (!targetJobId) throw new Error('No job specified');

    const db = this.getDb();
    const res = db.prepare(`
      UPDATE dispatch_items
      SET status = 'RETRY', updated_at = datetime('now')
      WHERE job_id = ? AND status = 'FAILED'
    `).run(targetJobId);

    logger.info('retryFailed: moved FAILED -> RETRY', { jobId: targetJobId, changes: res.changes });
    return { ok: true, changes: res.changes };
  }

  async processLoop() {
    if (!this.running || !this.activeJobId) return;

    // Check WhatsApp connection before processing
    if (whatsappManager.getStatus && !whatsappManager.getStatus().isConnected) {
      logger.warn('WhatsApp disconnected. Pausing job to prevent failures.');
      await this.pauseJob('WhatsApp disconnected');
      return;
    }

    try {
      const db = this.getDb();
      
      // Get next pending item
      // Prioritize RETRY items, then PENDING
      const item = db.prepare(`
        SELECT i.*, r.matched_contact_id, r.seller_name_norm, c.phone_e164, c.display_name, im.period_ref,
               (SELECT file_path FROM report_artifacts WHERE seller_report_id = i.seller_report_id AND kind = 'PDF' LIMIT 1) as pdf_path,
               (SELECT file_path FROM report_artifacts WHERE seller_report_id = i.seller_report_id AND kind = 'PNG' LIMIT 1) as png_path
        FROM dispatch_items i
        JOIN seller_reports r ON i.seller_report_id = r.id
        JOIN imports im ON im.id = r.import_id
        LEFT JOIN contacts c ON r.matched_contact_id = c.id
        WHERE i.job_id = ? AND (i.status = 'PENDING' OR i.status = 'RETRY')
        ORDER BY CASE WHEN i.status = 'RETRY' THEN 0 ELSE 1 END, i.priority DESC, i.created_at ASC
        LIMIT 1
      `).get(this.activeJobId);

      if (!item) {
        logger.info('No more items to process. Job completed.');
        this.status = 'COMPLETED';
        this.running = false;
        db.prepare("UPDATE dispatch_jobs SET status = ?, finished_at = datetime('now') WHERE id = ?")
          .run('COMPLETED', this.activeJobId);
        this.activeJobId = null;
        return;
      }

      await this.processItem(item);

      // Checkpoint
      this.createCheckpoint(item.id);

      // Anti-ban delay
      const delay = this.getRandomDelay();
      logger.info(`Waiting ${delay}ms before next item`);
      
      this.timeoutId = setTimeout(() => this.processLoop(), delay);

    } catch (error) {
      logger.error('Error in process loop', error);
      // Wait a bit before retrying loop to avoid tight error loops
      this.timeoutId = setTimeout(() => this.processLoop(), 5000);
    }
  }

  async processItem(item) {
    const db = this.getDb();
    const attemptId = newId();

    // Validation: Check for missing phone number
    if (!item.phone_e164) {
      logger.warn(`Item ${item.id} skipped: Missing phone number for contact ${item.display_name}`);

      // Update item status to FAILED
      db.prepare(`
        UPDATE dispatch_items 
        SET status = ?, last_error_code = ?, last_error_message = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run('FAILED', 'MISSING_PHONE', 'Contact phone number is missing', item.id);

      // Record failed attempt
      db.prepare(`
        INSERT INTO dispatch_attempts (id, job_id, dispatch_item_id, channel, target, status, error_code, error_message, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(attemptId, this.activeJobId, item.id, 'whatsapp', 'MISSING', 'FAILED', 'MISSING_PHONE', 'Contact phone number is missing');

      return;
    }

    try {
      // Mark as PROCESSING
      db.prepare('UPDATE dispatch_items SET status = ? WHERE id = ?').run('PROCESSING', item.id);

      logger.info(`Processing item ${item.id} for contact ${item.display_name} (${item.phone_e164})`);

      // Record start of attempt
      db.prepare(`
        INSERT INTO dispatch_attempts (id, job_id, dispatch_item_id, channel, target, status, started_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(attemptId, this.activeJobId, item.id, 'whatsapp', item.phone_e164, 'PROCESSING');

      const outputState = this.safeParseJson(item.output_json, { sent: {} });
      outputState.sent = outputState.sent || {};

      const wantsPdf = !!this.config?.output?.pdf;
      const wantsPng = !!this.config?.output?.png;

      let pdfPath = item.pdf_path;
      let pngPath = item.png_path;

      const missingPdf = wantsPdf && (!pdfPath || !fs.existsSync(pdfPath));
      const missingPng = wantsPng && (!pngPath || !fs.existsSync(pngPath));

      if (missingPdf || missingPng) {
        const reportSvc = new ReportGeneratorService();
        const generated = await reportSvc.generate({
          sellerReportId: item.seller_report_id,
          output: {
            pdf: missingPdf || (wantsPdf && !pdfPath),
            png: missingPng || (wantsPng && !pngPath),
          },
        });
        pdfPath = generated?.artifacts?.pdfPath || pdfPath;
        pngPath = generated?.artifacts?.pngPath || pngPath;
      }

      const vendedor = item.display_name || item.seller_name_norm || 'vendedor';
      const periodo = item.period_ref || '';
      const template = this.config?.messageTemplate || '';
      const messageText = this.renderTemplate(template, { vendedor, periodo }) || this.buildMessage({ sellerName: vendedor });

      const sendQueue = [];
      if (wantsPng && !outputState.sent.png) {
        if (!pngPath || !fs.existsSync(pngPath)) {
          throw new Error('PNG não encontrado para envio');
        }
        sendQueue.push({ kind: 'PNG', path: pngPath, type: 'image' });
      }
      if (wantsPdf && !outputState.sent.pdf) {
        if (!pdfPath || !fs.existsSync(pdfPath)) {
          throw new Error('PDF não encontrado para envio');
        }
        sendQueue.push({ kind: 'PDF', path: pdfPath, type: 'document' });
      }

      let first = true;
      for (const media of sendQueue) {
        const caption = first ? messageText : '';
        await this.withTimeout(
          whatsappManager.sendMedia(item.phone_e164, caption, media.path, media.type),
          45000,
          `Envio ${media.kind}`
        );
        if (media.kind === 'PNG') outputState.sent.png = true;
        if (media.kind === 'PDF') outputState.sent.pdf = true;
        this.updateItemOutput(item.id, outputState);
        first = false;
      }

      if (sendQueue.length === 0 && !wantsPdf && !wantsPng) {
        await this.withTimeout(
          whatsappManager.sendText(item.phone_e164, messageText),
          30000,
          'Envio de mensagem de texto'
        );
      }

      // Success
      db.prepare("UPDATE dispatch_items SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .run('SENT', item.id);

      const artifactKind = sendQueue.length === 0 ? null : sendQueue.map(s => s.kind).join('+');
      const artifactPath = sendQueue.length === 0 ? null : sendQueue[0].path;

      db.prepare(`
        UPDATE dispatch_attempts 
        SET status = ?, finished_at = datetime('now'), message_text = ?, artifact_kind = ?, artifact_path = ?
        WHERE id = ?
      `).run('SENT', messageText, artifactKind, artifactPath, attemptId);

    } catch (error) {
      logger.error(`Failed to process item ${item.id}`, { message: error?.message, stack: error?.stack });

      // Determine if should retry
      const retryCount = item.attempt_count + 1;
      const shouldRetry = retryCount <= (this.config.retryLimit || 3);
      const newStatus = shouldRetry ? 'RETRY' : 'FAILED';

      db.prepare(`
        UPDATE dispatch_items 
        SET status = ?, attempt_count = ?, last_error_code = ?, last_error_message = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, retryCount, 'ERROR', error.message, item.id);

      db.prepare(`
        UPDATE dispatch_attempts 
        SET status = ?, error_message = ?, finished_at = datetime('now')
        WHERE id = ?
      `).run('FAILED', error.message, attemptId);
    }
  }

  createCheckpoint(cursor) {
    const db = this.getDb();
    try {
      db.prepare(`
        INSERT INTO checkpoints (id, job_id, cursor, state_json)
        VALUES (?, ?, ?, ?)
      `).run(newId(), this.activeJobId, cursor, JSON.stringify({ status: this.status, timestamp: Date.now() }));
    } catch (err) {
      logger.error('Failed to create checkpoint', err);
    }
  }

  withTimeout(promise, timeoutMs, label = 'Operação') {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} excedeu o limite de ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
  }

  safeParseJson(value, fallback = {}) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  renderTemplate(template, variables = {}) {
    if (!template) return '';
    return String(template).replace(/\{(\w+)\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(variables, key)) {
        return String(variables[key] ?? '');
      }
      return match;
    });
  }

  updateItemOutput(itemId, outputState) {
    const db = this.getDb();
    db.prepare('UPDATE dispatch_items SET output_json = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(JSON.stringify(outputState || {}), itemId);
  }

  buildMessage({ sellerName } = {}) {
    const name = sellerName || 'tudo bem?';

    const greetings = [
      `Oi ${name}!`,
      `Olá ${name}!`,
      `Boa tarde ${name}!`,
      `Bom dia ${name}!`,
    ];

    const bodies = [
      'Segue seu relatório de bonificações.',
      'Seu relatório de bonificações já está pronto — segue aqui.',
      'Conforme combinado, estou te enviando o relatório de bonificações.',
      'Enviei aqui o seu relatório de bonificações do período.',
    ];

    const closings = [
      'Qualquer dúvida, me chama.',
      'Se precisar de algo, estou à disposição.',
      'Quando puder, confirma o recebimento.',
      'Se quiser, depois te mando um resumo também.',
    ];

    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Variation knobs: punctuation + line breaks
    const punctuation = pick(['.', '!', '…']);
    const sep = pick(['\n', '\n\n', ' — ']);

    return `${pick(greetings)}${sep}${pick(bodies)}${punctuation}${pick(['\n', '\n\n'])}${pick(closings)}`;
  }

  getRandomDelay() {
    const min = this.config.minDelay || 5000;
    const max = this.config.maxDelay || 15000;
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  getStatus() {
    const summary = this.activeJobId ? this.getJobSummary(this.activeJobId) : null;

    return {
      activeJobId: this.activeJobId,
      status: this.status,
      running: this.running,
      pauseReason: this.pauseReason || null,
      summary,
    };
  }

  getJobSummary(jobId) {
    const db = this.getDb();

    const rows = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM dispatch_items
      WHERE job_id = ?
      GROUP BY status
    `).all(jobId);

    const counts = {
      PENDING: 0,
      PROCESSING: 0,
      RETRY: 0,
      SENT: 0,
      FAILED: 0,
      SKIPPED: 0,
    };

    for (const r of rows) {
      counts[r.status] = Number(r.count || 0);
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const done = counts.SENT + counts.FAILED + counts.SKIPPED;

    return {
      jobId,
      total,
      done,
      counts,
    };
  }

  getJobs() {
    const db = this.getDb();
    return db.prepare('SELECT * FROM dispatch_jobs ORDER BY created_at DESC LIMIT 50').all();
  }

  getDashboard(jobId) {
    const db = this.getDb();
    if (!jobId) {
      const last = db.prepare('SELECT id FROM dispatch_jobs ORDER BY created_at DESC LIMIT 1').get();
      jobId = last?.id;
    }
    if (!jobId) {
      return {
        jobId: null,
        summary: { total: 0, sent: 0, failed: 0, pending: 0, processing: 0, retry: 0, skipped: 0 },
        items: [],
      };
    }

    const items = db.prepare(`
      SELECT
        di.id,
        di.status,
        di.last_error_code,
        di.last_error_message,
        di.attempt_count,
        sr.seller_name_raw,
        c.display_name,
        c.phone_e164,
        da.status as last_attempt_status,
        da.error_message as last_attempt_error,
        da.finished_at as last_attempt_finished_at
      FROM dispatch_items di
      JOIN seller_reports sr ON sr.id = di.seller_report_id
      LEFT JOIN contacts c ON c.id = sr.matched_contact_id
      LEFT JOIN dispatch_attempts da ON da.id = (
        SELECT id
        FROM dispatch_attempts x
        WHERE x.dispatch_item_id = di.id
        ORDER BY x.started_at DESC
        LIMIT 1
      )
      WHERE di.job_id = ?
      ORDER BY
        CASE di.status
          WHEN 'FAILED' THEN 0
          WHEN 'RETRY' THEN 1
          WHEN 'PENDING' THEN 2
          WHEN 'PROCESSING' THEN 3
          WHEN 'SKIPPED' THEN 4
          ELSE 5
        END,
        sr.seller_name_raw ASC
    `).all(jobId);

    const summary = {
      total: items.length,
      sent: 0,
      failed: 0,
      pending: 0,
      processing: 0,
      retry: 0,
      skipped: 0,
    };

    for (const item of items) {
      const status = String(item.status || '').toUpperCase();
      if (status === 'SENT') summary.sent++;
      else if (status === 'FAILED') summary.failed++;
      else if (status === 'PENDING') summary.pending++;
      else if (status === 'PROCESSING') summary.processing++;
      else if (status === 'RETRY') summary.retry++;
      else if (status === 'SKIPPED') summary.skipped++;
    }

    return { jobId, summary, items };
  }
}

module.exports = new DispatchOrchestrator();
