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
  deslizarHorizontal, dobleToque,
} from '../ui.js';
import { guardar, retirar } from '../sincronizacion.js';
import { REPETICIONES, nuevoId } from '../modelo.js';
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
 * Encabezado de la agenda: de cuándo se está hablando, y luego con qué vista se
 * mira. El periodo va primero y en grande porque es la pregunta que se hace
 * quien llega —«¿qué semana es esta?»— y porque el número del día suelto, sin
 * mes ni año, no la responde.
 */
function tituloDePeriodo() {
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

  vaciar(subcabecera).append(
    el('div', { class: 'agenda-controles' }, [
      el('div', { class: 'periodo' }, [
        el('h2', { class: 'periodo-titulo', texto: tituloDePeriodo() }),
        // La lista arranca siempre en hoy y llega hasta donde llegue: no hay
        // periodo anterior ni siguiente al que saltar.
        modo === 'lista' ? null : el('div', { class: 'paso empujar' }, [
          paso('‹', -1, 'Anterior'),
          paso('›', 1, 'Siguiente'),
        ]),
      ]),
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
        // Volver es tan necesario como irse: con las flechas y el
        // deslizamiento, tres gestos distraídos dejan la agenda en un mes que
        // no le importa a nadie y sin forma evidente de regresar. En la lista
        // no hace falta, porque siempre arranca en hoy.
        modo === 'lista' ? null : el('button', {
          class: 'boton-hoy empujar', type: 'button',
          'aria-label': 'Volver a hoy',
          onclick: () => { toque(); ancla = hoy(); ultimoPaso = 0; ctx.refrescar(); },
        }, ['Hoy']),
      ]),
    ]),
  );

  vaciar(pantalla);
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
  return el('button', {
    class: 'linea', type: 'button',
    'data-continuacion': aparicion.continuacion ? 'si' : 'no',
    onclick: () => abrirDetalleEvento(aparicion.evento.id, ctx, aparicion),
  }, [
    // Un evento de varios días se marca con una banda continua en el margen.
    aparicion.instancia.inicio.getTime() !== aparicion.instancia.fin.getTime()
      ? el('span', { class: 'linea-banda' }) : null,
    el('span', { class: 'linea-emoji', texto: ctx.vista.emojiDe(aparicion.evento) }),
    el('span', { class: 'linea-titulo', texto: aparicion.evento.titulo + (aparicion.continuacion ? ' (cont.)' : '') }),
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

  return el('div', {}, [rejilla, detalle]);
}

// ---------------------------------------------------------------- Lista --

function vistaLista(ctx) {
  const desde = hoy();
  const hasta = sumarDias(desde, 180);
  const instancias = instanciasEn(ctx.vista.datos, desde, hasta).sort((a, b) => a.inicio - b.inicio);

  if (!instancias.length) {
    return el('p', { class: 'vacio', texto: 'No hay nada en los próximos seis meses.' });
  }

  const contenedor = el('div', {});
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
  const participantes = ctx.vista.participantes(aparicion.evento).map((id) => ctx.vista.nombre(id));
  return el('button', {
    class: 'tarjeta', type: 'button',
    onclick: () => abrirDetalleEvento(aparicion.evento.id, ctx, aparicion),
  }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('span', { class: 'linea-emoji', texto: ctx.vista.emojiDe(aparicion.evento) }),
      el('h3', { texto: aparicion.evento.titulo }),
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
  });

  // El mismo gesto que en la semana y en el mes, un piso más abajo: aquí lo que
  // pasa es el día. Se cuelga del cuerpo, que la hoja rehace en cada apertura.
  deslizarHorizontal(contenido, (pasos) => { toque(); abrirDia(sumarDias(fecha, pasos), ctx); });
}

// -------------------------------------------------------- Detalle de evento --

export function abrirDetalleEvento(eventoId, ctx, aparicion = null) {
  const evento = ctx.vista.evento(eventoId) || aparicion?.evento;
  if (!evento) return;

  const derivado = evento.origen !== 'manual';
  const inicio = parsearMomento(evento.inicio);

  abrirHoja(evento.titulo, (cuerpo) => {
    cuerpo.append(el('div', { class: 'tarjeta-fila' }, [
      el('span', { style: 'font-size:26px', texto: ctx.vista.emojiDe(evento) }),
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

    cuerpo.append(el('div', { class: 'acciones' }, [
      derivado ? null : el('button', {
        class: 'boton crecer', type: 'button',
        onclick: () => abrirFormularioEvento(ctx, { id: evento.id }),
      }, ['Editar']),
      // Compartir usa la hoja nativa dentro de la cáscara de iOS y cae a
      // `navigator.share` —o al portapapeles— en el navegador. Solo sale la
      // cara pública del evento: ni una palabra de la dimensión de regalos.
      el('button', {
        class: 'boton', 'data-tono': 'discreto', type: 'button',
        onclick: async () => {
          toque();
          const enviado = await compartir({
            titulo: evento.titulo,
            texto: `${ctx.vista.emojiDe(evento)} ${evento.titulo}\n${formatearFechaLarga(aparicion ? aparicion.dia : inicio)}`
              + (evento.jornada_completa ? '' : ` · ${horaDe(aparicion || { evento, instancia: { inicio }, continuacion: false })}`)
              + (evento.ubicacion ? `\n${evento.ubicacion}` : ''),
          });
          if (!enviado) avisar('No he podido compartirlo');
        },
      }, ['Compartir']),
      el('button', {
        class: 'boton', 'data-tono': 'discreto', type: 'button',
        onclick: () => abrirSelectorDeEmoji(evento, ctx),
      }, ['Emoji']),
      derivado ? null : el('button', {
        class: 'boton', 'data-tono': 'peligro', type: 'button',
        onclick: async () => { await retirar('evento', evento.id); cerrarHoja(); avisar('Evento retirado'); ctx.refrescar(); },
      }, ['Borrar']),
    ]));
  });
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

// ------------------------------------------------------- Selector de emoji --

function abrirSelectorDeEmoji(evento, ctx) {
  const permitidos = ctx.vista.emojisPermitidos();
  abrirHoja('Elegir emoji', (cuerpo) => {
    cuerpo.append(el('p', {
      class: 'pista',
      texto: 'La selección es corta a propósito: la variedad ilimitada convierte la semana en un mosaico y destruye el reconocimiento de un vistazo.',
    }));
    cuerpo.append(el('div', { class: 'emojis' }, permitidos.map((emoji) =>
      el('button', {
        type: 'button',
        'aria-pressed': ctx.vista.emojiDe(evento) === emoji ? 'true' : 'false',
        onclick: async () => { await guardar('evento', evento.id, { emoji }); cerrarHoja(); ctx.refrescar(); },
      }, [emoji]),
    )));
  });
}

// --------------------------------------------------------- Crear y editar --

/**
 * La creación tiene dos niveles. La hoja rápida pide título y día, y con eso
 * guarda; el resto de campos aparece solo si se piden (specs/ux.md §10.1).
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
      campo('Qué es', tipo, 'El tipo elige el emoji y propone si el evento lleva regalos.'),
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
  });
}

export const anclaActual = () => ancla;
