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

  const lista = el('div', { class: 'lista' }, comentarios.flatMap((comentario, indice) => [
    indice === primeroSinLeer
      ? el('p', { class: 'raya-sin-leer', texto: 'Sin leer' })
      : null,
    filaDeComentario(comentario, ctx, indice >= primeroSinLeer && primeroSinLeer !== -1),
  ]));

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
    // Un hilo vacío dice para qué sirve, en vez de enseñar un hueco. Es la única
    // vez que se puede explicar algo sin estorbar: después ya no vuelve a salir.
    comentarios.length
      ? lista
      : el('p', { class: 'vacio', texto: 'Nadie ha dicho nada todavía.' }),
    el('div', { class: 'acciones' }, [
      el('div', { class: 'campo crecer' }, [control]),
      el('button', { class: 'boton', type: 'button', onclick: enviar }, ['Enviar']),
    ]),
  ]);
}

/**
 * Un comentario, con su verbo si es propio.
 *
 * Borrar solo aparece sobre lo que uno escribió, que es además la única regla
 * que el Worker aplica sobre esta tabla (`repositorio.js`). No se pregunta
 * antes: es una línea de texto que se puede volver a escribir, y una hoja de
 * confirmación para eso cuesta más que el error que evita.
 */
function filaDeComentario(comentario, ctx, nuevo) {
  const mio = comentario.autor_id === ctx.vista.yo.id;
  return el('div', { class: 'comentario', 'data-nuevo': nuevo ? 'si' : null }, [
    el('div', { class: 'comentario-cabeza' }, [
      el('p', {
        class: 'comentario-meta',
        texto: `${ctx.vista.nombre(comentario.autor_id)} · ${formatearHace(comentario.creado_en)}`,
      }),
      mio ? botonIcono('borrar', {
        etiqueta: 'Borrar mi comentario',
        tono: 'peligro',
        onclick: async () => {
          await retirar('comentario', comentario.id);
          ctx.refrescar();
          avisar('Comentario borrado');
        },
      }) : null,
    ]),
    el('p', { texto: comentario.texto }),
  ]);
}
