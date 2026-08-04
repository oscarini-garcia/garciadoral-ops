/**
 * La sala de espera: quien ha entrado con Apple y todavía no es del hogar.
 *
 * Vive en su propio módulo, y no dentro de `repositorio.js`, por la misma razón
 * por la que vive en su propia tabla: `repositorio.js` habla del registro del
 * hogar, y una solicitud todavía no forma parte de él. La única operación que
 * cruza esa frontera es `aprobarSolicitud`, que es exactamente la operación de
 * cruzarla (specs/autenticacion.md §2) — y por eso no escribe la cuenta ella
 * misma: se la pide al adaptador de cuentas que le pasa la aplicación, que es
 * quien conoce su propio esquema. Este módulo solo sabe de `solicitud_acceso`.
 */

import { Rechazo } from './errores.js';

export { Rechazo };

/** Tope de solicitudes en espera a la vez. Deliberadamente bajo: en un hogar
 *  llegan tres al año, y con este techo cualquier intento de inundar la bandeja
 *  se queda en ruido acotado (specs/autenticacion.md §9). */
export const TOPE_PENDIENTES = 10;

const DIAS_PENDIENTE = 14;
const DIAS_RECHAZADA = 30;

const LARGO_NOMBRE = 80;

const bool = (valor) => valor === 1 || valor === true;

function comoSalida(fila) {
  if (!fila) return null;
  return { ...fila, correo_privado: bool(fila.correo_privado) };
}

/**
 * Borra lo caducado. Se llama al paso, en los dos momentos en que alguien mira
 * esta tabla: cuando alguien intenta entrar y cuando un administrador abre la
 * bandeja.
 *
 * No hay tarea programada a propósito. Una purga en el reloj exigiría
 * credenciales que custodiar y podría llevar meses caída sin que nadie lo note;
 * así, el primero que asome barre lo que sobra. El precio es que en un hogar
 * completamente inactivo las filas sobreviven a su fecha, y como nadie las lee
 * entretanto, es un precio barato.
 *
 * Los catorce días de una pendiente cuentan desde la última vez que su titular
 * asomó, no desde la primera: quien abre la aplicación cada mañana esperando
 * respuesta está diciendo que su solicitud sigue viva, y borrársela el día
 * catorce solo obligaba a la aplicación a reenviarla con otro identificador
 * —y a los administradores, a recibir otro aviso por la misma persona—.
 */
export async function purgarCaducadas(db, {
  diasPendiente = DIAS_PENDIENTE,
  diasRechazada = DIAS_RECHAZADA,
} = {}) {
  await db.batch([
    db
      .prepare(
        `DELETE FROM solicitud_acceso
          WHERE estado = 'pendiente'
            AND COALESCE(visto_en, creado_en) < datetime('now', ?)`,
      )
      .bind(`-${diasPendiente} days`),
    db
      .prepare(
        `DELETE FROM solicitud_acceso
          WHERE estado = 'rechazada' AND actualizado_en < datetime('now', ?)`,
      )
      .bind(`-${diasRechazada} days`),
  ]);
}

export async function solicitudPorApple(db, identificadorApple) {
  const fila = await db
    .prepare('SELECT * FROM solicitud_acceso WHERE identificador_apple = ?')
    .bind(identificadorApple)
    .first();
  return comoSalida(fila);
}

/** Deja constancia de que esta persona ha vuelto a intentar entrar. */
export async function anotarLlegada(db, identificadorApple) {
  await db
    .prepare(
      `UPDATE solicitud_acceso SET visto_en = datetime('now')
        WHERE identificador_apple = ?`,
    )
    .bind(identificadorApple)
    .run();
}

export async function contarPendientes(db) {
  const fila = await db
    .prepare(`SELECT COUNT(*) AS cuantas FROM solicitud_acceso WHERE estado = 'pendiente'`)
    .first();
  return Number(fila?.cuantas || 0);
}

