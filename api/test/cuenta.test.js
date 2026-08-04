/**
 * La baja de cuenta y la revocación ante Apple.
 *
 * Es la parte del sistema que solo se ejerce una vez por persona y en el peor
 * momento —cuando alguien se va—, de modo que no hay ocasión de descubrir sus
 * fallos en el uso diario. De ahí que se compruebe aquí lo que sí se puede
 * comprobar sin hablar con Apple: que el secreto de cliente es un JWT ES256
 * verificable, y que la baja deja la fila de la persona en el estado exacto que
 * el modelo llama «miembro sin cuenta».
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import { hayRevocacionConfigurada, revocarEnApple, secretoDeCliente } from '../src/portero/revocacion.js';
import { darDeBajaCuenta } from '../src/repositorio.js';

// --------------------------------------------------------------- Utilidades --

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const ENTORNO = {
  APPLE_CLAVE_P8: privateKey,
  APPLE_CLAVE_ID: 'ABC1234567',
  APPLE_EQUIPO: 'TEAM123456',
  APPLE_AUD_IOS: 'com.garciadoral.ops',
  APPLE_AUD_WEB: 'com.garciadoral.ops.web',
};

function base64urlADatos(texto) {
  return Buffer.from(texto.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function partes(jwt) {
  const [cabecera, cuerpo, firma] = jwt.split('.');
  return {
    cabecera: JSON.parse(base64urlADatos(cabecera).toString('utf8')),
    cuerpo: JSON.parse(base64urlADatos(cuerpo).toString('utf8')),
    firmado: `${cabecera}.${cuerpo}`,
    firma: base64urlADatos(firma),
  };
}

/** Base de datos de mentira: recuerda las sentencias en lugar de ejecutarlas. */
function baseFalsa() {
  const lote = [];
  return {
    lote,
    prepare(sql) {
      return { bind: (...args) => ({ sql, args }) };
    },
    async batch(sentencias) {
      lote.push(...sentencias);
    },
  };
}

// ----------------------------------------------------------- Secreto ES256 --

test('el secreto de cliente es un JWT ES256 que Apple puede verificar', async () => {
  const jwt = await secretoDeCliente(ENTORNO, 'com.garciadoral.ops', 1_800_000_000);
  const { cabecera, cuerpo, firmado, firma } = partes(jwt);

  assert.equal(cabecera.alg, 'ES256');
  assert.equal(cabecera.kid, 'ABC1234567');
  assert.equal(cuerpo.iss, 'TEAM123456');
  assert.equal(cuerpo.aud, 'https://appleid.apple.com');
  assert.equal(cuerpo.sub, 'com.garciadoral.ops');
  assert.equal(cuerpo.iat, 1_800_000_000);
  assert.ok(cuerpo.exp > cuerpo.iat, 'debe caducar después de emitirse');

  // La firma tiene que ser r‖s en crudo, no DER: es lo que espera JOSE, y es el
  // detalle en el que Apple responde `invalid_client` sin más explicación.
  assert.equal(firma.length, 64);

  const clave = await crypto.subtle.importKey(
    'spki',
    base64urlADatos(publicKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const valida = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    clave,
    firma,
    new TextEncoder().encode(firmado),
  );
  assert.equal(valida, true);
});

test('la clave se admite con los saltos de línea escapados', async () => {
  // Según cómo se pegue en `wrangler secret put`, el PEM llega con saltos reales
  // o con `\n` literales. La diferencia no se ve al pegarla y el fallo que
  // produce —una clave que no importa— no se parece a su causa.
  const escapada = { ...ENTORNO, APPLE_CLAVE_P8: privateKey.replace(/\n/g, '\\n') };
  const jwt = await secretoDeCliente(escapada, 'com.garciadoral.ops');
  assert.equal(partes(jwt).cabecera.alg, 'ES256');
});

// -------------------------------------------------------------- Revocación --

test('sin código de autorización no se intenta revocar', async () => {
  const resultado = await revocarEnApple(ENTORNO, { codigo: null, plataforma: 'ios' });
  assert.deepEqual(resultado, { revocado: false, motivo: 'sin_codigo' });
});

test('sin clave configurada la revocación se salta, no falla', async () => {
  const resultado = await revocarEnApple({}, { codigo: 'c-123', plataforma: 'ios' });
  assert.deepEqual(resultado, { revocado: false, motivo: 'sin_clave' });
  assert.equal(hayRevocacionConfigurada({}), false);
  assert.equal(hayRevocacionConfigurada(ENTORNO), true);
});

test('un fallo hablando con Apple no lanza: la baja no puede depender de eso', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('sin red'); };
  try {
    const resultado = await revocarEnApple(ENTORNO, { codigo: 'c-123', plataforma: 'ios' });
    assert.equal(resultado.revocado, false);
    assert.equal(resultado.motivo, 'error');
  } finally {
    globalThis.fetch = original;
  }
});

// ------------------------------------------------------------------- Baja --

test('la baja deshace la cuenta y deja a la persona en el hogar', async () => {
  const db = baseFalsa();
  await darDeBajaCuenta(db, 'p-marta');

  assert.equal(db.lote.length, 4);
  for (const sentencia of db.lote) {
    assert.deepEqual(sentencia.args, ['p-marta'], sentencia.sql);
  }

  const [dispositivos, avisos, accesos, persona] = db.lote;
  assert.match(dispositivos.sql, /DELETE FROM dispositivo/);
  assert.match(avisos.sql, /DELETE FROM preferencia_notificacion/);
  assert.match(accesos.sql, /DELETE FROM acceso_categoria/);

  // Lo que se va de la fila: el vínculo con Apple, la condición de titular y el
  // rol. Lo que no aparece por ninguna parte es un DELETE de la persona.
  assert.match(persona.sql, /UPDATE persona/);
  assert.match(persona.sql, /identificador_apple = NULL/);
  assert.match(persona.sql, /tiene_cuenta = 0/);
  assert.match(persona.sql, /rol = NULL/);
  assert.equal(db.lote.some((s) => /DELETE FROM persona/.test(s.sql)), false);
});
