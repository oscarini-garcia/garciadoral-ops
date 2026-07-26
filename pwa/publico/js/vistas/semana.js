/**
 * La agenda: semana, mes y lista sobre los mismos datos.
 *
 * Las tres vistas son necesarias porque responden a preguntas distintas: qué
 * hay estos días, cómo se reparte el mes y qué viene a continuación
 * (specs/ux.md §10). La de semana es la de por defecto y la que abre la
 * aplicación.
 *
 * Sobre las tres se navega igual: el encabezado dice de cuándo se habla —mes y
 * año incluidos—, las flechas pasan al periodo anterior o al siguiente y el
 * deslizamiento lateral hace lo mismo sin buscarlas. Lo que pasa el gesto es el
 * periodo que se esté mirando: la semana, el mes o, dentro de la hoja de día,
 * el día.
 */

import {
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, opciones, avisar,
  deslizarHorizontal, dobleToque, botonIcono,
} from '../ui.js';
import { guardar, redactarDia, redactarPeriodo, retirar } from '../sincronizacion.js';
import { REPETICIONES, nuevoId, redaccionDisponible } from '../modelo.js';
import {
  INICIALES_DIA, MESES_LARGOS, TECHO_EVENTOS_DIA,
  diasDeLaSemana, formatearFechaLarga, formatearRango, horaDe, hoy, instanciasEn, iso,
  isoConHora, lunesDe, parsearMomento, repartirPorDia, soloFecha, sumarDias,
} from '../semana.js';
import { abrirDetalleRegalo, abrirSelectorDeRegalo } from './regalos.js';
import { compartir, toque } from '../native.js';

let modo = 'semana';
let ancla = hoy();
// Dirección del último cambio de periodo, para que lo que entra lo haga por el
// lado del que se viene. Se consume al pintar.
let ultimoPaso = 0;

export function reiniciarAgenda() {
  modo = 'semana';
  ancla = hoy();
  ultimoPaso = 0;
}

/**
 * De cuándo se está hablando. Es el título de la pantalla, en la misma línea
 * que el indicador y los ajustes: donde las demás pestañas ponen su nombre.
 *
 * Es la pregunta que se hace quien llega —«¿qué semana es esta?»— y el número
 * del día suelto, sin mes ni año, no la responde. Ocupando la línea del título
 * en lugar de una propia, la agenda gana una fila entera de pantalla, que en un
 * teléfono es un día más de semana a la vista.
 */
export function tituloDeAgenda() {
  if (modo === 'semana') return formatearRango(lunesDe(ancla));
  if (modo === 'mes') return `${MESES_LARGOS[ancla.getMonth()]} de ${ancla.getFullYear()}`;
  const desde = hoy();
  return `desde ${MESES_LARGOS[desde.getMonth()]} de ${desde.getFullYear()}`;
}

export function pintarAgenda(pantalla, subcabecera, ctx) {
  const paso = (rotulo, pasos, etiqueta) => el('button', {
    type: 'button', 'aria-label': etiqueta,
    onclick: () => { mover(pasos); ctx.refrescar(); },
  }, [rotulo]);

  // Una sola fila de mandos: con qué vista se mira y por dónde se anda. El
  // rótulo del periodo no está aquí, sino arriba, ocupando la línea del título
  // de la pantalla (`tituloDeAgenda`).
  vaciar(subcabecera).append(
    el('div', { class: 'vistas' }, [
      el('div', { class: 'seg', role: 'group', 'aria-label': 'Vista de la agenda' }, [
        ...['semana', 'mes', 'lista'].map((nombre) =>
          el('button', {
            type: 'button',
            'aria-pressed': modo === nombre ? 'true' : 'false',
            onclick: () => { modo = nombre; ultimoPaso = 0; ctx.refrescar(); },
          }, [nombre[0].toUpperCase() + nombre.slice(1)]),
        ),
      ]),
      // La lista arranca siempre en hoy y llega hasta donde llegue: no hay
      // periodo anterior ni siguiente al que saltar, ni sitio al que volver.
      modo === 'lista' ? null : el('div', { class: 'paso empujar' }, [
        paso('‹', -1, 'Anterior'),
        paso('›', 1, 'Siguiente'),
      ]),
      el('div', { class: `compartir-periodo${modo === 'lista' ? ' empujar' : ''}` }, accionesDelPeriodo(ctx)),
      // Volver es tan necesario como irse: con las flechas y el deslizamiento,
      // tres gestos distraídos dejan la agenda en un mes que no le importa a
      // nadie y sin forma evidente de regresar.
      modo === 'lista' ? null : el('button', {
        class: 'boton-hoy', type: 'button',
        'aria-label': 'Volver a hoy',
        onclick: () => { toque(); ancla = hoy(); ultimoPaso = 0; ctx.refrescar(); },
      }, ['Hoy']),
    ]),
  );

  vaciar(pantalla);
  // El cuerpo se estira hasta el final de la pantalla aunque la semana no llene
  // el alto: por debajo del domingo también se desliza, que es donde el pulgar
  // encuentra sitio libre.
  pantalla.classList.add('pantalla-agenda');

  let cuerpo;
  if (modo === 'semana') cuerpo = vistaSemana(ctx);
  else if (modo === 'mes') cuerpo = vistaMes(ctx);
  else cuerpo = vistaLista(ctx);

  // El deslizamiento se cuelga del cuerpo de la vista, que se construye entero
  // en cada pintado: así no quedan escuchadores viejos sobre la pantalla.
  if (modo !== 'lista') {
    deslizarHorizontal(cuerpo, (pasos) => { toque(); mover(pasos); ctx.refrescar(); });
  }
  if (ultimoPaso) {
    cuerpo.classList.add(ultimoPaso > 0 ? 'entra-derecha' : 'entra-izquierda');
    ultimoPaso = 0;
  }
  pantalla.append(cuerpo);
}

