const test = require('node:test');
const assert = require('node:assert/strict');

const { iniciar, registrar, resumo, limpar } = require('../../src/main/utils/performance');

test('iniciar registra duração da operação', () => {
  limpar();
  const fim = iniciar('teste-op');
  const duracao = fim();
  assert.ok(typeof duracao === 'number');
  assert.ok(duracao >= 0);

  const r = resumo();
  assert.equal(r['teste-op'].contagem, 1);
  assert.ok(r['teste-op'].mediaMs >= 0);
});

test('registrar acumula métricas corretamente', () => {
  limpar();
  registrar('db-query', 10);
  registrar('db-query', 20);
  registrar('db-query', 30);

  const r = resumo();
  assert.equal(r['db-query'].contagem, 3);
  assert.equal(r['db-query'].totalMs, 60);
  assert.equal(r['db-query'].mediaMs, 20);
  assert.equal(r['db-query'].minMs, 10);
  assert.equal(r['db-query'].maxMs, 30);
});

test('limpar remove todas as métricas', () => {
  registrar('op-temporaria', 100);
  limpar();
  const r = resumo();
  assert.deepEqual(r, {});
});

test('resumo retorna objeto vazio quando sem métricas', () => {
  limpar();
  assert.deepEqual(resumo(), {});
});
