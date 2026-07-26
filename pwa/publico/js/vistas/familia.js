/**
 * Gente: el registro de personas y la ficha de cada una.
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
import {
  CIRCULOS, PARENTESCOS, PARENTESCO_OTRO, TAMANO_FAMILIA, formatearImporte, nuevoId,
} from '../modelo.js';
import { MESES_LARGOS, hoy, parsearMomento } from '../semana.js';
import { abrirDetalleIdea, abrirDetalleRegalo, abrirFormularioIdea } from './regalos.js';

/** Cuál de los dos círculos abiertos se está mirando. Se conserva entre
 *  repintados para que guardar una ficha no devuelva a nadie a la otra. */
let pestana = 'extendida';
let consulta = '';

export function reiniciarFamilia() {
  pestana = 'extendida';
  consulta = '';
}

const normalizar = (texto) =>
  String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Busca por nombre, apellidos y parentesco: «abuel» tiene que dar con los dos
 *  abuelos aunque ninguno se llame así. */
function encaja(persona, texto) {
  const aguja = normalizar(texto).trim();
  if (!aguja) return true;
  return [persona.nombre, persona.apellidos, persona.parentesco]
    .some((parte) => normalizar(parte).includes(aguja));
}

/**
 * La pantalla de personas: el hogar arriba, siempre, y los otros dos círculos
 * por turnos debajo (specs/ux.md §7.1).
 *
 * El buscador no vive dentro de una pestaña sino encima de todo, y cuando algo
 * se escribe la pantalla deja de estar dividida: busca en los tres círculos a la
 * vez y enseña un único resultado. Es lo que evita el defecto del conmutador
 * —tener que acertar la pestaña antes de buscar— sin el truco de saltar de
 * pestaña por su cuenta, que se nota y desorienta.
 */
export function pintarFamilia(pantalla, subcabecera, ctx) {
  vaciar(subcabecera);
  vaciar(pantalla);

  const cuerpo = el('div', {});

  const buscador = entrada({
    type: 'search',
    value: consulta,
    placeholder: 'Buscar una persona',
    'aria-label': 'Buscar una persona',
  });
  // Al escribir se repinta solo el cuerpo y no la pantalla entera: repintarla
  // rehace el campo y se pierde el foco entre letra y letra.
  buscador.addEventListener('input', () => {
    consulta = buscador.value;
    componer(vaciar(cuerpo), ctx);
  });
  subcabecera.append(el('div', { class: 'campo crecer' }, [buscador]));

  componer(cuerpo, ctx);
  pantalla.append(cuerpo);
}

function componer(cuerpo, ctx) {
  if (consulta.trim()) cuerpo.append(resultadosDeBusqueda(ctx));
  else cuerpo.append(...circulosPorSeparado(cuerpo, ctx));

  if (ctx.vista.esAdministrador()) {
    const esperando = bloqueDeSolicitudes(ctx);
    if (esperando) cuerpo.append(esperando);
  }
}

function circulosPorSeparado(cuerpo, ctx) {
  const familia = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: CIRCULOS.familia }),
    rejilla(ctx.vista.personasDe('familia'), ctx, { columnas: TAMANO_FAMILIA }),
  ]);

  // El conmutador va aquí y no en la subcabecera, donde lo pone el resto de la
  // aplicación: manda sobre la mitad de abajo, no sobre la pantalla, y puesto
  // arriba parecería gobernar también la fila de la familia.
  const abiertos = el('div', { class: 'grupo' }, [
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Qué círculo se mira' },
      ['extendida', 'amigos'].map((clave) =>
        el('button', {
          type: 'button',
          'aria-pressed': pestana === clave ? 'true' : 'false',
          // Cambiar de pestaña repinta el cuerpo y no la pantalla: así el texto
          // que hubiera en el buscador y su foco siguen donde estaban.
          onclick: () => { pestana = clave; componer(vaciar(cuerpo), ctx); },
        }, [`${CIRCULOS[clave]} · ${ctx.vista.personasDe(clave).length}`]),
      )),
    rejilla(ctx.vista.personasDe(pestana), ctx, { anadirA: pestana }),
  ]);

  return [familia, abiertos];
}

