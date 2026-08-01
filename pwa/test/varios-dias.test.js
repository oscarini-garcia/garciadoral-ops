/**
 * El reparto por días de un evento que dura más de uno.
 *
 * Lo que se prueba aquí es lo único de esta pieza que no se ve mirando la
 * pantalla: que un evento largo **sale todos los días que ocupa**, y que los
 * posteriores al primero quedan marcados como continuación aunque el primero
 * caiga fuera de lo que se está mirando. Una semana que empieza el lunes con
 * algo que arrancó el sábado tiene que decir «(cont.)» ya el lunes; lo contrario
 * sería una marca que cambia según por dónde entres.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { horaDe, repartirPorDia } from '../publico/js/semana.js';

const dia = (iso) => new Date(`${iso}T00:00:00`);
const dias = (desde, cuantos) =>
  Array.from({ length: cuantos }, (_, i) => new Date(dia(desde).getTime() + i * 86400000));

/** Una instancia ya derivada, que es lo que `repartirPorDia` recibe de verdad. */
const instancia = (inicio, fin, evento = {}) => ({
  evento: { id: 'ev', titulo: 'Se queda Julia a dormir', ...evento },
  inicio: new Date(inicio),
  fin: new Date(fin),
});

test('un evento de un día sale un día y no es continuación', () => {
  const reparto = repartirPorDia(
    [instancia('2026-08-01T19:00:00', '2026-08-01T19:00:00')],
    dias('2026-08-01', 3),
  );

  assert.equal(reparto.get('2026-08-01').length, 1);
  assert.equal(reparto.get('2026-08-01')[0].continuacion, false);
  assert.equal(reparto.get('2026-08-02').length, 0);
});

test('uno de tres días sale los tres, y los dos últimos son continuación', () => {
  const reparto = repartirPorDia(
    [instancia('2026-08-01T19:00:00', '2026-08-03T19:00:00')],
    dias('2026-08-01', 4),
  );

  assert.deepEqual(
    ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map((d) => reparto.get(d).length),
    [1, 1, 1, 0],
  );
  assert.deepEqual(
    ['2026-08-01', '2026-08-02', '2026-08-03'].map((d) => reparto.get(d)[0].continuacion),
    [false, true, true],
  );
});

test('la hora es del primer día: los que siguen no la repiten', () => {
  const reparto = repartirPorDia(
    [instancia('2026-08-01T19:00:00', '2026-08-03T19:00:00')],
    dias('2026-08-01', 3),
  );

  assert.equal(horaDe(reparto.get('2026-08-01')[0]), '19:00');
  // Repetir «19:00» tres días seguidos diría que empieza tres veces.
  assert.equal(horaDe(reparto.get('2026-08-02')[0]), null);
});

test('es continuación aunque su primer día caiga fuera de lo que se mira', () => {
  // Cinco días, del sábado al miércoles, mirados desde una semana que empieza el
  // lunes: solo se ven los tres últimos, y el lunes ya viene de antes.
  const reparto = repartirPorDia(
    [instancia('2026-08-01T00:00:00', '2026-08-05T00:00:00', { jornada_completa: true })],
    dias('2026-08-03', 5),
  );

  assert.equal(reparto.get('2026-08-03')[0].continuacion, true);
  assert.equal(reparto.get('2026-08-05')[0].continuacion, true);
  assert.equal(reparto.get('2026-08-06').length, 0);
});
