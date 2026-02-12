function parseMoneyToCentsBr(value) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Remove currency symbols and spaces
  const cleaned = raw
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

module.exports = {
  parseMoneyToCentsBr,
};
