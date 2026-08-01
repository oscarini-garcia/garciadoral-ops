/**
 * El sexto encargo: lo que dice Lío en su bloque de Hoy.
 *
 * El único que habla en primera persona, y el único cuyo material se **deriva**
 * en lugar de leerse: un turno no es una fila mientras no pasa nada, así que hay
 * que aplicar la misma regla de siempre —manda la fila si existe, y si no el
 * cuadro que gobernaba al abrirse la ventana—. Lo que se comprueba aquí es que
 * esa regla se aplica igual que en la pantalla, porque una frase que diga que le
 * tocaba a quien no le tocaba es peor que no decir nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCCION_LIO_POR_DEFECTO,
  componerMaterialDeLio,
  configuracionPublica,
} from '../src/redaccion.js';
import { CONFIGURACION } from './apoyo/redaccion.js';

// El 14 de abril de 2026 es martes; el 13, lunes.
const CUADRO = [{
  desde: '2020-01-01T00:00:00.000Z',
  cuadro: {
    manana: ['p-ana', 'p-oscar', null, null, null, null, null],
    noche: ['p-oscar', 'p-marta', null, null, null, null, null],
  },
}];

const CASA = {
  personas: [
    { id: 'p-ana', nombre: 'Ana' },
    { id: 'p-oscar', nombre: 'Óscar' },
    { id: 'p-marta', nombre: 'Marta' },
  ],
  lio_cuadro: CUADRO,
  paseos: [],
};

const conPaseos = (paseos) => ({ ...CASA, paseos });
const enPunto = new Date('2026-04-14T23:00:00');

test('sin fila, el turno es de quien dice el cuadro de ese día', () => {
  const material = componerMaterialDeLio(CASA, { fecha: '2026-04-14', ahora: enPunto });

  assert.equal(material.titulo, 'La voz de Lío');
  assert.deepEqual(material.lineas, [
    'Hoy es martes 14 de Abril',
    'Tus turnos de hoy:',
    '  Mañana: le tocaba a Óscar y nadie lo marcó',
    '  Noche: le tocaba a Marta y nadie lo marcó',
  ]);
});

test('la fila manda sobre el cuadro, y dice quién lo sacó de verdad', () => {
  const material = componerMaterialDeLio(conPaseos([
    {
      id: 'lio:2026-04-14:manana', fecha: '2026-04-14', turno: 'manana',
      asignado_id: 'p-oscar', hecho_por_id: 'p-ana', hecho_en: '2026-04-14T07:10:00', activo: 1,
    },
  ]), { fecha: '2026-04-14', ahora: enPunto });

  assert.equal(material.lineas[2], '  Mañana: salió con Ana, y le tocaba a Óscar');
});

test('«no salió» no es lo mismo que «nadie lo marcó»', () => {
  const material = componerMaterialDeLio(conPaseos([
    {
      id: 'lio:2026-04-14:noche', fecha: '2026-04-14', turno: 'noche',
      asignado_id: 'p-marta', hecho_por_id: null, hecho_en: '2026-04-15T00:30:00', activo: 1,
    },
  ]), { fecha: '2026-04-14', ahora: enPunto });

  assert.equal(material.lineas[3], '  Noche: no salió, y le tocaba a Marta');
});

test('antes de que abra la ventana no se dice que nadie lo marcara', () => {
  const material = componerMaterialDeLio(CASA, {
    fecha: '2026-04-14', ahora: new Date('2026-04-14T05:00:00'),
  });

  assert.equal(material.lineas[2], '  Mañana: le toca a Óscar, todavía no ha llegado');
});

test('lo de ayer solo se cuenta si pasó algo, y la racha son los días seguidos', () => {
  const paseos = ['2026-04-11', '2026-04-12', '2026-04-13'].map((fecha) => ({
    id: `lio:${fecha}:manana`, fecha, turno: 'manana',
    asignado_id: 'p-ana', hecho_por_id: 'p-ana', hecho_en: `${fecha}T07:00:00`, activo: 1,
  }));
  const material = componerMaterialDeLio(conPaseos(paseos), { fecha: '2026-04-14', ahora: enPunto });

  assert.equal(material.lineas.at(-2), '  Mañana: salió, con Ana');
  assert.equal(material.lineas.at(-1), 'Llevas 3 días seguidos saliendo al menos una vez');
  assert.ok(material.lineas.includes('Ayer:'));
});

test('una racha rota se para donde se rompe', () => {
  const paseos = ['2026-04-11', '2026-04-13'].map((fecha) => ({
    id: `lio:${fecha}:manana`, fecha, turno: 'manana',
    asignado_id: 'p-ana', hecho_por_id: 'p-ana', hecho_en: `${fecha}T07:00:00`, activo: 1,
  }));
  const material = componerMaterialDeLio(conPaseos(paseos), { fecha: '2026-04-14', ahora: enPunto });

  assert.equal(material.lineas.at(-1), 'Llevas 1 día seguido saliendo al menos una vez');
});

test('un paseo retirado no cuenta ni para el turno ni para la racha', () => {
  const material = componerMaterialDeLio(conPaseos([
    {
      id: 'lio:2026-04-13:manana', fecha: '2026-04-13', turno: 'manana',
      asignado_id: 'p-ana', hecho_por_id: 'p-ana', hecho_en: '2026-04-13T07:00:00', activo: 0,
    },
  ]), { fecha: '2026-04-14', ahora: enPunto });

  assert.ok(!material.lineas.includes('Ayer:'));
  assert.ok(!material.lineas.some((linea) => linea.startsWith('Llevas')));
});

test('el encargo habla en primera persona y le prohíbe reñir de verdad', () => {
  assert.match(INSTRUCCION_LIO_POR_DEFECTO, /Eres Lío/);
  assert.match(INSTRUCCION_LIO_POR_DEFECTO, /CINCO frases distintas entre sí/);
  assert.match(INSTRUCCION_LIO_POR_DEFECTO, /nunca riñes de verdad/);
  assert.match(INSTRUCCION_LIO_POR_DEFECTO, /No inventes quién te sacó/);

  const publica = configuracionPublica({
    ...CONFIGURACION, lio: INSTRUCCION_LIO_POR_DEFECTO, guardada_en: null,
  });
  assert.equal(publica.lio, INSTRUCCION_LIO_POR_DEFECTO);
});
