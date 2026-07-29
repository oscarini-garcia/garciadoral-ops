/**
 * Hoy: la pantalla con la que abre la aplicación.
 *
 * Es la síntesis que `specs/ux.md` §11 dejaba apuntada entre la opción B y la
 * D: la pantalla compuesta pasa a ser el inicio y la semana queda justo detrás,
 * en la pestaña siguiente, sin renunciar a su marco fijo. Compone a quién
 * saluda, la frase del día, lo de Lío y qué hay para hoy, y deja el sitio hecho
 * para los bloques estacionales, que son los que le darán forma en diciembre.
 * Está en `specs/ux.md` §6.5.
 *
 * **El saludo ocupa la línea del título**, igual que en la agenda la ocupa el
 * periodo. Escribir «Hoy» arriba y saludar debajo diría dos veces lo mismo
 * gastando dos líneas, y la de arriba ya está puesta.
 *
 * **La versión va abajo del todo y a la derecha**, que es donde no estorba a lo
 * que se viene a leer. Es a la vez el dato y el verbo: se toca y busca si hay
 * una nueva, contando por dónde va en la misma línea. Un botón aparte diciendo
 * «Buscar actualización» pediría sitio en la pantalla de inicio para algo que
 * se hace tres veces al año; el mismo texto, tocable, no pide ninguno.
 */

import { el, vaciar, abrirHoja, avisar } from '../ui.js';
import { formatearFechaLarga, hoy, horaDe, instanciasEn, iso, repartirPorDia, sumarDias } from '../semana.js';
import { comprobarActualizacion, esNativo, toque, versionInstalada } from '../native.js';
import { escribirLaChispa, estado } from '../sincronizacion.js';
import { chispaGuardada, guardarChispa } from '../almacen.js';
import { VERSION_APP } from '../version.js';
import {
  abrirDetalleEvento, bloqueDePropuesta, filaDeTurno, textoDePropuesta,
} from './semana.js';
import { hayLio, resolverPropuesta, tratosParaMi, turnosDe } from '../lio.js';

/** El bundle OTA que está aplicado, si se ha llegado a preguntar. Se guarda
 *  aquí para que volver a la pestaña no vuelva a enseñar la de origen mientras
 *  la consulta viaja. */
let versionEnUso = null;

/**
 * El pie con la versión, que se construye una sola vez y se reutiliza.
 *
 * La pantalla se repinta entera con cada sincronización, y una descarga dura
 * varios segundos: si el pie se rehiciera, el relato se esfumaría a media
 * cuenta y en su sitio aparecería otra vez la versión de antes, como si el
 * toque no hubiera hecho nada. Volver a añadir el mismo nodo lo mueve, no lo
 * duplica.
 */
let pie = null;

/** Lo mismo que el pie, y por lo mismo: la pantalla se repinta con cada
 *  sincronización y la frase no puede desaparecer y volver mientras se pide. */
let chispa = null;

export function reiniciarHoy() {
  versionEnUso = null;
  pie = null;
  chispa = null;
}

/**
 * El saludo, que es el título de la pantalla.
 *
 * Con el nombre de quien mira, que es el único sitio de la aplicación donde se
 * le llama por él: en todo lo demás uno es «yo» y no hace falta nombrarlo.
 */
export function tituloDeHoy(ctx) {
  const nombre = ctx?.vista?.yo?.nombre;
  const saludo = saludoDeLaHora(new Date().getHours());
  return nombre ? `${saludo}, ${nombre}` : saludo;
}

/**
 * Qué decir de la sincronización, o `null` si no hay nada que decir.
 *
 * «Sincronizando» no se cuenta: dura un segundo y aparecería y desaparecería
 * sola en cada apertura, que es exactamente el parpadeo que hace que la gente
 * deje de mirar un indicador.
 */
function avisoDeSincronizacion() {
  const situacion = estado();
  if (situacion.estado === 'sin-conexion') return 'Sin conexión · lo escrito se subirá solo';
  if (situacion.estado === 'error') return 'Sin sincronizar · se reintenta solo';
  return null;
}

