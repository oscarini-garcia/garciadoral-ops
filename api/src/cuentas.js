/**
 * Las cuentas del hogar: la mitad de la aprobación que conoce el esquema local.
 *
 * El portero (`portero/solicitudes.js`) gobierna la sala de espera sin saber
 * qué es una `persona`; cuando un administrador aprueba, le pide a este
 * adaptador las sentencias que crean o vinculan la cuenta, y las ejecuta junto
 * al borrado de la solicitud en un solo lote. Otra aplicación con el mismo
 * patrón —entrar con Apple, esperar, que un administrador te asigne a una
 * cuenta local— copia la carpeta `portero/` y escribe su propio adaptador; esto
 * es lo único que tendría que cambiar.
 */

import { Rechazo } from './portero/errores.js';
import { restosDeCuenta } from './repositorio.js';

const ROLES = ['administrador', 'miembro'];
const CIRCULOS = ['familia', 'extendida', 'amigos'];
/** Familia es el hogar y son cuatro (specs/ux.md §7.1); y solo los de casa
 *  tienen cuenta (H1 en specs/propuesta-ocho-cosas.html). */
const TAMANO_FAMILIA = 4;

export const cuentas = {
  /** El primer «no» barato, antes de tocar la base. */
  validar({ rol, circulo }) {
    if (!ROLES.includes(rol)) throw new Rechazo(`rol no admitido: ${rol}`);
    if (circulo && !CIRCULOS.includes(circulo)) {
      throw new Rechazo(`círculo no admitido: ${circulo}`);
    }
  },

  async vinculadaA(db, apple) {
    return db
      .prepare('SELECT id, nombre FROM persona WHERE identificador_apple = ?')
      .bind(apple)
      .first();
  },

  /**
   * Vincular a una ficha que ya está: conserva su fecha de nacimiento, su
   * círculo y todo lo que otros escribieron con ella. Solo se le pone lo que
   * constituye la cuenta.
   *
   * **Y vale también para quien ya tiene cuenta** (H1 en
   * specs/propuesta-ocho-cosas.html): cambiar de teléfono, restaurar una copia
   * o volver después de darse de baja llegan con otro Apple ID, y antes no
   * había manera de volver a engancharlo. Aprobar sobre esa persona sustituye
   * su Apple ID —las sesiones del anterior dejan de encontrarla, que es como
   * caducan— y barre lo que su cuenta dejó sembrado: aparatos con su token,
   * preferencias y accesos, como en la baja. Solo los de casa tienen cuenta.
   */
  async prepararVinculo(db, { personaId, apple, rol }) {
    const existente = await db
      .prepare('SELECT * FROM persona WHERE id = ? AND activa = 1')
      .bind(personaId)
      .first();
    if (!existente) throw new Rechazo('esa persona no figura en el registro');
    if (existente.circulo !== 'familia') {
      throw new Rechazo(`${existente.nombre} no es de casa, y solo los de casa tienen cuenta`);
    }

    return {
      id: personaId,
      sentencias: [
        ...(existente.tiene_cuenta ? restosDeCuenta(db, personaId) : []),
        db
          .prepare(
            `UPDATE persona
                SET tiene_cuenta = 1, rol = ?, identificador_apple = ?,
                    actualizado_en = datetime('now')
              WHERE id = ?`,
          )
          .bind(rol, apple, personaId),
      ],
      revinculada: Boolean(existente.tiene_cuenta),
    };
  },

  /**
   * Una ficha nueva. El círculo lo dice quien aprueba y, a falta de él,
   * `familia`: el valor por defecto de la columna es `extendida`, y con él una
   * persona aprobada desde la bandeja quedaba fuera de Lío y de Sitios sin que
   * ninguna pantalla dijera por qué.
   */
  async prepararAlta(db, { apple, rol, circulo, persona, solicitud }) {
    const nombre = String(persona?.nombre || solicitud.nombre_declarado || '').trim();
    if (!nombre) throw new Rechazo('hace falta un nombre para crear la ficha');
    // Una ficha nueva con cuenta nace en casa, y solo si queda sitio: con los
    // cuatro puestos, lo que queda es vincular a uno de ellos.
    if (circulo && circulo !== 'familia') {
      throw new Rechazo('solo los de casa tienen cuenta: la ficha nueva va en Familia');
    }
    const { cuantos } = await db
      .prepare(`SELECT COUNT(*) AS cuantos FROM persona WHERE circulo = 'familia' AND activa = 1`)
      .first();
    if (Number(cuantos) >= TAMANO_FAMILIA) {
      throw new Rechazo('no queda sitio en casa: vincula la solicitud a alguien de los cuatro');
    }

    const id = crypto.randomUUID();
    return {
      id,
      sentencias: [
        db
          .prepare(
            `INSERT INTO persona
               (id, nombre, apellidos, fecha_nacimiento, parentesco, circulo,
                tiene_cuenta, identificador_apple, rol, activa)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
          )
          .bind(
            id,
            nombre,
            String(persona?.apellidos || '').trim(),
            persona?.fecha_nacimiento || null,
            String(persona?.parentesco || '').trim(),
            'familia',
            apple,
            rol,
          ),
      ],
    };
  },
};
