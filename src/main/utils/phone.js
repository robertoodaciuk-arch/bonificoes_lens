function normalizePhoneE164(raw, { defaultCountry = '55', dropBrazilMobileNine = true } = {}) {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).trim();
  if (!str) return '';

  let digits = str.replace(/\D/g, '');
  if (!digits) return '';

  // Prefixo 00 (discagem internacional)
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Remove nono dígito móvel brasileiro (55 + DDD + 9 + 8 dígitos)
  // Exemplo: 55 41 9 8534 8766 -> 55 41 8534 8766
  if (dropBrazilMobileNine) {
    // Com código de país
    if (digits.startsWith('55') && digits.length === 13) {
      const ddd = digits.slice(2, 4);
      const nono = digits.slice(4, 5);
      const resto = digits.slice(5);
      if (nono === '9' && resto.length === 8) {
        digits = `55${ddd}${resto}`;
      }
    }

    // Sem código de país (DDD + 9 + 8 dígitos)
    if (!digits.startsWith('55') && digits.length === 11) {
      const ddd = digits.slice(0, 2);
      const nono = digits.slice(2, 3);
      const resto = digits.slice(3);
      if (nono === '9' && resto.length === 8) {
        digits = `${ddd}${resto}`; // agora 10 dígitos
      }
    }
  }

  // Já possui código de país
  if (digits.startsWith(defaultCountry)) {
    // BR esperado: 55 + DDD(2) + número(8) => 12 dígitos
    if (digits.length === 12) {
      return `+${digits}`;
    }

    // Aceita outros comprimentos (fallback)
    if (digits.length >= 12 && digits.length <= 15) {
      return `+${digits}`;
    }
  }

  // Sem país: espera DDD + número (10 dígitos após remoção opcional do 9)
  if (digits.length === 10) {
    return `+${defaultCountry}${digits}`;
  }

  // Fallback: parece número internacional completo
  if (digits.length >= 12 && digits.length <= 15) {
    return `+${digits}`;
  }

  return '';
}

module.exports = {
  normalizePhoneE164,
};
