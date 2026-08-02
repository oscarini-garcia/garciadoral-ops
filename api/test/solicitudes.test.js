/**
 * La sala de espera.
 *
 * Se comprueban aquí las tres cosas que, si fallan, fallan en silencio y en el
 * peor momento: que la credencial de quien espera en la puerta no abra la
 * agenda, que la aprobación no duplique a alguien que ya estaba en el registro,
 * y que el recuento de solicitudes no se le transmita a quien no puede hacer
 * nada con él.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIPO_ESPERA,
  emitirEspera,
  emitirSesion,
  verificarSesionDeEspera,
  verificarSesionPlena,
  verificarSesion,
} from '../src/sesion.js';
import {
  aprobarSolicitud,
  rechazarSolicitud,
  registrarSolicitud,
} from '../src/solicitudes.js';
import { componerInstantanea } from '../src/filtrado.js';

const SECRETO = 'secreto-de-pruebas';
const ANA = { id: 'p-ana', nombre: 'Ana', rol: 'administrador' };

/**
 * Base de datos de mentira. Devuelve lo que se le diga según un fragmento del
 * SQL, y recuerda todo lo que se le pidió ejecutar.
 */
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

// ------------------------------------------------------ La credencial de espera --

test('la credencial de quien espera no abre la agenda', async () => {
  const token = await emitirEspera(SECRETO, '000123.abc', 'ios', {
    direccion: 'marta@ejemplo.es',
    privado: false,
  });

  const datos = await verificarSesionDeEspera(SECRETO, token);
  assert.equal(datos.tipo, TIPO_ESPERA);
  assert.equal(datos.sub, '000123.abc');

  // Lo único que de verdad importa: que no pase por la puerta de la agenda.
  await assert.rejects(() => verificarSesionPlena(SECRETO, token), /no da acceso/);
});

test('la sesión de una persona no sirve como credencial de espera', async () => {
  const token = await emitirSesion(SECRETO, ANA, 'web');
  assert.equal((await verificarSesionPlena(SECRETO, token)).sub, 'p-ana');
  await assert.rejects(() => verificarSesionDeEspera(SECRETO, token), /espera no válida/);
});

test('los tokens antiguos, sin tipo, siguen siendo sesiones plenas', async () => {
  // Se emitieron antes de que existiera la sala de espera y duran treinta días:
  // si dejaran de valer, todo el mundo se quedaría fuera al desplegar esto.
  const token = await emitirSesion(SECRETO, ANA, 'web');
  const [cabecera, cuerpo, firma] = token.split('.');
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  delete datos.tipo;

  const sinTipo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRETO),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const nueva = await crypto.subtle.sign(
    'HMAC', clave, new TextEncoder().encode(`${cabecera}.${sinTipo}`),
  );
  const rehecho = `${cabecera}.${sinTipo}.${Buffer.from(nueva).toString('base64url')}`;

  assert.equal((await verificarSesion(SECRETO, rehecho)).tipo, undefined);
  assert.equal((await verificarSesionPlena(SECRETO, rehecho)).sub, 'p-ana');
  assert.notEqual(firma, undefined);
});

// ------------------------------------------------------------------ El alta --

// La directriz 4 de la App Store: después de Sign in with Apple no se puede
// exigir un dato que el marco de Apple ya entrega. Y el nombre solo llega en la
// primerísima autorización, así que exigirlo aquí obligaba a la pantalla a
// preguntarlo a partir de la segunda vez. Un rechazo por esto costó la 1.1.
test('sin nombre la solicitud sale igual, y se guarda vacío', async () => {
  const db = baseFalsa();
  const solicitud = await registrarSolicitud(db, { identificadorApple: '000123.abc', nombre: '   ' });

  const [alta] = sql(db, 'INSERT INTO solicitud_acceso');
  assert.equal(alta.args.at(-1), '');
  assert.notEqual(solicitud, undefined);
});

test('reenviarla sin nombre no borra el que ya estaba', async () => {
  const db = baseFalsa({
    'FROM solicitud_acceso WHERE identificador_apple': {
      id: 's1', identificador_apple: '000123.abc', estado: 'pendiente',
      nombre_declarado: 'Marta Ruiz', correo_privado: 0,
    },
  });
  await registrarSolicitud(db, { identificadorApple: '000123.abc', nombre: null });

  const [cambio] = sql(db, 'UPDATE solicitud_acceso');
  assert.equal(cambio.args[0], 'Marta Ruiz');
});

test('la sala llena rechaza a quien llega nuevo, no a quien ya estaba', async () => {
  const llena = baseFalsa({ 'COUNT(*) AS cuantas': { cuantas: 10 } });
  await assert.rejects(
    () => registrarSolicitud(llena, { identificadorApple: '000999.zzz', nombre: 'Marta' }),
    /no se admiten solicitudes nuevas/,
  );

  // Quien ya tiene solicitud puede reenviarla aunque la sala esté llena: no
  // añade ninguna fila, y bloquearlo solo dejaría a esa persona sin poder
  // corregir su propio nombre.
  const conSolicitud = baseFalsa({
    'FROM solicitud_acceso WHERE identificador_apple': {
      id: 's1', identificador_apple: '000999.zzz', estado: 'pendiente', correo_privado: 0,
    },
    'COUNT(*) AS cuantas': { cuantas: 10 },
  });
  await registrarSolicitud(conSolicitud, { identificadorApple: '000999.zzz', nombre: 'Marta' });
  assert.equal(sql(conSolicitud, 'INSERT INTO solicitud_acceso').length, 0);
  assert.equal(sql(conSolicitud, 'UPDATE solicitud_acceso').length, 1);
});

