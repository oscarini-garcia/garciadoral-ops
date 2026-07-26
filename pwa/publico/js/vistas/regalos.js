/**
 * Regalos: las ideas y las ocasiones.
 *
 * Se unifican en una sola sección porque son el mismo objeto en dos momentos de
 * su vida: primero se apunta una idea y después se lleva a la ocasión en la que
 * se regala. Las dos secciones se llaman como las dos entidades del modelo
 * porque es lo que se viene a hacer aquí: o apuntar algo suelto, o mirar qué
 * falta para una fecha concreta (specs/ux.md §6).
 */

import {
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, avisar,
  acordeon, botonIcono, carruselDePropuestas, cerrarDeslizada, conVerbosAlDeslizar,
  dobleToque, icono,
} from '../ui.js';
import { felicitarCumple, guardar, retirar, sugerirRegalos } from '../sincronizacion.js';
import { campoDeGente, recordarElegidos } from '../gente.js';
import {
  ESTADOS_REGALO, deQuien, estaActivo, formatearImporte, nombreCompleto, normalizar,
  nuevoId, redaccionDisponible,
} from '../modelo.js';
import {
  MESES_LARGOS, aniosQueCumple, diasHastaElCumple, formatearFechaLarga, hoy, iso,
  parsearMomento, proximoAniversario,
} from '../semana.js';
import { abrirFicha, abrirFormularioPersona } from './familia.js';
import { bloqueDeComentarios } from '../comentarios.js';
import { copiar, toque } from '../native.js';

/** A partir de cuántas ideas el selector de regalos ofrece un buscador. Por
 *  debajo, el campo ocupa para no ahorrar nada: la lista entera cabe. */
const TOPE_SIN_BUSCADOR = 12;

let seccion = 'ideas';
let filtroPersona = null;

/**
 * Qué apartado de Ocasiones está plegado. Se conserva entre repintados porque la
 * pantalla se rehace en cada sincronización: sin esto, plegar los cumpleaños
 * duraría hasta que llegase la siguiente instantánea.
 */
let plegado = { senaladas: false, cumples: false };

export function reiniciarRegalos() {
  seccion = 'ideas';
  filtroPersona = null;
  plegado = { senaladas: false, cumples: false };
}

export function pintarRegalos(pantalla, subcabecera, ctx) {
  vaciar(subcabecera).append(
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Sección de regalos' }, [
      ...[['ideas', 'Ideas'], ['ocasiones', 'Ocasiones']].map(([clave, texto]) =>
        el('button', {
          type: 'button',
          'aria-pressed': seccion === clave ? 'true' : 'false',
          onclick: () => { seccion = clave; ctx.refrescar(); },
        }, [texto]),
      ),
    ]),
  );

  vaciar(pantalla);
  if (seccion === 'ideas') {
    // El cuerpo se estira hasta el final de la pantalla aunque haya tres ideas:
    // el hueco de debajo es donde se apunta la siguiente, y para eso tiene que
    // existir como sitio al que llegar con el dedo.
    pantalla.classList.add('pantalla-ideas');
    pantalla.append(vistaIdeas(ctx));
  } else {
    pantalla.append(vistaOcasiones(ctx));
  }
}

export const seccionActual = () => seccion;

// ----------------------------------------------------------------- Ideas --

function vistaIdeas(ctx) {
  const contenedor = el('div', { class: 'cuerpo-ideas' });

  // Solo quien tiene alguna idea apuntada. Filtrar por alguien que no tiene
  // ninguna únicamente puede dar una lista vacía, y con treinta personas la
  // parrilla de nombres ocupaba más que las propias ideas.
  //
  // Con una excepción: quien esté filtrado sigue estando aunque se quede sin
  // ideas. Si no, su pastilla desaparecería con el filtro puesto y la lista se
  // quedaría vacía sin nada en pantalla que dijera por qué ni cómo deshacerlo.
  const conIdeas = new Set(
    ctx.vista.banco().flatMap((idea) => (idea.orientaciones || []).map((o) => o.persona_id)),
  );
  const personas = ctx.vista.personas().filter((p) => conIdeas.has(p.id) || p.id === filtroPersona);

  contenedor.append(el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Para quién' }),
    el('div', { class: 'opciones' }, [
      el('button', {
        class: 'opcion', type: 'button', 'aria-pressed': filtroPersona ? 'false' : 'true',
        onclick: () => { filtroPersona = null; ctx.refrescar(); },
      }, ['Todo']),
      ...personas.map((persona) => el('button', {
        class: 'opcion', type: 'button', 'aria-pressed': filtroPersona === persona.id ? 'true' : 'false',
        onclick: () => { filtroPersona = filtroPersona === persona.id ? null : persona.id; ctx.refrescar(); },
      }, [persona.nombre])),
    ]),
  ]));

  let ideas = ctx.vista.banco();
  if (filtroPersona) {
    ideas = ideas.filter((idea) => (idea.orientaciones || []).some((o) => o.persona_id === filtroPersona));
  }

  const grupo = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'}` }),
  ]);

  if (!ideas.length) {
    grupo.append(el('p', { class: 'vacio', texto: 'Nada por aquí todavía. Dos toques en el hueco apuntan una idea en diez segundos.' }));
  }
  for (const idea of ideas) grupo.append(tarjetaDeIdea(idea, ctx));

  contenedor.append(grupo);

  /**
   * Lo que uno se apunta para sí mismo, al final y en su propio grupo.
   *
   * Una idea cuyo único destinatario es quien la escribe se guarda como deseo
   * —si no, la ocultación la haría desaparecer en el acto—, y los deseos no
   * están en el banco: el banco es lo que se le regala a otros. El resultado
   * era que apuntarse algo desde aquí parecía no guardarlo. Sigue sin
   * mezclarse con lo demás, pero se ve donde se escribió.
   */
  const mios = ctx.vista.deseosDe(ctx.vista.yo.id);
  if (mios.length && (!filtroPersona || filtroPersona === ctx.vista.yo.id)) {
    contenedor.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: 'Lo que pides tú' }),
      ...mios.map((idea) => tarjetaDeIdea(idea, ctx)),
      el('p', {
        class: 'pista',
        texto: 'Esto lo ve tu familia en tu ficha. Si alguien te lo acaba regalando no te enterarás por aquí: eso se coordina sin ti.',
      }),
    ]));
  }

  // La misma regla que en la agenda: doblar el toque sobre lo que está en
  // blanco crea ahí. Si hay un filtro de persona puesto, la idea nace ya para
  // esa persona, que es lo que se estaba mirando.
  contenedor.append(dobleToque(
    el('div', { class: 'zona-libre', 'aria-hidden': 'true' }),
    () => { toque(); abrirFormularioIdea(ctx, { paraPersona: filtroPersona }); },
  ));

  return contenedor;
}

function tarjetaDeIdea(idea, ctx) {
  const destinos = (idea.orientaciones || []).map((o) =>
    o.persona_id ? ctx.vista.nombre(o.persona_id) : ctx.vista.etiqueta(o.etiqueta_id)?.nombre,
  ).filter(Boolean);

  const precio = idea.precio_min || idea.precio_max
    ? `${formatearImporte(idea.precio_min ?? idea.precio_max)}${idea.precio_max && idea.precio_min ? `–${formatearImporte(idea.precio_max)}` : ''}`
    : null;

  return el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleIdea(idea.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: idea.titulo }),
      // El estado «en curso» mantiene la idea a la vista, señalada con su
      // ocasión: retirarla invitaría a que otra persona la registrase de nuevo.
      idea.estado === 'en_curso'
        ? el('span', { class: 'etiqueta empujar', 'data-tono': 'regalo', texto: 'en curso' })
        : null,
    ]),
    el('p', {
      texto: [
        destinos.length ? `Para ${destinos.join(', ')}` : 'Sin destinatario',
        precio,
        ctx.vista.categoria(idea.categoria_id)?.nombre,
        // En un deseo propio, «de Óscar · para Óscar» no dice nada dos veces.
        idea.autor_id === ctx.vista.yo.id && idea.tipo === 'deseo'
          ? null : `de ${ctx.vista.nombre(idea.autor_id)}`,
      ].filter(Boolean).join(' · '),
    }),
  ]);
}

