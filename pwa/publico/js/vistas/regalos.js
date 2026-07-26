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
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, opciones, avisar,
  botonIcono, dobleToque, icono,
} from '../ui.js';
import { guardar, retirar, sugerirRegalo } from '../sincronizacion.js';
import {
  ESTADOS_REGALO, estaActivo, formatearImporte, nuevoId, redaccionDisponible,
} from '../modelo.js';
import { iso, hoy } from '../semana.js';
import { toque } from '../native.js';

let seccion = 'ideas';
let filtroPersona = null;

export function reiniciarRegalos() {
  seccion = 'ideas';
  filtroPersona = null;
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
  const personas = ctx.vista.personas();
  const contenedor = el('div', { class: 'cuerpo-ideas' });

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
        `de ${ctx.vista.nombre(idea.autor_id)}`,
      ].filter(Boolean).join(' · '),
    }),
  ]);
}

// ------------------------------------------------------------- Ocasiones --

function vistaOcasiones(ctx) {
  const ocasiones = [...(ctx.vista.datos.ocasiones || [])]
    .filter((o) => estaActivo(o, 'activa'))
    .sort((a, b) => (a.estado === b.estado ? a.fecha.localeCompare(b.fecha) : a.estado === 'abierta' ? -1 : 1));

  const contenedor = el('div', {});
  const abiertas = ocasiones.filter((o) => o.estado === 'abierta');
  const cerradas = ocasiones.filter((o) => o.estado === 'cerrada');

  const bloque = (titulo, lista) => {
    if (!lista.length) return null;
    return el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: titulo }),
      ...lista.map((ocasion) => tarjetaDeOcasion(ocasion, ctx)),
    ]);
  };

  contenedor.append(bloque('En marcha', abiertas));
  if (!abiertas.length) {
    contenedor.append(el('p', { class: 'vacio', texto: 'Ninguna ocasión abierta.' }));
  }
  contenedor.append(bloque('Cerradas', cerradas));

  contenedor.append(el('div', { class: 'grupo' }, [
    el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: () => abrirFormularioOcasion(ctx) }, [
      'Nueva ocasión',
    ]),
  ]));
  return contenedor;
}

