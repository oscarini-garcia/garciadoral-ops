/**
 * Lío en el servidor.
 *
 * Se comprueban las tres cosas que, si fallan, fallan sin que nadie se entere:
 * que quien no vive en casa no vea ni escriba los paseos, que una propuesta la
 * conteste solo aquel a quien se le hizo —lo único que la convierte en un trato
 * y no en una imposición— y que las propuestas que ya no se pueden aceptar
 * caduquen solas, porque nadie las va a caducar a mano.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cuadroEn, cuadroVacio, esDeLaCasa, guardarCuadro, normalizarCuadro, normalizarVersiones,
  caducarTratos, tramoLocal, TURNOS,
} from '../src/lio.js';
import { aplicarCambio } from '../src/repositorio.js';
import { componerInstantanea } from '../src/filtrado.js';

const OSCAR = { id: 'p-oscar', nombre: 'Óscar', tiene_cuenta: true, rol: 'administrador', circulo: 'familia' };
const MARTA = { id: 'p-marta', nombre: 'Marta', tiene_cuenta: true, rol: 'miembro', circulo: 'familia' };
const ABUELA = { id: 'p-abuela', nombre: 'la abuela', tiene_cuenta: true, rol: 'miembro', circulo: 'extendida' };

/** La misma base de mentira de las demás pruebas: contesta por fragmento de SQL
 *  y recuerda todo lo que se le mandó ejecutar. */
