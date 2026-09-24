/**
 * Cenas en el servidor: con qué se cocina en casa y qué dieta se sigue.
 *
 * Lo demás de Cenas —el recetario y lo cenado cada noche— son filas de
 * `receta` y `cena` y viajan por el contrato de siempre (`repositorio.js`).
 * Esto son las tres casillas de `configuracion` que no son filas: cómo se
 * cocina, qué dieta y la línea de las niñas, que pueden cenar un poco distinto
 * (`specs/propuesta-cenas.html`, D1 con la nota de D). Son datos de la casa y
 * no de la instrucción del encargo, a propósito: cambiar de dieta no obliga a
 * reescribir cómo se le pide al modelo.
 */

export const PREFIJO = 'cenas.';

/** Las tres casillas, por su nombre en la instantánea. */
export const CAMPOS_DE_LA_CASA = ['cocina', 'dieta', 'dieta_ninas'];

/** Lo que cabe en cada una: es texto libre, no un documento. */
export const TOPE_DE_CASILLA = 600;

/** Los dos veredictos de una noche. Sin veredicto es no haberlo dicho. */
export const VEREDICTOS = ['repetir', 'no_mas'];

/** `cena:<fecha>`: el dispositivo y el servidor dan con la misma fila. */
export const idCena = (fecha) => `cena:${fecha}`;

export async function leerCocina(db) {
  let results = [];
  try {
    ({ results } = await db
      .prepare('SELECT clave, valor FROM configuracion WHERE clave LIKE ?')
      .bind(`${PREFIJO}%`)
      .all());
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) return vacia();
    throw error;
  }
  const casa = vacia();
  for (const fila of results || []) {
    const nombre = fila.clave.slice(PREFIJO.length);
    if (CAMPOS_DE_LA_CASA.includes(nombre)) casa[nombre] = String(fila.valor || '');
  }
  return casa;
}

const vacia = () => Object.fromEntries(CAMPOS_DE_LA_CASA.map((c) => [c, '']));

/** Guarda solo lo que venga; una cadena vacía borra la casilla. */
export async function guardarCocina(db, persona, campos = {}) {
  const escrituras = [];
  for (const nombre of CAMPOS_DE_LA_CASA) {
    if (!(nombre in campos) || campos[nombre] === null || campos[nombre] === undefined) continue;
    const valor = String(campos[nombre]).trim().slice(0, TOPE_DE_CASILLA);
    const clave = `${PREFIJO}${nombre}`;
    if (!valor) {
      escrituras.push(db.prepare('DELETE FROM configuracion WHERE clave = ?').bind(clave));
      continue;
    }
    escrituras.push(
      db
        .prepare(
          `INSERT INTO configuracion (clave, valor, actualizado_en, actualizado_por)
           VALUES (?, ?, datetime('now'), ?)
           ON CONFLICT(clave) DO UPDATE SET
             valor = excluded.valor,
             actualizado_en = excluded.actualizado_en,
             actualizado_por = excluded.actualizado_por`,
        )
        .bind(clave, valor, persona.id),
    );
  }
  if (escrituras.length) await db.batch(escrituras);
}
