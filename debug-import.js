const fs = require('fs');
const xlsx = require('xlsx');

const filePath = 'C:\\Users\\Roberto\\Desktop\\500 Bonificados.xlsx';

console.log('--- DIAGNOSTIC START ---');
console.log(`Trying to read: ${filePath}`);

if (!fs.existsSync(filePath)) {
  console.error('File not found!');
  process.exit(1);
}

const stats = fs.statSync(filePath);
console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

try {
  console.log('Reading file into buffer...');
  const buf = fs.readFileSync(filePath);
  console.log('Buffer read. Parsing xlsx...');
  
  const workbook = xlsx.read(buf, { type: 'buffer', cellDates: false });
  console.log(`Workbook parsed. Sheets: ${workbook.SheetNames.join(', ')}`);
  
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = xlsx.utils.decode_range(sheet['!ref']);
  console.log(`Dimensions: ${range.e.r} rows, ${range.e.c} cols`);

  console.log('Converting to JSON...');
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`Rows parsed: ${data.length}`);
  
  if (data.length > 0) {
    console.log('First row headers:', data[0]);
  }

  console.log('--- DIAGNOSTIC SUCCESS ---');
} catch (err) {
  console.error('--- DIAGNOSTIC FAILED ---');
  console.error(err);
}
