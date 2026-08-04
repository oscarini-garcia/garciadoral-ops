/**
 * Lo que hace sonar un teléfono ajeno, decidido en el servidor.
 *
 * Es el espejo de `pwa/publico/js/avisos.js`, y la pieza que aquel docstring
 * anunciaba: «cuando lleguen las notificaciones remotas, el servidor tendrá que
 * contestar esta misma pregunta». La forma es la misma —una lista de `FUENTES`,
 * y dar de alta un módulo es una línea— pero la pregunta no es idéntica, y
 * conviene no confundirlas:
 *
 * - En el dispositivo, un aviso es **un estado**: qué tienes ahora mismo sin
 *   contestar y sin leer. Se deriva de la instantánea, y por eso una petición
 *   contestada desaparece sola.
 * - Aquí, un aviso es **un suceso**: qué acaba de pasar, y a quién le importa.
 *   Se deriva del lote de cambios que se acaba de escribir, porque un empujón
 *   solo tiene sentido en el instante en que ocurre algo.
 *
 * **La visibilidad no se vuelve a programar.** Un aviso solo sale si su objeto
 * está en la instantánea de quien lo recibiría, y eso se comprueba componiendo
 * esa instantánea con la misma función que la transmite. Escribir aquí una
 * segunda versión de la regla sería garantizar que algún día dirán cosas
 * distintas, y el día que lo hicieran el error sería contarle a alguien algo que
 * el sistema entero está construido para ocultarle.
 *
 * **Solo se avisa de lo que ha cambiado de verdad.** `aplicarCambio` devuelve
 * `novedad` y aquí se exige: reenviar la cola tras una sincronización a medias
 * es corriente, y sin eso el mismo aviso sonaría dos veces.
 *
 * La forma está en `specs/ux.md` §12.4 y el token del aparato, en
 * `specs/modelo-datos.md` §2.9.
 */

import { componerInstantanea } from './filtrado.js';
import { enviarAviso, hayApnsConfigurado } from './apns.js';
import { TURNOS, cuadroEn, inicioDeVentana, normalizarVersiones } from './lio.js';

/**
 * Las categorías con botones, que se llaman igual aquí y en `native.js`.
 *
 * El servidor pone el nombre de la categoría en el sobre y el teléfono sabe qué
 * botones lleva: son dos listas que tienen que decir lo mismo, como los TURNOS
 * de Lío. Los rótulos —«Acepto», «No fue así»— viven solo en el dispositivo,
 * porque son de la pantalla.
 */
export const CATEGORIA_CAMBIO = 'LIO_CAMBIO';
export const CATEGORIA_CORRECCION = 'LIO_CORRECCION';

/** De dónde puede venir un aviso. Dar de alta un módulo es una línea. */
const FUENTES = [
  { de: 'lio', reconoce: (c) => c.tipo === 'trato_paseo' || c.tipo === 'paseo', componer: avisosDeLio },
  { de: 'comentario', reconoce: (c) => c.tipo === 'comentario', componer: avisosDeComentario },
];

// ------------------------------------------------------------- Componer --

/**
 * Todo lo que este lote de cambios tiene que hacer sonar.
 *
 * Sin efectos y sin base de datos: se le da el registro ya releído y los cambios
 * que se aplicaron, y devuelve la lista de avisos con su destinatario. Es lo que
 * permite probarlo entero sin APNs por medio.
 */
export function avisosDe(registro, actor, cambios) {
  const aplicados = cambios.filter((cambio) => cambio.novedad !== false);
  const contexto = { registro, actor, cambios: aplicados };

  const brutos = aplicados.flatMap((cambio) => {
    const fuente = FUENTES.find((f) => f.reconoce(cambio));
    if (!fuente) return [];
    return fuente.componer(contexto, cambio).map((aviso) => ({ ...aviso, de: fuente.de }));
  });

  const instantaneas = new Map();
  const instantaneaDe = (personaId) => {
    if (!instantaneas.has(personaId)) {
      const persona = registro.personas.find((p) => p.id === personaId);
      instantaneas.set(personaId, persona ? componerInstantanea(registro, persona) : null);
    }
    return instantaneas.get(personaId);
  };

  return brutos
    // A uno mismo no se le avisa de lo que acaba de hacer.
    .filter((aviso) => aviso.para && aviso.para !== actor.id)
    .filter((aviso) => {
      const instantanea = instantaneaDe(aviso.para);
      if (!instantanea) return false;
      // Lo que no viaja tampoco se cuenta: si el objeto no está en su
      // instantánea, es que no puede verlo.
      return (instantanea[aviso.donde] || []).some((fila) => fila.id === aviso.objetoId);
    })
    .map((aviso) => ({ ...aviso, globo: porContestarDe(instantaneaDe(aviso.para), aviso.para) }));
}