/**
 * Los días que abarca lo que se está mirando, para compartirlo.
 *
 * La lista no es un periodo: arranca en hoy y llega a seis meses vista, y
 * mandar eso entero da un mensaje que nadie lee. Desde ahí se comparte **lo que
 * viene en siete días**, que es lo mismo que manda el plan de los domingos: así
 * no hay dos ideas distintas de «lo que viene» rondando la aplicación.
 */
function diasDelPeriodo() {
  if (modo === 'semana') return diasDeLaSemana(lunesDe(ancla));
  if (modo === 'lista') return Array.from({ length: 7 }, (_, i) => sumarDias(hoy(), i));

  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  const cuantos = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0).getDate();
  return Array.from({ length: cuantos }, (_, i) => sumarDias(primero, i));
}

/** El rótulo de lo que se comparte. No sirve `tituloDeAgenda`: en la lista dice
 *  «desde Julio de 2026», que no es el tramo que sale por el compartir. */
function tituloDeLoCompartido(dias) {
  if (modo === 'semana') return formatearRango(dias[0]);
  if (modo === 'mes') return `${MESES_LARGOS[ancla.getMonth()]} de ${ancla.getFullYear()}`;
  return `Del ${dias[0].getDate()} de ${MESES_LARGOS[dias[0].getMonth()]}`
    + ` al ${dias[6].getDate()} de ${MESES_LARGOS[dias[6].getMonth()]}`;
}

function repartoDelPeriodo(ctx, dias) {
  return repartirPorDia(instanciasEn(ctx.vista.datos, dias[0], dias[dias.length - 1]), dias);
}

/**
 * El periodo entero como texto: el rótulo y, debajo, un bloque por día con
 * algo. Los días vacíos no salen —en un mes son la mayoría— y con ellos se iría
 * en blanco media pantalla del mensaje.
 */
function textoDelPeriodo(ctx, dias, reparto) {
  const bloques = [];
  for (const dia of dias) {
    const apariciones = reparto.get(iso(dia)) || [];
    if (!apariciones.length) continue;
    const lineas = apariciones.map((aparicion) => {
      const hora = horaDe(aparicion);
      const cara = ctx.vista.caraDe(aparicion.evento);
      return [
        cara.emoji,
        hora ? `${hora} ·` : null,
        cara.titulo + (aparicion.continuacion ? ' (cont.)' : ''),
        aparicion.evento.ubicacion ? `· ${aparicion.evento.ubicacion}` : null,
      ].filter(Boolean).join(' ');
    });
    bloques.push([formatearFechaLarga(dia), ...lineas].join('\n'));
  }
  return bloques;
}

/** Los dos botones de compartir de la cabecera, con el mismo par de dibujos que
 *  la hoja de un día: lo que cambia es cuánto abarcan, no lo que hacen. */
function accionesDelPeriodo(ctx) {
  const dias = diasDelPeriodo();
  const reparto = repartoDelPeriodo(ctx, dias);
  const bloques = textoDelPeriodo(ctx, dias, reparto);
  // Un periodo sin nada no se ofrece: no habría nada que enviar.
  if (!bloques.length) return [];

  const titulo = tituloDeLoCompartido(dias);
  const talCual = () => compartirTexto(titulo, `${titulo}\n\n${bloques.join('\n\n')}`);

  const plano = botonIcono('compartir', {
    etiqueta: `Compartir ${nombreDelPeriodo()}`,
    onclick: () => { toque(); talCual(); },
  });
  if (!redaccionDisponible(ctx.vista.datos)) return [plano];

  const contado = botonIcono('compartir', {
    etiqueta: `Compartir ${nombreDelPeriodo()} contado`,
    insignia: 'destello',
    onclick: () => contarElPeriodo(dias, reparto, titulo, talCual, [plano, contado]),
  });
  return [plano, contado];
}

