/**
 * Sitios: lo que una casa sabe de un lugar y se le olvida cada año.
 *
 * Dos alturas dentro de la misma pestaña —la lista de sitios y un sitio
 * abierto— y no una hoja para lo segundo. Un sitio no es un detalle que se mira
 * de pasada: es la lista que se lee antes de salir de casa, con cuatro grupos
 * dentro, y una hoja modal encima de otra pantalla no es donde se hace eso.
 * Además así el botón flotante tiene sus dos significados sin inventarse nada:
 * en la lista crea un sitio, dentro de uno crea un apunte allí.
 *
 * El apunte sí es una hoja, porque a un apunte se entra a decir algo —votarlo,
 * leer lo que se ha hablado— y se vuelve enseguida a la lista.
 *
 * La forma está en `specs/ux.md` §12.1 y el porqué, con las opciones que se
 * descartaron en cada decisión, en `specs/propuesta-sitios.html`.
 */

import {
  abrirHoja, avisar, botonIcono, campo, carruselDePropuestas, cerrarHoja, el, entrada, icono,
  vaciar,
} from '../ui.js';
import { apuntarEnSitio, guardar, retirar, sugerirEmojiDeSitio } from '../sincronizacion.js';
import { emojiVisible, estaActivo, nuevoId, partirEmoji, redaccionDisponible } from '../modelo.js';
import { compartir, toque } from '../native.js';
import { bloqueDeComentarios } from '../comentarios.js';
import { marcarVisto } from '../avisos.js';
import {
  CLASES, CLASE_POR_DEFECTO, alternarHecho, alternarVoto, apuntesDe, clasePorId,
  cuantosApuntes, esLista, estaHecho, firmaDeApunte, haySitios, lugarPorId, lugaresDe,
  nombreDeLugar, pistaDeCompartirApunte, porClase, resumenDeLugar, textoDeLaLista,
  textoDelApunte, textoDelLugar, votantesDe,
} from '../sitios.js';

/** El sitio que se está mirando, o `null` si se está en la lista. Vive aquí y
 *  no en la instantánea: es dónde está uno, no un dato del hogar. */
let lugarAbierto = null;

/** Qué clase sin nada todavía tiene su fila de escribir desplegada, dentro de
 *  un sitio — `null` si ninguna. Vive aquí por lo mismo que `lugarAbierto`: es
 *  dónde está uno, no un dato del hogar. */
let claseEnAlta = null;

/** Qué fila de escribir se enfoca en el próximo pintado — de un solo uso, para
 *  no robarle el teclado a quien está escribiendo en otra fila cuando un
 *  cambio ajeno vuelve a pintar la pantalla. */
let enfocarClase = null;

export function reiniciarSitios() {
  lugarAbierto = null;
  claseEnAlta = null;
  enfocarClase = null;
}

/**
 * Si el flotante tiene algo que hacer en Sitios ahora mismo.
 *
 * En la lista, sigue creando un sitio. Dentro de uno, ya no: eso lo hacen las
 * filas de escribir de cada sección, y un flotante que abriera además la hoja
 * de siempre sería un segundo camino a lo mismo.
 */
export const hayFabEnSitios = () => !lugarAbierto;

/**
 * El título de la pestaña, que dentro de un sitio son migas.
 *
 * «Sitios › Bolonia», con «Sitios» tocable para volver. La navegación vive en la
 * línea del título y no en un «‹ Sitios» debajo, porque es la misma cosa dicha
 * dos veces: dónde estás y de dónde vienes se leen juntos o no se leen.
 *
 * El sitio se queda con el tamaño del título y «Sitios» va pequeño y en tinta,
 * que es lo que hace que se lea como un camino y no como dos rótulos: lo grande
 * es dónde estás, y lo pequeño, por dónde has llegado.
 */
export function tituloDeSitios(ctx) {
  const lugar = lugarAbierto ? lugarPorId(ctx?.vista?.datos, lugarAbierto) : null;
  if (!lugar) return 'Sitios';

  return el('span', { class: 'migas' }, [
    el('button', {
      class: 'miga', type: 'button',
      onclick: () => { lugarAbierto = null; ctx.refrescar(); },
    }, ['Sitios']),
    el('span', { class: 'miga-flecha', 'aria-hidden': 'true', texto: '›' }),
    el('span', { texto: nombreDeLugar(lugar) }),
  ]);
}

/** Lo que hace el botón flotante, que depende de la altura. */
export function nuevoDesdeSitios(ctx) {
  if (lugarAbierto) return abrirFormularioApunte(ctx, { lugarId: lugarAbierto });
  return abrirFormularioLugar(ctx);
}

