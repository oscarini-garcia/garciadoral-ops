/**
 * Gente: el registro de personas y la ficha de cada una.
 *
 * La ficha es la pantalla de detalle más valiosa del producto: reúne el
 * histórico derivado, los atributos acumulados y lo que se le puede regalar en
 * el lugar donde se consultan de verdad, que es cuando alguien se pregunta qué
 * regalar a esa persona concreta (specs/ux.md §7 y §11).
 */

import {
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, avatar, avisar, botonIcono,
} from '../ui.js';
import { compartir, toque } from '../native.js';
import { guardar, listarSolicitudes, resolverSolicitud, sincronizar } from '../sincronizacion.js';
import {
  CIRCULOS, GENEROS, PARENTESCOS, PARENTESCO_OTRO, TAMANO_FAMILIA, formatearImporte,
  nombreCompleto, nuevoId,
} from '../modelo.js';
import {
  MESES_LARGOS, aniosQueCumple, diasHastaElCumple, parsearMomento, proximoAniversario,
} from '../semana.js';
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
  // La aspa que borra. `type="search"` trae una del navegador, pero en la
  // cáscara de iOS no aparece, que es justo donde se usa esto.
  const aspa = el('button', {
    class: 'buscador-aspa', type: 'button', 'aria-label': 'Borrar la búsqueda',
    onclick: () => {
      buscador.value = '';
      consulta = '';
      componer(vaciar(cuerpo), ctx);
      ajustarAspa();
      buscador.focus();
    },
  }, ['✕']);

  const ajustarAspa = () => { aspa.hidden = !buscador.value; };

  // Al escribir se repinta solo el cuerpo y no la pantalla entera: repintarla
  // rehace el campo y se pierde el foco entre letra y letra.
  buscador.addEventListener('input', () => {
    consulta = buscador.value;
    componer(vaciar(cuerpo), ctx);
    ajustarAspa();
  });
  ajustarAspa();
  subcabecera.append(el('div', { class: 'campo crecer buscador' }, [buscador, aspa]));

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
    // Los dos círculos abiertos van en lista y no en rejilla. La rejilla es
    // para la familia, que son cuatro y se reconocen por el hueco que ocupan;
    // aquí la gente crece y con ella los nombres largos, los parentescos que no
    // caben en una celda y las dos Marías que solo distingue el apellido.
    tablaDePersonas(ctx.vista.personasDe(pestana), ctx),
    filaDeAnadir(pestana, ctx),
  ]);

  return [familia, abiertos];
}

/**
 * La lista de personas, en tres columnas que se leen hacia abajo de un vistazo:
 * el nombre entero con sus apellidos, de quién es y cuándo cumple.
 *
 * Es la misma en los dos sitios donde hay que recorrer gente —el resultado de
 * una búsqueda y los círculos abiertos—, y a propósito: son la misma pregunta
 * hecha de dos maneras, y contestarla con dos formas distintas obligaría a
 * aprenderlas por separado.
 */
function tablaDePersonas(personas, ctx) {
  if (!personas.length) return el('p', { class: 'vacio', texto: 'Aquí no hay nadie todavía.' });

  return el('div', { class: 'tabla-personas' }, [
    el('table', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { scope: 'col', texto: 'Quién' }),
          el('th', { scope: 'col', texto: 'De qué' }),
          el('th', { scope: 'col', texto: 'Cumple' }),
        ]),
      ]),
      el('tbody', {}, ordenar(personas).map((persona) =>
        el('tr', {
          tabindex: '0', role: 'button',
          onclick: () => abrirFicha(persona.id, ctx),
          onkeydown: (evento) => {
            if (evento.key === 'Enter' || evento.key === ' ') {
              evento.preventDefault();
              abrirFicha(persona.id, ctx);
            }
          },
        }, [
          el('td', { texto: nombreCompleto(persona) }),
          el('td', { texto: deQuienEs(persona, ctx) }),
          el('td', {}, [celdaDeCumple(persona)]),
        ])),
      ),
    ]),
  ]);
}