function tarjetaDeOcasion(ocasion, ctx) {
  const regalos = ctx.vista.regalosDe(ocasion.id);
  const pendientes = regalos.filter((r) => r.estado === 'pendiente').length;
  const mios = regalos.filter((r) => r.responsable_id === ctx.vista.yo.id && r.estado === 'pendiente').length;

  return el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirOcasion(ocasion.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: ocasion.nombre }),
      el('span', { class: 'etiqueta empujar', texto: ocasion.fecha }),
    ]),
    el('p', {
      texto: [
        `${ocasion.participantes?.length || 0} personas`,
        `${regalos.length} regalos`,
        pendientes ? `${pendientes} por comprar` : 'todo comprado',
        mios ? `tú tienes ${mios}` : null,
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
  });
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
        : el('button', {
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
    const persona = seleccion(
      ctx.vista.personas().map((p) => ({ valor: p.id, texto: p.nombre })),
      destinos[0] || ctx.vista.personas()[0]?.id,
    );
    cuerpo.append(campo('Ocasión', ocasion), campo('Para quién', persona));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          await crearRegalo(ctx, { ocasionId: ocasion.value, destinatario: persona.value, idea });
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
 */
export function abrirSelectorDeRegalo(ctx, { evento = null, ocasion = null, destinatario = null } = {}) {
  const candidatos = evento
    ? ctx.vista.participantes(evento).concat(ctx.vista.protagonistas(evento))
    : (ocasion?.participantes || []);
  const relevantes = new Set(candidatos.filter((id) => id !== ctx.vista.yo.id));

  const apuntadas = ctx.vista.banco();
  const propuestas = apuntadas.filter((idea) => (idea.orientaciones || []).some((o) => relevantes.has(o.persona_id)));
  const resto = apuntadas.filter((idea) => !propuestas.includes(idea));

  abrirHoja('Asociar un regalo', (cuerpo) => {
    const personas = ctx.vista.personas().filter((p) => p.id !== ctx.vista.yo.id);
    const para = seleccion(
      personas.map((p) => ({ valor: p.id, texto: p.nombre })),
      destinatario || [...relevantes][0] || personas[0]?.id,
    );
    cuerpo.append(campo('Para quién', para));

    const elegir = async (idea) => {
      let destino = ocasion;
      if (!destino && evento) destino = await asegurarOcasionDe(evento, ctx);
      if (!destino) { avisar('No hay ocasión donde ponerlo'); return; }
      await crearRegalo(ctx, { ocasionId: destino.id, destinatario: para.value, idea });
      cerrarHoja(); avisar('Regalo asociado'); ctx.refrescar();
    };

    const listar = (titulo, lista) => {
      if (!lista.length) return;
      cuerpo.append(el('div', { class: 'grupo' }, [
        el('p', { class: 'grupo-titulo', texto: titulo }),
        ...lista.map((idea) => el('button', { class: 'tarjeta', type: 'button', onclick: () => elegir(idea) }, [
          el('h3', { texto: idea.titulo }),
          el('p', { texto: `de ${ctx.vista.nombre(idea.autor_id)}` }),
        ])),
      ]));
    };

    listar('Para quien participa', propuestas);
    listar('El resto de las ideas', resto);

    cuerpo.append(el('div', { class: 'grupo' }, [
      el('button', {
        class: 'boton', 'data-tono': 'discreto', type: 'button',
        onclick: () => elegir(null),
      }, ['Crear un regalo suelto, sin idea previa']),
    ]));
  });
}

/** Cuando se asocia un regalo desde un evento que todavía no tiene ocasión
 *  vinculada, esta se crea de forma automática (spec funcional §6.4). */
async function asegurarOcasionDe(evento, ctx) {
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

  const ocasion = ctx.vista.ocasion(ocasionId);
  if (ocasion && !(ocasion.participantes || []).includes(destinatario)) {
    await guardar('ocasion', ocasionId, {
      participantes: [...(ocasion.participantes || []), destinatario],
    });
  }
}

// ------------------------------------------------------- Nueva ocasión --

function abrirFormularioOcasion(ctx, { duplicarDe = null } = {}) {
  const origen = duplicarDe ? ctx.vista.ocasion(duplicarDe) : null;
  let participantes = origen ? [...(origen.participantes || [])] : [];

  abrirHoja(origen ? 'Duplicar la ocasión' : 'Nueva ocasión', (cuerpo) => {
    const nombre = entrada({ value: origen ? `${origen.nombre.replace(/\s*\d{4}$/, '')} ${new Date().getFullYear() + 1}` : '', placeholder: 'Navidad 2026' });
    const fecha = el('input', { type: 'date', value: iso(hoy()) });
    cuerpo.append(campo('Cómo se llama', nombre), campo('Cuándo', fecha));
    cuerpo.append(campo(
      'Para quién',
      opciones(ctx.vista.personas().map((p) => ({ valor: p.id, texto: p.nombre })), participantes, (v) => { participantes = v; }),
      origen ? 'Se traen las personas del año pasado. Los importes y los regalos no: repetirlos induce a no revisarlos.' : null,
    ));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!nombre.value.trim()) { avisar('Ponle un nombre'); return; }
          await guardar('ocasion', nuevoId(), {
            nombre: nombre.value.trim(), fecha: fecha.value, estado: 'abierta',
            autor_id: ctx.vista.yo.id, activa: 1, participantes,
          });
          cerrarHoja(); avisar('Ocasión creada'); ctx.refrescar();
        },
      }, ['Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

// ----------------------------------------------------- Apuntar y editar --

/**
 * Captura en un gesto: un campo de título y un botón de guardar. La
 * clasificación se ofrece debajo pero no se reclama. Si registrar una idea
 * cuesta más de diez segundos, no se registra (specs/ux.md §2 y §3).
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
  let etiquetas = existente ? orientaciones.map((o) => o.etiqueta_id).filter(Boolean) : [];

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
    const titulo = entrada({ value: existente?.titulo || '', placeholder: 'Botas de montar', autofocus: true });
    cuerpo.append(campo('Qué', titulo));

    // La propuesta va aquí y no en un sitio propio porque lo que hace es
    // rellenar estos campos: se pide desde donde se iba a escribir a mano.
    const rotulo = el('span', {});
    const sugerir = el('button', {
      class: 'boton boton-ia', 'data-tono': 'discreto', type: 'button', hidden: true,
      onclick: () => proponerUnRegalo(),
    }, [icono('destello'), rotulo]);
    cuerpo.append(sugerir);

    // Al editar se abre desplegado y sin conmutador: quien corrige viene a por
    // un campo concreto, y esconderlo detrás de un enlace sobra.
    const extra = el('div', { class: 'hoja-seccion', hidden: !existente });
    const conmutador = el('button', {
      class: 'enlace-discreto', type: 'button',
      onclick: () => { extra.hidden = !extra.hidden; conmutador.textContent = extra.hidden ? 'Clasificarla' : 'Dejarlo así'; },
    }, ['Clasificarla']);
    if (!existente) cuerpo.append(conmutador);
    cuerpo.append(extra);

    const avisoEtiquetas = el('p', { class: 'pista', 'data-tono': 'aviso', hidden: !etiquetas.length });
    avisoEtiquetas.textContent = 'Las etiquetas clasifican pero no ocultan: una idea etiquetada como «adolescente» la ven también las hijas. Para reservarla, nombra a la persona.';

    const descripcion = el('textarea', { placeholder: 'Para acordarte dentro de seis meses' });
    descripcion.value = existente?.descripcion || '';
    const categoria = seleccion(
      [{ valor: '', texto: 'Sin categoría' }, ...ctx.vista.categorias().map((c) => ({ valor: c.id, texto: c.nombre }))],
      existente?.categoria_id || '',
    );
    const precio = entrada({ type: 'number', inputmode: 'decimal', placeholder: '120', value: existente?.precio_max ?? '' });
    const establecimiento = entrada({ value: existente?.establecimiento || '', placeholder: 'Decathlon' });
    const enlace = entrada({ type: 'url', placeholder: 'https://', value: existente?.enlace || '' });

    extra.append(
      campo('Para quién', opciones(
        ctx.vista.personas().map((p) => ({ valor: p.id, texto: p.nombre })),
        destinatarios,
        (v) => { destinatarios = v; ajustarSugerencia(); },
      ), 'Nombrar a una persona con cuenta oculta la idea para ella, de forma automática y permanente.'),
      campo('O un perfil', opciones(
        ctx.vista.etiquetas().map((e) => ({ valor: e.id, texto: e.nombre })),
        etiquetas,
        (v) => { etiquetas = v; avisoEtiquetas.hidden = v.length === 0; },
      )),
      avisoEtiquetas,
      campo('Descripción', descripcion),
      campo('Categoría', categoria),
      campo('Precio aproximado', precio),
      campo('Dónde se compra', establecimiento),
      campo('Enlace', enlace),
    );

    /**
     * A quién se le está buscando el regalo: la primera persona nombrada.
     *
     * Con una etiqueta —«adolescente»— no se propone nada: lo que hace útil a
     * la propuesta es lo que se sabe de alguien concreto, y de un perfil no se
     * sabe nada. Sin clave puesta en el servidor tampoco se ofrece: sería un
     * botón que solo puede fallar.
     */
    const destinataria = () => destinatarios.map((id) => ctx.vista.persona(id)).find(Boolean) || null;

    function ajustarSugerencia() {
      const persona = destinataria();
      sugerir.hidden = !persona || !redaccionDisponible(ctx.vista.datos);
      if (persona) rotulo.textContent = `Que lo proponga la IA para ${persona.nombre}`;
    }

    /**
     * La propuesta llega en dos líneas —el regalo y por qué encaja— y se
     * reparte entre el título y la descripción, que es donde se iba a escribir.
     *
     * Se pisa lo que hubiera escrito, y a propósito: lo que hubiera va antes
     * como pista, de modo que escribir «algo para el verano» y pedir la
     * propuesta es una forma de encargarla, no de perderla.
     */
    async function proponerUnRegalo() {
      const persona = destinataria();
      if (!persona) return;

      toque();
      const antes = rotulo.textContent;
      sugerir.disabled = true;
      rotulo.textContent = 'Pensando…';

      try {
        const pista = [titulo.value.trim(), descripcion.value.trim()].filter(Boolean).join('. ');
        const texto = await sugerirRegalo(persona.id, pista);
        const lineas = String(texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
        if (!lineas.length) { avisar('No ha propuesto nada'); return; }

        titulo.value = lineas[0].replace(/^[-–—·*\d.)\s]+/, '');
        if (lineas.length > 1) descripcion.value = lineas.slice(1).join(' ');
        // El porqué queda en la descripción, que en una idea nueva está
        // plegada: se despliega para que se vea lo que se acaba de escribir.
        if (extra.hidden) conmutador.click();
      } catch (error) {
        avisar(error.message || 'No he podido pedir la propuesta');
      } finally {
        sugerir.disabled = false;
        rotulo.textContent = antes;
      }
    }

    ajustarSugerencia();

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
        const soloYo = destinatarios.length === 1 && destinatarios[0] === ctx.vista.yo.id && !etiquetas.length;
        Object.assign(campos, {
          // Una idea cuyo destinatario es su propio autor se trata como deseo: de
          // otro modo la ocultación la haría desaparecer al crearla.
          tipo: soloYo ? 'deseo' : 'sugerencia',
          estado: 'activa',
          autor_id: ctx.vista.yo.id,
          activa: 1,
        });
      }

      // El tipo, el estado y la autoría no se reescriben al editar: una idea que
      // ya está en curso no vuelve a activa por corregirle el precio, y quien la
      // apuntó sigue siendo quien la apuntó.
      await guardar('idea', existente ? existente.id : nuevoId(), campos);
      toque('media');
      cerrarHoja();
      avisar(existente ? 'Idea actualizada' : 'Idea apuntada');
      ctx.refrescar();
    };

    titulo.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') guardarIdea(); });

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', { class: 'boton crecer', type: 'button', onclick: guardarIdea }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  }, [borrarIdea]);
}