// ------------------------------------------------------------- Ocasiones --

/**
 * Dos tipos de ocasión, y por eso dos apartados.
 *
 * Una **fecha señalada** —Navidad, Reyes, un aniversario— es una ronda: mucha
 * gente, muchos regalos y una coordinación que dura semanas. Un **cumpleaños** es
 * lo contrario: una persona, una fecha que vuelve sola cada año y, casi siempre,
 * un mensaje que mandar. Mezclarlos en una lista obligaba a leerla entera para
 * encontrar cualquiera de las dos cosas.
 *
 * El nombre del primer apartado es el que se usa en casa para esas fechas —«las
 * fechas señaladas»— y no «campañas», que es como se llamó mientras se diseñaba:
 * describía bien el trabajo, pero nadie llama campaña a la Navidad
 * (specs/ux.md §6.1).
 *
 * Los dos son plegables y los dos arrancan abiertos: lo que se viene a mirar
 * aquí está en los dos, y plegar es para quitar de en medio lo que estorbe hoy,
 * no un estado en el que se abre la pantalla. El rótulo de los cumpleaños dice
 * de todos modos quién es el próximo, para cuando se hayan plegado.
 */
function vistaOcasiones(ctx) {
  // La pantalla se rehace entera en cada sincronización, así que la fila que
  // tuviera los verbos a la vista ya no existe: se olvida aquí para no dejar
  // apuntado un nodo que se ha ido.
  cerrarDeslizada();
  return el('div', {}, [bloqueDeSenaladas(ctx), bloqueDeCumples(ctx)]);
}

/** El mismo día del año, sin mirar de qué año. */
const mismoDiaYMes = (una, otra) => String(una).slice(5, 10) === String(otra).slice(5, 10);

/**
 * ¿Esta ocasión es el cumpleaños de alguien?
 *
 * No hay columna que lo diga, y no hace falta inventarla: una ocasión que cae el
 * mismo día del año que nació alguno de sus participantes es su cumpleaños. Se
 * deduce del dato en lugar de guardarse, de modo que no puede quedarse
 * desactualizado —así se reconoce también «Cumpleaños de Marta 2025», que se
 * creó antes de que esta pantalla existiera—.
 */
function esDeCumple(ocasion, ctx) {
  return (ocasion.participantes || []).some((id) => {
    const persona = ctx.vista.persona(id);
    return persona?.fecha_nacimiento && mismoDiaYMes(persona.fecha_nacimiento, ocasion.fecha);
  });
}

/** La ocasión del cumpleaños que viene, si es que alguien ya abrió una. Se ata
 *  por la fecha exacta: la del año pasado no sirve para el de este año. */
/**
 * La persona de un cumpleaños derivado, si el evento es uno.
 *
 * Los cumpleaños no son filas de `evento`: se componen en el dispositivo con un
 * identificador `derivado:cumpleanos:<persona>` (specs/modelo-datos.md §7.4).
 * Saber distinguirlos importa aquí porque una ocasión **no puede apuntar a
 * ellos**: `ocasion.evento_id` tiene clave foránea contra `evento`, y el
 * servidor rechaza la fila entera —y con ella el regalo que colgaba de la
 * ocasión— sin que en el teléfono se note más que la desaparición.
 */
export function personaDelCumple(evento, ctx) {
  const marca = /^derivado:cumpleanos:(.+)$/.exec(evento?.id || '');
  return marca ? ctx.vista.persona(marca[1]) : null;
}

/** La ocasión de un evento, sea una fila de `evento` o un cumpleaños derivado.
 *  Al derivado lo ata la fecha y el participante, no el identificador. */
export function ocasionDeEvento(evento, ctx) {
  const persona = personaDelCumple(evento, ctx);
  return persona ? ocasionDelCumple(persona, ctx) : ctx.vista.ocasionDeEvento(evento.id);
}

function ocasionDelCumple(persona, ctx) {
  const dia = iso(proximoAniversario(persona));
  return (ctx.vista.datos.ocasiones || []).find(
    (o) => estaActivo(o, 'activa') && o.fecha === dia && (o.participantes || []).includes(persona.id),
  ) || null;
}

function bloqueDeSenaladas(ctx) {
  const todas = (ctx.vista.datos.ocasiones || [])
    .filter((o) => estaActivo(o, 'activa') && !esDeCumple(o, ctx))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const abiertas = todas.filter((o) => o.estado === 'abierta');
  const cerradas = todas.filter((o) => o.estado !== 'abierta');

  const bloque = acordeon('Fechas señaladas', (cuerpo) => {
    if (!abiertas.length) {
      cuerpo.append(el('p', {
        class: 'vacio',
        texto: 'Ninguna en marcha. Navidad, Reyes, un aniversario: lo que se prepara entre varios.',
      }));
    }
    for (const ocasion of abiertas) cuerpo.append(tarjetaDeOcasion(ocasion, ctx));

    if (cerradas.length) {
      cuerpo.append(el('p', { class: 'grupo-titulo', texto: 'Cerradas' }));
      for (const ocasion of cerradas) cuerpo.append(tarjetaDeOcasion(ocasion, ctx));
    }

    cuerpo.append(el('button', {
      class: 'boton', 'data-tono': 'discreto', type: 'button',
      onclick: () => abrirFormularioOcasion(ctx),
    }, ['Nueva fecha señalada']));
  }, {
    abierta: !plegado.senaladas,
    nota: abiertas.length ? `${abiertas.length} en marcha` : null,
  });

  bloque.addEventListener('toggle', () => { plegado.senaladas = !bloque.open; });
  return bloque;
}

function bloqueDeCumples(ctx) {
  const personas = ctx.vista.personas();
  const conFecha = personas
    .filter((persona) => persona.fecha_nacimiento)
    .sort((a, b) => diasHastaElCumple(a) - diasHastaElCumple(b));
  const sinFecha = personas.length - conFecha.length;
  const siguiente = conFecha[0];

  const bloque = acordeon('Cumpleaños', (cuerpo) => {
    if (!conFecha.length) {
      cuerpo.append(el('p', {
        class: 'vacio',
        texto: 'Nadie tiene fecha de nacimiento apuntada. Se pone en su ficha, en Gente.',
      }));
    }
    for (const persona of conFecha) cuerpo.append(tarjetaDeCumple(persona, ctx));

    // Quien no tiene fecha no está en la lista, y su ausencia no se nota. Dicho,
    // sí: es un cumpleaños del que la agenda no va a avisar nunca.
    if (sinFecha) {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: sinFecha === 1
          ? 'Hay una persona sin fecha de nacimiento: su cumpleaños no sale por ningún lado hasta que se ponga en su ficha.'
          : `Hay ${sinFecha} personas sin fecha de nacimiento: sus cumpleaños no salen por ningún lado hasta que se pongan en sus fichas.`,
      }));
    }
  }, {
    abierta: !plegado.cumples,
    nota: siguiente ? `el próximo, ${nombreCompleto(siguiente)} ${cuandoCumple(siguiente).texto}` : null,
  });

  bloque.addEventListener('toggle', () => { plegado.cumples = !bloque.open; });
  return bloque;
}

/** La fecha en la pastilla, escrita y no en cifras: «25 Dic» se lee de un
 *  vistazo donde «2026-12-25» hay que descifrarlo. El año solo cuando no es
 *  este, que es cuando dice algo. */
function fechaCorta(fecha) {
  const dia = parsearMomento(fecha);
  if (!dia) return String(fecha || '');
  const mes = MESES_LARGOS[dia.getMonth()].slice(0, 3);
  const anio = dia.getFullYear() === hoy().getFullYear() ? '' : ` ${dia.getFullYear()}`;
  return `${dia.getDate()} ${mes}${anio}`;
}

/** Los cuatro de casa. Quien viene de un registro anterior a los círculos no
 *  trae el campo y cae en «extendida», igual que en la base. */
const esDeCasa = (persona) => (persona.circulo || 'extendida') === 'familia';

