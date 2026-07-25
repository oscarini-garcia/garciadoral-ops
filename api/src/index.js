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
 *   GET    /api/salud       · comprobación sin autenticar
 *   POST   /api/sesion      · canjea un token de Apple por la sesión que corresponda
 *   POST   /api/solicitud   · pide entrar (sala de espera)
 *   GET    /api/solicitud   · en qué ha quedado la solicitud propia
 *   DELETE /api/solicitud   · retira la solicitud propia (App Store 5.1.1)
 *   POST   /api/cuenta/baja · elimina la cuenta de quien la pide (App Store 5.1.1)
 *   GET    /api/sync        · instantánea filtrada para el lector autenticado
 *   POST   /api/cambios     · aplica la cola de cambios del dispositivo
 *   GET    /api/conflictos  · coordinación pendiente de revisar (administradores)
 *   GET    /api/solicitudes · bandeja de quien espera (administradores)
 *   POST   /api/solicitudes/resolver · aprueba o rechaza (administradores)
 *   GET    /api/registro    · registro completo para el generador del plan semanal
 */

import { verificarTokenDeApple } from './apple.js';
import {
  coincideEnTiempoConstante,
  emitirEspera,
  emitirSesion,
  verificarSesionDeEspera,
  verificarSesionPlena,
} from './sesion.js';
import {
  administradoresRestantes,
  aplicarCambio,
  darDeBajaCuenta,
  leerRegistro,
  personaPorApple,
  personaPorId,
} from './repositorio.js';
import {
  Rechazo,
  anotarLlegada,
  aprobarSolicitud,
  pendientes,
  purgarCaducadas,
  rechazarSolicitud,
  registrarSolicitud,
  retirarSolicitud,
  solicitudPorApple,
} from './solicitudes.js';
import { hayRevocacionConfigurada, revocarEnApple } from './revocacion.js';
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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function credencial(peticion) {
  const cabecera = peticion.headers.get('Authorization') || '';
  return cabecera.startsWith('Bearer ') ? cabecera.slice(7) : '';
}

async function lectorAutenticado(peticion, env) {
  const sesion = await verificarSesionPlena(env.SESION_SECRETO, credencial(peticion));
  const persona = await personaPorId(env.DB, sesion.sub);
  if (!persona || !persona.tiene_cuenta || !persona.activa) {
    throw new Error('la sesión ya no corresponde a una persona con cuenta activa');
  }
  return persona;
}

async function administradorAutenticado(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  if (lector.rol !== 'administrador') throw new SinPermiso('reservado a los administradores');
  return lector;
}

/** Quien espera en la puerta. Su credencial no vale para nada más, y lleva
 *  dentro el correo tal como lo dijo Apple. */
async function enEspera(peticion, env) {
  return verificarSesionDeEspera(env.SESION_SECRETO, credencial(peticion));
}

/** Un «no» por falta de permisos, que responde 403 en lugar de 500. */
class SinPermiso extends Error {}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/**
 * Canjea el token de Apple por la credencial que corresponda.
 *
 * Responde siempre 200 y dice en qué estado está ese identificador, porque
 * llegar sin cuenta no es un error de autorización: es el estado normal de
 * quien acaba de descargarse la aplicación, y el cliente necesita saber qué
 * pantalla pintar. El identificador de Apple ya no se devuelve a nadie: con la
 * bandeja no hay que copiarlo a ninguna parte (specs/autenticacion.md §7).
 */
async function abrirSesion(peticion, env) {
  const { id_token: idToken, plataforma = 'web' } = await peticion.json();

  const { sub, email, correoPrivado } = await verificarTokenDeApple(
    idToken,
    [env.APPLE_AUD_IOS, env.APPLE_AUD_WEB],
  );

  const persona = await personaPorApple(env.DB, sub);
  if (persona) {
    const token = await emitirSesion(env.SESION_SECRETO, persona, plataforma);
    return json({
      estado: 'activa',
      token,
      persona: { id: persona.id, nombre: persona.nombre, rol: persona.rol },
    });
  }

  // Quien llama a la puerta es el momento natural para barrer lo caducado.
  await purgarCaducadas(env.DB);

  const solicitud = await solicitudPorApple(env.DB, sub);
  if (solicitud) await anotarLlegada(env.DB, sub);

  return json({
    // Solo puede ser 'pendiente' o 'rechazada': la aprobación borra la fila, y
    // quien la tuviera aprobada ya habría salido por la rama de arriba.
    estado: solicitud ? solicitud.estado : 'sin_solicitud',
    token_espera: await emitirEspera(env.SESION_SECRETO, sub, plataforma, {
      direccion: email,
      privado: correoPrivado,
    }),
    // El correo se devuelve para que la sala de espera pueda decir con cuál se
    // ha solicitado: es lo único que verá quien decide, y quien lo envía tiene
    // derecho a saberlo antes de enviarlo.
    correo: email,
    correo_privado: correoPrivado,
  });
}

// ------------------------------------------------------------ Sala de espera --

async function pedirEntrar(peticion, env) {
  const espera = await enEspera(peticion, env);
  const { nombre } = await peticion.json().catch(() => ({}));

  // Que ya esté vinculado significa que le aprobaron mientras rellenaba el
  // formulario. No es un error: se le dice que ya está.
  if (await personaPorApple(env.DB, espera.sub)) return json({ estado: 'activa' });

  await purgarCaducadas(env.DB);
  const solicitud = await registrarSolicitud(env.DB, {
    identificadorApple: espera.sub,
    correo: espera.correo,
    correoPrivado: espera.correo_privado,
    nombre,
  });

  return json({ estado: solicitud.estado, solicitado_en: solicitud.creado_en });
}