function resultadosDeBusqueda(ctx) {
  const encontradas = ctx.vista.personas().filter((persona) => encaja(persona, consulta));

  return el('div', { class: 'grupo' }, [
    el('p', {
      class: 'grupo-titulo',
      texto: encontradas.length === 1 ? '1 persona' : `${encontradas.length} personas`,
    }),
    encontradas.length
      // Al buscar no se ofrece el «+»: no habría círculo al que asignarlo.
      ? rejilla(encontradas, ctx, { conCirculo: true })
      : el('p', { class: 'vacio', texto: 'Nadie con ese nombre.' }),
  ]);
}

/**
 * Personas sin avatar: el nombre va justo debajo y las iniciales sobre un color
 * inventado no decían nada que no dijera él. Lo que queda es lo que se consulta
 * de verdad —de quién es, y cuándo cumple—, y cabe más en menos alto.
 */
function rejilla(personas, ctx, { columnas = 0, anadirA = null, conCirculo = false } = {}) {
  const celdas = ordenar(personas).map((persona) =>
    el('button', { class: 'persona', type: 'button', onclick: () => abrirFicha(persona.id, ctx) }, [
      el('span', { class: 'persona-nombre', texto: persona.nombre }),
      el('span', {
        class: 'persona-quien',
        texto: conCirculo
          ? [CIRCULOS[persona.circulo], comoSeLlama(persona, ctx)].filter(Boolean).join(' · ')
          : comoSeLlama(persona, ctx),
      }),
      notaDeCumple(persona),
    ]),
  );

  if (anadirA && ctx.vista.esAdministrador()) {
    celdas.push(el('button', {
      class: 'persona persona-mas', type: 'button',
      'aria-label': `Añadir a ${CIRCULOS[anadirA]}`,
      onclick: () => abrirFormularioPersona(ctx, { circulo: anadirA }),
    }, [
      el('span', { class: 'persona-mas-signo', 'aria-hidden': 'true', texto: '+' }),
      el('span', { class: 'persona-quien', texto: 'Añadir' }),
    ]));
  }

  return el('div', {
    class: 'personas',
    style: columnas ? `grid-template-columns: repeat(${columnas}, 1fr)` : null,
  }, celdas);
}

/** Lo que cumple antes, primero; y al final quien no tiene fecha, junto. */
function ordenar(personas) {
  return [...personas].sort((a, b) => diasHastaElCumple(a) - diasHastaElCumple(b));
}

// ------------------------------------------------------- Quién es cada uno --

/**
 * Los papeles de casa, tal como los escribe quien da de alta a alguien.
 *
 * De cada uno se guardan dos cosas: en qué generación está, y cómo lo llama
 * quien mira desde la de abajo —los mayores son «mamá» y «papá»; los pequeños,
 * entre ellos, «hermana» y «hermano»—.
 *
 * El parentesco es texto libre, así que aquí solo se reconocen las formas que
 * se usan de verdad. Lo que no encaje no se fuerza: se deja lo escrito, que
 * será menos útil pero nunca falso.
 */
const PAPELES = {
  madre: { generacion: 'mayor', desdeAbajo: 'mamá' },
  mama: { generacion: 'mayor', desdeAbajo: 'mamá' },
  padre: { generacion: 'mayor', desdeAbajo: 'papá' },
  papa: { generacion: 'mayor', desdeAbajo: 'papá' },
  hija: { generacion: 'menor', desdeAbajo: 'hermana', desdeArriba: 'hija' },
  hijo: { generacion: 'menor', desdeAbajo: 'hermano', desdeArriba: 'hijo' },
};

const papel = (persona) => PAPELES[normalizar(persona?.parentesco)] || null;