/**
 * Cuánto le espera a alguien respuesta, que es lo único que lleva el globo del
 * icono.
 *
 * No es «cuántas novedades hay»: un comentario nuevo no reclama nada de nadie, y
 * un número que solo baja abriendo la aplicación acaba siendo un número que no
 * se mira. Cuenta lo mismo que el grupo de arriba del sobre —lo que se contesta
 * o se queda— y por eso se calcula igual, sobre la instantánea de esa persona.
 *
 * Va en **todos** los avisos y no solo en los de Lío: el número es absoluto y no
 * un incremento, así que un comentario que llegara sin él dejaría el globo con
 * la cuenta de antes. Mandarlo siempre es lo que hace que el globo no mienta.
 */
function porContestarDe(instantanea, personaId) {
  if (!instantanea) return 0;
  return (instantanea.tratos_paseo || []).filter(
    (t) => t.destinatario_id === personaId && t.estado === 'pendiente' && t.activo,
  ).length;
}

// ------------------------------------------------------------------ Lío --

const nombreDe = (registro, id) => registro.personas.find((p) => p.id === id)?.nombre || 'Alguien';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * «El jueves 30 de julio por la mañana».
 *
 * Se compone a mano y no con `Intl`: la fecha es una cadena `YYYY-MM-DD` sin
 * hora, y pasarla por un `Date` con la zona del Worker la corre un día en cuanto
 * el reloj de UTC no coincide con el de aquí.
 */
function cuandoFue(fecha, turnoId) {
  const [anno, mes, dia] = String(fecha).split('-').map(Number);
  if (!anno || !mes || !dia) return '';
  const diaSemana = DIAS[new Date(Date.UTC(anno, mes - 1, dia)).getUTCDay()];
  const turno = TURNOS.find((t) => t.id === turnoId);
  return `El ${diaSemana} ${dia} de ${MESES[mes - 1]} por la ${(turno?.nombre || turnoId).toLowerCase()}`;
}

/** El lunes en 0, como el cuadro. */
function indiceDeDia(fecha) {
  const [anno, mes, dia] = String(fecha).split('-').map(Number);
  return (new Date(Date.UTC(anno, mes - 1, dia)).getUTCDay() + 6) % 7;
}

