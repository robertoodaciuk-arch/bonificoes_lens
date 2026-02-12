const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhoneE164 } = require('../../src/main/utils/phone');
const { parseMoneyToCentsBr } = require('../../src/main/utils/money');
const { parseDateBrToIso, isoToBr } = require('../../src/main/utils/dates');

test('normalizePhoneE164 normaliza números BR removendo 9 móvel quando aplicável', () => {
  assert.equal(normalizePhoneE164('55 41 9 8534-8766'), '+554185348766');
  assert.equal(normalizePhoneE164('(41) 98534-8766'), '+554185348766');
});

test('normalizePhoneE164 retorna vazio para entradas inválidas', () => {
  assert.equal(normalizePhoneE164('abc'), '');
  assert.equal(normalizePhoneE164(''), '');
  assert.equal(normalizePhoneE164(null), '');
});

test('parseMoneyToCentsBr converte formatos monetários brasileiros', () => {
  assert.equal(parseMoneyToCentsBr('R$ 1.234,56'), 123456);
  assert.equal(parseMoneyToCentsBr('200,00'), 20000);
  assert.equal(parseMoneyToCentsBr(12.34), 1234);
});

test('parseDateBrToIso cobre datas BR e serial Excel', () => {
  assert.equal(parseDateBrToIso('05/01/2025'), '2025-01-05');
  assert.equal(parseDateBrToIso('2025-07-28T12:00:00'), '2025-07-28');
  assert.equal(parseDateBrToIso(45500), '2024-07-27');
});

test('isoToBr converte ISO para formato BR', () => {
  assert.equal(isoToBr('2025-02-03'), '03/02/2025');
  assert.equal(isoToBr('invalido'), 'invalido');
});
