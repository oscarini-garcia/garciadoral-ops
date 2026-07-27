/**
 * Qué cosas admiten comentario, en un solo sitio.
 *
 * Antes esta lista estaba copiada en cinco: el `CHECK` de `0001_esquema.sql`,
 * una cadena de `if` en `filtrado.js`, `TIPOS_COMENTARIO` y su diccionario de
 * índices en `modelo.py`, y `comentarios_visibles` en `visibilidad.py`. Añadir
 * un tipo obligaba a tocar los cinco y, de propina, a rehacer la tabla, porque
 * un `CHECK` de SQLite no se altera. El `CHECK` se fue en la migración `0009` y
 * la regla vive aquí.
 *
 * Cada entrada dice **dónde está la colección** a la que puede pertenecer un
 * comentario. Con eso basta para lo único que el Worker necesita hacer con
 * ella: un comentario hereda la visibilidad del objeto al que pertenece
 * (`especificacion.md` §5.3), así que viaja si viaja su objeto.
 *
 * Hay dos espejos de esto —`scripts/agenda/modelo.py` en el generador del plan
 * y la webapp, que no necesita ninguno porque solo pregunta por el tipo que
 * está pintando—. No se puede tener uno solo: el plan se compone en Python y el
 * filtro corre en el Worker.
 */

export const COMENTABLES = {
  evento: (registro) => registro.eventos,
  idea: (registro) => registro.ideas,
  regalo: (registro) => registro.regalos,
  apunte: (registro) => registro.apuntes,
};

export const esComentable = (tipo) => Object.hasOwn(COMENTABLES, tipo);

/**
 * Los comentarios de `registro` que sobreviven al recorte, dado lo que ya ha
 * pasado el filtro.
 *
 * `visibles` es un mapa de tipo a conjunto de identificadores que sí viajan. Un
 * comentario de un tipo que no está en el mapa se queda fuera: puede ser un
 * tipo que este lector no recibe entero —los apuntes de quien no vive en casa—
 * o uno escrito por una versión más nueva de la aplicación, y en los dos casos
 * lo prudente es no transmitirlo.
 */
export function comentariosVisibles(comentarios, visibles) {
  return (comentarios || []).filter((c) => visibles[c.objeto_tipo]?.has(c.objeto_id));
}