function avisosDeLio(contexto, cambio) {
  if (cambio.tipo === 'paseo') return avisosDeUnPaseo(contexto, cambio);

  const { registro } = contexto;
  const trato = (registro.tratos_paseo || []).find((t) => t.id === cambio.id);
  if (!trato) return [];

  const esCorreccion = trato.clase === 'correccion';
  const comun = {
    donde: 'tratos_paseo',
    objetoId: trato.id,
    hilo: `lio:${trato.fecha}:${trato.turno}`,
    // Lo de Lío atraviesa el modo concentración, menos las correcciones: una
    // petición para esta mañana que llega a mediodía ya no sirve de nada, pero
    // una corrección habla del pasado por definición y puede esperar. Marcar de
    // urgente lo que no lo es se paga en el mismo sitio: quien recibe dos avisos
    // así deja de fiarse del tercero.
    urgente: !esCorreccion,
    datos: { tipo: 'lio', fecha: trato.fecha, turno: trato.turno, trato: trato.id },
  };
  const cuando = cuandoFue(trato.fecha, trato.turno);
  const proponente = nombreDe(registro, trato.proponente_id);
  const destinatario = nombreDe(registro, trato.destinatario_id);

  // Retirar lo que uno pidió también se avisa: quien lo tenía en la bandeja se
  // quedaría contestando algo que ya no existe.
  if (!trato.activo || trato.activo === 0) {
    return [{
      ...comun,
      para: trato.destinatario_id,
      agrupa: `${comun.hilo}:retirado`,
      titulo: `🐾 ${proponente} retira lo que te pidió`,
      cuerpo: `${cuando} se queda como estaba.`,
    }];
  }

  if (trato.estado === 'pendiente') {
    if (esCorreccion) {
      return [{
        ...comun,
        para: trato.destinatario_id,
        categoria: CATEGORIA_CORRECCION,
        agrupa: `${comun.hilo}:pendiente`,
        titulo: `🐾 ${proponente} dice que sacó a Lío`,
        cuerpo: `${cuando}, y ese turno era tuyo.`,
      }];
    }
    // Un cambio va en un sentido o en el otro según quién lo proponga, igual que
    // en la hoja del turno: quien ya lo tenía pide que se lo cubran, y quien no
    // lo tenía se ofrece a sacarlo.
    const seOfrece = trato.proponente_id !== trato.asignado_previo_id;
    return [{
      ...comun,
      para: trato.destinatario_id,
      categoria: CATEGORIA_CAMBIO,
      agrupa: `${comun.hilo}:pendiente`,
      titulo: seOfrece
        ? `🐾 ${proponente} se ofrece a sacar a Lío`
        : `🐾 ${proponente} te pide que saques a Lío`,
      cuerpo: seOfrece ? `${cuando}, que te toca a ti.` : `${cuando}.`,
    }];
  }

  // Contestada. Ahora el que espera es quien la hizo.
  if (trato.estado === 'aceptado') {
    const nuevoDueno = trato.proponente_id === trato.asignado_previo_id
      ? trato.destinatario_id
      : trato.proponente_id;
    return [{
      ...comun,
      para: trato.proponente_id,
      agrupa: `${comun.hilo}:resuelto`,
      titulo: esCorreccion ? `🐾 ${destinatario} lo confirma` : `🐾 ${destinatario} acepta`,
      cuerpo: esCorreccion
        ? `${cuando} queda escrito a tu nombre.`
        : `${cuando} es de ${nombreDe(registro, nuevoDueno)}.`,
    }];
  }

  if (trato.estado === 'rechazado') {
    return [{
      ...comun,
      para: trato.proponente_id,
      agrupa: `${comun.hilo}:resuelto`,
      titulo: esCorreccion ? `🐾 ${destinatario} dice que no fue así` : `🐾 ${destinatario} no puede`,
      cuerpo: `${cuando} se queda como estaba.`,
    }];
  }

  // Caducado lo pone el reloj, no una persona: no hay nadie a quien contárselo
  // en el momento, y quien lo pidió lo ve al abrir.
  return [];
}

/**
 * Lo que le pasa al turno de otro sin pasar por una propuesta.
 *
 * Son los dos atajos que Lío permite dentro de la ventana: marcar que lo has
 * sacado tú, y quedarte con el turno de otro. Los dos se escriben en el acto y
 * sin preguntar —nadie necesita permiso para cargar con un recado ajeno—, y
 * justamente por eso el otro tiene que enterarse: es lo único que le queda.
 */
function avisosDeUnPaseo(contexto, cambio) {
  const { registro, actor, cambios } = contexto;
  const paseo = (registro.paseos || []).find((p) => p.id === cambio.id);
  if (!paseo || !paseo.activo) return [];

  const comun = {
    donde: 'paseos',
    objetoId: paseo.id,
    hilo: `lio:${paseo.fecha}:${paseo.turno}`,
    // Los dos atajos son de ahora mismo: enterarse tarde de que ya lo han sacado
    // es salir a la calle con el perro y encontrárselo dormido.
    urgente: true,
    datos: { tipo: 'lio', fecha: paseo.fecha, turno: paseo.turno },
  };
  const cuando = cuandoFue(paseo.fecha, paseo.turno);
  const quien = nombreDe(registro, actor.id);

  // Aceptar una propuesta escribe también su fila de paseo. Ese aviso ya lo da
  // la propuesta, con sus palabras; sin esto sonarían dos por lo mismo.
  const loExplicaUnTrato = cambios.some((otro) => otro.tipo === 'trato_paseo'
    && (registro.tratos_paseo || []).some((t) => t.id === otro.id
      && t.fecha === paseo.fecha && t.turno === paseo.turno));
  if (loExplicaUnTrato) return [];

  if (paseo.hecho_por_id && paseo.hecho_por_id !== paseo.asignado_id && paseo.asignado_id) {
    return [{
      ...comun,
      para: paseo.asignado_id,
      agrupa: `${comun.hilo}:hecho`,
      titulo: `🐾 ${quien} ha sacado a Lío por ti`,
      cuerpo: `${cuando}. No tienes que hacer nada.`,
    }];
  }

  // Quedarse con el turno de otro: quien lo pierde es quien lo tenía previsto,
  // que mientras no hubiera fila era el del cuadro. Y el cuadro que gobierna es
  // **el de cuando se abrió la ventana**, no el de ahora: con el de ahora, tocar
  // Ajustes cambiaría a quién se le avisa de un turno de la semana pasada.
  const cuadro = cuadroEn(
    normalizarVersiones(registro.lio_cuadro),
    inicioDeVentana(paseo.fecha, paseo.turno),
  );
  const previsto = cuadro[paseo.turno]?.[indiceDeDia(paseo.fecha)] || null;
  if (paseo.asignado_id && previsto && previsto !== paseo.asignado_id) {
    return [{
      ...comun,
      para: previsto,
      agrupa: `${comun.hilo}:dueno`,
      titulo: `🐾 ${quien} se queda tu turno`,
      cuerpo: `${cuando}. Lo saca ${nombreDe(registro, paseo.asignado_id)}.`,
    }];
  }

  return [];
}

