const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const xlsx = require('xlsx');
const path = require('path');

// Lógica do Worker
try {
  parentPort.on('message', (task) => {
    if (task.type === 'PARSE') {
      try {
        const result = parseExcel(task.filePath);
        parentPort.postMessage({ type: 'SUCCESS', data: result });
      } catch (err) {
        parentPort.postMessage({ type: 'ERROR', error: { message: err.message, stack: err.stack } });
      } finally {
        // Tentativa forçada de GC se disponível (Node.js com --expose-gc)
        if (global.gc) {
          global.gc();
        }
      }
    }
  });
} catch (err) {
  console.error('Falha ao inicializar worker', err);
}

function parseExcel(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('Arquivo não encontrado');

  // Leitura segura via buffer
  const buf = fs.readFileSync(filePath);
  const workbook = xlsx.read(buf, { type: 'buffer', cellDates: false });
  
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('O arquivo Excel não contém nenhuma aba.');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Parse bruto
  const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  
  if (!rawRows || rawRows.length === 0) {
    return {
      meta: { fileName: path.basename(filePath), totalRows: 0 },
      headers: [],
      rows: []
    };
  }
  
  // Identificação de Cabeçalho (Lógica simplificada para o Worker)
  // Procura a linha que contém "VENDEDOR" e "OS"
  let headerRowIndex = 0;
  let headers = [];
  
  for(let i=0; i<Math.min(20, rawRows.length); i++) {
    const rowStr = JSON.stringify(rawRows[i]).toUpperCase();
    if (rowStr.includes('VENDEDOR') && rowStr.includes('OS')) {
      headerRowIndex = i;
      headers = rawRows[i].map(h => String(h).trim().toUpperCase());
      break;
    }
  }

  // Fallback se não achar cabeçalho conhecido: usa a primeira linha
  if (headers.length === 0 && rawRows.length > 0) {
    headers = rawRows[0].map(h => String(h || `COL_${Math.random().toString(36).substr(2,5)}`).trim().toUpperCase());
  }

  const dataRows = [];

  // Processamento de linhas
  for(let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0) continue;

    const record = {};
    headers.forEach((h, idx) => {
      if(h) record[h] = row[idx];
    });
    // Adicionar metadados para o frontend
    record.__rowIndex = i + 1; 
    dataRows.push(record);
  }

  // Sanitização extrema para IPC (apenas dados primitivos)
  return {
    meta: { fileName: path.basename(filePath), totalRows: dataRows.length },
    headers: headers,
    rows: dataRows // No artificial limit - process all rows
  };
}