const nombreDelPeriodo = () => (modo === 'mes' ? 'el mes' : modo === 'lista' ? 'lo que viene' : 'la semana');

async function contarElPeriodo(dias, reparto, titulo, talCual, botones) {
  toque();
  for (const boton of botones) boton.disabled = true;

  let texto = null;
  let fallo = null;
  try {
    texto = await redactarPeriodo(iso(dias[0]), iso(dias[dias.length - 1]), dias.map((dia) => ({
      fecha: iso(dia),
      eventos: (reparto.get(iso(dia)) || []).map((aparicion) => aparicion.evento.id),
    })));
  } catch (error) {
    fallo = error;
  } finally {
    for (const boton of botones) boton.disabled = false;
  }

  if (!texto) {
    if (fallo?.datos?.intentos) console.warn('redacción fallida:', fallo.datos.intentos);
    avisar('No he podido contarlo: va la lista tal cual');
    await talCual();
    return;
  }
  await compartirTexto(titulo, texto);
}

async function compartirTexto(titulo, texto) {
  const enviado = await compartir({ titulo, texto });
  if (!enviado) avisar('No he podido compartirlo');
}

function mover(pasos) {
  ancla = modo === 'semana'
    ? sumarDias(ancla, 7 * pasos)
    : new Date(ancla.getFullYear(), ancla.getMonth() + pasos, 1);
  ultimoPaso = pasos;
}

// --------------------------------------------------------------- Semana --

function vistaSemana(ctx) {
  const dias = diasDeLaSemana(lunesDe(ancla));
  const reparto = repartirPorDia(instanciasEn(ctx.vista.datos, dias[0], dias[6]), dias);
  const marco = el('div', { class: 'semana' });
  const clavehoy = iso(hoy());

  for (const dia of dias) {
    const apariciones = reparto.get(iso(dia)) || [];
    const vacio = !apariciones.length;
    const contenido = el('div', { class: 'dia-contenido' });

    if (vacio) {
      // Los días vacíos son información y no espacio desperdiciado: enseñan la
      // forma de la semana, que es justo lo que se quiere ver al planificar.
      contenido.append(el('div', { class: 'dia-vacio', texto: '—' }));
    } else {
      for (const aparicion of apariciones.slice(0, TECHO_EVENTOS_DIA)) {
        contenido.append(lineaDeEvento(aparicion, ctx));
      }
      // El recuento se calcula sobre lo visible para quien mira. Un enlace que
      // anunciara dos eventos más y mostrase uno al abrirlo revelaría justo lo
      // que se pretendía ocultar (specs/ux.md §10.2).
      const restantes = apariciones.length - TECHO_EVENTOS_DIA;
      if (restantes > 0) {
        contenido.append(el('button', {
          class: 'desbordamiento', type: 'button',
          onclick: () => abrirDia(dia, ctx),
        }, [`y ${restantes} más`]));
      }
    }

    const fila = el('div', { class: 'dia', 'data-hoy': iso(dia) === clavehoy ? 'si' : 'no' }, [
      el('button', {
        class: 'dia-fecha', type: 'button',
        'aria-label': vacio
          ? `Crear un evento el ${formatearFechaLarga(dia)}`
          : `Ver el ${formatearFechaLarga(dia)}`,
        // En un día vacío no hay día que abrir: la hoja no tendría más que el
        // botón de añadir, que es justo lo que hace el doble toque de la fila.
        onclick: vacio ? null : () => abrirDia(dia, ctx),
      }, [
        el('div', { class: 'dia-inicial', texto: INICIALES_DIA[(dia.getDay() + 6) % 7] }),
        el('div', { class: 'dia-numero', texto: String(dia.getDate()) }),
      ]),
      contenido,
    ]);

    // El hueco de un día vacío es el sitio natural para llenarlo: un doble
    // toque en cualquier punto de la fila abre el formulario con ese día ya
    // puesto. Se pide doble y no sencillo porque la fila entera está a un dedo
    // de distancia mientras se recorre la semana, y un toque suelto no puede
    // significar «crear».
    if (vacio) {
      dobleToque(fila, () => { toque(); abrirFormularioEvento(ctx, { fecha: dia }); });
    }
    marco.append(fila);
  }
  return marco;
}

function lineaDeEvento(aparicion, ctx) {
  const hora = horaDe(aparicion);
  const cara = ctx.vista.caraDe(aparicion.evento);
  return el('button', {
    class: 'linea', type: 'button',
    'data-continuacion': aparicion.continuacion ? 'si' : 'no',
    onclick: () => abrirDetalleEvento(aparicion.evento.id, ctx, aparicion),
  }, [
    // Un evento de varios días se marca con una banda continua en el margen.
    aparicion.instancia.inicio.getTime() !== aparicion.instancia.fin.getTime()
      ? el('span', { class: 'linea-banda' }) : null,
    el('span', { class: 'linea-emoji', texto: cara.emoji }),
    el('span', { class: 'linea-titulo', texto: cara.titulo + (aparicion.continuacion ? ' (cont.)' : '') }),
    hora ? el('span', { class: 'linea-hora', texto: hora }) : null,
  ]);
}