/** El «+» de un círculo, ahora al pie de su lista y no como celda de rejilla.
 *  Sigue sabiendo a cuál añade, que es lo que importaba. */
function filaDeAnadir(circulo, ctx) {
  if (!ctx.vista.esAdministrador()) return null;
  return el('button', {
    class: 'anadir-persona', type: 'button',
    onclick: () => abrirFormularioPersona(ctx, { circulo }),
  }, [
    el('span', { class: 'anadir-signo', 'aria-hidden': 'true', texto: '+' }),
    el('span', { texto: `Añadir a ${CIRCULOS[circulo]}` }),
  ]);
}

function resultadosDeBusqueda(ctx) {
  const encontradas = ctx.vista.personas().filter((p) => encaja(p, consulta));

  if (!encontradas.length) {
    return el('div', { class: 'grupo' }, [
      el('p', { class: 'vacio', texto: 'Nadie con ese nombre.' }),
    ]);
  }

  return el('div', { class: 'grupo' }, [
    el('p', {
      class: 'grupo-titulo',
      texto: encontradas.length === 1 ? '1 persona' : `${encontradas.length} personas`,
    }),
    tablaDePersonas(encontradas, ctx),
  ]);
}

function celdaDeCumple(persona) {
  if (!persona.fecha_nacimiento) {
    return el('span', { class: 'persona-nota', 'data-falta': 'si', texto: 'sin fecha' });
  }
  const nacimiento = parsearMomento(persona.fecha_nacimiento);
  const dias = diasHastaElCumple(persona);
  const anos = aniosQueCumple(persona);
  return el('span', { class: 'persona-nota', 'data-pronto': dias <= 30 ? 'si' : null }, [
    document.createTextNode(
      `${nacimiento.getDate()} ${MESES_LARGOS[nacimiento.getMonth()].slice(0, 3)}`,
    ),
    anos ? el('span', { class: 'persona-anos', texto: ` (${anos})` }) : null,
  ]);
}

/**
 * La rejilla, que ya solo dibuja a los de casa.
 *
 * Son cuatro y se reconocen por el hueco que ocupan, así que aquí la forma
 * ahorra leer. Sin «+»: Familia es un conjunto cerrado, y el que había dentro
 * sobraba en cuanto los otros dos círculos pasaron a lista.
 *
 * Sin avatares tampoco: el nombre va justo debajo y las iniciales sobre un
 * color inventado no decían nada que no dijera él.
 */
function rejilla(personas, ctx, { columnas = 0 } = {}) {
  return el('div', {
    class: 'personas',
    style: columnas ? `grid-template-columns: repeat(${columnas}, 1fr)` : null,
  }, ordenar(personas).map((persona) =>
    el('button', { class: 'persona', type: 'button', onclick: () => abrirFicha(persona.id, ctx) }, [
      el('span', { class: 'persona-nombre', texto: persona.nombre }),
      el('span', { class: 'persona-quien', texto: comoSeLlama(persona, ctx) }),
      notaDeCumple(persona),
    ]),
  ));
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
  madre: { generacion: 'mayor', genero: 'f' },
  mama: { generacion: 'mayor', genero: 'f' },
  padre: { generacion: 'mayor', genero: 'm' },
  papa: { generacion: 'mayor', genero: 'm' },
  hija: { generacion: 'menor', genero: 'f' },
  hijo: { generacion: 'menor', genero: 'm' },
  // «Lóver» dice la relación pero no el género, que es justo el caso para el
  // que existe el campo: sin él no habría manera de saber si quien mira desde
  // abajo tiene que leer «mamá» o «papá».
  lover: { generacion: 'mayor', genero: null },
};

const papel = (persona) => PAPELES[normalizar(persona?.parentesco)] || null;

