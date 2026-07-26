/**
 * Regalos: el banco de ideas y las campañas.
 *
 * Se unifican en una sola sección porque son el mismo objeto en dos momentos de
 * su vida: hay un banco y hay campañas, y una idea pasa de uno a otras. La
 * distinción entre «Ideas» y «Ocasiones» existe en el modelo de datos y no en
 * la cabeza de quien lo usa (specs/ux.md §6).
 */

import {
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, opciones, avisar,
} from '../ui.js';
import { guardar, retirar } from '../sincronizacion.js';
import { ESTADOS_REGALO, estaActivo, formatearImporte, nuevoId } from '../modelo.js';
import { iso, hoy } from '../semana.js';

let seccion = 'banco';
let filtroPersona = null;

export function reiniciarRegalos() {
  seccion = 'banco';
  filtroPersona = null;
}

export function pintarRegalos(pantalla, subcabecera, ctx) {
  vaciar(subcabecera).append(
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Sección de regalos' }, [
      ...[['banco', 'Banco'], ['campanas', 'Campañas'], ['presupuesto', 'Presupuesto']]
        .filter(([clave]) => clave !== 'presupuesto' || ctx.vista.esAdministrador())
        .map(([clave, texto]) =>
          el('button', {
            type: 'button',
            'aria-pressed': seccion === clave ? 'true' : 'false',
            onclick: () => { seccion = clave; ctx.refrescar(); },
          }, [texto]),
        ),
    ]),
  );

  vaciar(pantalla);
  if (seccion === 'banco') pantalla.append(vistaBanco(ctx));
  else if (seccion === 'campanas') pantalla.append(vistaCampanas(ctx));
  else pantalla.append(vistaPresupuesto(ctx));
}

export const seccionActual = () => seccion;

// ----------------------------------------------------------------- Banco --

function vistaBanco(ctx) {
  const personas = ctx.vista.personas();
  const contenedor = el('div', {});

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
    grupo.append(el('p', { class: 'vacio', texto: 'Nada por aquí todavía. El botón de abajo apunta una idea en diez segundos.' }));
  }
  for (const idea of ideas) grupo.append(tarjetaDeIdea(idea, ctx));

  contenedor.append(grupo);
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

// -------------------------------------------------------------- Campañas --

function vistaCampanas(ctx) {
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
    contenedor.append(el('p', { class: 'vacio', texto: 'Ninguna campaña abierta.' }));
  }
  contenedor.append(bloque('Cerradas', cerradas));

  contenedor.append(el('div', { class: 'grupo' }, [
    el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: () => abrirFormularioOcasion(ctx) }, [
      'Nueva campaña',
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

  abrirHoja(idea.titulo, (cuerpo) => {
    if (idea.descripcion) cuerpo.append(el('p', { texto: idea.descripcion }));
    cuerpo.append(el('p', {
      class: 'pista',
      texto: [
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
          }, ['Llevar a una campaña']),
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
  });
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
    cuerpo.append(campo('Lo que costó', coste, 'Opcional. Sin él, el panel de presupuesto lo dice en lugar de fingir un ahorro.'));

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: async () => { await retirar('regalo', regalo.id); cerrarHoja(); avisar('Regalo retirado'); ctx.refrescar(); },
      }, ['Quitar de la campaña']),
    ]));
  });
}

// -------------------------------------------------------------- Promoción --