// ------------------------------------------------------------------ Mes --

function vistaMes(ctx) {
  const primero = new Date(ancla.getFullYear(), ancla.getMonth(), 1);
  const arranque = lunesDe(primero);
  const celdas = Array.from({ length: 42 }, (_, i) => sumarDias(arranque, i));
  const reparto = repartirPorDia(instanciasEn(ctx.vista.datos, celdas[0], celdas[41]), celdas);
  const clavehoy = iso(hoy());
  const seleccionado = iso(ancla);

  const rejilla = el('div', { class: 'mes' });
  for (const inicial of INICIALES_DIA) rejilla.append(el('div', { class: 'mes-cabecera', texto: inicial }));

  for (const dia of celdas) {
    const tiene = (reparto.get(iso(dia)) || []).length > 0;
    rejilla.append(el('button', {
      class: 'mes-celda', type: 'button',
      'data-fuera': dia.getMonth() === ancla.getMonth() ? 'no' : 'si',
      'data-hoy': iso(dia) === clavehoy ? 'si' : 'no',
      'aria-pressed': iso(dia) === seleccionado ? 'true' : 'false',
      onclick: () => { ancla = dia; ctx.refrescar(); },
    }, [
      String(dia.getDate()),
      tiene ? el('span', { class: 'mes-punto' }) : null,
    ]));
  }

  const detalle = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: formatearFechaLarga(ancla) }),
  ]);
  const delDia = reparto.get(iso(ancla)) || [];
  if (!delDia.length) detalle.append(el('p', { class: 'vacio', texto: 'Nada este día.' }));
  for (const aparicion of delDia) detalle.append(tarjetaDeEvento(aparicion, ctx));

  // El día del mes que no tiene nada se llena igual que la fila vacía de la
  // semana: doblando el toque sobre su hueco.
  if (!delDia.length) dobleToque(detalle, () => { toque(); abrirFormularioEvento(ctx, { fecha: ancla }); });

  return el('div', { class: 'cuerpo-agenda' }, [
    rejilla,
    detalle,
    zonaLibre(ctx, () => ancla),
  ]);
}

/**
 * El blanco que queda por debajo del contenido, que también sirve para crear.
 *
 * En la semana el hueco de un día vacío es un sitio evidente donde doblar el
 * toque; en el mes y en la lista no hay filas, y lo único despejado es lo que
 * sobra al final. Se le da el mismo gesto para que la regla sea una sola:
 * doblar el toque sobre lo que está en blanco crea un evento ahí.
 *
 * Qué día es «ahí» lo dice quien llama, y en el momento del toque: en el mes,
 * el que esté seleccionado; en la lista, que siempre arranca en hoy, hoy.
 */
function zonaLibre(ctx, diaDe) {
  return dobleToque(
    el('div', { class: 'zona-libre', 'aria-hidden': 'true' }),
    () => { toque(); abrirFormularioEvento(ctx, { fecha: diaDe() }); },
  );
}

// ---------------------------------------------------------------- Lista --

function vistaLista(ctx) {
  const desde = hoy();
  const hasta = sumarDias(desde, 180);
  const instancias = instanciasEn(ctx.vista.datos, desde, hasta).sort((a, b) => a.inicio - b.inicio);

  const contenedor = el('div', { class: 'cuerpo-agenda' });

  if (!instancias.length) {
    contenedor.append(el('p', { class: 'vacio', texto: 'No hay nada en los próximos seis meses.' }));
    contenedor.append(zonaLibre(ctx, hoy));
    return contenedor;
  }

  let grupoActual = null;
  let nodo = null;

  for (const instancia of instancias) {
    const grupo = nombreDeGrupo(instancia.inicio, desde);
    if (grupo !== grupoActual) {
      grupoActual = grupo;
      nodo = el('div', { class: 'grupo' }, [el('p', { class: 'grupo-titulo', texto: grupo })]);
      contenedor.append(nodo);
    }
    nodo.append(tarjetaDeEvento({ instancia, evento: instancia.evento, dia: soloFecha(instancia.inicio), continuacion: false }, ctx));
  }
  contenedor.append(zonaLibre(ctx, hoy));
  return contenedor;
}