/**
 * Si es «ella» o «él», para elegir la palabra.
 *
 * Manda lo que se haya puesto en la ficha; si está en blanco, se deduce de la
 * propia palabra del parentesco, que en castellano casi siempre lo lleva
 * dentro. Y si tampoco, se cae del lado femenino sin más razón que tener que
 * elegir una: es una etiqueta de dos palabras bajo un nombre, no un juicio.
 */
function generoDe(persona) {
  if (persona?.genero === 'f' || persona?.genero === 'm') return persona.genero;
  return papel(persona)?.genero || 'f';
}

const enGenero = (persona, femenino, masculino) =>
  (generoDe(persona) === 'm' ? masculino : femenino);

/**
 * De quién es esta persona, en una palabra, para escribirlo bajo su nombre.
 *
 * El círculo no entra: a la rejilla y a la ficha se llega desde él, y en la
 * tabla de resultados ocupaba media columna para repetir lo que el parentesco ya
 * dice mejor —«tía» sitúa a alguien más deprisa que «Familia Extendida»—. Lo que
 * hay es el parentesco; y cuando no hay ninguno escrito, «amiga» o «amigo»,
 * que es lo que queda por decir de alguien de quien no se ha dicho nada.
 */
const deQuienEs = (persona, ctx) =>
  comoSeLlama(persona, ctx) || enGenero(persona, 'amiga', 'amigo');

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

  if (mio.generacion === 'menor') {
    return suyo.generacion === 'mayor'
      ? enGenero(persona, 'mamá', 'papá')
      : enGenero(persona, 'hermana', 'hermano');
  }
  if (suyo.generacion === 'menor') return enGenero(persona, 'hija', 'hijo');
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
  const anos = aniosQueCumple(persona);
  return el('span', { class: 'persona-nota', 'data-pronto': dias <= 30 ? 'si' : null }, [
    document.createTextNode(proximoCumple(persona)),
    // Los años que hará, no los que tiene: es la cifra que se está buscando
    // cuando uno mira esta línea, que es para decidir un regalo.
    anos ? el('span', { class: 'persona-anos', texto: ` (${anos})` }) : null,
  ]);
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

function proximoCumple(persona) {
  if (!persona.fecha_nacimiento) return '';
  const proximo = proximoAniversario(persona);
  const dias = diasHastaElCumple(persona);
  if (dias === 0) return 'hoy 🎂';
  if (dias <= 30) return `en ${dias} d`;
  return `${proximo.getDate()} ${MESES_LARGOS[proximo.getMonth()].slice(0, 3)}`;
}

/** «Cumple el 1 de agosto, y hará 16». La edad detrás, que es lo que se
 *  pregunta justo después de la fecha. */
