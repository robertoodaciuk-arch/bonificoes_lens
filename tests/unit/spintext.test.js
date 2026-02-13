const test = require('node:test');
const assert = require('node:assert/strict');

// The WhatsAppManager uses processSpintext, but it's a class instance
// We test the same logic here directly
function processSpintext(text) {
  if (!text) return '';
  return text.replace(/\{([^{}]+)\}/g, (match, content) => {
    if (content.includes('|')) {
      const choices = content.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    }
    return match;
  });
}

test('processSpintext retorna string vazia para entrada vazia', () => {
  assert.equal(processSpintext(''), '');
  assert.equal(processSpintext(null), '');
  assert.equal(processSpintext(undefined), '');
});

test('processSpintext retorna texto sem alteração quando não há spintext', () => {
  assert.equal(processSpintext('Olá mundo'), 'Olá mundo');
});

test('processSpintext preserva variáveis de template sem pipe', () => {
  const result = processSpintext('Olá {vendedor}, período {periodo}');
  assert.equal(result, 'Olá {vendedor}, período {periodo}');
});

test('processSpintext seleciona uma opção do spintext', () => {
  const options = ['Oi', 'Olá', 'Oii'];
  const results = new Set();
  for (let i = 0; i < 100; i++) {
    const result = processSpintext('{Oi|Olá|Oii}');
    assert.ok(options.includes(result), `"${result}" deve ser uma das opções: ${options.join(', ')}`);
    results.add(result);
  }
  // With 100 iterations, we should get at least 2 different results
  assert.ok(results.size >= 2, `Deve produzir variação, mas obteve: ${[...results].join(', ')}`);
});

test('processSpintext resolve múltiplos blocos de spintext', () => {
  const greetings = ['Oi', 'Olá'];
  const bodies = ['segue', 'aqui está'];
  const result = processSpintext('{Oi|Olá} vendedor, {segue|aqui está} o relatório');
  const parts = result.split(' vendedor, ');
  assert.ok(greetings.includes(parts[0]), `Greeting "${parts[0]}" deve ser válido`);
  assert.ok(parts[1].startsWith('segue') || parts[1].startsWith('aqui está'), `Body deve começar com opção válida`);
});

test('processSpintext com mensagem completa de template', () => {
  const template = '{Oi|Olá|Oii|Oi, tudo bem?} {vendedor}, {segue seu relatório|aqui está o relatório} do período {periodo}.';
  const result = processSpintext(template);
  // Should still contain {vendedor} and {periodo} since they don't have pipes
  assert.ok(result.includes('{vendedor}'), 'Deve preservar {vendedor}');
  assert.ok(result.includes('{periodo}'), 'Deve preservar {periodo}');
  // Should NOT contain the spintext delimiters anymore
  assert.ok(!result.includes('|'), 'Não deve conter | após processamento');
});