function nombreDeGrupo(momento, referencia) {
  const dias = Math.round((soloFecha(momento) - referencia) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  if (dias < 7) return 'Esta semana';
  if (dias < 14) return 'La semana que viene';
  if (dias < 32) return 'Este mes';
  return `${MESES_LARGOS[momento.getMonth()]} de ${momento.getFullYear()}`;
}

function tarjetaDeEvento(aparicion, ctx) {
  const hora = horaDe(aparicion);
  const cara = ctx.vista.caraDe(aparicion.evento);
  const participantes = ctx.vista.participantes(aparicion.evento).map((id) => ctx.vista.nombre(id));
  return el('button', {
    class: 'tarjeta', type: 'button',
    onclick: () => abrirDetalleEvento(aparicion.evento.id, ctx, aparicion),
  }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('span', { class: 'linea-emoji', texto: cara.emoji }),
      el('h3', { texto: cara.titulo }),
      hora ? el('span', { class: 'linea-hora empujar', texto: hora }) : null,
    ]),
    el('p', {
      texto: [
        formatearFechaLarga(aparicion.dia),
        aparicion.evento.ubicacion,
        participantes.length ? participantes.join(', ') : null,
      ].filter(Boolean).join(' · '),
    }),
  ]);
}

// ------------------------------------------------------------ Vista de día --

export function abrirDia(fecha, ctx) {
  const reparto = repartirPorDia(instanciasEn(ctx.vista.datos, fecha, fecha), [fecha]);
  const apariciones = reparto.get(iso(fecha)) || [];

  const contenido = abrirHoja(formatearFechaLarga(fecha), (cuerpo) => {
    if (!apariciones.length) cuerpo.append(el('p', { class: 'vacio', texto: 'Nada este día.' }));
    for (const aparicion of apariciones) cuerpo.append(tarjetaDeEvento(aparicion, ctx));
    cuerpo.append(el('button', {
      class: 'boton', type: 'button',
      onclick: () => abrirFormularioEvento(ctx, { fecha }),
    }, ['Añadir un evento este día']));
  }, accionesDelDia(fecha, apariciones, ctx));

  // El mismo gesto que en la semana y en el mes, un piso más abajo: aquí lo que
  // pasa es el día. Se cuelga del cuerpo, que la hoja rehace en cada apertura.
  deslizarHorizontal(contenido, (pasos) => { toque(); abrirDia(sumarDias(fecha, pasos), ctx); });
}

/**
 * Los dos botones de la cabecera del día: compartir la lista y compartirla
 * contada.
 *
 * Un día se comparte tal cual se ve: lo que hay en la hoja es ya lo visible
 * para quien mira, de modo que no puede salir por ahí un evento reservado. En
 * un día vacío no se ofrece ninguno de los dos, porque no habría nada que
 * enviar.
 *
 * El segundo es el mismo icono con un destello encima: dice «esto es
 * compartir, con algo añadido» sin obligar a aprender un dibujo nuevo. Solo
 * aparece si el servidor tiene clave; si no, sobraría un botón que únicamente
 * sabría fallar.
 */
function accionesDelDia(fecha, apariciones, ctx) {
  if (!apariciones.length) return [];

  const compartirTalCual = botonIcono('compartir', {
    etiqueta: 'Compartir el día',
    onclick: () => compartirDia(fecha, apariciones, ctx),
  });
  if (!redaccionDisponible(ctx.vista.datos)) return [compartirTalCual];

  const contado = botonIcono('compartir', {
    etiqueta: 'Compartir contado',
    insignia: 'destello',
    onclick: () => contarElDia(fecha, apariciones, ctx, [compartirTalCual, contado]),
  });
  return [compartirTalCual, contado];
}

/**
 * Compartir el día redactado por un modelo.
 *
 * No se ofrece revisar el texto antes: el botón es «compartir contado», no un
 * editor, y una hoja intermedia convertiría un gesto en un trámite. Si algo
 * falla —sin red, sin clave, el modelo caído— se comparte la lista tal cual y
 * se dice por qué: quedarse sin compartir sería el peor de los desenlaces.
 */
async function contarElDia(fecha, apariciones, ctx, botones) {
  toque();
  for (const boton of botones) boton.disabled = true;

  let texto = null;
  let fallo = null;
  try {
    texto = await redactarDia(iso(fecha), apariciones.map((aparicion) => aparicion.evento.id));
  } catch (error) {
    fallo = error;
  } finally {
    for (const boton of botones) boton.disabled = false;
  }

  if (!texto) {
    // La traza de los intentos solo llega si quien mira puede arreglarlo; en la
    // consola sirve para depurar sin tener que reproducirlo a ciegas.
    if (fallo?.datos?.intentos) console.warn('redacción fallida:', fallo.datos.intentos);
    avisar('No he podido contarlo: va la lista tal cual');
    await compartirDia(fecha, apariciones, ctx);
    return;
  }

  await compartirTexto(formatearFechaLarga(fecha), texto);
}

/**
 * El día entero como texto: la fecha y debajo una línea por evento, con su hora
 * y su sitio. La misma cara pública que se comparte de un evento suelto, sin
 * una palabra de la dimensión de regalos.
 */
