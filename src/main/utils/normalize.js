function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

module.exports = {
  normalizeText,
};
