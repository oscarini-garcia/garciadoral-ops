/**
 * Las novedades — js/novedades.js, el texto detrás de las tarjetas de
 * Ajustes → Novedades.
 *
 * Lo que esto sujeta es «antes de cada mergeo, eso se ha escrito», y la única
 * manera de que sea una propiedad del repositorio y no de la memoria de quien
 * hace la vuelta es que la prueba se ponga en rojo si se olvida:
 * `.github/workflows/pruebas.yml` la corre en cada PR, igual que ya hace con
 * `tests/test_version.py` para las otras tres versiones.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NOVEDADES } from '../publico/js/novedades.js';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paquete = JSON.parse(readFileSync(resolve(raiz, 'package.json'), 'utf-8'));
const mostrada = readFileSync(resolve(raiz, 'publico', 'js', 'version.js'), 'utf-8')
  .match(/VERSION_APP = '([^']+)'/)[1];

test('la primera entrada describe la versión que se está subiendo', () => {
  // Tres copias de un número: package.json es lo que se publica, version.js
  // es lo que dice la pantalla de Hoy, y la primera novedad es lo que lo
  // explica. Esto nota la mano que ha movido solo dos de las tres.
  assert.equal(NOVEDADES[0].version, paquete.version, 'novedades.js no describe la versión de package.json');
  assert.equal(NOVEDADES[0].version, mostrada, 'novedades.js y version.js no coinciden');
});

test('hay para llenar el carrusel, la más nueva primero', () => {
  assert.ok(NOVEDADES.length >= 4, 'la pantalla enseña cuatro tarjetas: la actual y tres anteriores');

  const partes = (v) => v.split('.').map(Number);
  for (let i = 1; i < NOVEDADES.length; i += 1) {
    const [a, b] = [partes(NOVEDADES[i - 1].version), partes(NOVEDADES[i].version)];
    const descendente = a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));
    assert.ok(descendente, `${NOVEDADES[i - 1].version} no va por encima de ${NOVEDADES[i].version}`);
  }
});

test('cada entrada son unas pocas líneas, y completa', () => {
  for (const novedad of NOVEDADES) {
    assert.match(novedad.version, /^\d+\.\d+\.\d+$/, `${novedad.version} no es una versión`);
    assert.match(novedad.fecha, /^\d{4}-\d{2}-\d{2}$/, `${novedad.version} no tiene fecha`);
    assert.ok(novedad.titulo?.trim(), `${novedad.version} no tiene título`);
    assert.ok(
      Array.isArray(novedad.lineas) && novedad.lineas.length >= 1 && novedad.lineas.length <= 6,
      `${novedad.version} necesita entre una y seis líneas — pocas, no un registro de cambios`,
    );
    for (const linea of novedad.lineas) {
      assert.ok(linea.trim(), `${novedad.version} tiene una línea vacía`);
      assert.ok(linea.length <= 160, `${novedad.version} tiene una línea de más de 160 caracteres`);
    }
  }
});

test('la pantalla lee las novedades y el armazón las lleva', () => {
  const app = readFileSync(resolve(raiz, 'publico', 'js', 'app.js'), 'utf-8');
  const sw = readFileSync(resolve(raiz, 'publico', 'sw.js'), 'utf-8');

  assert.match(app, /from '\.\/novedades\.js'/);
  assert.match(app, /class: 'novedades'/);
  assert.match(app, /NOVEDADES\.slice\(0, 4\)/);
  assert.match(sw, /'\/js\/novedades\.js'/);

  // Su propio apartado, y no dentro del de la versión: uno contesta «qué
  // versión tengo» —lo que se mira nueve de cada diez veces, y por eso ese
  // abre solo— y el otro «qué trajo», que se lee una vez y no a diario.
  assert.match(app, /acordeon\('Novedades', bloqueDeNovedades/);
  assert.match(app, /function bloqueDeNovedades\(/);

  // Justo debajo de Sincronización, que es el orden en que llegan las dos
  // preguntas.
  const sincronizacion = app.indexOf("acordeon('Sincronización'");
  const novedades = app.indexOf("acordeon('Novedades'");
  assert.ok(sincronizacion > -1 && novedades > sincronizacion && novedades - sincronizacion < 600,
    'los dos apartados se han separado');
});