function abrirPromocion(idea, ctx) {
  const abiertas = (ctx.vista.datos.ocasiones || []).filter((o) => o.estado === 'abierta' && estaActivo(o, 'activa'));
  const destinos = (idea.orientaciones || []).map((o) => o.persona_id).filter(Boolean);

  abrirHoja('Llevar a una campaña', (cuerpo) => {
    if (!abiertas.length) {
      cuerpo.append(el('p', { class: 'pista', texto: 'No hay ninguna campaña abierta. Crea una desde Regalos → Campañas.' }));
      return;
    }
    const ocasion = seleccion(abiertas.map((o) => ({ valor: o.id, texto: `${o.nombre} · ${o.fecha}` })), abiertas[0].id);
    const persona = seleccion(
      ctx.vista.personas().map((p) => ({ valor: p.id, texto: p.nombre })),
      destinos[0] || ctx.vista.personas()[0]?.id,
    );
    cuerpo.append(campo('Campaña', ocasion), campo('Para quién', persona));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          await crearRegalo(ctx, { ocasionId: ocasion.value, destinatario: persona.value, idea });
          cerrarHoja(); avisar('Añadido a la campaña'); ctx.refrescar();
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

  const banco = ctx.vista.banco();
  const propuestas = banco.filter((idea) => (idea.orientaciones || []).some((o) => relevantes.has(o.persona_id)));
  const resto = banco.filter((idea) => !propuestas.includes(idea));

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
      if (!destino) { avisar('No hay campaña donde ponerlo'); return; }
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

    listar('Del banco, para quien participa', propuestas);
    listar('El resto del banco', resto);

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

// --------------------------------------------------------------- Campañas --

function abrirFormularioOcasion(ctx, { duplicarDe = null } = {}) {
  const origen = duplicarDe ? ctx.vista.ocasion(duplicarDe) : null;
  let participantes = origen ? [...(origen.participantes || [])] : [];

  abrirHoja(origen ? 'Duplicar campaña' : 'Nueva campaña', (cuerpo) => {
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
          cerrarHoja(); avisar('Campaña creada'); ctx.refrescar();
        },
      }, ['Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

// ------------------------------------------------------------ Presupuesto --

/** El panel queda reservado a los administradores y distingue el gasto
 *  registrado del total, indicando cuántos regalos carecen de importe: de no
 *  hacerlo mostraría una desviación favorable inexistente (spec funcional §6.3). */
function vistaPresupuesto(ctx) {
  const abiertas = (ctx.vista.datos.ocasiones || []).filter((o) => o.estado === 'abierta' && estaActivo(o, 'activa'));
  if (!abiertas.length) return el('p', { class: 'vacio', texto: 'Ninguna campaña abierta que presupuestar.' });

  const contenedor = el('div', {});

  for (const ocasion of abiertas) {
    const filas = [];
    let previsto = 0;
    let registrado = 0;
    let sinImporte = 0;

    for (const personaId of ocasion.participantes || []) {
      const presupuesto = (ocasion.presupuestos || []).find((p) => p.persona_id === personaId);
      const gasto = ctx.vista.gastoDe(ocasion.id, personaId);
      previsto += presupuesto?.importe || 0;
      registrado += gasto.registrado;
      sinImporte += gasto.sinImporte;

      const importe = entrada({ type: 'number', inputmode: 'decimal', step: '1', value: presupuesto?.importe ?? '' });
      importe.addEventListener('change', async () => {
        await guardar('presupuesto', `${ocasion.id}:${personaId}`, {
          ocasion_id: ocasion.id, persona_id: personaId, importe: Number(importe.value) || 0,
        });
        ctx.refrescar();
      });

      filas.push(el('tr', {}, [
        el('td', { texto: ctx.vista.nombre(personaId) }),
        el('td', {}, [importe]),
        el('td', { texto: formatearImporte(gasto.registrado) }),
        el('td', { texto: gasto.sinImporte ? `${gasto.sinImporte} sin importe` : '—' }),
      ]));
    }

    contenedor.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: ocasion.nombre }),
      el('div', { class: 'desplazable' }, [
        el('table', { class: 'presupuesto' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', { texto: 'Persona' }), el('th', { texto: 'Previsto' }),
            el('th', { texto: 'Registrado' }), el('th', { texto: 'Pendiente de anotar' }),
          ])]),
          el('tbody', {}, filas),
        ]),
      ]),
      el('div', { class: 'barra', 'data-excedido': registrado > previsto && previsto > 0 ? 'si' : 'no' }, [
        el('i', { style: `width:${previsto ? Math.min(100, (registrado / previsto) * 100) : 0}%` }),
      ]),
      el('p', {
        class: 'pista',
        texto: `Previsto ${formatearImporte(previsto)} · registrado ${formatearImporte(registrado)}` +
          (sinImporte ? ` · ${sinImporte} ${sinImporte === 1 ? 'regalo' : 'regalos'} sin importe anotado` : ''),
      }),
    ]));
  }

  return contenedor;
}