/**
 * Cuánto falta, contado como se cuenta hablando: de cerca en días, y de lejos
 * por la fecha, que es lo único que significa algo a cuatro meses vista.
 *
 * Con la gente de casa no se apaga la cuenta atrás aunque falten meses: sus
 * cumpleaños se llevan así todo el año, y «en 213 días» dice algo que «el 12 de
 * Mayo» no dice.
 *
 * Devuelve también **cómo** lo ha contado, porque de eso depende lo que se
 * escribe debajo: si aquí van los días, la fecha hace falta; si aquí va ya la
 * fecha, repetirla dos renglones más abajo sobra.
 */
function cuandoCumple(persona) {
  const dias = diasHastaElCumple(persona);
  if (dias === 0) return { texto: 'hoy', enDias: true };
  if (dias === 1) return { texto: 'mañana', enDias: true };
  if (dias <= 60 || esDeCasa(persona)) return { texto: `en ${dias} días`, enDias: true };
  const proximo = proximoAniversario(persona);
  return {
    texto: `el ${proximo.getDate()} de ${MESES_LARGOS[proximo.getMonth()]}`,
    enDias: false,
  };
}

/**
 * La pastilla de una ocasión, con sus verbos detrás.
 *
 * Deslizarla a la izquierda descubre editar y borrar; tocarla la abre, y dentro
 * está el mismo «editar» arriba, junto al título. Es la regla del evento: se mira
 * en el detalle y se corrige en el formulario, y el gesto solo se salta un paso.
 */
function tarjetaDeOcasion(ocasion, ctx) {
  const regalos = ctx.vista.regalosDe(ocasion.id);
  const pendientes = regalos.filter((r) => r.estado === 'pendiente').length;
  const mios = regalos.filter((r) => r.responsable_id === ctx.vista.yo.id && r.estado === 'pendiente').length;

  const gente = ocasion.participantes?.length || 0;
  const tarjeta = el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirOcasion(ocasion.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: ocasion.nombre }),
      el('span', { class: 'etiqueta empujar', texto: fechaCorta(ocasion.fecha) }),
    ]),
    el('p', {
      texto: [
        `${gente} ${gente === 1 ? 'persona' : 'personas'}`,
        // Sin ningún regalo no se dice «todo comprado», que suena a que está
        // hecho cuando lo que pasa es que no se ha empezado.
        ...(regalos.length
          ? [
            `${regalos.length} ${regalos.length === 1 ? 'regalo' : 'regalos'}`,
            pendientes ? `${pendientes} por comprar` : 'todo comprado',
            mios ? `tú tienes ${mios}` : null,
          ]
          : ['sin regalos todavía']),
      ].filter(Boolean).join(' · '),
    }),
  ]);

  return conVerbosAlDeslizar(tarjeta, [
    botonIcono('editar', {
      etiqueta: `Editar ${ocasion.nombre}`,
      onclick: () => abrirFormularioOcasion(ctx, { id: ocasion.id }),
    }),
    botonIcono('borrar', {
      etiqueta: `Borrar ${ocasion.nombre}`,
      tono: 'peligro',
      onclick: () => confirmarBorradoDeOcasion(ocasion, ctx),
    }),
  ]);
}

function tarjetaDeCumple(persona, ctx) {
  const dias = diasHastaElCumple(persona);
  const anios = aniosQueCumple(persona);
  const esMio = persona.id === ctx.vista.yo.id;
  const ocasion = ocasionDelCumple(persona, ctx);
  const regalos = ocasion ? ctx.vista.regalosDe(ocasion.id).length : 0;
  const ideas = ctx.vista.ideasPara(persona.id).length;

  // Del cumpleaños propio no se dice cuántos regalos hay, ni siquiera que hay
  // cero: si el recuento apareciera solo cuando existe, su ausencia contaría lo
  // mismo que su presencia.
  const preparativos = esMio
    ? null
    : regalos ? `${regalos} ${regalos === 1 ? 'regalo' : 'regalos'}`
      : ideas ? `${ideas} ${ideas === 1 ? 'idea apuntada' : 'ideas apuntadas'}`
        : 'nada pensado todavía';

  const falta = cuandoCumple(persona);

  return el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirCumple(persona.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('span', { class: 'linea-emoji', texto: '🎂' }),
      el('h3', { texto: nombreCompleto(persona) }),
      el('span', {
        class: 'etiqueta empujar', 'data-tono': dias <= 30 ? 'tinta' : null,
        texto: falta.texto,
      }),
    ]),
    el('p', {
      texto: [
        anios ? `cumple ${anios}` : null,
        // La fecha solo cuando arriba van los días: si la pastilla ya dice «el
        // 12 de Mayo», escribirla otra vez aquí es leer dos veces lo mismo.
        falta.enDias ? formatearFechaLarga(proximoAniversario(persona)) : null,
        preparativos,
      ].filter(Boolean).join(' · '),
    }),
  ]);
}

export function abrirOcasion(ocasionId, ctx) {
  const ocasion = ctx.vista.ocasion(ocasionId);
  if (!ocasion) return;

  abrirHoja(ocasion.nombre, (cuerpo) => {
    for (const personaId of ocasion.participantes || []) {
      const persona = ctx.vista.persona(personaId);
      if (!persona) continue;

      // Un miembro ve todas las listas salvo la suya propia, en cuyo lugar
      // aparece el aviso (spec funcional §6.1).
      if (personaId === ctx.vista.yo.id) {
        cuerpo.append(el('div', { class: 'grupo' }, [
          el('p', { class: 'grupo-titulo', texto: persona.nombre }),
          el('div', { class: 'sello' }, [
            el('strong', { texto: 'Por aquí no se mira' }),
            el('span', { texto: 'Vuelve otro día.' }),
          ]),
        ]));
        continue;
      }

      const regalos = ctx.vista.regalosPara(ocasion.id, personaId);
      cuerpo.append(el('div', { class: 'grupo' }, [
        el('p', { class: 'grupo-titulo', texto: persona.nombre }),
        ...regalos.map((regalo) => tarjetaDeRegalo(regalo, ctx)),
        regalos.length ? null : el('p', { class: 'pista', texto: 'Sin nada asignado.' }),
        el('button', {
          class: 'enlace-discreto', type: 'button',
          onclick: () => abrirSelectorDeRegalo(ctx, { ocasion, destinatario: personaId }),
        }, [`Añadir un regalo para ${persona.nombre}`]),
      ]));
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'discreto', type: 'button',
        onclick: () => abrirFormularioOcasion(ctx, { duplicarDe: ocasion.id }),
      }, ['Duplicar para otro año']),
    ]));
  }, [
    // El verbo que se usa va arriba, junto al título, igual que en un evento y en
    // una idea. Borrar no: vive donde se edita.
    botonIcono('editar', {
      etiqueta: 'Editar',
      onclick: () => abrirFormularioOcasion(ctx, { id: ocasion.id }),
    }),
  ]);
}

// -------------------------------------------------------------- Cumpleaños --

/**
 * Qué pasa al abrir un cumpleaños.
 *
 * Tres cosas, en el orden en que hacen falta:
 *
 * 1. **Cuándo es y cuántos cumple.** Es lo que se viene a comprobar.
 * 2. **La felicitación**, que es lo que de verdad se hace un cumpleaños: la
 *    escribe un modelo con lo que la agenda sabe de esa persona, se pasan cinco
 *    como se pasan las propuestas de regalo y se **copia al portapapeles** en
 *    lugar de guardarse. Nada de esto pertenece a la agenda: pertenece al
 *    WhatsApp donde se va a pegar.
 * 3. **Qué se le regala**, con los regalos de su ocasión si alguien ya la abrió.
 *
 * Sobre el cumpleaños propio no hay ni felicitación —felicitarse uno mismo no es
 * nada— ni regalos: en su sitio va el sello de siempre.
 *
 * **Es también la hoja que abre la agenda.** Antes el detalle de un evento
 * derivado era otra pantalla, más pobre: sin los años, sin felicitación y con un
 * «Quién va» que nombraba a una sola persona, la del propio cumpleaños. Dos
 * hojas para lo mismo solo servían para irse separando.
 *
 * `dia` es el aniversario que se está mirando. La agenda pasa el de la aparición
 * —abrir el de 2027 desde el mes tiene que decir los años de 2027—; desde
 * Regalos no se pasa ninguno y vale el próximo. `comentariosDe` es el objeto al
 * que se le cuelga el hilo, que la agenda ya tenía y aquí no había, y `acciones`
 * son los verbos que quiera añadir quien abre: la agenda pone ahí el suyo de
 * compartir, que vive en su módulo.
 *
 * El cumpleaños no es una fila de nada: sale de la fecha de nacimiento de la
 * ficha. Por eso editarlo abre el formulario de la persona y no un evento, y por
 * eso su tarjeta no lleva verbos detrás (specs/ux.md §6.1).
 */