export async function pendientes(db) {
  const { results } = await db
    .prepare(
      `SELECT id, identificador_apple, correo, correo_privado, nombre_declarado,
              creado_en, visto_en
         FROM solicitud_acceso
        WHERE estado = 'pendiente'
        ORDER BY creado_en`,
    )
    .all();
  return (results || []).map(comoSalida);
}

/**
 * Registra una solicitud, o actualiza la que ya hubiera.
 *
 * Volver a solicitar con el mismo identificador de Apple no crea una fila
 * nueva: refresca el nombre y la fecha de la que ya existe. Es el freno del
 * sistema, y por eso la unicidad está en la tabla y no solo aquí.
 *
 * Quien fue rechazado y vuelve a pedirlo regresa a pendiente. Un rechazo es un
 * «ahora no», no una lista negra: si alguien insiste, es que ha hablado con
 * quien decide, y lo que corresponde es que vuelva a aparecer en la bandeja.
 *
 * **El nombre no es obligatorio, y eso es una decisión de la directriz 4.** Lo
 * entrega Apple, pero solo en la primerísima autorización de esa cuenta: a
 * partir de la segunda no llega, y exigirlo aquí obligaba a la pantalla a
 * pedirlo, que es exactamente lo que la App Store rechaza. Sin nombre, quien
 * decide tiene el correo y siempre puede escribirlo al aprobar; y quien espera
 * puede ponerlo desde la sala de espera, que es una corrección voluntaria y no
 * un peaje. Se guarda `''` y no `NULL` para no rehacer una tabla por esto: la
 * columna es `NOT NULL` desde la `0003`.
 */
export async function registrarSolicitud(
  db,
  { identificadorApple, correo, correoPrivado, nombre },
  { tope = TOPE_PENDIENTES } = {},
) {
  const limpio = String(nombre || '').trim().slice(0, LARGO_NOMBRE);

  const existente = await solicitudPorApple(db, identificadorApple);

  if (!existente && (await contarPendientes(db)) >= tope) {
    throw new Rechazo('ahora mismo no se admiten solicitudes nuevas; inténtalo más adelante');
  }

  if (existente) {
    // Volver a pedirlo sin nombre no borra el que ya hubiera, y con el correo
    // pasa lo mismo: Apple deja de entregar los dos a partir de la segunda
    // autorización, y un reintento —o el enlace de «Poner mi nombre», que
    // reenvía— no puede dejar en blanco lo que quien decide ya estaba mirando.
    await db
      .prepare(
        `UPDATE solicitud_acceso
            SET nombre_declarado = ?, correo = ?, correo_privado = ?,
                estado = 'pendiente', resuelta_por = NULL,
                actualizado_en = datetime('now'), visto_en = datetime('now')
          WHERE identificador_apple = ?`,
      )
      .bind(
        limpio || existente.nombre_declarado || '',
        correo || existente.correo || null,
        (correo ? correoPrivado : existente.correo_privado) ? 1 : 0,
        identificadorApple,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO solicitud_acceso
           (id, identificador_apple, correo, correo_privado, nombre_declarado)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), identificadorApple, correo || null, correoPrivado ? 1 : 0, limpio)
      .run();
  }

  return solicitudPorApple(db, identificadorApple);
}

/**
 * Retira la solicitud y borra la fila entera.
 *
 * No deja constancia de que alguien lo intentó, que es lo que uno espera de un
 * botón que dice que borra. Es además la mitad de la directriz 5.1.1(v) que
 * corresponde a quien nunca llegó a tener cuenta.
 */
export async function retirarSolicitud(db, identificadorApple) {
  await db
    .prepare('DELETE FROM solicitud_acceso WHERE identificador_apple = ?')
    .bind(identificadorApple)
    .run();
}

