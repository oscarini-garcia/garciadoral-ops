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
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, avisar, icono,
  deslizarHorizontal, dobleToque, botonIcono,
} from '../ui.js';
import { guardar, redactarDia, redactarPeriodo, retirar } from '../sincronizacion.js';
import { REPETICIONES, nuevoId, redaccionDisponible } from '../modelo.js';
import {
  INICIALES_DIA, MESES_LARGOS, TECHO_EVENTOS_DIA,
  diasDeLaSemana, formatearFechaLarga, formatearRango, horaDe, hoy, instanciasEn, iso,
  isoConHora, lunesDe, parsearMomento, repartirPorDia, soloFecha, sumarDias,
} from '../semana.js';
import { abrirCumple, abrirDetalleRegalo, abrirSelectorDeRegalo, ocasionDeEvento } from './regalos.js';
import { bloqueDeComentarios } from '../comentarios.js';
import { campoDeGente, recordarElegidos } from '../gente.js';
import { compartir, toque } from '../native.js';
import {
  TURNOS, desmarcar, genteDeCasa, hayLio, inicialesDe, marcarHecho, pedirCambio,
  reclamarTurno, resolverPropuesta, retirarPropuesta, turnoDe, turnosDe,
} from '../lio.js';

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
  if (modo === 'semana') {
    const lunes = lunesDe(ancla);
    return mesesDe(lunes, sumarDias(lunes, 6));
  }
  if (modo === 'mes') return `${MESES_LARGOS[ancla.getMonth()]} de ${ancla.getFullYear()}`;
  const desde = hoy();
  return `desde ${MESES_LARGOS[desde.getMonth()]} de ${desde.getFullYear()}`;
}

/**
 * El mes y el año de un tramo, sin los días.
 *
 * En la semana el rótulo decía «20 – 26 de Julio de 2026», y los dos números
 * sobraban: están escritos, grandes, en la columna de la izquierda. Lo único
 * que el rótulo tiene que añadir es en qué mes y en qué año caen esos días.
 * Quitarlos deja además sitio para escribirlo del tamaño de las demás pestañas.
 *
 * Los dos meses solo se nombran cuando la semana los cruza, y el año dos veces
 * solo cuando cruza el año —una vez al año, y esa se parte en dos líneas—.
 */
function mesesDe(desde, hasta) {
  const mes = (fecha) => MESES_LARGOS[fecha.getMonth()];
  if (desde.getFullYear() !== hasta.getFullYear()) {
    return `${mes(desde)} de ${desde.getFullYear()} – ${mes(hasta)} de ${hasta.getFullYear()}`;
  }
  if (desde.getMonth() !== hasta.getMonth()) return `${mes(desde)} – ${mes(hasta)} de ${hasta.getFullYear()}`;
  return `${mes(hasta)} de ${hasta.getFullYear()}`;
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
    bloques.push([formatearFechaLarga(dia), ...textoDelDia(apariciones, ctx)].join('\n'));
  }
  return bloques;
}

/** El botón de compartir de la cabecera de la agenda. Lo que cambia respecto al
 *  de un día es cuánto abarca, no lo que hace. */
function accionesDelPeriodo(ctx) {
  const dias = diasDelPeriodo();
  const reparto = repartoDelPeriodo(ctx, dias);
  const bloques = textoDelPeriodo(ctx, dias, reparto);
  // Un periodo sin nada no se ofrece: no habría nada que enviar.
  if (!bloques.length) return [];

  const titulo = tituloDeLoCompartido(dias);
  return [botonDeCompartir(ctx, {
    etiqueta: `Compartir ${nombreDelPeriodo()}`,
    titulo,
    pista: 'Un renglón por evento, con su hora',
    texto: () => `${titulo}\n\n${bloques.join('\n\n')}`,
    redactar: () => redactarPeriodo(iso(dias[0]), iso(dias[dias.length - 1]), dias.map((dia) => ({
      fecha: iso(dia),
      eventos: (reparto.get(iso(dia)) || []).map((aparicion) => aparicion.evento.id),
    }))),
  })];
}

const nombreDelPeriodo = () => (modo === 'mes' ? 'el mes' : modo === 'lista' ? 'lo que viene' : 'la semana');

