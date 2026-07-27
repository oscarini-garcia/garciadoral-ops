/**
 * El hilo de comentarios de cualquier cosa.
 *
 * Vive aquí y no dentro de una vista porque lo usan hojas que están en módulos
 * distintos —el detalle de un evento, el cumpleaños de una persona, la idea, el
 * regalo y el apunte de un sitio— y la agenda ya importa de Regalos. Dejarlo en
 * la agenda obligaba a que Regalos importara de vuelta, y dos módulos que se
 * importan el uno al otro funcionan hasta el día que dejan de hacerlo por el
 * orden en que se cargan.
 *
 * **Qué tipos admiten hilo no se decide aquí.** La lista vive en
 * `api/src/comentables.js`, con su espejo en `scripts/agenda/modelo.py`; esta
 * pieza recibe el tipo y el identificador y no tiene opinión sobre ellos. Lo que
 * sí sabe es que cualquiera de esos hilos se lee igual, y por eso hay una sola.
 *
 * **La raya de «sin leer» la dibuja quien abre el hilo, no el hilo.** Se le pasa
 * `vistoHasta` —la marca de `visto` para este objeto y esta persona— y con eso
 * se decide dónde va. No se escribe la marca desde aquí: escribirla es decir
 * «he mirado esto», que es una afirmación sobre la hoja entera y no sobre su
 * bloque de comentarios (`avisos.js`).
 *
 * **Y es un extra, así que se dibuja como tal.** Era una sección más de la hoja
 * —rótulo en versalitas, cada comentario en dos renglones con su barra al
 * margen, y un campo con su botón de Enviar— y pesaba lo mismo hubiera
 * conversación o no: 87 de los 331 puntos del detalle de un evento en el que
 * nadie había comentado nunca, un 26 % de la pantalla para algo que no existía.
 * Ahora baja de tono en lugar de esconderse: sin rótulo, cada comentario en un
 * renglón corrido y en gris, y el campo sin caja. **Lo que no se hizo fue
 * guardarlo detrás de un plegable**, que ocupaba menos todavía: un comentario
 * existe para que otro lo lea, y quien abre la hoja para ver a qué hora es el
 * entreno no va a desplegar nada por si acaso. Las cuatro formas que se
 * estudiaron, con sus medidas, están en `specs/prototipo-comentarios.html`.
 */

import { el, entrada, avisar, botonIcono } from './ui.js';
import { guardar, retirar } from './sincronizacion.js';
import { nuevoId } from './modelo.js';
import { formatearHace, parsearMomento } from './semana.js';

/**
 * El bloque entero: los que hay, la raya de por dónde iba y el campo de
 * escribir.
 *
 * `vistoHasta` es opcional y llega como texto ISO. Sin él, todo lo ajeno cuenta
 * como sin leer: es un hilo en el que uno no ha entrado nunca.
 */
