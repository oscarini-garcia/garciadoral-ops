/**
 * Los plugins en el servidor.
 *
 * Se comprueba lo que, si falla, falla sin que nadie se entere: que el círculo
 * de un plugin corta antes de transmitir, que el enlace de Flighty de alguien
 * nunca sale del Worker aunque la fila sí viaje, que una ausencia solo la
 * escribe quien vive en casa, y que la fecha del santo se lee de lo que un
 * modelo escribe aunque no escriba cifras.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { componerInstantanea } from '../src/filtrado.js';
import { aplicarCambio } from '../src/repositorio.js';
import { circuloAdmite, circuloDe, normalizarPlugin, pluginDeEvento } from '../src/plugins.js';
import { interpretarSanto } from '../src/redaccion.js';

const ANA = { id: 'p-ana', nombre: 'Ana', tiene_cuenta: true, rol: 'administrador', circulo: 'familia' };
const ABUELA = { id: 'p-abuela', nombre: 'la abuela', tiene_cuenta: true, rol: 'miembro', circulo: 'extendida' };
const VECINO = { id: 'p-vecino', nombre: 'Pepe', tiene_cuenta: true, rol: 'miembro', circulo: 'amigos' };

const registro = (extra = {}) => ({
  personas: [ANA, ABUELA, VECINO],
  atributos_persona: [],
  categorias: [{ id: 'general', nombre: 'General', regla: 'publica' }],
  acceso_categoria: [],
  etiquetas: [],
  tipos_evento: [],
  eventos: [],
  ideas: [],
  ocasiones: [],
  regalos: [],
  comentarios: [],
  conflictos: [],
  ...extra,
});

const evento = (id, campos = {}) => ({
  id, titulo: id, tipo_id: 'otro', inicio: '2026-09-15T18:00:00', jornada_completa: false,
  origen: 'manual', participantes: [], activo: true, ...campos,
});

// ------------------------------------------------------------ El círculo --

test('el círculo se cierra por arriba: casa recibe todo, amigos solo lo abierto a amigos', () => {
  assert.equal(circuloAdmite('familia', 'familia'), true);
  assert.equal(circuloAdmite('familia', 'extendida'), false);
  assert.equal(circuloAdmite('extendida', 'extendida'), true);
  assert.equal(circuloAdmite('extendida', 'amigos'), false);
  assert.equal(circuloAdmite('amigos', 'amigos'), true);
  // Sin círculo escrito se cae en extendida, como en la base.
  assert.equal(circuloAdmite('familia', undefined), false);
  assert.equal(circuloAdmite('extendida', undefined), true);
});

test('lo escrito pisa el valor de origen, y lo ilegible no', () => {
  assert.equal(circuloDe({}, 'viajes'), 'amigos');
  assert.equal(circuloDe({ viajes: { circulo: 'familia' } }, 'viajes'), 'familia');
  assert.equal(circuloDe({ viajes: { circulo: 'marte' } }, 'viajes'), 'amigos');
  assert.equal(circuloDe({}, 'extraescolares'), 'familia');
});

test('de qué plugin es cada evento', () => {
  assert.equal(pluginDeEvento(evento('a')), 'puntuales');
  assert.equal(pluginDeEvento(evento('b', { origen: 'importado' })), 'viajes');
  assert.equal(pluginDeEvento(evento('c', { plugin_id: 'extraescolar' })), 'extraescolares');
  assert.equal(pluginDeEvento(evento('d', { plugin_id: 'finde' })), 'finde');
});

test('la instantánea corta por el círculo del plugin antes de transmitir', () => {
  const r = registro({
    eventos: [
      evento('cena'),
      evento('hipica', { plugin_id: 'extraescolar' }),
      evento('sierra', { plugin_id: 'finde' }),
    ],
    plugins: {},
  });

  const ids = (persona) => componerInstantanea(r, persona).eventos.map((e) => e.id).sort();
  // Casa lo recibe todo; la abuela, lo puntual; el vecino, también lo puntual,
  // que está abierto a amigos de origen.
  assert.deepEqual(ids(ANA), ['cena', 'hipica', 'sierra']);
  assert.deepEqual(ids(ABUELA), ['cena']);
  assert.deepEqual(ids(VECINO), ['cena']);

  // Cerrar lo puntual a casa desde la hoja se lo quita al vecino y a la abuela.
  const cerrado = registro({ eventos: r.eventos, plugins: { puntuales: { circulo: 'familia' } } });
  assert.deepEqual(componerInstantanea(cerrado, ABUELA).eventos.map((e) => e.id), []);
  assert.deepEqual(componerInstantanea(cerrado, ANA).eventos.length, 3);
});

test('lo que le pasa a un día suelto viaja con su evento, y no sin él', () => {
  const r = registro({
    eventos: [evento('hipica', { plugin_id: 'extraescolar' })],
    dias_evento: [
      { id: 'dia:hipica:2026-12-25', evento_id: 'hipica', fecha: '2026-12-25', cancelado: true, activo: true },
    ],
  });
  assert.equal(componerInstantanea(r, ANA).dias_evento.length, 1);
  assert.equal(componerInstantanea(r, ABUELA).dias_evento.length, 0);
});

// -------------------------------------------------------------- El enlace --

test('el enlace de Flighty no sale del Worker: la fila viaja, el secreto no', () => {
  const r = registro({
    calendarios_externos: [
      { id: 'cal-p-ana', nombre: 'Viajes de Ana', tipo_evento_id: 'viaje', persona_id: 'p-ana', url_feed: 'https://flighty.example/a91f.ics' },
      { id: 'cal-viajes', nombre: 'Viajes', tipo_evento_id: 'viaje', persona_id: null, url_feed: null },
    ],
  });
  const calendarios = componerInstantanea(r, ANA).calendarios_externos;
  assert.equal(calendarios.length, 2);
  for (const cal of calendarios) assert.equal('url_feed' in cal, false);
  assert.equal(calendarios[0].tiene_enlace, true);
  assert.equal(calendarios[1].tiene_enlace, false);
  assert.equal(JSON.stringify(componerInstantanea(r, VECINO)).includes('a91f.ics'), false);
});

// ------------------------------------------------------------ La ausencia --

/** La base de mentira de siempre: contesta por fragmento de SQL. */
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

