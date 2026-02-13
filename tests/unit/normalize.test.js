const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeText } = require('../../src/main/utils/normalize');

test('normalizeText converte para maiúsculas e remove acentos', () => {
  assert.equal(normalizeText('João Silva'), 'JOAO SILVA');
  assert.equal(normalizeText('café'), 'CAFE');
  assert.equal(normalizeText('São Paulo'), 'SAO PAULO');
});

test('normalizeText colapsa espaços múltiplos', () => {
  assert.equal(normalizeText('  João   Silva  '), 'JOAO SILVA');
  assert.equal(normalizeText('a  b   c'), 'A B C');
});

test('normalizeText trata null, undefined e vazio', () => {
  assert.equal(normalizeText(null), '');
  assert.equal(normalizeText(undefined), '');
  assert.equal(normalizeText(''), '');
});

test('normalizeText converte números para string', () => {
  assert.equal(normalizeText(123), '123');
  assert.equal(normalizeText(0), '0');
});
