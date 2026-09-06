/**
 * Los plugins en el dispositivo: lo que se deriva y lo que se empareja.
 *
 * Lo que se prueba es lo que no se ve mirando la pantalla: que dos vuelos se
 * lean como un viaje y los días de en medio digan «fuera»; que una vuelta
 * escrita a mano cierre un viaje sin vuelo de vuelta; que una actividad de
 * martes y jueves salga los dos días y no el jueves de la semana siguiente;
 * que un día en que se dijo «no hay» no salga; que el santo se derive de la
 * ficha como el cumpleaños; y que una ausencia pase el turno de Lío a quien
 * cubre.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { eventosDeFuera, viajesDe } from '../publico/js/viajes.js';
import { diasSemanalesDe, eventosDerivados, instanciasEn, ocurrencias } from '../publico/js/semana.js';
import { turnoDe } from '../publico/js/lio.js';
import { antelacionDe, circuloAdmite, pluginDeEvento, seEnsena } from '../publico/js/plugins.js';

// Un `localStorage` de mentira para lo que se guarda en el aparato.
globalThis.localStorage = {
  datos: new Map(),
  getItem(clave) { return this.datos.has(clave) ? this.datos.get(clave) : null; },
  setItem(clave, valor) { this.datos.set(clave, String(valor)); },
  removeItem(clave) { this.datos.delete(clave); },
};

const dia = (iso) => new Date(`${iso}T00:00:00`);

const vuelo = (id, fecha, hora, origen, destino, extra = {}) => ({
  id, titulo: `${origen}→${destino} · IB 1234`, tipo_id: 'viaje', inicio: `${fecha}T${hora}:00`,
  jornada_completa: false, origen: 'importado', calendario_id: 'cal-p-oscar', activo: true, notas: '',
  ...extra,
});

const BASE = {
  yo: { id: 'p-ana', circulo: 'familia' },
  personas: [
    { id: 'p-oscar', nombre: 'Óscar', circulo: 'familia', tiene_cuenta: true, activa: true },
    { id: 'p-ana', nombre: 'Ana', circulo: 'familia', tiene_cuenta: true, activa: true, fecha_nacimiento: '1980-05-12', santo: '07-26' },
    { id: 'p-marta', nombre: 'Marta', circulo: 'familia', tiene_cuenta: true, activa: true },
  ],
  calendarios_externos: [{ id: 'cal-p-oscar', nombre: 'Viajes de Óscar', persona_id: 'p-oscar', tipo_evento_id: 'viaje' }],
  tipos_evento: [{ id: 'cumpleanos' }, { id: 'santo' }, { id: 'viaje' }, { id: 'entreno' }],
  eventos: [],
  plugins: {},
};

// ------------------------------------------------------------- Los viajes --

test('ida y vuelta se leen como un viaje, y los días de en medio dicen «fuera»', () => {
  const datos = {
    ...BASE,
    eventos: [vuelo('v1', '2026-09-12', '07:40', 'MAD', 'BLQ'), vuelo('v2', '2026-09-15', '21:10', 'BLQ', 'MAD')],
  };
  const viajes = viajesDe(datos);
  assert.equal(viajes.length, 1);
  assert.equal(viajes[0].ida.id, 'v1');
  assert.equal(viajes[0].vuelta.id, 'v2');

  const fuera = eventosDeFuera(datos);
  assert.equal(fuera.length, 1);
  assert.equal(fuera[0].titulo, 'Óscar fuera');
  assert.equal(fuera[0].inicio, '2026-09-13');
  assert.equal(fuera[0].fin, '2026-09-14');
});

test('una escala se encadena, y otro viaje después no se mezcla con el primero', () => {
  const datos = {
    ...BASE,
    eventos: [
      vuelo('a1', '2026-09-12', '07:40', 'MAD', 'LHR'),
      vuelo('a2', '2026-09-12', '13:00', 'LHR', 'JFK'),
      vuelo('a3', '2026-09-20', '18:00', 'JFK', 'MAD'),
      vuelo('b1', '2026-10-03', '09:00', 'MAD', 'BCN'),
    ],
  };
  const viajes = viajesDe(datos);
  assert.equal(viajes.length, 2);
  assert.deepEqual(viajes[0].tramos.map((t) => t.id), ['a1', 'a2', 'a3']);
  assert.equal(viajes[1].ida.id, 'b1');
  assert.equal(viajes[1].vuelta, null);
  assert.equal(viajes[1].hasta, null);
});

test('sin vuelo de vuelta, la vuelta escrita a mano cierra el viaje', () => {
  const datos = {
    ...BASE,
    eventos: [vuelo('v1', '2026-09-12', '07:40', 'MAD', 'BLQ', { extra: { vuelta: '2026-09-16' } })],
  };
  const [viaje] = viajesDe(datos);
  assert.equal(viaje.vueltaEscrita, true);
  assert.equal(eventosDeFuera(datos)[0].fin, '2026-09-15');
});

// ---------------------------------------------------------- La actividad --

test('una actividad de martes y jueves sale los dos días de cada semana', () => {
  const hipica = {
    id: 'h', titulo: 'Hípica', tipo_id: 'entreno', plugin_id: 'extraescolar',
    inicio: '2026-09-15T18:00:00', fin: '2026-09-15T19:30:00', jornada_completa: false,
    repeticion: 'semanal', repeticion_hasta: '2027-06-20', extra: { dias: [1, 3] }, activo: true,
  };
  assert.deepEqual(diasSemanalesDe(hipica), [1, 3]);

  const dias = ocurrencias(hipica, dia('2026-09-14'), dia('2026-09-27')).map((i) => i.inicio.toISOString().slice(0, 10));
  assert.deepEqual(dias, ['2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24']);
  // La hora es la de la actividad, y la duración también.
  const [primera] = ocurrencias(hipica, dia('2026-09-15'), dia('2026-09-15'));
  assert.equal(primera.inicio.getHours(), 18);
  assert.equal((primera.fin - primera.inicio) / 60000, 90);
});

test('el día en que se dijo «no hay» no sale, y el resto sí', () => {
  const hipica = {
    id: 'h', titulo: 'Hípica', tipo_id: 'entreno', plugin_id: 'extraescolar',
    inicio: '2026-09-15T18:00:00', jornada_completa: false, repeticion: 'semanal',
    extra: { dias: [1, 3] }, activo: true,
  };
  const datos = {
    ...BASE,
    eventos: [hipica],
    dias_evento: [{ id: 'dia:h:2026-09-17', evento_id: 'h', fecha: '2026-09-17', cancelado: true, activo: true }],
  };
  const fechas = instanciasEn(datos, dia('2026-09-14'), dia('2026-09-20'))
    .filter((i) => i.evento.id === 'h')
    .map((i) => i.inicio.toISOString().slice(0, 10));
  assert.deepEqual(fechas, ['2026-09-15']);
});

// ---------------------------------------------------------------- Derivados --

test('el santo se deriva de la ficha como el cumpleaños, y se apaga desde el plugin', () => {
  const ids = eventosDerivados(BASE).map((e) => e.id);
  assert.ok(ids.includes('derivado:cumpleanos:p-ana'));
  assert.ok(ids.includes('derivado:santo:p-ana'));

  const santo = eventosDerivados(BASE).find((e) => e.id === 'derivado:santo:p-ana');
  const [julio] = ocurrencias(santo, dia('2026-07-20'), dia('2026-07-31'));
  assert.equal(julio.inicio.toISOString().slice(0, 10), '2026-07-26');

  const sinSantos = { ...BASE, plugins: { cumples: { santos: false } } };
  assert.ok(!eventosDerivados(sinSantos).some((e) => e.id === 'derivado:santo:p-ana'));
});

test('una ausencia es una banda de la semana y pasa el turno a quien cubre', () => {
  const datos = {
    ...BASE,
    ausencias: [{ id: 'au1', persona_id: 'p-marta', desde: '2026-12-20', hasta: '2026-12-27', cubre_id: 'p-oscar', activo: true }],
    lio_cuadro: { manana: ['p-marta', 'p-marta', 'p-marta', 'p-marta', 'p-marta', 'p-marta', 'p-marta'], noche: [null, null, null, null, null, null, null] },
    paseos: [],
    tratos_paseo: [],
  };
  const banda = eventosDerivados(datos).find((e) => e.id === 'derivado:ausencia:au1');
  assert.equal(banda.titulo, 'Marta fuera');
  assert.equal(banda.inicio, '2026-12-20');
  assert.equal(banda.fin, '2026-12-27');

  // El lunes 21 lo saca Óscar, que cubre; el lunes 28, Marta otra vez.
  assert.equal(turnoDe(datos, '2026-12-21', 'manana', dia('2026-12-01')).asignadoId, 'p-oscar');
  assert.equal(turnoDe(datos, '2026-12-28', 'manana', dia('2026-12-01')).asignadoId, 'p-marta');
});

// ------------------------------------------------------------- Los mandos --

test('cada evento sabe de qué plugin es, y lo apagado no se enseña', () => {
  assert.equal(pluginDeEvento({ origen: 'importado' }), 'viajes');
  assert.equal(pluginDeEvento({ plugin_id: 'finde' }), 'finde');
  assert.equal(pluginDeEvento({ id: 'derivado:santo:p-ana' }), 'cumples');
  assert.equal(pluginDeEvento({ id: 'e1' }), 'puntuales');

  localStorage.setItem('agenda.plugins.ocultos', JSON.stringify({ cumples: true }));
  assert.equal(seEnsena(BASE, { id: 'derivado:cumpleanos:p-ana' }), false);
  assert.equal(seEnsena(BASE, { id: 'e1' }), true);
  localStorage.removeItem('agenda.plugins.ocultos');
  assert.equal(seEnsena(BASE, { id: 'derivado:cumpleanos:p-ana' }), true);
});

test('el círculo de un plugin corta lo derivado para quien no llega', () => {
  assert.equal(circuloAdmite('familia', 'extendida'), false);
  const abuela = { ...BASE, yo: { id: 'p-abuela', circulo: 'extendida' }, plugins: { cumples: { circulo: 'familia' } } };
  assert.equal(seEnsena(abuela, { id: 'derivado:cumpleanos:p-ana' }), false);
  assert.equal(seEnsena(BASE, { id: 'derivado:cumpleanos:p-ana' }), true);
});

test('la antelación del aviso sale del plugin, y la de un cumpleaños del círculo', () => {
  const cumple = { evento: { id: 'derivado:cumpleanos:p-ana', persona_origen_id: 'p-ana' } };
  assert.equal(antelacionDe(BASE, cumple), 7);
  const conAjuste = { ...BASE, plugins: { cumples: { aviso: { familia: 1 } } } };
  assert.equal(antelacionDe(conAjuste, cumple), 1);
  // Lo puntual, la víspera de origen; una actividad, nunca.
  assert.equal(antelacionDe(BASE, { evento: { id: 'e1' } }), 1);
  assert.equal(antelacionDe(BASE, { evento: { id: 'h', plugin_id: 'extraescolar' } }), null);
});
