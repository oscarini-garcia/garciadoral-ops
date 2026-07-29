/**
 * El segundo encargo: cinco propuestas de regalo para una persona.
 *
 * Es el material más delicado de los cinco, porque reúne casi todo lo que se
 * sabe de alguien. Lo que se comprueba aquí es que reúne lo de **esa** persona y
 * nada más, y que lo que no está en la instantánea de quien pide tampoco llega
 * al modelo: la idea reservada para quien pregunta no puede salir por aquí.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCCION_REGALO_POR_DEFECTO,
  componerMaterialDeRegalo,
  configuracionPublica,
  interpretarPropuestas,
  redactar,
} from '../src/redaccion.js';
import {
  CATALOGO,
  CONFIGURACION,
  fetchDe,
  respuestaConTexto,
} from './apoyo/redaccion.js';

// ------------------------------------------------- El material del regalo --

test('el material del regalo reúne lo que se sabe de esa persona y de nadie más', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });

  assert.equal(material.titulo, 'Un regalo para Marta');
  assert.deepEqual(material.lineas, [
    'Para Marta (hija, 14 años)',
    'Lo que se sabe de ella:',
    '  talla de calzado: 39',
    'Lo que ha pedido:',
    '  Una cámara instantánea',
    'Ideas que ya hay apuntadas para ella:',
    '  Botas de montar',
    '  Casco de hípica',
    'Lo que ya ha recibido:',
    '  Casco de hípica (Navidad 2025)',
  ]);
});

test('lo que no está en la instantánea de quien pide tampoco llega al modelo', () => {
  // La misma persona, pero mirada por quien no ve ni la idea ni el regalo.
  const recortada = { ...CATALOGO, ideas: [], regalos: [] };
  const material = componerMaterialDeRegalo(recortada, { personaId: 'p-marta', hoy: '2026-07-26' });

  assert.deepEqual(material.lineas, [
    'Para Marta (hija, 14 años)',
    'Lo que se sabe de ella:',
    '  talla de calzado: 39',
  ]);
});

test('una idea descartada no se le propone al modelo como ya apuntada', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  assert.equal(material.lineas.some((l) => l.includes('Descartada hace tiempo')), false);
});

test('sin fecha de nacimiento no se inventa una edad', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-ana', hoy: '2026-07-26' });
  assert.equal(material.lineas[0], 'Para Ana (madre)');
});

test('la edad son los años cumplidos, no los que caen ese año', () => {
  const enero = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-01-15' });
  assert.equal(enero.lineas[0], 'Para Marta (hija, 13 años)');
});

test('la pista de quien apunta se recorta y va al final', () => {
  const material = componerMaterialDeRegalo(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26', pista: `algo para el verano ${'x'.repeat(400)}`,
  });

  const ultima = material.lineas[material.lineas.length - 1];
  assert.equal(material.lineas.includes('Lo que apunta quien lo pide:'), true);
  assert.equal(ultima.startsWith('  algo para el verano'), true);
  assert.equal(ultima.length <= 202, true);
});

test('lo ya propuesto se le devuelve al modelo para que no se repita', () => {
  const material = componerMaterialDeRegalo(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26', descartadas: ['Hamaca de playa', 'Gafas de bucear'],
  });

  const desde = material.lineas.indexOf('Ya has propuesto esto, no lo repitas ni propongas variantes suyas:');
  assert.notEqual(desde, -1);
  assert.deepEqual(material.lineas.slice(desde + 1), ['  Hamaca de playa', '  Gafas de bucear']);
});

test('sin nada propuesto todavía no se le dice nada de repetir', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  assert.equal(material.lineas.some((l) => l.startsWith('Ya has propuesto')), false);
});

test('una persona que no está en la instantánea no da material ninguno', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-de-otra-casa' });
  assert.deepEqual(material.lineas, []);
});

test('el encargo del regalo es el suyo, y no el de contar el día', async () => {
  const buscar = fetchDe([respuestaConTexto('Cámara instantánea\nLleva meses pidiéndola.')]);
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  await redactar({
    configuracion: { ...CONFIGURACION, regalo: 'Propón un regalo.' },
    material,
    instruccion: 'Propón un regalo.',
    buscar,
  });

  assert.equal(buscar.llamadas[0].cuerpo.system, 'Propón un regalo.');
});

test('sin encargo propio guardado se usa el de origen', () => {
  const publica = configuracionPublica({
    ...CONFIGURACION, regalo: INSTRUCCION_REGALO_POR_DEFECTO, guardada_en: null,
  });
  assert.equal(publica.regalo, INSTRUCCION_REGALO_POR_DEFECTO);
});

// -------------------------------------------------- Las cinco propuestas --

test('las cinco líneas numeradas se convierten en cinco propuestas', () => {
  const propuestas = interpretarPropuestas([
    '1. Hamaca de playa plegable — Se lleva la bici a todas partes.',
    '2. Gafas de bucear con tubo — Este año le tocan las calas del norte.',
    '3. Altavoz que aguanta el agua — El suyo no sale del cuarto.',
    '4. Toalla de microfibra grande — La suya ocupa media mochila.',
    '5. Cantimplora térmica de un litro — Sale a montar en agosto.',
  ].join('\n'));

  assert.equal(propuestas.length, 5);
  assert.deepEqual(propuestas[0], {
    que: 'Hamaca de playa plegable',
    porque: 'Se lleva la bici a todas partes.',
  });
  assert.equal(propuestas[4].que, 'Cantimplora térmica de un litro');
});

test('se admite lo que el modelo suele hacer de más: viñetas, comillas y dos puntos', () => {
  const propuestas = interpretarPropuestas([
    '- «Hamaca de playa»: se la lleva a todas partes.',
    '2) Gafas de bucear – le tocan las calas.',
    '• Toalla grande',
  ].join('\n'));

  assert.deepEqual(propuestas, [
    { que: 'Hamaca de playa', porque: 'se la lleva a todas partes.' },
    { que: 'Gafas de bucear', porque: 'le tocan las calas.' },
    { que: 'Toalla grande', porque: '' },
  ]);
});

test('las líneas de más se descartan, y una respuesta vacía no da propuestas', () => {
  const seis = Array.from({ length: 6 }, (_, i) => `${i + 1}. Regalo ${i + 1} — porque sí`).join('\n');
  assert.equal(interpretarPropuestas(seis).length, 5);
  assert.deepEqual(interpretarPropuestas(''), []);
  assert.deepEqual(interpretarPropuestas(null), []);
});