function baseFalsa(respuestas = {}) {
  const ejecutadas = [];
  const buscar = (sql) => Object.keys(respuestas).find((clave) => sql.includes(clave));
  const responder = (sql, args) => {
    ejecutadas.push({ sql, args });
    const clave = buscar(sql);
    return clave === undefined ? null : respuestas[clave];
  };
  const acciones = (sql, args) => ({
    sql,
    args,
    first: async () => responder(sql, args),
    run: async () => responder(sql, args) ?? { meta: { changes: 1 } },
    all: async () => ({ results: responder(sql, args) || [] }),
  });
  return {
    ejecutadas,
    prepare(sql) {
      return { ...acciones(sql, []), bind: (...args) => acciones(sql, args) };
    },
    async batch(sentencias) {
      ejecutadas.push(...sentencias);
      return sentencias.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

const sql = (base, fragmento) => base.ejecutadas.filter((e) => e.sql.includes(fragmento));

function registro(extra = {}) {
  return {
    personas: [OSCAR, MARTA, ABUELA],
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
    lio_cuadro: { manana: ['p-oscar', null, null, null, null, null, null], noche: Array(7).fill('p-marta') },
    paseos: [{ id: 'lio:2026-07-27:manana', fecha: '2026-07-27', turno: 'manana', hecho_por_id: 'p-oscar', activo: true }],
    tratos_paseo: [],
    ...extra,
  };
}

// --------------------------------------------------------------- El cuadro --

test('el cuadro llega saneado aunque venga a medias', () => {
  const cuadro = normalizarCuadro({ manana: ['p-oscar', 42, null], sobra: ['x'] });
  assert.deepEqual(cuadro.manana, ['p-oscar', null, null, null, null, null, null]);
  assert.deepEqual(cuadro.noche, Array(7).fill(null));
  assert.equal('sobra' in cuadro, false);
});

test('un cuadro ilegible no tumba la sincronización', () => {
  assert.deepEqual(normalizarCuadro(null), cuadroVacio());
  assert.deepEqual(normalizarCuadro('{roto'), cuadroVacio());
});

// ------------------------------------------------------------ Quién lo ve --

test('quien no vive en casa no recibe nada de Lío', () => {
  const instantanea = componerInstantanea(registro(), ABUELA);
  assert.deepEqual(instantanea.paseos, []);
  assert.deepEqual(instantanea.tratos_paseo, []);
  assert.deepEqual(instantanea.lio_cuadro, []);
});

test('quien vive en casa lo recibe entero', () => {
  const instantanea = componerInstantanea(registro(), MARTA);
  assert.equal(instantanea.paseos.length, 1);
  assert.deepEqual(instantanea.lio_cuadro.noche, Array(7).fill('p-marta'));
});

test('esDeLaCasa exige círculo y cuenta', () => {
  assert.equal(esDeLaCasa(OSCAR), true);
  assert.equal(esDeLaCasa(ABUELA), false);
  assert.equal(esDeLaCasa({ ...MARTA, tiene_cuenta: false }), false);
  assert.equal(esDeLaCasa(null), false);
});

// ---------------------------------------------------------- Quién escribe --

test('quien no vive en casa no marca un paseo', async () => {
  const base = baseFalsa();
  const resultado = await aplicarCambio(base, ABUELA, {
    tipo: 'paseo',
    id: 'lio:2026-07-28:noche',
    campos: { fecha: '2026-07-28', turno: 'noche', hecho_por_id: ABUELA.id },
  });
  assert.equal(resultado.aplicado, false);
  assert.match(resultado.motivo, /de quien vive en casa/);
  assert.equal(sql(base, 'INSERT INTO paseo').length, 0);
});

test('el cuadro solo lo cambia un administrador', async () => {
  const base = baseFalsa();
  const resultado = await aplicarCambio(base, MARTA, {
    tipo: 'lio_cuadro',
    id: 'lio.cuadro',
    campos: { cuadro: cuadroVacio() },
  });
  assert.equal(resultado.aplicado, false);
  assert.equal(sql(base, 'INSERT INTO configuracion').length, 0);

  const otra = baseFalsa();
  const admitido = await aplicarCambio(otra, OSCAR, {
    tipo: 'lio_cuadro',
    id: 'lio.cuadro',
    campos: { cuadro: { manana: ['p-marta'] } },
  });
  assert.equal(admitido.aplicado, true);
  const escritura = sql(otra, 'INSERT INTO configuracion')[0];
  assert.equal(escritura.args[0], 'lio.cuadro');
  const versiones = JSON.parse(escritura.args[1]);
  assert.equal(versiones.length, 1);
  assert.equal(versiones[0].cuadro.manana[0], 'p-marta');
});

// ------------------------------------------------- El cuadro tiene vigencia --

/**
 * Lo que se protege aquí es que **cambiar el reparto no reescriba el pasado**.
 * Un turno sin fila de `paseo` se deriva del cuadro, y con un solo cuadro se
 * derivaba del de ahora: el martes que nadie marcó cambiaba de dueño al tocar
 * Ajustes. El porqué está en `specs/propuesta-cuadro-con-vigencia.html`.
 */
test('el formato viejo se lee como una versión que vale desde siempre', () => {
  const versiones = normalizarVersiones({ manana: ['p-marta'], noche: [] });
  assert.equal(versiones.length, 1);
  assert.equal(versiones[0].desde, null);
  assert.equal(versiones[0].cuadro.manana[0], 'p-marta');
  // Y sirve para cualquier instante, también uno anterior a que esto existiera.
  assert.equal(cuadroEn(versiones, new Date('2020-01-01T00:00:00Z')).manana[0], 'p-marta');
});

test('cada instante toma el cuadro que gobernaba entonces', () => {
  const versiones = normalizarVersiones([
    { desde: '2026-03-01T00:00:00.000Z', cuadro: { manana: ['p-marta'] } },
    { desde: '2026-07-01T00:00:00.000Z', cuadro: { manana: ['p-oscar'] } },
  ]);
  assert.equal(cuadroEn(versiones, new Date('2026-05-10T08:00:00Z')).manana[0], 'p-marta');
  assert.equal(cuadroEn(versiones, new Date('2026-07-02T08:00:00Z')).manana[0], 'p-oscar');
  // Antes de la primera vale la primera: un turno de enero no se queda huérfano.
  assert.equal(cuadroEn(versiones, new Date('2026-01-05T08:00:00Z')).manana[0], 'p-marta');
});

test('guardar añade una versión y no pisa la que había', async () => {
  const previa = JSON.stringify([{ desde: '2026-03-01T00:00:00.000Z', cuadro: normalizarCuadro({ manana: ['p-marta'] }) }]);
  const base = baseFalsa({ 'SELECT valor FROM configuracion': { valor: previa } });
  const versiones = await guardarCuadro(base, OSCAR, { manana: ['p-oscar'] }, new Date('2026-07-27T10:00:00Z'));

  assert.equal(versiones.length, 2);
  assert.equal(versiones[0].cuadro.manana[0], 'p-marta');
  assert.equal(versiones[1].cuadro.manana[0], 'p-oscar');
  // Y el martes de marzo sigue siendo de Marta después de haber guardado.
  assert.equal(cuadroEn(versiones, new Date('2026-03-10T06:00:00Z')).manana[0], 'p-marta');
});

test('catorce toques seguidos son una sola versión', async () => {
  // Dos guardados sin que se abra ninguna ventana entre medias: la segunda
  // sustituye a la primera en lugar de apilarse, porque ninguna de las dos
  // llegó a gobernar un turno distinto.
  const previa = JSON.stringify([{ desde: '2026-07-27T12:00:00.000Z', cuadro: normalizarCuadro({ manana: ['p-marta'] }) }]);
  const base = baseFalsa({ 'SELECT valor FROM configuracion': { valor: previa } });
  const versiones = await guardarCuadro(base, OSCAR, { manana: ['p-oscar'] }, new Date('2026-07-27T12:00:30Z'));
  assert.equal(versiones.length, 1);
  assert.equal(versiones[0].cuadro.manana[0], 'p-oscar');
});

test('un guardado después de abrirse una ventana sí añade versión', async () => {
  // Las 12:00 y las 19:00 UTC de ese día son las 14:00 y las 21:00 en Madrid:
  // entre medias abrió la ventana de noche, así que son dos repartos distintos.
  const previa = JSON.stringify([{ desde: '2026-07-27T12:00:00.000Z', cuadro: normalizarCuadro({ manana: ['p-marta'] }) }]);
  const base = baseFalsa({ 'SELECT valor FROM configuracion': { valor: previa } });
  const versiones = await guardarCuadro(base, OSCAR, { manana: ['p-oscar'] }, new Date('2026-07-27T19:00:00Z'));
  assert.equal(versiones.length, 2);
});

test('el tramo se calcula en hora de Madrid y no en UTC', () => {
  // 04:30 UTC en julio son las 06:30 en Madrid: la ventana de mañana ya abrió.
  assert.notEqual(
    tramoLocal(new Date('2026-07-27T03:30:00Z')),
    tramoLocal(new Date('2026-07-27T04:30:00Z')),
  );
});

// ------------------------------------------------------------- El trato --

const PENDIENTE = {
  id: 't1',
  fecha: '2026-07-30',
  turno: 'noche',
  clase: 'cambio',
  proponente_id: 'p-oscar',
  destinatario_id: 'p-marta',
  asignado_previo_id: 'p-oscar',
  estado: 'pendiente',
  actualizado_en: '2026-07-27T10:00:00.000Z',
};

test('una propuesta la contesta aquel a quien se le hizo', async () => {
  const base = baseFalsa({ 'FROM trato_paseo': PENDIENTE });
  const resultado = await aplicarCambio(base, MARTA, {
    tipo: 'trato_paseo',
    id: 't1',
    campos: { estado: 'aceptado' },
    actualizado_en: '2026-07-27T11:00:00.000Z',
  });
  assert.equal(resultado.aplicado, true);
  assert.equal(sql(base, 'UPDATE trato_paseo').length, 1);
});

test('quien la hizo no puede aceptársela a sí mismo', async () => {
  const base = baseFalsa({ 'FROM trato_paseo': PENDIENTE });
  const resultado = await aplicarCambio(base, OSCAR, {
    tipo: 'trato_paseo',
    id: 't1',
    campos: { estado: 'aceptado' },
    actualizado_en: '2026-07-27T11:00:00.000Z',
  });
  assert.equal(resultado.aplicado, false);
  assert.match(resultado.motivo, /la persona a la que se le hizo/);
  assert.equal(sql(base, 'UPDATE trato_paseo').length, 0);
});

test('quien la hizo sí puede retirarla', async () => {
  const base = baseFalsa({ 'FROM trato_paseo': PENDIENTE });
  const resultado = await aplicarCambio(base, OSCAR, {
    tipo: 'trato_paseo',
    id: 't1',
    campos: { activo: 0 },
    actualizado_en: '2026-07-27T11:00:00.000Z',
  });
  assert.equal(resultado.aplicado, true);
});

test('una propuesta ya contestada no se vuelve a contestar', async () => {
  const base = baseFalsa({ 'FROM trato_paseo': { ...PENDIENTE, estado: 'rechazado' } });
  const resultado = await aplicarCambio(base, MARTA, {
    tipo: 'trato_paseo',
    id: 't1',
    campos: { estado: 'aceptado' },
    actualizado_en: '2026-07-27T11:00:00.000Z',
  });
  assert.equal(resultado.aplicado, false);
  assert.match(resultado.motivo, /ya está rechazado/);
});

// ------------------------------------------------------------ La caducidad --

test('el cambio caduca al cerrarse la ventana de su turno', async () => {
  const base = baseFalsa();
  await caducarTratos(base, new Date('2026-07-30T12:00:00Z'));

  const cambios = sql(base, "clase = 'cambio'");
  assert.equal(cambios.length, 1);
  // La noche se cierra a las 24:00 de su día, que ordena donde debe aunque no
  // sea una hora válida.
  assert.match(cambios[0].sql, /WHEN 'noche' THEN '24:00:00'/);
});

test('la corrección caduca a la semana de pedirse, no a la semana del turno', async () => {
  // Es la diferencia que arregla el caso que fallaba callando: marcar el turno
  // ajeno de hace un mes creaba una propuesta ya caducada, que moría en la
  // sincronización siguiente sin que nadie pudiera aceptarla.
  const base = baseFalsa();
  await caducarTratos(base, new Date('2026-07-30T12:00:00Z'));

  const correcciones = sql(base, "clase = 'correccion'");
  assert.equal(correcciones.length, 1);
  assert.match(correcciones[0].sql, /creado_en < \?/);
  assert.doesNotMatch(correcciones[0].sql, /fecha < \?/);
  assert.equal(correcciones[0].args[2], '2026-07-23T12:00:00.000Z');
});

// ------------------------------------------- Antes de aplicar la migración --

/** Base que se comporta como la de verdad mientras faltan las tablas de Lio. */
function baseSinLasTablas() {
  const base = baseFalsa();
  const prepararOriginal = base.prepare.bind(base);
  base.prepare = (sql) => {
    if (!/\b(paseo|trato_paseo)\b/.test(sql)) return prepararOriginal(sql);
    const estallar = async () => { throw new Error('D1_ERROR: no such table: paseo: SQLITE_ERROR'); };
    const acciones = { first: estallar, run: estallar, all: estallar };
    return { ...acciones, bind: () => acciones };
  };
  return base;
}

test('el registro se lee aunque las tablas de Lío no estén todavía', async () => {
  const { leerRegistro } = await import('../src/repositorio.js');
  const registro = await leerRegistro(baseSinLasTablas());
  assert.deepEqual(registro.paseos, []);
  assert.deepEqual(registro.tratos_paseo, []);
});

test('caducar no estalla mientras la tabla no existe', async () => {
  await caducarTratos(baseSinLasTablas(), new Date('2026-07-30T12:00:00Z'));
});

test('un error de base que no sea la tabla ausente sí sube', async () => {
  const base = baseFalsa();
  base.prepare = () => {
    const estallar = async () => { throw new Error('D1_ERROR: database is locked'); };
    return { first: estallar, run: estallar, all: estallar, bind: () => ({ first: estallar, run: estallar, all: estallar }) };
  };
  await assert.rejects(() => caducarTratos(base), /database is locked/);
});

test('los dos turnos y sus ventanas son los acordados', () => {
  assert.deepEqual(TURNOS.map((t) => [t.id, t.desde, t.hasta]), [
    ['manana', 6, 10],
    ['noche', 20, 24],
  ]);
});
