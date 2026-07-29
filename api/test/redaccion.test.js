/**
 * La maquinaria que comparten los cinco encargos: la configuración, la cadena de
 * modelos y la llamada.
 *
 * El material de cada uno se prueba en su fichero —`redaccion-dia`,
 * `-regalo`, `-cumple` y `-chispa`—, y los apuntes de un sitio, en
 * `sitios.test.js`. Aquí interesan dos cosas: que la clave no vuelva nunca
 * entera hacia el dispositivo, y que la cadena de repuesto baje de un modelo al
 * siguiente guardando el porqué de cada intento fallido.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCCION_POR_DEFECTO,
  MODELOS_DE_RESERVA,
  cadenaDeModelos,
  componerMaterial,
  configuracionPublica,
  modelosDisponibles,
  redactar,
} from '../src/redaccion.js';
import {
  CONFIGURACION,
  INSTANTANEA,
  fetchDe,
  respuestaConTexto,
} from './apoyo/redaccion.js';

// ----------------------------------------------------------- Configuración --

test('la clave no vuelve entera: solo su cola y la fecha en que se guardó', () => {
  const publica = configuracionPublica({ ...CONFIGURACION, guardada_en: '2026-04-14 10:00:00' });

  assert.equal(publica.hay_clave, true);
  assert.equal(publica.cola, '9876');
  assert.equal(publica.guardada_en, '2026-04-14 10:00:00');
  assert.equal(JSON.stringify(publica).includes(CONFIGURACION.clave), false);
});

test('sin clave puesta se dice que no la hay y no se inventa una cola', () => {
  const publica = configuracionPublica({ clave: '', modelo: 'x', instruccion: 'y', guardada_en: null });
  assert.equal(publica.hay_clave, false);
  assert.equal(publica.cola, null);
});

// ---------------------------------------------------------------- Modelos --

test('la cadena empieza por el configurado y no lo repite detrás', () => {
  assert.deepEqual(cadenaDeModelos('claude-sonnet-5'), [
    'claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5',
  ]);
});

test('un modelo de fuera de la reserva encabeza la cadena y deja la reserva entera', () => {
  assert.deepEqual(cadenaDeModelos('claude-de-mañana'), [
    'claude-de-mañana', ...MODELOS_DE_RESERVA.map((m) => m.id),
  ]);
});

test('sin clave, la lista de modelos es la de reserva y no se pregunta a nadie', async () => {
  const buscar = fetchDe([]);
  const { modelos, de } = await modelosDisponibles('', buscar);

  assert.equal(de, 'reserva');
  assert.deepEqual(modelos, MODELOS_DE_RESERVA);
  assert.equal(buscar.llamadas.length, 0);
});

test('si Anthropic contesta, los modelos son los suyos', async () => {
  const buscar = fetchDe([{ estado: 200, datos: { data: [{ id: 'claude-x', display_name: 'Claude X' }] } }]);
  const { modelos, de } = await modelosDisponibles('sk-ant-1', buscar);

  assert.equal(de, 'anthropic');
  assert.deepEqual(modelos, [{ id: 'claude-x', nombre: 'Claude X' }]);
  assert.equal(buscar.llamadas[0].opciones.headers['x-api-key'], 'sk-ant-1');
});

test('si la consulta de modelos revienta, se sigue con la reserva', async () => {
  const buscar = fetchDe([() => { throw new Error('sin red'); }]);
  const { de } = await modelosDisponibles('sk-ant-1', buscar);
  assert.equal(de, 'reserva');
});

// ---------------------------------------------------------------- Llamada --

test('al primer modelo que contesta se le coge el texto y no se prueban más', async () => {
  const buscar = fetchDe([respuestaConTexto('Mañana de dentista y tarde de cumpleaños.')]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1', 'e2']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, 'Mañana de dentista y tarde de cumpleaños.');
  assert.equal(resultado.modelo, 'claude-haiku-4-5');
  assert.equal(buscar.llamadas.length, 1);

  const enviado = buscar.llamadas[0].cuerpo;
  assert.equal(enviado.model, 'claude-haiku-4-5');
  assert.equal(enviado.system, 'Cuenta el día.');
  assert.equal(enviado.messages[0].content.includes('Dentista'), true);
  // Los modelos nuevos rechazan estos dos con un 400: no deben salir de aquí.
  assert.equal('temperature' in enviado, false);
  assert.equal('thinking' in enviado, false);
});

test('sin instrucción guardada se manda la de por defecto', async () => {
  const buscar = fetchDe([respuestaConTexto('Un día tranquilo.')]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  await redactar({ configuracion: { ...CONFIGURACION, instruccion: '' }, material, buscar });

  assert.equal(buscar.llamadas[0].cuerpo.system, INSTRUCCION_POR_DEFECTO);
});

test('si un modelo falla se baja al siguiente, y queda anotado el porqué', async () => {
  const buscar = fetchDe([
    { estado: 429, datos: { error: { type: 'rate_limit_error', message: 'demasiadas peticiones' } } },
    respuestaConTexto('Dentista por la mañana.'),
  ]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, 'Dentista por la mañana.');
  assert.equal(resultado.modelo, 'claude-sonnet-5');
  assert.equal(resultado.intentos.length, 2);
  assert.equal(resultado.intentos[0].estado, 429);
  assert.equal(resultado.intentos[0].tipo, 'rate_limit_error');
  assert.equal(resultado.intentos[0].mensaje, 'demasiadas peticiones');
});

test('un rechazo por política llega con 200 y cuenta como intento fallido', async () => {
  const buscar = fetchDe([
    { estado: 200, datos: { stop_reason: 'refusal', content: [] } },
    respuestaConTexto('Nada que objetar.'),
  ]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.intentos[0].tipo, 'refusal');
  assert.equal(resultado.texto, 'Nada que objetar.');
});

test('si ninguno contesta, no hay texto pero sí la traza de los tres intentos', async () => {
  const buscar = fetchDe([
    { estado: 401, datos: { error: { type: 'authentication_error', message: 'clave no válida' } } },
    () => { throw new Error('sin red'); },
    { estado: 500, datos: {} },
  ]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, null);
  assert.equal(resultado.intentos.length, 3);
  assert.deepEqual(resultado.intentos.map((i) => i.tipo), ['authentication_error', 'red', 'error']);
  assert.equal(resultado.intentos[1].mensaje, 'sin red');
});

test('sin clave configurada no se llama a nadie', async () => {
  const buscar = fetchDe([respuestaConTexto('no debería llegar aquí')]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: { ...CONFIGURACION, clave: '' }, material, buscar });

  assert.equal(resultado.texto, null);
  assert.equal(buscar.llamadas.length, 0);
});
