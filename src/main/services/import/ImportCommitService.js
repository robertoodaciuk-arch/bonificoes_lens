const path = require('path');
const fs = require('fs');
const { getDb } = require('../../database/connection');
const { newId } = require('../../utils/ids');
const { normalizeText } = require('../../utils/normalize');
const { parseMoneyToCentsBr } = require('../../utils/money');
const { parseDateBrToIso } = require('../../utils/dates');
const { SpreadsheetParserService } = require('./SpreadsheetParserService');
const { ValidationError } = require('../../utils/errors');

function isNanLike(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number' && Number.isNaN(v)) return true;
  const s = String(v).trim();
  return !s || s.toUpperCase() === 'NAN';
}

class ImportCommitService {
  constructor() {
    this.parser = new SpreadsheetParserService();
  }

  commit({ filePath, periodRef, options = {} }) {
    if (!periodRef) throw new ValidationError('periodRef é obrigatório (ex: 2026-01)');
    if (!filePath) throw new ValidationError('filePath é obrigatório');
    if (!fs.existsSync(filePath)) throw new ValidationError('Arquivo não encontrado', { filePath });

    const parsed = this.parser.parse({
      filePath,
      sheetName: options.sheetName,
      headerRow: Number.isFinite(options.headerRow) ? options.headerRow : undefined,
    });

    if (parsed.missingRequired.length) {
      throw new ValidationError(`Colunas obrigatórias ausentes: ${parsed.missingRequired.join(', ')}`);
    }

    const db = getDb();

    const fileStat = fs.statSync(filePath);

    const importId = newId();
    const insertImport = db.prepare(`
      INSERT INTO imports (id, file_name, file_path, file_size, file_mtime_ms, period_ref, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSellerReport = db.prepare(`
      INSERT INTO seller_reports (
        id, import_id, seller_name_raw, seller_name_norm,
        matched_contact_id,
        rows_count, sales_total_cents, commission_total_cents, ticket_avg_cents, tx_count,
        anomalies_json
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
    `);

    const insertSale = db.prepare(`
      INSERT INTO seller_sales (
        id, seller_report_id,
        vendor_name_raw, store, client_name, os,
        sale_date, sale_value_cents, commission_cents,
        row_index
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seenOs = new Set();

    const bySeller = new Map();

    let lastSellerRaw = '';
    let lastSellerNorm = '';

    let totalsRowsIgnored = 0;

    for (const row of parsed.rows) {
      const rowIndex = row.__rowIndex;
      const sellerRawCell = row['VENDEDOR'];

      let sellerRaw;
      let sellerNorm;

      if (isNanLike(sellerRawCell)) {
        sellerRaw = lastSellerRaw;
        sellerNorm = lastSellerNorm;
      } else {
        sellerRaw = String(sellerRawCell ?? '').trim();
        sellerNorm = normalizeText(sellerRawCell);
        lastSellerRaw = sellerRaw;
        lastSellerNorm = sellerNorm;
      }

      if (!sellerNorm) {
        // skip but track anomaly later (future)
        continue;
      }

      if (sellerNorm === 'TOTAL') {
        totalsRowsIgnored++;
        continue;
      }

      const os = row['OS'] === '' ? null : String(row['OS']).trim();
      if (os) {
        if (seenOs.has(os)) {
          // keep data, but will be anomaly in future
        } else {
          seenOs.add(os);
        }
      }

      const saleValueCents = parseMoneyToCentsBr(row['VENDA']);
      const commissionCents = parseMoneyToCentsBr(row['AC']);

      const saleDateIso = parseDateBrToIso(row['DATA VENDA']);

      const info = bySeller.get(sellerNorm) || {
        sellerNameRaw: sellerRaw,
        sellerNameNorm: sellerNorm,
        rows: [],
      };

      info.rows.push({
        vendor_name_raw: sellerRaw,
        store: row['LOJA'] === '' ? null : String(row['LOJA']).trim(),
        client_name: row['NOME CLIENTE'] === '' ? null : String(row['NOME CLIENTE']).trim(),
        os,
        sale_date: saleDateIso,
        sale_value_cents: saleValueCents,
        commission_cents: commissionCents,
        row_index: rowIndex,
      });

      bySeller.set(sellerNorm, info);
    }

    const sellerReportIds = [];

    db.transaction(() => {
      insertImport.run(
        importId,
        path.basename(filePath),
        filePath,
        fileStat.size,
        fileStat.mtimeMs,
        periodRef,
        'READY'
      );

      for (const seller of bySeller.values()) {
        const sellerReportId = newId();
        sellerReportIds.push(sellerReportId);

        // Aggregate using cents to avoid float issues
        let salesTotal = 0;
        let commissionTotal = 0;
        let txCount = 0;

        for (const r of seller.rows) {
          if (typeof r.sale_value_cents === 'number') salesTotal += r.sale_value_cents;
          if (typeof r.commission_cents === 'number') commissionTotal += r.commission_cents;
          txCount++;
        }

        const ticketAvg = txCount ? Math.round(salesTotal / txCount) : 0;

        // IMPORTANT: insert report first (FK target), then insert sales
        insertSellerReport.run(
          sellerReportId,
          importId,
          seller.sellerNameRaw,
          seller.sellerNameNorm,
          seller.rows.length,
          salesTotal,
          commissionTotal,
          ticketAvg,
          txCount,
          JSON.stringify([])
        );

        for (const r of seller.rows) {
          insertSale.run(
            newId(),
            sellerReportId,
            r.vendor_name_raw,
            r.store,
            r.client_name,
            r.os,
            r.sale_date,
            r.sale_value_cents,
            r.commission_cents,
            r.row_index
          );
        }
      }
    })();

    return {
      importId,
      sellerReportIds,
      stats: {
        sellers: sellerReportIds.length,
        rows: parsed.rows.length - totalsRowsIgnored,
        anomalies: 0,
      },
    };
  }
}

module.exports = { ImportCommitService };
