/**
 * Motor de sincronización: interfaz optimista sobre una cola persistente.
 *
 * Toda escritura se refleja de inmediato en la instantánea local y se apila en
 * la cola; la subida ocurre después, cuando hay red. No hay indicadores de
 * espera en el camino principal (specs/ux.md §1).
 *
 * La respuesta del servidor **sustituye** la instantánea local. Es lo que hace
 * que la retirada retroactiva funcione sola: cuando alguien pasa a ser
 * destinatario de un elemento que ya tenía sincronizado, la siguiente respuesta
 * sencillamente no lo trae y desaparece de su dispositivo.
 */

import {
  encolarCambio, guardarInstantanea, leerCola, leerInstantanea, vaciarCola,
} from './almacen.js';
import { ahora, estaActivo } from './modelo.js';

const PLURAL = {
  persona: 'personas',
  atributo_persona: 'atributos_persona',
  categoria: 'categorias',
  etiqueta: 'etiquetas',
  evento: 'eventos',
  idea: 'ideas',
  ocasion: 'ocasiones',
  regalo: 'regalos',
  comentario: 'comentarios',
  paseo: 'paseos',
  trato_paseo: 'tratos_paseo',
  lugar: 'lugares',
  apunte: 'apuntes',
  voto: 'votos',
  visto: 'vistos',
};

let configuracion = { base: '', token: '', demostracion: false };
let instantaneaActual = null;
let estadoActual = { estado: navigator.onLine ? 'al-dia' : 'sin-conexion', ultima: null, rechazados: [] };
const suscriptores = new Set();
let sincronizando = false;

export const instantanea = () => instantaneaActual;
export const estado = () => estadoActual;

export function suscribir(escuchador) {
  suscriptores.add(escuchador);
  return () => suscriptores.delete(escuchador);
}

function anunciar() {
  for (const escuchador of suscriptores) escuchador(instantaneaActual, estadoActual);
}

/**
 * `rechazados` son los cambios que el servidor no ha aplicado.
 *
 * Viajan con el estado porque hay que **decirlo**: la interfaz es optimista, así
 * que lo rechazado se vio guardado un momento y desaparece con la instantánea
 * siguiente. Sin aviso, eso no se lee como un error sino como que la aplicación
 * pierde cosas.
 */
function fijarEstado(estado, ultima = estadoActual.ultima, rechazados = []) {
  estadoActual = { estado, ultima, rechazados };
  anunciar();
}

// --------------------------------------------------------------- Arranque --

// Con nombre, y no anónimos, porque `detener` tiene que poder retirarlos: sin
// eso, cerrar sesión dejaría oyentes de una sesión anterior llamando a
// `sincronizar` con un token que ya no vale.
const alVolverLaRed = () => sincronizar();
const alPerderLaRed = () => fijarEstado('sin-conexion');
const alCambiarVisibilidad = () => {
  if (document.visibilityState === 'visible') sincronizar();
};

export async function iniciar({ base, token, demostracion = false, inicial = null }) {
  detener();
  configuracion = { base, token, demostracion };

  instantaneaActual = inicial || (await leerInstantanea());
  if (instantaneaActual) anunciar();

  if (demostracion) {
    if (inicial) await guardarInstantanea(inicial);
    fijarEstado('demostracion');
    return instantaneaActual;
  }

  window.addEventListener('online', alVolverLaRed);
  window.addEventListener('offline', alPerderLaRed);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);

  await sincronizar();
  return instantaneaActual;
}

/**
 * Deja el motor como recién cargado: sin oyentes, sin instantánea en memoria y
 * sin suscriptores.
 *
 * Lo llama `iniciar` —para que entrar dos veces no apile oyentes ni
 * suscriptores— y el cierre de sesión, que necesita además que no quede nada de
 * la persona anterior en memoria. Lo que hay en disco lo borra `olvidarTodo`.
 */
export function detener() {
  window.removeEventListener('online', alVolverLaRed);
  window.removeEventListener('offline', alPerderLaRed);
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);

  configuracion = { base: '', token: '', demostracion: false };
  instantaneaActual = null;
  estadoActual = { estado: navigator.onLine ? 'al-dia' : 'sin-conexion', ultima: null, rechazados: [] };
  suscriptores.clear();
}

// ------------------------------------------------------------- Escrituras --

/**
 * Registra un cambio. `campos` son solo los que cambian; el resto se conserva.
 * Devuelve la instantánea ya actualizada, de modo que quien llama puede pintar
 * sin esperar a nada.
 */
export async function guardar(tipo, id, campos) {
  const cambio = { tipo, id, campos, actualizado_en: ahora() };
  aplicarEnLocal(cambio);
  derivarEnLocal();
  await guardarInstantanea(instantaneaActual);
  anunciar();

  if (configuracion.demostracion) return instantaneaActual;

  await encolarCambio(cambio);
  sincronizar();
  return instantaneaActual;
}

/** El borrado nunca es físico: se marca como inactivo (specs/modelo-datos.md §1). */
export function retirar(tipo, id) {
  const campo = ['persona', 'idea', 'ocasion', 'categoria', 'etiqueta'].includes(tipo) ? 'activa' : 'activo';
  return guardar(tipo, id, { [campo]: 0 });
}