// ------------------------------------------------------------- Compartir --

/**
 * Un solo botón de compartir, y la manera se elige en una hoja.
 *
 * Antes eran dos botones lado a lado, el segundo con un destello encima. Era un
 * toque menos, pero pedía adivinar qué añadía ese destello, y el sitio de dos
 * botones no lo hay en todas las cabeceras. Con una hoja, cada manera se explica
 * con su frase —que es más de lo que puede decir un dibujo— y queda hueco para
 * una tercera el día que haga falta.
 *
 * Sin clave puesta no hay nada que elegir, y entonces el botón hace directamente
 * lo único que sabe: compartir tal cual, en un toque.
 *
 * Es el mismo botón en los tres sitios donde se comparte —el evento, el día y el
 * periodo—, y lo único que cambia entre ellos es qué texto se compone y a qué
 * llama para que lo cuenten.
 */
function botonDeCompartir(ctx, opciones) {
  return botonIcono('compartir', {
    etiqueta: opciones.etiqueta,
    tono: opciones.tono || null,
    onclick: () => {
      toque();
      if (!redaccionDisponible(ctx.vista.datos)) { compartirTexto(opciones.titulo, opciones.texto()); return; }
      abrirEleccionDeCompartir(opciones);
    },
  });
}

/**
 * La hoja con las dos maneras.
 *
 * Abrirla cierra la que hubiera debajo —la del día, la del evento—, porque la
 * aplicación enseña una hoja cada vez. No se recupera después: quien comparte
 * un día ya ha terminado con él, y volver a abrirlo detrás del panel del
 * sistema sería un sobresalto sin motivo.
 */
function abrirEleccionDeCompartir({ etiqueta, titulo, pista, texto, redactar }) {
  abrirHoja(etiqueta, (cuerpo) => {
    const talCual = eleccionDeCompartir('Tal cual', pista, null, async () => {
      cerrarHoja();
      await compartirTexto(titulo, texto());
    });

    const contado = eleccionDeCompartir('Contado en dos frases', 'Lo escribe un modelo con lo que hay', 'destello', async () => {
      // Se queda abierta mientras piensa, y lo dice: son un par de segundos, y
      // una hoja que se cierra sin nada detrás parecería que no ha hecho nada.
      talCual.disabled = true;
      contado.disabled = true;
      contado.querySelector('.eleccion-nombre').textContent = 'Escribiéndolo…';

      let redactado = null;
      let fallo = null;
      try {
        redactado = await redactar();
      } catch (error) {
        fallo = error;
      }

      cerrarHoja();
      if (redactado) { await compartirTexto(titulo, redactado); return; }

      // La traza de los intentos solo llega si quien mira puede arreglarlo; en
      // la consola sirve para depurar sin reproducirlo a ciegas.
      if (fallo?.datos?.intentos) console.warn('redacción fallida:', fallo.datos.intentos);
      avisar('No he podido contarlo: va tal cual');
      await compartirTexto(titulo, texto());
    });

    cuerpo.append(talCual, contado);
  });
}

