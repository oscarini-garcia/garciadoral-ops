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
import { guardar, listarSolicitudes, resolverSolicitud, sincronizar } from '../sincronizacion.js';
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
    const esperando = bloqueDeSolicitudes(ctx);
    if (esperando) pantalla.append(esperando);
    pantalla.append(el('div', { class: 'grupo' }, [
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: () => abrirFormularioPersona(ctx) }, [
        'Añadir una persona',
      ]),
    ]));
  }
}

// ---------------------------------------------------------------- Bandeja --

/**
 * Quién está esperando a que le abran la puerta.
 *
 * El recuento llega con la instantánea, de modo que no hace falta preguntar por
 * él: si no hay nadie esperando, aquí no aparece nada. Solo al abrir la bandeja
 * se pide la lista, que es donde están el nombre y el correo.
 *
 * Solo lo ven los administradores, y no por discreción sino porque son los
 * únicos que pueden hacer algo al respecto.
 */
function bloqueDeSolicitudes(ctx) {
  const cuantas = ctx.vista.datos.solicitudes_pendientes || 0;
  if (!cuantas) return null;

  return el('div', { class: 'grupo' }, [
    el('button', {
      class: 'boton crecer', type: 'button', onclick: () => abrirBandeja(ctx),
    }, [cuantas === 1 ? 'Hay 1 persona esperando' : `Hay ${cuantas} personas esperando`]),
  ]);
}

async function abrirBandeja(ctx) {
  abrirHoja('Quién quiere entrar', (cuerpo) => {
    cuerpo.append(el('p', { class: 'pista', texto: 'Cargando…' }));

    listarSolicitudes()
      .then((solicitudes) => {
        vaciar(cuerpo);
        if (!solicitudes.length) {
          cuerpo.append(el('p', { class: 'pista', texto: 'Ya no queda nadie esperando.' }));
          return;
        }
        for (const solicitud of solicitudes) {
          cuerpo.append(tarjetaDeSolicitud(solicitud, ctx));
        }
      })
      .catch((error) => {
        vaciar(cuerpo).append(el('p', { class: 'pista', texto: error.message }));
      });
  });
}

function tarjetaDeSolicitud(solicitud, ctx) {
  const cuando = new Date(`${solicitud.creado_en.replace(' ', 'T')}Z`);

  return el('div', { class: 'tarjeta' }, [
    el('h3', { texto: solicitud.nombre_declarado }),
    // El nombre lo ha escrito quien pide entrar, no Apple. Conviene que se note:
    // es el dato sobre el que se decide y no está verificado por nadie.
    el('p', { class: 'pista', texto: 'Nombre escrito por quien lo solicita.' }),
    el('p', {
      texto: solicitud.correo
        ? solicitud.correo
        : 'Sin correo: no lo compartió al entrar con Apple.',
    }),
    solicitud.correo_privado
      ? el('p', {
          class: 'pista',
          texto: 'Es una dirección de reenvío de Apple, así que no dice de quién es.',
        })
      : null,
    el('p', {
      class: 'pista',
      texto: `Lo pidió el ${cuando.toLocaleDateString('es-ES')}. Caduca a los catorce días.`,
    }),
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: () => abrirAprobacion(solicitud, ctx),
      }, ['Darle acceso']),
      el('button', {
        class: 'boton', 'data-tono': 'peligro', type: 'button',
        onclick: async (evento) => {
          evento.currentTarget.disabled = true;
          await resolver({ id: solicitud.id, accion: 'rechazar' }, ctx, 'Solicitud rechazada');
        },
      }, ['Rechazar']),
    ]),
  ]);
}

/**
 * Aprobar tiene dos caminos, y el que se olvida es el primero.
 *
 * Si esa persona ya figuraba en el registro sin cuenta —la abuela, que cumple
 * años y recibe regalos—, hay que vincularla a su ficha y no crear una segunda:
 * así conserva su fecha de nacimiento y todo lo que otros escribieron con ella.
 */
function abrirAprobacion(solicitud, ctx) {
  const candidatas = ctx.vista.personasSinCuenta();

  abrirHoja(`Dar acceso a ${solicitud.nombre_declarado}`, (cuerpo) => {
    const quien = seleccion(
      [
        { valor: '', texto: 'Crear una ficha nueva' },
        ...candidatas.map((p) => ({ valor: p.id, texto: `Es ${p.nombre}, que ya está` })),
      ],
      '',
    );
    const rol = seleccion(
      [{ valor: 'miembro', texto: 'Miembro' }, { valor: 'administrador', texto: 'Administrador' }],
      'miembro',
    );
    const nombre = entrada({ value: solicitud.nombre_declarado, placeholder: 'Nombre' });
    const apellidos = entrada({ placeholder: 'Apellidos' });

    const nueva = el('div', {}, [
      campo('Nombre', nombre),
      campo('Apellidos', apellidos),
    ]);

    const ajustar = () => { nueva.hidden = Boolean(quien.value); };
    quien.addEventListener('change', ajustar);
    ajustar();

    cuerpo.append(
      campo('Quién es', quien, 'Si ya estaba en la familia sin cuenta, vincúlala a su ficha: así conserva su cumpleaños y su historial.'),
      nueva,
      campo('Acceso', rol, 'Un administrador gestiona personas, categorías y presupuesto. Un miembro usa la agenda.'),
    );

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async (evento) => {
          if (!quien.value && !nombre.value.trim()) { avisar('Falta el nombre'); return; }
          evento.currentTarget.disabled = true;
          await resolver({
            id: solicitud.id,
            accion: 'aprobar',
            rol: rol.value,
            persona_id: quien.value || null,
            persona: quien.value
              ? null
              : { nombre: nombre.value.trim(), apellidos: apellidos.value.trim() },
          }, ctx, 'Acceso concedido');
        },
      }, ['Dar acceso']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

async function resolver(cuerpo, ctx, exito) {
  try {
    await resolverSolicitud(cuerpo);
    cerrarHoja();
    avisar(exito);
    // La instantánea trae el recuento y, si se ha aprobado, la persona nueva.
    await sincronizar();
    ctx.refrescar();
  } catch (error) {
    avisar(error.message || 'No se ha podido resolver la solicitud.');
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

    cuerpo.append(
      campo('Nombre', nombre),
      campo('Apellidos', apellidos),
      campo('Fecha de nacimiento', nacimiento, 'De aquí sale su cumpleaños en la agenda, todos los años y sin tocar nada.'),
      campo('Parentesco', parentesco),
      campo('Acceso', rol,
        persona?.tiene_cuenta
          ? 'Quitarle la cuenta deshace su vínculo con Apple: para volver a entrar tendría que solicitarlo otra vez.'
          : 'El vínculo con Apple no se escribe aquí: se establece al aprobar una solicitud.'),
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
            // Dejar a alguien sin cuenta deshace su vínculo con Apple, igual que
            // hace la baja. Conservarlo dejaría un identificador huérfano que no
            // abre nada y que, en cambio, impediría aprobar la solicitud de esa
            // misma persona cuando volviera a pedirlo.
            ...(rol.value ? {} : { identificador_apple: null }),
            activa: 1,
          });
          cerrarHoja(); avisar('Ficha guardada'); ctx.refrescar();
        },
      }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}
