/**
 * Cómo se lee un vuelo importado.
 *
 * Estas pruebas existen por un fallo que se vio en la pantalla: el título de
 * Flighty llegaba con una flecha y un `•` que la expresión regular no
 * contemplaba, el vuelo no se reconocía, y el detalle salía justo del revés
 * —el código de aeropuerto arriba, en el título, y el nombre de la ciudad
 * dentro de la ficha—. Lo que se comprueba aquí es que da igual qué haya entre
 * los códigos y delante del número, porque eso es lo que cambia sin avisar.
 *
 * Y lo contrario: que un título cualquiera con tres letras en mayúscula no se
 * lea como si fuera un vuelo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { presentarVuelo, tituloDeVuelo } from '../publico/js/modelo.js';

/** Las notas tal como las escribe Flighty. */
const NOTAS = 'Air France 1248 Paris to Barcelona ↗ 19:03 CEST ↘ 20:46 CEST '
  + 'Flight time 1 hr, 43 min Open in Flighty flighty://flight/639d0611 '
  + 'Synced by Flighty www.flighty.app';

const vuelo = (titulo, notas = NOTAS) => ({ origen: 'importado', titulo, notas });

test('el título se nombra por las ciudades, con cualquier separador', () => {
  const titulos = [
    'CDG→BCN · AF 1248',   // flecha y punto medio
    'CDG→BCN • AF 1248',   // el bullet que rompió la pantalla
    'CDG⟶BCN • AF 1248',   // flecha larga
    'CDG->BCN - AF 1248',  // ascii
    'CDG-BCN · AF 1248',
    'CDG BCN AF 1248',     // solo espacios
  ];
  for (const titulo of titulos) {
    assert.equal(tituloDeVuelo(vuelo(titulo)), 'París → Barcelona · AF 1248', titulo);
  }
});

test('sin número de vuelo, el título es solo la ruta', () => {
  assert.equal(tituloDeVuelo(vuelo('CDG→BCN')), 'París → Barcelona');
});

test('la ficha conserva los códigos, que es lo que el título ya no dice', () => {
  const ficha = presentarVuelo(vuelo('CDG→BCN • AF 1248'));
  assert.equal(ficha.codigoOrigen, 'CDG');
  assert.equal(ficha.codigoDestino, 'BCN');
  assert.equal(ficha.salida, '19:03');
  assert.equal(ficha.llegada, '20:46');
  assert.equal(ficha.duracion, '1 h 43 min');
  assert.equal(ficha.enlaceFlighty, 'flighty://flight/639d0611');
});

test('el título basta: un vuelo sin notas se sigue nombrando bien', () => {
  assert.equal(tituloDeVuelo(vuelo('LHR→JFK · BA 117', '')), 'Londres → Nueva York · BA 117');
});

test('el huso solo cuenta cuando cambia', () => {
  const mismo = presentarVuelo(vuelo('CDG→BCN · AF 1248'));
  assert.equal(mismo.husoSalida, 'CEST');
  assert.equal(mismo.husoLlegada, 'CEST');

  const cruce = presentarVuelo(vuelo(
    'JFK→LHR · BA 178',
    'British Airways 178 New York to London ↗ 21:30 EST ↘ 09:15 GMT Flight time 7 hr '
    + 'Open in Flighty flighty://flight/y Synced by Flighty www.flighty.app',
  ));
  assert.notEqual(cruce.husoSalida, cruce.husoLlegada);
});

test('lo que no es un vuelo conserva su título', () => {
  // Un evento de la casa, aunque su título tuviera forma de vuelo.
  assert.equal(tituloDeVuelo({ origen: 'manual', titulo: 'CDG→BCN · AF 1248', notas: NOTAS }), null);
  // Tres letras en mayúscula no son un aeropuerto.
  assert.equal(tituloDeVuelo(vuelo('IVA DEL PAN', '')), null);
  assert.equal(tituloDeVuelo(vuelo('Revisión del coche', 'Taller a las 9')), null);
});

test('con códigos que no están en la tabla se cae a lo que digan las notas', () => {
  assert.equal(tituloDeVuelo(vuelo('ZZZ→QQQ · XX 1')), 'Paris → Barcelona');
});