function eleccionDeCompartir(nombre, pista, insignia, accion) {
  return el('button', { class: 'eleccion', type: 'button', onclick: accion }, [
    el('span', { class: 'icono-accion', 'aria-hidden': 'true' }, [
      icono('compartir'),
      insignia ? el('span', { class: 'icono-insignia' }, [icono(insignia)]) : null,
    ]),
    el('span', { class: 'eleccion-texto' }, [
      el('span', { class: 'eleccion-nombre', texto: nombre }),
      el('span', { class: 'eleccion-pista', texto: pista }),
    ]),
  ]);
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
  const conLio = hayLio(ctx.vista.datos);
  const marco = el('div', { class: 'semana', 'data-lio': conLio ? 'si' : 'no' });
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

    // Un día con una sola cosa abre esa cosa, no la lista de una cosa: la hoja
    // del día sería un rodeo con un único destino a la vista. Con dos o más sí
    // hay algo que elegir, y entonces se abre el día entero.
    const unico = apariciones.length === 1 ? apariciones[0] : null;

    const fila = el('div', { class: 'dia', 'data-hoy': iso(dia) === clavehoy ? 'si' : 'no' }, [
      el('button', {
        class: 'dia-fecha', type: 'button',
        // El botón dibuja un día, así que su etiqueta empieza por el día: si
        // solo lleva a un evento, lo dice detrás. «Ver» delante del título
        // tartamudearía con cualquiera que empiece por un verbo.
        'aria-label': vacio
          ? `Crear un evento el ${formatearFechaLarga(dia)}`
          : unico
            ? `${formatearFechaLarga(dia)}: ${ctx.vista.caraDe(unico.evento).titulo}`
            : `Ver el ${formatearFechaLarga(dia)}`,
        // En un día vacío no hay día que abrir: la hoja no tendría más que el
        // botón de añadir, que es justo lo que hace el doble toque de la fila.
        onclick: vacio
          ? null
          : () => (unico ? abrirDetalleEvento(unico.evento.id, ctx, unico) : abrirDia(dia, ctx)),
      }, [
        el('div', { class: 'dia-inicial', texto: INICIALES_DIA[(dia.getDay() + 6) % 7] }),
        el('div', { class: 'dia-numero', texto: String(dia.getDate()) }),
      ]),
      columnaDeLio(dia, ctx),
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

  // Lio va dentro de la fila, como una columna más entre el día y los eventos,
  // y no como una banda aparte encima de la rejilla: así el jueves se lee
  // entero de un renglón —qué día es, quién saca al perro, qué hay— y la parte
  // de arriba de la pantalla, que es la única que se ve sin desplazar, se queda
  // para la semana (specs/ux.md §10.3).
  const cabecera = cabeceraDeLio(ctx);
  return cabecera ? el('div', { class: 'agenda-semana' }, [cabecera, marco]) : marco;
}

// ----------------------------------------------------------------- Lio --

/**
 * La semana de Lio en dos renglones: siete columnas, mañana arriba y noche
 * abajo, con las dos primeras letras de quien tiene cada turno.
 *
 * Solo en la vista de semana. En el mes no hay siete columnas donde ponerlo y
 * en la lista no hay semana; allí Lio no se enseña, que es preferible a
 * inventarle un segundo dibujo que diría lo mismo de otra manera.
 *
 * No aparece mientras nadie haya puesto el cuadro en Ajustes, ni para quien no
 * vive en casa: a esa persona el servidor ni siquiera le manda los paseos.
 */
function cabeceraDeLio(ctx) {
  if (!hayLio(ctx.vista.datos)) return null;
  // Los tres rótulos nombran las tres columnas, y con la raya debajo la semana
  // se lee como la tabla que es. La huella va pegada a «Lio» y no suelta: sola
  // no diría de qué columna habla, y menos una semana sin turnos puestos, que
  // es cuando la columna del medio está vacía y hay que explicarla.
  return el('div', { class: 'semana-cabecera' }, [
    el('span', { texto: 'Día' }),
    el('span', { texto: '🐾 Lio' }),
    el('span', { texto: 'Evento' }),
  ]);
}

/**
 * La columna de Lio de un día: el sol y la luna con quien tiene cada turno.
 *
 * **Es un solo botón y no dos.** Cada pastilla mide unos 40 × 18 puntos, la
 * mitad de lo que pide un blanco cómodo, así que tocar un turno concreto sería
 * apuntar. La columna entera sí es un blanco holgado, y abre el día de Lio con
 * los dos turnos y sus verbos: marcar cuesta un toque más, pero no se falla
 * nunca. Y el gesto de marcar de verdad vive en Hoy; a la agenda se viene a
 * mirar (specs/propuesta-lio-en-la-fila.html).
 */
function columnaDeLio(dia, ctx) {
  if (!hayLio(ctx.vista.datos)) return null;

  const turnos = turnosDe(ctx.vista.datos, dia);
  const columna = el('button', {
    class: 'lio-col', type: 'button',
    'aria-label': `Lio el ${formatearFechaLarga(dia)}: `
      + turnos.map((t) => `${t.turno.nombre.toLowerCase()}, ${resumenDeTurno(t, ctx)}`).join('; '),
    onclick: () => { toque(); abrirLioDelDia(dia, ctx); },
  });

  for (const turno of turnos) {
    const quien = ctx.vista.persona(turno.hechoPorId) || ctx.vista.persona(turno.asignadoId);
    columna.append(el('span', {
      class: 'lio-marca',
      'data-estado': turno.estado,
      'data-mio': turno.mio ? 'si' : 'no',
      'data-pedido': turno.trato ? 'si' : 'no',
    }, [
      el('span', { class: 'lio-marca-turno', 'aria-hidden': 'true', texto: turno.turno.emoji }),
      // Sin color propio de cada persona: a quién le toca lo dicen sus dos
      // letras, y el color queda para decir en qué está el turno
      // (specs/prototipo-cuadro-de-lio.html).
      el('span', { texto: quien ? inicialesDe(quien) : '·' }),
    ]));
  }
  return columna;
}

/**
 * El día de Lio: los dos turnos, con lo que se puede hacer con cada uno.
 *
 * Es la misma fila que la pantalla de Hoy pone bajo el saludo, y a propósito:
 * quien ya sabe marcar desde Hoy no tiene que aprender nada aquí.
 */
export function abrirLioDelDia(fecha, ctx) {
  abrirHoja('🐾 Lio', (cuerpo) => {
    cuerpo.append(el('p', { class: 'pista', texto: formatearFechaLarga(fecha) }));
    for (const turno of turnosDe(ctx.vista.datos, fecha)) {
      cuerpo.append(filaDeTurno(turno, ctx));
    }
  });
}

/**
 * Una fila de turno: el emoji, en qué está, y el visto para marcarlo.
 *
 * Vive aquí y no en la pantalla de Hoy porque la usan las dos, y esta es la que
 * puede prestársela a la otra sin darle la vuelta a las dependencias: Hoy ya
 * importa de la agenda, y la agenda no importa de Hoy.
 */
export function filaDeTurno(turno, ctx, { rezagado = false } = {}) {
  // Marcar solo cuando la ventana ha abierto: a las cuatro de la tarde nadie
  // puede decir que ha sacado al perro en el turno de noche.
  const puedeMarcar = turno.estado !== 'hecho' && !turno.trato && turno.empezado;
  const rotulo = rezagado
    ? `Ayer por la ${turno.turno.nombre.toLowerCase()}`
    : turno.turno.nombre;

  const fila = el('div', {
    class: 'lio-fila', 'data-estado': turno.estado, 'data-rezagado': rezagado ? 'si' : 'no',
  }, [
    el('span', { class: 'lio-fila-emoji', 'aria-hidden': 'true', texto: turno.turno.emoji }),
    el('button', {
      class: 'lio-fila-texto', type: 'button',
      'aria-label': `${rotulo}: ${resumenDeTurno(turno, ctx)}. Ver el turno.`,
      onclick: () => { toque(); abrirTurnoDeLio(turno.fecha, turno.turno.id, ctx); },
    }, [
      el('span', { class: 'lio-fila-titulo', texto: rotulo }),
      el('span', {
        class: 'lio-fila-pista',
        texto: rezagado && turno.estado === 'sin-marcar'
          ? `${resumenDeTurno(turno, ctx)}. ¿La sacaste?`
          : resumenDeTurno(turno, ctx),
      }),
    ]),
  ]);

  // Un visto y no una palabra. «Ya está» cantaba dos veces al día en la pantalla
  // de inicio y le daba a marcar el peso de un verbo principal, cuando es el
  // gesto más corriente que hay aquí. La casilla vacía dice lo que falta y el
  // visto verde dice lo que está, sin escribir ninguna de las dos cosas.
  if (puedeMarcar) {
    fila.append(el('button', {
      class: 'lio-visto empujar', type: 'button',
      'aria-label': turno.mio || turno.estado === 'sin-asignar'
        ? `Marcar que ya está: ${rotulo.toLowerCase()}`
        : `Reclamar el turno: ${rotulo.toLowerCase()}`,
      title: turno.mio || turno.estado === 'sin-asignar' ? 'Ya está' : 'Reclamar',
      onclick: async () => {
        toque();
        const resultado = await marcarHecho(ctx.vista.datos, turno);
        avisar(resultado?.marcado ? 'Marcado' : 'Se lo he preguntado a quien le tocaba');
        ctx.refrescar();
      },
    }, [icono('visto')]));
  } else if (turno.estado === 'hecho') {
    // Hecho es un visto suelto, sin caja: no es una casilla que se desmarque
    // —eso se hace entrando en el turno— sino la marca de que ya pasó.
    fila.append(el('span', {
      class: 'lio-hecho empujar', role: 'img',
      'aria-label': 'Ya está', title: 'Ya está',
    }, [icono('visto')]));
  }
  return fila;
}

/** La frase que describe un turno. La misma en la etiqueta de la casilla, en la
 *  hoja del turno y en el bloque de Hoy: si se dijera de tres maneras habría que
 *  aprender tres. */
export function resumenDeTurno(estado, ctx) {
  // A uno mismo no se le nombra, y no basta con cambiar el nombre por «tú»: el
  // verbo cambia con él. «Le toca a tú» y «lo sacó tú» era lo que salía cuando
  // el pronombre se colaba en una frase escrita para un tercero.
  const yo = ctx.vista.yo.id;

  if (estado.estado === 'hecho') {
    const hora = estado.hechoEn ? new Date(estado.hechoEn) : null;
    const cuando = hora && !Number.isNaN(hora.getTime())
      ? ` a las ${String(hora.getHours()).padStart(2, '0')}:${String(hora.getMinutes()).padStart(2, '0')}`
      : '';
    return estado.hechoPorId === yo
      ? `lo sacaste tú${cuando}`
      : `lo sacó ${ctx.vista.nombre(estado.hechoPorId)}${cuando}`;
  }
  if (estado.estado === 'sin-asignar') return 'sin nadie';
  if (estado.estado === 'sin-marcar') {
    return estado.mio
      ? 'te tocaba a ti y nadie marcó'
      : `le tocaba a ${ctx.vista.nombre(estado.asignadoId)} y nadie marcó`;
  }
  return estado.mio ? 'te toca a ti' : `le toca a ${ctx.vista.nombre(estado.asignadoId)}`;
}

/**
 * La hoja de un turno: en qué está y qué se puede hacer con él.
 *
 * Los verbos dependen de quién mira y de si la ventana ya pasó. Marcar el turno
 * de otro no marca nada: propone una corrección, y hasta que ese otro la
 * confirme el turno sigue como estaba.
 */
export function abrirTurnoDeLio(fecha, turnoId, ctx) {
  const estado = turnoDe(ctx.vista.datos, fecha, turnoId);
  const yo = ctx.vista.yo.id;

  abrirHoja(`${estado.turno.emoji} ${estado.turno.nombre}`, (cuerpo) => {
    cuerpo.append(el('p', { class: 'pista', texto: formatearFechaLarga(fecha) }));
    cuerpo.append(el('p', { texto: mayuscula(resumenDeTurno(estado, ctx)) }));

    if (estado.trato) {
      // Con una propuesta viva no se ofrece nada más: primero se contesta lo
      // que hay encima de la mesa, que puede cambiar de quién es el turno.
      cuerpo.append(bloqueDePropuesta(estado.trato, ctx));
      return;
    }

    const acciones = el('div', { class: 'acciones' });

    if (estado.estado === 'hecho') {
      if (estado.hechoPorId === yo) {
        acciones.append(el('button', {
          class: 'boton', type: 'button',
          onclick: async () => { await desmarcar(estado); cerrarHoja(); ctx.refrescar(); },
        }, ['Deshacer']));
      }
    } else if (estado.empezado) {
      // La ventana está abierta o ya pasó: aquí sí cabe decir que el perro
      // salió. Si el turno era de otro, eso no lo marca todavía —se le pregunta
      // a quien lo tenía—, y por eso el verbo dice lo que uno hizo y no lo que
      // el sistema apunta.
      acciones.append(el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          const resultado = await marcarHecho(ctx.vista.datos, estado);
          cerrarHoja();
          avisar(resultado?.marcado ? 'Marcado' : 'Se lo he preguntado a quien le tocaba');
          ctx.refrescar();
        },
      }, [estado.mio || estado.estado === 'sin-asignar' ? 'Ya está' : 'Reclamar']));
    } else if (!estado.mio && estado.asignadoId) {
      // Un turno que aún no ha empezado y que es de otro: lo único que cabe es
      // ofrecerse a sacarlo, y hace falta que esa persona diga que sí.
      acciones.append(el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          await reclamarTurno(ctx.vista.datos, estado);
          cerrarHoja();
          avisar(`Se lo he dicho a ${ctx.vista.nombre(estado.asignadoId)}`);
          ctx.refrescar();
        },
      }, ['Reclamar']));
    } else if (!estado.asignadoId) {
      // Sin dueño no hay a quién preguntarle: se coge y ya está.
      acciones.append(el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          await marcarHecho(ctx.vista.datos, estado);
          cerrarHoja();
          avisar('Marcado');
          ctx.refrescar();
        },
      }, ['Lo saco yo']));
    }

    if (acciones.childElementCount) cuerpo.append(acciones);

    // Buscar quien lo saque por uno tiene sentido mientras el turno no esté
    // hecho y siga habiendo ventana por delante: un turno vencido ya no lo
    // puede sacar nadie.
    if (estado.mio && estado.estado === 'previsto') cuerpo.append(selectorDeRelevo(estado, ctx));
  });
}

