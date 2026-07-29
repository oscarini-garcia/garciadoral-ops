/**
 * El calendario de viajes en el servidor.
 *
 * Se comprueban las reglas que, si fallan, lo hacen en silencio: que la
 * siguiente sincronización actualice en vez de duplicar (id derivado del UID),
 * que el emoji propio sobreviva a un cambio en Google, que un viaje que
 * desaparece se marque inactivo sin borrarse, y que una descarga fallida no
 * toque nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { reconciliarViajes, sincronizarViajes, idDeViaje, CALENDARIO_VIAJES } from '../src/viajes.js';

const AHORA = '2026-07-29T10:00:00Z';

/** Una D1 de mentira que responde por fragmento de SQL y guarda lo ejecutado. */
function baseFalsa({ eventos = [], calendario = { id: CALENDARIO_VIAJES, tipo_evento_id: 'viaje' } } = {}) {
  const ejecutadas = [];
  const acciones = (sql, args) => ({
    sql,
    args,
    first: async () => (sql.includes('FROM calendario_externo') ? calendario : null),
    all: async () => (sql.includes('FROM evento WHERE calendario_id') ? { results: eventos } : { results: [] }),
    run: async () => ({ meta: { changes: 1 } }),
  });
  return {
    ejecutadas,
    prepare(sql) {
      const registrar = (args) => {
        ejecutadas.push({ sql, args });
        return acciones(sql, args);
      };
      return { ...acciones(sql, []), bind: (...args) => registrar(args) };
    },
  };
}

const hechas = (base, frag) => base.ejecutadas.filter((e) => e.sql.includes(frag));
const escribeEnEvento = (e) => /INSERT INTO evento|UPDATE evento SET/.test(e.sql);

test('id derivado del UID: estable y distinto por UID', () => {
  const a = idDeViaje(CALENDARIO_VIAJES, 'uid-1@google.com');
  assert.equal(a, idDeViaje(CALENDARIO_VIAJES, 'uid-1@google.com'));
  assert.notEqual(a, idDeViaje(CALENDARIO_VIAJES, 'uid-2@google.com'));
  assert.match(a, /^viaje-[0-9a-f]{16}$/);
});

test('un viaje nuevo se da de alta', async () => {
  const base = baseFalsa();
  const r = await reconciliarViajes(base, {
    calendarioId: CALENDARIO_VIAJES,
    tipoEventoId: 'viaje',
    eventos: [{ uid: 'u1', titulo: 'Lisboa', inicio: '2026-07-10', fin: '2026-07-12', jornadaCompleta: true, ubicacion: '', notas: '', cancelado: false }],
    ahora: AHORA,
  });
  assert.deepEqual(r, { altas: 1, cambios: 0, bajas: 0 });
  const inserts = hechas(base, 'INSERT INTO evento');
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].args[0], idDeViaje(CALENDARIO_VIAJES, 'u1'));
});

test('un cambio de título actualiza el evento existente', async () => {
  const id = idDeViaje(CALENDARIO_VIAJES, 'u1');
  const base = baseFalsa({
    eventos: [{ id, titulo: 'Lisboa', tipo_id: 'viaje', inicio: '2026-07-10', fin: '2026-07-12', jornada_completa: 1, ubicacion: '', notas: '', origen: 'importado', emoji: '🏖️', activo: 1 }],
  });
  const r = await reconciliarViajes(base, {
    calendarioId: CALENDARIO_VIAJES,
    tipoEventoId: 'viaje',
    eventos: [{ uid: 'u1', titulo: 'Lisboa y Sintra', inicio: '2026-07-10', fin: '2026-07-12', jornadaCompleta: true, ubicacion: '', notas: '', cancelado: false }],
    ahora: AHORA,
  });
  assert.deepEqual(r, { altas: 0, cambios: 1, bajas: 0 });
  assert.equal(hechas(base, 'UPDATE evento SET').length, 1);
});

test('nada cambia: no se reescribe (no se resella la última modificación)', async () => {
  const id = idDeViaje(CALENDARIO_VIAJES, 'u1');
  const base = baseFalsa({
    eventos: [{ id, titulo: 'Lisboa', tipo_id: 'viaje', inicio: '2026-07-10', fin: '2026-07-12', jornada_completa: 1, ubicacion: '', notas: '', origen: 'importado', emoji: null, activo: 1 }],
  });
  const r = await reconciliarViajes(base, {
    calendarioId: CALENDARIO_VIAJES,
    tipoEventoId: 'viaje',
    eventos: [{ uid: 'u1', titulo: 'Lisboa', inicio: '2026-07-10', fin: '2026-07-12', jornadaCompleta: true, ubicacion: '', notas: '', cancelado: false }],
    ahora: AHORA,
  });
  assert.deepEqual(r, { altas: 0, cambios: 0, bajas: 0 });
  assert.equal(hechas(base, 'UPDATE evento SET').length, 0);
});