async function compartirDia(fecha, apariciones, ctx) {
  toque();
  const titulo = formatearFechaLarga(fecha);
  const lineas = apariciones.map((aparicion) => {
    const hora = horaDe(aparicion);
    const cara = ctx.vista.caraDe(aparicion.evento);
    return [
      cara.emoji,
      hora ? `${hora} ·` : null,
      cara.titulo + (aparicion.continuacion ? ' (cont.)' : ''),
      aparicion.evento.ubicacion ? `· ${aparicion.evento.ubicacion}` : null,
    ].filter(Boolean).join(' ');
  });

  await compartirTexto(titulo, `${titulo}\n${lineas.join('\n')}`);
}

// -------------------------------------------------------- Detalle de evento --

export function abrirDetalleEvento(eventoId, ctx, aparicion = null) {
  const evento = ctx.vista.evento(eventoId) || aparicion?.evento;
  if (!evento) return;

  const derivado = evento.origen !== 'manual';
  const inicio = parsearMomento(evento.inicio);
  const cara = ctx.vista.caraDe(evento);

  // Compartir usa la hoja nativa dentro de la cáscara de iOS y cae a
  // `navigator.share` —o al portapapeles— en el navegador. Solo sale la cara
  // pública del evento: ni una palabra de la dimensión de regalos.
  const compartirEvento = async () => {
    toque();
    const enviado = await compartir({
      titulo: cara.titulo,
      texto: `${cara.emoji} ${cara.titulo}\n${formatearFechaLarga(aparicion ? aparicion.dia : inicio)}`
        + (evento.jornada_completa ? '' : ` · ${horaDe(aparicion || { evento, instancia: { inicio }, continuacion: false })}`)
        + (evento.ubicacion ? `\n${evento.ubicacion}` : ''),
    });
    if (!enviado) avisar('No he podido compartirlo');
  };

  abrirHoja(cara.titulo, (cuerpo) => {
    cuerpo.append(el('div', { class: 'tarjeta-fila' }, [
      el('span', { style: 'font-size:26px', texto: cara.emoji }),
      el('div', {}, [
        el('p', { texto: formatearFechaLarga(aparicion ? aparicion.dia : inicio) }),
        el('p', {
          class: 'pista',
          texto: [
            evento.jornada_completa ? 'Todo el día' : horaDe(aparicion || { evento, instancia: { inicio }, continuacion: false }),
            ctx.vista.tipoEvento(evento.tipo_id)?.nombre,
            evento.ubicacion,
          ].filter(Boolean).join(' · '),
        }),
      ]),
    ]));

    const gente = ctx.vista.participantes(evento);
    if (gente.length) {
      cuerpo.append(el('div', { class: 'grupo' }, [
        el('p', { class: 'grupo-titulo', texto: 'Quién va' }),
        el('div', { class: 'opciones' }, gente.map((id) => {
          const persona = ctx.vista.persona(id);
          return persona ? el('span', { class: 'etiqueta' }, [persona.nombre]) : null;
        })),
      ]));
    }

    if (evento.notas) cuerpo.append(el('p', { texto: evento.notas }));

    // A quien puede verlo conviene recordarle que el resto no. La marca no
    // aparece en la fila de la semana: allí cada evento ocupa una sola línea.
    if (evento.categoria_id && ctx.vista.categoria(evento.categoria_id)?.regla !== 'publica') {
      cuerpo.append(el('p', { class: 'pista', 'data-tono': 'aviso' }, [
        'Reservado: este evento no existe en la agenda de quien no tiene acceso.',
      ]));
    }

    if (derivado) {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: evento.origen === 'derivado'
          ? 'Este cumpleaños sale de la ficha de la persona. Para corregirlo, cambia allí su fecha de nacimiento.'
          : 'Este evento llega de un calendario externo y se corrige en su origen.',
      }));
    }

    cuerpo.append(bloqueDeRegalos(evento, ctx));
    cuerpo.append(bloqueDeComentarios('evento', evento.id, ctx));

    // Borrar no vive aquí: es una operación de edición, y está donde se edita.
  }, [
    // Los dos verbos que se usan van arriba, junto al título. Un cumpleaños o
    // un evento traído de fuera no se edita: se corrige en su origen.
    derivado ? null : botonIcono('editar', {
      etiqueta: 'Editar',
      onclick: () => abrirFormularioEvento(ctx, { id: evento.id }),
    }),
    botonIcono('compartir', { etiqueta: 'Compartir', tono: 'discreto', onclick: compartirEvento }),
  ]);
}

/**
 * El bloque de regalos no es contenido único: se compone para cada observador.
 * Sobre el evento propio se muestra el aviso, **siempre** y con independencia de
 * que haya o no contenido: si apareciera solo cuando hay regalos, su ausencia a
 * mediados de diciembre resultaría tan informativa como su presencia.
 */