/** A quién pedírselo: los de casa menos uno mismo, en botones. Son tres
 *  personas; una lista desplegable para elegir entre tres es un paso de más. */
function selectorDeRelevo(estado, ctx) {
  const otros = genteDeCasa(ctx.vista).filter((p) => p.id !== ctx.vista.yo.id);
  if (!otros.length) return el('p', { class: 'pista', texto: 'No hay nadie más en casa a quien pedírselo.' });

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'pista', texto: '¿Que lo saque otro? Se lo pides y tiene que aceptarlo.' }),
    el('div', { class: 'lio-relevo' }, otros.map((persona) => el('button', {
      class: 'boton', type: 'button',
      onclick: async () => {
        await pedirCambio(ctx.vista.datos, estado, persona.id);
        cerrarHoja();
        avisar(`Se lo he pedido a ${persona.nombre}`);
        ctx.refrescar();
      },
    }, [persona.nombre]))),
  ]);
}

/**
 * Una propuesta pendiente, dentro de la hoja del turno.
 *
 * Quien tiene que contestarla la contesta aquí mismo; quien la hizo solo puede
 * retirarla. Las dos respuestas van escritas enteras y con el mismo peso:
 * decir que no tiene que costar lo mismo que decir que sí.
 */
export function bloqueDePropuesta(trato, ctx) {
  const yo = ctx.vista.yo.id;
  const mia = trato.proponente_id === yo;
  const bloque = el('div', { class: 'lio-propuesta' }, [
    el('p', { texto: textoDePropuesta(trato, ctx) }),
  ]);

  if (mia) {
    bloque.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton', type: 'button',
        onclick: async () => { await retirarPropuesta(trato); cerrarHoja(); ctx.refrescar(); },
      }, ['Retirar']),
    ]));
    return bloque;
  }

  bloque.append(el('div', { class: 'acciones' }, [
    el('button', {
      class: 'boton crecer', type: 'button',
      onclick: async () => {
        await resolverPropuesta(trato, true);
        cerrarHoja();
        avisar(trato.clase === 'cambio' ? 'Hecho: ese turno es tuyo' : 'Confirmado');
        ctx.refrescar();
      },
    }, [trato.clase === 'cambio' ? 'Acepto' : 'Es verdad']),
    el('button', {
      class: 'boton', type: 'button',
      onclick: async () => {
        await resolverPropuesta(trato, false);
        cerrarHoja();
        avisar('Se queda como estaba');
        ctx.refrescar();
      },
    }, [trato.clase === 'cambio' ? 'No puedo' : 'No fue así']),
  ]));
  return bloque;
}