export function pintarSitios(pantalla, subcabecera, ctx) {
  // Lo que se estuviera escribiendo en una fila, antes de que `vaciar` se lo
  // lleve por delante: guardar un apunte ya no espera a nada antes de volver
  // a pintar, así que un redibujado puede llegar con la fila todavía en uso
  // —a media palabra de la siguiente cosa—, y no solo cuando lo dispara el
  // apunte que se acaba de guardar: el turno de otro, un voto ajeno, lo que
  // sea, tampoco debe poder robarle el teclado a quien está escribiendo.
  const enCurso = capturarEscritura(pantalla);

  vaciar(subcabecera);
  vaciar(pantalla);

  if (!haySitios(ctx.vista.datos)) {
    pantalla.append(el('p', {
      class: 'vacio',
      texto: 'Los sitios todavía no están puestos en el servidor.',
    }));
    return;
  }

  // Un sitio que se borra desde otro dispositivo mientras se está dentro deja de
  // existir: se vuelve a la lista en vez de pintar una pantalla de nada.
  if (lugarAbierto && !lugarPorId(ctx.vista.datos, lugarAbierto)) lugarAbierto = null;

  if (lugarAbierto) pintarUnLugar(pantalla, subcabecera, ctx);
  else pintarLaLista(pantalla, ctx);

  restaurarFoco(pantalla, enCurso);
}

/** Qué fila de escribir tiene el foco ahora mismo y qué lleva escrito, para
 *  que un redibujado no se lo lleve por delante. `null` si el foco no está en
 *  ninguna. */
function capturarEscritura(pantalla) {
  const activo = document.activeElement;
  const fila = activo?.closest?.('.fila-escribir');
  if (!fila || !pantalla.contains(fila)) return null;
  return { clase: fila.dataset.clase, valor: activo.value, cursor: activo.selectionStart };
}

/**
 * Devuelve el foco después de un redibujado: a la fila que se estaba usando,
 * con lo que llevaba escrito, o si no había ninguna, a la que acaba de pedir
 * `enfocarClase` —la píldora de una clase sin nada que se acaba de tocar,
 * donde no había nada que capturar porque la fila todavía no existía—.
 */
