/**
 * El tercer encargo: cinco felicitaciones para quien cumple.
 *
 * Su material es a propósito **más pobre** que el del regalo: el texto se le
 * manda a quien cumple, así que ni las ideas ni los regalos entran. Eso es lo
 * que más se comprueba aquí, junto con los años, que son los que cumple y no los
 * cumplidos.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCCION_FELICITACION_POR_DEFECTO,
  componerMaterialDeFelicitacion,
  configuracionPublica,
  interpretarFelicitaciones,
  redactar,
} from '../src/redaccion.js';
import {
  CATALOGO,
  CONFIGURACION,
  fetchDe,
  respuestaConTexto,
} from './apoyo/redaccion.js';

// ------------------------------------------------- El material del cumple --

test('la felicitación lleva quién cumple, los años que cumple y lo que se sabe', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-01-15',
  });

  assert.equal(material.titulo, 'Una felicitación para Marta');
  assert.deepEqual(material.lineas, [
    'Felicita a Marta (hija, cumple 14 años)',
    'Lo que se sabe de ella:',
    '  talla de calzado: 39',
  ]);
});

test('los años son los que cumple, no los cumplidos', () => {
  // El 4 de marzo de 2026 cumple 14; el día mismo se dicen 14, y a partir del
  // día siguiente la que toca escribir ya es la del año que viene.
  const elDia = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-marta', hoy: '2026-03-04' });
  const despues = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });

  assert.equal(elDia.lineas[0], 'Felicita a Marta (hija, cumple 14 años)');
  assert.equal(despues.lineas[0], 'Felicita a Marta (hija, cumple 15 años)');
});

test('sin fecha de nacimiento no se inventa ninguna edad que cumplir', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-ana', hoy: '2026-07-26' });
  assert.equal(material.lineas[0], 'Felicita a Ana (madre)');
});

/**
 * La regla que sostiene esta pieza: lo que se escribe se le manda a quien cumple,
 * de modo que ni las ideas apuntadas para ella, ni el regalo que está esperando en
 * la ocasión abierta, ni lo que recibió el año pasado pueden llegar al modelo.
 */
test('ni las ideas ni los regalos llegan al modelo de una felicitación', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26',
  });
  const entero = material.lineas.join('\n');

  for (const secreto of ['Botas de montar', 'Casco de hípica', 'Una cámara instantánea', 'Navidad']) {
    assert.equal(entero.includes(secreto), false, `se ha colado «${secreto}»`);
  }
});

test('lo ya escrito se le devuelve al modelo para que la siguiente tanda cambie', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26', descartadas: ['¡Felicidades, campeona! 🎉'],
  });

  const desde = material.lineas.indexOf('Ya has escrito estas, escribe otras distintas:');
  assert.notEqual(desde, -1);
  assert.deepEqual(material.lineas.slice(desde + 1), ['  ¡Felicidades, campeona! 🎉']);
});

test('una persona que no está en la instantánea no da felicitación ninguna', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-de-otra-casa' });
  assert.deepEqual(material.lineas, []);
});

test('el encargo de la felicitación es el suyo, y se puede reescribir', async () => {
  const buscar = fetchDe([respuestaConTexto('1. ¡Felicidades! 🎂')]);
  const material = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  await redactar({
    configuracion: { ...CONFIGURACION, felicitacion: 'Felicítala en verso.' },
    material,
    instruccion: 'Felicítala en verso.',
    buscar,
  });

  assert.equal(buscar.llamadas[0].cuerpo.system, 'Felicítala en verso.');

  const publica = configuracionPublica({
    ...CONFIGURACION, felicitacion: INSTRUCCION_FELICITACION_POR_DEFECTO, guardada_en: null,
  });
  assert.equal(publica.felicitacion, INSTRUCCION_FELICITACION_POR_DEFECTO);
});

// ----------------------------------------------- Las cinco felicitaciones --

test('cada línea es una felicitación entera, con sus emojis y su puntuación', () => {
  const felicitaciones = interpretarFelicitaciones([
    '1. ¡Felicidades, Marta! 🎂 Que cumplas muchos más — y que te duren las botas 🐴',
    '2. Otro año montando: ¡felicidades! 🎉🥳',
    '3. «Feliz cumple, crack 🎈»',
    '- Felicidades, guapa 🎁',
    '5) 16 años y sigues igual de brasas 😄 ¡Felicidades!',
  ].join('\n'));

  assert.equal(felicitaciones.length, 5);
  // La raya de dentro no parte nada, la puntuación final se queda y las comillas
  // de los extremos se van.
  assert.equal(felicitaciones[0], '¡Felicidades, Marta! 🎂 Que cumplas muchos más — y que te duren las botas 🐴');
  assert.equal(felicitaciones[1], 'Otro año montando: ¡felicidades! 🎉🥳');
  assert.equal(felicitaciones[2], 'Feliz cumple, crack 🎈');
  assert.equal(felicitaciones[3], 'Felicidades, guapa 🎁');
  // Con separador es numeración; sin él, un número que empieza la frase se queda.
  assert.equal(felicitaciones[4], '16 años y sigues igual de brasas 😄 ¡Felicidades!');
});

test('un número sin separador detrás no se confunde con la numeración', () => {
  assert.deepEqual(interpretarFelicitaciones('16 años ya 🎂'), ['16 años ya 🎂']);
});

test('las felicitaciones de más se descartan, y una respuesta vacía no da ninguna', () => {
  const seis = Array.from({ length: 6 }, (_, i) => `${i + 1}. Felicidades ${i + 1} 🎉`).join('\n');
  assert.equal(interpretarFelicitaciones(seis).length, 5);
  assert.deepEqual(interpretarFelicitaciones(''), []);
  assert.deepEqual(interpretarFelicitaciones(null), []);
});