/**
 * Qué se está pidiendo, contado desde el lado de quien lee.
 *
 * Cada frase tiene dos versiones y no una con el nombre cambiado: en cuanto uno
 * de los dos es quien mira, el verbo cambia de persona. «Tú dice que sacó a
 * Lio» era lo que salía de tratar el pronombre como si fuera un nombre más.
 */
export function textoDePropuesta(trato, ctx) {
  const yo = ctx.vista.yo.id;
  const nombre = (id) => ctx.vista.nombre(id);
  const cuando = `el ${formatearFechaLarga(parsearMomento(trato.fecha))} por la `
    + ((TURNOS.find((t) => t.id === trato.turno) || {}).nombre?.toLowerCase() || trato.turno);

  if (trato.clase === 'correccion') {
    if (trato.proponente_id === yo) {
      return `Dices que has sacado a Lio ${cuando}, y ese turno era de ${nombre(trato.destinatario_id)}.`;
    }
    if (trato.destinatario_id === yo) {
      return `${nombre(trato.proponente_id)} dice que ha sacado a Lio ${cuando}, y ese turno era tuyo.`;
    }
    return `${nombre(trato.proponente_id)} dice que ha sacado a Lio ${cuando}, `
      + `y ese turno era de ${nombre(trato.destinatario_id)}.`;
  }

  // Un cambio va en un sentido o en el otro según quién lo proponga: quien ya
  // tenía el turno está pidiendo que se lo cubran, y quien no lo tenía se está
  // ofreciendo a sacarlo.
  const seOfrece = trato.proponente_id !== trato.asignado_previo_id;
  if (seOfrece) {
    if (trato.proponente_id === yo) return `Te ofreces a sacar a Lio ${cuando}, que le toca a ${nombre(trato.destinatario_id)}.`;
    if (trato.destinatario_id === yo) return `${nombre(trato.proponente_id)} se ofrece a sacar a Lio ${cuando}, que te toca a ti.`;
    return `${nombre(trato.proponente_id)} se ofrece a sacar a Lio ${cuando}, que le toca a ${nombre(trato.destinatario_id)}.`;
  }
  if (trato.proponente_id === yo) return `Le pides a ${nombre(trato.destinatario_id)} que saque a Lio ${cuando}.`;
  if (trato.destinatario_id === yo) return `${nombre(trato.proponente_id)} te pide que saques a Lio ${cuando}.`;
  return `${nombre(trato.proponente_id)} le pide a ${nombre(trato.destinatario_id)} que saque a Lio ${cuando}.`;
}

