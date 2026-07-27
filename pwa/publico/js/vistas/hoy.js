/**
 * Hoy: la pantalla con la que abre la aplicación.
 *
 * Es la síntesis que `specs/ux.md` §11 dejaba apuntada entre la opción B y la
 * D: la pantalla compuesta pasa a ser el inicio y la semana queda justo detrás,
 * en la pestaña siguiente, sin renunciar a su marco fijo. De momento compone
 * dos cosas —a quién saluda y qué hay para hoy— y deja el sitio hecho para los
 * bloques estacionales, que son los que le darán forma en diciembre. Está en
 * `specs/ux.md` §6.5.
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

export function reiniciarHoy() {
  versionEnUso = null;
  pie = null;
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

  vaciar(pantalla);
  pantalla.classList.add('pantalla-hoy');
  // Lo que hay que contestar va lo primero, porque es lo único de esta pantalla
  // que espera a alguien; los turnos de Lio, justo detrás, porque marcar es el
  // gesto que se hace dos veces al día. Después ya viene lo que se venía a leer.
  pantalla.append(
    ...bandaDePeticiones(ctx),
    ...bloqueDeLio(dia, ctx),
    bloqueDelDia(dia, ctx),
    pieDeVersion(),
  );
}

// ---------------------------------------------------------------- Lio --

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
 * —«¿la sacaste?»— en lugar de la afirmación. Arrastrarlo más días convertiría
 * Hoy en una lista de reproches, y afirmar que el perro no salió sería casi
 * siempre falso: lo que faltó fue el gesto en el teléfono.
 *
 * Está en `specs/ux.md` §6.5 y §10.3.
 */
function bloqueDeLio(dia, ctx) {
  if (!hayLio(ctx.vista.datos)) return [];

  const grupo = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: '🐾 Lio' }),
  ]);

  for (const turno of turnosDe(ctx.vista.datos, dia)) grupo.append(filaDeTurno(turno, ctx));

  const ayer = sumarDias(dia, -1);
  for (const turno of turnosDe(ctx.vista.datos, ayer)) {
    if (turno.estado !== 'sin-marcar' || turno.trato) continue;
    grupo.append(filaDeTurno(turno, ctx, { rezagado: true }));
  }

  return [grupo];
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