/**
 * Qué es esta persona **para quien está mirando**.
 *
 * El parentesco de la ficha lo escribió quien la creó, y es el papel que ocupa
 * en la casa: «madre», «padre», «hija». Puesto tal cual bajo el nombre no dice
 * nada de nadie —Marta leía «madre» junto a Ana, que no es la madre de nadie en
 * abstracto sino la suya—, así que dentro del círculo de casa se traduce: quien
 * mira desde abajo ve «mamá», «papá» y «hermana»; quien mira desde arriba ve
 * «hija» e «hijo».
 *
 * Fuera de ese círculo no hay nada que inferir —la tía es la tía mire quien
 * mire— y se deja lo escrito. Tampoco se infiere cuando quien mira no es de
 * casa: para alguien de fuera, «madre» y «padre» sí describen la casa.
 */
function comoSeLlama(persona, ctx) {
  if (persona.circulo !== 'familia') return persona.parentesco;
  if (persona.id === ctx.vista.yo?.id) return 'yo';

  const suyo = papel(persona);
  const mio = papel(ctx.vista.persona(ctx.vista.yo?.id));
  if (!suyo || !mio) return persona.parentesco;

  if (mio.generacion === 'menor') return suyo.desdeAbajo;
  if (suyo.generacion === 'menor') return suyo.desdeArriba;
  // Los dos adultos de una casa de cuatro. Es la única inferencia que da un
  // paso más allá del dato: nadie ha escrito que sean pareja, se deduce de que
  // comparten el hogar y la generación. Si alguna vez no fuera cierto, es esta
  // línea la que hay que quitar.
  return 'pareja';
}

