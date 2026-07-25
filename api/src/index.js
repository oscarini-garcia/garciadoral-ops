/**
 * API de la Agenda Familiar sobre Cloudflare Workers y D1.
 *
 * Cierra la decisión pendiente §12.1 de `specs/plan-semanal.md`: el registro
 * canónico vive en D1 y el control de acceso por lector lo hace este Worker,
 * que filtra **antes de transmitir**. Ningún dispositivo recibe lo que su
 * titular no puede ver, que es el requisito no funcional de mayor importancia
 * del sistema (spec funcional §9).
 *
 * Rutas:
 *   GET  /api/salud       · comprobación sin autenticar
 *   POST /api/sesion      · canjea un token de Apple por una sesión propia
 *   GET  /api/sync        · instantánea filtrada para el lector autenticado
 *   POST /api/cambios     · aplica la cola de cambios del dispositivo
 *   GET  /api/conflictos  · coordinación pendiente de revisar (administradores)
 *   GET  /api/registro    · registro completo para el generador del plan semanal
 */

import { verificarTokenDeApple } from './apple.js';
import { coincideEnTiempoConstante, emitirSesion, verificarSesion } from './sesion.js';
import { aplicarCambio, leerRegistro, personaPorApple, personaPorId } from './repositorio.js';
import { derivarEstados } from './derivar.js';
import { componerInstantanea } from './filtrado.js';

const TIPOS_JSON = { 'content-type': 'application/json; charset=utf-8' };

function json(cuerpo, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...TIPOS_JSON, ...cabeceras },
  });
}

function cabecerasCors(env, peticion) {
  const permitidos = (env.ORIGENES_PERMITIDOS || '').split(',').map((o) => o.trim()).filter(Boolean);
  const origen = peticion.headers.get('Origin');
  if (!origen || !permitidos.includes(origen)) return {};
  return {
    'Access-Control-Allow-Origin': origen,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function credencial(peticion) {
  const cabecera = peticion.headers.get('Authorization') || '';
  return cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
}

async function lectorAutenticado(peticion, env) {
  const sesion = await verificarSesion(env.SESION_SECRETO, credencial(peticion));
  const persona = await personaPorId(env.DB, sesion.sub);
  if (!persona || !persona.tiene_cuenta || !persona.activa) {
    throw new Error('la sesión ya no corresponde a una persona con cuenta activa');
  }
  return persona;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

async function abrirSesion(peticion, env) {
  const { id_token: idToken, plataforma = 'web' } = await peticion.json();

  const { sub } = await verificarTokenDeApple(idToken, [env.APPLE_AUD_IOS, env.APPLE_AUD_WEB]);
  const persona = await personaPorApple(env.DB, sub);

  if (!persona) {
    // La incorporación se produce por invitación de un administrador, que
    // vincula el identificador a la persona correspondiente (spec funcional §8).
    return json(
      {
        error: 'sin_vincular',
        mensaje: 'Este identificador de Apple todavía no está vinculado a ninguna persona del hogar.',
        identificador: sub,
      },
      403,
    );
  }

  const token = await emitirSesion(env.SESION_SECRETO, persona, plataforma);
  return json({
    token,
    persona: { id: persona.id, nombre: persona.nombre, rol: persona.rol },
  });
}

async function sincronizar(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  const registro = await leerRegistro(env.DB);
  const instantanea = componerInstantanea(registro, lector);

  await env.DB.prepare(
    `INSERT INTO dispositivo (id, persona_id, plataforma, ultima_sincronizacion)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET ultima_sincronizacion = excluded.ultima_sincronizacion`,
  )
    .bind(
      peticion.headers.get('X-Dispositivo') || `${lector.id}:desconocido`,
      lector.id,
      peticion.headers.get('X-Plataforma') || 'web',
    )
    .run();

  return json(instantanea);
}

async function recibirCambios(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  const { cambios = [] } = await peticion.json();

  const resultados = [];
  for (const cambio of cambios) {
    try {
      const resultado = await aplicarCambio(env.DB, lector, cambio);
      resultados.push({ id: cambio.id, tipo: cambio.tipo, ...resultado });
    } catch (error) {
      resultados.push({ id: cambio.id, tipo: cambio.tipo, aplicado: false, motivo: String(error.message || error) });
    }
  }

  await derivarEstados(env.DB);

  // Se devuelve la instantánea recién actualizada: el dispositivo se queda
  // siempre con lo que le corresponde ver, incluido lo que acaba de dejar de
  // corresponderle por haber pasado a ser destinatario de algo.
  const registro = await leerRegistro(env.DB);
  return json({ resultados, instantanea: componerInstantanea(registro, lector) });
}

async function conflictosPendientes(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  if (lector.rol !== 'administrador') return json({ error: 'reservado' }, 403);
  const { results } = await env.DB.prepare(
    'SELECT * FROM conflicto WHERE revisado = 0 ORDER BY detectado_en DESC',
  ).all();
  return json({ conflictos: results || [] });
}

/**
 * Registro completo para el generador del plan semanal.
 *
 * El generador es un **lector de servidor de confianza**, no el dispositivo de
 * un miembro: que lea la fuente entera y filtre por destinatario es correcto y
 * seguro, porque el filtrado ocurre en un entorno controlado antes de que nada
 * salga hacia WhatsApp (specs/plan-semanal.md §9).
 */
async function registroCompleto(peticion, env) {
  if (!env.TOKEN_SERVICIO || !coincideEnTiempoConstante(credencial(peticion), env.TOKEN_SERVICIO)) {
    return json({ error: 'no autorizado' }, 401);
  }
  const registro = await leerRegistro(env.DB);
  return json(registro);
}

// ---------------------------------------------------------------------------

const RUTAS = [
  ['GET', '/api/salud', async () => json({ estado: 'ok', ahora: new Date().toISOString() })],
  ['POST', '/api/sesion', abrirSesion],
  ['GET', '/api/sync', sincronizar],
  ['POST', '/api/cambios', recibirCambios],
  ['GET', '/api/conflictos', conflictosPendientes],
  ['GET', '/api/registro', registroCompleto],
];

export default {
  async fetch(peticion, env) {
    const cors = cabecerasCors(env, peticion);

    if (peticion.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(peticion.url);
    const ruta = RUTAS.find(([metodo, camino]) => metodo === peticion.method && camino === url.pathname);

    if (!ruta) return json({ error: 'no encontrado' }, 404, cors);

    try {
      const respuesta = await ruta[2](peticion, env);
      for (const [clave, valor] of Object.entries(cors)) respuesta.headers.set(clave, valor);
      return respuesta;
    } catch (error) {
      const mensaje = String(error.message || error);
      const autenticacion = /sesión|token|firma/i.test(mensaje);
      return json({ error: mensaje }, autenticacion ? 401 : 500, cors);
    }
  },
};