export function abrirCumple(personaId, ctx, { dia = null, comentariosDe = null, acciones = [] } = {}) {
  const persona = ctx.vista.persona(personaId);
  if (!persona?.fecha_nacimiento) return;

  const esMio = personaId === ctx.vista.yo.id;
  const proximo = proximoAniversario(persona);
  const cual = dia || proximo;
  const esElProximo = !dia || iso(dia) === iso(proximo);
  const anios = aniosDeEseCumple(persona, cual);
  const falta = cuandoCumple(persona);

  abrirHoja(`Cumpleaños ${deQuien(nombreCompleto(persona))}`, (cuerpo) => {
    cuerpo.append(el('div', { class: 'tarjeta-fila' }, [
      el('span', { style: 'font-size:26px', texto: '🎂' }),
      el('div', {}, [
        el('p', { texto: formatearFechaLarga(cual) }),
        el('p', {
          class: 'pista',
          texto: [
            anios ? `cumple ${anios} años` : null,
            // «en 4 días» solo vale del que viene. Del de otro año, el año.
            // Y solo cuando se cuenta en días: la fecha entera está en el
            // renglón de encima, y repetirla aquí es leer dos veces lo mismo.
            esElProximo ? (falta.enDias ? falta.texto : null) : String(cual.getFullYear()),
          ].filter(Boolean).join(' · '),
        }),
      ]),
    ]));

    if (esMio) {
      cuerpo.append(el('div', { class: 'sello' }, [
        el('strong', { texto: 'Por aquí no se mira' }),
        el('span', { texto: 'Es el tuyo. Vuelve otro día.' }),
      ]));
    } else {
      cuerpo.append(bloqueDeFelicitacion(persona, ctx));
      cuerpo.append(bloqueDeRegalosDelCumple(persona, ctx));
    }

    if (comentariosDe) cuerpo.append(bloqueDeComentarios('evento', comentariosDe, ctx));

    cuerpo.append(el('button', {
      class: 'enlace-discreto', type: 'button',
      onclick: () => abrirFicha(personaId, ctx),
    }, [`Ver la ficha de ${persona.nombre}`]));
  }, [
    // Editar un cumpleaños es editar la fecha de nacimiento de quien lo cumple:
    // el verbo lleva derecho al formulario de la persona, y al guardar se vuelve
    // aquí. Se ha ido a corregir un dato, no a visitar a nadie.
    botonIcono('editar', {
      etiqueta: `Editar la ficha de ${persona.nombre}`,
      onclick: () => abrirFormularioPersona(ctx, {
        id: personaId,
        alGuardar: () => abrirCumple(personaId, ctx, { dia, comentariosDe, acciones }),
      }),
    }),
    ...acciones,
  ]);
}

/** Los años que cumple en **ese** aniversario. `aniosQueCumple` responde por el
 *  próximo, que es lo que quieren la rejilla de Gente y la lista de Ocasiones;
 *  la agenda, en cambio, pregunta por el año que tiene delante. */
function aniosDeEseCumple(persona, dia) {
  const nacimiento = parsearMomento(persona.fecha_nacimiento);
  if (!nacimiento || !dia) return null;
  const anios = dia.getFullYear() - nacimiento.getFullYear();
  return anios > 0 && anios < 130 ? anios : null;
}

/**
 * La felicitación, escrita por un modelo y copiada al portapapeles.
 *
 * Se copia y no se guarda porque no hay dónde: una felicitación no es un dato de
 * la agenda, es un mensaje que se manda una vez. Y con emojis, que en un WhatsApp
 * de cumpleaños son la mitad del tono.
 *
 * Sin clave puesta en el servidor no aparece nada: sería un botón que solo sabe
 * fallar, la misma regla que en el destello de las ideas.
 */
function bloqueDeFelicitacion(persona, ctx) {
  if (!redaccionDisponible(ctx.vista.datos)) return el('div', { hidden: true });

  const carrusel = carruselDePropuestas({
    pedir: ({ mas, yaDichas }) => {
      if (mas) toque();
      return felicitarCumple(persona.id, { descartadas: yaDichas });
    },
    pintar: (felicitacion) => el('p', { class: 'propuesta-felicitacion', texto: felicitacion }),
    verbo: { texto: 'Copiar', hacer: (felicitacion) => copiarFelicitacion(felicitacion) },
    holgado: true,
  });

  // El botón se retira al abrir la pastilla: la pastilla ya no se cierra sola, y
  // dejarlo debajo sería un botón que no hace nada.
  const pedir = el('button', {
    class: 'boton', 'data-tono': 'discreto', 'data-con-icono': true, type: 'button',
    onclick: () => { toque(); pedir.hidden = true; carrusel.abrir(); },
  }, [icono('destello'), `Escribir una felicitación para ${persona.nombre}`]);

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Felicitación' }),
    pedir,
    carrusel.nodo,
    el('p', { class: 'pista', texto: 'Se copia al portapapeles y se pega en WhatsApp.' }),
  ]);
}

/** El portapapeles se escribe dentro del propio toque: un segundo después, ya
 *  fuera del gesto, el navegador lo rechazaría. */
async function copiarFelicitacion(felicitacion) {
  const copiada = copiar(felicitacion);
  toque('media');
  avisar(await copiada ? 'Copiada: pégala en WhatsApp' : 'No he podido copiarla');
}

/**
 * Los regalos del cumpleaños, que cuelgan de una ocasión como los demás.
 *
 * La ocasión no existe hasta que hace falta: se crea al asociar el primer regalo,
 * igual que la de un evento. Lo que no puede llevar es `evento_id`, porque el
 * cumpleaños no es una fila de `evento`; lo que la ata a este cumpleaños son la
 * fecha y el participante, que es justamente lo que `ocasionDelCumple` lee de
 * vuelta.
 */
function bloqueDeRegalosDelCumple(persona, ctx) {
  const ocasion = ocasionDelCumple(persona, ctx);
  const regalos = ocasion ? ctx.vista.regalosDe(ocasion.id) : [];
  const ideas = ctx.vista.ideasPara(persona.id);

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Regalos' }),
    ...regalos.map((regalo) => tarjetaDeRegalo(regalo, ctx)),
    regalos.length ? null : el('p', {
      class: 'pista',
      texto: ideas.length
        ? `Nada asignado todavía, pero hay ${ideas.length} ${ideas.length === 1 ? 'idea apuntada' : 'ideas apuntadas'} para ${persona.nombre}.`
        : 'Nada asignado todavía, y ninguna idea apuntada tampoco.',
    }),
    el('button', {
      class: 'boton', 'data-tono': 'discreto', type: 'button',
      onclick: () => abrirSelectorDeRegalo(ctx, {
        destinatario: persona.id,
        asegurar: () => asegurarOcasionDelCumple(persona, ctx),
      }),
    }, [`Añadir un regalo para ${persona.nombre}`]),
  ]);
}

async function asegurarOcasionDelCumple(persona, ctx) {
  const existente = ocasionDelCumple(persona, ctx);
  if (existente) return existente;

  const dia = proximoAniversario(persona);
  const id = nuevoId();
  await guardar('ocasion', id, {
    nombre: `Cumpleaños ${deQuien(persona.nombre)} ${dia.getFullYear()}`,
    fecha: iso(dia),
    estado: 'abierta',
    autor_id: ctx.vista.yo.id,
    activa: 1,
    participantes: [persona.id],
  });
  return ctx.vista.ocasion(id) || { id, participantes: [persona.id] };
}