// ------------------------------------------------------ Captura de una idea --

/**
 * Captura en un gesto: un campo de título y un botón de guardar. La
 * clasificación se ofrece debajo pero no se reclama. Si registrar una idea
 * cuesta más de diez segundos, no se registra (specs/ux.md §2 y §3).
 */
export function abrirCapturaDeIdea(ctx, { paraPersona = null } = {}) {
  let destinatarios = paraPersona ? [paraPersona] : [];
  let etiquetas = [];

  abrirHoja('Apuntar una idea', (cuerpo) => {
    const titulo = entrada({ placeholder: 'Botas de montar', autofocus: true });
    cuerpo.append(campo('Qué', titulo));

    const guardarIdea = async () => {
      if (!titulo.value.trim()) { titulo.focus(); return; }
      const soloYo = destinatarios.length === 1 && destinatarios[0] === ctx.vista.yo.id && !etiquetas.length;
      await guardar('idea', nuevoId(), {
        // Una idea cuyo destinatario es su propio autor se trata como deseo: de
        // otro modo la ocultación la haría desaparecer al crearla.
        tipo: soloYo ? 'deseo' : 'sugerencia',
        titulo: titulo.value.trim(),
        descripcion: descripcion.value.trim(),
        categoria_id: categoria.value || null,
        precio_max: precio.value ? Number(precio.value) : null,
        enlace: enlace.value.trim(),
        estado: 'activa',
        autor_id: ctx.vista.yo.id,
        activa: 1,
        orientaciones: [
          ...destinatarios.map((persona_id) => ({ persona_id })),
          ...etiquetas.map((etiqueta_id) => ({ etiqueta_id })),
        ],
      });
      cerrarHoja(); avisar('Idea apuntada'); ctx.refrescar();
    };

    titulo.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') guardarIdea(); });

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', { class: 'boton crecer', type: 'button', onclick: guardarIdea }, ['Guardar']),
    ]));

    const extra = el('div', { class: 'hoja-seccion', hidden: true });
    const conmutador = el('button', {
      class: 'enlace-discreto', type: 'button',
      onclick: () => { extra.hidden = !extra.hidden; conmutador.textContent = extra.hidden ? 'Clasificarla' : 'Dejarlo así'; },
    }, ['Clasificarla']);
    cuerpo.append(conmutador, extra);

    const avisoEtiquetas = el('p', { class: 'pista', 'data-tono': 'aviso', hidden: true });
    avisoEtiquetas.textContent = 'Las etiquetas clasifican pero no ocultan: una idea etiquetada como «adolescente» la ven también las hijas. Para reservarla, nombra a la persona.';

    const descripcion = el('textarea', { placeholder: 'Para acordarte dentro de seis meses' });
    const categoria = seleccion(
      [{ valor: '', texto: 'Sin categoría' }, ...ctx.vista.categorias().map((c) => ({ valor: c.id, texto: c.nombre }))],
      '',
    );
    const precio = entrada({ type: 'number', inputmode: 'decimal', placeholder: '120' });
    const enlace = entrada({ type: 'url', placeholder: 'https://' });

    extra.append(
      campo('Para quién', opciones(
        ctx.vista.personas().map((p) => ({ valor: p.id, texto: p.nombre })),
        destinatarios,
        (v) => { destinatarios = v; },
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
      campo('Enlace', enlace),
    );
  });
}
