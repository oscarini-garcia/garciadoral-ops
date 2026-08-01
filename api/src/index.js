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
 *   POST   /api/avisos      · este aparato quiere avisos, y este es su token
 *   DELETE /api/avisos      · este aparato deja de querer avisos
 *   GET    /api/conflictos  · coordinación pendiente de revisar (administradores)
 *   GET    /api/solicitudes · bandeja de quien espera (administradores)
 *   POST   /api/solicitudes/resolver · aprueba o rechaza (administradores)
 *   GET    /api/registro    · registro completo para el generador del plan semanal
 *   POST   /api/viajes/sincronizar · descarga el calendario de viajes ahora (servicio)
 *   POST   /api/viajes/refrescar    · lo mismo, desde Ajustes (administradores)
 *   POST   /api/redactar    · un día o un tramo de días, contado por un modelo
 *   POST   /api/regalo/sugerir · cinco propuestas de regalo para una persona
 *   POST   /api/cumple/felicitar · cinco felicitaciones para quien cumple
 *   POST   /api/sitio/apuntar · cinco apuntes para un sitio y una clase
 *   GET    /api/ia          · configuración de la redacción (administradores)
 *   POST   /api/ia          · guarda clave, modelo e instrucción (administradores)
 *   POST   /api/ia/chispa   · cinco frases para la pantalla de Hoy
 *   POST   /api/ia/lio      · cinco frases dichas por el perro
 *   POST   /api/ia/probar   · redacta y devuelve la traza entera (administradores)
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
import { sincronizarViajes } from './viajes.js';
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
import { empujar, empujarSolicitud } from './avisos.js';
import { hayApnsConfigurado } from './apns.js';
import {
  cabeUnaMas,
  componerMaterial,
  componerMaterialDePeriodo,
  componerMaterialDeApunte,
  componerMaterialDeChispa,
  componerMaterialDeFelicitacion,
  componerMaterialDeLio,
  componerMaterialDeRegalo,
  configuracionPublica,
  guardarConfiguracion,
  interpretarChispas,
  interpretarFelicitaciones,
  interpretarPropuestas,
  leerConfiguracion,
  modelosDisponibles,
  redactar,
  temasDeLaCasa,
} from './redaccion.js';

const TIPOS_JSON = { 'content-type': 'application/json; charset=utf-8' };

// Un día inventado para el botón de probar de Ajustes, cuando el de verdad no
// tiene nada. Lo que se prueba es la configuración, no la agenda.
const MATERIAL_DE_PRUEBA = {
  titulo: 'martes 14 de Abril',
  lineas: ['09:00 · Dentista de Marta · Calle Mayor 3', '17:30 · Entreno de baloncesto', 'todo el día · Cumpleaños de la abuela'],
};

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
    // Y el nombre con el que ya se pidió, si se pidió. Quien vuelve a abrir la
    // aplicación cae aquí, y la sala de espera lo enseña para poder corregirlo:
    // hoy lo pone Apple sola, sin que nadie lo haya visto antes de mandarlo.
    nombre: solicitud ? solicitud.nombre_declarado : null,
  });
}

// ------------------------------------------------------------ Sala de espera --

async function pedirEntrar(peticion, env, ctx) {
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

  // Que le suene el teléfono a quien puede abrirle la puerta. Va en `waitUntil`
  // como el resto de los empujones: quien está esperando en la puerta no tiene
  // que esperar además a que APNs conteste.
  const empuje = empujarSolicitud(env, solicitud).catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(empuje);

  return json({
    estado: solicitud.estado,
    solicitado_en: solicitud.creado_en,
    nombre: solicitud.nombre_declarado,
  });
}

async function estadoDeLaSolicitud(peticion, env) {
  const espera = await enEspera(peticion, env);
  if (await personaPorApple(env.DB, espera.sub)) return json({ estado: 'activa' });

  const solicitud = await solicitudPorApple(env.DB, espera.sub);
  // El nombre viaja de vuelta para que la sala de espera pueda enseñarlo: la
  // solicitud se manda ahora con el que da Apple, sin que nadie lo teclee, y
  // quien espera tiene derecho a ver con qué nombre está esperando.
  return json({
    estado: solicitud ? solicitud.estado : 'sin_solicitud',
    nombre: solicitud ? solicitud.nombre_declarado : null,
  });
}