function tarjetaDeRegalo(regalo, ctx) {
  const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
  return el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleRegalo(regalo.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: idea?.titulo || 'Regalo' }),
      el('span', { class: 'etiqueta empujar', 'data-tono': 'regalo', texto: regalo.estado }),
    ]),
    el('p', {
      texto: [
        regalo.responsable_id ? `lo lleva ${ctx.vista.nombre(regalo.responsable_id)}` : 'sin responsable',
        typeof regalo.coste_real === 'number' ? formatearImporte(regalo.coste_real) : null,
        regalo.compartido ? 'compartido' : null,
      ].filter(Boolean).join(' · '),
    }),
  ]);
}

// --------------------------------------------------------------- Detalles --

/** Un deseo que escribió quien lo mira. No se lleva a ninguna ocasión: el
 *  regalo que saliera de ahí lo ocultaría el servidor a su propio autor. */
const esDeseoPropio = (idea, ctx) => idea.tipo === 'deseo' && idea.autor_id === ctx.vista.yo.id;

export function abrirDetalleIdea(ideaId, ctx) {
  const idea = ctx.vista.idea(ideaId);
  if (!idea) return;

  const destinos = (idea.orientaciones || []).map((o) =>
    o.persona_id ? ctx.vista.nombre(o.persona_id) : ctx.vista.etiqueta(o.etiqueta_id)?.nombre,
  ).filter(Boolean);

  abrirHoja(idea.titulo, (cuerpo) => {
    if (idea.descripcion) cuerpo.append(el('p', { texto: idea.descripcion }));
    cuerpo.append(el('p', {
      class: 'pista',
      texto: [
        destinos.length ? `Para ${destinos.join(', ')}` : null,
        ctx.vista.categoria(idea.categoria_id)?.nombre,
        idea.establecimiento,
        `apuntada por ${ctx.vista.nombre(idea.autor_id)}`,
      ].filter(Boolean).join(' · '),
    }));
    if (idea.enlace) cuerpo.append(el('a', { href: idea.enlace, target: '_blank', rel: 'noopener', class: 'enlace-discreto' }, ['Abrir el enlace']));

    cuerpo.append(el('div', { class: 'acciones' }, [
      idea.estado === 'descartada'
        ? el('button', {
            class: 'boton crecer', type: 'button',
            onclick: async () => { await guardar('idea', idea.id, { estado: 'activa' }); cerrarHoja(); ctx.refrescar(); },
          }, ['Reactivar'])
        : esDeseoPropio(idea, ctx) ? null : el('button', {
            class: 'boton crecer', type: 'button',
            onclick: () => abrirPromocion(idea, ctx),
          }, ['Llevar a una ocasión']),
      el('button', {
        class: 'boton', 'data-tono': 'discreto', type: 'button',
        onclick: async () => {
          // Cerrada es terminal; para reutilizarla se duplica, generando una
          // idea nueva en estado activa (spec funcional §5.2).
          await guardar('idea', nuevoId(), {
            ...idea, id: undefined, estado: 'activa', autor_id: ctx.vista.yo.id, activa: 1,
          });
          cerrarHoja(); avisar('Idea duplicada'); ctx.refrescar();
        },
      }, ['Duplicar']),
      idea.estado === 'descartada' ? null : el('button', {
        class: 'boton', 'data-tono': 'peligro', type: 'button',
        onclick: async () => { await guardar('idea', idea.id, { estado: 'descartada' }); cerrarHoja(); avisar('Idea descartada'); ctx.refrescar(); },
      }, ['Descartar']),
    ]));

    // Borrar no vive aquí: es una operación de edición, y está donde se edita.
    // Descartar sí, porque no borra nada —la idea se reactiva— y es lo que se
    // decide mirándola.
  }, [
    // El verbo que se usa va arriba, junto al título, igual que en un evento.
    botonIcono('editar', {
      etiqueta: 'Editar',
      onclick: () => abrirFormularioIdea(ctx, { id: idea.id }),
    }),
  ]);
}

export function abrirDetalleRegalo(regaloId, ctx) {
  const regalo = ctx.vista.regalo(regaloId);
  if (!regalo) return;
  const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;

  abrirHoja(idea?.titulo || 'Regalo', (cuerpo) => {
    cuerpo.append(el('p', { class: 'pista', texto: `Para ${ctx.vista.nombre(regalo.destinatario_principal_id)}` }));

    const estado = seleccion(ESTADOS_REGALO, regalo.estado);
    estado.addEventListener('change', async () => {
      await guardar('regalo', regalo.id, { estado: estado.value });
      ctx.refrescar();
      avisar('Estado actualizado');
    });
    cuerpo.append(campo('Cómo va', estado));

    // La asignación de responsable resuelve el problema práctico de la
    // duplicidad: es visible para quien coordina y opaca para el destinatario.
    const responsables = [{ valor: '', texto: 'Sin responsable' },
      ...ctx.vista.personasConCuenta().map((p) => ({ valor: p.id, texto: p.nombre }))];
    const responsable = seleccion(responsables, regalo.responsable_id || '');
    responsable.addEventListener('change', async () => {
      await guardar('regalo', regalo.id, { responsable_id: responsable.value || null });
      ctx.refrescar();
    });
    cuerpo.append(campo('Quién lo lleva', responsable, 'Marcarlo evita que otra persona lo compre por segunda vez.'));

    const coste = entrada({ type: 'number', inputmode: 'decimal', step: '0.01', value: regalo.coste_real ?? '' });
    coste.addEventListener('change', async () => {
      const valor = coste.value.trim() === '' ? null : Number(coste.value);
      await guardar('regalo', regalo.id, { coste_real: valor });
      ctx.refrescar();
    });
    cuerpo.append(campo('Lo que costó', coste, 'Opcional. Es lo que permite saber después en qué se fue una ocasión.'));

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: async () => { await retirar('regalo', regalo.id); cerrarHoja(); avisar('Regalo retirado'); ctx.refrescar(); },
      }, ['Quitar de la ocasión']),
    ]));
  });
}

// -------------------------------------------------------------- Promoción --

function abrirPromocion(idea, ctx) {
  const abiertas = (ctx.vista.datos.ocasiones || []).filter((o) => o.estado === 'abierta' && estaActivo(o, 'activa'));
  const destinos = (idea.orientaciones || []).map((o) => o.persona_id).filter(Boolean);

  abrirHoja('Llevar a una ocasión', (cuerpo) => {
    if (!abiertas.length) {
      cuerpo.append(el('p', { class: 'pista', texto: 'No hay ninguna ocasión abierta. Crea una desde Regalos → Ocasiones.' }));
      return;
    }
    const ocasion = seleccion(abiertas.map((o) => ({ valor: o.id, texto: `${o.nombre} · ${o.fecha}` })), abiertas[0].id);
    let para = destinos[0] || null;
    cuerpo.append(campo('Ocasión', ocasion), campoDeGente(ctx, {
      etiqueta: 'Para quién',
      elegidos: para ? [para] : [],
      alCambiar: (ids) => { para = ids[0] || null; },
      unica: true,
    }));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!para) { avisar('Elige para quién'); return; }
          await crearRegalo(ctx, { ocasionId: ocasion.value, destinatario: para, idea });
          await asegurarParticipante(ctx, ocasion.value, para);
          cerrarHoja(); avisar('Añadido a la ocasión'); ctx.refrescar();
        },
      }, ['Añadir']),
    ]));
  });
}

/**
 * Selector de regalos de un evento o de una ocasión.
 *
 * Propone las ideas orientadas a los participantes, lo que acota la búsqueda
 * sin impedir la selección de cualquier otra. Es una ayuda de uso y no un
 * control de acceso: la protección reside por completo en el filtrado del
 * servidor (spec funcional §3.5).
 *
 * `asegurar` es la ocasión que todavía no existe: se llama **después** de elegir
 * el regalo, no antes, para que cerrar esta hoja sin elegir nada no deje una
 * ocasión vacía en el registro.
 *
 * De aquí solo salen regalos con idea detrás. El atajo para crear uno suelto
 * dejaba en la ocasión una tarjeta que decía «Regalo» y nada más: sin título,
 * sin precio y sin enlace, imposible de reconocer al volver a mirarla y sin
 * nada que reutilizar al año siguiente. Apuntar antes la idea cuesta diez
 * segundos y deja las dos cosas.
 */
