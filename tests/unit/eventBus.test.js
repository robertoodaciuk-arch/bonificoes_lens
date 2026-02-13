const test = require('node:test');
const assert = require('node:assert/strict');

const { EventBus } = require('../../src/renderer/scripts/state/eventBus');

test('EventBus emite eventos para listeners registrados', () => {
  const bus = new EventBus();
  let recebido = null;
  bus.on('teste', (dados) => { recebido = dados; });
  bus.emit('teste', { valor: 42 });
  assert.deepEqual(recebido, { valor: 42 });
});

test('EventBus suporta múltiplos listeners', () => {
  const bus = new EventBus();
  const resultados = [];
  bus.on('multi', (d) => resultados.push(`a:${d}`));
  bus.on('multi', (d) => resultados.push(`b:${d}`));
  bus.emit('multi', 'oi');
  assert.deepEqual(resultados, ['a:oi', 'b:oi']);
});

test('EventBus permite desregistrar listener via retorno', () => {
  const bus = new EventBus();
  let chamado = false;
  const desregistrar = bus.on('temp', () => { chamado = true; });
  desregistrar();
  bus.emit('temp');
  assert.equal(chamado, false);
});

test('EventBus.off remove listener específico', () => {
  const bus = new EventBus();
  let chamado = false;
  const cb = () => { chamado = true; };
  bus.on('evento', cb);
  bus.off('evento', cb);
  bus.emit('evento');
  assert.equal(chamado, false);
});

test('EventBus.off remove apenas o listener específico', () => {
  const bus = new EventBus();
  const resultados = [];
  const cb1 = () => resultados.push('cb1');
  const cb2 = () => resultados.push('cb2');
  bus.on('evento', cb1);
  bus.on('evento', cb2);
  bus.off('evento', cb1);
  bus.emit('evento');
  assert.deepEqual(resultados, ['cb2']);
});

test('EventBus não falha ao emitir evento sem listeners', () => {
  const bus = new EventBus();
  assert.doesNotThrow(() => bus.emit('inexistente', {}));
});