// ---------------------------------------------------------- Comentarios --

const EMOJI_DE = {
  evento: '📅', idea: '💡', regalo: '🎁', apunte: '📍',
};

/**
 * A quién le importa un comentario: a quien creó la cosa y a quien ya haya
 * dicho algo en ella. Es la misma regla que aplica el sobre en el dispositivo, y
 * por el mismo motivo: un hilo es de quien lo abrió y de quien ha entrado en él.
 *
 * El texto del comentario viaja entero dentro del aviso. Se decidió a sabiendas
 * de lo que significa —pasa por los servidores de Apple y se queda en la
 * pantalla de bloqueo—, porque un comentario que hay que abrir para leer obliga
 * a entrar en la aplicación para saber si hacía falta entrar.
 */
function avisosDeComentario(contexto, cambio) {
  const { registro } = contexto;
  const comentario = (registro.comentarios || []).find((c) => c.id === cambio.id);
  if (!comentario || !comentario.activo) return [];

  const interesados = new Set();
  const dueno = autorDelObjeto(registro, comentario.objeto_tipo, comentario.objeto_id);
  if (dueno) interesados.add(dueno);
  for (const otro of registro.comentarios || []) {
    if (otro.activo && otro.objeto_tipo === comentario.objeto_tipo
      && otro.objeto_id === comentario.objeto_id && otro.id !== comentario.id) {
      interesados.add(otro.autor_id);
    }
  }
  interesados.delete(comentario.autor_id);

  const donde = comoSeLlama(registro, comentario.objeto_tipo, comentario.objeto_id);
  const emoji = EMOJI_DE[comentario.objeto_tipo] || '💬';

  return [...interesados].map((para) => ({
    para,
    // El comentario hereda la visibilidad de su objeto, así que lo que hay que
    // comprobar es que el objeto viaje, no el comentario.
    donde: 'comentarios',
    objetoId: comentario.id,
    hilo: `${comentario.objeto_tipo}:${comentario.objeto_id}`,
    agrupa: `comentario:${comentario.id}`,
    titulo: `${emoji} ${nombreDe(registro, comentario.autor_id)}, en «${donde}»`,
    cuerpo: comentario.texto || '',
    datos: {
      tipo: 'comentario',
      objeto_tipo: comentario.objeto_tipo,
      objeto_id: comentario.objeto_id,
    },
  }));
}

function autorDelObjeto(registro, tipo, id) {
  const donde = {
    evento: registro.eventos, idea: registro.ideas, regalo: registro.regalos,
    apunte: registro.apuntes,
  }[tipo];
  return (donde || []).find((fila) => fila.id === id)?.autor_id || null;
}

/** Cómo se llama eso, para poder escribir «Marta, en «la bici de Julia»». */
function comoSeLlama(registro, tipo, id) {
  if (tipo === 'evento') return registro.eventos.find((e) => e.id === id)?.titulo || 'un evento';
  if (tipo === 'idea') return registro.ideas.find((i) => i.id === id)?.titulo || 'una idea';
  if (tipo === 'apunte') return (registro.apuntes || []).find((a) => a.id === id)?.titulo || 'un apunte';
  if (tipo === 'regalo') {
    const regalo = registro.regalos.find((r) => r.id === id);
    const idea = regalo?.idea_id ? registro.ideas.find((i) => i.id === regalo.idea_id) : null;
    return idea?.titulo || 'un regalo';
  }
  return 'algo';
}

// ------------------------------------------------------------- Empujar --

/**
 * Los aparatos por los que se alcanza a una persona. Puede tener dos, o
 * ninguno: sin token no hay avisos y no pasa nada más.
 */
