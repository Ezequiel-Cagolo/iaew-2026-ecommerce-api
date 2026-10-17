const test = require('node:test');
const assert = require('node:assert/strict');

const { validateIdempotencyKey } = require('../lib/idempotency');
const { integerFromEnv } = require('../lib/config');
const { sendError } = require('../lib/errors');

test('Idempotency-Key es obligatoria', () => {
  for (const value of [undefined, null, '']) {
    assert.equal(
      validateIdempotencyKey(value).code,
      'IDEMPOTENCY_KEY_REQUIRED'
    );
  }
});

test('Idempotency-Key respeta longitud y caracteres permitidos', () => {
  for (const value of ['a'.repeat(7), 'a'.repeat(129), 'pedido con espacios']) {
    assert.equal(
      validateIdempotencyKey(value).code,
      'IDEMPOTENCY_KEY_INVALID'
    );
  }

  for (const value of [
    'a'.repeat(8),
    'a'.repeat(128),
    'pedido:001.reintento-1'
  ]) {
    assert.equal(validateIdempotencyKey(value), null);
  }
});

test('La configuración usa el valor por defecto y valida sus límites', () => {
  const name = 'CLASE06_TEST_INTEGER';
  const previous = process.env[name];

  try {
    delete process.env[name];
    assert.equal(integerFromEnv(name, 3), 3);

    process.env[name] = '';
    assert.equal(integerFromEnv(name, 3), 3);

    for (const value of ['0', '3', '20']) {
      process.env[name] = value;
      assert.equal(
        integerFromEnv(name, 3, { min: 0, max: 20 }),
        Number(value)
      );
    }

    for (const value of ['-1', '21', '1.5', 'texto']) {
      process.env[name] = value;
      assert.throws(
        () => integerFromEnv(name, 3, { min: 0, max: 20 }),
        /debe ser un entero/
      );
    }
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
});

test('Los errores incluyen estado, código y orientación para el cliente', () => {
  const res = {
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };

  sendError(
    res,
    409,
    'Clave incompatible',
    'IDEMPOTENCY_KEY_REUSED',
    false,
    'Usar otra clave'
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    error: 'Clave incompatible',
    code: 'IDEMPOTENCY_KEY_REUSED',
    retryable: false,
    action: 'Usar otra clave'
  });
});