export function abrirSelectorDeRegalo(
  ctx,
  { evento = null, ocasion = null, destinatario = null, asegurar = null } = {},
) {
  const candidatos = evento
    ? ctx.vista.participantes(evento).concat(ctx.vista.protagonistas(evento))
    : (ocasion?.participantes || [destinatario].filter(Boolean));
  // Quien mira no se propone a sí mismo: un regalo para uno mismo no se
  // coordina desde aquí.
  const relevantes = [...new Set(candidatos.filter((id) => id !== ctx.vista.yo.id))];

  let para = destinatario || relevantes[0] || null;
  const apuntadas = ctx.vista.banco();
  const marcadas = new Set();
  let verOtras = false;
  let filtro = '';

  const deQuien = (idea) => (idea.orientaciones || []).map((o) => o.persona_id).filter(Boolean);
  const encaja = (idea) => !filtro || normalizar(idea.titulo).includes(normalizar(filtro));

  const titulo = para ? `Regalos para ${ctx.vista.nombre(para)}` : 'Asociar un regalo';

  abrirHoja(titulo, (cuerpo) => {
    // Preguntar para quién solo tiene sentido si de verdad hay a quién elegir.
    // Viniendo de un cumpleaños la respuesta ya está dada, y el título la dice.
    if (relevantes.length > 1 || !para) {
      cuerpo.append(campoDeGente(ctx, {
        etiqueta: 'Para quién',
        elegidos: para ? [para] : [],
        alCambiar: (ids) => { para = ids[0] || null; },
        unica: true,
        excluir: [ctx.vista.yo.id],
      }));
    }

    // El buscador solo cuando hay de qué buscar: con seis ideas es un campo que
    // ocupa para no ahorrar nada.
    if (apuntadas.length >= TOPE_SIN_BUSCADOR) {
      const busca = entrada({ type: 'search', placeholder: 'Buscar entre las ideas', 'aria-label': 'Buscar entre las ideas' });
      busca.addEventListener('input', () => { filtro = busca.value; pintar(); });
      cuerpo.append(el('div', { class: 'campo' }, [busca]));
    }

    const lista = el('div', { class: 'grupo' });
    const conmutador = el('label', { class: 'conmutador' });
    const pie = el('button', { class: 'boton crecer', type: 'button', disabled: true });
    cuerpo.append(lista, conmutador, el('div', { class: 'acciones' }, [pie]));

    /**
     * Una idea de la lista. `conDestino` añade para quién está apuntada, y solo
     * lo llevan las de otras personas: en los otros dos grupos el destinatario
     * lo dice ya el rótulo —«Apuntadas para Marta», «Sin destinatario»— y
     * repetirlo en cada línea sería ruido. Ahí, en cambio, hace falta para
     * saber a quién se la estás quitando.
     */
    const marca = (idea, { conDestino = false } = {}) => {
      const puesta = marcadas.has(idea.id);
      const destinos = conDestino
        ? (idea.orientaciones || [])
          .map((o) => (o.persona_id ? ctx.vista.nombre(o.persona_id) : ctx.vista.etiqueta(o.etiqueta_id)?.nombre))
          .filter(Boolean)
        : [];
      const pista = [
        destinos.length ? `para ${destinos.join(', ')}` : null,
        `de ${ctx.vista.nombre(idea.autor_id)}`,
      ].filter(Boolean).join(' · ');
      const fila = el('button', {
        class: 'tarjeta eleccion-idea', type: 'button',
        'aria-pressed': puesta ? 'true' : 'false',
        onclick: () => {
          toque();
          if (puesta) marcadas.delete(idea.id); else marcadas.add(idea.id);
          pintar();
        },
      }, [
        el('span', { class: 'casilla', 'aria-hidden': 'true' }, [puesta ? icono('visto') : null]),
        el('span', { class: 'eleccion-texto' }, [
          el('span', { class: 'eleccion-nombre', texto: idea.titulo }),
          el('span', { class: 'eleccion-pista', texto: pista }),
        ]),
      ]);
      return fila;
    };

    const grupo = (rotulo, ideas, opciones = {}) => (ideas.length
      ? [el('p', { class: 'grupo-titulo', texto: rotulo }), ...ideas.map((idea) => marca(idea, opciones))]
      : []);

    function pintar() {
      const suyas = apuntadas.filter((i) => para && deQuien(i).includes(para)).filter(encaja);
      // «Sin destinatario» es la idea que no nombra a nadie: la apuntada solo con
      // una etiqueta —«adolescente», «viajera»— o sin nada. Sirve para cualquiera,
      // y por eso acompaña siempre a las de la persona.
      const sueltas = apuntadas.filter((i) => !deQuien(i).length).filter(encaja);
      const otras = apuntadas.filter((i) => !suyas.includes(i) && !sueltas.includes(i)).filter(encaja);

      vaciar(lista).append(
        ...grupo(para ? `Apuntadas para ${ctx.vista.nombre(para)}` : 'Apuntadas', suyas),
        ...grupo('Sin destinatario', sueltas),
        ...(verOtras ? grupo('De otras personas', otras, { conDestino: true }) : []),
      );
      if (!suyas.length && !sueltas.length && !(verOtras && otras.length)) {
        lista.append(el('p', {
          class: 'vacio',
          texto: filtro
            ? 'Ninguna idea con ese texto.'
            : 'Ninguna idea apuntada todavía. Apunta una en Regalos → Ideas y vuelve por aquí.',
        }));
      }

      vaciar(conmutador).append(
        el('input', {
          type: 'checkbox', checked: verOtras,
          onchange: (ev) => { verOtras = ev.currentTarget.checked; pintar(); },
        }),
        el('span', { texto: `Ver también las de otras personas${otras.length ? ` (${otras.length})` : ''}` }),
      );
      conmutador.hidden = !otras.length && !verOtras;

      pie.disabled = !marcadas.size;
      pie.textContent = marcadas.size
        ? `Añadir ${marcadas.size} ${marcadas.size === 1 ? 'regalo' : 'regalos'}`
        : 'Elige alguna idea';
    }

    const asociar = async (ideas) => {
      if (!para) { avisar('Elige para quién'); return; }
      let destino = ocasion;
      if (!destino && asegurar) destino = await asegurar();
      if (!destino && evento) destino = await asegurarOcasionDe(evento, ctx);
      if (!destino) { avisar('No hay ocasión donde ponerlo'); return; }

      for (const idea of ideas) await crearRegalo(ctx, { ocasionId: destino.id, destinatario: para, idea });
      // Una sola vez y al final: dentro del bucle, la segunda vuelta leería una
      // ocasión que todavía no refleja la primera y lo apuntaría dos veces.
      await asegurarParticipante(ctx, destino.id, para);

      cerrarHoja();
      avisar(ideas.length === 1 ? 'Regalo asociado' : `${ideas.length} regalos asociados`);
      ctx.refrescar();
    };

    pie.onclick = () => asociar(apuntadas.filter((i) => marcadas.has(i.id)));

    pintar();
  });
}

/**
 * Cuando se asocia un regalo desde un evento que todavía no tiene ocasión
 * vinculada, esta se crea de forma automática (spec funcional §6.4).
 *
 * Un cumpleaños sale por la puerta de al lado: su ocasión no lleva `evento_id`
 * —no hay fila a la que apuntar— y se reconoce por la fecha y el participante.
 * Escribirlo era perder el regalo: el servidor rechazaba la ocasión por clave
 * foránea, con ella el regalo, y en el teléfono solo se veía desaparecer.
 */
async function asegurarOcasionDe(evento, ctx) {
  const cumpleanero = personaDelCumple(evento, ctx);
  if (cumpleanero) return asegurarOcasionDelCumple(cumpleanero, ctx);

  const existente = ctx.vista.ocasionDeEvento(evento.id);
  if (existente) return existente;

  const id = nuevoId();
  const participantes = [...new Set(ctx.vista.protagonistas(evento).concat(ctx.vista.participantes(evento)))];
  await guardar('ocasion', id, {
    nombre: evento.titulo,
    fecha: String(evento.inicio).slice(0, 10),
    estado: 'abierta',
    evento_id: evento.id,
    autor_id: ctx.vista.yo.id,
    activa: 1,
    participantes,
  });
  return ctx.vista.ocasion(id) || { id, participantes };
}

