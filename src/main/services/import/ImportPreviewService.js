const { SpreadsheetParserService } = require('./SpreadsheetParserService');
const { normalizeText } = require('../../utils/normalize');
const { parseMoneyToCentsBr } = require('../../utils/money');

function isNanLike(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number' && Number.isNaN(v)) return true;
  const s = String(v).trim();
  return !s || s.toUpperCase() === 'NAN';
}

function keyFromOs(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

class ImportPreviewService {
  constructor() {
    this.parser = new SpreadsheetParserService();
  }

  preview({ filePath, options = {} }) {
    const previewRowsLimit = Math.max(1, Math.min(Number(options.previewRows ?? 50), 200));

    const parsed = this.parser.parse({
      filePath,
      sheetName: options.sheetName,
      headerRow: Number.isFinite(options.headerRow) ? options.headerRow : undefined,
    });

    const anomalies = [];

    if (parsed.missingRequired.length) {
      anomalies.push({
        type: 'MISSING_REQUIRED_COLUMN',
        severity: 'error',
        message: `Colunas obrigatórias ausentes: ${parsed.missingRequired.join(', ')}`,
      });
    }

    const seenOs = new Map(); // os -> rowIndex first
    const sellerCounts = new Map(); // sellerNorm -> { raw, count }

    let lastSellerRaw = '';
    let lastSellerNorm = '';
    let totalsRowsIgnored = 0;
    let nanSellerRowsLinked = 0;

    for (const row of parsed.rows) {
      const rowIndex = row.__rowIndex;
      const sellerRaw = row['VENDEDOR'];

      let effectiveSellerRaw = sellerRaw;
      let effectiveSellerNorm = normalizeText(sellerRaw);

      if (isNanLike(sellerRaw)) {
        // continuation
        effectiveSellerRaw = lastSellerRaw;
        effectiveSellerNorm = lastSellerNorm;
        nanSellerRowsLinked++;
      } else {
        lastSellerRaw = String(sellerRaw).trim();
        lastSellerNorm = effectiveSellerNorm;
      }

      if (!effectiveSellerNorm) {
        anomalies.push({
          type: 'MISSING_SELLER',
          severity: 'warn',
          message: 'Linha sem vendedor (não foi possível herdar do anterior)',
          rowIndex,
        });
        continue;
      }

      if (effectiveSellerNorm === 'TOTAL') {
        totalsRowsIgnored++;
        continue;
      }

      const osKey = keyFromOs(row['OS']);
      if (osKey) {
        if (seenOs.has(osKey)) {
          anomalies.push({
            type: 'DUPLICATE_OS',
            severity: 'warn',
            message: `OS duplicada: ${osKey}`,
            rowIndex,
            os: osKey,
            seller: effectiveSellerRaw,
          });
        } else {
          seenOs.set(osKey, rowIndex);
        }
      }

      // Validate money fields lightly
      const saleCents = parseMoneyToCentsBr(row['VENDA']);
      const commissionCents = parseMoneyToCentsBr(row['AC']);
      if (row['VENDA'] !== '' && saleCents === null) {
        anomalies.push({
          type: 'INVALID_VALUE',
          severity: 'warn',
          message: `Valor de VENDA inválido: ${row['VENDA']}`,
          rowIndex,
          seller: effectiveSellerRaw,
        });
      }
      if (row['AC'] !== '' && commissionCents === null) {
        anomalies.push({
          type: 'INVALID_VALUE',
          severity: 'warn',
          message: `Valor de AC inválido: ${row['AC']}`,
          rowIndex,
          seller: effectiveSellerRaw,
        });
      }

      const info = sellerCounts.get(effectiveSellerNorm) || { raw: effectiveSellerRaw, count: 0 };
      info.count++;
      if (!info.raw) info.raw = effectiveSellerRaw;
      sellerCounts.set(effectiveSellerNorm, info);
    }

    const sellers = Array.from(sellerCounts.entries())
      .map(([sellerNameNorm, v]) => ({
        sellerNameRaw: v.raw,
        sellerNameNorm,
        rows: v.count,
      }))
      .sort((a, b) => b.rows - a.rows);

    const previewRows = parsed.rows
      .filter(r => {
        const sellerNorm = normalizeText(r['VENDEDOR']);
        return sellerNorm !== 'TOTAL';
      })
      .slice(0, previewRowsLimit)
      .map(r => {
        const cleaned = { ...r };
        delete cleaned.__rowIndex;
        return cleaned;
      });

    return {
      file: {
        name: parsed.meta.fileName,
        size: parsed.meta.fileSize,
        mtimeMs: parsed.meta.fileMtimeMs,
      },
      columns: parsed.columns,
      previewRows,
      detected: {
        sellers,
        totalsRowsIgnored,
        nanSellerRowsLinked,
      },
      anomalies,
    };
  }
}

module.exports = {
  ImportPreviewService,
};
