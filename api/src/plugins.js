/**
 * Los plugins de la agenda en el servidor: qué hay, de qué círculo es cada uno y
 * cómo se guarda lo que la casa ajusta de ellos.
 *
 * Espejo de `pwa/publico/js/plugins.js`, y solo de la mitad que el Worker
 * necesita saber por su cuenta: la lista, el círculo que recibe cada plugin
 * —que es lo único de los mandos comunes que se aplica **antes de transmitir**—
 * y la casilla de `configuracion` donde vive lo que se ajusta desde la hoja
 * «Qué hay en la agenda». Lo demás —el nombre, el emoji, los tipos visibles, la
 * antelación del aviso— viaja tal cual en la instantánea y lo lee la pantalla.
 *
 * Son seis, en dos familias (`specs/propuesta-plugins-agenda.html`, A1): tres
 * que se derivan de una fuente —Lío del cuadro, los viajes de Flighty, los
 * cumpleaños y santos de las fichas— y tres que se escriben —lo puntual, las
 * extraescolares y el fin de semana—. Un plugin escrito sigue siendo una fila
 * de `evento`, con `plugin_id` puesto: es lo que hace que el plan de los
 * domingos, la redacción y los comentarios le sirvan sin escribir nada dos
 * veces.
 */

/** Cómo se llama la casilla de cada plugin en `configuracion`. */
export const PREFIJO = 'plugins.';

export const IDS_PLUGIN = ['lio', 'viajes', 'cumples', 'puntuales', 'extraescolares', 'finde'];

/**
 * Qué círculo recibe cada plugin si nadie ha dicho otra cosa. Es el más ancho
 * de los tres, cerrado por arriba: quien ya vive en el círculo dicho o en uno
 * más cerrado lo recibe; quien vive en uno más abierto, no.
 *
 * Lo que ya existía conserva lo que tenía: un vuelo y un evento suelto eran de
 * todo el mundo con cuenta, y siguen siéndolo hasta que alguien cierre el
 * círculo desde la hoja. Lo nuevo —las extraescolares y el finde— nace de
 * casa, que es de quien habla. Lío está fijo en casa por su propio módulo y
 * ese mando no se ofrece; aquí figura para que la pregunta tenga siempre
 * respuesta.
 */
export const CIRCULO_POR_DEFECTO = {
  lio: 'familia',
  viajes: 'amigos',
  cumples: 'amigos',
  puntuales: 'amigos',
  extraescolares: 'familia',
  finde: 'familia',
};

/** El orden de los círculos, de dentro hacia fuera. */
const ANCHURA = { familia: 0, extendida: 1, amigos: 2 };

/**
 * ¿Puede una persona de `circuloPersona` recibir un plugin abierto hasta
 * `circuloPlugin`? Quien no tiene círculo escrito cae en `extendida`, que es
 * el valor por defecto también en la base.
 */
export function circuloAdmite(circuloPlugin, circuloPersona) {
  const tope = ANCHURA[circuloPlugin] ?? ANCHURA.amigos;
  const suyo = ANCHURA[circuloPersona || 'extendida'] ?? ANCHURA.extendida;
  return suyo <= tope;
}

/** El círculo efectivo de un plugin, con lo ajustado por encima de lo de origen. */
export function circuloDe(plugins, id) {
  const escrito = plugins?.[id]?.circulo;
  return ANCHURA[escrito] !== undefined ? escrito : (CIRCULO_POR_DEFECTO[id] || 'amigos');
}

/**
 * De qué plugin es un evento, para decidir quién lo recibe.
 *
 * Lo escrito lleva su `plugin_id`; lo importado es de Viajes; lo demás es
 * puntual. Los cumpleaños y los santos no son filas de `evento` y no pasan por
 * aquí: se derivan en el dispositivo, que ya sabe en qué círculo está quien
 * mira.
 */