async function aparatosDe(db, personaId) {
  try {
    const { results } = await db
      .prepare('SELECT id, token_push FROM dispositivo WHERE persona_id = ? AND token_push IS NOT NULL')
      .bind(personaId)
      .all();
    return results || [];
  } catch (error) {
    // La ventana entre desplegar y migrar, otra vez: sin la columna todavía, no
    // hay avisos que empujar, y eso no puede tumbar una escritura.
    if (/no such (table|column)/i.test(String(error?.message || error))) return [];
    throw error;
  }
}

const olvidarToken = (db, aparatoId) => db
  .prepare('UPDATE dispositivo SET token_push = NULL, token_push_desde = NULL WHERE id = ?')
  .bind(aparatoId)
  .run()
  .catch(() => {});

/**
 * Componer y enviar. Nunca lanza y nunca bloquea la respuesta: se llama dentro
 * de `waitUntil`, porque quien acaba de guardar algo no tiene que esperar a que
 * a otro le suene el teléfono.
 */
/**
 * Que alguien quiere entrar en la agenda.
 *
 * Va por su cuenta y no por `FUENTES` porque una solicitud **no es un cambio de
 * la agenda**: entra por su propia ruta, con una credencial que no da acceso a
 * nada, y nunca aparece en el lote que sube la sincronización. Derivarla de ahí
 * habría sido forzarla a un sitio donde no está.
 *
 * Tampoco pasa por la comprobación de visibilidad, y conviene decir por qué: esa
 * regla existe para no contarle a nadie de casa algo de casa que no le toca, y
 * aquí lo que se cuenta son los datos que la propia persona acaba de declarar
 * para que la dejen entrar. Los administradores son exactamente quienes pueden
 * verlos —son los únicos que pueden hacer algo— y son los únicos que reciben
 * esto.
 *
 * Es urgente a propósito, como las de Lío: alguien está esperando en la puerta y
 * no puede hacer nada más hasta que se le conteste.
 */
export async function empujarSolicitud(env, solicitud, { enviar = enviarAviso } = {}) {
  if (!hayApnsConfigurado(env)) return { enviados: 0, motivo: 'sin-configurar' };

  const { results: administradores } = await env.DB
    .prepare(
      `SELECT id FROM persona
        WHERE rol = 'administrador' AND tiene_cuenta = 1 AND activa = 1`,
    )
    .all();

  const aviso = {
    // Sin nombre no es un caso raro: Apple solo lo entrega en la primerísima
    // autorización, y pedirlo a cambio de dejar entrar es lo que rechaza la
    // directriz 4. El correo del renglón de abajo es lo que queda para decir
    // quién llama, que es lo mismo que ve la bandeja.
    titulo: `🔑 ${solicitud.nombre_declarado || 'Alguien'} quiere entrar`,
    cuerpo: solicitud.correo
      ? `${solicitud.correo}${solicitud.correo_privado ? ' · buzón de reenvío de Apple' : ''}`
      : 'Ha elegido ocultar su correo.',
    // Se agrupa por el identificador de Apple y no por el de la fila: retirar
    // la solicitud y volver a entrar crea una fila con otro identificador, y
    // agrupando por este cada reintento de la misma persona sonaba como un
    // aviso nuevo, sin tope. Así, el de la segunda vez sustituye al de la
    // primera en la pantalla de bloqueo.
    agrupa: `solicitud:${solicitud.identificador_apple}`,
    urgente: true,
    datos: { tipo: 'solicitud', solicitud_id: solicitud.id },
  };

  let enviados = 0;
  for (const administrador of administradores || []) {
    for (const aparato of await aparatosDe(env.DB, administrador.id)) {
      const resultado = await enviar(env, aparato.token_push, aviso);
      if (resultado.ok) enviados += 1;
      else if (resultado.caducado) await olvidarToken(env.DB, aparato.id);
    }
  }
  return { enviados };
}

export async function empujar(env, registro, actor, cambios) {
  if (!hayApnsConfigurado(env)) return { enviados: 0, motivo: 'sin-configurar' };

  const avisos = avisosDe(registro, actor, cambios);
  if (!avisos.length) return { enviados: 0 };

  let enviados = 0;
  for (const aviso of avisos) {
    for (const aparato of await aparatosDe(env.DB, aviso.para)) {
      const resultado = await enviarAviso(env, aparato.token_push, aviso);
      if (resultado.ok) enviados += 1;
      else if (resultado.caducado) await olvidarToken(env.DB, aparato.id);
    }
  }
  return { enviados };
}
