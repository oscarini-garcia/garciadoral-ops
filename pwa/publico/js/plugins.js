/**
 * Los plugins de la agenda: qué hay, en qué familia está cada uno y qué mandos
 * comparten todos.
 *
 * Cada cosa que cae en un día viene de un plugin, y son seis en dos familias
 * (`specs/propuesta-plugins-agenda.html`, A1): tres que **se derivan** de una
 * fuente que nadie escribe evento a evento —Lío del cuadro de reparto, los
 * viajes del Flighty de cada uno, los cumpleaños y santos de las fichas de
 * Gente— y tres que **se escriben** —lo puntual con el formulario de siempre,
 * las extraescolares con su curso y su horario, el fin de semana con su sitio—.
 * Un plugin escrito sigue siendo una fila de `evento` con `plugin_id`: es lo
 * que hace que el plan de los domingos, la redacción y los comentarios le
 * sirvan sin escribir nada dos veces.
 *
 * **Los cuatro mandos comunes** (D1, D2, D4, D5 de la misma propuesta) viven
 * en dos sitios según de quién sean:
 *
 * - *Enseñar en mi agenda* y *avisar* son de quien mira y de este aparato: los
 *   recordatorios se programan en el teléfono y apagar un plugin es no querer
 *   verlo uno, no quitárselo a nadie. Van en `localStorage`, como el tema.
 * - *Lo ven* —el círculo— y *nombre y emoji* son de la casa: lo aplica el
 *   Worker antes de transmitir y lo cambia quien administra. Viajan en
 *   `plugins` dentro de la instantánea, y se guardan por la cola con el tipo
 *   `plugin`, como el cuadro de Lío.
 *
 * Espejo de `api/src/plugins.js` en lo que el servidor necesita saber.
 */

import { guardar } from './sincronizacion.js';

export const PLUGINS = [
  {
    id: 'lio', nombre: 'Lío', emoji: '🐾', familia: 'derivado',
    de: 'los turnos de paseo, del cuadro de reparto',
  },
  {
    id: 'viajes', nombre: 'Viajes', emoji: '✈️', familia: 'derivado',
    de: 'los vuelos, del Flighty de cada uno',
  },
  {
    id: 'cumples', nombre: 'Cumpleaños y santos', emoji: '🎂', familia: 'derivado',
    de: 'de las fichas de Gente',
  },
  {
    id: 'puntuales', nombre: 'Puntuales', emoji: '📌', familia: 'escrito',
    de: 'cenas, citas y lo que no tiene regla',
  },
  {
    id: 'extraescolares', nombre: 'Extraescolares', emoji: '🐴', familia: 'escrito',
    de: 'con su curso, su horario y quién lleva',
  },
  {
    id: 'finde', nombre: 'Fin de semana', emoji: '🧳', familia: 'escrito',
    de: 'una escapada, con su sitio y quién va',
  },
];

export const IDS_PLUGIN = PLUGINS.map((p) => p.id);

export const pluginPorId = (id) => PLUGINS.find((p) => p.id === id) || null;

/** Los que tienen mando de círculo. Lío está fijo en casa por su propio módulo. */
export const CON_CIRCULO = ['viajes', 'cumples', 'puntuales', 'extraescolares', 'finde'];

/** Los que se pueden llamar de otra manera: los escritos, que son los que la casa
 *  bautiza —«Hípica» donde pone «Extraescolares»—. Lío ya se llama Lío. */
export const CON_NOMBRE = ['puntuales', 'extraescolares', 'finde'];

/**
 * El círculo hasta el que está abierto cada plugin si nadie ha dicho otra cosa.
 * Lo que ya existía conserva lo que tenía —un vuelo y un evento suelto eran de
 * todo el mundo con cuenta—; lo nuevo nace de casa. Espejo del Worker.
 */
export const CIRCULO_POR_DEFECTO = {
  lio: 'familia',
  viajes: 'amigos',
  cumples: 'amigos',
  puntuales: 'amigos',
  extraescolares: 'familia',
  finde: 'familia',
};

const ANCHURA = { familia: 0, extendida: 1, amigos: 2 };

export function circuloAdmite(circuloPlugin, circuloPersona) {
  const tope = ANCHURA[circuloPlugin] ?? ANCHURA.amigos;
  const suyo = ANCHURA[circuloPersona || 'extendida'] ?? ANCHURA.extendida;
  return suyo <= tope;
}

/** Cuántos días antes se avisa de un cumpleaños, por círculo, de origen: una
 *  semana para casa —da tiempo al regalo—, la víspera para la familia y el
 *  mismo día para un amigo, que es cuando se felicita. */
export const AVISO_CUMPLES_POR_DEFECTO = { familia: 7, extendida: 1, amigos: 0 };

/**
 * Lo ajustado de un plugin, con los valores de origen debajo: nombre, emoji,
 * círculo, tipos visibles, antelación por círculo y si salen los santos y la
 * edad.
 */
export function ajustesDe(instantanea, id) {
  const base = pluginPorId(id) || { nombre: id, emoji: '📌' };
  const escrito = instantanea?.plugins?.[id] || {};
  return {
    nombre: escrito.nombre || base.nombre,
    emoji: escrito.emoji || base.emoji,
    circulo: ANCHURA[escrito.circulo] !== undefined ? escrito.circulo : (CIRCULO_POR_DEFECTO[id] || 'amigos'),
    tipos: Array.isArray(escrito.tipos) ? escrito.tipos : null,
    aviso: { ...AVISO_CUMPLES_POR_DEFECTO, ...(escrito.aviso || {}) },
    santos: escrito.santos !== false,
    edad: escrito.edad !== false,
  };
}