/** Y por qué, para el `title` de esa línea: la subcabecera no es sitio para un
 *  mensaje de servidor, pero quien lo busque no tiene por qué abrir Ajustes. */
const motivoDeSincronizacion = () => estado().motivo || null;

/** Las tres franjas de siempre, con la madrugada contada como noche: a las tres
 *  de la mañana nadie da los buenos días. */
function saludoDeLaHora(hora) {
  if (hora >= 6 && hora < 13) return 'Buenos días';
  if (hora >= 13 && hora < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

export function pintarHoy(pantalla, subcabecera, ctx) {
  const dia = hoy();

  // Qué día es hoy, escrito entero. Arriba está el saludo, que no lo dice.
  vaciar(subcabecera).append(el('p', { class: 'hoy-fecha', texto: formatearFechaLarga(dia) }));

  // Y lo único que había que no perder al retirar el punto de la cabecera: que
  // algo lleve un rato sin subir. Nada mientras va bien —que es el 99 % de los
  // días, y era el argumento por el que el punto perdió su palabra—; cuando no,
  // se lee en vez de leerse en un color. Desaparece sola al arreglarse.
  const aviso = avisoDeSincronizacion();
  if (aviso) {
    subcabecera.append(el('p', {
      class: 'hoy-sync', texto: aviso, title: motivoDeSincronizacion() || null,
    }));
  }

  vaciar(pantalla);
  pantalla.classList.add('pantalla-hoy');
  // Lo que hay que contestar va lo primero, porque es lo único de esta pantalla
  // que espera a alguien; los turnos de Lío, justo detrás, porque marcar es el
  // gesto que se hace dos veces al día. Después ya viene lo que se venía a leer.
  pantalla.append(
    ...bandaDePeticiones(ctx),
    laChispa(dia, ctx),
    ...bloqueDeLio(dia, ctx),
    bloqueDelDia(dia, ctx),
    pieDeVersion(),
  );
}

// ------------------------------------------------------- La frase del día --

/**
 * Dos líneas con guasa sobre el día, escritas por el modelo.
 *
 * Va detrás de las peticiones de Lío y delante de todo lo demás. Detrás, porque
 * una broma por encima de lo único de esta pantalla que espera respuesta es una
 * broma a destiempo; delante de lo demás, porque los días con peticiones son los
 * menos y el resto queda justo bajo el saludo, que es donde se pidió.
 *
 * **Una al día y guardada en el teléfono.** Es lo que la hace la frase *del
 * día*: pedida en cada apertura cambiaría al volver de la pestaña de al lado y
 * dejaría de ser nada. Se toca y se cambia, que es la única manera de pedir otra.
 *
 * Sin frase no hay hueco, ni rótulo, ni mensaje: sin clave de Anthropic puesta
 * esta línea no existe, igual que no existe el botón de la IA al compartir.
 */
function laChispa(dia, ctx) {
  if (!chispa) chispa = construirChispa();

  // El contexto se renueva en cada repintado, que es lo que hace que el toque
  // de esta tarde no pida la frase con la instantánea de esta mañana.
  chispa.apuntar(dia, ctx);

  const guardada = chispaGuardada(iso(dia));
  if (guardada !== null) chispa.escribir(guardada);
  else chispa.pedir();

  return chispa.nodo;
}

/** Lo de hoy y lo que viene en la semana, en identificadores: el título, la hora
 *  y el sitio los pone el Worker desde la instantánea filtrada de quien pide. */
function loQueHayAlrededor(dia, ctx) {
  const idsDe = (desde, hasta) => [...new Set(
    instanciasEn(ctx.vista.datos, desde, hasta).map((instancia) => instancia.evento.id),
  )];
  const hoyMismo = idsDe(dia, dia);
  return {
    eventos: hoyMismo,
    proximos: idsDe(sumarDias(dia, 1), sumarDias(dia, 7)).filter((id) => !hoyMismo.includes(id)),
  };
}

function construirChispa() {
  const nodo = el('button', { class: 'hoy-chispa', type: 'button', hidden: true });
  let dia = null;
  let ctx = null;
  let pidiendo = false;

  const escribir = (frase) => {
    nodo.textContent = frase;
    nodo.hidden = !frase;
    nodo.dataset.estado = 'lista';
    nodo.setAttribute('aria-label', frase ? `${frase}. Tocar para otra.` : '');
    nodo.setAttribute('title', 'Otra frase');
  };

  const pedir = async () => {
    if (pidiendo || !ctx) return;
    pidiendo = true;
    // Mientras llega no se enseña nada nuevo: lo que hubiera se queda puesto y
    // se apaga un poco. Un «pensando…» ocuparía la línea para no decir nada.
    if (!nodo.hidden) nodo.dataset.estado = 'pidiendo';

    const fecha = iso(dia);
    const { eventos, proximos } = loQueHayAlrededor(dia, ctx);
    const frase = await escribirLaChispa(fecha, eventos, proximos);
    pidiendo = false;

    // Solo se guarda lo que ha salido. Un día sin clave o sin cobertura no
    // escribe una frase vacía en el almacén: se vuelve a intentar al abrir.
    if (frase) guardarChispa(fecha, frase);
    escribir(frase);
  };

  nodo.onclick = () => { toque(); pedir(); };

  return {
    nodo,
    escribir,
    pedir,
    apuntar: (cual, contexto) => { dia = cual; ctx = contexto; },
  };
}

// ---------------------------------------------------------------- Lío --

/**
 * Cuántas peticiones se enseñan de golpe.
 *
 * Con dos, lo excepcional grita cuando toca sin quitarle el sitio a la lista del
 * día; a partir de ahí se cuentan y se abren aparte. Sin tope, una tarde de
 * cambios dejaría «Para hoy» por debajo del pliegue, que es justo lo que se
 * viene a leer.
 */
const TOPE_PETICIONES = 2;

function bandaDePeticiones(ctx) {
  const pendientes = tratosParaMi(ctx.vista.datos);
  if (!pendientes.length) return [];

  const banda = el('div', { class: 'lio-banda' });
  for (const trato of pendientes.slice(0, TOPE_PETICIONES)) {
    banda.append(tarjetaDePeticion(trato, ctx));
  }

  const restantes = pendientes.length - TOPE_PETICIONES;
  if (restantes > 0) {
    banda.append(el('button', {
      class: 'desbordamiento', type: 'button',
      onclick: () => abrirHoja('Por contestar', (cuerpo) => {
        for (const trato of pendientes) cuerpo.append(bloqueDePropuesta(trato, ctx));
      }),
    }, [`y ${restantes} más`]));
  }
  return [banda];
}

/** Una petición, con sus dos respuestas escritas enteras y del mismo tamaño. */
function tarjetaDePeticion(trato, ctx) {
  const responder = async (acepta) => {
    toque();
    await resolverPropuesta(trato, acepta);
    avisar(acepta ? 'Contestado' : 'Se queda como estaba');
    ctx.refrescar();
  };

  return el('div', { class: 'lio-peticion' }, [
    el('p', { texto: textoDePropuesta(trato, ctx) }),
    el('div', { class: 'acciones' }, [
      el('button', { class: 'boton crecer', type: 'button', onclick: () => responder(true) },
        [trato.clase === 'cambio' ? 'Acepto' : 'Es verdad']),
      el('button', { class: 'boton', type: 'button', onclick: () => responder(false) },
        [trato.clase === 'cambio' ? 'No puedo' : 'No fue así']),
    ]),
  ]);
}

/**
 * Los dos turnos de hoy, y el de ayer que se quedó sin marcar.
 *
 * Lo de ayer sube una sola vez, al día siguiente, y con la pregunta puesta
 * —«¿sacaste a Lío?»— en lugar de la afirmación. Arrastrarlo más días convertiría
 * Hoy en una lista de reproches, y afirmar que el perro no salió sería casi
 * siempre falso: lo que faltó fue el gesto en el teléfono.
 *
 * Está en `specs/ux.md` §6.5 y §10.3.
 */
function bloqueDeLio(dia, ctx) {
  if (!hayLio(ctx.vista.datos)) return [];

  const grupo = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: '🐾 Lío' }),
  ]);

  for (const turno of turnosDe(ctx.vista.datos, dia)) grupo.append(filaDeTurno(turno, ctx));

  const ayer = sumarDias(dia, -1);
  for (const turno of turnosDe(ctx.vista.datos, ayer)) {
    if (turno.estado !== 'sin-marcar' || turno.trato) continue;
    grupo.append(filaDeTurno(turno, ctx, { rezagado: true }));
  }

  return [grupo];
}