async function estadoDeLaSolicitud(peticion, env) {
  const espera = await enEspera(peticion, env);
  if (await personaPorApple(env.DB, espera.sub)) return json({ estado: 'activa' });

  const solicitud = await solicitudPorApple(env.DB, espera.sub);
  return json({ estado: solicitud ? solicitud.estado : 'sin_solicitud' });
}

async function retirar(peticion, env) {
  const espera = await enEspera(peticion, env);
  await retirarSolicitud(env.DB, espera.sub);
  return json({ retirada: true });
}

// ------------------------------------------------------------------ Bandeja --

async function bandeja(peticion, env) {
  await administradorAutenticado(peticion, env);
  await purgarCaducadas(env.DB);
  return json({ solicitudes: await pendientes(env.DB) });
}

async function resolverSolicitud(peticion, env) {
  const actor = await administradorAutenticado(peticion, env);
  const { id, accion, persona_id: personaId, persona, rol } = await peticion.json();

  if (accion === 'rechazar') {
    return json(await rechazarSolicitud(env.DB, { id, actorId: actor.id }));
  }
  if (accion !== 'aprobar') return json({ error: `acción desconocida: ${accion}` }, 400);

  return json(
    await aprobarSolicitud(env.DB, { id, personaId, persona, rol }),
  );
}

/**
 * Baja de la cuenta, a petición de su titular.
 *
 * La directriz 5.1.1(v) de la App Store exige que quien puede crear una cuenta
 * pueda eliminarla **desde dentro de la aplicación**, sin escribir a nadie. Aquí
 * la cuenta es el vínculo entre un identificador de Apple y una persona del
 * registro, y eliminarla es deshacer ese vínculo: `darDeBajaCuenta` explica qué
 * se va y qué se queda.
 *
 * El orden importa. Primero se avisa a Apple, mientras todavía se sabe por
 * dónde entró esta persona, y después se deshace el vínculo; al revés, un fallo
 * a mitad dejaría una cuenta viva ante Apple sin nada aquí que la identifique.
 * Que la revocación falle, en cambio, no detiene nada: lo que no puede ocurrir
 * es que alguien se quede sin poder darse de baja porque un servidor ajeno no
 * respondió.
 */
async function darDeBaja(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  const { plataforma } = await verificarSesion(env.SESION_SECRETO, credencial(peticion));
  const { codigo_apple: codigo } = await peticion.json().catch(() => ({}));

  const revocacion = await revocarEnApple(env, {
    codigo,
    plataforma,
    redireccion: env.REDIRECCION_WEB || (env.ORIGENES_PERMITIDOS || '').split(',')[0].trim(),
  });

  if (!revocacion.revocado) {
    console.warn(`baja de ${lector.id}: no se revocó en Apple (${revocacion.motivo})`, revocacion.detalle || '');
  }

  // Se cuenta antes de la baja, mientras esta persona todavía figura. Que se
  // vaya la última administradora es legítimo —impedir la baja no lo es— pero
  // deja el hogar sin nadie que pueda vincular cuentas desde la aplicación, y
  // cuando eso se note nadie recordará que ocurrió: queda dicho en el log.
  const restantes = await administradoresRestantes(env.DB, lector.id);
  if (lector.rol === 'administrador' && restantes === 0) {
    console.warn(`baja de ${lector.id}: era la última cuenta administradora del hogar`);
  }

  await darDeBajaCuenta(env.DB, lector.id);

  return json({
    baja: true,
    revocado_en_apple: revocacion.revocado,
    motivo_revocacion: revocacion.revocado ? null : revocacion.motivo,
    revocacion_configurada: hayRevocacionConfigurada(env),
    administradores_restantes: restantes,
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
  await administradorAutenticado(peticion, env);
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

// La resolución va por cuerpo y no por ruta con parámetro porque aquí los
// caminos se comparan enteros. Meter segmentos variables obligaría a reescribir
// el enrutador para una sola ruta.
const RUTAS = [
  ['GET', '/api/salud', async () => json({ estado: 'ok', ahora: new Date().toISOString() })],
  ['POST', '/api/sesion', abrirSesion],
  ['POST', '/api/solicitud', pedirEntrar],
  ['GET', '/api/solicitud', estadoDeLaSolicitud],
  ['DELETE', '/api/solicitud', retirar],
  ['POST', '/api/cuenta/baja', darDeBaja],
  ['GET', '/api/sync', sincronizar],
  ['POST', '/api/cambios', recibirCambios],
  ['GET', '/api/conflictos', conflictosPendientes],
  ['GET', '/api/solicitudes', bandeja],
  ['POST', '/api/solicitudes/resolver', resolverSolicitud],
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
      // Un «no» previsible no es una avería: la sala de espera llena, una
      // solicitud que el otro administrador acaba de resolver o una persona que
      // ya tiene cuenta son respuestas legítimas, y el cliente tiene que poder
      // distinguirlas de un fallo del servidor para saber qué decirle a quien
      // está mirando la pantalla.
      if (error instanceof SinPermiso) return json({ error: mensaje }, 403, cors);
      if (error instanceof Rechazo) return json({ error: mensaje }, 409, cors);
      const autenticacion = /sesión|token|firma/i.test(mensaje);
      return json({ error: mensaje }, autenticacion ? 401 : 500, cors);
    }
  },
};