function aplicarEnLocal(cambio) {
  const clave = PLURAL[cambio.tipo];

  // El cuadro de Lio no es una fila de una lista sino un dato suelto de la
  // instantánea, así que se sustituye entero.
  if (cambio.tipo === 'lio_cuadro') {
    instantaneaActual.lio_cuadro = cambio.campos.cuadro;
    return;
  }

  if (cambio.tipo === 'presupuesto') {
    const ocasion = instantaneaActual.ocasiones.find((o) => o.id === cambio.campos.ocasion_id);
    if (!ocasion) return;
    ocasion.presupuestos = (ocasion.presupuestos || []).filter((p) => p.persona_id !== cambio.campos.persona_id);
    ocasion.presupuestos.push({ persona_id: cambio.campos.persona_id, importe: Number(cambio.campos.importe) || 0 });
    return;
  }

  if (!clave) return;
  instantaneaActual[clave] = instantaneaActual[clave] || [];
  const lista = instantaneaActual[clave];
  const indice = lista.findIndex((fila) => fila.id === cambio.id);

  if (indice === -1) {
    lista.push({ id: cambio.id, creado_en: cambio.actualizado_en, actualizado_en: cambio.actualizado_en, ...cambio.campos });
  } else {
    lista[indice] = { ...lista[indice], ...cambio.campos, actualizado_en: cambio.actualizado_en };
  }
}

/**
 * Los estados que nadie mantiene a mano, replicados en el cliente para que la
 * interfaz no muestre una idea «activa» un segundo después de promoverla. El
 * servidor vuelve a calcularlos y su versión es la que manda.
 */
function derivarEnLocal() {
  const regalos = (instantaneaActual.regalos || []).filter((r) => estaActivo(r));

  for (const idea of instantaneaActual.ideas || []) {
    const suyos = regalos.filter((r) => r.idea_id === idea.id);
    if (suyos.some((r) => r.estado === 'entregado')) idea.estado = 'cerrada';
    else if (suyos.length && idea.estado === 'activa') idea.estado = 'en_curso';
    // Sin nada colgando vuelve al banco, venga de donde venga: quitar el regalo
    // deshace también el cierre, que si no era un punto sin retorno escondido.
    else if (!suyos.length && ['en_curso', 'cerrada'].includes(idea.estado)) idea.estado = 'activa';
  }

  for (const ocasion of instantaneaActual.ocasiones || []) {
    const suyos = regalos.filter((r) => r.ocasion_id === ocasion.id);
    if (suyos.length && suyos.every((r) => r.estado === 'entregado')) ocasion.estado = 'cerrada';
  }
}

// ------------------------------------------------------------ Subida/bajada --

async function peticion(camino, opciones = {}) {
  const respuesta = await fetch(`${configuracion.base}${camino}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${configuracion.token}`,
      'X-Plataforma': 'web',
      ...(opciones.headers || {}),
    },
  });
  if (respuesta.status === 401) {
    const error = new Error('sesión caducada');
    error.sesionCaducada = true;
    throw error;
  }
  if (!respuesta.ok) {
    // Un «no» previsible —la solicitud que el otro administrador acaba de
    // resolver, la persona que ya tiene cuenta— viene explicado en el cuerpo, y
    // ese texto es lo único que se le puede enseñar a quien mira la pantalla.
    const datos = await respuesta.json().catch(() => ({}));
    const error = new Error(datos.error || datos.motivo || `la API respondió ${respuesta.status}`);
    // El cuerpo entero viaja con el error: la redacción devuelve ahí la traza de
    // los intentos, que es lo que se enseña al administrador para depurar.
    error.estado = respuesta.status;
    error.datos = datos;
    throw error;
  }
  return respuesta.json();
}

// ------------------------------------------------------------- Solicitudes --

/** La bandeja de quien espera. Reservada a los administradores por el Worker,
 *  no por quien llama: aquí no hay ninguna comprobación que valga. */
export async function listarSolicitudes() {
  const { solicitudes } = await peticion('/api/solicitudes');
  return solicitudes || [];
}

export function resolverSolicitud(cuerpo) {
  return peticion('/api/solicitudes/resolver', { method: 'POST', body: JSON.stringify(cuerpo) });
}

// --------------------------------------------------------------- Redacción --

/**
 * Pide al servidor el texto de un día, contado por un modelo.
 *
 * Solo viajan la fecha y los identificadores de lo que se está viendo: el texto
 * que llega al modelo lo compone el Worker con la instantánea filtrada de quien
 * pide, de modo que desde aquí no se le puede meter nada.
 */
export async function redactarDia(fecha, eventos) {
  return conAvisoDeOmitidos(await peticion('/api/redactar', {
    method: 'POST',
    body: JSON.stringify({ fecha, eventos }),
  }));
}