async function crearRegalo(ctx, { ocasionId, destinatario, idea }) {
  recordarElegidos('regalo', [destinatario]);
  await guardar('regalo', nuevoId(), {
    ocasion_id: ocasionId,
    idea_id: idea?.id || null,
    destinatario_principal_id: destinatario,
    compartido: 0,
    estado: 'pendiente',
    categoria_id: idea?.categoria_id || null,
    autor_id: ctx.vista.yo.id,
    activo: 1,
  });
}

/** Quien recibe algo pasa a participar en la ocasión. Se llama una sola vez por
 *  tanda: dentro de un bucle, la segunda vuelta leería una ocasión que todavía
 *  no refleja la primera y lo apuntaría dos veces. */
async function asegurarParticipante(ctx, ocasionId, destinatario) {
  const ocasion = ctx.vista.ocasion(ocasionId);
  if (!ocasion || (ocasion.participantes || []).includes(destinatario)) return;
  await guardar('ocasion', ocasionId, {
    participantes: [...(ocasion.participantes || []), destinatario],
  });
}

// ------------------------------------------------- Crear, editar y borrar --

/**
 * La misma hoja para las tres cosas: crear una fecha señalada, duplicar la del
 * año pasado y corregir una que ya existe. Es la regla del evento y la de la
 * idea —se corrige por la misma puerta por la que se crea— y con ella el borrado
 * queda arriba, junto al título, y no entre lo que se mira.
 *
 * Al editar no se reescriben ni el estado ni la autoría: una ocasión que ya está
 * cerrada no vuelve a abrirse por corregirle el nombre, y quien la creó sigue
 * siendo quien la creó.
 */
function abrirFormularioOcasion(ctx, { id = null, duplicarDe = null } = {}) {
  const existente = id ? ctx.vista.ocasion(id) : null;
  const origen = duplicarDe ? ctx.vista.ocasion(duplicarDe) : null;
  const modelo = existente || origen;
  let participantes = modelo ? [...(modelo.participantes || [])] : [];

  const titulo = existente ? 'Editar la ocasión' : origen ? 'Duplicar la ocasión' : 'Nueva fecha señalada';
  const borrarOcasion = existente ? botonIcono('borrar', {
    etiqueta: 'Borrar la ocasión', tono: 'peligro',
    onclick: () => confirmarBorradoDeOcasion(existente, ctx),
  }) : null;

  abrirHoja(titulo, (cuerpo) => {
    const nombre = entrada({
      value: existente
        ? existente.nombre
        : origen ? `${origen.nombre.replace(/\s*\d{4}$/, '')} ${new Date().getFullYear() + 1}` : '',
    });
    const fecha = el('input', { type: 'date', value: existente ? existente.fecha : iso(hoy()) });
    cuerpo.append(campo('Cómo se llama', nombre), campo('Cuándo', fecha));
    cuerpo.append(campoDeGente(ctx, {
      etiqueta: 'Para quién',
      pista: origen ? 'Se traen las personas del año pasado. Los importes y los regalos no: repetirlos induce a no revisarlos.' : null,
      elegidos: participantes,
      alCambiar: (ids) => { participantes = ids; },
    }));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!nombre.value.trim()) { avisar('Ponle un nombre'); return; }
          const campos = { nombre: nombre.value.trim(), fecha: fecha.value, participantes };
          if (!existente) Object.assign(campos, { estado: 'abierta', autor_id: ctx.vista.yo.id, activa: 1 });

          await guardar('ocasion', existente ? existente.id : nuevoId(), campos);
          recordarElegidos('regalo', participantes);
          toque('media');
          cerrarHoja();
          avisar(existente ? 'Ocasión actualizada' : 'Ocasión creada');
          ctx.refrescar();
        },
      }, [existente ? 'Guardar' : 'Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  }, [borrarOcasion]);
}

/**
 * Borrar una ocasión se pregunta, y se pregunta diciendo qué se lleva por
 * delante: los regalos cuelgan de ella, y una Navidad con ocho apuntados no
 * puede desaparecer de un dedo distraído.
 *
 * Los regalos se retiran con ella. Dejarlos vivos apuntando a una ocasión que ya
 * no está los volvería invisibles pero no inexistentes, y sus ideas se quedarían
 * «en curso» para siempre, señaladas con una ocasión que nadie puede abrir.
 */
function confirmarBorradoDeOcasion(ocasion, ctx) {
  const regalos = ctx.vista.regalosDe(ocasion.id);

  abrirHoja(`Borrar ${ocasion.nombre}`, (cuerpo) => {
    cuerpo.append(el('p', {
      texto: regalos.length
        ? `Se retira la ocasión y con ella ${regalos.length === 1 ? 'el regalo que tiene apuntado' : `los ${regalos.length} regalos que tiene apuntados`}. Las ideas se quedan en el banco, libres para otra ocasión.`
        : 'Se retira la ocasión. No tiene ningún regalo apuntado.',
    }));

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', { class: 'boton crecer', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: async () => {
          for (const regalo of regalos) await retirar('regalo', regalo.id);
          await retirar('ocasion', ocasion.id);
          toque('media');
          cerrarHoja();
          avisar('Ocasión retirada');
          ctx.refrescar();
        },
      }, ['Borrar']),
    ]));
  });
}

// ----------------------------------------------------- Apuntar y editar --

/**
 * Captura en un gesto: el qué, para quién y por qué, y un botón de guardar. El
 * resto de la clasificación se ofrece debajo pero no se reclama. Si registrar
 * una idea cuesta más de diez segundos, no se registra (specs/ux.md §2 y §3).
 *
 * Para quién sube por encima del pliegue aunque sea clasificación: es lo que
 * decide a quién se le oculta la idea, y lo que enciende la propuesta de la IA.
 *
 * Corregir entra por la misma puerta que en la agenda: la misma hoja, con todo
 * desplegado —quien viene a cambiar algo ya sabe qué campo busca— y el borrado
 * arriba, junto al título. En el detalle no pinta nada: allí se mira.
 */