// ------------------------------------------------------------ Lo de hoy --

/**
 * Lo que hay hoy, con los cumpleaños incluidos: se componen en el dispositivo y
 * llegan por el mismo camino que los demás eventos.
 *
 * Es lo visible para quien mira, sin volver a filtrar nada: lo que está en el
 * almacén local ya pasó por la visibilidad en el servidor.
 */
function bloqueDelDia(dia, ctx) {
  const apariciones = repartirPorDia(instanciasEn(ctx.vista.datos, dia, dia), [dia]).get(iso(dia)) || [];

  const grupo = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Para hoy' }),
  ]);

  if (!apariciones.length) {
    grupo.append(el('p', { class: 'vacio', texto: 'Hoy no hay nada apuntado.' }));
    return grupo;
  }

  for (const aparicion of apariciones) grupo.append(tarjetaDelDia(aparicion, ctx));
  return grupo;
}

/**
 * La tarjeta de un evento de hoy. Es la de la lista de la agenda sin la fecha:
 * aquí todas son del mismo día, y repetirlo en cada línea sería escribir catorce
 * veces lo que ya dice la cabecera.
 */
function tarjetaDelDia(aparicion, ctx) {
  const hora = horaDe(aparicion);
  const cara = ctx.vista.caraDe(aparicion.evento);
  const participantes = ctx.vista.participantes(aparicion.evento).map((id) => ctx.vista.nombre(id));

  const pie = [
    hora ? null : 'Todo el día',
    aparicion.evento.ubicacion,
    participantes.length ? participantes.join(', ') : null,
  ].filter(Boolean).join(' · ');

  return el('button', {
    class: 'tarjeta', type: 'button',
    onclick: () => abrirDetalleEvento(aparicion.evento.id, ctx, aparicion),
  }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('span', { class: 'linea-emoji', texto: cara.emoji }),
      el('h3', { texto: cara.titulo + (aparicion.continuacion ? ' (cont.)' : '') }),
      hora ? el('span', { class: 'linea-hora empujar', texto: hora }) : null,
    ]),
    pie ? el('p', { texto: pie }) : null,
  ]);
}

