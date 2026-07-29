/**
 * El quinto encargo: las frases con las que abre la pantalla de Hoy.
 *
 * El único que nadie pide, y de ahí sus rarezas: se piden cinco de golpe y se
 * enseñan de una en una, el tema sale al azar de lo que la casa usa de verdad, y
 * el encargo tiene prohibido nombrar regalos aunque el material nunca se los dé,
 * porque esta es la pantalla que se lee con alguien al lado.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCCION_CHISPA_POR_DEFECTO,
  componerMaterialDeChispa,
  configuracionPublica,
  interpretarChispas,
  temasDeLaCasa,
} from '../src/redaccion.js';
import {
  CONFIGURACION,
} from './apoyo/redaccion.js';

// ----------------------------------------------------- La frase de cada día --

const CASA = {
  tipos_evento: [
    { id: 'entreno', nombre: 'Entreno' },
    { id: 'viaje', nombre: 'Viaje' },
    { id: 'otro', nombre: 'Otro' },
  ],
  eventos: [
    { id: 'e1', titulo: 'Entreno de hípica', inicio: '2026-04-14T18:00:00', jornada_completa: 0, tipo_id: 'entreno' },
    { id: 'e2', titulo: 'Entreno de hípica', inicio: '2026-04-21T18:00:00', jornada_completa: 0, tipo_id: 'entreno' },
    { id: 'e3', titulo: 'Viaje a la sierra', inicio: '2026-04-16T00:00:00', jornada_completa: 1, tipo_id: 'viaje' },
    { id: 'e4', titulo: 'Recoger un paquete', inicio: '2026-04-15T10:00:00', jornada_completa: 0, tipo_id: 'otro' },
  ],
  lio_cuadro: [{ version: 1 }],
};

test('los temas salen de lo que la casa usa, por cuánto lo usa, y «otro» no cuenta', () => {
  const temas = temasDeLaCasa(CASA);

  assert.deepEqual(temas, ['Entreno', 'Viaje', 'sacar al perro']);
});

test('sin perro no se habla del perro', () => {
  assert.deepEqual(temasDeLaCasa({ ...CASA, lio_cuadro: [], paseos: [] }), ['Entreno', 'Viaje']);
});

test('la frase se compone con lo de hoy, lo que viene y el tema', () => {
  const material = componerMaterialDeChispa(CASA, {
    fecha: '2026-04-14',
    eventos: ['e1'],
    proximos: ['e4', 'e3'],
    tema: 'Entreno',
  });

  assert.equal(material.titulo, 'Las frases de hoy');
  assert.deepEqual(material.lineas, [
    'Hoy es martes 14 de Abril',
    'Hoy hay apuntado:',
    '  18:00 · Entreno de hípica',
    'En los próximos días:',
    '  10:00 · Recoger un paquete',
    '  todo el día · Viaje a la sierra',
    'Si el día da poco de sí, tira de este tema: Entreno',
  ]);
});

test('un día vacío se le cuenta como vacío, que es de lo que va la frase', () => {
  const material = componerMaterialDeChispa(CASA, { fecha: '2026-04-14', tema: 'Viaje' });

  assert.deepEqual(material.lineas, [
    'Hoy es martes 14 de Abril',
    'Hoy no hay nada apuntado.',
    'Si el día da poco de sí, tira de este tema: Viaje',
  ]);
});

test('lo que no está en la instantánea de quien pide no llega al modelo, y se anota', () => {
  const material = componerMaterialDeChispa(CASA, {
    fecha: '2026-04-14',
    eventos: ['e1', 'regalo-reservado'],
    proximos: ['ajeno'],
  });

  assert.deepEqual(material.lineas, [
    'Hoy es martes 14 de Abril',
    'Hoy hay apuntado:',
    '  18:00 · Entreno de hípica',
  ]);
  assert.deepEqual(material.omitidos, ['regalo-reservado', 'ajeno']);
});

test('la tanda son cinco líneas, sin numeración ni comillas y recortadas', () => {
  const frases = interpretarChispas([
    '1. Hípica otra vez. El caballo ya os conoce.',
    '2. «Miércoles: ni lunes ni viernes.»',
    '3) Viaje el jueves. La maleta no se hace sola.',
    '- Agenda vacía. Aprovechad.',
    '5. ' + 'a'.repeat(400),
    '6. Esta sobra.',
  ].join('\n'));

  assert.equal(frases.length, 5);
  assert.equal(frases[0], 'Hípica otra vez. El caballo ya os conoce.');
  assert.equal(frases[1], 'Miércoles: ni lunes ni viernes.');
  assert.equal(frases[3], 'Agenda vacía. Aprovechad.');
  // Dos líneas de teléfono y ni una más.
  assert.equal(frases[4].length, 160);
});

test('sin nada que interpretar la tanda es vacía, y entonces no se enseña línea', () => {
  assert.deepEqual(interpretarChispas(null), []);
  assert.deepEqual(interpretarChispas('   '), []);
});

test('las ya enseñadas viajan para que la segunda tanda no repita a la primera', () => {
  const material = componerMaterialDeChispa(CASA, {
    fecha: '2026-04-14',
    eventos: ['e1'],
    tema: 'Entreno',
    descartadas: ['Hípica otra vez.', '  ', 'Miércoles: ni lunes ni viernes.'],
  });

  assert.deepEqual(material.lineas.slice(-3), [
    'Ya has escrito estas hoy, escribe otras distintas:',
    '  Hípica otra vez.',
    '  Miércoles: ni lunes ni viernes.',
  ]);
});

test('el encargo de la frase pide cinco y prohíbe nombrar regalos', () => {
  assert.match(INSTRUCCION_CHISPA_POR_DEFECTO, /CINCO frases distintas entre sí/);
  assert.match(INSTRUCCION_CHISPA_POR_DEFECTO, /no nombres nunca\s+regalos, ideas ni deseos/);

  const publica = configuracionPublica({
    ...CONFIGURACION, chispa: INSTRUCCION_CHISPA_POR_DEFECTO, guardada_en: null,
  });
  assert.equal(publica.chispa, INSTRUCCION_CHISPA_POR_DEFECTO);
});