export function abrirFormularioIdea(ctx, { id = null, paraPersona = null } = {}) {
  const existente = id ? ctx.vista.idea(id) : null;
  const orientaciones = existente?.orientaciones || [];

  let destinatarios = existente
    ? orientaciones.map((o) => o.persona_id).filter(Boolean)
    : [paraPersona].filter(Boolean);
  // Las etiquetas ya no se ponen desde aquí —el campo preguntaba por un perfil
  // que no cambiaba nada: no reserva la idea para nadie, no la propone en
  // ninguna ficha y no acota lo que se ofrece al asociar un regalo—, pero las
  // que una idea ya tuviera se conservan al guardarla.
  const etiquetas = existente ? orientaciones.map((o) => o.etiqueta_id).filter(Boolean) : [];

  /** Lo que se apunta para uno mismo y para nadie más es un deseo, no una idea
   *  para regalar: si se guardara como idea, la ocultación se la quitaría de
   *  delante a su propio autor en el acto. */
  const soloParaMi = () => destinatarios.length === 1
    && destinatarios[0] === ctx.vista.yo.id
    && !etiquetas.length;

  const borrarIdea = existente ? botonIcono('borrar', {
    etiqueta: 'Borrar la idea', tono: 'peligro',
    onclick: async () => {
      await retirar('idea', existente.id);
      toque('media');
      cerrarHoja();
      avisar('Idea retirada');
      ctx.refrescar();
    },
  }) : null;

  abrirHoja(existente ? 'Editar idea' : 'Apuntar una idea', (cuerpo) => {
    const titulo = entrada({ value: existente?.titulo || '', autofocus: true });

    // El destello vive dentro del campo que va a rellenar, al final, como la
    // lupa de un buscador: no gasta una línea y no hay que explicar qué campo
    // toca. Solo aparece cuando hay una persona a quien regalarle algo.
    const pedir = el('button', {
      class: 'destello-campo', type: 'button', hidden: true,
      onclick: () => abrirPropuestas(),
    }, [icono('destello')]);

    const campoQue = campo('Qué', titulo);
    campoQue.append(pedir);
    cuerpo.append(campoQue);

    // ------------------------------------------------------- Las propuestas --

    /**
     * Una tanda son cinco de una vez, porque lo caro de la llamada es contarle al
     * modelo quién es la persona: pasar de una a otra no vuelve a pedir nada.
     *
     * La pista es lo que hubiera escrito **antes** de pedir la primera, y se
     * conserva: si se mandara lo que hay en los campos, la segunda tanda llevaría
     * dentro la propuesta de la primera y el modelo se repetiría.
     */
    let pistaDeLaTanda = '';
    const carrusel = carruselDePropuestas({
      pedir: ({ mas, yaDichas }) => {
        const persona = destinataria();
        if (!persona) return [];
        if (mas) toque();
        else pistaDeLaTanda = [titulo.value.trim(), descripcion.value.trim()].filter(Boolean).join('. ');
        return sugerirRegalos(persona.id, { pista: pistaDeLaTanda, descartadas: yaDichas });
      },
      pintar: (propuesta) => [
        el('p', { class: 'propuesta-que', texto: propuesta.que }),
        propuesta.porque ? el('p', { class: 'propuesta-porque', texto: propuesta.porque }) : null,
      ],
      clave: (propuesta) => propuesta.que,
      verbo: { texto: 'Usarla', hacer: (propuesta) => usarLaPropuesta(propuesta) },
    });
    cuerpo.append(carrusel.nodo);

    // ------------------------------------------------------- Los demás campos --

    const descripcion = el('textarea', {});
    descripcion.value = existente?.descripcion || '';

    cuerpo.append(campoDeGente(ctx, {
      etiqueta: 'Para quién',
      pista: 'Nombrar a una persona con cuenta oculta la idea para ella, de forma automática y permanente.',
      elegidos: destinatarios,
      alCambiar: (ids) => { destinatarios = ids; ajustarPedir(); avisoDeDeseo(); },
    }));

    // Marcarse a uno mismo cambia lo que se está apuntando, y conviene decirlo
    // antes de guardar: lo que se escribe deja de ser una idea para regalar y
    // pasa a ser lo que uno pide, que vive en otro sitio.
    const pistaDeseo = el('p', { class: 'pista', 'data-tono': 'aviso', hidden: true });
    pistaDeseo.textContent = 'Solo estás tú: esto se guarda como algo que pides, y aparece en tu ficha y en «Lo que pides tú», no entre las ideas para regalar.';
    cuerpo.append(pistaDeseo);
    function avisoDeDeseo() { pistaDeseo.hidden = !soloParaMi(); }
    cuerpo.append(campo('Descripción', descripcion));

    // Al editar se abre desplegado y sin enlace: quien corrige viene a por un
    // campo concreto, y esconderlo detrás de un enlace sobra.
    //
    // El enlace solo despliega, y al hacerlo se va. Volver a plegar no ahorraba
    // nada —lo de debajo son campos vacíos— y dejaba un botón que decía «dejarlo
    // así» encima de lo que se acababa de abrir para tocar.
    const extra = el('div', { class: 'hoja-seccion', hidden: !existente });
    const desplegar = el('button', {
      class: 'enlace-discreto', type: 'button',
      onclick: () => { extra.hidden = false; desplegar.remove(); },
    }, ['Clasificarla']);
    if (!existente) cuerpo.append(desplegar);
    cuerpo.append(extra);

    const categoria = seleccion(
      [{ valor: '', texto: 'Sin categoría' }, ...ctx.vista.categorias().map((c) => ({ valor: c.id, texto: c.nombre }))],
      existente?.categoria_id || '',
    );
    const precio = entrada({ type: 'number', inputmode: 'decimal', value: existente?.precio_max ?? '' });
    const establecimiento = entrada({ value: existente?.establecimiento || '' });
    const enlace = entrada({ type: 'url', inputmode: 'url', value: existente?.enlace || '' });

    extra.append(
      campo('Categoría', categoria),
      campo('Precio aproximado', precio),
      campo('Dónde se compra', establecimiento),
      campo('Enlace', enlace),
    );

    // ---------------------------------------------------------- La propuesta --

    /**
     * A quién se le está buscando el regalo: la primera persona nombrada.
     *
     * Con una etiqueta —«adolescente»— no se propone nada: lo que hace útil a
     * la propuesta es lo que se sabe de alguien concreto, y de un perfil no se
     * sabe nada. Sin clave puesta en el servidor tampoco se ofrece: sería un
     * botón que solo puede fallar.
     */
    const destinataria = () => destinatarios.map((id) => ctx.vista.persona(id)).find(Boolean) || null;

    // A quién pertenece la tanda que hay en la pastilla, para tirarla cuando se
    // cambia de persona: lo propuesto para una no vale para otra.
    let tandaDe = null;

    function ajustarPedir() {
      const persona = destinataria();
      const hay = Boolean(persona) && redaccionDisponible(ctx.vista.datos);
      pedir.hidden = !hay;
      // El hueco dentro del campo se reserva solo cuando el botón está: si no,
      // el título escribe de borde a borde.
      if (hay) campoQue.setAttribute('data-con-destello', '');
      else campoQue.removeAttribute('data-con-destello');
      if (persona) pedir.setAttribute('aria-label', `Que la IA proponga un regalo para ${persona.nombre}`);

      if (tandaDe && persona?.id !== tandaDe) {
        tandaDe = null;
        carrusel.olvidar();
      }
    }

    /** El destello: la primera vez pide; después vuelve a enseñar lo que ya hay,
     *  que no cuesta nada y es lo que espera quien lo cerró sin usarlo. */
    function abrirPropuestas() {
      toque();
      tandaDe = destinataria()?.id || null;
      carrusel.abrir();
    }

    /** Aceptar baja la propuesta a los campos y recoge la pastilla. La tanda se
     *  queda: volver a tocar el destello la enseña por donde iba. */
    function usarLaPropuesta(propuesta) {
      toque();
      titulo.value = propuesta.que;
      if (propuesta.porque) descripcion.value = propuesta.porque;
      carrusel.cerrar();
    }

    ajustarPedir();

    // ----------------------------------------------------------- Guardar --

    const guardarIdea = async () => {
      if (!titulo.value.trim()) { titulo.focus(); return; }
      const campos = {
        titulo: titulo.value.trim(),
        descripcion: descripcion.value.trim(),
        categoria_id: categoria.value || null,
        precio_max: precio.value ? Number(precio.value) : null,
        establecimiento: establecimiento.value.trim(),
        enlace: enlace.value.trim(),
        orientaciones: [
          ...destinatarios.map((persona_id) => ({ persona_id })),
          ...etiquetas.map((etiqueta_id) => ({ etiqueta_id })),
        ],
      };

      if (!existente) {
        Object.assign(campos, {
          // Una idea cuyo destinatario es su propio autor se trata como deseo: de
          // otro modo la ocultación la haría desaparecer al crearla.
          tipo: soloParaMi() ? 'deseo' : 'sugerencia',
          estado: 'activa',
          autor_id: ctx.vista.yo.id,
          activa: 1,
        });
      }

      // El tipo, el estado y la autoría no se reescriben al editar: una idea que
      // ya está en curso no vuelve a activa por corregirle el precio, y quien la
      // apuntó sigue siendo quien la apuntó.
      await guardar('idea', existente ? existente.id : nuevoId(), campos);
      recordarElegidos('regalo', destinatarios);
      // Lo que se acaba de apuntar tiene que verse. Con un filtro puesto para
      // otra persona no saldría en la lista, y guardar algo que no aparece por
      // ningún lado no se lee como un filtro: se lee como que no se ha guardado.
      if (filtroPersona && !destinatarios.includes(filtroPersona)) filtroPersona = null;
      toque('media');
      cerrarHoja();
      avisar(existente ? 'Idea actualizada'
        : soloParaMi() ? 'Apuntado en lo que pides' : 'Idea apuntada');
      ctx.refrescar();
    };

    titulo.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') guardarIdea(); });

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', { class: 'boton crecer', type: 'button', onclick: guardarIdea }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  }, [borrarIdea]);
}
