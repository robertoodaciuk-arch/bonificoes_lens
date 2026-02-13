const test = require('node:test');
const assert = require('node:assert/strict');

const { AppError, ValidationError } = require('../../src/main/utils/errors');

test('AppError armazena propriedades corretamente', () => {
  const err = new AppError('algo deu errado', 'CUSTOM_CODE', 503, { campo: 'nome' });
  assert.equal(err.message, 'algo deu errado');
  assert.equal(err.code, 'CUSTOM_CODE');
  assert.equal(err.statusCode, 503);
  assert.deepEqual(err.details, { campo: 'nome' });
  assert.equal(err.isOperational, true);
  assert.ok(err instanceof Error);
});

test('AppError usa valores padrão', () => {
  const err = new AppError('erro genérico');
  assert.equal(err.code, 'APP_ERROR');
  assert.equal(err.statusCode, 500);
  assert.equal(err.details, undefined);
});

test('ValidationError é subtipo de AppError com código 400', () => {
  const err = new ValidationError('campo inválido', { campo: 'email' });
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.equal(err.statusCode, 400);
  assert.ok(err instanceof AppError);
  assert.ok(err instanceof Error);
  assert.deepEqual(err.details, { campo: 'email' });
});
