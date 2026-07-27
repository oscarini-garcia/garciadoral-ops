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
import { comentariosVisibles } from './comentables.js';
import { cuadroVacio, esDeLaCasa } from './lio.js';

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
  // Lío es de la casa. Para quien no vive en ella el módulo no existe: no
  // recibe el cuadro, ni los paseos, ni las propuestas, y su aplicación no
  // dibuja el carril porque no tiene con qué.
  const deLaCasa = esDeLaCasa(observador);

  const eventos = registro.eventos.filter((e) => visible(registro, e, 'evento', observador));
  const ideas = registro.ideas.filter((i) => visible(registro, i, 'idea', observador));
  const regalos = registro.regalos.filter((r) => visible(registro, r, 'regalo', observador));

  // Sitios es de la casa, como Lío, y por eso no se recorta elemento a elemento:
  // se transmite entero o no se transmite. De ahí sale que el módulo no tenga
  // que evaluar nunca la función de visibilidad, y que el voto pueda enseñar las
  // iniciales de quien votó sin que eso delate nada a nadie.
  const lugares = deLaCasa ? registro.lugares || [] : [];
  const apuntes = deLaCasa ? registro.apuntes || [] : [];
  const votos = deLaCasa ? registro.votos || [] : [];

  // Los comentarios heredan la visibilidad del objeto al que pertenecen, y qué
  // objetos la admiten está declarado en `comentables.js` y en ningún otro
  // sitio. Lo que aquí se compone es de qué identificadores se sabe ya que
  // viajan; lo que no aparezca en este mapa no transmite sus comentarios.
  const comentarios = comentariosVisibles(registro.comentarios, {
    evento: new Set(eventos.map((e) => e.id)),
    idea: new Set(ideas.map((i) => i.id)),
    regalo: new Set(regalos.map((r) => r.id)),
    apunte: new Set(apuntes.map((a) => a.id)),
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
    lugares,
    apuntes,
    votos,
    // Lo visto no se recorta por visibilidad sino por dueño: las filas de otra
    // persona no le dicen nada a esta, y mandarlas contaría además qué ha
    // mirado cada uno, que no es asunto de nadie.
    vistos: (registro.vistos || []).filter((v) => v.persona_id === observador.id),
    lio_cuadro: deLaCasa ? registro.lio_cuadro || cuadroVacio() : cuadroVacio(),
    paseos: deLaCasa ? registro.paseos || [] : [],
    // Las propuestas llegan enteras y no solo las dirigidas al lector: quien
    // pidió un cambio tiene que ver que sigue sin contestar, y el carril de la
    // semana marca el turno pedido para los dos.
    tratos_paseo: deLaCasa ? registro.tratos_paseo || [] : [],
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
