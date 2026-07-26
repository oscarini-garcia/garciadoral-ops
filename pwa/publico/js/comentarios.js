/**
 * El hilo de comentarios de cualquier cosa.
 *
 * Vive aquí y no dentro de una vista porque lo usan dos hojas que están en
 * módulos distintos —el detalle de un evento y el cumpleaños de una persona— y
 * la agenda ya importa de Regalos. Dejarlo en la agenda obligaba a que Regalos
 * importara de vuelta, y dos módulos que se importan el uno al otro funcionan
 * hasta el día que dejan de hacerlo por el orden en que se cargan.
 */

import { el, entrada, avisar } from './ui.js';
import { guardar } from './sincronizacion.js';
import { nuevoId } from './modelo.js';

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