test('el nombre declarado se recorta, porque lo escribe un desconocido', async () => {
  const db = baseFalsa();
  await registrarSolicitud(db, { identificadorApple: '000123.abc', nombre: 'M'.repeat(500) });
  const [alta] = sql(db, 'INSERT INTO solicitud_acceso');
  assert.equal(alta.args.at(-1).length, 80);
});

// ------------------------------------------------------------ La aprobación --

const PENDIENTE = {
  "WHERE id = ? AND estado = 'pendiente'": {
    id: 's1', identificador_apple: '000123.abc', nombre_declarado: 'Marta Ruiz',
  },
};

test('aprobar vinculando conserva la ficha que ya estaba', async () => {
  const db = baseFalsa({
    ...PENDIENTE,
    'SELECT * FROM persona WHERE id = ?': { id: 'p-abuela', nombre: 'la abuela', tiene_cuenta: 0 },
  });

  const resultado = await aprobarSolicitud(db, {
    id: 's1', personaId: 'p-abuela', rol: 'miembro',
  });

  assert.equal(resultado.persona_id, 'p-abuela');
  // Lo importante es lo que **no** ocurre: no se crea una segunda abuela.
  assert.equal(sql(db, 'INSERT INTO persona').length, 0);

  const [vinculo] = sql(db, 'UPDATE persona');
  assert.deepEqual(vinculo.args, ['miembro', '000123.abc', 'p-abuela']);
});

test('aprobar sin persona crea una ficha con cuenta', async () => {
  const db = baseFalsa(PENDIENTE);

  const resultado = await aprobarSolicitud(db, {
    id: 's1', persona: { nombre: 'Marta', apellidos: 'Ruiz' }, rol: 'miembro',
  });

  const [alta] = sql(db, 'INSERT INTO persona');
  assert.ok(alta.args.includes('000123.abc'), 'la ficha nueva queda vinculada a Apple');
  assert.ok(alta.args.includes(resultado.persona_id));
  assert.equal(sql(db, 'UPDATE persona').length, 0);
});

test('aprobar borra la solicitud en lugar de marcarla', async () => {
  // Si se conservara, quedaría el correo de alguien que ya está en el hogar
  // guardado para siempre: ninguna caducidad alcanza a una solicitud resuelta a
  // favor. Quien entró se busca en `persona`, que es donde está.
  const db = baseFalsa(PENDIENTE);
  await aprobarSolicitud(db, { id: 's1', persona: { nombre: 'Marta' }, rol: 'miembro' });

  assert.equal(sql(db, 'DELETE FROM solicitud_acceso').length, 1);
  assert.equal(sql(db, 'UPDATE solicitud_acceso').length, 0);
});

test('no se aprueba sobre una persona que ya tiene cuenta', async () => {
  const db = baseFalsa({
    ...PENDIENTE,
    'SELECT * FROM persona WHERE id = ?': { id: 'p-marta', nombre: 'Marta', tiene_cuenta: 1 },
  });
  await assert.rejects(
    () => aprobarSolicitud(db, { id: 's1', personaId: 'p-marta', rol: 'miembro' }),
    /ya tiene cuenta/,
  );
});

test('un identificador de Apple que ya está en otra ficha detiene la aprobación', async () => {
  // Sin esto, la restricción de unicidad de `persona` lo impediría igual, pero
  // con un error de base de datos que no le dice nada a nadie.
  const db = baseFalsa({
    ...PENDIENTE,
    'SELECT id, nombre FROM persona': { id: 'p-otra', nombre: 'Lucía' },
  });
  await assert.rejects(
    () => aprobarSolicitud(db, { id: 's1', rol: 'miembro' }),
    /ya está vinculado a Lucía/,
  );
});

test('el rol se comprueba antes de tocar nada', async () => {
  const db = baseFalsa(PENDIENTE);
  await assert.rejects(
    () => aprobarSolicitud(db, { id: 's1', rol: 'invitado' }),
    /rol no admitido/,
  );
  assert.equal(db.ejecutadas.length, 0);
});

test('una solicitud que el otro administrador ya resolvió no se resuelve dos veces', async () => {
  const aprobada = baseFalsa({ "WHERE id = ? AND estado = 'pendiente'": null });
  await assert.rejects(
    () => aprobarSolicitud(aprobada, { id: 's1', rol: 'miembro' }),
    /ya estaba resuelta/,
  );

  // En el rechazo la condición va en el propio UPDATE, así que la carrera la
  // resuelve la base de datos y aquí solo se cuenta cuántas filas cambiaron.
  const rechazada = baseFalsa({ "SET estado = 'rechazada'": { meta: { changes: 0 } } });
  await assert.rejects(
    () => rechazarSolicitud(rechazada, { id: 's1', actorId: 'p-ana' }),
    /ya estaba resuelta/,
  );
});

// ------------------------------------------------------------- El recuento --

test('el recuento de quien espera solo llega a los administradores', () => {
  const registro = {
    personas: [], atributos_persona: [], categorias: [], acceso_categoria: [],
    etiquetas: [], tipos_evento: [], eventos: [], ideas: [], ocasiones: [],
    regalos: [], comentarios: [], conflictos: [], solicitudes_pendientes: 3,
  };

  const paraAna = componerInstantanea(registro, { id: 'p-ana', rol: 'administrador' });
  assert.equal(paraAna.solicitudes_pendientes, 3);

  const paraMarta = componerInstantanea(registro, { id: 'p-marta', rol: 'miembro' });
  assert.equal(paraMarta.solicitudes_pendientes, 0);
});
