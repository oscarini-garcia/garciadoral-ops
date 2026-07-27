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

import { cuadroVacio, esDeLaCasa, normalizarCuadro, caducarTratos, TURNOS } from '../src/lio.js';
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
  assert.deepEqual(instantanea.lio_cuadro, cuadroVacio());
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
  assert.deepEqual(JSON.parse(escritura.args[1]).manana[0], 'p-marta');
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
