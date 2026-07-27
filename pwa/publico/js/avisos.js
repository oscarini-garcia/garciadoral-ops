/**
 * Lo que espera a quien mira, venga del módulo que venga.
 *
 * Esto empezó siendo una banda de Lío dentro de la pantalla de Hoy —`hoy.js`
 * importaba `tratosParaMi` de `lio.js` y dibujaba sus peticiones—, y en cuanto
 * los comentarios pasaron a avisar, esa banda tuvo dos dueños. Con dos, tendría
 * cinco. Así que lo que se reparte por dentro de una vista se recoge aquí.
 *
 * **Un aviso es una función de la instantánea, no una fila.** No hay tabla de
 * avisos y no debe haberla: si un aviso fuera algo escrito por el Worker,
 * contestar un trato desde la agenda dejaría su fila ahí mintiendo, y habría que
 * ir a borrarla. Derivado, la petición contestada desaparece porque ya no hay
 * nada que pedir.
 *
 * **Y esa es la razón de escribirlo aunque hoy quepa en dos funciones:** cuando
 * lleguen las notificaciones remotas, el servidor tendrá que contestar esta
 * misma pregunta —«¿qué tiene pendiente esta persona, y qué no ha visto
 * todavía?»— para saber qué empujar. Si vive repartida por dentro de `hoy.js`,
 * habrá que escribirla otra vez en el Worker y a partir de ahí serán dos, con la
 * garantía de que un día dirán cosas distintas. Aquí se reescribe con la misma
 * forma, como ya están espejados Lío y la visibilidad.
 *
 * **Dos clases, y solo una se descarta.** Lo que espera respuesta se contesta o
 * se queda: descartar una petición de turno dejaría al otro esperando una
 * respuesta que ya nadie va a dar, y sin rastro de que existió. Lo que solo ha
 * pasado no le quita nada a nadie al quitarlo de en medio.
 */

import { guardar } from './sincronizacion.js';
import { estaActivo } from './modelo.js';
import { tratosParaMi } from './lio.js';
import { parsearMomento } from './semana.js';

/** De dónde puede venir un aviso. Dar de alta un módulo es una línea. */
const FUENTES = [
  { de: 'lio', clase: 'contestar', buscar: avisosDeLio },
  { de: 'comentario', clase: 'nuevo', buscar: avisosDeComentarios },
];

/** El identificador de una marca se compone, como el del voto y el del paseo:
 *  se escribe desde el dispositivo antes de haber visto ninguna fila. */
export const idVisto = (tipo, objetoId, personaId) => `visto:${tipo}:${objetoId}:${personaId}`;

/**
 * Deja escrito que se ha mirado esto, hasta ahora.
 *
 * Guarda un momento y no un sí o un no, que es lo que permite que un aviso
 * descartado **vuelva** cuando llega un comentario posterior: descartar
 * significa «ya lo he visto», no «no me avises más de esto».
 */
export function marcarVisto(ctx, tipo, objetoId, hasta = new Date().toISOString()) {
  const yo = ctx.vista.yo.id;
  if (!yo) return null;
  return guardar('visto', idVisto(tipo, objetoId, yo), {
    persona_id: yo, objeto_tipo: tipo, objeto_id: objetoId, hasta,
  });
}

/**
 * Todo lo que hay, ya ordenado: primero lo que espera respuesta.
 *
 * Cada aviso lleva de dónde viene, con qué emoji se reconoce, qué dice y desde
 * cuándo. Lo que no lleva es cómo se dibuja: eso es de quien lo pinta.
 */
export function avisosDe(ctx) {
  const todos = FUENTES.flatMap((fuente) =>
    fuente.buscar(ctx).map((aviso) => ({ ...aviso, de: fuente.de, clase: fuente.clase })));

  return todos.sort((a, b) => {
    if (a.clase !== b.clase) return a.clase === 'contestar' ? -1 : 1;
    return String(b.cuando || '').localeCompare(String(a.cuando || ''));
  });
}

export const porContestar = (ctx) => avisosDe(ctx).filter((a) => a.clase === 'contestar');
export const novedades = (ctx) => avisosDe(ctx).filter((a) => a.clase === 'nuevo');

/** Si no hay nada, el sobre no existe: que aparezca *es* el aviso. */
export const hayAvisos = (ctx) => avisosDe(ctx).length > 0;

