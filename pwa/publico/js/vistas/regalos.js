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
import { guardar, retirar, sugerirRegalos } from '../sincronizacion.js';
import { recordarDestinatarios, ultimosDestinatarios } from '../almacen.js';
import {
  ESTADOS_REGALO, estaActivo, formatearImporte, normalizar, nuevoId, redaccionDisponible,
} from '../modelo.js';
import { iso, hoy } from '../semana.js';
import { toque } from '../native.js';

/** Cuántos «últimos» se enseñan al abrir el buscador de gente. Con cuatro, la
 *  lista entra en una línea y no empuja el formulario. */
const CUANTOS_ULTIMOS = 4;

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
    const nombre = entrada({ value: origen ? `${origen.nombre.replace(/\s*\d{4}$/, '')} ${new Date().getFullYear() + 1}` : '' });
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

    const texto = el('div', { class: 'propuesta-texto', 'aria-live': 'polite' });
    const cuenta = el('span', { class: 'propuesta-cuenta' });
    const atras = el('button', {
      class: 'propuesta-flecha', type: 'button', 'aria-label': 'Propuesta anterior',
      onclick: () => mover(-1),
    }, ['‹']);
    const adelante = el('button', {
      class: 'propuesta-flecha', type: 'button', 'aria-label': 'Propuesta siguiente',
      onclick: () => mover(1),
    }, ['›']);
    const usarla = el('button', {
      class: 'boton-mini', 'data-tono': 'principal', type: 'button', onclick: () => usarLaPropuesta(),
    }, ['Usarla']);
    const otras = el('button', {
      class: 'boton-mini', type: 'button', onclick: () => pedirPropuestas({ mas: true }),
    }, ['Otras cinco']);

    const carrusel = el('div', { class: 'propuesta', hidden: true }, [
      el('div', { class: 'propuesta-cuerpo' }, [atras, texto, adelante]),
      el('div', { class: 'propuesta-pie' }, [usarla, otras, cuenta]),
    ]);
    cuerpo.append(carrusel);

    // ------------------------------------------------------- Los demás campos --

    const descripcion = el('textarea', {});
    descripcion.value = existente?.descripcion || '';

    cuerpo.append(campoDeGente());
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

    // ---------------------------------------------------------- Para quién --

    /**
     * Para quién: los cuatro de casa, y el resto a un toque.
     *
     * En reposo se ven solo los de casa —que son con diferencia a quienes más
     * se les apunta— más lo que ya se haya elegido de fuera, que no puede
     * esconderse nunca: una idea guardada sin ver para quién es sería un
     * silencio peligroso en la única pantalla donde se decide quién no la ve.
     *
     * El «+» abre un buscador con una sola lista debajo, que en reposo son «los
     * últimos» de este teléfono y al escribir pasa a ser el resultado. No hay
     * dos listas a la vez, y el hueco es el mismo antes y después.
     *
     * Va dentro de la hoja y no en otra encima porque la aplicación tiene una
     * sola: abrir la segunda cerraría el formulario a medio escribir.
     */
    function campoDeGente() {
      const fila = el('div', { class: 'opciones' });
      const busca = entrada({
        type: 'search', 'aria-label': 'Buscar a una persona',
        placeholder: 'Buscar por nombre o parentesco',
      });
      const rotuloLista = el('p', { class: 'buscagente-rotulo' });
      const lista = el('div', { class: 'opciones' });
      const panel = el('div', { class: 'buscagente', hidden: true }, [busca, rotuloLista, lista]);

      let abierto = false;

      const deCasa = ctx.vista.personasDe('familia');
      const enLaFila = () => new Set([...deCasa.map((p) => p.id), ...destinatarios]);

      const pastilla = (persona, alElegir = null) => {
        const marcada = destinatarios.includes(persona.id);
        return el('button', {
          class: 'opcion', type: 'button',
          'aria-pressed': marcada ? 'true' : 'false',
          onclick: () => {
            destinatarios = marcada
              ? destinatarios.filter((id) => id !== persona.id)
              : [...destinatarios, persona.id];
            if (alElegir) alElegir();
            ajustarPedir();
            pintar();
          },
        }, [persona.nombre, marcada ? el('span', { class: 'opcion-quitar', texto: '×' }) : null]);
      };

      function pintarFila() {
        vaciar(fila);
        for (const persona of deCasa) fila.append(pastilla(persona));
        for (const id of destinatarios) {
          const persona = ctx.vista.persona(id);
          if (persona && !deCasa.some((p) => p.id === id)) fila.append(pastilla(persona));
        }
        fila.append(el('button', {
          class: 'opcion opcion-mas', type: 'button',
          'aria-expanded': abierto ? 'true' : 'false',
          'aria-label': abierto ? 'Cerrar la búsqueda' : 'Buscar a otra persona',
          onclick: () => {
            abierto = !abierto;
            busca.value = '';
            pintar();
            if (abierto && !('ontouchstart' in window)) busca.focus();
          },
        }, [abierto ? '×' : '+']));
      }

      /**
       * Con quién se abre el buscador: los últimos a quienes se les apuntó algo
       * en este teléfono.
       *
       * Y cuando no llegan a cuatro —el primer día, un móvil recién estrenado—,
       * se completa con aquellos a quienes más se les apunta en el hogar y, si
       * aún faltan, con el resto de la gente. Abrir y encontrar el hueco vacío
       * sería la peor bienvenida, y en un hogar recién dado de alta sería
       * además la única.
       */
      function conQuienAbrir(candidatos) {
        const porId = new Map(candidatos.map((p) => [p.id, p]));
        const recientes = ultimosDestinatarios().filter((id) => porId.has(id) && id !== ctx.vista.yo.id);
        const orden = [...recientes, ...ctx.vista.masRegaladas(), ...candidatos.map((p) => p.id)];

        const elegidos = [];
        for (const id of orden) {
          if (id === ctx.vista.yo.id || !porId.has(id)) continue;
          if (elegidos.some((p) => p.id === id)) continue;
          elegidos.push(porId.get(id));
          if (elegidos.length === CUANTOS_ULTIMOS) break;
        }
        return { gente: elegidos, hayRecientes: recientes.length > 0 };
      }

      function pintarLista() {
        vaciar(lista);
        const aguja = normalizar(busca.value).trim();
        // Quien ya está en la fila no se repite aquí: se toca arriba.
        const puestos = enLaFila();
        const candidatos = ctx.vista.personas().filter((p) => !puestos.has(p.id));

        if (!aguja) {
          const { gente, hayRecientes } = conQuienAbrir(candidatos);
          // El rótulo dice la verdad: «los últimos» solo cuando de verdad lo son.
          rotuloLista.textContent = hayRecientes ? 'Los últimos'
            : gente.length ? 'De tu gente' : 'Escribe un nombre o un parentesco';
          for (const persona of gente) lista.append(pastilla(persona));
          return;
        }

        const hallados = candidatos.filter(
          (p) => normalizar(p.nombre).includes(aguja) || normalizar(p.parentesco).includes(aguja),
        );
        rotuloLista.textContent = hallados.length ? 'Resultados' : 'Nadie con ese nombre';
        // Elegir buscando cierra: se venía a por una persona concreta.
        for (const persona of hallados) {
          lista.append(pastilla(persona, () => { abierto = false; busca.value = ''; }));
        }
      }

      function pintar() {
        pintarFila();
        panel.hidden = !abierto;
        if (abierto) pintarLista();
      }

      busca.addEventListener('input', pintarLista);
      // Enter dentro del buscador no guarda la idea: aquí se está eligiendo.
      busca.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') evento.preventDefault();
      });

      pintar();
      return el('div', { class: 'campo' }, [
        el('label', { texto: 'Para quién' }),
        fila,
        panel,
        el('p', {
          class: 'pista',
          texto: 'Nombrar a una persona con cuenta oculta la idea para ella, de forma automática y permanente.',
        }),
      ]);
    }

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

    // La tanda vive mientras la hoja esté abierta. «Otras cinco» no la sustituye:
    // añade al final, de modo que se puede volver atrás a la que gustaba.
    let tanda = [];
    let indice = 0;
    let tandaDe = null;
    let pistaDeLaTanda = '';

    function ajustarPedir() {
      const persona = destinataria();
      const hay = Boolean(persona) && redaccionDisponible(ctx.vista.datos);
      pedir.hidden = !hay;
      // El hueco dentro del campo se reserva solo cuando el botón está: si no,
      // el título escribe de borde a borde.
      if (hay) campoQue.setAttribute('data-con-destello', '');
      else campoQue.removeAttribute('data-con-destello');
      if (persona) pedir.setAttribute('aria-label', `Que la IA proponga un regalo para ${persona.nombre}`);

      // Cambiar de persona invalida lo propuesto para la anterior.
      if (tandaDe && persona?.id !== tandaDe) {
        tanda = [];
        indice = 0;
        tandaDe = null;
        carrusel.hidden = true;
      }
    }

    /** El destello: la primera vez pide; después vuelve a enseñar lo que ya hay,
     *  que no cuesta nada y es lo que espera quien lo cerró sin usarlo. */
    function abrirPropuestas() {
      toque();
      if (tanda.length) { carrusel.hidden = false; pintarPropuesta(); return; }
      pedirPropuestas({ mas: false });
    }

    function mover(pasos) {
      indice = Math.min(tanda.length - 1, Math.max(0, indice + pasos));
      pintarPropuesta();
    }

    /**
     * El marco no se mueve: solo cambia el texto de dentro. Es lo que permite
     * pasar cinco propuestas seguidas sin que «Usarla» se escape de debajo del
     * dedo, y por eso el hueco del texto tiene el alto reservado en el CSS.
     */
    function pintarPropuesta() {
      const actual = tanda[indice];
      vaciar(texto).append(
        el('p', { class: 'propuesta-que', texto: actual.que }),
        actual.porque ? el('p', { class: 'propuesta-porque', texto: actual.porque }) : null,
      );
      cuenta.textContent = `${indice + 1} / ${tanda.length}`;
      atras.disabled = indice === 0;
      adelante.disabled = indice >= tanda.length - 1;
      usarla.disabled = false;
      otras.disabled = false;
    }

    function esperando() {
      carrusel.hidden = false;
      vaciar(texto).append(el('p', { class: 'propuesta-porque', texto: 'Pensando…' }));
      cuenta.textContent = '';
      for (const boton of [atras, adelante, usarla, otras]) boton.disabled = true;
    }

    /**
     * Una tanda son cinco de una vez, porque lo caro de la llamada es contarle
     * al modelo quién es la persona: pasar de una a otra no vuelve a pedir nada.
     *
     * La pista es lo que hubiera escrito **antes** de pedir la primera, y se
     * conserva: si se mandara lo que hay en los campos, la segunda tanda
     * llevaría dentro la propuesta de la primera y el modelo se repetiría.
     */
    async function pedirPropuestas({ mas }) {
      const persona = destinataria();
      if (!persona) return;
      if (mas) toque();

      if (!mas) {
        pistaDeLaTanda = [titulo.value.trim(), descripcion.value.trim()].filter(Boolean).join('. ');
      }
      const teniamos = tanda.length;
      esperando();

      try {
        const nuevas = await sugerirRegalos(persona.id, {
          pista: pistaDeLaTanda,
          descartadas: tanda.map((propuesta) => propuesta.que),
        });
        if (!nuevas.length) {
          avisar('No ha propuesto nada');
          if (!teniamos) carrusel.hidden = true; else pintarPropuesta();
          return;
        }
        tanda = mas ? [...tanda, ...nuevas] : nuevas;
        tandaDe = persona.id;
        // Al añadir se salta a la primera de las nuevas; las anteriores siguen
        // ahí, a un toque de la flecha de atrás.
        indice = mas ? teniamos : 0;
        pintarPropuesta();
      } catch (error) {
        avisar(error.message || 'No he podido pedir la propuesta');
        if (!teniamos) carrusel.hidden = true; else pintarPropuesta();
      }
    }

    /** Aceptar baja la propuesta a los campos y recoge la tarjeta. La tanda se
     *  queda: volver a tocar el destello la enseña por donde iba. */
    function usarLaPropuesta() {
      const actual = tanda[indice];
      if (!actual) return;
      toque();
      titulo.value = actual.que;
      if (actual.porque) descripcion.value = actual.porque;
      carrusel.hidden = true;
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
      recordarDestinatarios(destinatarios);
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