/**
 * El servidor dice cuántos identificadores no ha sabido resolver. Si hay
 * alguno, lo que se ha redactado cuenta menos de lo que se estaba mirando.
 *
 * No se le enseña a quien comparte —el texto sigue valiendo, y no es cosa
 * suya—, pero queda en la consola: así se ve a la primera, en lugar de
 * descubrirlo porque un mensaje sale corto. Pasó con los cumpleaños derivados,
 * que el servidor descartaba sin decir nada.
 */
function conAvisoDeOmitidos({ texto, omitidos }) {
  if (omitidos) console.warn(`la redacción dejó fuera ${omitidos} evento(s) que el servidor no reconoce`);
  return texto;
}

/**
 * Lo mismo con un tramo de días —la semana, el mes, lo que viene—.
 *
 * El reparto por días va desde aquí porque las repeticiones se expanden aquí:
 * el Worker recibe fechas e identificadores, y compone el texto con los títulos
 * de su propia instantánea.
 */
export async function redactarPeriodo(desde, hasta, dias) {
  return conAvisoDeOmitidos(await peticion('/api/redactar', {
    method: 'POST',
    body: JSON.stringify({ desde, hasta, dias }),
  }));
}

/**
 * Una tanda de cinco regalos propuestos para una persona.
 *
 * Viajan el identificador de la persona, lo que quien apunta lleve escrito en
 * el formulario y los títulos que ya se han propuesto, para que la tanda
 * siguiente no repita a la anterior. Lo que se sabe de ella —sus datos, lo que
 * ha pedido, lo que ya tiene apuntado y lo que recibió— lo reúne el Worker con
 * la instantánea filtrada de quien pide.
 */
export async function sugerirRegalos(personaId, { pista = '', descartadas = [] } = {}) {
  const { propuestas } = await peticion('/api/regalo/sugerir', {
    method: 'POST',
    body: JSON.stringify({ persona_id: personaId, pista, descartadas }),
  });
  return propuestas || [];
}

/**
 * Una tanda de cinco felicitaciones para quien cumple.
 *
 * Viaja el identificador de la persona y lo que ya se ha escrito en esta misma
 * sesión, para que la tanda siguiente no repita a la anterior. Lo que se sabe de
 * ella lo reúne el Worker, y a propósito reúne **menos** que para un regalo: el
 * texto se le manda a quien cumple, así que ni las ideas ni los regalos entran.
 */
export async function felicitarCumple(personaId, { descartadas = [] } = {}) {
  const { felicitaciones } = await peticion('/api/cumple/felicitar', {
    method: 'POST',
    body: JSON.stringify({ persona_id: personaId, descartadas }),
  });
  return felicitaciones || [];
}

/**
 * Cinco cosas que apuntar en un sitio, de la clase que se pida.
 *
 * Viajan el sitio, la clase y lo ya propuesto en esta misma sesión. Lo que se
 * sabe del sitio —lo que ya hay apuntado ahí, que es lo que hace que la tanda no
 * repita lo obvio— lo reúne el Worker con la instantánea filtrada de quien pide.
 */
export async function apuntarEnSitio(lugarId, { clase = 'saber', descartadas = [] } = {}) {
  const { propuestas } = await peticion('/api/sitio/apuntar', {
    method: 'POST',
    body: JSON.stringify({ lugar_id: lugarId, clase, descartadas }),
  });
  return propuestas || [];
}

/** Los ajustes de la redacción. Reservados a administradores por el Worker. */
export const leerAjustesDeIa = () => peticion('/api/ia');

export const guardarAjustesDeIa = (campos) =>
  peticion('/api/ia', { method: 'POST', body: JSON.stringify(campos) });

/** Redacta y devuelve la traza entera, salga bien o mal. */
export const probarRedaccion = (fecha, eventos = []) =>
  peticion('/api/ia/probar', { method: 'POST', body: JSON.stringify({ fecha, eventos }) });

export async function sincronizar() {
  if (configuracion.demostracion || sincronizando) return instantaneaActual;
  if (!navigator.onLine) { fijarEstado('sin-conexion'); return instantaneaActual; }

  sincronizando = true;
  fijarEstado('sincronizando');

  try {
    const cola = await leerCola();
    let nueva;
    let noAplicados = [];

    if (cola.length) {
      const respuesta = await peticion('/api/cambios', {
        method: 'POST',
        body: JSON.stringify({ cambios: cola.map(({ orden, ...cambio }) => cambio) }),
      });
      await vaciarCola(cola[cola.length - 1].orden);
      nueva = respuesta.instantanea;

      noAplicados = (respuesta.resultados || []).filter((r) => !r.aplicado);
      if (noAplicados.length) {
        console.warn('Cambios no aplicados por el servidor:', noAplicados);
      }
    } else {
      nueva = await peticion('/api/sync');
    }

    instantaneaActual = nueva;
    await guardarInstantanea(nueva);
    fijarEstado('al-dia', new Date().toISOString(), noAplicados);
  } catch (error) {
    if (error.sesionCaducada) {
      fijarEstado('sesion-caducada');
      anunciar();
    } else {
      console.warn('Sincronización fallida:', error);
      fijarEstado(navigator.onLine ? 'error' : 'sin-conexion');
    }
  } finally {
    sincronizando = false;
  }

  return instantaneaActual;
}
