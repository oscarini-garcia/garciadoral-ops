/**
 * El reparto por días de un evento que dura más de uno, y su tramo.
 *
 * Lo que se prueba aquí es lo único de esta pieza que no se ve mirando la
 * pantalla: que **el tramo se cuenta sobre la instancia entera y no sobre los
 * días que se están mirando**. Si la semana empieza el lunes y el evento arrancó
 * el sábado anterior, el lunes tiene que decir «3/5» y no «1/3» —lo contrario
 * sería una cuenta que cambia según por dónde entres, que es peor que no tener
 * cuenta—.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { repartirPorDia, tramoDe } from '../publico/js/semana.js';

const dia = (iso) => new Date(`${iso}T00:00:00`);
const dias = (desde, cuantos) =>
  Array.from({ length: cuantos }, (_, i) => new Date(dia(desde).getTime() + i * 86400000));

/** Una instancia ya derivada, que es lo que `repartirPorDia` recibe de verdad. */
const instancia = (inicio, fin, evento = {}) => ({
  evento: { id: 'ev', titulo: 'Se queda Julia a dormir', ...evento },
  inicio: new Date(inicio),
  fin: new Date(fin),
});

test('un evento de un día no lleva tramo', () => {
  const reparto = repartirPorDia(
    [instancia('2026-08-01T19:00:00', '2026-08-01T19:00:00')],
    dias('2026-08-01', 3),
  );
  const aparicion = reparto.get('2026-08-01')[0];

  assert.equal(aparicion.tramo, null);
  assert.equal(tramoDe(aparicion), null);
  assert.equal(reparto.get('2026-08-02').length, 0);
});

test('uno de tres días sale los tres, y cada uno dice por dónde va', () => {
  const reparto = repartirPorDia(
    [instancia('2026-08-01T19:00:00', '2026-08-03T19:00:00')],
    dias('2026-08-01', 4),
  );

  assert.deepEqual(
    ['2026-08-01', '2026-08-02', '2026-08-03'].map((d) => reparto.get(d).length),
    [1, 1, 1],
  );
  assert.equal(reparto.get('2026-08-04').length, 0);

  const [primero, segundo, tercero] = ['2026-08-01', '2026-08-02', '2026-08-03']
    .map((d) => reparto.get(d)[0]);

  assert.equal(primero.continuacion, false);
  assert.equal(segundo.continuacion, true);
  assert.deepEqual(segundo.tramo, { cual: 2, de: 3 });
  assert.equal(tramoDe(segundo), '2/3');
  assert.equal(tramoDe(tercero), '3/3');
});

test('el primer día se queda con su hora, y sin ella dice el tramo', () => {
  const conHora = repartirPorDia(
    [instancia('2026-08-01T19:00:00', '2026-08-03T19:00:00')],
    dias('2026-08-01', 3),
  ).get('2026-08-01')[0];
  // La hora es la pregunta de ese día; cuánto dura lo contesta entera la hoja.
  assert.equal(tramoDe(conHora), null);

  const todoElDia = repartirPorDia(
    [instancia('2026-08-01T00:00:00', '2026-08-03T00:00:00', { jornada_completa: true })],
    dias('2026-08-01', 3),
  ).get('2026-08-01')[0];
  assert.equal(tramoDe(todoElDia), '1/3');
});

test('el tramo se cuenta sobre el evento entero y no sobre lo que se está mirando', () => {
  // Cinco días, del sábado al miércoles, mirados desde una semana que empieza el
  // lunes: solo se ven los tres últimos.
  const reparto = repartirPorDia(
    [instancia('2026-08-01T00:00:00', '2026-08-05T00:00:00', { jornada_completa: true })],
    dias('2026-08-03', 5),
  );

  assert.equal(tramoDe(reparto.get('2026-08-03')[0]), '3/5');
  assert.equal(tramoDe(reparto.get('2026-08-05')[0]), '5/5');
  // Y el lunes es continuación aunque sea el primer día que se ve.
  assert.equal(reparto.get('2026-08-03')[0].continuacion, true);
});
