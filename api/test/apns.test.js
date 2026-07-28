/**
 * El cable hasta Apple.
 *
 * De aquí se prueba lo que no se ve fallar hasta que está en producción: que la
 * firma sea la que APNs espera —ES256 con la firma en crudo, no en DER, que es
 * el error clásico y solo se manifiesta como «InvalidProviderToken»—, que el
 * token de proveedor se reutilice en lugar de firmarse en cada aviso, y que un
 * token de aparato muerto se distinga de una avería pasajera: uno se borra y la
 * otra se reintenta sola en el siguiente aviso.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  enviarAviso, hayApnsConfigurado, olvidarTokenDeProveedor, tokenDeProveedor,
} from '../src/apns.js';

const { privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const ENTORNO = {
  APNS_CLAVE_P8: privateKey,
  APNS_CLAVE_ID: 'ABC1234567',
  APPLE_EQUIPO: 'TEAM123456',
  APPLE_AUD_IOS: 'com.garciadoral.ops',
  DB: null,
};

const TOKEN = 'a'.repeat(64);

const descodificar = (parte) => JSON.parse(
  Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
);

/** Sustituye `fetch` y devuelve lo que se le pidió, para mirarlo después. */
function fetchFalso(respuestas) {
  const llamadas = [];
  const cola = [...respuestas];
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, opciones });
    const siguiente = cola.shift() || { status: 200 };
    return {
      status: siguiente.status,
      json: async () => siguiente.cuerpo || {},
    };
  };
  return llamadas;
}

const fetchOriginal = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = fetchOriginal; olvidarTokenDeProveedor(); });

// ------------------------------------------------------------- La firma --

test('el token de proveedor es un JWT ES256 con lo que Apple pide dentro', async () => {
  olvidarTokenDeProveedor();
  const jwt = await tokenDeProveedor(ENTORNO, 1800000000000);
  const [cabecera, cuerpo, firma] = jwt.split('.');

  assert.deepEqual(descodificar(cabecera), { alg: 'ES256', kid: 'ABC1234567' });
  assert.deepEqual(descodificar(cuerpo), { iss: 'TEAM123456', iat: 1800000000 });

  // 64 octetos en crudo —los dos enteros de la firma, uno detrás de otro—, que
  // es lo que ES256 pide. En DER serían unos 70 y variables.
  assert.equal(Buffer.from(firma.replace(/-/g, '+').replace(/_/g, '/'), 'base64').length, 64);
  // Y sin relleno ni caracteres de los que hay que escapar en una cabecera.
  assert.equal(/^[A-Za-z0-9_-]+$/.test(firma), true);
});

test('el mismo token se reutiliza dentro de su hora, y se renueva pasada', async () => {
  olvidarTokenDeProveedor();
  const primero = await tokenDeProveedor(ENTORNO, 1800000000000);
  const alRato = await tokenDeProveedor(ENTORNO, 1800000000000 + 10 * 60 * 1000);
  assert.equal(alRato, primero, 'firmar uno por aviso acaba en TooManyProviderTokenUpdates');

  const pasadoElRato = await tokenDeProveedor(ENTORNO, 1800000000000 + 50 * 60 * 1000);
  assert.notEqual(pasadoElRato, primero);
});

test('sin clave no se empuja, y eso no es una avería', async () => {
  assert.equal(hayApnsConfigurado({}), false);
  assert.equal(hayApnsConfigurado(ENTORNO), true);
  assert.deepEqual(await enviarAviso({}, TOKEN, { titulo: 'x', cuerpo: 'y' }), {
    ok: false, motivo: 'sin-configurar',
  });
});

// ------------------------------------------------------------- El envío --

