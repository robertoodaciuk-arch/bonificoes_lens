const test = require('node:test');
const assert = require('node:assert/strict');

const { newId } = require('../../src/main/utils/ids');

test('newId gera identificador único', () => {
  const id1 = newId();
  const id2 = newId();
  assert.ok(typeof id1 === 'string');
  assert.ok(id1.length > 0);
  assert.notEqual(id1, id2);
});

test('newId gera formato UUID válido', () => {
  const id = newId();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  assert.match(id, uuidRegex);
});

test('newId gera IDs únicos em massa', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    ids.add(newId());
  }
  assert.equal(ids.size, 1000, 'Todos os 1000 IDs devem ser únicos');
});