const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

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
 * El botón de compartir de la cabecera del día.
 *
 * Un día se comparte tal cual se ve: lo que hay en la hoja es ya lo visible
 * para quien mira, de modo que no puede salir por ahí un evento reservado. En
 * un día vacío no se ofrece, porque no habría nada que enviar.
 */
function accionesDelDia(fecha, apariciones, ctx) {
  if (!apariciones.length) return [];

  const titulo = formatearFechaLarga(fecha);
  return [botonDeCompartir(ctx, {
    etiqueta: 'Compartir el día',
    titulo,
    pista: 'Un renglón por evento, con su hora',
    texto: () => `${titulo}\n${textoDelDia(apariciones, ctx).join('\n')}`,
    redactar: () => redactarDia(iso(fecha), apariciones.map((aparicion) => aparicion.evento.id)),
  })];
}

/**
 * El día como texto: una línea por evento, con su hora y su sitio. La misma
 * cara pública que se comparte de un evento suelto, sin una palabra de la
 * dimensión de regalos.
 */
function textoDelDia(apariciones, ctx) {
  return apariciones.map((aparicion) => {
    const hora = horaDe(aparicion);
    const cara = ctx.vista.caraDe(aparicion.evento);
    return [
      cara.emoji,
      hora ? `${hora} ·` : null,
      cara.titulo + (aparicion.continuacion ? ' (cont.)' : ''),
      aparicion.evento.ubicacion ? `· ${aparicion.evento.ubicacion}` : null,
    ].filter(Boolean).join(' ');
  });
}