function textoDeCumpleanos(persona) {
  const nacimiento = parsearMomento(persona.fecha_nacimiento);
  const cuando = `Cumple el ${nacimiento.getDate()} de ${MESES_LARGOS[nacimiento.getMonth()].toLowerCase()}`;
  const anios = aniosQueCumple(persona);
  return anios ? `${cuando}, y hará ${anios}` : cuando;
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
            // El círculo no se dice: en la rejilla ya se venía de él, y aquí
            // solo repetía lo que la pantalla anterior acababa de enseñar. Lo
            // que hace falta es de quién es esta persona, que es el parentesco
            // —el mismo «para quién» que en la rejilla, para que lo que allí
            // ponía «mamá» no ponga «madre» al abrirse—. Y cuando no hay
            // parentesco escrito, el círculo vuelve como último recurso, que es
            // lo que deja «Amigos» bajo el nombre de un amigo sin más dato.
            esMia ? null : deQuienEs(persona, ctx),
            persona.tiene_cuenta ? persona.rol : 'sin cuenta',
          ].filter(Boolean).join(' · '),
        }),
        persona.fecha_nacimiento
          ? el('p', { class: 'pista', texto: textoDeCumpleanos(persona) })
          : null,
      ]),
    ]));

    // Lo que gana valor con el tiempo: tallas, alergias, aficiones.
    const atributos = ctx.vista.atributosDe(personaId);
    cuerpo.append(el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: 'Lo que conviene recordar' }),
      atributos.length
        // `pre-wrap` porque ahora el dato puede traer saltos de línea dentro.
        ? el('div', { class: 'lista' }, atributos.map((atributo) =>
            el('p', { class: 'dato', texto: textoDelDato(atributo) })))
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

    // Editar no vive al pie: va arriba, junto al título, igual que en el
    // detalle de un evento (specs/ux.md §7.1).
  }, [
    ctx.vista.esAdministrador()
      ? botonIcono('editar', {
          etiqueta: 'Editar la ficha',
          onclick: () => abrirFormularioPersona(ctx, { id: personaId }),
        })
      : null,
    botonIcono('compartir', {
      etiqueta: `Compartir los datos de ${persona.nombre}`,
      tono: 'discreto',
      onclick: async () => {
        toque();
        const enviado = await compartir({
          titulo: persona.nombre,
          texto: textoDeLaPersona(persona, ctx),
        });
        if (!enviado) avisar('No he podido compartirlo');
      },
    }),
  ]);
}

/**
 * Lo que sale al compartir una persona.
 *
 * Va la cara pública y nada más: cómo se llama, de quién es, cuándo cumple y lo
 * que conviene recordar de ella —las tallas, las alergias—, que es justo lo que
 * se le manda a quien pregunta qué comprarle. **Ni una palabra de la dimensión
 * de regalos**: ni deseos, ni ideas apuntadas, ni histórico. Es la misma regla
 * que en el evento, y aquí importa más, porque este texto sale del hogar.
 *
 * Sin redacción por IA: los datos de una persona son cuatro líneas de hechos y
 * contarlos «en dos frases» solo podría estropearlos.
 */
function textoDeLaPersona(persona, ctx) {
  const quien = persona.id === ctx.vista.yo?.id
    ? null
    : deQuienEs(persona, ctx);

  const lineas = [
    nombreCompleto(persona),
    quien,
    persona.fecha_nacimiento ? textoDeCumpleanos(persona) : null,
  ].filter(Boolean);

  const atributos = ctx.vista.atributosDe(persona.id);
  if (atributos.length) {
    lineas.push('', ...atributos.map(textoDelDato));
  }

  return lineas.join('\n');
}

/**
 * Un dato es una casilla y no dos.
 *
 * Eran «qué dato» y «cuál es», que obliga a partir en dos algo que se piensa de
 * una pieza. Casi nada de lo que conviene recordar de alguien tiene esa forma:
 * «le da vergüenza que le canten el cumpleaños» no es una clave con su valor, y
 * meterlo a la fuerza salía como «vergüenza: que le canten». Así que se escribe
 * de corrido, y en varias líneas si hacen falta.
 *
 * Por debajo sigue siendo la misma fila —`clave` y `valor` de
 * `atributo_persona`—, con la clave en blanco: cambiar el esquema por esto
 * costaría una migración y dejaría atrás lo ya escrito. Lo de antes se sigue
 * leyendo, con su «clave: valor» delante.
 */
function abrirFormularioAtributo(personaId, ctx) {
  abrirHoja('Añadir un dato', (cuerpo) => {
    const texto = el('textarea', {
      rows: '4',
      placeholder: 'Talla de calzado 39. Le tiran los libros de cocina y no come frutos secos.',
    });
    cuerpo.append(campo('Qué conviene recordar', texto,
      'Lo que sirva para acertar con ella: tallas, alergias, aficiones, manías.'));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!texto.value.trim()) return;
          await guardar('atributo_persona', nuevoId(), {
            persona_id: personaId, clave: '', valor: texto.value.trim(), activo: 1,
          });
          cerrarHoja(); ctx.refrescar();
        },
      }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

