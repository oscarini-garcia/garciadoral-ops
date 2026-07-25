/**
 * Búsqueda global sobre Ideas y Ocasiones, que es el alcance de la primera
 * versión (spec funcional §3.5).
 *
 * No hace falta volver a evaluar la visibilidad: lo que hay en el almacén local
 * ya pasó por ella en el servidor. Buscar sobre lo que se tiene es, por
 * construcción, buscar solo sobre lo visible; y los recuentos que se muestran
 * salen de ese mismo conjunto, de modo que ninguno puede delatar un elemento
 * excluido.
 */

import { el, vaciar, entrada } from '../ui.js';
import { formatearImporte } from '../modelo.js';
import { abrirDetalleIdea, abrirDetalleRegalo, abrirOcasion } from './regalos.js';

let consulta = '';

export function reiniciarBusqueda() {
  consulta = '';
}

const normalizar = (texto) =>
  String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function pintarBuscar(pantalla, subcabecera, ctx) {
  vaciar(subcabecera);
  vaciar(pantalla);

  const control = entrada({
    type: 'search',
    value: consulta,
    placeholder: 'Buscar entre ideas y campañas',
    'aria-label': 'Buscar',
  });
  const resultados = el('div', {});

  const buscar = () => {
    consulta = control.value;
    vaciar(resultados);
    resultados.append(componerResultados(ctx, consulta));
  };
  control.addEventListener('input', buscar);

  pantalla.append(el('div', { class: 'campo' }, [control]), resultados);
  buscar();
  if (!('ontouchstart' in window)) control.focus();
}

function componerResultados(ctx, texto) {
  const aguja = normalizar(texto).trim();
  if (aguja.length < 2) {
    return el('p', { class: 'vacio', texto: 'Escribe al menos dos letras.' });
  }

  const coincide = (...partes) => partes.some((parte) => normalizar(parte).includes(aguja));

  const ideas = (ctx.vista.datos.ideas || []).filter(
    (idea) => idea.activa !== false && coincide(idea.titulo, idea.descripcion, idea.establecimiento),
  );

  const ocasiones = (ctx.vista.datos.ocasiones || []).filter(
    (ocasion) => ocasion.activa !== false && coincide(ocasion.nombre),
  );

  const regalos = (ctx.vista.datos.regalos || []).filter((regalo) => {
    if (regalo.activo === false) return false;
    const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
    return coincide(idea?.titulo, ctx.vista.nombre(regalo.destinatario_principal_id));
  });

  const total = ideas.length + ocasiones.length + regalos.length;
  if (!total) return el('p', { class: 'vacio', texto: 'Nada con ese nombre.' });

  const contenedor = el('div', {});

  if (ideas.length) {
    contenedor.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: `Ideas (${ideas.length})` }),
      ...ideas.map((idea) => el('button', {
        class: 'tarjeta', type: 'button', onclick: () => abrirDetalleIdea(idea.id, ctx),
      }, [
        el('h3', { texto: idea.titulo }),
        el('p', { texto: [idea.tipo === 'deseo' ? 'deseo' : 'idea', ctx.vista.categoria(idea.categoria_id)?.nombre, idea.estado].filter(Boolean).join(' · ') }),
      ])),
    ]));
  }

  if (ocasiones.length) {
    contenedor.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: `Campañas (${ocasiones.length})` }),
      ...ocasiones.map((ocasion) => el('button', {
        class: 'tarjeta', type: 'button', onclick: () => abrirOcasion(ocasion.id, ctx),
      }, [
        el('h3', { texto: ocasion.nombre }),
        el('p', { texto: `${ocasion.fecha} · ${ocasion.estado}` }),
      ])),
    ]));
  }

  if (regalos.length) {
    contenedor.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: `Regalos (${regalos.length})` }),
      ...regalos.map((regalo) => {
        const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
        return el('button', {
          class: 'tarjeta', type: 'button', onclick: () => abrirDetalleRegalo(regalo.id, ctx),
        }, [
          el('h3', { texto: idea?.titulo || 'Regalo' }),
          el('p', {
            texto: [
              `para ${ctx.vista.nombre(regalo.destinatario_principal_id)}`,
              regalo.estado,
              typeof regalo.coste_real === 'number' ? formatearImporte(regalo.coste_real) : null,
            ].filter(Boolean).join(' · '),
          }),
        ]);
      }),
    ]));
  }

  return contenedor;
}