function restaurarFoco(pantalla, capturado) {
  const objetivo = capturado?.clase || enfocarClase;
  enfocarClase = null;
  if (!objetivo) return;

  const input = pantalla.querySelector(`.fila-escribir[data-clase="${objetivo}"] input`);
  if (!input) return;

  if (capturado) {
    input.value = capturado.valor;
    // El «+» de confirmar depende de este mismo evento; disparándolo no hay
    // que repetir aquí la regla de cuándo se enseña.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input.focus({ preventScroll: true });
  if (capturado) input.setSelectionRange(capturado.cursor, capturado.cursor);
}

// ------------------------------------------------------------- La lista --

function pintarLaLista(pantalla, ctx) {
  const lugares = lugaresDe(ctx.vista.datos);

  if (!lugares.length) {
    pantalla.append(el('p', {
      class: 'vacio',
      texto: 'Aquí van los sitios: la playa, el pueblo, el súper. Toca el «+» para el primero.',
    }));
    return;
  }

  pantalla.append(el('div', { class: 'grupo' }, lugares.map((lugar) => {
    const sinLeer = apuntesDe(ctx.vista.datos, lugar.id)
      .filter((apunte) => tieneSinLeer(ctx, apunte)).length;

    return el('button', {
      class: 'tarjeta', type: 'button',
      onclick: () => { lugarAbierto = lugar.id; ctx.refrescar(); },
    }, [
      el('div', { class: 'tarjeta-fila' }, [
        el('h3', { texto: nombreDeLugar(lugar) }),
        // La marca en contexto, que es lo que sustituye a una lista de
        // novedades: el sobre cuenta que hay algo y aquí se ve dónde.
        sinLeer ? el('span', { class: 'punto-nuevo', 'aria-label': 'Con comentarios sin leer' }) : null,
      ]),
      // Cuántas de cada verbo, y no cuántas en total: «6 apuntes» puede ser una
      // lista de la compra o seis playas, y la pregunta que se hace al mirar la
      // lista es de qué va cada sitio.
      el('p', { texto: resumenDeLugar(ctx.vista.datos, lugar.id) }),
    ]);
  })));
}

// --------------------------------------------------------- Un sitio dentro --

function pintarUnLugar(pantalla, subcabecera, ctx) {
  const lugar = lugarPorId(ctx.vista.datos, lugarAbierto);

  // La salida no vive aquí: está en las migas del título, que es donde se lee
  // de dónde vienes. Aquí quedan solo los verbos del sitio.
  subcabecera.append(el('div', { class: 'subcabecera-verbos' }, [
    botonIcono('editar', {
      etiqueta: 'Editar el sitio',
      tono: 'discreto',
      onclick: () => abrirFormularioLugar(ctx, { id: lugar.id }),
    }),
    botonIcono('compartir', {
      etiqueta: 'Compartir el sitio',
      tono: 'discreto',
      onclick: async () => {
        toque();
        const enviado = await compartir({
          titulo: lugar.nombre,
          texto: textoDelLugar(ctx.vista.datos, lugar),
        });
        if (!enviado) avisar('No he podido compartirlo');
      },
    }),
    botonIcono('borrar', {
      etiqueta: 'Borrar el sitio',
      tono: 'peligro',
      onclick: () => borrarLugar(lugar, ctx),
    }),
  ]));

  const grupos = porClase(ctx.vista.datos, lugar.id);
  const conAlgo = new Set(grupos.map((g) => g.clase.id));
  // Si ya tiene algo, deja de estar «en alta»: a partir de ahora es un grupo
  // como cualquier otro, y el hueco de escribir lo pone su propia fila.
  if (claseEnAlta && conAlgo.has(claseEnAlta)) claseEnAlta = null;

  for (const clase of CLASES) {
    const grupo = grupos.find((g) => g.clase.id === clase.id);
    if (!grupo && clase.id !== claseEnAlta) continue;
    const apuntes = grupo?.apuntes || [];

    pantalla.append(el('div', { class: 'grupo' }, [
      // El rótulo de una lista lleva su propio verbo de compartir: «mándame lo
      // que hay que llevar» se pide entero y sin lo demás, y quien lo recibe no
      // quiere saber a qué duna se sube. Sin nada que llevar todavía, no hay
      // nada que compartir tampoco.
      clase.lista
        ? el('div', { class: 'grupo-cabeza' }, [
            el('p', { class: 'grupo-titulo', texto: clase.nombre }),
            apuntes.length
              ? botonIcono('compartir', {
                  etiqueta: `Compartir lo que hay que ${clase.nombre.toLowerCase()}`,
                  tono: 'discreto',
                  onclick: async () => {
                    toque();
                    const enviado = await compartir({
                      titulo: `${clase.nombre} · ${lugar.nombre}`,
                      texto: textoDeLaLista(ctx.vista.datos, lugar, clase.id),
                    });
                    if (!enviado) avisar('No he podido compartirlo');
                  },
                })
              : null,
          ])
        : el('p', { class: 'grupo-titulo', texto: clase.nombre }),
      el('div', {}, apuntes.map((apunte) => (clase.lista
        ? filaDeLista(apunte, ctx)
        : filaDeApunte(apunte, ctx)))),
      filaEscribir(clase, lugar.id, ctx),
    ]));
  }

  // Las clases sin nada todavía, y sin su fila de escribir desplegada: una
  // píldora por cada una, al final y no delante de lo que ya hay apuntado —
  // un sitio que ya tiene contenido lo enseña primero, y lo que falta por
  // empezar queda donde se busca cuando hace falta y no antes—. Tocarla es
  // lo que sustituye aquí al «+» que ya no está.
  const pendientes = CLASES.filter((c) => !conAlgo.has(c.id) && c.id !== claseEnAlta);
  if (pendientes.length) {
    pantalla.append(el('div', { class: 'opciones pendientes-sitio' }, pendientes.map((clase) =>
      el('button', {
        class: 'opcion', 'data-vacia': true, type: 'button',
        onclick: () => { claseEnAlta = clase.id; enfocarClase = clase.id; ctx.refrescar(); },
      }, [`+ ${clase.nombre}`]))));
  }

  // El foco se devuelve desde `pintarSitios`, después de llamar a esta
  // función: `restaurarFoco` es quien decide a qué fila, con qué llevaba
  // escrito si la había, y sin desplazar la pantalla para conseguirlo.
}

/**
 * Una línea de la lista de la compra: casilla, lo que hay que llevar, quién
 * lo puso y el aspa.
 *
 * **Casilla y texto son dos blancos distintos.** Antes era uno solo —tocar
 * en cualquier punto tachaba, «un dedo entero y no un objetivo de veinte
 * puntos»—, pero eso dejaba corregir una errata solo borrando y volviendo a
 * escribir. Ahora la casilla tacha —sigue siendo pequeña, el toque le crece
 * por pseudoelemento sin tocar el dibujo— y el texto edita: se sustituye por
 * un campo con lo mismo puesto, Intro o perder el foco confirma, Escape
 * deshace.
 */
function filaDeLista(apunte, ctx) {
  const hecho = estaHecho(apunte);
  const firma = firmaDeApunte(ctx.vista, apunte);

  const casilla = el('button', {
    class: 'llevar-casilla', type: 'button',
    'aria-pressed': hecho ? 'true' : 'false',
    'aria-label': hecho ? `Quitar la marca de hecho a ${apunte.titulo}` : `Marcar ${apunte.titulo} como hecho`,
    onclick: async () => {
      toque();
      await alternarHecho(apunte);
    },
  }, [hecho ? icono('visto') : null]);

  const texto = el('button', {
    class: 'llevar-texto', type: 'button', 'aria-label': `Editar «${apunte.titulo}»`,
    onclick: () => editarTituloEnLinea(texto, apunte),
  }, [
    el('span', { class: 'llevar-titulo', texto: apunte.titulo }),
    firma ? el('span', { class: 'llevar-firma', texto: firma }) : null,
  ]);

  return el('div', { class: 'llevar', 'data-hecho': hecho ? 'si' : null }, [
    el('div', { class: 'llevar-cuerpo' }, [casilla, texto]),
    el('button', {
      class: 'llevar-quitar', type: 'button', 'aria-label': `Quitar ${apunte.titulo}`,
      onclick: async () => {
        await retirar('apunte', apunte.id);
        toque('media');
      },
    }, ['×']),
  ]);
}

/**
 * Sustituye el texto por un campo editable en su sitio. Confirma al perder
 * el foco o con Intro; Escape lo deja como estaba. No pasa por
 * `ctx.refrescar()`: `guardar` ya avisa solo a quien está suscrito.
 */
function editarTituloEnLinea(texto, apunte) {
  const input = entrada({ value: apunte.titulo });
  input.className = 'llevar-editar';

  const terminar = async (aceptar) => {
    input.removeEventListener('blur', confirmar);
    const nuevo = aceptar ? input.value.trim() : '';
    input.replaceWith(texto);
    if (nuevo && nuevo !== apunte.titulo) {
      texto.querySelector('.llevar-titulo').textContent = nuevo;
      toque();
      await guardar('apunte', apunte.id, { titulo: nuevo });
    }
  };
  const confirmar = () => terminar(true);

  input.addEventListener('blur', confirmar);
  input.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') { evento.preventDefault(); input.blur(); }
    if (evento.key === 'Escape') { evento.preventDefault(); terminar(false); }
  });

  texto.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

