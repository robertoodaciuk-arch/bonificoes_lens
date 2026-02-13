function toIso(yyyy, mm, dd) {
  const y = String(yyyy).padStart(4, '0');
  const m = String(mm).padStart(2, '0');
  const d = String(dd).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function excelSerialToIso(serial) {
  // Data serial do Excel (base 1900 com compensação de bug de ano bissexto)
  if (!Number.isFinite(serial)) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const utcMs = excelEpoch.getTime() + Math.round(serial) * 86400000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseDateBrToIso(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  if (typeof value === 'number') {
    return excelSerialToIso(value);
  }

  const s = String(value).trim();

  // dd/mm/yyyy
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return toIso(m[3], m[2], m[1]);

  // yyyy-mm-dd or yyyy-mm-ddTHH:mm...
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return toIso(m[1], m[2], m[3]);

  const asNumber = Number(s.replace(',', '.'));
  if (!Number.isNaN(asNumber) && s !== '') {
    const iso = excelSerialToIso(asNumber);
    if (iso) return iso;
  }

  return null;
}

function isoToBr(isoDate) {
  if (!isoDate) return '';
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(isoDate);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

module.exports = { parseDateBrToIso, isoToBr };
