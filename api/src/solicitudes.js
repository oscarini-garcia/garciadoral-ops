/**
 * La sala de espera: quien ha entrado con Apple y todavía no es del hogar.
 *
 * Vive en su propio módulo, y no dentro de `repositorio.js`, por la misma razón
 * por la que vive en su propia tabla: `repositorio.js` habla del registro del
 * hogar, y una solicitud todavía no forma parte de él. La única función que
 * cruza esa frontera es `aprobarSolicitud`, que es exactamente la operación de
 * cruzarla (specs/autenticacion.md §2).
 */

/**
 * Un «no» previsible: la sala llena, una solicitud que el otro administrador
 * acaba de resolver, una persona que ya tiene cuenta. No son averías, y quien
 * llama necesita poder distinguirlas de un fallo para saber qué decir en
 * pantalla.
 */
export class Rechazo extends Error {}

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
 */
export async function purgarCaducadas(db) {
  await db.batch([
    db
      .prepare(
        `DELETE FROM solicitud_acceso
          WHERE estado = 'pendiente' AND creado_en < datetime('now', ?)`,
      )
      .bind(`-${DIAS_PENDIENTE} days`),
    db
      .prepare(
        `DELETE FROM solicitud_acceso
          WHERE estado = 'rechazada' AND actualizado_en < datetime('now', ?)`,
      )
      .bind(`-${DIAS_RECHAZADA} days`),
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
export async function registrarSolicitud(db, { identificadorApple, correo, correoPrivado, nombre }) {
  const limpio = String(nombre || '').trim().slice(0, LARGO_NOMBRE);

  const existente = await solicitudPorApple(db, identificadorApple);

  if (!existente && (await contarPendientes(db)) >= TOPE_PENDIENTES) {
    throw new Rechazo('ahora mismo no se admiten solicitudes nuevas; inténtalo más adelante');
  }

  if (existente) {
    // Volver a pedirlo sin nombre no borra el que ya hubiera: Apple deja de
    // entregarlo a partir de la segunda autorización, y un reintento no puede
    // dejar en blanco lo que quien decide ya estaba mirando.
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
        correo || null,
        correoPrivado ? 1 : 0,
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
 * Aprueba: traslada a alguien de la sala de espera al registro del hogar.
 *
 * Es el único punto del código donde eso ocurre, y tiene dos caminos legítimos.
 * Se vincula a una persona **que ya figuraba sin cuenta** —el caso de la abuela,
 * que conserva su ficha, su fecha de nacimiento y todo lo que otros escribieron
 * con ella— o se crea una persona nueva. El primero es fácil de olvidar y es el
 * que evita duplicar a alguien que ya estaba.
 *
 * Todo va en un solo lote: o queda hecho, o no queda nada a medias.
 */
export async function aprobarSolicitud(db, { id, personaId, persona, rol }) {
  if (!['administrador', 'miembro'].includes(rol)) {
    throw new Rechazo(`rol no admitido: ${rol}`);
  }

  const solicitud = await db
    .prepare(`SELECT * FROM solicitud_acceso WHERE id = ? AND estado = 'pendiente'`)
    .bind(id)
    .first();
  if (!solicitud) throw new Rechazo('esa solicitud ya estaba resuelta');

  const apple = solicitud.identificador_apple;

  // Ese identificador no puede estar ya en otra ficha. La restricción de
  // unicidad de `persona` lo impediría de todos modos, pero con un error de
  // base de datos que no le dice nada a nadie.
  const ocupada = await db
    .prepare('SELECT id, nombre FROM persona WHERE identificador_apple = ?')
    .bind(apple)
    .first();
  if (ocupada && ocupada.id !== personaId) {
    throw new Rechazo(`ese identificador de Apple ya está vinculado a ${ocupada.nombre}`);
  }

  let destino = personaId;
  const sentencias = [];

  if (personaId) {
    const existente = await db
      .prepare('SELECT * FROM persona WHERE id = ? AND activa = 1')
      .bind(personaId)
      .first();
    if (!existente) throw new Rechazo('esa persona no figura en el registro');
    if (existente.tiene_cuenta) throw new Rechazo(`${existente.nombre} ya tiene cuenta`);

    sentencias.push(
      db
        .prepare(
          `UPDATE persona
              SET tiene_cuenta = 1, rol = ?, identificador_apple = ?,
                  actualizado_en = datetime('now')
            WHERE id = ?`,
        )
        .bind(rol, apple, personaId),
    );
  } else {
    const nombre = String(persona?.nombre || solicitud.nombre_declarado || '').trim();
    if (!nombre) throw new Rechazo('hace falta un nombre para crear la ficha');

    destino = crypto.randomUUID();
    sentencias.push(
      db
        .prepare(
          `INSERT INTO persona
             (id, nombre, apellidos, fecha_nacimiento, parentesco,
              tiene_cuenta, identificador_apple, rol, activa)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1)`,
        )
        .bind(
          destino,
          nombre,
          String(persona?.apellidos || '').trim(),
          persona?.fecha_nacimiento || null,
          String(persona?.parentesco || '').trim(),
          apple,
          rol,
        ),
    );
  }

  // Aprobada es borrada. Conservar la fila dejaría el correo de alguien que ya
  // está en el hogar guardado para siempre, porque ninguna caducidad alcanza a
  // una solicitud resuelta a favor. A quien entró se le busca en `persona`.
  sentencias.push(db.prepare('DELETE FROM solicitud_acceso WHERE id = ?').bind(id));

  // Si dos administradores aprueban a la vez, los dos llegan hasta aquí: la
  // comprobación de arriba ya había pasado para ambos. Lo que impide el
  // desaguisado es la unicidad de `persona.identificador_apple`, que hace
  // fracasar el segundo lote entero en lugar de crear dos fichas.
  await db.batch(sentencias);
  return { resuelta: true, estado: 'aprobada', persona_id: destino };
}

/** D1 informa de las filas afectadas en `meta.changes`. */
function filasTocadas(resultado) {
  return Number(resultado?.meta?.changes ?? 0) > 0;
}