/**
 * Una línea de la lista: el título, el detalle en gris si lo hay, y el voto.
 *
 * La línea entera abre el apunte y la pastilla del voto no: son dos blancos
 * distintos dentro de la misma fila, y el del voto se traga su propio toque para
 * que votar no abra nada. Votar es el gesto barato y tiene que costar un toque
 * desde la lista; abrir es lo que se hace cuando hay algo que decir.
 */
function filaDeApunte(apunte, ctx) {
  const votantes = votantesDe(ctx.vista.datos, apunte.id);
  const mio = votantes.includes(ctx.vista.yo.id);
  const comentarios = ctx.vista.comentariosDe('apunte', apunte.id).length;

  const voto = el('button', {
    class: 'voto', type: 'button',
    'data-mio': mio ? 'si' : null,
    'data-vacio': votantes.length ? null : 'si',
    'aria-label': mio ? 'Quitar mi voto' : 'Me apunto a esto',
    onclick: async (evento) => {
      evento.stopPropagation();
      toque();
      await alternarVoto(ctx.vista.datos, apunte.id, ctx.vista.yo.id);
      ctx.refrescar();
    },
  }, [
    el('span', { class: 'voto-pulgar', 'aria-hidden': 'true', texto: '👍' }),
    el('span', { texto: votantes.length ? votantes.map((id) => inicialesDe(ctx, id)).join('·') : '—' }),
  ]);

  return el('div', { class: 'apunte' }, [
    el('button', {
      class: 'apunte-cuerpo', type: 'button',
      onclick: () => abrirApunte(apunte.id, ctx),
    }, [
      el('span', { class: 'apunte-titulo', texto: apunte.titulo }),
      apunte.detalle || comentarios
        ? el('span', { class: 'apunte-pie' }, [
            apunte.detalle ? el('span', { class: 'apunte-detalle', texto: apunte.detalle }) : null,
            comentarios
              ? el('span', {
                  class: 'apunte-comentarios',
                  'data-sin-leer': tieneSinLeer(ctx, apunte) ? 'si' : null,
                  texto: comentarios === 1 ? '1 comentario' : `${comentarios} comentarios`,
                })
              : null,
          ])
        : null,
    ]),
    voto,
  ]);
}

/**
 * La fila de escribir del final de un grupo: la siguiente línea en blanco de
 * la lista que se está mirando, no una barra de búsqueda pegada debajo. Por
 * eso el campo no lleva caja ni borde propios y comparte el alto y la raya de
 * separación de las filas que tiene encima —el mismo molde que `.apunte` y
 * `.llevar`—, y por eso el tamaño de letra no baja de 16: por debajo de eso
 * Safari hace zoom al enfocar, que es lo que movía la pantalla entera.
 *
 * Sustituye al «+» de dentro de un sitio: meter cosas rápido es escribir esa
 * línea, y refinarlas es para después. En Llevar no lleva más botón que el de
 * confirmar —una lista de la compra no tiene detalle que asociarle—, y solo
 * aparece con algo escrito, para no poner un «+» que todavía no hace nada. En
 * las demás clases lleva además el lápiz, siempre ahí, que entrega lo ya
 * escrito —sin perderlo— a la misma hoja de siempre, con la clase puesta: ahí
 * es donde se describe, se pide una idea a la IA o simplemente se guarda tal
 * cual.
 */
