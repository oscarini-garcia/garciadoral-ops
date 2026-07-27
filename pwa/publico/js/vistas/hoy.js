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

import { el, vaciar } from '../ui.js';
import { formatearFechaLarga, hoy, horaDe, instanciasEn, iso, repartirPorDia } from '../semana.js';
import { comprobarActualizacion, esNativo, toque, versionInstalada } from '../native.js';
import { VERSION_APP } from '../version.js';
import { abrirDetalleEvento } from './semana.js';

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
  pantalla.append(bloqueDelDia(dia, ctx), pieDeVersion());
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
