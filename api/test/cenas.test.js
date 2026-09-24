/**
 * Cenas: de la casa, con lo de las niñas aparte y con lo que hay en casa.
 *
 * Lo decidido está al pie de `specs/propuesta-cenas.html`. Lo que se prueba
 * aquí es lo que el Worker tiene que defender solo: que fuera de casa el módulo
 * no existe, que un veredicto es uno de los dos, y que el material del encargo
 * lleva la dieta, la línea de las niñas, lo que hay en casa y lo que no se
 * quiere repetir.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { componerInstantanea } from '../src/filtrado.js';
import { aplicarCambio } from '../src/repositorio.js';
import { componerMaterialDeCena, interpretarCenas } from '../src/redaccion.js';

const OSCAR = { id: 'p-oscar', nombre: 'Óscar', tiene_cuenta: true, rol: 'administrador', circulo: 'familia' };
const MARTA = { id: 'p-marta', nombre: 'Marta', tiene_cuenta: true, rol: 'miembro', circulo: 'familia' };
const TIA = { id: 'p-tia', nombre: 'la tía', tiene_cuenta: true, rol: 'miembro', circulo: 'extendida' };

function registro(extra = {}) {
  return {
    personas: [OSCAR, MARTA, TIA],
    atributos_persona: [],
    categorias: [{ id: 'general', nombre: 'General', regla: 'publica' }],
    acceso_categoria: [],
    etiquetas: [],
    tipos_evento: [],
    eventos: [],
    ideas: [],
    ocasiones: [],
    regalos: [],
    comentarios: [],
    conflictos: [],
    recetas: [
      { id: 'r1', nombre: 'Lubina a la plancha', activo: true },
      { id: 'r2', nombre: 'Tortilla de espinacas', activo: true },
    ],
    cenas: [
      { id: 'cena:2026-09-21', fecha: '2026-09-21', receta_id: 'r1', veredicto: 'repetir', activo: true },
      { id: 'cena:2026-09-22', fecha: '2026-09-22', receta_id: 'r2', veredicto: 'no_mas', activo: true },
      {
        id: 'cena:2026-09-23', fecha: '2026-09-23', texto: 'Crema de calabaza',
        ninas_texto: 'Macarrones', activo: true,
      },
    ],
    cenas_casa: { cocina: 'Plancha y horno', dieta: 'Poco hidrato', dieta_ninas: 'Hidrato sí' },
    ausencias: [{ id: 'a1', persona_id: 'p-marta', desde: '2026-09-24', hasta: '2026-09-26', activo: true }],
    ...extra,
  };
}

function baseFalsa(escrituras) {
  return {
    prepare(sql) {
      return {
        bind: (...args) => ({
          first: async () => null,
          run: async () => { escrituras.push({ sql, args }); return { success: true }; },
          all: async () => ({ results: [] }),
        }),
      };
    },
    batch: async (lista) => { escrituras.push(...lista); return []; },
  };
}

test('quien vive en casa recibe las cenas enteras', () => {
  const deOscar = componerInstantanea(registro(), OSCAR);
  assert.equal(deOscar.recetas.length, 2);
  assert.equal(deOscar.cenas.length, 3);
  assert.equal(deOscar.cenas_casa.dieta, 'Poco hidrato');
});

test('para quien no vive en casa Cenas no existe', () => {
  const deLaTia = componerInstantanea(registro(), TIA);
  assert.equal(deLaTia.recetas, undefined);
  assert.equal(deLaTia.cenas, undefined, 'ni siquiera la lista vacía: así la pestaña sabe que no le toca');
  assert.equal(deLaTia.cenas_casa, undefined);
});

test('fuera de casa no se escribe una cena', async () => {
  const escrituras = [];
  const r = await aplicarCambio(baseFalsa(escrituras), TIA, {
    tipo: 'cena', id: 'cena:2026-09-24', campos: { fecha: '2026-09-24', texto: 'Pizza' },
  });
  assert.equal(r.aplicado, false);
  assert.match(r.motivo, /casa/);
  assert.equal(escrituras.length, 0);
});

test('un veredicto es repetir o no más', async () => {
  const escrituras = [];
  const mal = await aplicarCambio(baseFalsa(escrituras), MARTA, {
    tipo: 'cena', id: 'cena:2026-09-24', campos: { fecha: '2026-09-24', veredicto: 'regular' },
  });
  assert.equal(mal.aplicado, false);

  const bien = await aplicarCambio(baseFalsa(escrituras), MARTA, {
    tipo: 'cena', id: 'cena:2026-09-24', campos: { fecha: '2026-09-24', veredicto: 'repetir' },
  });
  assert.equal(bien.aplicado, true);
});

test('cómo se cocina en casa lo cambia quien administra', async () => {
  const escrituras = [];
  const deMarta = await aplicarCambio(baseFalsa(escrituras), MARTA, {
    tipo: 'cenas_casa', id: 'cenas', campos: { dieta: 'Sin hidrato' },
  });
  assert.equal(deMarta.aplicado, false);
  assert.equal(escrituras.length, 0);

  const deOscar = await aplicarCambio(baseFalsa(escrituras), OSCAR, {
    tipo: 'cenas_casa', id: 'cenas', campos: { dieta: 'Sin hidrato' },
  });
  assert.equal(deOscar.aplicado, true);
  assert.equal(escrituras.length, 1);
});

test('el material de una noche lleva la dieta, las niñas, lo que hay y lo que no se repite', () => {
  const instantanea = componerInstantanea(registro(), OSCAR);
  const material = componerMaterialDeCena(instantanea, {
    fechas: ['2026-09-24'], hay: 'calabacín y pollo', hoy: '2026-09-24',
  });
  const texto = material.lineas.join('\n');

  assert.equal(material.cuantas, 5, 'una noche son cinco propuestas');
  assert.match(texto, /Con qué cocinan: Plancha y horno/);
  assert.match(texto, /Qué dieta siguen: Poco hidrato/);
  assert.match(texto, /Las niñas: Hidrato sí/);
  assert.match(texto, /Lo que hay en casa, más o menos: calabacín y pollo/);
  assert.match(texto, /Crema de calabaza \(las niñas: Macarrones\)/);
  assert.match(texto, /les gustó y lo repetirían:\n {2}Lubina a la plancha/);
  assert.match(texto, /no quieren volver a cenar:\n {2}Tortilla de espinacas/);
  assert.match(texto, /Esas noches no están:\n {2}Marta/);
});

test('rellenar la semana pide una por noche y en orden', () => {
  const instantanea = componerInstantanea(registro(), OSCAR);
  const material = componerMaterialDeCena(instantanea, {
    fechas: ['2026-09-27', '2026-09-25', '2026-09-25', 'no-es-fecha'],
  });
  assert.equal(material.cuantas, 2);
  assert.match(material.lineas.join('\n'), /viernes 25 de Septiembre\n {2}domingo 27 de Septiembre/);
});

test('fuera de casa el encargo no tiene material', () => {
  const deLaTia = componerInstantanea(registro(), TIA);
  assert.deepEqual(componerMaterialDeCena(deLaTia, { fechas: ['2026-09-24'] }).lineas, []);
});

test('lo de las niñas se separa del porqué', () => {
  const texto = [
    '1. Lubina a la plancha — quince minutos y una sartén | niñas: lubina con patatas',
    '2. Tortilla de calabacín — aprovecha lo que hay',
  ].join('\n');
  assert.deepEqual(interpretarCenas(texto), [
    { que: 'Lubina a la plancha', porque: 'quince minutos y una sartén', ninas: 'lubina con patatas' },
    { que: 'Tortilla de calabacín', porque: 'aprovecha lo que hay', ninas: '' },
  ]);
});