/** Lo escrito de corrido va tal cual; lo de antes conserva su «clave: valor». */
const textoDelDato = (atributo) =>
  (atributo.clave ? `${atributo.clave}: ${atributo.valor}` : atributo.valor);

/**
 * La fecha de nacimiento, con dos maneras de ponerla.
 *
 * El selector del sistema es cómodo para lo cercano y penoso para lo lejano:
 * poner 1947 exige recorrer setenta y nueve pantallas de calendario, y las
 * fechas que se meten aquí son sobre todo de gente mayor. Así que al lado va
 * una casilla de texto en `dd/mm/aaaa`, que es como se dice una fecha en voz
 * alta y se escribe de un tirón.
 *
 * Las dos escriben sobre el mismo valor y se copian la una a la otra. La de
 * texto solo se cree lo que sea una fecha entera y válida; mientras se escribe
 * no borra nada ni protesta, y al salir del campo se corrige sola a lo que haya
 * guardado. `control.value` es siempre el ISO que se guarda, o cadena vacía.
 */
function campoDeFecha(valorInicial) {
  const control = el('input', { type: 'date', value: valorInicial || '' });
  const texto = entrada({
    inputmode: 'numeric', placeholder: 'dd/mm/aaaa', 'aria-label': 'Fecha de nacimiento escrita',
    maxlength: '10', autocomplete: 'off',
    value: aTextoDeFecha(valorInicial),
  });

  /**
   * La salida del teclado numérico.
   *
   * El de iPhone no trae tecla de retorno —son diez cifras y poco más—, así que
   * de este campo no se sale escribiendo: hay que tocar fuera, y encima el
   * teclado tapa media hoja. Este botón es la salida, y solo está mientras el
   * campo tiene el foco: fuera de ahí no serviría para nada.
   *
   * Va con `pointerdown` y no con `click`. Tocarlo quita el foco antes de que
   * llegue el `click`, con lo que el botón se escondería y el toque acabaría
   * sobre lo que hubiera debajo; frenando el `pointerdown` el foco no se mueve y
   * el cierre lo hace este código, cuando quiere.
   */
  const listo = el('button', {
    class: 'fecha-listo', type: 'button', hidden: true,
    onpointerdown: (evento) => { evento.preventDefault(); texto.blur(); },
  }, ['Listo']);

  control.addEventListener('input', () => { texto.value = aTextoDeFecha(control.value); });
  texto.addEventListener('focus', () => { listo.hidden = false; });
  texto.addEventListener('input', () => {
    aplicarMascara(texto);
    const iso = deTextoDeFecha(texto.value);
    if (iso === null) return;
    control.value = iso;
    // Con la fecha entera y buena no queda nada que teclear: el teclado se
    // retira solo y no hay que ir a buscar por dónde salir. Si los ocho dígitos
    // no forman una fecha —un 31 de febrero—, se queda abierto a propósito: que
    // siga ahí es el aviso de que algo no cuadra.
    if (texto.value.length === 10) texto.blur();
  });
  texto.addEventListener('blur', () => {
    listo.hidden = true;
    texto.value = aTextoDeFecha(control.value);
  });

  return {
    control,
    campo: el('div', { class: 'campo' }, [
      el('label', { texto: 'Fecha de nacimiento' }),
      el('div', { class: 'fecha-doble' }, [
        control,
        el('div', { class: 'fecha-escrita' }, [texto, listo]),
      ]),
      el('p', {
        class: 'pista',
        texto: 'De aquí sale su cumpleaños en la agenda, todos los años y sin tocar nada. Se puede elegir en el calendario o escribirla.',
      }),
    ]),
  };
}