// ------------------------------------------------------------- La versión --

/**
 * Cada fase de la actualización en una línea, que sustituye a la anterior.
 *
 * Es el mismo relato que cuenta el panel de Ajustes, contado de otra manera:
 * allí las fases se apilan y se leen como lo que ha ido pasando, y aquí hay
 * sitio para una sola, así que va la de ahora y las anteriores se olvidan.
 */
const RELATO = {
  comprobando: () => 'Buscando si hay versión nueva…',
  'al-dia': ({ version }) => `Ya tienes lo último${version ? ` (${version})` : ''}`,
  'hay-version': ({ version }) => `Hay una versión nueva: ${version}`,
  descargando: ({ porcentaje }) => (porcentaje === undefined || porcentaje === null
    ? 'Descargando…'
    : `Descargando… ${Math.round(porcentaje)} %`),
  instalando: () => 'Instalando…',
  descargada: ({ version }) => `Versión ${version} lista: se aplica al volver a abrir`,
  'sin-manifiesto': () => 'No he podido comprobar si hay versión nueva',
  error: ({ detalle }) => `No he podido actualizar: ${detalle || 'error'}`,
  'no-aplica': () => 'Aquí no hay nada que actualizar',
};

const FALLIDAS = new Set(['sin-manifiesto', 'error']);

