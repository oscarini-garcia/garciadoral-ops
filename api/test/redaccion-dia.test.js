/**
 * El primer encargo: contar un día o un tramo de días.
 *
 * Lo que aquí se comprueba no se ve al usarlo —cuando algo va mal el día se
 * comparte igual, tal cual—, así que un fallo en esta pieza es silencioso por
 * diseño. Interesa sobre todo una cosa: que por el material que se le manda al
 * modelo no pueda salir nada que quien pide no ve.
 *
 * Y los cumpleaños, que son el caso raro: no son filas de `evento` sino algo
 * que el dispositivo deriva, y el Worker tuvo que aprender a reconocerlos.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  componerMaterial,
  componerMaterialDePeriodo,
  redactar,
} from '../src/redaccion.js';
import {
  CONFIGURACION,
  INSTANTANEA,
  fetchDe,
  respuestaConTexto,
} from './apoyo/redaccion.js';

// -------------------------------------------------------------- El material --

test('el material solo lleva lo que hay en la instantánea de quien pide', () => {
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1', 'e2', 'ajeno']);

  assert.equal(material.titulo, 'martes 14 de Abril');
  assert.deepEqual(material.lineas, [
    '09:00 · Dentista · Calle Mayor 3',
    'todo el día · Cumpleaños de la abuela',
  ]);
});

test('un identificador que no está en la instantánea se descarta sin ruido', () => {
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['reservado', 'e1']);
  assert.deepEqual(material.lineas, ['09:00 · Dentista · Calle Mayor 3']);
});

test('un día sin nada da un material vacío, y entonces no se llama a nadie', async () => {
  const material = componerMaterial(INSTANTANEA, '2026-04-14', []);
  assert.equal(material.lineas.length, 0);

  const buscar = fetchDe([respuestaConTexto('no debería llegar aquí')]);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, null);
  assert.equal(buscar.llamadas.length, 0);
});

// ------------------------------------------------------------ Cumpleaños --

// Los cumpleaños no son filas de `evento`: el dispositivo los deriva de la
// fecha de nacimiento y los manda con un identificador compuesto. Antes se
// caían aquí en silencio, y el modelo contaba una semana sin el cumpleaños que
// la ocupaba.
const CON_PERSONAS = {
  eventos: INSTANTANEA.eventos,
  personas: [
    { id: 'p-mariona', nombre: 'Mariona', fecha_nacimiento: '1982-04-14', activa: 1 },
    { id: 'p-sin-fecha', nombre: 'Quien sea', fecha_nacimiento: null, activa: 1 },
    { id: 'p-baja', nombre: 'Quien se fue', fecha_nacimiento: '1975-04-14', activa: 0 },
  ],
};

test('el cumpleaños derivado llega al modelo, con el nombre del registro', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['e1', 'derivado:cumpleanos:p-mariona']);

  assert.deepEqual(material.lineas, [
    '09:00 · Dentista · Calle Mayor 3',
    'todo el día · Cumpleaños de Mariona',
  ]);
});

test('también dentro de un tramo', () => {
  const material = componerMaterialDePeriodo(CON_PERSONAS, {
    desde: '2026-04-13',
    hasta: '2026-04-19',
    dias: [{ fecha: '2026-04-14', eventos: ['derivado:cumpleanos:p-mariona', 'e1'] }],
  });

  assert.deepEqual(material.lineas, [
    'martes 14 de Abril:',
    '  todo el día · Cumpleaños de Mariona',
    '  09:00 · Dentista · Calle Mayor 3',
  ]);
});

test('el de quien ya no está en la familia no se deriva', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['derivado:cumpleanos:p-baja']);
  assert.deepEqual(material.lineas, []);
});

test('sin fecha de nacimiento no hay cumpleaños que contar', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['derivado:cumpleanos:p-sin-fecha']);
  assert.deepEqual(material.lineas, []);
});

test('un cumpleaños inventado de alguien que no se ve tampoco pasa', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['derivado:cumpleanos:p-de-otra-familia']);
  assert.deepEqual(material.lineas, []);
});

// Lo que costó encontrar el fallo de los cumpleaños fue el silencio, no el
// descarte. Lo que no se reconoce se devuelve, para que la próxima familia de
// eventos derivados se anuncie en lugar de acortar el mensaje sin más.
test('lo que no se sabe resolver se devuelve en lugar de caerse callando', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['e1', 'derivado:loquesea:p-mariona', 'ev-fantasma']);

  assert.deepEqual(material.lineas, ['09:00 · Dentista · Calle Mayor 3']);
  assert.deepEqual(material.omitidos, ['derivado:loquesea:p-mariona', 'ev-fantasma']);
});

test('y también en un tramo', () => {
  const material = componerMaterialDePeriodo(CON_PERSONAS, {
    desde: '2026-04-13',
    hasta: '2026-04-19',
    dias: [{ fecha: '2026-04-14', eventos: ['e1', 'derivado:viajes:v-1'] }],
  });

  assert.deepEqual(material.omitidos, ['derivado:viajes:v-1']);
});

test('cuando todo se resuelve, no se omite nada', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['e1', 'derivado:cumpleanos:p-mariona']);
  assert.deepEqual(material.omitidos, []);
});

// ------------------------------------------------------ El material del tramo --

const INSTANTANEA_LARGA = {
  eventos: [
    ...INSTANTANEA.eventos,
    { id: 'e3', titulo: 'Entreno de hípica', inicio: '2026-04-13T18:00:00', jornada_completa: 0 },
    { id: 'e4', titulo: 'Dentista', inicio: '2026-04-16T10:00:00', jornada_completa: 0 },
  ],
};

const SEMANA = {
  desde: '2026-04-13',
  hasta: '2026-04-19',
  dias: [
    { fecha: '2026-04-13', eventos: ['e3'] },
    { fecha: '2026-04-14', eventos: ['e1', 'e2'] },
    { fecha: '2026-04-15', eventos: [] },
    { fecha: '2026-04-16', eventos: ['e4'] },
  ],
};

test('el tramo se compone por días, con el rango por encabezado', () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, SEMANA);

  assert.equal(material.titulo, 'del 13 al 19 de Abril de 2026');
  assert.deepEqual(material.lineas, [
    'lunes 13 de Abril:',
    '  18:00 · Entreno de hípica',
    'martes 14 de Abril:',
    '  09:00 · Dentista · Calle Mayor 3',
    '  todo el día · Cumpleaños de la abuela',
    'jueves 16 de Abril:',
    '  10:00 · Dentista',
  ]);
});

test('los días sin nada no llegan al modelo', () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, SEMANA);
  assert.equal(material.lineas.some((l) => l.startsWith('miércoles 15')), false);
});

test('tampoco en un tramo sale lo que no está en la instantánea de quien pide', () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, {
    desde: '2026-04-13',
    hasta: '2026-04-13',
    dias: [{ fecha: '2026-04-13', eventos: ['reservado', 'e3', 'de-otra-familia'] }],
  });

  assert.deepEqual(material.lineas, ['lunes 13 de Abril:', '  18:00 · Entreno de hípica']);
});

test('el rango dice el mes dos veces solo cuando lo cruza, y el año cuando lo cruza', () => {
  const rango = (desde, hasta) => componerMaterialDePeriodo({ eventos: [] }, { desde, hasta, dias: [] }).titulo;

  assert.equal(rango('2026-04-13', '2026-04-19'), 'del 13 al 19 de Abril de 2026');
  assert.equal(rango('2026-04-27', '2026-05-03'), 'del 27 de Abril al 3 de Mayo de 2026');
  assert.equal(rango('2026-12-28', '2027-01-03'), 'del 28 de Diciembre de 2026 al 3 de Enero de 2027');
  assert.equal(rango('2026-04-14', '2026-04-14'), 'martes 14 de Abril de 2026');
});

test('un tramo entero vacío no llama a nadie', async () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, {
    desde: '2026-05-01', hasta: '2026-05-31', dias: [{ fecha: '2026-05-04', eventos: [] }],
  });
  assert.equal(material.lineas.length, 0);

  const buscar = fetchDe([respuestaConTexto('no debería llegar aquí')]);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });
  assert.equal(resultado.texto, null);
  assert.equal(buscar.llamadas.length, 0);
});

test('un mes desbordado se corta por arriba en lugar de mandarlo entero', () => {
  const eventos = Array.from({ length: 80 }, (_, i) => ({
    id: `x${i}`, titulo: `Evento ${i}`, inicio: '2026-04-14T09:00:00', jornada_completa: 0,
  }));
  const material = componerMaterialDePeriodo({ eventos }, {
    desde: '2026-04-01',
    hasta: '2026-04-30',
    dias: Array.from({ length: 80 }, (_, i) => ({ fecha: '2026-04-14', eventos: [`x${i}`] })),
  });

  // Sesenta eventos como mucho, y no más de cuarenta días recorridos.
  const deEventos = material.lineas.filter((l) => l.startsWith('  '));
  assert.equal(deEventos.length, 40);
});
