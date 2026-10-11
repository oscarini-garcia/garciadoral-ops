/**
 * El enlace de cada uno para conectar Claude: una dirección que es a la vez la credencial.
 *
 * Claude se conecta a un servidor MCP pegando su dirección, y la manera de que
 * eso sea fácil para cuatro personas es que cada una tenga la suya y que con la
 * dirección baste: sin cuentas aparte y sin OAuth. La credencial va en el
 * camino —`/mcp/<id>.<firma>`— y por eso se trata como lo que es, una
 * contraseña: solo se le enseña a su dueño, se puede quitar y se puede rehacer.
 *
 * **No se guarda.** El `id` sale al azar y vive en `enlace_mcp`; la firma es un
 * HMAC del `id` y de la persona con la clave del Worker (`SESION_SECRETO`), y se
 * recalcula tanto para comprobarla como para volver a enseñar el enlace en
 * Ajustes. Una copia de la base no da ningún enlace, y rotar la clave del Worker
 * los anula todos a la vez, igual que anula las sesiones.
 *
 * Como el portero, no sabe qué es una persona más allá de su identificador: si
 * sigue teniendo cuenta lo comprueba quien recibe la fila (`index.js`), en cada
 * petición y no solo al crear el enlace. La entidad está en
 * `specs/modelo-datos.md` §2.11, y cómo se conecta, en `docs/conectar-claude.md`.
 */

import { SinCredencial } from '../portero/errores.js';
import { coincideEnTiempoConstante } from '../portero/sesion.js';

/** `<id>.<firma>`: dieciséis octetos al azar y los treinta y dos del HMAC, en
 *  base64url. Lo que no tenga esta forma no llega a preguntar a la base. */
const FORMA = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

/** Cada cuánto se anota que el enlace se ha usado: lo justo para que Ajustes
 *  diga si Claude ha llegado a conectarse, sin escribir en cada petición. */
const ANOTAR_CADA_MS = 10 * 60 * 1000;

function aBase64url(datos) {
  let binario = '';
  for (const octeto of new Uint8Array(datos)) binario += String.fromCharCode(octeto);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** El prefijo separa este uso de la clave del de las sesiones: lo que se firma
 *  aquí no puede confundirse nunca con la cabecera y el cuerpo de un JWT. */
async function firmar(secreto, id, personaId) {
  if (!secreto) throw new Error('falta SESION_SECRETO');
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`mcp:${id}:${personaId}`));
  return aBase64url(firma);
}

/** La credencial entera de una fila, tal como va en la dirección. */
export async function credencialDe(secreto, fila) {
  return `${fila.id}.${await firmar(secreto, fila.id, fila.persona_id)}`;
}

/** El enlace vivo de una persona, o `null`. */
export async function enlaceVivo(db, personaId) {
  return db
    .prepare('SELECT * FROM enlace_mcp WHERE persona_id = ? AND activo = 1 ORDER BY creado_en DESC LIMIT 1')
    .bind(personaId)
    .first();
}

/**
 * Un enlace nuevo, que apaga el anterior.
 *
 * Uno vivo por persona a propósito: «rehacer» es la única reparación que hace
 * falta saber —si el enlace se ha pegado donde no debía, se rehace y el viejo
 * deja de valer en el acto— y con varios habría que saber cuál quitar.
 */
export async function crearEnlace(db, personaId, ahora = new Date().toISOString()) {
  const id = aBase64url(crypto.getRandomValues(new Uint8Array(16)));
  await db.batch([
    db.prepare('UPDATE enlace_mcp SET activo = 0 WHERE persona_id = ? AND activo = 1').bind(personaId),
    db
      .prepare('INSERT INTO enlace_mcp (id, persona_id, creado_en, activo) VALUES (?, ?, ?, 1)')
      .bind(id, personaId, ahora),
  ]);
  return { id, persona_id: personaId, creado_en: ahora, usado_en: null, activo: 1 };
}

export async function quitarEnlace(db, personaId) {
  await db.prepare('UPDATE enlace_mcp SET activo = 0 WHERE persona_id = ? AND activo = 1').bind(personaId).run();
}

/**
 * La fila de una credencial, o `SinCredencial`.
 *
 * Se busca por el `id` y la firma se compara en tiempo constante: la parte que
 * se tantea a ciegas es la firma, y una comparación normal la iría soltando
 * carácter a carácter.
 */
export async function filaDelEnlace(db, secreto, credencial) {
  const partes = FORMA.exec(String(credencial || ''));
  if (!partes) throw new SinCredencial('enlace mal formado');
  const [, id, firma] = partes;

  const fila = await db.prepare('SELECT * FROM enlace_mcp WHERE id = ? AND activo = 1').bind(id).first();
  if (!fila || !coincideEnTiempoConstante(firma, await firmar(secreto, fila.id, fila.persona_id))) {
    throw new SinCredencial('este enlace ya no vale; crea otro en Ajustes');
  }
  return fila;
}

/** Que se ha usado, como mucho una vez cada diez minutos. */
export async function anotarUso(db, fila, ahora = new Date()) {
  const antes = fila.usado_en ? Date.parse(fila.usado_en) : Number.NaN;
  if (Number.isFinite(antes) && ahora.getTime() - antes < ANOTAR_CADA_MS) return;
  await db.prepare('UPDATE enlace_mcp SET usado_en = ? WHERE id = ?').bind(ahora.toISOString(), fila.id).run();
}