function filaEscribir(clase, lugarId, ctx) {
  const input = entrada({ placeholder: `Añadir a ${clase.nombre}…` });

  const confirmar = el('button', {
    class: 'fila-confirmar', type: 'button', 'aria-label': `Añadir a ${clase.nombre}`, hidden: true,
  }, ['+']);

  const guardarApunte = () => {
    const texto = input.value.trim();
    if (!texto) return;
    // Se limpia y se sigue escribiendo al instante, sin esperar a que
    // `guardar` termine: ya deja escrita la instantánea y avisa a quien está
    // suscrito —la propia aplicación, que es quien redibuja— antes de
    // encolar el cambio para la red, que es lo que de verdad podía tardar.
    // El campo sigue enfocado durante ese redibujado —no se toca aquí—, y es
    // `capturarEscritura`/`restaurarFoco` quien se encarga de que no pierda
    // ni el foco ni lo que se haya llegado a escribir mientras tanto.
    input.value = '';
    confirmar.hidden = true;
    toque();
    if (claseEnAlta === clase.id) claseEnAlta = null;
    guardar('apunte', nuevoId(), {
      lugar_id: lugarId, clase: clase.id, titulo: texto, autor_id: ctx.vista.yo.id, activo: 1,
    });
  };
  confirmar.onclick = guardarApunte;

  input.addEventListener('input', () => { confirmar.hidden = !input.value.trim(); });
  input.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') { evento.preventDefault(); guardarApunte(); }
  });

  const verbos = [confirmar];
  if (!clase.lista) {
    verbos.push(el('button', {
      class: 'fila-lapiz', type: 'button', 'aria-label': 'Más detalle',
      onclick: () => abrirFormularioApunte(ctx, {
        lugarId, claseInicial: clase.id, tituloInicial: input.value.trim(),
      }),
    }, [icono('editar')]));
  }

  return el('div', { class: 'fila-escribir', 'data-clase': clase.id }, [
    input,
    el('div', { class: 'fila-escribir-verbos' }, verbos),
  ]);
}

/** Las dos primeras letras del nombre, como en el carril de Lío: con cuatro
 *  personas en casa las letras dicen quién mejor que un número. */
function inicialesDe(ctx, personaId) {
  return (ctx.vista.nombre(personaId) || '—').slice(0, 2).toUpperCase();
}

/** ¿Ha llegado algo a este apunte desde la última vez que se miró? */
function tieneSinLeer(ctx, apunte) {
  const hasta = ctx.vista.vistoHasta('apunte', apunte.id);
  return ctx.vista.comentariosDe('apunte', apunte.id).some(
    (comentario) => comentario.autor_id !== ctx.vista.yo.id
      && (!hasta || String(comentario.creado_en || '') > hasta),
  );
}

// ------------------------------------------------------------- El apunte --

/**
 * Un apunte abierto, con sus tres verbos arriba.
 *
 * **Borrar vive en la cabecera y no dentro del formulario**, que es donde lo
 * pone el evento. La diferencia es a propósito: un evento tiene invitados,
 * regalos colgando y un hilo, y un apunte es una línea con una descripción cuyo
 * formulario son dos campos. Mandar a alguien a abrir un formulario para tirar
 * una línea es abrir un formulario para nada.
 */
