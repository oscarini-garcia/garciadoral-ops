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
 * La forma y el porqué de todo esto están en `specs/propuesta-sitios.html`.
 */

import {
  abrirHoja, avisar, botonIcono, campo, carruselDePropuestas, cerrarHoja, el, entrada, icono,
  vaciar,
} from '../ui.js';
import { apuntarEnSitio, guardar, retirar } from '../sincronizacion.js';
import { estaActivo, nuevoId, redaccionDisponible } from '../modelo.js';
import { compartir, toque } from '../native.js';
import { bloqueDeComentarios } from '../comentarios.js';
import { marcarVisto } from '../avisos.js';
import {
  CLASES, CLASE_POR_DEFECTO, alternarVoto, apuntesDe, clasePorId, cuantosApuntes,
  haySitios, lugarPorId, lugaresDe, pistaDeCompartirApunte, porClase, textoDelApunte,
  textoDelLugar, votantesDe,
} from '../sitios.js';

/** El sitio que se está mirando, o `null` si se está en la lista. Vive aquí y
 *  no en la instantánea: es dónde está uno, no un dato del hogar. */
let lugarAbierto = null;

export function reiniciarSitios() {
  lugarAbierto = null;
}

/**
 * El título de la pestaña, que cambia con la altura en la que se esté.
 *
 * Dentro de un sitio, su nombre: es lo que sitúa todo lo que hay debajo, y
 * escribir «Sitios» arriba con «Bolonia» repetido dentro gastaría la línea que
 * mejor se lee para no decir nada.
 */
export function tituloDeSitios(ctx) {
  const lugar = lugarAbierto ? lugarPorId(ctx?.vista?.datos, lugarAbierto) : null;
  if (!lugar) return 'Sitios';
  return [lugar.emoji, lugar.nombre].filter(Boolean).join(' ');
}

/** Lo que hace el botón flotante, que depende de la altura. */
export function nuevoDesdeSitios(ctx) {
  if (lugarAbierto) return abrirFormularioApunte(ctx, { lugarId: lugarAbierto });
  return abrirFormularioLugar(ctx);
}

export function pintarSitios(pantalla, subcabecera, ctx) {
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
    const cuantos = cuantosApuntes(ctx.vista.datos, lugar.id);
    const sinLeer = apuntesDe(ctx.vista.datos, lugar.id)
      .filter((apunte) => tieneSinLeer(ctx, apunte)).length;

    return el('button', {
      class: 'tarjeta', type: 'button',
      onclick: () => { lugarAbierto = lugar.id; ctx.refrescar(); },
    }, [
      el('div', { class: 'tarjeta-fila' }, [
        el('h3', { texto: [lugar.emoji, lugar.nombre].filter(Boolean).join(' ') }),
        // La marca en contexto, que es lo que sustituye a una lista de
        // novedades: el sobre cuenta que hay algo y aquí se ve dónde.
        sinLeer ? el('span', { class: 'punto-nuevo', 'aria-label': 'Con comentarios sin leer' }) : null,
      ]),
      el('p', { texto: cuantos === 1 ? '1 apunte' : `${cuantos} apuntes` }),
    ]);
  })));
}

// --------------------------------------------------------- Un sitio dentro --