test('el sobre lleva lo que hace sonar el teléfono y lo que dice a dónde ir', async () => {
  const llamadas = fetchFalso([{ status: 200 }]);
  const resultado = await enviarAviso(ENTORNO, TOKEN, {
    titulo: '🐾 Marta te pide que saques a Lío',
    cuerpo: 'El jueves 30 de julio por la mañana.',
    categoria: 'LIO_CAMBIO',
    hilo: 'lio:2026-07-30:manana',
    agrupa: 'lio:2026-07-30:manana:pendiente',
    datos: { tipo: 'lio', fecha: '2026-07-30' },
  });

  assert.deepEqual(resultado, { ok: true });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, `https://api.push.apple.com/3/device/${TOKEN}`);

  const cabeceras = llamadas[0].opciones.headers;
  assert.match(cabeceras.authorization, /^bearer /);
  assert.equal(cabeceras['apns-topic'], 'com.garciadoral.ops');
  assert.equal(cabeceras['apns-push-type'], 'alert');
  assert.equal(cabeceras['apns-priority'], '10');
  assert.equal(cabeceras['apns-collapse-id'], 'lio:2026-07-30:manana:pendiente');

  const sobre = JSON.parse(llamadas[0].opciones.body);
  assert.equal(sobre.aps.alert.title, '🐾 Marta te pide que saques a Lío');
  assert.equal(sobre.aps.category, 'LIO_CAMBIO');
  // Lo que va fuera de `aps` es lo que el dispositivo lee para saber a dónde ir.
  assert.deepEqual(sobre.tipo, 'lio');
});

test('el entorno de pruebas es otro servidor, no otra cabecera', async () => {
  const llamadas = fetchFalso([{ status: 200 }]);
  await enviarAviso({ ...ENTORNO, APNS_ENTORNO: 'pruebas' }, TOKEN, { titulo: 'x', cuerpo: 'y' });
  assert.match(llamadas[0].url, /^https:\/\/api\.sandbox\.push\.apple\.com\//);
});

test('un aparato que ya no escucha se señala para borrarlo, no para reintentarlo', async () => {
  fetchFalso([{ status: 410, cuerpo: { reason: 'Unregistered' } }]);
  const resultado = await enviarAviso(ENTORNO, TOKEN, { titulo: 'x', cuerpo: 'y' });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.caducado, true);
});

test('una avería pasajera no borra el token de nadie', async () => {
  fetchFalso([{ status: 503, cuerpo: { reason: 'ServiceUnavailable' } }]);
  const resultado = await enviarAviso(ENTORNO, TOKEN, { titulo: 'x', cuerpo: 'y' });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.caducado, false);
  assert.equal(resultado.motivo, 'ServiceUnavailable');
});

test('un token de proveedor caducado se rehace y se reintenta una sola vez', async () => {
  const llamadas = fetchFalso([
    { status: 403, cuerpo: { reason: 'ExpiredProviderToken' } },
    { status: 200 },
  ]);
  const resultado = await enviarAviso(ENTORNO, TOKEN, { titulo: 'x', cuerpo: 'y' });
  assert.deepEqual(resultado, { ok: true });
  assert.equal(llamadas.length, 2);
  assert.notEqual(
    llamadas[0].opciones.headers.authorization,
    llamadas[1].opciones.headers.authorization,
  );
});

test('si el segundo intento también caduca, se para: lo que falla es otra cosa', async () => {
  const llamadas = fetchFalso([
    { status: 403, cuerpo: { reason: 'ExpiredProviderToken' } },
    { status: 403, cuerpo: { reason: 'ExpiredProviderToken' } },
  ]);
  const resultado = await enviarAviso(ENTORNO, TOKEN, { titulo: 'x', cuerpo: 'y' });
  assert.equal(resultado.ok, false);
  assert.equal(llamadas.length, 2);
});

test('sin red, el aviso se pierde y la escritura no se entera', async () => {
  globalThis.fetch = async () => { throw new Error('sin salida'); };
  const resultado = await enviarAviso(ENTORNO, TOKEN, { titulo: 'x', cuerpo: 'y' });
  assert.equal(resultado.ok, false);
  assert.match(resultado.motivo, /sin salida/);
});