test('un viaje que desaparece del feed se marca inactivo, no se borra', async () => {
  const id = idDeViaje(CALENDARIO_VIAJES, 'viejo');
  const base = baseFalsa({
    eventos: [{ id, titulo: 'Oporto', tipo_id: 'viaje', inicio: '2026-06-01', fin: null, jornada_completa: 1, ubicacion: '', notas: '', origen: 'importado', emoji: null, activo: 1 }],
  });
  const r = await reconciliarViajes(base, {
    calendarioId: CALENDARIO_VIAJES,
    tipoEventoId: 'viaje',
    eventos: [],
    ahora: AHORA,
  });
  assert.deepEqual(r, { altas: 0, cambios: 0, bajas: 1 });
  const bajas = hechas(base, 'activo = 0');
  assert.equal(bajas.length, 1);
  assert.ok(!base.ejecutadas.some((e) => /DELETE/.test(e.sql)), 'no se borra físicamente');
});

test('un evento cancelado se da de alta inactivo', async () => {
  const base = baseFalsa();
  const r = await reconciliarViajes(base, {
    calendarioId: CALENDARIO_VIAJES,
    tipoEventoId: 'viaje',
    eventos: [{ uid: 'x', titulo: 'Roma', inicio: '2026-08-01', fin: null, jornadaCompleta: true, ubicacion: '', notas: '', cancelado: true }],
    ahora: AHORA,
  });
  assert.deepEqual(r, { altas: 1, cambios: 0, bajas: 0 });
  const insert = hechas(base, 'INSERT INTO evento')[0];
  // El penúltimo argumento es `activo` (antes de creado_en y actualizado_en).
  assert.equal(insert.args[insert.args.length - 3], 0);
});

test('el emoji propio no se toca nunca', async () => {
  const id = idDeViaje(CALENDARIO_VIAJES, 'u1');
  const base = baseFalsa({
    eventos: [{ id, titulo: 'Lisboa', tipo_id: 'viaje', inicio: '2026-07-10', fin: '2026-07-12', jornada_completa: 1, ubicacion: '', notas: '', origen: 'importado', emoji: '🏖️', activo: 1 }],
  });
  await reconciliarViajes(base, {
    calendarioId: CALENDARIO_VIAJES,
    tipoEventoId: 'viaje',
    eventos: [{ uid: 'u1', titulo: 'Lisboa distinta', inicio: '2026-07-10', fin: '2026-07-12', jornadaCompleta: true, ubicacion: '', notas: '', cancelado: false }],
    ahora: AHORA,
  });
  assert.ok(base.ejecutadas.filter(escribeEnEvento).every((e) => !e.sql.includes('emoji')));
});

test('sin URL configurada no se sincroniza ni se toca nada', async () => {
  const base = baseFalsa();
  const r = await sincronizarViajes({ VIAJES_ICAL_URL: '', DB: base }, { ahora: AHORA });
  assert.equal(r.estado, 'sin-configurar');
  assert.equal(base.ejecutadas.length, 0);
});

test('una descarga fallida conserva el último estado', async () => {
  const base = baseFalsa();
  const descargar = async () => ({ ok: false, status: 503 });
  const r = await sincronizarViajes(
    { VIAJES_ICAL_URL: 'https://x/basic.ics', DB: base },
    { ahora: AHORA, descargar },
  );
  assert.equal(r.estado, 'error-descarga');
  assert.equal(r.codigo, 503);
  assert.ok(!base.ejecutadas.some(escribeEnEvento), 'no escribe eventos');
  assert.ok(!base.ejecutadas.some((e) => e.sql.includes('UPDATE calendario_externo')), 'no resella');
});

test('el camino feliz reconcilia y sella la última sincronización', async () => {
  const base = baseFalsa();
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:u1', 'SUMMARY:Lisboa', 'DTSTART;VALUE=DATE:20260710', 'DTEND;VALUE=DATE:20260713', 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const descargar = async () => ({ ok: true, text: async () => ics });
  const r = await sincronizarViajes(
    { VIAJES_ICAL_URL: 'https://x/basic.ics', DB: base },
    { ahora: AHORA, descargar },
  );
  assert.equal(r.estado, 'ok');
  assert.equal(r.altas, 1);
  assert.equal(hechas(base, 'UPDATE calendario_externo').length, 1);
});
