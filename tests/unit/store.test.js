const test = require('node:test');
const assert = require('node:assert/strict');

// Store pode ser importado diretamente (não depende de window)
const { Store } = require('../../src/renderer/scripts/state/store');

test('Store inicializa com estado padrão', () => {
  const store = new Store({ nome: 'teste', valor: 1 });
  assert.deepEqual(store.getEstado(), { nome: 'teste', valor: 1 });
});

test('Store.get retorna valor de chave específica', () => {
  const store = new Store({ chave: 'abc' });
  assert.equal(store.get('chave'), 'abc');
  assert.equal(store.get('inexistente'), undefined);
});

test('Store.set atualiza estado parcialmente', () => {
  const store = new Store({ a: 1, b: 2 });
  store.set({ b: 99 });
  assert.deepEqual(store.getEstado(), { a: 1, b: 99 });
});

test('Store.set notifica listeners', () => {
  const store = new Store({ x: 0 });
  let novoEstado = null;
  let estadoAnterior = null;
  store.onChange((novo, anterior) => {
    novoEstado = { ...novo };
    estadoAnterior = { ...anterior };
  });
  store.set({ x: 42 });
  assert.deepEqual(novoEstado, { x: 42 });
  assert.deepEqual(estadoAnterior, { x: 0 });
});

test('Store.onChange retorna função de desregistro', () => {
  const store = new Store({ v: 0 });
  let chamado = false;
  const desregistrar = store.onChange(() => { chamado = true; });
  desregistrar();
  store.set({ v: 1 });
  assert.equal(chamado, false);
});

test('Store.reset substitui estado', () => {
  const store = new Store({ a: 1, b: 2 });
  store.reset({ c: 3 });
  assert.equal(store.get('c'), 3);
});

test('Store getEstado retorna cópia rasa (não mesma referência)', () => {
  const store = new Store({ nome: 'teste' });
  const estado1 = store.getEstado();
  const estado2 = store.getEstado();
  assert.notEqual(estado1, estado2, 'Deve retornar objetos diferentes');
  assert.deepEqual(estado1, estado2, 'Mas com mesmo conteúdo');
});