export function abrirApunte(apunteId, ctx) {
  const apunte = (ctx.vista.datos.apuntes || []).find((a) => a.id === apunteId && estaActivo(a));
  if (!apunte) return;

  const lugar = lugarPorId(ctx.vista.datos, apunte.lugar_id);
  const votantes = votantesDe(ctx.vista.datos, apunte.id);
  const mio = votantes.includes(ctx.vista.yo.id);
  // La marca de lo visto se escribe al abrir, no al pintar el hilo: abrir la
  // hoja es la afirmación de haberlo mirado. La raya de «sin leer» sigue
  // dibujándose con el valor de antes, que es el que se venía a consultar.
  const vistoHasta = ctx.vista.vistoHasta('apunte', apunte.id);
  marcarVisto(ctx, 'apunte', apunte.id);

  abrirHoja(apunte.titulo, (cuerpo) => {
    cuerpo.append(el('p', {
      class: 'pista',
      texto: [
        lugar ? [lugar.emoji, lugar.nombre].filter(Boolean).join(' ') : null,
        clasePorId(apunte.clase).nombre,
        apunte.autor_id ? `lo apuntó ${ctx.vista.nombre(apunte.autor_id)}` : null,
      ].filter(Boolean).join(' · '),
    }));

    if (apunte.detalle) cuerpo.append(el('p', { texto: apunte.detalle }));

    // En la lista las iniciales son lo único que cabe; en la hoja hay sitio para
    // decirlo entero, y una hoja abierta es donde uno decide si se apunta.
    cuerpo.append(el('div', { class: 'voto-fila' }, [
      el('button', {
        class: 'voto', type: 'button',
        'data-mio': mio ? 'si' : null,
        'data-vacio': votantes.length ? null : 'si',
        'aria-label': mio ? 'Quitar mi voto' : 'Me apunto a esto',
        onclick: async () => {
          toque();
          await alternarVoto(ctx.vista.datos, apunte.id, ctx.vista.yo.id);
          ctx.refrescar();
          abrirApunte(apunte.id, ctx);
        },
      }, [
        el('span', { class: 'voto-pulgar', 'aria-hidden': 'true', texto: '👍' }),
        el('span', { texto: votantes.length ? votantes.map((id) => inicialesDe(ctx, id)).join('·') : '—' }),
      ]),
      el('span', { class: 'voto-dicho', texto: fraseDelVoto(ctx, votantes) }),
    ]));

    cuerpo.append(bloqueDeComentarios('apunte', apunte.id, ctx, { vistoHasta }));
  }, [
    botonIcono('editar', {
      etiqueta: 'Editar',
      onclick: () => abrirFormularioApunte(ctx, { id: apunte.id, lugarId: apunte.lugar_id }),
    }),
    botonIcono('compartir', {
      etiqueta: 'Compartir el apunte',
      tono: 'discreto',
      onclick: async () => {
        toque();
        // La hoja del sistema no dice qué lleva dentro, así que se dice antes:
        // es la primera vez que un comentario sale del círculo de casa, y nadie
        // tiene que descubrir después lo que acaba de enviar.
        avisar(pistaDeCompartirApunte(ctx.vista, apunte));
        const enviado = await compartir({
          titulo: apunte.titulo,
          texto: textoDelApunte(ctx.vista, apunte),
        });
        if (!enviado) avisar('No he podido compartirlo');
      },
    }),
    botonIcono('borrar', {
      etiqueta: 'Borrar el apunte',
      tono: 'peligro',
      onclick: async () => {
        await retirar('apunte', apunte.id);
        toque('media');
        cerrarHoja();
        avisar('Apunte borrado');
        ctx.refrescar();
      },
    }),
  ]);
}

/** «A Marta y a ti os apetece». Escrito, porque en la hoja cabe. */
function fraseDelVoto(ctx, votantes) {
  if (!votantes.length) return 'Nadie se ha apuntado todavía';
  const otros = votantes.filter((id) => id !== ctx.vista.yo.id).map((id) => ctx.vista.nombre(id));
  const yo = votantes.includes(ctx.vista.yo.id);

  if (!otros.length) return 'Te apetece a ti';
  const lista = otros.length === 1
    ? `A ${otros[0]}`
    : `A ${otros.slice(0, -1).join(', ')} y a ${otros[otros.length - 1]}`;
  return yo ? `${lista} y a ti os apetece` : `${lista} le${otros.length > 1 ? 's' : ''} apetece`;
}

// ---------------------------------------------------------- Formularios --

