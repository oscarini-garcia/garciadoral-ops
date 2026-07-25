/**
 * Familia: el registro de personas y la ficha de cada una.
 *
 * La ficha es la pantalla de detalle más valiosa del producto: reúne el
 * histórico derivado, los atributos acumulados y lo que se le puede regalar en
 * el lugar donde se consultan de verdad, que es cuando alguien se pregunta qué
 * regalar a esa persona concreta (specs/ux.md §7 y §11).
 */

import {
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, avatar, avisar,
} from '../ui.js';
import { guardar } from '../sincronizacion.js';
import { formatearImporte, nuevoId } from '../modelo.js';
import { MESES_LARGOS, hoy, parsearMomento } from '../semana.js';
import { abrirCapturaDeIdea, abrirDetalleIdea, abrirDetalleRegalo } from './regalos.js';

export function pintarFamilia(pantalla, subcabecera, ctx) {
  vaciar(subcabecera);
  vaciar(pantalla);

  const conCuenta = ctx.vista.personasConCuenta();
  const sinCuenta = ctx.vista.personasSinCuenta();

  const rejilla = (personas) => el('div', { class: 'personas' }, personas.map((persona) =>
    el('button', { class: 'persona', type: 'button', onclick: () => abrirFicha(persona.id, ctx) }, [
      avatar(persona),
      el('span', { class: 'persona-nombre', texto: persona.nombre }),
      el('span', { class: 'persona-nota', texto: proximoCumple(persona) }),
    ]),
  ));

  pantalla.append(el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'En casa' }),
    rejilla(conCuenta),
  ]));

  if (sinCuenta.length) {
    pantalla.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: 'El resto de la familia' }),
      rejilla(sinCuenta),
    ]));
  }

  if (ctx.vista.esAdministrador()) {
    pantalla.append(el('div', { class: 'grupo' }, [
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: () => abrirFormularioPersona(ctx) }, [
        'Añadir una persona',
      ]),
    ]));
  }
}

function proximoCumple(persona) {
  if (!persona.fecha_nacimiento) return '';
  const nacimiento = parsearMomento(persona.fecha_nacimiento);
  const referencia = hoy();
  let proximo = new Date(referencia.getFullYear(), nacimiento.getMonth(), nacimiento.getDate());
  if (proximo < referencia) proximo = new Date(referencia.getFullYear() + 1, nacimiento.getMonth(), nacimiento.getDate());
  const dias = Math.round((proximo - referencia) / 86400000);
  if (dias === 0) return 'hoy 🎂';
  if (dias <= 30) return `en ${dias} d`;
  return `${proximo.getDate()} ${MESES_LARGOS[proximo.getMonth()].slice(0, 3)}`;
}

// ------------------------------------------------------------------ Ficha --

export function abrirFicha(personaId, ctx) {
  const persona = ctx.vista.persona(personaId);
  if (!persona) return;
  const esMia = personaId === ctx.vista.yo.id;

  abrirHoja(persona.nombre, (cuerpo) => {
    cuerpo.append(el('div', { class: 'tarjeta-fila' }, [
      avatar(persona),
      el('div', {}, [
        el('p', { texto: [persona.parentesco, persona.tiene_cuenta ? persona.rol : 'sin cuenta'].filter(Boolean).join(' · ') }),
        persona.fecha_nacimiento
          ? el('p', { class: 'pista', texto: `Cumple el ${parsearMomento(persona.fecha_nacimiento).getDate()} de ${MESES_LARGOS[parsearMomento(persona.fecha_nacimiento).getMonth()]}` })
          : null,
      ]),
    ]));

    // Lo que gana valor con el tiempo: tallas, alergias, aficiones.
    const atributos = ctx.vista.atributosDe(personaId);
    cuerpo.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: 'Lo que conviene recordar' }),
      atributos.length
        ? el('div', { class: 'lista' }, atributos.map((atributo) =>
            el('p', { texto: `${atributo.clave}: ${atributo.valor}` })))
        : el('p', { class: 'pista', texto: 'Nada apuntado todavía.' }),
      el('button', {
        class: 'enlace-discreto', type: 'button',
        onclick: () => abrirFormularioAtributo(personaId, ctx),
      }, ['Añadir un dato']),
    ]));

    // La lista de deseos no se oculta nunca a quien la escribe.
    const deseos = ctx.vista.deseosDe(personaId);
    cuerpo.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: esMia ? 'Lo que pides' : `Lo que pide ${persona.nombre}` }),
      deseos.length
        ? el('div', { class: 'lista' }, deseos.map((idea) =>
            el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleIdea(idea.id, ctx) }, [
              el('h3', { texto: idea.titulo }),
            ])))
        : el('p', { class: 'pista', texto: 'Nada por ahora.' }),
      esMia
        ? el('button', {
            class: 'enlace-discreto', type: 'button',
            onclick: () => abrirCapturaDeIdea(ctx, { paraPersona: ctx.vista.yo.id }),
          }, ['Añadir un deseo'])
        : null,
    ]));

    if (esMia) {
      // Sobre el contenido propio, un panel siempre presente. Al ser constante,
      // no informa de nada: ni su aparición ni su desaparición pueden
      // interpretarse (specs/ux.md §3).
      cuerpo.append(el('div', { class: 'sello' }, [
        el('strong', { texto: 'Por aquí no se mira' }),
        el('span', { texto: 'Lo que otros hayan pensado para ti no se enseña aquí.' }),
      ]));
    } else {
      const ideas = ctx.vista.ideasPara(personaId);
      cuerpo.append(el('div', { class: 'grupo' }, [
        el('p', { class: 'grupo-titulo', texto: 'Ideas para regalarle' }),
        ideas.length
          ? el('div', { class: 'lista' }, ideas.map((idea) =>
              el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleIdea(idea.id, ctx) }, [
                el('h3', { texto: idea.titulo }),
                el('p', { texto: `de ${ctx.vista.nombre(idea.autor_id)}${idea.estado === 'en_curso' ? ' · en curso' : ''}` }),
              ])))
          : el('p', { class: 'pista', texto: 'Ninguna todavía.' }),
        el('button', {
          class: 'enlace-discreto', type: 'button',
          onclick: () => abrirCapturaDeIdea(ctx, { paraPersona: personaId }),
        }, [`Apuntar una idea para ${persona.nombre}`]),
      ]));

      const historico = ctx.vista.historicoDe(personaId);
      cuerpo.append(el('div', { class: 'grupo' }, [
        el('p', { class: 'grupo-titulo', texto: 'Lo que ya recibió' }),
        historico.length
          ? el('div', { class: 'lista' }, historico.map((regalo) => {
              const ocasion = ctx.vista.ocasion(regalo.ocasion_id);
              const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
              return el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleRegalo(regalo.id, ctx) }, [
                el('h3', { texto: idea?.titulo || 'Regalo' }),
                el('p', { texto: [ocasion?.nombre, formatearImporte(regalo.coste_real)].filter(Boolean).join(' · ') }),
              ]);
            }))
          : el('p', { class: 'pista', texto: 'Sin campañas cerradas todavía.' }),
      ]));
    }

    if (ctx.vista.esAdministrador()) {
      cuerpo.append(el('div', { class: 'acciones' }, [
        el('button', {
          class: 'boton crecer', 'data-tono': 'discreto', type: 'button',
          onclick: () => abrirFormularioPersona(ctx, { id: personaId }),
        }, ['Editar la ficha']),
      ]));
    }
  });
}

