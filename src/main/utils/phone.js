function normalizePhoneE164(raw, { defaultCountry = '55', dropBrazilMobileNine = true } = {}) {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (!str) return '';

  let digits = str.replace(/\D/g, '');
  if (!digits) return '';

  // 00 prefix
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // If it's a BR number and the user wants to drop the mobile 9 (55 + DDD + 9 + 8digits)
  // Example to fix: 55 41 9 8534 8766 -> 55 41 8534 8766
  if (dropBrazilMobileNine) {
    // With country
    if (digits.startsWith('55') && digits.length === 13) {
      const ddd = digits.slice(2, 4);
      const ninth = digits.slice(4, 5);
      const rest = digits.slice(5);
      if (ninth === '9' && rest.length === 8) {
        digits = `55${ddd}${rest}`;
      }
    }

    // Without country (DDD + 9 + 8digits)
    if (!digits.startsWith('55') && digits.length === 11) {
      const ddd = digits.slice(0, 2);
      const ninth = digits.slice(2, 3);
      const rest = digits.slice(3);
      if (ninth === '9' && rest.length === 8) {
        digits = `${ddd}${rest}`; // now 10 digits
      }
    }
  }

  // Already has country
  if (digits.startsWith(defaultCountry)) {
    // We expect BR as 55 + DDD(2) + number(8) => 12 digits
    if (digits.length === 12) {
      return `+${digits}`;
    }

    // Accept some other lengths (fallback)
    if (digits.length >= 12 && digits.length <= 15) {
      return `+${digits}`;
    }
  }

  // No country: expect DDD+number (10 digits after optional drop of 9)
  if (digits.length === 10) {
    return `+${defaultCountry}${digits}`;
  }

  // Fallback: if looks like full international number
  if (digits.length >= 12 && digits.length <= 15) {
    return `+${digits}`;
  }

  return '';
}

module.exports = {
  normalizePhoneE164,
};
