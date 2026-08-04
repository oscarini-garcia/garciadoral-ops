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

const ROLES = ['administrador', 'miembro'];
const CIRCULOS = ['familia', 'extendida', 'amigos'];

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
   * El camino de la abuela: la persona ya figuraba sin cuenta y conserva su
   * ficha, su fecha de nacimiento, su círculo y todo lo que otros escribieron
   * con ella. Solo se le pone lo que constituye la cuenta.
   */
  async prepararVinculo(db, { personaId, apple, rol }) {
    const existente = await db
      .prepare('SELECT * FROM persona WHERE id = ? AND activa = 1')
      .bind(personaId)
      .first();
    if (!existente) throw new Rechazo('esa persona no figura en el registro');
    if (existente.tiene_cuenta) throw new Rechazo(`${existente.nombre} ya tiene cuenta`);

    return {
      id: personaId,
      sentencias: [
        db
          .prepare(
            `UPDATE persona
                SET tiene_cuenta = 1, rol = ?, identificador_apple = ?,
                    actualizado_en = datetime('now')
              WHERE id = ?`,
          )
          .bind(rol, apple, personaId),
      ],
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
            circulo || 'familia',
            apple,
            rol,
          ),
      ],
    };
  },
};