/**
 * Las barras las pone la casilla, no quien escribe.
 *
 * Se teclea `01121974` y se lee `01/12/1974`. Una fecha se dice de corrido —«uno
 * doce setenta y cuatro»— y obligar a intercalar dos barras rompe ese tirón
 * justo en el campo que existe para escribir deprisa; en un teclado numérico,
 * además, la barra ni siquiera está a la vista.
 *
 * Solo separa lo que ya se ha escrito: `011` da `01/1` y nunca `01/1/`. Así el
 * borrado no tiene nada especial que hacer —al quitar el último dígito la barra
 * que lo precedía desaparece sola— y no hace falta interceptar la tecla.
 */
const conBarras = (digitos) => {
  const d = digitos.slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};

/**
 * Reescribe la casilla con la máscara, dejando el cursor donde estaba.
 *
 * El sitio se cuenta en dígitos y no en caracteres: si se contara en caracteres,
 * cada barra que aparece al escribir empujaría el cursor un puesto atrás y las
 * cifras acabarían saliendo desordenadas al corregir en medio.
 */
function aplicarMascara(casilla) {
  const antes = casilla.value;
  const cursor = casilla.selectionStart ?? antes.length;
  const digitosAntesDelCursor = antes.slice(0, cursor).replace(/\D/g, '').length;

  const despues = conBarras(antes.replace(/\D/g, ''));
  if (despues === antes) return;
  casilla.value = despues;

  let sitio = 0;
  for (let vistos = 0; sitio < despues.length && vistos < digitosAntesDelCursor; sitio += 1) {
    if (/\d/.test(despues[sitio])) vistos += 1;
  }
  casilla.setSelectionRange(sitio, sitio);
}

const aTextoDeFecha = (iso) => {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}/${m}/${a}` : '';
};

/** El ISO correspondiente, o `null` si lo escrito todavía no es una fecha. */
function deTextoDeFecha(texto) {
  const partes = String(texto).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!partes) return null;
  const [, d, m, a] = partes.map(Number);
  // El redondeo de JavaScript convierte el 31 de febrero en el 3 de marzo sin
  // decir nada; se comprueba que la fecha construida sea la que se pidió.
  const fecha = new Date(a, m - 1, d);
  if (fecha.getFullYear() !== a || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Alta y edición de personas, reservada a los administradores. La carga inicial
 * del registro es manual a propósito: una importación desde los contactos del
 * teléfono arrastraría duplicados y datos irrelevantes (spec funcional §2).
 */
/**
 * El formulario de una persona.
 *
 * `alGuardar` existe para quien llega aquí de paso: el cumpleaños de la agenda
 * manda a corregir una fecha de nacimiento y quiere recuperar su hoja al
 * terminar, en vez de dejar a quien la corrigió mirando la ficha.
 */
export function abrirFormularioPersona(ctx, { id = null, circulo = 'extendida', alGuardar = null } = {}) {
  const persona = id ? ctx.vista.persona(id) : null;
  const deCasa = ctx.vista.personasDe('familia');

  abrirHoja(persona ? `Ficha de ${persona.nombre}` : 'Nueva persona', (cuerpo) => {
    const nombre = entrada({ value: persona?.nombre || '', placeholder: 'Nombre' });
    const apellidos = entrada({ value: persona?.apellidos || '', placeholder: 'Apellidos' });
    const { control: nacimiento, campo: campoNacimiento } = campoDeFecha(persona?.fecha_nacimiento);
    const genero = seleccion(
      [{ valor: '', texto: 'Sin decir' }, ...Object.entries(GENEROS).map(([valor, texto]) => ({ valor, texto }))],
      persona?.genero || '',
      { 'aria-label': 'Género' },
    );
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
      campoNacimiento,
      campo('Género', genero, 'Solo sirve para nombrar bien: elegir entre «mamá» y «papá», o entre «hermana» y «hermano», cuando el parentesco no lo dice.'),
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
            genero: genero.value || null,
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
          alGuardar?.();
        },
      }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}