function notaDeCumple(persona) {
  if (!persona.fecha_nacimiento) {
    // Un hueco en blanco no se ve; escrito, es un cumpleaños del que la agenda
    // no va a avisar y una ficha que pide que la abran.
    return el('span', { class: 'persona-nota', 'data-falta': 'si', texto: 'sin fecha' });
  }
  const dias = diasHastaElCumple(persona);
  return el('span', {
    class: 'persona-nota',
    'data-pronto': dias <= 30 ? 'si' : null,
    texto: proximoCumple(persona),
  });
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
      campo('Acceso', rol, 'Un administrador gestiona personas y categorías. Un miembro usa la agenda.'),
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

/** La fecha del próximo aniversario, sea este año o el que viene. */
function proximoAniversario(persona) {
  const nacimiento = parsearMomento(persona.fecha_nacimiento);
  const referencia = hoy();
  const deEsteAno = new Date(referencia.getFullYear(), nacimiento.getMonth(), nacimiento.getDate());
  return deEsteAno < referencia
    ? new Date(referencia.getFullYear() + 1, nacimiento.getMonth(), nacimiento.getDate())
    : deEsteAno;
}

/** Quien no tiene fecha va al final de su rejilla, no al principio. */
function diasHastaElCumple(persona) {
  if (!persona.fecha_nacimiento) return Infinity;
  return Math.round((proximoAniversario(persona) - hoy()) / 86400000);
}

function proximoCumple(persona) {
  if (!persona.fecha_nacimiento) return '';
  const proximo = proximoAniversario(persona);
  const dias = diasHastaElCumple(persona);
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
        el('p', {
          texto: [
            CIRCULOS[persona.circulo] || CIRCULOS.extendida,
            // El mismo «para quién» que en la rejilla: si allí pone «mamá», al
            // abrir la ficha no puede poner «madre».
            esMia ? null : comoSeLlama(persona, ctx),
            persona.tiene_cuenta ? persona.rol : 'sin cuenta',
          ].filter(Boolean).join(' · '),
        }),
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
            onclick: () => abrirFormularioIdea(ctx, { paraPersona: ctx.vista.yo.id }),
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
          onclick: () => abrirFormularioIdea(ctx, { paraPersona: personaId }),
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
          : el('p', { class: 'pista', texto: 'Sin ocasiones cerradas todavía.' }),
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
function abrirFormularioPersona(ctx, { id = null, circulo = 'extendida' } = {}) {
  const persona = id ? ctx.vista.persona(id) : null;
  const deCasa = ctx.vista.personasDe('familia');

  abrirHoja(persona ? `Ficha de ${persona.nombre}` : 'Nueva persona', (cuerpo) => {
    const nombre = entrada({ value: persona?.nombre || '', placeholder: 'Nombre' });
    const apellidos = entrada({ value: persona?.apellidos || '', placeholder: 'Apellidos' });
    const nacimiento = el('input', { type: 'date', value: persona?.fecha_nacimiento || '' });
    const rol = seleccion(
      [{ valor: '', texto: 'Sin cuenta' }, { valor: 'miembro', texto: 'Miembro' }, { valor: 'administrador', texto: 'Administrador' }],
      persona?.tiene_cuenta ? persona.rol : '',
    );

    // Familia sólo se ofrece si queda sitio, o si esa persona ya está dentro:
    // de otro modo la opción existiría para no poder elegirse (specs/ux.md §7.1).
    const hayHueco = deCasa.length < TAMANO_FAMILIA || persona?.circulo === 'familia';
    const grupo = seleccion(
      [
        hayHueco ? { valor: 'familia', texto: CIRCULOS.familia } : null,
        { valor: 'extendida', texto: CIRCULOS.extendida },
        { valor: 'amigos', texto: CIRCULOS.amigos },
      ].filter(Boolean),
      persona?.circulo || circulo,
    );

    // El parentesco depende del círculo, así que el círculo se pregunta antes.
    const parentesco = el('select', { 'aria-label': 'Parentesco' });
    const otro = entrada({ value: '', placeholder: 'el marido de mi prima…' });
    const campoOtro = campo('Y cuál es', otro, 'Se guarda tal cual, y así aparece bajo su nombre.');

    // Dentro de casa el parentesco no es descriptivo: de él sale lo que los
    // otros tres leen. Conviene decirlo donde se elige, y solo ahí.
    const pista = el('p', { class: 'pista' });

    const ajustarOtro = () => { campoOtro.hidden = parentesco.value !== PARENTESCO_OTRO; };

    /** Rehace la lista al cambiar de círculo, conservando lo elegido si sigue. */
    const poblar = (elegido) => {
      const opciones = PARENTESCOS[grupo.value] || PARENTESCOS.extendida;
      vaciar(parentesco).append(
        el('option', { value: '' }, ['Sin decir']),
        ...opciones.map((valor) => el('option', { value: valor }, [valor])),
        el('option', { value: PARENTESCO_OTRO }, ['Otro…']),
      );
      parentesco.value = opciones.includes(elegido) || elegido === PARENTESCO_OTRO ? elegido : '';
      pista.textContent = grupo.value === 'familia'
        ? 'De esto sale lo que cada uno de casa lee bajo el nombre de los demás: una hija ve «mamá» donde su madre se ve a sí misma.'
        : '';
      pista.hidden = !pista.textContent;
      ajustarOtro();
    };

    // Lo que ya estuviera escrito y no figure en la lista —de antes de que
    // hubiera lista, o de otro círculo— no se pierde: cae en «Otro» con su
    // texto puesto.
    const escrito = persona?.parentesco || '';
    const enLaLista = (PARENTESCOS[persona?.circulo || circulo] || []).includes(escrito);
    if (escrito && !enLaLista) otro.value = escrito;
    poblar(escrito && !enLaLista ? PARENTESCO_OTRO : escrito);

    parentesco.addEventListener('change', ajustarOtro);
    grupo.addEventListener('change', () => {
      poblar(parentesco.value === PARENTESCO_OTRO ? PARENTESCO_OTRO : parentesco.value);
    });

    cuerpo.append(
      campo('Nombre', nombre),
      campo('Apellidos', apellidos),
      campo('Fecha de nacimiento', nacimiento, 'De aquí sale su cumpleaños en la agenda, todos los años y sin tocar nada.'),
      campo('Círculo', grupo, hayHueco
        ? `${CIRCULOS.familia} es el hogar y son ${TAMANO_FAMILIA}: no es un grupo que crezca.`
        : `${CIRCULOS.familia} ya está completa con ${TAMANO_FAMILIA}. Para cambiar a alguien de sitio, hazlo primero en su ficha.`),
      el('div', { class: 'campo' }, [
        el('label', { texto: 'Parentesco' }), parentesco, pista,
      ]),
      campoOtro,
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
            parentesco: parentesco.value === PARENTESCO_OTRO
              ? otro.value.trim()
              : parentesco.value,
            circulo: grupo.value,
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