/**
 * Retirar la solicitud propia, que es la baja de quien todavía no es del hogar.
 *
 * Se le avisa a Apple igual que en la baja de una cuenta aprobada, y por la
 * misma razón: quien deja una solicitud ha pasado por Sign in with Apple, de
 * modo que la aplicación le figura entre las que usan su Apple ID. Borrar aquí
 * su correo y dejársela puesta allí sería cumplir media directriz.
 *
 * De las dos bajas, además, esta es la única que quien revisa la aplicación
 * puede ejercer: a la cuenta aprobada no va a llegar. Si alguna de las dos
 * tenía que revocar de verdad, era esta.
 */
async function retirar(peticion, env) {
  const espera = await enEspera(peticion, env);
  const { codigo_apple: codigo } = await peticion.json().catch(() => ({}));

  const revocacion = await revocarEnApple(env, {
    codigo,
    plataforma: espera.plataforma,
    redireccion: env.REDIRECCION_WEB || (env.ORIGENES_PERMITIDOS || '').split(',')[0].trim(),
  });

  if (!revocacion.revocado) {
    console.warn(`retirada de una solicitud: no se revocó en Apple (${revocacion.motivo})`, revocacion.detalle || '');
  }

  await retirarSolicitud(env.DB, espera.sub);
  return json({
    retirada: true,
    revocado_en_apple: revocacion.revocado,
    motivo_revocacion: revocacion.revocado ? null : revocacion.motivo,
  });
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
  const instantanea = await conBanderaDeRedaccion(env, componerInstantanea(registro, lector));

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

async function recibirCambios(peticion, env, ctx) {
  const lector = await lectorAutenticado(peticion, env);
  const { cambios = [] } = await peticion.json();

  const resultados = [];
  const aplicados = [];
  for (const cambio of cambios) {
    try {
      const resultado = await aplicarCambio(env.DB, lector, cambio);
      resultados.push({ id: cambio.id, tipo: cambio.tipo, ...resultado });
      if (resultado.aplicado) aplicados.push({ ...cambio, novedad: resultado.novedad !== false });
    } catch (error) {
      resultados.push({ id: cambio.id, tipo: cambio.tipo, aplicado: false, motivo: String(error.message || error) });
    }
  }

  await derivarEstados(env.DB);

  // Se devuelve la instantánea recién actualizada: el dispositivo se queda
  // siempre con lo que le corresponde ver, incluido lo que acaba de dejar de
  // corresponderle por haber pasado a ser destinatario de algo.
  const registro = await leerRegistro(env.DB);

  // Y a quien le afecte, se le hace sonar el teléfono. Va detrás de la respuesta
  // y no dentro de ella: quien acaba de guardar algo no tiene por qué esperar a
  // que APNs conteste, y un aviso que no sale no puede tumbar una escritura que
  // ya está hecha. Por eso `empujar` no lanza nunca.
  if (aplicados.length) {
    const empuje = empujar(env, registro, lector, aplicados).catch(() => ({ enviados: 0 }));
    if (ctx?.waitUntil) ctx.waitUntil(empuje);
  }

  return json({ resultados, instantanea: await conBanderaDeRedaccion(env, componerInstantanea(registro, lector)) });
}

// ------------------------------------------------------- Avisos remotos --

/** Un token de APNs son 32 octetos en hexadecimal; se admite algo más de largo
 *  porque Apple se ha reservado poder alargarlo. Lo que no se admite es
 *  cualquier cosa: esto acaba en una URL hacia Apple. */
const TOKEN_DE_AVISOS = /^[0-9a-fA-F]{64,200}$/;

/** Qué aparato es este. Sin cabecera no hay fila propia, y entonces el token se
 *  guarda en la del titular, que es donde estaba antes de que hubiera avisos. */
const aparatoDe = (peticion, lector) => peticion.headers.get('X-Dispositivo') || `${lector.id}:desconocido`;

/**
 * El teléfono dice por dónde se le alcanza.
 *
 * Se llama al encender el interruptor de Ajustes y en cada arranque con él
 * puesto: APNs cambia el token cuando le parece —al restaurar una copia, al
 * reinstalar— y el único que se entera es el propio aparato.
 */
async function darDeAltaLosAvisos(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  const { token = '', plataforma = 'ios' } = await peticion.json();
  if (!TOKEN_DE_AVISOS.test(token)) return json({ error: 'token de avisos no válido' }, 400);

  const aparato = aparatoDe(peticion, lector);

  // El mismo token no puede estar en dos filas. Un teléfono que cambia de manos
  // —o dos cuentas en el mismo aparato— dejaría a la anterior recibiendo los
  // avisos de la nueva, que es exactamente lo que este sistema existe para no
  // hacer.
  await env.DB
    .prepare('UPDATE dispositivo SET token_push = NULL, token_push_desde = NULL WHERE token_push = ? AND id <> ?')
    .bind(token, aparato)
    .run();

  await env.DB
    .prepare(
      `INSERT INTO dispositivo (id, persona_id, plataforma, token_push, token_push_desde, ultima_sincronizacion)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         persona_id = excluded.persona_id,
         plataforma = excluded.plataforma,
         token_push = excluded.token_push,
         token_push_desde = excluded.token_push_desde`,
    )
    .bind(aparato, lector.id, plataforma, token)
    .run();

  return json({ alta: true, empuja: hayApnsConfigurado(env) });
}

/** Se apaga el interruptor: el aparato deja de ser alcanzable, y el token se
 *  borra en lugar de marcarse, que es lo mismo y no guarda de más. */
async function darDeBajaLosAvisos(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  await env.DB
    .prepare('UPDATE dispositivo SET token_push = NULL, token_push_desde = NULL WHERE id = ? AND persona_id = ?')
    .bind(aparatoDe(peticion, lector), lector.id)
    .run();
  return json({ baja: true });
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

// ----------------------------------------------------- Calendario de viajes --

/**
 * Sincroniza el calendario de viajes a petición, para el botón «sincronizar
 * ahora» de Ajustes. Se autentica con el mismo token de servicio que el
 * registro: la descarga del feed la hace el servidor, nunca el dispositivo
 * (`specs/calendario-viajes.md` §5.1), y esta ruta solo la dispara.
 *
 * El cron diario del propio Worker cubre la sincronización automática; esto es
 * el atajo para no esperar al ciclo cuando se acaba de tocar algo en Google.
 */
async function sincronizarViajesManual(peticion, env) {
  if (!env.TOKEN_SERVICIO || !coincideEnTiempoConstante(credencial(peticion), env.TOKEN_SERVICIO)) {
    return json({ error: 'no autorizado' }, 401);
  }
  const resumen = await sincronizarViajes(env, { ahora: new Date().toISOString() });
  return json(resumen);
}

/**
 * Lo mismo, pero desde Ajustes: aquí manda una persona con sesión, no el token
 * del sistema. Por eso se exige rol de administrador —cambiar la agenda de la
 * casa no es cosa de cualquiera— en lugar del token de servicio, que el
 * dispositivo no tiene ni debe tener.
 */
async function refrescarViajes(peticion, env) {
  await administradorAutenticado(peticion, env);
  const resumen = await sincronizarViajes(env, { ahora: new Date().toISOString() });
  return json(resumen);
}

// ------------------------------------------------------- Redacción con IA --

/**
 * El dispositivo necesita saber si el botón de contar el día tiene algo detrás.
 * Va la bandera, nunca la clave: la instantánea la recibe todo el mundo.
 */
async function conBanderaDeRedaccion(env, instantanea) {
  const { clave } = await leerConfiguracion(env.DB);
  return { ...instantanea, redaccion: { disponible: Boolean(clave) } };
}

/**
 * Un día suelto o un tramo de días, según lo que traiga el cuerpo. Es la misma
 * petición porque para quien la hace es el mismo gesto: contar lo que está
 * mirando, sea un día, una semana o lo que viene.
 */
function materialDe(instantanea, { fecha, eventos = [], desde, hasta, dias }) {
  if (desde) return componerMaterialDePeriodo(instantanea, { desde, hasta: hasta || desde, dias });
  return componerMaterial(instantanea, fecha, eventos);
}

/**
 * El día de hoy, contado por un modelo.
 *
 * El cliente manda una fecha y los identificadores de lo que está viendo; el
 * texto que llega al modelo se compone aquí, a partir de la instantánea
 * filtrada de quien pide, de modo que ni se le puede inyectar nada ni puede
 * salir por ahí un evento que esa persona no ve.
 */
async function contarElDia(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  if (!(await cabeUnaMas(env.DB, lector.id))) {
    throw new Rechazo('demasiadas redacciones seguidas; prueba dentro de un minuto');
  }

  const cuerpo = await peticion.json().catch(() => ({}));
  if (!cuerpo.fecha && !cuerpo.desde) return json({ error: 'falta la fecha' }, 400);

  const configuracion = await leerConfiguracion(env.DB);
  const registro = await leerRegistro(env.DB);
  const material = materialDe(componerInstantanea(registro, lector), cuerpo);

  // Un identificador que el servidor no sabe resolver es un fallo suyo, no de
  // quien pide: significa que el dispositivo compone algo que aquí no se
  // reconoce, y el modelo cuenta entonces una semana incompleta sin que nadie
  // se entere. Ya pasó una vez con los cumpleaños derivados.
  if (material.omitidos?.length) {
    console.warn('redacción con eventos sin resolver', JSON.stringify(material.omitidos));
  }

  const resultado = await redactar({ configuracion, material });

  if (!resultado.texto) {
    // El motivo se cuenta entero solo a quien puede arreglarlo. Al resto le
    // basta con saber que no ha podido ser: su aplicación comparte tal cual.
    console.warn('redacción fallida', JSON.stringify(resultado.intentos));
    return json(
      {
        texto: null,
        motivo: resultado.motivo || 'ningún modelo ha contestado',
        intentos: lector.rol === 'administrador' ? resultado.intentos : undefined,
      },
      503,
    );
  }

  return json({
    texto: resultado.texto,
    modelo: resultado.modelo,
    omitidos: material.omitidos?.length || 0,
  });
}

/**
 * Una tanda de regalos propuestos para una persona.
 *
 * Son cinco de una vez, y no una, porque lo caro de esta llamada es contarle al
 * modelo quién es la persona: eso se manda igual para una que para cinco, así
 * que pasar de una propuesta a otra en el teléfono no cuesta nada. Pedir otra
 * tanda sí es otra llamada, y lleva las ya propuestas para no repetirlas.
 *
 * El cliente manda a quién, la pista que quien apunta llevara escrita y los
 * títulos que ya ha visto. Lo que se le cuenta al modelo lo compone el Worker
 * con la instantánea filtrada de quien pide: sus atributos, lo que ha pedido,
 * las ideas que ya hay y lo que recibió otros años. Una idea reservada para
 * alguien no puede asomar por aquí, porque aquí no se lee el registro entero.
 *
 * Comparte el freno con la redacción del día: es la misma cuenta de pago y el
 * mismo bucle en la consola el que la gastaría.
 */
async function sugerirUnRegalo(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  if (!(await cabeUnaMas(env.DB, lector.id))) {
    throw new Rechazo('demasiadas propuestas seguidas; prueba dentro de un minuto');
  }

  const {
    persona_id: personaId, pista = '', descartadas = [],
  } = await peticion.json().catch(() => ({}));
  if (!personaId) return json({ error: 'falta la persona' }, 400);

  const configuracion = await leerConfiguracion(env.DB);
  const registro = await leerRegistro(env.DB);
  const material = componerMaterialDeRegalo(componerInstantanea(registro, lector), {
    personaId, pista, descartadas,
  });

  if (!material.lineas.length) return json({ error: 'esa persona no está' }, 404);

  // Cinco propuestas no caben en el tope de dos frases con el que se cuenta un
  // día: con él, la quinta llega cortada a la mitad.
  const resultado = await redactar({
    configuracion, material, instruccion: configuracion.regalo, tope: 700,
  });

  const propuestas = interpretarPropuestas(resultado.texto);

  if (!propuestas.length) {
    console.warn('sugerencia fallida', JSON.stringify(resultado.intentos));
    return json(
      {
        propuestas: [],
        motivo: resultado.motivo || 'ningún modelo ha contestado',
        intentos: lector.rol === 'administrador' ? resultado.intentos : undefined,
      },
      503,
    );
  }

  return json({ propuestas, modelo: resultado.modelo });
}

/**
 * Cinco felicitaciones para quien cumple, que se copian y se pegan en WhatsApp.
 *
 * Va por el mismo camino que la sugerencia de regalo —el mismo freno por minuto y
 * la misma cadena de modelos—, y se diferencia en el material: lo compone
 * `componerMaterialDeFelicitacion` con lo que quien cumple ya sabe de sí mismo, de
 * modo que por aquí no puede salir hacia el modelo un regalo pendiente.
 */
async function felicitarUnCumple(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  if (!(await cabeUnaMas(env.DB, lector.id))) {
    throw new Rechazo('demasiadas felicitaciones seguidas; prueba dentro de un minuto');
  }

  const { persona_id: personaId, descartadas = [] } = await peticion.json().catch(() => ({}));
  if (!personaId) return json({ error: 'falta la persona' }, 400);

  const configuracion = await leerConfiguracion(env.DB);
  const registro = await leerRegistro(env.DB);
  const material = componerMaterialDeFelicitacion(componerInstantanea(registro, lector), {
    personaId, descartadas,
  });

  if (!material.lineas.length) return json({ error: 'esa persona no está' }, 404);

  const resultado = await redactar({
    configuracion, material, instruccion: configuracion.felicitacion, tope: 700,
  });

  const felicitaciones = interpretarFelicitaciones(resultado.texto);

  if (!felicitaciones.length) {
    console.warn('felicitación fallida', JSON.stringify(resultado.intentos));
    return json(
      {
        felicitaciones: [],
        motivo: resultado.motivo || 'ningún modelo ha contestado',
        intentos: lector.rol === 'administrador' ? resultado.intentos : undefined,
      },
      503,
    );
  }

  return json({ felicitaciones, modelo: resultado.modelo });
}

/**
 * Cinco cosas que apuntar en un sitio, de la clase que se pida.
 *
 * El cuarto encargo, y el que menos maquinaria estrena: mismo freno por minuto,
 * misma cadena de modelos y el mismo formato de respuesta que la sugerencia de
 * regalo. Lo único suyo es el material, que lo compone `componerMaterialDeApunte`
 * con el sitio, la clase y **lo que ya hay apuntado ahí**.
 *
 * Como todo Sitios, es de la casa: quien no vive en ella no recibe los sitios en
 * su instantánea, así que aquí no encontraría ninguno que pedir.
 */
async function apuntarEnUnSitio(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  if (!(await cabeUnaMas(env.DB, lector.id))) {
    throw new Rechazo('demasiadas propuestas seguidas; prueba dentro de un minuto');
  }

  const { lugar_id: lugarId, clase = 'saber', descartadas = [] } = await peticion.json().catch(() => ({}));
  if (!lugarId) return json({ error: 'falta el sitio' }, 400);

  const configuracion = await leerConfiguracion(env.DB);
  const registro = await leerRegistro(env.DB);
  const material = componerMaterialDeApunte(componerInstantanea(registro, lector), {
    lugarId, clase, descartadas,
  });

  if (!material.lineas.length) return json({ error: 'ese sitio no está' }, 404);

  const resultado = await redactar({
    configuracion, material, instruccion: configuracion.apunte, tope: 700,
  });

  const propuestas = interpretarPropuestas(resultado.texto);

  if (!propuestas.length) {
    console.warn('apuntes fallidos', JSON.stringify(resultado.intentos));
    return json(
      {
        propuestas: [],
        motivo: resultado.motivo || 'ningún modelo ha contestado',
        intentos: lector.rol === 'administrador' ? resultado.intentos : undefined,
      },
      503,
    );
  }

  return json({ propuestas, modelo: resultado.modelo });
}

/**
 * Las cinco frases con las que abre la pantalla de Hoy.
 *
 * El quinto encargo, y el único que no nace de un toque: la pide la pantalla al
 * abrirse el primer día. Por eso es también el único que **contesta 200 con la
 * lista vacía** en vez de 503 cuando algo falla —no hay clave puesta, ningún
 * modelo responde, el freno por minuto salta—. Un error aquí no tiene a quién
 * dárselo: nadie ha pedido nada, así que la línea sencillamente no aparece y la
 * pantalla queda como estaba.
 *
 * Cinco de golpe y no una: cuestan lo mismo —lo que se paga es el encargo y el
 * material— y el teléfono las va enseñando de una en una sin volver a preguntar,
 * de modo que tocar la frase contesta en el acto. `descartadas` son las que ya se
 * han enseñado hoy, y viajan al pedir la segunda tanda.
 *
 * El tema se sortea aquí y no en el teléfono para que salga de lo que la casa
 * usa de verdad, que es un dato del registro y no del dispositivo.
 */
async function escribirLaChispa(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  const {
    fecha, eventos = [], proximos = [], descartadas = [],
  } = await peticion.json().catch(() => ({}));
  if (!fecha) return json({ error: 'falta la fecha' }, 400);

  const configuracion = await leerConfiguracion(env.DB);
  if (!configuracion.clave) return json({ frases: [] });
  if (!(await cabeUnaMas(env.DB, lector.id))) return json({ frases: [] });

  const instantanea = componerInstantanea(await leerRegistro(env.DB), lector);
  const temas = temasDeLaCasa(instantanea);
  const material = componerMaterialDeChispa(instantanea, {
    fecha,
    eventos,
    proximos,
    descartadas,
    tema: temas.length ? temas[Math.floor(Math.random() * temas.length)] : null,
  });

  if (material.omitidos.length) {
    console.warn('chispa con identificadores sin resolver', JSON.stringify(material.omitidos));
  }

  const resultado = await redactar({
    configuracion, material, instruccion: configuracion.chispa, tope: 700,
  });

  const frases = interpretarChispas(resultado.texto);
  if (!frases.length) console.warn('chispa fallida', JSON.stringify(resultado.intentos));

  return json({ frases, modelo: frases.length ? resultado.modelo : null });
}

/**
 * Las cinco frases que dice Lío en su bloque de Hoy.
 *
 * Hermana de la frase del día y con sus mismas costumbres: cinco de golpe para
 * que el toque conteste en el acto, y 200 con la lista vacía cuando algo falla,
 * porque tampoco esto lo ha pedido nadie.
 *
 * Solo para quien es de casa: los turnos del perro no salen de la instantánea de
 * quien no lo es, así que el material vendría vacío y la llamada sería un gasto
 * sin destinatario.
 */
async function escribirLoDeLio(peticion, env) {
  const lector = await lectorAutenticado(peticion, env);
  const { fecha, descartadas = [] } = await peticion.json().catch(() => ({}));
  if (!fecha) return json({ error: 'falta la fecha' }, 400);

  const configuracion = await leerConfiguracion(env.DB);
  if (!configuracion.clave) return json({ frases: [] });
  if (!(await cabeUnaMas(env.DB, lector.id))) return json({ frases: [] });

  const instantanea = componerInstantanea(await leerRegistro(env.DB), lector);
  if (!(instantanea.lio_cuadro || []).length) return json({ frases: [] });

  const material = componerMaterialDeLio(instantanea, { fecha });
  if (descartadas.length) {
    material.lineas.push('Ya has dicho estas hoy, di otras distintas:');
    material.lineas.push(...descartadas.slice(0, 30).map((frase) => `  ${String(frase).trim()}`));
  }

  const resultado = await redactar({
    configuracion, material, instruccion: configuracion.lio, tope: 700,
  });

  const frases = interpretarChispas(resultado.texto);
  if (!frases.length) console.warn('voz de Lío fallida', JSON.stringify(resultado.intentos));

  return json({ frases, modelo: frases.length ? resultado.modelo : null });
}

async function leerAjustesDeIa(peticion, env) {
  await administradorAutenticado(peticion, env);
  const configuracion = await leerConfiguracion(env.DB);
  const { modelos, de } = await modelosDisponibles(configuracion.clave);
  return json({ ...configuracionPublica(configuracion), modelos, modelos_de: de });
}

async function guardarAjustesDeIa(peticion, env) {
  const administrador = await administradorAutenticado(peticion, env);
  const {
    clave, modelo, instruccion, regalo, felicitacion, apunte, chispa, lio,
  } = await peticion.json().catch(() => ({}));
  const configuracion = await guardarConfiguracion(env.DB, administrador, {
    clave, modelo, instruccion, regalo, felicitacion, apunte, chispa, lio,
  });
  return json(configuracionPublica(configuracion));
}

/**
 * Redacta y devuelve la traza entera, haya salido bien o mal: con qué modelo se
 * intentó, qué contestó cada uno y cuánto tardó. Es lo que convierte «no
 * funciona» en algo que se puede mirar.
 */
async function probarLaRedaccion(peticion, env) {
  const administrador = await administradorAutenticado(peticion, env);
  const { fecha, eventos = [] } = await peticion.json().catch(() => ({}));

  const configuracion = await leerConfiguracion(env.DB);
  const registro = await leerRegistro(env.DB);
  const propio = componerMaterial(
    componerInstantanea(registro, administrador),
    fecha || new Date().toISOString().slice(0, 10),
    eventos,
  );

  // Probar tiene que probar aunque el día esté vacío: lo que se comprueba es la
  // clave, el modelo y la instrucción, no que hoy haya algo que contar.
  const material = propio.lineas.length ? propio : MATERIAL_DE_PRUEBA;
  const resultado = await redactar({ configuracion, material });

  return json({
    texto: resultado.texto,
    modelo: resultado.modelo,
    motivo: resultado.motivo || null,
    intentos: resultado.intentos,
    material: material.lineas,
    omitidos: material.omitidos || [],
  });
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
  ['POST', '/api/avisos', darDeAltaLosAvisos],
  ['DELETE', '/api/avisos', darDeBajaLosAvisos],
  ['GET', '/api/conflictos', conflictosPendientes],
  ['GET', '/api/solicitudes', bandeja],
  ['POST', '/api/solicitudes/resolver', resolverSolicitud],
  ['GET', '/api/registro', registroCompleto],
  ['POST', '/api/viajes/sincronizar', sincronizarViajesManual],
  ['POST', '/api/viajes/refrescar', refrescarViajes],
  ['POST', '/api/redactar', contarElDia],
  ['POST', '/api/regalo/sugerir', sugerirUnRegalo],
  ['POST', '/api/sitio/apuntar', apuntarEnUnSitio],
  ['POST', '/api/cumple/felicitar', felicitarUnCumple],
  ['GET', '/api/ia', leerAjustesDeIa],
  ['POST', '/api/ia', guardarAjustesDeIa],
  ['POST', '/api/ia/chispa', escribirLaChispa],
  ['POST', '/api/ia/lio', escribirLoDeLio],
  ['POST', '/api/ia/probar', probarLaRedaccion],
];

export default {
  // `ctx` llega hasta aquí por los avisos remotos: son lo único que continúa
  // después de haber contestado, y sin `waitUntil` el isolate se apagaría con
  // ellos a medio salir.
  async fetch(peticion, env, ctx) {
    const cors = cabecerasCors(env, peticion);

    if (peticion.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(peticion.url);
    const ruta = RUTAS.find(([metodo, camino]) => metodo === peticion.method && camino === url.pathname);

    if (!ruta) return json({ error: 'no encontrado' }, 404, cors);

    try {
      const respuesta = await ruta[2](peticion, env, ctx);
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

  // El cron del propio Worker sincroniza el calendario de viajes. Es el servidor
  // quien descarga el feed —por el secreto y porque aquí se escribe el registro
  // (`specs/calendario-viajes.md` §5.1)—, y una vez al día basta para una fuente
  // que Google regenera cada varias horas (§5.4). Un fallo de descarga no toca
  // nada y no propaga la excepción: el cron no tiene a quién contestar.
  async scheduled(controlador, env, ctx) {
    ctx.waitUntil(
      sincronizarViajes(env, { ahora: new Date().toISOString() }).catch(() => ({ estado: 'error' })),
    );
  },
};
