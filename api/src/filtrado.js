/**
 * Composición del conjunto que se transmite a un dispositivo.
 *
 * El filtrado se produce **antes de la transmisión**, nunca en la presentación
 * (specs/modelo-datos.md §7.3). Cada dispositivo recibe una instantánea completa
 * de lo que su titular puede ver; sustituir el almacén local por ella resuelve
 * de paso la retirada retroactiva descrita en la rama inferior de ese diagrama:
 * cuando alguien pasa a ser destinatario de un elemento que ya tenía
 * sincronizado, la siguiente conexión sencillamente no lo trae.
 *
 * El volumen de un hogar —unos cientos de filas— hace que la instantánea
 * completa sea preferible a un delta: es más simple y no deja huecos por los que
 * un elemento retirado sobreviva en un dispositivo.
 */

import { visible } from './visibilidad.js';

/** Categorías que el observador puede ver. Las que no, no existen para él.
 *  No se muestra un contenedor bloqueado: la existencia misma de la categoría
 *  es información (spec funcional §3.1). */
function categoriasVisibles(registro, observador) {
  return registro.categorias.filter((categoria) => {
    if (categoria.regla === 'publica') return true;
    if (categoria.regla === 'privada') return observador.rol === 'administrador';
    return (registro.acceso_categoria || []).some(
      (a) => a.categoria_id === categoria.id && a.persona_id === observador.id,
    );
  });
}

export function componerInstantanea(registro, observador) {
  const esAdministrador = observador.rol === 'administrador';

  const eventos = registro.eventos.filter((e) => visible(registro, e, 'evento', observador));
  const ideas = registro.ideas.filter((i) => visible(registro, i, 'idea', observador));
  const regalos = registro.regalos.filter((r) => visible(registro, r, 'regalo', observador));

  const idsEventos = new Set(eventos.map((e) => e.id));
  const idsIdeas = new Set(ideas.map((i) => i.id));
  const idsRegalos = new Set(regalos.map((r) => r.id));

  // Los comentarios heredan la visibilidad del objeto al que pertenecen.
  const comentarios = registro.comentarios.filter((c) => {
    if (c.objeto_tipo === 'evento') return idsEventos.has(c.objeto_id);
    if (c.objeto_tipo === 'idea') return idsIdeas.has(c.objeto_id);
    if (c.objeto_tipo === 'regalo') return idsRegalos.has(c.objeto_id);
    return false;
  });

  // Las ocasiones son contenedores y se transmiten enteras; lo que se recorta
  // son sus regalos. El presupuesto queda reservado a los administradores
  // (spec funcional §6.3), así que ni siquiera viaja al resto de dispositivos.
  const ocasiones = registro.ocasiones.map((ocasion) => ({
    ...ocasion,
    presupuestos: esAdministrador ? ocasion.presupuestos : [],
  }));

  return {
    generado_en: new Date().toISOString(),
    yo: {
      id: observador.id,
      nombre: observador.nombre,
      rol: observador.rol,
      es_administrador: esAdministrador,
    },
    personas: registro.personas,
    atributos_persona: registro.atributos_persona,
    categorias: categoriasVisibles(registro, observador),
    etiquetas: registro.etiquetas,
    tipos_evento: registro.tipos_evento,
    emojis_permitidos: registro.emojis_permitidos,
    eventos,
    ideas,
    ocasiones,
    regalos,
    comentarios,
    // Los conflictos de coordinación solo interesan a quien coordina.
    conflictos: esAdministrador ? registro.conflictos || [] : [],
    // El recuento de quien espera en la puerta, solo para quien puede abrirla.
    //
    // La regla de §9 de la especificación funcional prohíbe que un aviso se
    // genere a partir de un recuento recibido del servidor, pero aquello
    // hablaba de los regalos ocultos al destinatario, donde el número *es* el
    // dato que se pretende ocultar. Aquí quien lo recibe es el administrador, y
    // no hay nada que ocultarle sobre las solicitudes.
    solicitudes_pendientes: esAdministrador ? registro.solicitudes_pendientes || 0 : 0,
  };
}