function pintarUnLugar(pantalla, subcabecera, ctx) {
  const lugar = lugarPorId(ctx.vista.datos, lugarAbierto);

  // La salida va arriba y a la izquierda, que es donde se busca: dentro de una
  // pestaña no hay flecha del sistema que devuelva a ninguna parte.
  subcabecera.append(el('button', {
    class: 'volver', type: 'button',
    onclick: () => { lugarAbierto = null; ctx.refrescar(); },
  }, ['‹ Sitios']));

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
  if (!grupos.length) {
    pantalla.append(el('p', {
      class: 'vacio',
      texto: 'Todavía no hay nada apuntado aquí. Toca el «+».',
    }));
    return;
  }

  for (const { clase, apuntes } of grupos) {
    pantalla.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: clase.nombre }),
      el('div', {}, apuntes.map((apunte) => filaDeApunte(apunte, ctx))),
    ]));
  }
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
    const nombre = entrada({ value: lugar?.nombre || '', placeholder: 'Bolonia' });
    const emoji = entrada({ value: lugar?.emoji || '', placeholder: '🏖', maxlength: '4' });

    cuerpo.append(campo('Nombre', nombre));
    cuerpo.append(campo('Emoji', emoji, 'Opcional. Es lo que hace que se reconozca de un vistazo en la lista.'));

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          const texto = nombre.value.trim();
          if (!texto) { avisar('Ponle un nombre'); return; }
          const nuevo = id || nuevoId();
          await guardar('lugar', nuevo, {
            nombre: texto,
            emoji: emoji.value.trim() || null,
            autor_id: lugar?.autor_id || ctx.vista.yo.id,
            activo: 1,
          });
          toque('media');
          cerrarHoja();
          // Un sitio recién creado se abre: lo que uno quiere después de
          // nombrarlo es apuntar la primera cosa, y ese es el sitio donde
          // el «+» ya significa eso.
          if (!id) lugarAbierto = nuevo;
          ctx.refrescar();
        },
      }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

function abrirFormularioApunte(ctx, { id = null, lugarId = null } = {}) {
  const apunte = id ? (ctx.vista.datos.apuntes || []).find((a) => a.id === id) : null;
  const destino = lugarId || apunte?.lugar_id;
  if (!destino) return;

  abrirHoja(apunte ? 'Editar el apunte' : 'Apuntar algo', (cuerpo) => {
    let clase = apunte?.clase || CLASE_POR_DEFECTO;

    const titulo = entrada({ value: apunte?.titulo || '', placeholder: 'Sombrilla' });
    const detalle = el('textarea', { rows: '3', placeholder: 'Allí no hay ni una sombra' });
    detalle.value = apunte?.detalle || '';

    // Cuatro opciones cortas y excluyentes, a la vista y en una fila: es lo
    // mismo que hacen los estados de un regalo, y por lo mismo —un desplegable
    // cuesta dos toques y una lista para elegir entre cuatro palabras—.
    const conmutador = el('div', { class: 'seg' }, CLASES.map((opcion) =>
      el('button', {
        class: 'seg-opcion', type: 'button',
        'data-elegida': opcion.id === clase ? 'si' : null,
        onclick: (evento) => {
          clase = opcion.id;
          for (const otro of evento.currentTarget.parentElement.children) {
            otro.removeAttribute('data-elegida');
          }
          evento.currentTarget.setAttribute('data-elegida', 'si');
        },
      }, [opcion.nombre])));

    cuerpo.append(campo('Qué', titulo));
    cuerpo.append(campo('De qué va', conmutador));
    cuerpo.append(campo('Más detalle', detalle, 'Opcional, y es lo que de verdad vale: por qué, cuándo o qué hay que saber.'));

    // El verbo del modelo vive aquí y no en la pantalla del sitio: es una acción
    // de tres veces al año, y ahí arriba competiría con lo que se viene a leer.
    // Este es el único momento en que uno ya está pensando justo esto.
    if (!apunte && redaccionDisponible(ctx.vista.datos)) {
      cuerpo.append(bloqueDeIdeas(ctx, destino, () => clase, (propuesta) => {
        titulo.value = propuesta.que;
        // El porqué se guarda como el detalle, que es lo que separa una lista de
        // obviedades de algo que aporta: «crema solar» no vale nada; «allí el
        // viento engaña» es la razón por la que este módulo existe.
        if (propuesta.porque) detalle.value = propuesta.porque;
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
            detalle: detalle.value.trim() || null,
            autor_id: apunte?.autor_id || ctx.vista.yo.id,
            activo: 1,
          });
          toque('media');
          cerrarHoja();
          ctx.refrescar();
        },
      }, ['Guardar']),
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