export function bloqueDeComentarios(tipo, id, ctx, { vistoHasta = null } = {}) {
  const comentarios = ctx.vista.comentariosDe(tipo, id);
  const corte = parsearMomento(vistoHasta);

  // Dónde parte la raya: el primero que llegó después de la última vez que se
  // miró y que además no escribió uno mismo, porque lo propio nunca está sin
  // leer. Sin nada nuevo, `-1`, y entonces no se dibuja.
  //
  // Sin marca ninguna —un hilo en el que uno no ha entrado nunca— cuenta todo lo
  // ajeno como sin leer, que es la misma cuenta que hace el punto de la lista.
  // Si aquí se exigiera marca previa, el punto diría que hay algo y la hoja no
  // enseñaría dónde.
  const primeroSinLeer = comentarios.findIndex((comentario) => {
    if (comentario.autor_id === ctx.vista.yo.id) return false;
    const cuando = parsearMomento(comentario.creado_en);
    return cuando && (!corte || cuando > corte);
  });

  const lista = el('div', { class: 'comentarios' }, comentarios.flatMap((comentario, indice) => [
    indice === primeroSinLeer
      ? el('p', { class: 'raya-sin-leer', texto: 'Sin leer' })
      : null,
    filaDeComentario(comentario, ctx),
  ]));

  // El hilo vacío no se explica: lo que dice para qué sirve es el propio campo,
  // y una línea de «nadie ha dicho nada todavía» costaba cuarenta puntos por
  // decir lo mismo que el hueco ya decía.
  const control = entrada({
    class: 'comentario-campo',
    placeholder: comentarios.length ? 'Responder…' : 'Escribe un comentario…',
    'aria-label': 'Nuevo comentario',
  });

  // El botón no está hasta que hay algo que enviar: con el campo vacío no tiene
  // nada que hacer y era la mitad del peso del bloque. En cuanto se escribe una
  // letra aparece, que es cuando se le busca.
  const boton = el('button', { class: 'boton-mini', type: 'button', hidden: true }, ['Enviar']);

  const bloque = el('div', { class: 'grupo comentarios-bloque' }, [
    comentarios.length ? lista : null,
    el('div', { class: 'comentario-nuevo' }, [control, boton]),
  ]);

  const enviar = async () => {
    const texto = control.value.trim();
    if (!texto) return;
    control.value = '';
    boton.hidden = true;
    await guardar('comentario', nuevoId(), {
      objeto_tipo: tipo, objeto_id: id, autor_id: ctx.vista.yo.id, texto, activo: 1,
    });
    // Primero la pantalla de detrás, que es la que rehace `ctx.vista` a partir
    // del almacén; y con esa vista ya al día, este bloque se cambia por uno
    // nuevo, que trae el comentario recién escrito. Sin esto, quien acababa de
    // comentar veía el campo vaciarse y nada más: `ctx.refrescar()` repinta la
    // pantalla, no la hoja abierta, y el comentario no aparecía hasta cerrarla
    // y volver a entrar.
    ctx.refrescar();
    bloque.replaceWith(bloqueDeComentarios(tipo, id, ctx, { vistoHasta }));
    avisar('Comentario añadido');
  };

  boton.addEventListener('click', enviar);
  control.addEventListener('input', () => { boton.hidden = !control.value.trim(); });
  control.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') enviar(); });

  return bloque;
}

/**
 * Un comentario, en un renglón, con su verbo si es propio.
 *
 * Nombre, texto y cuándo, de corrido: el nombre en tinta plena, que es lo que
 * permite saltar de uno a otro sin leerlos enteros, y el resto en el gris de lo
 * secundario. Iban en dos renglones —la ficha del autor arriba y el texto
 * debajo— y eso doblaba el alto de una conversación que casi siempre son frases
 * de una línea.
 *
 * **Lo nuevo no se tiñe.** La raya de «sin leer» ya dice dónde empieza lo que
 * falta por leer, y todo lo que va debajo lo es por estar debajo; marcar además
 * cada uno era decirlo dos veces.
 *
 * Borrar solo aparece sobre lo que uno escribió, que es además la única regla
 * que el Worker aplica sobre esta tabla (`repositorio.js`). No se pregunta
 * antes: es una línea de texto que se puede volver a escribir, y una hoja de
 * confirmación para eso cuesta más que el error que evita.
 */
function filaDeComentario(comentario, ctx) {
  const mio = comentario.autor_id === ctx.vista.yo.id;
  return el('div', { class: 'comentario' }, [
    el('p', { class: 'comentario-texto' }, [
      el('b', { texto: ctx.vista.nombre(comentario.autor_id) }),
      ' ',
      comentario.texto,
      ' ',
      el('span', { class: 'comentario-cuando', texto: formatearHace(comentario.creado_en) }),
    ]),
    mio ? botonIcono('borrar', {
      etiqueta: 'Borrar mi comentario',
      tono: 'peligro',
      onclick: async () => {
        await retirar('comentario', comentario.id);
        ctx.refrescar();
        avisar('Comentario borrado');
      },
    }) : null,
  ]);
}
