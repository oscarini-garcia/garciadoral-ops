/**
 * El séptimo caso: el emoji de un sitio. No es uno de los seis encargos —no
 * tiene instrucción propia en `configuracion`—, así que lo que hay que probar
 * es más corto: que el material es el texto libre tal cual, sin tocar el
 * registro, y que el intérprete separa cinco emojis de lo que sea que
 * responda el modelo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCCION_EMOJI_POR_DEFECTO,
  componerMaterialDeEmoji,
  interpretarEmojis,
  redactar,
} from '../src/redaccion.js';
import { CONFIGURACION, fetchDe, respuestaConTexto } from './apoyo/redaccion.js';

// -------------------------------------------------------- El material --

test('el material del emoji es el nombre tal como se está escribiendo', () => {
  const material = componerMaterialDeEmoji('Bolonia');
  assert.deepEqual(material.lineas, ['Nombre del sitio: Bolonia']);
});

test('sin nombre no hay material que mandar', () => {
  assert.deepEqual(componerMaterialDeEmoji(''), { lineas: [] });
  assert.deepEqual(componerMaterialDeEmoji('   '), { lineas: [] });
  assert.deepEqual(componerMaterialDeEmoji(null), { lineas: [] });
});

test('los ya propuestos se le devuelven al modelo para que no se repitan', () => {
  const material = componerMaterialDeEmoji('Bolonia', ['🏖️', '🌊']);
  assert.deepEqual(material.lineas, [
    'Nombre del sitio: Bolonia',
    'Ya has propuesto y no sirven:',
    '  🏖️',
    '  🌊',
  ]);
});

test('un nombre larguísimo no se manda entero', () => {
  const material = componerMaterialDeEmoji('x'.repeat(400));
  assert.equal(material.lineas[0].length <= 220, true);
});

test('el encargo del emoji es el suyo, y no el de contar el día', async () => {
  const buscar = fetchDe([respuestaConTexto('🏖️\n🌊')]);
  const material = componerMaterialDeEmoji('Bolonia');
  await redactar({
    configuracion: CONFIGURACION, material, instruccion: INSTRUCCION_EMOJI_POR_DEFECTO, buscar,
  });

  assert.equal(buscar.llamadas[0].cuerpo.system, INSTRUCCION_EMOJI_POR_DEFECTO);
});

// ---------------------------------------------------------- El intérprete --

test('las cinco líneas numeradas se convierten en cinco emojis', () => {
  const emojis = interpretarEmojis(['1. 🏖️', '2. 🌊', '3. 🐚', '4. ⛱️', '5. 🌅'].join('\n'));
  assert.deepEqual(emojis, ['🏖️', '🌊', '🐚', '⛱️', '🌅']);
});

test('se admite lo que el modelo suele hacer de más: viñetas y espacios', () => {
  const emojis = interpretarEmojis(['- 🏖️', '2) 🌊', '•  🐚'].join('\n'));
  assert.deepEqual(emojis, ['🏖️', '🌊', '🐚']);
});

test('una línea que no parece un emoji se descarta, no se trocea', () => {
  const emojis = interpretarEmojis(['1. 🏖️', '2. Playa de Bolonia, con dunas'].join('\n'));
  assert.deepEqual(emojis, ['🏖️']);
});

test('las líneas de más se descartan, y una respuesta vacía no da emojis', () => {
  const siete = Array.from({ length: 7 }, (_, i) => `${i + 1}. 🏖️`).join('\n');
  assert.equal(interpretarEmojis(siete).length, 5);
  assert.deepEqual(interpretarEmojis(''), []);
  assert.deepEqual(interpretarEmojis(null), []);
});