function abrirFormularioAtributo(personaId, ctx) {
  // Las claves son de creación libre, y se sugieren las ya usadas en el hogar:
  // un catálogo cerrado envejecería mal (spec funcional §2).
  const usadas = [...new Set((ctx.vista.datos.atributos_persona || []).map((a) => a.clave))];

  abrirHoja('Añadir un dato', (cuerpo) => {
    const clave = entrada({ placeholder: 'talla de calzado', list: 'claves-usadas' });
    const lista = el('datalist', { id: 'claves-usadas' }, usadas.map((valor) => el('option', { value: valor })));
    const valor = entrada({ placeholder: '39' });
    cuerpo.append(campo('Qué dato', clave), lista, campo('Cuál es', valor));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!clave.value.trim() || !valor.value.trim()) return;
          await guardar('atributo_persona', nuevoId(), {
            persona_id: personaId, clave: clave.value.trim(), valor: valor.value.trim(), activo: 1,
          });
          cerrarHoja(); ctx.refrescar();
        },
      }, ['Guardar']),
    ]));
  });
}

/**
 * Alta y edición de personas, reservada a los administradores. La carga inicial
 * del registro es manual a propósito: una importación desde los contactos del
 * teléfono arrastraría duplicados y datos irrelevantes (spec funcional §2).
 */
function abrirFormularioPersona(ctx, { id = null } = {}) {
  const persona = id ? ctx.vista.persona(id) : null;

  abrirHoja(persona ? `Ficha de ${persona.nombre}` : 'Nueva persona', (cuerpo) => {
    const nombre = entrada({ value: persona?.nombre || '', placeholder: 'Nombre' });
    const apellidos = entrada({ value: persona?.apellidos || '', placeholder: 'Apellidos' });
    const nacimiento = el('input', { type: 'date', value: persona?.fecha_nacimiento || '' });
    const parentesco = entrada({ value: persona?.parentesco || '', placeholder: 'hija, abuelo, sobrino…' });
    const rol = seleccion(
      [{ valor: '', texto: 'Sin cuenta' }, { valor: 'miembro', texto: 'Miembro' }, { valor: 'administrador', texto: 'Administrador' }],
      persona?.tiene_cuenta ? persona.rol : '',
    );
    const apple = entrada({ value: persona?.identificador_apple || '', placeholder: '000123.abc…' });

    cuerpo.append(
      campo('Nombre', nombre),
      campo('Apellidos', apellidos),
      campo('Fecha de nacimiento', nacimiento, 'De aquí sale su cumpleaños en la agenda, todos los años y sin tocar nada.'),
      campo('Parentesco', parentesco),
      campo('Acceso', rol),
      campo('Identificador de Apple', apple,
        'Se obtiene del error que muestra la pantalla de acceso la primera vez que esa persona intenta entrar.'),
    );

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!nombre.value.trim()) { avisar('Falta el nombre'); return; }
          await guardar('persona', persona ? persona.id : nuevoId(), {
            nombre: nombre.value.trim(),
            apellidos: apellidos.value.trim(),
            fecha_nacimiento: nacimiento.value || null,
            parentesco: parentesco.value.trim(),
            tiene_cuenta: rol.value ? 1 : 0,
            rol: rol.value || null,
            identificador_apple: apple.value.trim() || null,
            activa: 1,
          });
          cerrarHoja(); avisar('Ficha guardada'); ctx.refrescar();
        },
      }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}