export const nombreDePlugin = (instantanea, id) => ajustesDe(instantanea, id).nombre;
export const emojiDePlugin = (instantanea, id) => ajustesDe(instantanea, id).emoji;

/** Guardar lo ajustado de un plugin, entero: los mandos de una hoja son un solo
 *  dato. Solo lo admite el Worker a un administrador. */
export function guardarAjustesDePlugin(instantanea, id, campos) {
  const actual = instantanea?.plugins?.[id] || {};
  return guardar('plugin', id, { ...actual, ...campos });
}

/**
 * De qué plugin es un evento. Lo escrito lleva su `plugin_id`; lo importado es
 * de Viajes; lo derivado en el dispositivo se reconoce por su identificador;
 * lo demás es puntual.
 */
export function pluginDeEvento(evento) {
  if (!evento) return 'puntuales';
  if (evento.plugin_id === 'extraescolar') return 'extraescolares';
  if (evento.plugin_id === 'finde') return 'finde';
  if (evento.origen === 'importado') return 'viajes';
  const id = String(evento.id || '');
  if (id.startsWith('derivado:cumpleanos:') || id.startsWith('derivado:santo:')) return 'cumples';
  if (id.startsWith('derivado:fuera:')) return 'viajes';
  if (id.startsWith('derivado:ausencia:')) return 'lio';
  return 'puntuales';
}

/**
 * ¿Se enseña este evento a quien mira? Dos preguntas: si tiene apagado el
 * plugin en este aparato, y si su círculo alcanza al plugin. La segunda ya la
 * contestó el Worker para lo que viaja; aquí solo importa para lo que se deriva
 * en el dispositivo —cumpleaños, santos, la ausencia—, que el Worker no ve.
 */
export function seEnsena(instantanea, evento) {
  const plugin = pluginDeEvento(evento);
  if (pluginOculto(plugin)) return false;
  if (String(evento?.id || '').startsWith('derivado:')) {
    return circuloAdmite(ajustesDe(instantanea, plugin).circulo, instantanea?.yo?.circulo);
  }
  return true;
}

// -------------------------------------------------- Lo de este aparato --

const CLAVE_OCULTOS = 'agenda.plugins.ocultos';
const CLAVE_AVISOS = 'agenda.plugins.avisos';

function leerLista(clave) {
  try {
    const guardado = JSON.parse(localStorage.getItem(clave) || 'null');
    return guardado && typeof guardado === 'object' ? guardado : {};
  } catch {
    return {};
  }
}

function escribirLista(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin sitio en el almacén local, la preferencia no se guarda */
  }
}

/** ¿Está apagado en este aparato? Apagado no es que no exista: es no querer
 *  verlo uno, y no se lo quita a nadie. */
export const pluginOculto = (id) => Boolean(leerLista(CLAVE_OCULTOS)[id]);

export function marcarPluginOculto(id, oculto) {
  const ocultos = leerLista(CLAVE_OCULTOS);
  if (oculto) ocultos[id] = true;
  else delete ocultos[id];
  escribirLista(CLAVE_OCULTOS, ocultos);
}

/**
 * Las cuatro antelaciones que se ofrecen, en días: nunca, ese día, la víspera y
 * una semana. Se guardan en este aparato porque el recordatorio se programa en
 * este aparato.
 */
export const ANTELACIONES = [
  { valor: 'nunca', texto: 'Nunca', dias: null },
  { valor: 'dia', texto: 'Ese día', dias: 0 },
  { valor: 'vispera', texto: 'La víspera', dias: 1 },
  { valor: 'semana', texto: 'Una semana', dias: 7 },
];

/** Lo que había antes de que hubiera mando: media hora antes de lo que tiene
 *  hora y la tarde de la víspera de lo que dura todo el día, que aquí se lee
 *  como «la víspera». */
const AVISO_POR_DEFECTO = { viajes: 'vispera', puntuales: 'vispera', extraescolares: 'nunca', finde: 'vispera' };

export const avisoDePlugin = (id) => leerLista(CLAVE_AVISOS)[id] || AVISO_POR_DEFECTO[id] || 'vispera';

export function marcarAvisoDePlugin(id, valor) {
  const avisos = leerLista(CLAVE_AVISOS);
  if (!valor || valor === AVISO_POR_DEFECTO[id]) delete avisos[id];
  else avisos[id] = valor;
  escribirLista(CLAVE_AVISOS, avisos);
}

/**
 * Con cuántos días de antelación se avisa de una instancia, o `null` si no se
 * avisa. Los cumpleaños van por círculo de quien cumple —la regla es de la
 * casa, y viaja en la instantánea—; el resto, por lo que este aparato tenga
 * puesto para su plugin.
 */
export function antelacionDe(instantanea, instancia) {
  const evento = instancia.evento;
  const plugin = pluginDeEvento(evento);
  if (plugin === 'lio') return null;
  if (plugin === 'cumples') {
    const persona = (instantanea.personas || []).find((p) => p.id === evento.persona_origen_id);
    const dias = ajustesDe(instantanea, 'cumples').aviso[persona?.circulo || 'extendida'];
    return Number.isInteger(dias) ? dias : null;
  }
  const antelacion = ANTELACIONES.find((a) => a.valor === avisoDePlugin(plugin));
  return antelacion ? antelacion.dias : 1;
}