test('una ausencia la escribe quien vive en casa; la abuela, no', async () => {
  const cambio = {
    tipo: 'ausencia', id: 'au1', actualizado_en: '2026-09-01T10:00:00Z',
    campos: { persona_id: 'p-ana', desde: '2026-12-20', hasta: '2026-12-27', cubre_id: null, activo: 1 },
  };
  const deAna = await aplicarCambio(baseFalsa(), ANA, cambio);
  assert.equal(deAna.aplicado, true);

  const deLaAbuela = await aplicarCambio(baseFalsa(), ABUELA, cambio);
  assert.equal(deLaAbuela.aplicado, false);
  assert.match(deLaAbuela.motivo, /vive en casa/);
});

test('lo ajustado de un plugin lo guarda quien administra, saneado', async () => {
  const db = baseFalsa();
  const resultado = await aplicarCambio(db, ANA, {
    tipo: 'plugin', id: 'cumples', actualizado_en: '2026-09-01T10:00:00Z',
    campos: { circulo: 'amigos', aviso: { familia: 7, extendida: 1, amigos: 0, marte: 4 }, santos: true, basura: 'no' },
  });
  assert.equal(resultado.aplicado, true);
  const escrito = db.ejecutadas.find((e) => e.sql.includes('INSERT INTO configuracion'));
  assert.equal(escrito.args[0], 'plugins.cumples');
  assert.deepEqual(JSON.parse(escrito.args[1]), {
    circulo: 'amigos', aviso: { familia: 7, extendida: 1, amigos: 0 }, santos: true,
  });

  const deLaAbuela = await aplicarCambio(baseFalsa(), ABUELA, {
    tipo: 'plugin', id: 'cumples', campos: { circulo: 'familia' },
  });
  assert.equal(deLaAbuela.aplicado, false);
});

test('un vuelo importado admite la vuelta puesta a mano en `extra`, y nada más', async () => {
  const anterior = { id: 'v1', origen: 'importado', actualizado_en: '2026-01-01T00:00:00Z' };
  const db = baseFalsa({ 'SELECT * FROM evento WHERE id = ?': anterior });
  const bien = await aplicarCambio(db, ANA, {
    tipo: 'evento', id: 'v1', actualizado_en: '2026-09-01T10:00:00Z', campos: { extra: { vuelta: '2026-09-18' } },
  });
  assert.equal(bien.aplicado, true);
  const escrito = db.ejecutadas.find((e) => e.sql.includes('UPDATE evento SET'));
  assert.equal(escrito.args[0], '{"vuelta":"2026-09-18"}');

  const mal = await aplicarCambio(baseFalsa({ 'SELECT * FROM evento WHERE id = ?': anterior }), ANA, {
    tipo: 'evento', id: 'v1', actualizado_en: '2026-09-01T10:00:00Z', campos: { titulo: 'otro' },
  });
  assert.equal(mal.aplicado, false);
});

test('normalizar tira lo que no es de un plugin', () => {
  assert.deepEqual(normalizarPlugin(null), {});
  assert.deepEqual(normalizarPlugin({ nombre: '  Hípica  ', emoji: '🐴', tipos: ['celebracion', 3, ''] }), {
    nombre: 'Hípica', emoji: '🐴', tipos: ['celebracion'],
  });
});

// ---------------------------------------------------------------- El santo --

test('la fecha del santo se lee en cifras, en palabras y con adorno', () => {
  assert.equal(interpretarSanto('13/12'), '12-13');
  assert.equal(interpretarSanto('13-12'), '12-13');
  assert.equal(interpretarSanto('13 de diciembre'), '12-13');
  assert.equal(interpretarSanto('Santa Lucía se celebra el 13 de Diciembre.'), '12-13');
  assert.equal(interpretarSanto('4/3'), '03-04');
});

test('«no lo sé» y una fecha que no existe se quedan en nada', () => {
  assert.equal(interpretarSanto('no lo sé'), null);
  assert.equal(interpretarSanto('No lo sé.'), null);
  assert.equal(interpretarSanto('31/02'), null);
  assert.equal(interpretarSanto('13/13'), null);
  assert.equal(interpretarSanto(''), null);
});