export function pluginDeEvento(evento) {
  if (evento?.plugin_id === 'extraescolar') return 'extraescolares';
  if (evento?.plugin_id === 'finde') return 'finde';
  if (evento?.origen === 'importado') return 'viajes';
  // Lo derivado no es fila de `evento` y no pasa por la instantánea, pero el
  // cron de los recordatorios sí lo deriva aquí, con los mismos
  // identificadores que el dispositivo (`pwa/publico/js/plugins.js`).
  const id = String(evento?.id || '');
  if (id.startsWith('derivado:cumpleanos:') || id.startsWith('derivado:santo:')) return 'cumples';
  if (id.startsWith('derivado:fuera:')) return 'viajes';
  if (id.startsWith('derivado:ausencia:')) return 'lio';
  return 'puntuales';
}

/** Sanea lo que llegue: solo los campos conocidos —círculo, nombre, emoji, tipos,
 *  aviso, santos y edad— y con la forma que se espera. */
export function normalizarPlugin(bruto) {
  if (!bruto || typeof bruto !== 'object') return {};
  const limpio = {};
  if (ANCHURA[bruto.circulo] !== undefined) limpio.circulo = bruto.circulo;
  if (typeof bruto.nombre === 'string' && bruto.nombre.trim()) limpio.nombre = bruto.nombre.trim().slice(0, 40);
  if (typeof bruto.emoji === 'string' && bruto.emoji.trim()) limpio.emoji = bruto.emoji.trim().slice(0, 8);
  if (Array.isArray(bruto.tipos)) {
    limpio.tipos = bruto.tipos.filter((t) => typeof t === 'string' && t).slice(0, 30);
  }
  if (bruto.aviso && typeof bruto.aviso === 'object') {
    limpio.aviso = {};
    for (const circulo of Object.keys(ANCHURA)) {
      const dias = Number(bruto.aviso[circulo]);
      if (Number.isInteger(dias) && dias >= 0 && dias <= 30) limpio.aviso[circulo] = dias;
    }
  }
  if (typeof bruto.santos === 'boolean') limpio.santos = bruto.santos;
  if (typeof bruto.edad === 'boolean') limpio.edad = bruto.edad;
  return limpio;
}

/**
 * Lo ajustado de cada plugin, como un objeto por identificador. Los que no
 * tienen nada escrito no aparecen: la pantalla aplica los valores de origen.
 */
export async function leerPlugins(db) {
  let results = [];
  try {
    ({ results } = await db
      .prepare('SELECT clave, valor FROM configuracion WHERE clave LIKE ?')
      .bind(`${PREFIJO}%`)
      .all());
  } catch (error) {
    // Entre desplegar y migrar, otra vez: sin la tabla no hay nada ajustado.
    if (/no such table/i.test(String(error?.message || error))) return {};
    throw error;
  }
  const plugins = {};
  for (const fila of results || []) {
    const id = fila.clave.slice(PREFIJO.length);
    if (!IDS_PLUGIN.includes(id)) continue;
    try {
      plugins[id] = normalizarPlugin(JSON.parse(fila.valor));
    } catch {
      plugins[id] = {};
    }
  }
  return plugins;
}

/**
 * Guarda lo ajustado de un plugin, entero: los mandos de una hoja son un solo
 * dato, como el cuadro de Lío, y se escriben de una vez.
 */
export async function guardarPlugin(db, persona, id, bruto) {
  if (!IDS_PLUGIN.includes(id)) throw new Error(`plugin desconocido: ${id}`);
  const limpio = normalizarPlugin(bruto);
  await db
    .prepare(
      `INSERT INTO configuracion (clave, valor, actualizado_en, actualizado_por)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(clave) DO UPDATE SET
         valor = excluded.valor,
         actualizado_en = excluded.actualizado_en,
         actualizado_por = excluded.actualizado_por`,
    )
    .bind(`${PREFIJO}${id}`, JSON.stringify(limpio), persona.id)
    .run();
  return limpio;
}