/** Cuánto se queda en pantalla lo último que se contó antes de volver a decir
 *  qué versión hay. Lo justo para leerlo sin tener que darse prisa. */
const DESCANSO_MS = 4000;

function pieDeVersion() {
  if (!pie) pie = construirPie();
  return pie;
}

function construirPie() {
  const boton = el('button', { class: 'version', type: 'button' });
  let temporizador = null;
  let ocupado = false;

  const reposo = () => {
    const texto = `Versión ${versionEnUso || VERSION_APP}`;
    boton.dataset.estado = 'reposo';
    boton.textContent = texto;
    boton.setAttribute('aria-label', `${texto}. Tocar para buscar una versión nueva.`);
    boton.setAttribute('title', 'Buscar una versión nueva');
  };

  const contar = (texto, estado = 'curso') => {
    clearTimeout(temporizador);
    boton.dataset.estado = estado;
    boton.textContent = texto;
    boton.setAttribute('aria-label', texto);
  };

  reposo();

  // Dentro de la cáscara la versión que cuenta es la del bundle aplicado, y esa
  // solo se sabe preguntándole al complemento. Mientras contesta se enseña la de
  // origen, que es la que hay si no hay ninguno encima.
  versionInstalada().then((version) => {
    if (!version || version === versionEnUso) return;
    versionEnUso = version;
    if (boton.dataset.estado === 'reposo') reposo();
  });

  boton.onclick = async () => {
    if (ocupado) return;
    ocupado = true;
    toque();
    try {
      // La web se recarga al terminar, así que allí no hay reposo al que
      // volver: lo que venga después lo pinta ya la página nueva.
      if (!esNativo()) {
        await actualizarLaWeb(contar);
        return;
      }
      await actualizarElBundle(contar);
      temporizador = setTimeout(reposo, DESCANSO_MS);
    } finally {
      ocupado = false;
    }
  };

  return el('div', { class: 'pie-version' }, [boton]);
}

/**
 * La cáscara: se lee el manifiesto y, si hay bundle nuevo, se descarga.
 *
 * `comprobarActualizacion` avisa de cada fase mientras trabaja —incluida la
 * última—, así que basta con escribir lo que llega; lo devuelto solo se usa para
 * apuntar la versión que ha quedado instalada.
 */
async function actualizarElBundle(contar) {
  const resultado = await comprobarActualizacion({
    alAvanzar: (avance) => {
      const escribir = RELATO[avance.fase];
      if (escribir) contar(escribir(avance), FALLIDAS.has(avance.fase) ? 'fallo' : 'curso');
    },
  });
  if (resultado.estado === 'descargada' && resultado.version) versionEnUso = resultado.version;
}

/**
 * El navegador: aquí no hay bundle que descargar. Lo que hace que llegue lo
 * último es que el service worker vuelva a preguntar y la página se recargue,
 * de modo que eso es lo que hace el mismo toque.
 *
 * Las dos fases se sostienen un momento a propósito. Preguntarle al service
 * worker no tarda nada, así que sin esa pausa el toque sería una recarga a
 * secas: la pantalla parpadearía y nadie habría visto que llegó a comprobar
 * algo.
 */
async function actualizarLaWeb(contar) {
  contar(RELATO.comprobando());
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    await Promise.all([registro?.update(), esperar(700)]);
  } catch {
    /* sin service worker registrado: la recarga sola ya trae lo último */
  }
  contar('Recargando…');
  await esperar(500);
  window.location.reload();
}

const esperar = (ms) => new Promise((seguir) => { setTimeout(seguir, ms); });