function bloqueDeRegalos(evento, ctx) {
  if (!ctx.vista.llevaRegalos(evento)) return el('div', { hidden: true });

  if (ctx.vista.esMio(evento)) {
    return el('div', { class: 'sello' }, [
      el('strong', { texto: 'Por aquí no se mira' }),
      el('span', { texto: 'Vuelve otro día.' }),
    ]);
  }

  const ocasion = ctx.vista.ocasionDeEvento(evento.id);
  const regalos = ocasion ? ctx.vista.regalosDe(ocasion.id) : [];

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Regalos' }),
    ...regalos.map((regalo) => tarjetaDeRegalo(regalo, ctx)),
    regalos.length ? null : el('p', { class: 'pista', texto: 'Todavía no hay ninguno.' }),
    el('button', {
      class: 'boton', 'data-tono': 'discreto', type: 'button',
      onclick: () => abrirSelectorDeRegalo(ctx, { evento }),
    }, ['Asociar un regalo']),
  ]);
}

function tarjetaDeRegalo(regalo, ctx) {
  const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
  return el('button', {
    class: 'tarjeta', type: 'button',
    onclick: () => abrirDetalleRegalo(regalo.id, ctx),
  }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: idea?.titulo || 'Regalo' }),
      el('span', { class: 'etiqueta empujar', 'data-tono': 'regalo', texto: regalo.estado }),
    ]),
    el('p', {
      texto: `Para ${ctx.vista.nombre(regalo.destinatario_principal_id)}` +
        (regalo.responsable_id ? ` · lo lleva ${ctx.vista.nombre(regalo.responsable_id)}` : ' · sin responsable'),
    }),
  ]);
}

// -------------------------------------------------------------- Comentarios --

export function bloqueDeComentarios(tipo, id, ctx) {
  const comentarios = ctx.vista.comentariosDe(tipo, id);
  const lista = el('div', { class: 'lista' }, comentarios.map((comentario) =>
    el('div', { class: 'comentario' }, [
      el('p', { class: 'comentario-meta', texto: `${ctx.vista.nombre(comentario.autor_id)} · ${(comentario.creado_en || '').slice(0, 10)}` }),
      el('p', { texto: comentario.texto }),
    ]),
  ));

  const control = entrada({ placeholder: 'Escribe un comentario', 'aria-label': 'Nuevo comentario' });
  const enviar = async () => {
    const texto = control.value.trim();
    if (!texto) return;
    control.value = '';
    await guardar('comentario', nuevoId(), {
      objeto_tipo: tipo, objeto_id: id, autor_id: ctx.vista.yo.id, texto, activo: 1,
    });
    ctx.refrescar();
    avisar('Comentario añadido');
  };
  control.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') enviar(); });

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: `Comentarios (${comentarios.length})` }),
    lista,
    el('div', { class: 'acciones' }, [
      el('div', { class: 'campo crecer' }, [control]),
      el('button', { class: 'boton', type: 'button', onclick: enviar }, ['Enviar']),
    ]),
  ]);
}

// --------------------------------------------------------- Crear y editar --

/**
 * La creación tiene dos niveles. La hoja rápida pide título y día, y con eso
 * guarda; el resto de campos aparece solo si se piden (specs/ux.md §10.1).
 *
 * No hay campo de emoji: lo propone el tipo, y quien quiera otro empieza el
 * título por él. Una rejilla de emojis dentro del formulario era un paso más
 * para decir lo mismo que ya se puede escribir en el título.
 */