function abrirFormularioLugar(ctx, { id = null } = {}) {
  const lugar = id ? lugarPorId(ctx.vista.datos, id) : null;

  abrirHoja(lugar ? 'Editar el sitio' : 'Un sitio nuevo', (cuerpo) => {
    // Un solo campo, con el emoji dentro del nombre. Antes eran dos, y el de al
    // lado tenía un emoji de ejemplo por marcador: **un marcador con emoji se ve
    // exactamente igual que un valor**, porque el color de un glifo de emoji se
    // lo pone la fuente y el gris del CSS no le llega. El campo parecía relleno,
    // se guardaba vacío, y el sitio salía sin emoji sin que nada lo dijera.
    //
    // Y de paso es el trato que ya tienen los eventos —«para otro emoji, empieza
    // el título con él»—, así que deja de haber dos maneras de hacer lo mismo.
    //
    // El redondel de al lado no es un segundo campo: es una vista previa que
    // refleja en vivo lo que `partirEmoji` va a separar al guardar. Vacío de
    // verdad hasta que hay algo —nunca con un emoji de muestra dentro—, que es
    // la misma frontera que ya mató a los dos campos.
    const nombre = entrada({
      value: nombreDeLugar(lugar) || '',
      placeholder: 'Bolonia',
    });

    const glifo = el('span', { class: 'emoji-hueco-glifo' });
    const destello = el('button', {
      class: 'emoji-hueco-destello', type: 'button', hidden: true,
      'aria-label': 'Que la IA sugiera un emoji',
      onclick: () => { toque(); destello.hidden = true; carrusel.abrir(); },
    }, [icono('destello')]);
    const redondel = el('span', { class: 'emoji-hueco', 'aria-hidden': 'true' }, [glifo, destello]);

    const carrusel = carruselDePropuestas({
      pedir: ({ mas, yaDichas }) => {
        if (mas) toque();
        const base = partirEmoji(nombre.value.trim()).resto || nombre.value.trim();
        return sugerirEmojiDeSitio(base, { descartados: yaDichas });
      },
      pintar: (emoji) => [el('span', { class: 'propuesta-emoji', texto: emoji })],
      clave: (emoji) => emoji,
      verbo: {
        texto: 'Ponerlo',
        hacer: (emoji) => {
          toque();
          const partido = partirEmoji(nombre.value.trim());
          nombre.value = [emoji, partido.resto].filter(Boolean).join(' ');
          actualizarRedondel();
          carrusel.cerrar();
        },
      },
    });

    function actualizarRedondel() {
      const partido = partirEmoji(nombre.value.trim());
      glifo.textContent = partido.emoji ? emojiVisible(partido.emoji) : '';
      // Escondido sin nada que sugerir, y escondido también una vez pedido: el
      // carrusel abierto ya ofrece «Otras cinco», y es lo mismo que ya hace el
      // destello de Regalos.
      destello.hidden = !nombre.value.trim() || carrusel.hay();
    }
    nombre.addEventListener('input', actualizarRedondel);
    actualizarRedondel();

    cuerpo.append(el('div', { class: 'fila-nombre-swatch' }, [
      redondel,
      campo(
        'Nombre', nombre,
        'Empiézalo por un emoji y será lo que lo distinga de un vistazo en la lista.',
      ),
    ]));
    cuerpo.append(carrusel.nodo);

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          const texto = nombre.value.trim();
          if (!texto) { avisar('Ponle un nombre'); return; }
          // Se parte al guardar: la columna sigue significando lo que decía, y
          // lo que se teclea —y lo que refleja el redondel— es una sola cosa.
          const partido = partirEmoji(texto);
          const nuevo = id || nuevoId();
          await guardar('lugar', nuevo, {
            nombre: partido.emoji ? partido.resto : texto,
            emoji: partido.emoji,
            autor_id: lugar?.autor_id || ctx.vista.yo.id,
            activo: 1,
          });
          toque('media');
          cerrarHoja();
          // Un sitio recién creado se abre: lo que uno quiere después de
          // nombrarlo es apuntar la primera cosa, y ese es el sitio donde
          // las filas de escribir ya están esperando.
          if (!id) lugarAbierto = nuevo;
          ctx.refrescar();
        },
      }, [id ? 'Guardar' : 'Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

function abrirFormularioApunte(ctx, {
  id = null, lugarId = null, claseInicial = null, tituloInicial = '',
} = {}) {
  const apunte = id ? (ctx.vista.datos.apuntes || []).find((a) => a.id === id) : null;
  const destino = lugarId || apunte?.lugar_id;
  if (!destino) return;

  abrirHoja(apunte ? 'Editar el apunte' : 'Apuntar algo', (cuerpo) => {
    // La fila de escribir de una sección ya sabe su clase, y el lápiz que
    // entrega lo escrito la trae puesta: no tiene sentido pedirla dos veces.
    let clase = apunte?.clase || claseInicial || CLASE_POR_DEFECTO;

    const titulo = entrada({ value: apunte?.titulo || tituloInicial || '', placeholder: 'Sombrilla' });
    const detalle = el('textarea', { rows: '3', placeholder: 'Allí no hay ni una sombra' });
    detalle.value = apunte?.detalle || '';

    // Las mismas pastillas con las que se elige gente, y por la misma razón:
    // cuatro palabras cortas y excluyentes caben a la vista, y un desplegable
    // cuesta dos toques y una lista para elegir entre ellas.
    const conmutador = el('div', { class: 'opciones' }, CLASES.map((opcion) =>
      el('button', {
        class: 'opcion', type: 'button',
        'aria-pressed': opcion.id === clase ? 'true' : 'false',
        onclick: (evento) => {
          clase = opcion.id;
          for (const otro of evento.currentTarget.parentElement.children) {
            otro.setAttribute('aria-pressed', 'false');
          }
          evento.currentTarget.setAttribute('aria-pressed', 'true');
          ajustarADondeVa();
        },
      }, [opcion.nombre])));

    const campoDetalle = campo(
      'Más detalle', detalle,
      'Opcional, y es lo que de verdad vale: por qué, cuándo o qué hay que saber.',
    );

    // Una lista de la compra es un campo y ya está. Enseñar un hueco para la
    // descripción de «sombrilla» invita a rellenarlo, y lo que se apunta de pie
    // y con prisa no lleva descripción.
    const ajustarADondeVa = () => { campoDetalle.hidden = esLista(clase); };

    cuerpo.append(campo('Qué', titulo));
    cuerpo.append(campo('De qué va', conmutador));
    cuerpo.append(campoDetalle);
    ajustarADondeVa();

    // El verbo del modelo vive aquí y no en la pantalla del sitio: es una acción
    // de tres veces al año, y ahí arriba competiría con lo que se viene a leer.
    // Este es el único momento en que uno ya está pensando justo esto.
    if (!apunte && redaccionDisponible(ctx.vista.datos)) {
      cuerpo.append(bloqueDeIdeas(ctx, destino, () => clase, (propuesta) => {
        titulo.value = propuesta.que;
        // El porqué se guarda como el detalle, que es lo que separa una lista de
        // obviedades de algo que aporta: «crema solar» no vale nada; «allí el
        // viento engaña» es la razón por la que este módulo existe.
        if (propuesta.porque && !esLista(clase)) detalle.value = propuesta.porque;
        titulo.focus();
      }));
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          const texto = titulo.value.trim();
          if (!texto) { avisar('Escribe qué es'); return; }
          await guardar('apunte', id || nuevoId(), {
            lugar_id: destino,
            clase,
            titulo: texto,
            // Si acaba en una lista, lo que hubiera escrito en la descripción no
            // se guarda: allí no hay dónde leerlo, y un dato que no se ve es un
            // dato que miente.
            detalle: esLista(clase) ? null : (detalle.value.trim() || null),
            autor_id: apunte?.autor_id || ctx.vista.yo.id,
            activo: 1,
          });
          toque('media');
          cerrarHoja();
          ctx.refrescar();
        },
      }, [apunte ? 'Guardar' : 'Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

/**
 * Borrar un sitio exige vaciarlo antes, y el verbo no se esconde ni se
 * desactiva: dice qué falta.
 *
 * Un botón apagado sin explicación es la manera segura de que alguien crea que
 * la aplicación está rota. Y el Worker comprueba lo mismo, porque esta pantalla
 * decide con la instantánea que tenga: si otra persona ha apuntado algo desde
 * entonces, este dispositivo cree que el sitio está vacío y no lo está.
 */
async function borrarLugar(lugar, ctx) {
  const cuantos = cuantosApuntes(ctx.vista.datos, lugar.id);
  if (cuantos) {
    abrirHoja('No se puede borrar todavía', (cuerpo) => {
      cuerpo.append(el('p', {
        texto: `«${lugar.nombre}» tiene ${cuantos === 1 ? '1 apunte' : `${cuantos} apuntes`}.`
          + ' Bórralos antes de borrar el sitio.',
      }));
      cuerpo.append(el('div', { class: 'acciones' }, [
        el('button', { class: 'boton crecer', type: 'button', onclick: cerrarHoja }, ['Entendido']),
      ]));
    });
    return;
  }

  await retirar('lugar', lugar.id);
  toque('media');
  lugarAbierto = null;
  avisar('Sitio borrado');
  ctx.refrescar();
}

/**
 * La pastilla de cinco propuestas, con la misma pieza que ya se pasan el regalo
 * y la felicitación.
 *
 * Se apunta de una en una. Un botón de «apuntar las cinco» sería un toque más
 * cómodo y llenaría el sitio de cosas que nadie ha leído: la guía valdría
 * exactamente lo que valen las notas que nadie escribió.
 */
function bloqueDeIdeas(ctx, lugarId, claseActual, alUsar) {
  const carrusel = carruselDePropuestas({
    pedir: ({ mas, yaDichas }) => {
      if (mas) toque();
      return apuntarEnSitio(lugarId, { clase: claseActual(), descartadas: yaDichas });
    },
    pintar: (propuesta) => [
      el('p', { class: 'propuesta-que', texto: propuesta.que }),
      propuesta.porque ? el('p', { class: 'propuesta-porque', texto: propuesta.porque }) : null,
    ],
    clave: (propuesta) => propuesta.que,
    verbo: { texto: 'Ponerla', hacer: (propuesta) => alUsar(propuesta) },
  });

  const lugar = lugarPorId(ctx.vista.datos, lugarId);
  const pedir = el('button', {
    class: 'boton', 'data-tono': 'discreto', 'data-con-icono': true, type: 'button',
    onclick: () => { toque(); pedir.hidden = true; carrusel.abrir(); },
  }, [icono('destello'), `¿Ideas para ${lugar?.nombre || 'este sitio'}?`]);

  return el('div', { class: 'grupo' }, [pedir, carrusel.nodo]);
}
