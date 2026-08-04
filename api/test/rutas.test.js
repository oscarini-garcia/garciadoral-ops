/**
 * Los handlers enteros, de la petición a la respuesta.
 *
 * Las piezas —sesión, solicitudes, baja— tienen sus pruebas; lo que no tenía
 * ninguna era el camino que las une en `index.js`, y por ahí se coló un 500 en
 * la ruta de baja de cuenta: un refactor renombró la función en el `import` y
 * una línea del handler se quedó llamando al nombre viejo. Ninguna sintaxis lo
 * detecta —es un `ReferenceError` de ejecución— y la ruta se ejerce una vez por
 * persona, así que nadie lo vio hasta la auditoría. Estas pruebas piden a las
 * rutas de verdad, con una base de mentira, y fallan si una respuesta deja de
 * ser la que el cliente espera.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';
import { emitirEspera, emitirSesion } from '../src/portero/sesion.js';

const SECRETO = 'secreto-de-pruebas';

/** La misma base de mentira que en `solicitudes.test.js`: contesta según un
 *  fragmento del SQL y recuerda todo lo que se le pidió ejecutar. */
function baseFalsa(respuestas = {}) {
  const ejecutadas = [];
  const buscar = (sql) => Object.keys(respuestas).find((clave) => sql.includes(clave));
  const responder = (sql, args) => {
    ejecutadas.push({ sql, args });
    const clave = buscar(sql);
    return clave === undefined ? null : respuestas[clave];
  };

  const acciones = (sql, args) => ({
    sql,
    args,
    first: async () => responder(sql, args),
    run: async () => responder(sql, args) ?? { meta: { changes: 1 } },
    all: async () => ({ results: responder(sql, args) || [] }),
  });

  return {
    ejecutadas,
    prepare(sql) {
      return { ...acciones(sql, []), bind: (...args) => acciones(sql, args) };
    },
    async batch(sentencias) {
      ejecutadas.push(...sentencias);
      return sentencias.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

const sql = (base, fragmento) => base.ejecutadas.filter((e) => e.sql.includes(fragmento));

const MARTA = {
  id: 'p-marta', nombre: 'Marta', rol: 'miembro', tiene_cuenta: 1, activa: 1,
};
const ANA = {
  id: 'p-ana', nombre: 'Ana', rol: 'administrador', tiene_cuenta: 1, activa: 1,
};

function entorno(db) {
  return { SESION_SECRETO: SECRETO, DB: db };
}

async function pedir(env, metodo, camino, { token, cuerpo } = {}) {
  const peticion = new Request(`https://api.example${camino}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { 'content-type': 'application/json' } : {}),
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const respuesta = await worker.fetch(peticion, env, {});
  return { estado: respuesta.status, cuerpo: await respuesta.json() };
}

// ------------------------------------------------------------------- La baja --

test('la baja de cuenta responde 200 y deshace la cuenta', async () => {
  const db = baseFalsa({
    'SELECT * FROM persona WHERE id = ?': MARTA,
    'COUNT(*) AS cuantos': { cuantos: 2 },
  });
  const token = await emitirSesion(SECRETO, MARTA, 'ios');

  const { estado, cuerpo } = await pedir(entorno(db), 'POST', '/api/cuenta/baja', { token });

  assert.equal(estado, 200);
  assert.equal(cuerpo.baja, true);
  // Sin código de Apple la revocación se salta, pero la baja no se detiene.
  assert.equal(cuerpo.revocado_en_apple, false);
  assert.equal(sql(db, 'DELETE FROM dispositivo').length, 1);
  assert.ok(sql(db, 'UPDATE persona')[0].sql.includes('identificador_apple = NULL'));
});

test('la credencial de espera no sirve para darse de baja ni para sincronizar', async () => {
  const db = baseFalsa();
  const token = await emitirEspera(SECRETO, '000123.abc', 'ios', {});

  assert.equal((await pedir(entorno(db), 'POST', '/api/cuenta/baja', { token })).estado, 401);
  assert.equal((await pedir(entorno(db), 'GET', '/api/sync', { token })).estado, 401);
});

// -------------------------------------------------------------- La retirada --

test('retirar sin solicitud no borra nada ni llama a Apple', async () => {
  const db = baseFalsa({ 'FROM solicitud_acceso WHERE identificador_apple': null });
  const token = await emitirEspera(SECRETO, '000123.abc', 'web', {});

  const { estado, cuerpo } = await pedir(entorno(db), 'DELETE', '/api/solicitud', { token });

  assert.equal(estado, 200);
  assert.equal(cuerpo.retirada, true);
  assert.equal(cuerpo.motivo_revocacion, 'sin_solicitud');
  assert.equal(sql(db, 'DELETE FROM solicitud_acceso').length, 0);
});

// -------------------------------------------------------------- La bandeja --

test('resolver una solicitud es cosa de administradores', async () => {
  const db = baseFalsa({ 'SELECT * FROM persona WHERE id = ?': MARTA });
  const token = await emitirSesion(SECRETO, MARTA, 'ios');

  const { estado } = await pedir(entorno(db), 'POST', '/api/solicitudes/resolver', {
    token,
    cuerpo: { id: 's1', accion: 'rechazar' },
  });
  assert.equal(estado, 403);
});

test('rechazar una solicitud ya resuelta contesta 409, no 500', async () => {
  const db = baseFalsa({
    'SELECT * FROM persona WHERE id = ?': ANA,
    "SET estado = 'rechazada'": { meta: { changes: 0 } },
  });
  const token = await emitirSesion(SECRETO, ANA, 'web');

  const { estado, cuerpo } = await pedir(entorno(db), 'POST', '/api/solicitudes/resolver', {
    token,
    cuerpo: { id: 's1', accion: 'rechazar' },
  });
  assert.equal(estado, 409);
  assert.match(cuerpo.error, /ya estaba resuelta/);
});

// ----------------------------------------------------------- La credencial --

test('una credencial rota o ausente es 401, sea cual sea su texto', async () => {
  const db = baseFalsa();
  assert.equal((await pedir(entorno(db), 'GET', '/api/sync', {})).estado, 401);
  assert.equal(
    (await pedir(entorno(db), 'GET', '/api/sync', { token: 'no.es.jwt' })).estado,
    401,
  );

  // Una sesión bien firmada de alguien que ya no tiene cuenta también es 401:
  // antes esto dependía de que el mensaje llevara la palabra «sesión».
  const token = await emitirSesion(SECRETO, MARTA, 'ios');
  const sinCuenta = baseFalsa({
    'SELECT * FROM persona WHERE id = ?': { ...MARTA, tiene_cuenta: 0 },
  });
  assert.equal((await pedir(entorno(sinCuenta), 'GET', '/api/sync', { token })).estado, 401);
});