export async function rechazarSolicitud(db, { id, actorId }) {
  const resultado = await db
    .prepare(
      `UPDATE solicitud_acceso
          SET estado = 'rechazada', resuelta_por = ?, actualizado_en = datetime('now')
        WHERE id = ? AND estado = 'pendiente'`,
    )
    .bind(actorId, id)
    .run();

  if (!filasTocadas(resultado)) throw new Rechazo('esa solicitud ya estaba resuelta');
  return { resuelta: true, estado: 'rechazada' };
}

/**
 * Aprueba: traslada a alguien de la sala de espera al registro de la
 * aplicación.
 *
 * Es el único punto del código donde eso ocurre, y la mitad que conoce el
 * esquema de la cuenta local no está aquí: la pone `cuentas`, el adaptador que
 * pasa la aplicación. Debe ofrecer cuatro funciones:
 *
 *   - `validar(datos)` — el primer «no» barato: rol desconocido, círculo que no
 *     existe. Se llama antes de tocar la base.
 *   - `vinculadaA(db, apple)` — `{ id, nombre }` de la cuenta que ya tuviera
 *     ese identificador, o nada.
 *   - `prepararVinculo(db, datos)` / `prepararAlta(db, datos)` — devuelven
 *     `{ id, sentencias }`: las sentencias que crean o vinculan la cuenta, sin
 *     ejecutarlas.
 *
 * Las sentencias del adaptador y el borrado de la solicitud van en **un solo
 * lote**: o queda hecho, o no queda nada a medias. Si dos administradores
 * aprueban a la vez, los dos llegan hasta el lote —las comprobaciones ya habían
 * pasado para ambos— y es la restricción de unicidad del identificador en la
 * tabla de cuentas la que hace fracasar al segundo; aquí se convierte ese fallo
 * de base de datos en un mensaje que se puede enseñar.
 */
export async function aprobarSolicitud(db, cuentas, datos) {
  if (cuentas.validar) cuentas.validar(datos);

  const solicitud = await db
    .prepare(`SELECT * FROM solicitud_acceso WHERE id = ? AND estado = 'pendiente'`)
    .bind(datos.id)
    .first();
  if (!solicitud) throw new Rechazo('esa solicitud ya estaba resuelta');

  const apple = solicitud.identificador_apple;

  // Ese identificador no puede estar ya en otra cuenta. La restricción de
  // unicidad lo impediría de todos modos, pero con un error de base de datos
  // que no le dice nada a nadie.
  const ocupada = await cuentas.vinculadaA(db, apple);
  if (ocupada && ocupada.id !== datos.personaId) {
    throw new Rechazo(`ese identificador de Apple ya está vinculado a ${ocupada.nombre}`);
  }

  const destino = datos.personaId
    ? await cuentas.prepararVinculo(db, { ...datos, apple, solicitud })
    : await cuentas.prepararAlta(db, { ...datos, apple, solicitud });

  // Aprobada es borrada. Conservar la fila dejaría el correo de alguien que ya
  // está dentro guardado para siempre, porque ninguna caducidad alcanza a una
  // solicitud resuelta a favor. A quien entró se le busca en su cuenta.
  const sentencias = [
    ...destino.sentencias,
    db.prepare('DELETE FROM solicitud_acceso WHERE id = ?').bind(datos.id),
  ];

  try {
    await db.batch(sentencias);
  } catch (error) {
    // La carrera de los dos administradores, resuelta por la base: al segundo
    // lote lo tumba la unicidad, y eso no es una avería sino un «ya está hecho».
    if (/unique|constraint/i.test(String(error?.message || error))) {
      throw new Rechazo('esa solicitud acaba de resolverla otro administrador');
    }
    throw error;
  }
  return { resuelta: true, estado: 'aprobada', persona_id: destino.id };
}

/** D1 informa de las filas afectadas en `meta.changes`. */
function filasTocadas(resultado) {
  return Number(resultado?.meta?.changes ?? 0) > 0;
}
