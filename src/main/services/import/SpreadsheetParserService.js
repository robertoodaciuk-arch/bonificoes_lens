const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { ValidationError } = require('../../utils/errors');

function safeCellToString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  return String(v).trim();
}

function guessHeaderRow(aoa, requiredHeadersNorm) {
  // Scan first 15 rows looking for a row that contains most required headers
  const maxScan = Math.min(15, aoa.length);
  let best = { idx: 0, score: -1 };

  for (let i = 0; i < maxScan; i++) {
    const row = aoa[i] || [];
    const norm = row.map(c => safeCellToString(c).toUpperCase());
    const score = requiredHeadersNorm.reduce((acc, h) => acc + (norm.includes(h) ? 1 : 0), 0);
    if (score > best.score) best = { idx: i, score };
  }

  return best.idx;
}

function normalizeHeaderKey(h) {
  return safeCellToString(h)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DEFAULT_REQUIRED_HEADERS = [
  'VENDEDOR',
  'LOJA',
  'NOME CLIENTE',
  'OS',
  'DATA VENDA',
  'VENDA',
  'AC'
];

class SpreadsheetParserService {
  parse({ filePath, sheetName, headerRow, requiredHeaders = DEFAULT_REQUIRED_HEADERS } = {}) {
    if (!filePath) throw new ValidationError('filePath é obrigatório');
    if (!fs.existsSync(filePath)) throw new ValidationError('Arquivo não encontrado', { filePath });

    const fileStat = fs.statSync(filePath);
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (fileStat.size > MAX_FILE_SIZE) {
      throw new ValidationError(`Arquivo muito grande (${(fileStat.size / 1024 / 1024).toFixed(2)} MB). Limite é 50MB.`);
    }

    let workbook;
    try {
      // Usar buffer manual evita locks de arquivo e permite melhor controle de memória
      const fileBuffer = fs.readFileSync(filePath);
      workbook = xlsx.read(fileBuffer, { type: 'buffer', cellDates: false });
    } catch (err) {
      throw new ValidationError(`Falha crítica ao decodificar Excel. O arquivo pode estar corrompido ou protegido. Detalhes: ${err.message}`, { filePath });
    }

    const targetSheetName = sheetName || workbook.SheetNames[0];
    if (!targetSheetName) throw new ValidationError('Nenhuma aba encontrada na planilha');

    const sheet = workbook.Sheets[targetSheetName];
    if (!sheet) throw new ValidationError('Aba não encontrada', { sheetName: targetSheetName });

    const aoa = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false, defval: '' });
    if (!aoa.length) throw new ValidationError('Planilha vazia');

    const requiredNorm = requiredHeaders.map(h => h.toUpperCase());
    const hdrRowIndex = Number.isFinite(headerRow) ? headerRow : guessHeaderRow(aoa, requiredNorm);

    const headersRaw = (aoa[hdrRowIndex] || []).map(normalizeHeaderKey);
    const headerMap = new Map();
    headersRaw.forEach((h, idx) => {
      if (!h) return;
      // Keep first occurrence
      if (!headerMap.has(h)) headerMap.set(h, idx);
    });

    const missingRequired = requiredNorm.filter(h => !headerMap.has(h));

    const dataRows = [];
    for (let r = hdrRowIndex + 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!row || !row.length) continue;

      const record = {};
      for (const [h, idx] of headerMap.entries()) {
        record[h] = row[idx];
      }
      record.__rowIndex = r; // original row index in sheet
      dataRows.push(record);
    }

    return {
      meta: {
        fileName: path.basename(filePath),
        filePath,
        fileSize: fileStat.size,
        fileMtimeMs: fileStat.mtimeMs,
        sheetName: targetSheetName,
        headerRow: hdrRowIndex,
      },
      columns: Array.from(headerMap.keys()),
      missingRequired,
      rows: dataRows,
    };
  }
}

module.exports = {
  SpreadsheetParserService,
  DEFAULT_REQUIRED_HEADERS,
};