// -------------------------------------------------------- Detalle de evento --

export function abrirDetalleEvento(eventoId, ctx, aparicion = null) {
  const evento = ctx.vista.evento(eventoId) || aparicion?.evento;
  if (!evento) return;

  const inicio = parsearMomento(evento.inicio);

  // Un cumpleaños abre la hoja de cumpleaños, que ya existe en Regalos y sabe
  // cosas que esta no: cuántos cumple, la felicitación y sus regalos. Tener dos
  // hojas para lo mismo solo servía para que se fueran separando. El día que se
  // le pasa es el de la aparición y no el próximo aniversario: abrir el de 2027
  // desde el mes tiene que decir los años de 2027.
  if (evento.origen === 'derivado' && evento.persona_origen_id) {
    const cuando = aparicion ? aparicion.dia : inicio;
    const nombre = ctx.vista.caraDe(evento).titulo;
    return abrirCumple(evento.persona_origen_id, ctx, {
      dia: cuando,
      comentariosDe: evento.id,
      // Compartir lo pone la agenda y no la hoja: el botón vive en este módulo,
      // y hacerlo al revés obligaría a que Regalos importara de vuelta.
      acciones: [botonDeCompartir(ctx, {
        etiqueta: 'Compartir el cumpleaños',
        tono: 'discreto',
        titulo: nombre,
        pista: 'Con su fecha',
        texto: () => `🎂 ${nombre}\n${formatearFechaLarga(cuando)}`,
        redactar: () => redactarDia(iso(cuando), [evento.id]),
      })],
    });
  }

  const derivado = evento.origen !== 'manual';
  const cara = ctx.vista.caraDe(evento);

  // Compartir usa la hoja nativa dentro de la cáscara de iOS y cae a
  // `navigator.share` —o al portapapeles— en el navegador. Solo sale la cara
  // pública del evento: ni una palabra de la dimensión de regalos.
  const dia = aparicion ? aparicion.dia : inicio;
  const textoDelEvento = () => `${cara.emoji} ${cara.titulo}\n${formatearFechaLarga(dia)}`
    + (evento.jornada_completa ? '' : ` · ${horaDe(aparicion || { evento, instancia: { inicio }, continuacion: false })}`)
    + (evento.ubicacion ? `\n${evento.ubicacion}` : '');

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
    botonDeCompartir(ctx, {
      etiqueta: 'Compartir el evento',
      tono: 'discreto',
      titulo: cara.titulo,
      pista: 'Con su fecha, su hora y su sitio',
      texto: textoDelEvento,
      redactar: () => redactarDia(iso(dia), [evento.id]),
    }),
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

  // Un cumpleaños no es una fila de `evento`, así que su ocasión no lo apunta:
  // la busca por fecha y participante quien sabe hacerlo.
  const ocasion = ocasionDeEvento(evento, ctx);
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
    // La categoría no se edita desde aquí —el formulario ya no la ofrece—, pero
    // se arrastra: si el evento venía reservado, guardarlo desde esta pantalla
    // no puede destaparlo sin que nadie lo haya pedido.
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
    const titulo = entrada({ value: borrador.titulo, autofocus: true });
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
    const lugar = entrada({ value: borrador.ubicacion });
    const notas = el('textarea', {});
    notas.value = borrador.notas;
    const repite = seleccion(REPETICIONES.map((r) => ({ valor: r.valor, texto: r.texto })), borrador.repeticion);

    avanzado.append(
      campo('A qué hora', hora, 'Déjala vacía si dura todo el día.'),
      campo('Qué es', tipo, 'El tipo elige el emoji y propone si el evento lleva regalos. Para otro emoji, empieza el título con él.'),
      campoDeGente(ctx, {
        etiqueta: 'De quién es',
        pista: 'Determina a quién se le ocultan los regalos de este evento y qué ideas se proponen al asociarlos.',
        elegidos: borrador.protagonistas,
        alCambiar: (ids) => { borrador.protagonistas = ids; },
        memoria: 'evento',
      }),
      campoDeGente(ctx, {
        etiqueta: 'Quién más va',
        pista: 'Solo informativo.',
        elegidos: borrador.asistentes,
        alCambiar: (ids) => { borrador.asistentes = ids; },
        memoria: 'evento',
      }),
      campo('Dónde', lugar),
      campo('Se repite', repite),
      campo('Notas', notas),
    );

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
            categoria_id: borrador.categoria_id,
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
          recordarElegidos('evento', [...borrador.protagonistas, ...borrador.asistentes]);
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