// -------------------------------------------------------------- Las fuentes --

/** Las peticiones de turno que esperan una respuesta mía. Su forma la conoce
 *  Lío; aquí solo se envuelven. */
function avisosDeLio(ctx) {
  return tratosParaMi(ctx.vista.datos).map((trato) => ({
    id: `lio:${trato.id}`,
    emoji: '🐾',
    trato,
    cuando: trato.creado_en || null,
  }));
}

/**
 * Los hilos donde alguien ha contestado después de la última vez que los miré.
 *
 * A quién se avisa: a quien creó la cosa y a quien ya haya comentado en ella,
 * menos a quien acaba de escribir. Lo de que además tiene que poder verla no hay
 * ni que programarlo: si no la ve, no está en su instantánea.
 */
function avisosDeComentarios(ctx) {
  const mios = new Set();
  const porObjeto = new Map();

  for (const comentario of ctx.vista.datos.comentarios || []) {
    if (!estaActivo(comentario)) continue;
    const clave = `${comentario.objeto_tipo}:${comentario.objeto_id}`;
    if (!porObjeto.has(clave)) porObjeto.set(clave, []);
    porObjeto.get(clave).push(comentario);
    if (comentario.autor_id === ctx.vista.yo.id) mios.add(clave);
  }

  const avisos = [];
  for (const [clave, comentarios] of porObjeto) {
    const [tipo, objetoId] = partirClave(clave);
    // Participo si escribí en el hilo o si el objeto es cosa mía.
    if (!mios.has(clave) && !loCree(ctx, tipo, objetoId)) continue;

    const hasta = parsearMomento(ctx.vista.vistoHasta(tipo, objetoId));
    const nuevos = comentarios.filter((comentario) => {
      if (comentario.autor_id === ctx.vista.yo.id) return false;
      const cuando = parsearMomento(comentario.creado_en);
      return cuando && (!hasta || cuando > hasta);
    });
    if (!nuevos.length) continue;

    const quienes = [...new Set(nuevos.map((c) => ctx.vista.nombre(c.autor_id)))];
    avisos.push({
      id: `comentario:${clave}`,
      emoji: emojiDe(tipo),
      tipo,
      objetoId,
      quienes,
      donde: comoSeLlama(ctx, tipo, objetoId),
      cuando: nuevos[nuevos.length - 1].creado_en || null,
    });
  }
  return avisos;
}

/** `evento:e-3` en dos, sin romperse con los identificadores que llevan dos
 *  puntos dentro —los de Lío son `lio:2026-07-27:manana`—. */
function partirClave(clave) {
  const corte = clave.indexOf(':');
  return [clave.slice(0, corte), clave.slice(corte + 1)];
}

const emojiDe = (tipo) => ({
  evento: '📅', idea: '💡', regalo: '🎁', apunte: '📍',
}[tipo] || '💬');

/** ¿Es mía la cosa de la que cuelga el hilo? Quien la creó se entera de lo que
 *  se hable sobre ella aunque todavía no haya dicho nada. */
function loCree(ctx, tipo, objetoId) {
  const yo = ctx.vista.yo.id;
  if (tipo === 'evento') return ctx.vista.evento(objetoId)?.autor_id === yo;
  if (tipo === 'idea') return ctx.vista.idea(objetoId)?.autor_id === yo;
  if (tipo === 'regalo') return ctx.vista.regalo(objetoId)?.autor_id === yo;
  if (tipo === 'apunte') {
    return (ctx.vista.datos.apuntes || []).find((a) => a.id === objetoId)?.autor_id === yo;
  }
  return false;
}

/** Cómo se llama eso, para poder escribir «Marta, en «la bici de Julia»». */
function comoSeLlama(ctx, tipo, objetoId) {
  if (tipo === 'evento') return ctx.vista.caraDe(ctx.vista.evento(objetoId)).titulo || 'un evento';
  if (tipo === 'idea') return ctx.vista.idea(objetoId)?.titulo || 'una idea';
  if (tipo === 'apunte') {
    return (ctx.vista.datos.apuntes || []).find((a) => a.id === objetoId)?.titulo || 'un apunte';
  }
  if (tipo === 'regalo') {
    const regalo = ctx.vista.regalo(objetoId);
    const idea = regalo?.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
    return idea?.titulo || 'un regalo';
  }
  return 'algo';
}
