/**
 * El nombre que da Apple al entrar.
 *
 * Estas pruebas existen por un rechazo de la App Store. La directriz 4 dice que
 * no se puede pedir el nombre ni el correo después de Sign in with Apple cuando
 * el propio marco de autenticación ya los ha entregado, y la sala de espera
 * abría un formulario preguntando el nombre a todo el mundo.
 *
 * Lo que se comprueba aquí es la pieza que lo evita: recomponer el nombre a
 * partir de lo que Apple devuelve, y saber distinguir cuándo no ha devuelto
 * nada —que es lo normal a partir de la segunda autorización— porque solo
 * entonces hay que preguntarlo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { nombreDe } from '../publico/js/native.js';

test('junta el nombre y los apellidos que entrega Apple', () => {
  assert.equal(nombreDe('Marta', 'Ruiz'), 'Marta Ruiz');
});

test('se apaña con solo una de las dos partes', () => {
  assert.equal(nombreDe('Marta', null), 'Marta');
  assert.equal(nombreDe(undefined, 'Ruiz'), 'Ruiz');
});

test('sin nombre devuelve null, que es lo que manda preguntar', () => {
  // A partir de la segunda autorización Apple no lo entrega, y tampoco viaja
  // nunca en el token: ahí el formulario es el único camino.
  assert.equal(nombreDe(null, null), null);
  assert.equal(nombreDe(undefined, undefined), null);
  assert.equal(nombreDe('', ''), null);
});

test('no cuela un nombre que solo son espacios', () => {
  assert.equal(nombreDe('   ', '  '), null);
});