export function abrirFormularioEvento(ctx, { id = null, fecha = null } = {}) {
  const existente = id ? ctx.vista.evento(id) : null;
  const inicio = existente ? parsearMomento(existente.inicio) : (fecha || hoy());

  const borrador = {
    titulo: existente?.titulo || '',
    dia: iso(inicio),
    hora: existente && !existente.jornada_completa ? `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}` : '',
    tipo_id: existente?.tipo_id || 'otro',
    ubicacion: existente?.ubicacion || '',
    notas: existente?.notas || '',
    repeticion: existente?.repeticion || 'ninguna',
    protagonistas: existente ? ctx.vista.protagonistas(existente) : [],
    asistentes: existente
      ? ctx.vista.participantes(existente).filter((p) => !ctx.vista.protagonistas(existente).includes(p))
      : [],
    reservado: Boolean(existente?.categoria_id),
    categoria_id: existente?.categoria_id || null,
    lleva_regalos: existente?.lleva_regalos ?? null,
  };

  // Borrar solo existe sobre un evento que ya existe, y aquí, que es la
  // pantalla donde se cambian sus datos. En el detalle no pinta nada: allí se
  // mira, y un botón de borrar entre lo que se mira solo puede ir a peor.
  const borrarEvento = existente ? botonIcono('borrar', {
    etiqueta: 'Borrar el evento', tono: 'peligro',
    onclick: async () => {
      await retirar('evento', existente.id);
      toque('media');
      cerrarHoja();
      avisar('Evento retirado');
      ctx.refrescar();
    },
  }) : null;

  abrirHoja(existente ? 'Editar evento' : 'Nuevo evento', (cuerpo) => {
    const titulo = entrada({ value: borrador.titulo, placeholder: 'Comida con los abuelos', autofocus: true });
    const dia = el('input', { type: 'date', value: borrador.dia });
    cuerpo.append(campo('Qué', titulo), campo('Cuándo', dia));

    const avanzado = el('div', { class: 'hoja-seccion', hidden: !existente });
    const conmutador = el('button', {
      class: 'enlace-discreto', type: 'button',
      onclick: () => { avanzado.hidden = !avanzado.hidden; conmutador.textContent = avanzado.hidden ? 'Más opciones' : 'Menos opciones'; },
    }, [existente ? 'Menos opciones' : 'Más opciones']);
    if (!existente) cuerpo.append(conmutador);
    cuerpo.append(avanzado);

    const hora = el('input', { type: 'time', value: borrador.hora });
    // El tipo va después de la fecha: quien crea un evento tiene en la cabeza el
    // qué y el cuándo, no la taxonomía (specs/ux.md §10.1).
    const tipo = seleccion(ctx.vista.tiposEvento().map((t) => ({ valor: t.id, texto: `${t.emoji}  ${t.nombre}` })), borrador.tipo_id);
    const lugar = entrada({ value: borrador.ubicacion, placeholder: 'Casa de los abuelos' });
    const notas = el('textarea', { placeholder: 'Lo que convenga recordar' });
    notas.value = borrador.notas;
    const repite = seleccion(REPETICIONES.map((r) => ({ valor: r.valor, texto: r.texto })), borrador.repeticion);

    const gente = ctx.vista.personas().map((p) => ({ valor: p.id, texto: p.nombre }));

    avanzado.append(
      campo('A qué hora', hora, 'Déjala vacía si dura todo el día.'),
      campo('Qué es', tipo, 'El tipo elige el emoji y propone si el evento lleva regalos. Para otro emoji, empieza el título con él.'),
      campo('De quién es', opciones(gente, borrador.protagonistas, (v) => { borrador.protagonistas = v; }),
        'Determina a quién se le ocultan los regalos de este evento y qué ideas se proponen al asociarlos.'),
      campo('Quién más va', opciones(gente, borrador.asistentes, (v) => { borrador.asistentes = v; }),
        'Solo informativo.'),
      campo('Dónde', lugar),
      campo('Se repite', repite),
      campo('Notas', notas),
    );

    // La reserva se expresa como acción, no como categoría.
    const reservaPista = el('p', { class: 'pista', 'data-tono': 'aviso', hidden: !borrador.reservado });
    reservaPista.textContent = 'El evento desaparece por completo de la agenda de quien no sea administrador: sin hueco, sin marcador y sin llegar a su dispositivo.';
    const privadas = ctx.vista.categorias().filter((c) => c.regla !== 'publica');
    if (privadas.length) {
      avanzado.append(campo('Reserva', el('div', { class: 'opciones' }, [
        el('button', {
          class: 'opcion', type: 'button',
          'aria-pressed': borrador.reservado ? 'true' : 'false',
          onclick: (evento) => {
            borrador.reservado = !borrador.reservado;
            borrador.categoria_id = borrador.reservado ? privadas[0].id : null;
            evento.currentTarget.setAttribute('aria-pressed', borrador.reservado ? 'true' : 'false');
            reservaPista.hidden = !borrador.reservado;
          },
        }, ['Ocultarlo a alguien']),
      ]), null), reservaPista);
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!titulo.value.trim()) { avisar('Ponle un título'); titulo.focus(); return; }
          const jornadaCompleta = !hora.value;
          const momento = parsearMomento(jornadaCompleta ? dia.value : `${dia.value}T${hora.value}:00`);
          const campos = {
            titulo: titulo.value.trim(),
            tipo_id: tipo.value,
            inicio: jornadaCompleta ? dia.value : isoConHora(momento),
            jornada_completa: jornadaCompleta ? 1 : 0,
            ubicacion: lugar.value.trim(),
            notas: notas.value.trim(),
            repeticion: repite.value,
            categoria_id: borrador.reservado ? borrador.categoria_id : null,
            origen: 'manual',
            autor_id: ctx.vista.yo.id,
            activo: 1,
            participantes: [
              ...borrador.protagonistas.map((persona_id) => ({ persona_id, rol: 'protagonista' })),
              ...borrador.asistentes
                .filter((persona_id) => !borrador.protagonistas.includes(persona_id))
                .map((persona_id) => ({ persona_id, rol: 'asistente' })),
            ],
          };
          await guardar('evento', existente ? existente.id : nuevoId(), campos);
          toque('media');
          cerrarHoja();
          avisar(existente ? 'Evento actualizado' : 'Evento creado');
          ctx.refrescar();
        },
      }, [existente ? 'Guardar' : 'Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  }, [borrarEvento]);
}

export const anclaActual = () => ancla;
