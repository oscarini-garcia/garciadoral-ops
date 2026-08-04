/**
 * Regalos: las ideas, los regalos y las ocasiones.
 *
 * Se unifican en una sola sección porque son el mismo ciclo contado por partes:
 * primero se apunta una **idea**, después se lleva a un cumpleaños o a una fecha
 * señalada y allí se convierte en un **regalo**, que espera a que alguien lo
 * compre y termina cuando se entrega o cuando su ocasión se da por cerrada.
 *
 * Las tres secciones se llaman como las tres cosas que se vienen a hacer aquí:
 * apuntar algo suelto, mirar qué falta por comprar, o preparar una fecha
 * concreta. Por dentro son dos entidades y no tres —un regalo cuelga de una
 * ocasión—, pero quien mira no tiene por qué saberlo (specs/ux.md §6).
 */

import {
  el, vaciar, abrirHoja, cerrarHoja, campo, entrada, seleccion, avisar,
  acordeon, botonIcono, carruselDePropuestas, cerrarDeslizada, conVerbosAlDeslizar,
  dobleToque, enfocarAlAbrir, icono,
} from '../ui.js';
import { felicitarCumple, guardar, retirar, sugerirRegalos } from '../sincronizacion.js';
import { campoDeGente, recordarElegidos } from '../gente.js';
import {
  ESTADOS_REGALO, deQuien, estaActivo, estadoDeRegalo, formatearImporte, nombreCompleto,
  normalizar, nuevoId, redaccionDisponible, textoDeEstado,
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
let filtroRegalos = 'todos';

/**
 * Qué apartado está plegado. Se conserva entre repintados porque la pantalla se
 * rehace en cada sincronización: sin esto, plegar los cumpleaños duraría hasta
 * que llegase la siguiente instantánea.
 */
let plegado = { senaladas: false, cumples: false, pasados: true, seleccionadas: false, disponibles: false };

export function reiniciarRegalos() {
  seccion = 'ideas';
  filtroPersona = null;
  filtroRegalos = 'todos';
  plegado = { senaladas: false, cumples: false, pasados: true, seleccionadas: false, disponibles: false };
}

/**
 * Los cuatro apartados. Los tres últimos van en el orden del ciclo —se apunta,
 * se compra, se celebra— y **Deseos va el primero** porque no es un paso de ese
 * ciclo: es el único sitio de la pestaña que habla de uno mismo, y ponerlo en
 * medio partiría la historia por la mitad.
 *
 * Se abre en Ideas y no en el primero: lo que se viene a hacer aquí casi siempre
 * es regalarle algo a alguien.
 */
const SECCIONES = [
  ['deseos', 'Deseos'],
  ['ideas', 'Ideas'],
  ['regalos', 'Regalos'],
  ['ocasiones', 'Ocasiones'],
];

export function pintarRegalos(pantalla, subcabecera, ctx) {
  vaciar(subcabecera).append(
    el('div', { class: 'seg', role: 'group', 'aria-label': 'Sección de regalos' }, [
      ...SECCIONES.map(([clave, texto]) =>
        el('button', {
          type: 'button',
          'aria-pressed': seccion === clave ? 'true' : 'false',
          onclick: () => { seccion = clave; ctx.refrescar(); },
        }, [texto]),
      ),
    ]),
  );

  vaciar(pantalla);
  // Aire entre el conmutador y lo primero de la pantalla, que aquí casi siempre
  // es otra fila de pastillas.
  pantalla.classList.add('pantalla-regalos');
  if (seccion === 'ideas' || seccion === 'deseos') {
    // El cuerpo se estira hasta el final de la pantalla aunque haya tres ideas:
    // el hueco de debajo es donde se apunta la siguiente, y para eso tiene que
    // existir como sitio al que llegar con el dedo.
    pantalla.classList.add('pantalla-ideas');
    pantalla.append(seccion === 'deseos' ? vistaDeseos(ctx) : vistaIdeas(ctx));
  } else if (seccion === 'regalos') {
    pantalla.append(vistaRegalos(ctx));
  } else {
    pantalla.append(vistaOcasiones(ctx));
  }
}

export const seccionActual = () => seccion;

/**
 * Qué crea el botón flotante, que es uno para toda la pestaña.
 *
 * En Deseos apunta un deseo —nace contigo puesto como destinatario, que es lo
 * que lo convierte en uno—; en cualquier otro apartado, una idea. Un botón que
 * hiciera siempre lo mismo obligaría a corregir el «para quién» justo en el
 * apartado que existe para no tener que decirlo.
 */
export function nuevoDesdeRegalos(ctx) {
  return abrirFormularioIdea(ctx, seccion === 'deseos' ? { paraPersona: ctx.vista.yo.id } : {});
}

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

  /**
   * Dos apartados, y las seleccionadas primero.
   *
   * Una idea seleccionada es la que ya se ha llevado a una ocasión: sigue en el
   * banco a propósito —retirarla de la vista invitaría a que otra persona la
   * registrase por su cuenta— pero mezclada con las disponibles obligaba a mirar
   * la marca de cada una para saber con cuáles se puede contar todavía.
   *
   * Los dos se pliegan y los dos arrancan abiertos, como los de Ocasiones:
   * plegar sirve para quitar de en medio lo que hoy estorbe, no es el estado en
   * el que se abre la pantalla. Y lo que se pliegue se queda plegado mientras
   * dure la sesión, porque la pantalla se rehace en cada sincronización.
   */
  const seleccionadas = ideas.filter((idea) => idea.estado === 'en_curso');
  const disponibles = ideas.filter((idea) => idea.estado !== 'en_curso');

  const apartado = (titulo, cuales, clave) => {
    if (!cuales.length) return null;
    const bloque = acordeon(titulo, (cuerpo) => {
      for (const idea of cuales) cuerpo.append(tarjetaDeIdea(idea, ctx));
    }, { abierta: !plegado[clave], nota: String(cuales.length) });
    bloque.addEventListener('toggle', () => { plegado[clave] = !bloque.open; });
    return bloque;
  };

  contenedor.append(...[
    apartado('Seleccionadas', seleccionadas, 'seleccionadas'),
    apartado('Disponibles', disponibles, 'disponibles'),
  ].filter(Boolean));

  if (!ideas.length) {
    contenedor.append(el('p', {
      class: 'vacio',
      texto: filtroPersona
        ? 'Ninguna idea para esa persona todavía. Dos toques en el hueco apuntan una.'
        : 'Nada por aquí todavía. Dos toques en el hueco apuntan una idea en diez segundos.',
    }));
  }

  // Lo que uno se apunta para sí mismo ya no está aquí: tiene su propio
  // apartado, el primero de la fila. Aquí solo hay lo que se le regala a otros.

  // La misma regla que en la agenda: doblar el toque sobre lo que está en
  // blanco crea ahí. Si hay un filtro de persona puesto, la idea nace ya para
  // esa persona, que es lo que se estaba mirando.
  contenedor.append(dobleToque(
    el('div', { class: 'zona-libre', 'aria-hidden': 'true' }),
    () => { toque(); abrirFormularioIdea(ctx, { paraPersona: filtroPersona }); },
  ));

  return contenedor;
}

// ---------------------------------------------------------------- Deseos --

/**
 * Lo que uno pide, en su propio apartado.
 *
 * Estaba al final de la lista de ideas, de prestado, y no es lo mismo: el banco
 * de ideas es lo que la casa le regala a alguien, y esto es lo único de la
 * pestaña que habla de uno mismo. Tenerlo aparte hace además que apuntarse algo
 * deje de ser un efecto secundario de nombrarse a sí mismo en un formulario:
 * aquí se entra y se apunta, y el «para quién» ya está puesto (specs/ux.md §6.3).
 *
 * **Lo que nunca se dice aquí es cómo va.** Un deseo cogido para regalártelo
 * sigue apareciendo en esta lista igual que los demás: la pastilla que en el
 * banco avisa de que algo ya está en marcha sería, en tu propia lista, el aviso
 * de que alguien te ha comprado eso. Por eso la tarjeta va sin ella.
 */
function vistaDeseos(ctx) {
  const contenedor = el('div', { class: 'cuerpo-ideas' });
  const mios = ctx.vista.deseosDe(ctx.vista.yo.id);

  const grupo = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: `${mios.length} ${mios.length === 1 ? 'cosa pedida' : 'cosas pedidas'}` }),
  ]);

  if (!mios.length) {
    grupo.append(el('p', {
      class: 'vacio',
      texto: 'Nada pedido todavía. Dos toques en el hueco apuntan lo que te gustaría que te regalasen.',
    }));
  }
  for (const idea of mios) grupo.append(tarjetaDeIdea(idea, ctx));

  grupo.append(el('p', {
    class: 'pista',
    texto: 'Esto lo ve tu familia en tu ficha, y les sale al prepararte un regalo. Si alguien te lo acaba regalando no te enterarás por aquí: eso se coordina sin ti.',
  }));

  contenedor.append(grupo);
  contenedor.append(dobleToque(
    el('div', { class: 'zona-libre', 'aria-hidden': 'true' }),
    () => { toque(); abrirFormularioIdea(ctx, { paraPersona: ctx.vista.yo.id }); },
  ));

  return contenedor;
}

// ----------------------------------------------------------------- Común --

/**
 * El visto de una idea ya seleccionada, o nada.
 *
 * Lo pintan la lista de ideas y la ficha de cada persona, y tiene que ser el
 * mismo dibujo en las dos. Va con `role` y etiqueta porque es la única manera
 * de saber que esa idea está cogida: un icono mudo no lo cuenta.
 */
export function marcaDeSeleccionada(idea, ctx) {
  if (idea.estado !== 'en_curso' || esDeseoPropio(idea, ctx)) return null;
  return el('span', {
    class: 'marca-seleccionada empujar', role: 'img',
    'aria-label': 'Seleccionada para un regalo', title: 'Seleccionada para un regalo',
  }, [icono('visto')]);
}

/** El precio de una idea, que puede venir como horquilla o como cifra suelta.
 *  Lo escriben la tarjeta del banco y la línea del selector, y tiene que salir
 *  igual en las dos. */
function precioDe(idea) {
  if (!idea.precio_min && !idea.precio_max) return null;
  const desde = formatearImporte(idea.precio_min ?? idea.precio_max);
  return idea.precio_min && idea.precio_max ? `${desde}–${formatearImporte(idea.precio_max)}` : desde;
}

function tarjetaDeIdea(idea, ctx) {
  const destinos = (idea.orientaciones || []).map((o) =>
    o.persona_id ? ctx.vista.nombre(o.persona_id) : ctx.vista.etiqueta(o.etiqueta_id)?.nombre,
  ).filter(Boolean);

  const precio = precioDe(idea);

  return el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleIdea(idea.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: idea.titulo }),
      // Una idea ya seleccionada para un regalo se queda a la vista —retirarla
      // invitaría a que otra persona la registrase de nuevo— con un visto y sin
      // ninguna palabra: el apartado en el que está ya lo dice, y una pastilla
      // de once caracteres partía en dos líneas los títulos largos.
      //
      // Sobre lo que uno pide para sí mismo no se pinta jamás: ahí no diría
      // «alguien está con esto», diría «alguien te ha comprado esto».
      marcaDeSeleccionada(idea, ctx),
    ]),
    el('p', {
      // En lo que uno pide para sí mismo no van ni el destinatario ni el autor:
      // los dos son quien está mirando, y «Para Marta · de Marta» en la lista de
      // Marta es decir dos veces lo único que ya se sabe.
      texto: (esDeseoPropio(idea, ctx)
        ? [precio, ctx.vista.categoria(idea.categoria_id)?.nombre]
        : [
          destinos.length ? `Para ${destinos.join(', ')}` : 'Sin destinatario',
          precio,
          ctx.vista.categoria(idea.categoria_id)?.nombre,
          `de ${ctx.vista.nombre(idea.autor_id)}`,
        ]).filter(Boolean).join(' · '),
    }),
  ]);
}

// --------------------------------------------------------------- Regalos --

/**
 * Los tres cortes de la lista, que van bajo un rótulo —«Quién se encarga»— igual
 * que las personas en Ideas van bajo «Para quién».
 *
 * El rótulo hace el trabajo de explicar, y por eso las pastillas pueden ser de
 * una palabra: «Todos · Yo · Nadie» se lee como una escala y entra en una línea
 * hasta en un teléfono estrecho. Decían «Los que llevo yo» y «Sin nadie», que
 * hablaban de llevar —que suena a llevarlo en la mano el día de la fiesta— y no
 * decían sin qué. Lo que se nombra es otra cosa: que alguien se ha hecho cargo
 * de ese regalo, o que todavía no (specs/ux.md §6.2).
 */
const FILTROS_REGALO = [
  { clave: 'todos', texto: 'Todos', vale: () => true },
  { clave: 'mios', texto: 'Yo', vale: (regalo, yo) => regalo.responsable_id === yo },
  { clave: 'nadie', texto: 'Nadie', vale: (regalo) => !regalo.responsable_id },
];

/**
 * La segunda mitad de la vida de una idea: lo que ya está cogido para alguien.
 *
 * Se ordena por estado y no por ocasión porque la pregunta que se trae aquí es
 * «¿qué me falta por comprar?», y esa se contesta de una vez para todas las
 * fechas. Por ocasión ya está la pantalla de al lado.
 *
 * Lo que se va quedando atrás **no desaparece solo**. Pasada la fecha, los
 * regalos bajan a un apartado plegado al final, con lo que se quedó sin comprar
 * señalado; se archivan de verdad —y pasan al histórico de quien los recibió—
 * cuando alguien da la ocasión por cerrada. Archivar es esconder, y esconder
 * solo lo que se ha terminado a medias sería esconder justamente lo que hay que
 * mirar (specs/ux.md §6.2).
 */
function vistaRegalos(ctx) {
  const contenedor = el('div', {});
  const filtro = FILTROS_REGALO.find((f) => f.clave === filtroRegalos) || FILTROS_REGALO[0];

  contenedor.append(el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Quién se encarga' }),
    el('div', { class: 'opciones' }, FILTROS_REGALO.map((cual) => el('button', {
      class: 'opcion', type: 'button',
      'aria-pressed': cual.clave === filtro.clave ? 'true' : 'false',
      onclick: () => { filtroRegalos = cual.clave; ctx.refrescar(); },
    }, [cual.texto]))),
  ]));

  const todos = ctx.vista.regalosEnMarcha()
    .sort((a, b) => String(a.ocasion.fecha).localeCompare(String(b.ocasion.fecha)));
  const enJuego = todos.filter(({ regalo }) => filtro.vale(regalo, ctx.vista.yo.id));

  const dia = iso(hoy());
  const pasados = enJuego.filter(({ ocasion }) => String(ocasion.fecha) < dia);
  const porDelante = enJuego.filter(({ ocasion }) => String(ocasion.fecha) >= dia);
  const porComprar = porDelante.filter(({ regalo }) => estadoDeRegalo(regalo) === 'pendiente');
  const listos = porDelante.filter(({ regalo }) => estadoDeRegalo(regalo) !== 'pendiente');

  const grupo = (rotulo, cuales) => (cuales.length
    ? el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: `${rotulo} · ${cuales.length}` }),
      ...cuales.map((par) => filaDeRegalo(par, ctx)),
    ])
    : null);

  // Sin el filtrado, un grupo vacío entraría como el texto «null»: `append` no
  // descarta lo que no es un nodo, al revés que los hijos de `el`.
  contenedor.append(...[grupo('Por comprar', porComprar), grupo('Listos', listos)].filter(Boolean));

  if (!porDelante.length) {
    contenedor.append(el('p', {
      class: 'vacio',
      texto: !todos.length
        ? 'Todavía no hay ningún regalo en marcha. Un regalo nace de una idea: se apunta en Ideas y se lleva a un cumpleaños o a una fecha señalada.'
        : !enJuego.length ? 'Ninguno con ese filtro. Los demás siguen ahí, en «Todos».'
          : 'Nada por delante. Lo único que queda es de una fecha que ya pasó.',
    }));
  }

  if (pasados.length) {
    const bloque = acordeon('Ya pasaron', (cuerpo) => {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: 'Su fecha se fue y su ocasión sigue abierta. Se van de aquí al darla por cerrada, que es lo que los manda al histórico de quien los recibió.',
      }));
      for (const par of pasados) cuerpo.append(filaDeRegalo(par, ctx, { pasada: true }));
    }, { abierta: !plegado.pasados, nota: String(pasados.length) });

    bloque.addEventListener('toggle', () => { plegado.pasados = !bloque.open; });
    contenedor.append(bloque);
  }

  return contenedor;
}

/**
 * Una línea de la lista: qué es, quién se encarga y para cuándo.
 *
 * La pastilla de la derecha dice **quién se encarga**, que es lo que hay que
 * repartir y lo que ordena los tres filtros de arriba. Con dos excepciones, que
 * son los dos casos en los que el estado dice algo que el rótulo del grupo no
 * dice ya: lo que se quedó sin comprar cuando la fecha pasó, y lo entregado,
 * que dentro de «Listos» es el único que se distingue de los demás.
 */
function filaDeRegalo({ regalo, ocasion }, ctx, { pasada = false } = {}) {
  const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
  const estado = estadoDeRegalo(regalo);
  const quien = regalo.responsable_id === ctx.vista.yo.id ? 'te encargas tú'
    : regalo.responsable_id ? `se encarga ${ctx.vista.nombre(regalo.responsable_id)}`
      : 'sin encargado';

  // «sin comprar» y no «se quedó sin comprar»: dentro de «Ya pasaron» el tiempo
  // verbal lo pone el rótulo, y la pastilla larga parte el título en dos líneas.
  const marca = pasada && estado === 'pendiente' ? { texto: 'sin comprar', tono: 'aviso' }
    : estado === 'entregado' ? { texto: 'entregado', tono: 'regalo' }
      : { texto: quien, tono: regalo.responsable_id ? null : 'aviso' };

  const para = [regalo.destinatario_principal_id, ...(regalo.codestinatarios || [])]
    .filter(Boolean).map((id) => ctx.vista.nombre(id));

  return el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleRegalo(regalo.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: idea?.titulo || 'Regalo' }),
      el('span', { class: 'etiqueta empujar', 'data-tono': marca.tono, texto: marca.texto }),
    ]),
    el('p', {
      texto: [
        para.length ? `para ${para.join(' y ')}` : 'sin destinatario',
        ocasion.nombre,
        cuandoLaOcasion(ocasion.fecha),
        // Lo comprado dice cuánto costó; lo que falta por comprar, no: ahí el
        // importe todavía no existe y el hueco no cuenta nada.
        estado !== 'pendiente' && typeof regalo.coste_real === 'number' ? formatearImporte(regalo.coste_real) : null,
        // Cuando la pastilla la ocupa el estado, quién se encarga baja aquí: sigue
        // haciendo falta para saber a quién preguntarle.
        marca.texto !== quien && regalo.responsable_id ? quien : null,
      ].filter(Boolean).join(' · '),
    }),
  ]);
}

/**
 * Cuánto falta, contado como se cuenta hablando. Es la regla del cumpleaños: de
 * cerca en días, de lejos por la fecha, que es lo único que significa algo a
 * cuatro meses vista. Y hacia atrás igual, porque lo que ya pasó también se
 * sitúa mejor por días mientras sean pocos.
 */
function cuandoLaOcasion(fecha) {
  const cuando = parsearMomento(fecha);
  if (!cuando) return '';
  const dias = Math.round((cuando - hoy()) / 86400000);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  if (dias > 1 && dias <= 60) return `en ${dias} días`;
  if (dias < -1 && dias >= -60) return `hace ${-dias} días`;
  return fechaCorta(fecha);
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
 * ¿Esta ocasión es el cumpleaños de alguien? Y en tal caso, de quién.
 *
 * No hay columna que lo diga, y no hace falta inventarla: una ocasión que cae el
 * mismo día del año que nació alguno de sus participantes es su cumpleaños. Se
 * deduce del dato en lugar de guardarse, de modo que no puede quedarse
 * desactualizado —así se reconoce también «Cumpleaños de Marta 2025», que se
 * creó antes de que esta pantalla existiera—.
 */
function deQuienEsElCumple(ocasion, ctx) {
  return (ocasion.participantes || [])
    .map((id) => ctx.vista.persona(id))
    .find((persona) => persona?.fecha_nacimiento && mismoDiaYMes(persona.fecha_nacimiento, ocasion.fecha)) || null;
}

const esDeCumple = (ocasion, ctx) => Boolean(deQuienEsElCumple(ocasion, ctx));

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
            mios ? `te encargas de ${mios}` : null,
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
  const ideas = ctx.vista.ideasPara(persona.id).length + ctx.vista.deseosDe(persona.id).length;

  // Del cumpleaños propio no se dice cuántos regalos hay, ni siquiera que hay
  // cero: si el recuento apareciera solo cuando existe, su ausencia contaría lo
  // mismo que su presencia.
  const preparativos = esMio
    ? null
    : regalos ? `${regalos} ${regalos === 1 ? 'regalo' : 'regalos'}`
      : ideas ? `${ideas} ${ideas === 1 ? 'cosa pensada' : 'cosas pensadas'}`
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

/**
 * La hoja de una fecha señalada: una sección por persona, y en cada una cómo va
 * lo suyo (specs/propuesta-ocasion-senalada.html).
 *
 * El nombre encabeza con cuerpo de título y el «+» que le añade un regalo va al
 * final de esa misma línea: era un enlace por sección —«Añadir un regalo para
 * X»— y con seis personas eran seis renglones diciendo lo mismo. Debajo, en voz
 * baja, las tres cuentas que se vienen a mirar en noviembre.
 */
export function abrirOcasion(ocasionId, ctx) {
  const ocasion = ctx.vista.ocasion(ocasionId);
  if (!ocasion) return;

  abrirHoja(ocasion.nombre, (cuerpo) => {
    for (const persona of participantesEnOrden(ocasion, ctx)) {
      // Un miembro ve todas las listas salvo la suya propia, en cuyo lugar
      // aparece el aviso (spec funcional §6.1). Ni cuentas ni «+»: el recuento
      // de lo propio es justo lo que no se puede enseñar, y a uno mismo no se
      // le añade un regalo desde aquí.
      if (persona.id === ctx.vista.yo.id) {
        cuerpo.append(el('div', { class: 'grupo' }, [
          cabeceraDePersona(persona),
          el('div', { class: 'sello' }, [
            el('strong', { texto: 'Por aquí no se mira' }),
            el('span', { texto: 'Vuelve otro día.' }),
          ]),
        ]));
        continue;
      }

      const regalos = ctx.vista.regalosPara(ocasion.id, persona.id);
      cuerpo.append(el('div', { class: 'grupo' }, [
        cabeceraDePersona(persona, {
          cuentas: cuentasDeLaSeccion(regalos, ctx),
          alAnadir: () => abrirSelectorDeRegalo(ctx, { ocasion, destinatario: persona.id }),
        }),
        ...regalos.map((regalo) => tarjetaDeRegalo(regalo, ctx)),
      ]));
    }

    // Cerrar es lo que archiva de verdad: mientras la ocasión siga abierta, sus
    // regalos se quedan a la vista aunque la fecha se haya ido. Duplicar estaba
    // aquí al lado y se ha ido: crear la del año que viene son cuatro toques, y
    // las personas rara vez son las mismas.
    if (ocasion.estado === 'abierta') {
      cuerpo.append(el('div', { class: 'acciones' }, [
        el('button', {
          class: 'boton crecer', 'data-tono': 'discreto', type: 'button',
          onclick: () => confirmarCierreDeOcasion(ocasion, ctx),
        }, ['Darla por cerrada']),
      ]));
    }
  }, [
    // El verbo que se usa va arriba, junto al título, igual que en un evento y en
    // una idea. Borrar no: vive donde se edita.
    botonIcono('editar', {
      etiqueta: 'Editar',
      onclick: () => abrirFormularioOcasion(ctx, { id: ocasion.id }),
    }),
  ]);
}

/**
 * Los círculos, en el orden en que se piensa en la gente al repartir una fecha
 * señalada: primero la casa, después la familia de fuera y al final los amigos.
 */
const ORDEN_DE_CIRCULOS = ['familia', 'extendida', 'amigos'];

/**
 * En qué orden salen las personas de una ocasión.
 *
 * Por círculos, y dentro de cada uno por edad, los mayores delante. La edad y no
 * el próximo cumpleaños: el orden de una Navidad no puede cambiar de un día para
 * otro porque alguien haya cumplido años.
 *
 * Quien no tiene fecha de nacimiento cierra su círculo, por orden alfabético: no
 * se le puede colocar por una edad que no está, y ponerlo delante haría que dar
 * de alta una fecha reordenase media pantalla sin avisar.
 *
 * **Uno mismo va siempre, y siempre el último**, participe o no de la ocasión.
 * Participe o no, porque su ausencia sería información: no verse a uno mismo en
 * la Navidad de la casa diría que nadie le ha puesto nada, que es justo lo que
 * esta pantalla existe para no decir.
 */
function participantesEnOrden(ocasion, ctx) {
  const mio = ctx.vista.yo.id;
  const gente = (ocasion.participantes || [])
    .filter((id) => id !== mio)
    .map((id) => ctx.vista.persona(id))
    .filter(Boolean)
    .sort(porCirculoYEdad);

  const propia = ctx.vista.persona(mio);
  return propia ? [...gente, propia] : gente;
}

function porCirculoYEdad(una, otra) {
  const circulo = (persona) => {
    const donde = ORDEN_DE_CIRCULOS.indexOf(persona.circulo || 'extendida');
    return donde === -1 ? ORDEN_DE_CIRCULOS.length : donde;
  };
  if (circulo(una) !== circulo(otra)) return circulo(una) - circulo(otra);

  const nacida = Boolean(una.fecha_nacimiento);
  const nacido = Boolean(otra.fecha_nacimiento);
  if (nacida !== nacido) return nacida ? -1 : 1;
  // Las fechas del registro son «aaaa-mm-dd», así que la comparación de textos
  // es la de calendario: la más antigua primero, que es quien más años tiene.
  if (nacida && una.fecha_nacimiento !== otra.fecha_nacimiento) {
    return String(una.fecha_nacimiento).localeCompare(String(otra.fecha_nacimiento));
  }
  return nombreCompleto(una).localeCompare(nombreCompleto(otra), 'es');
}

/** El nombre con cuerpo de título y, al final de su línea, el «+» que le añade
 *  un regalo. Debajo, las cuentas, si es que se pueden dar. */
function cabeceraDePersona(persona, { cuentas = null, alAnadir = null } = {}) {
  return el('div', { class: 'persona-cabeza' }, [
    el('div', { class: 'persona-cabeza-fila' }, [
      el('h3', { texto: nombreCompleto(persona) }),
      alAnadir ? el('button', {
        class: 'mas-regalo', type: 'button',
        'aria-label': `Añadir un regalo para ${persona.nombre}`,
        title: `Añadir un regalo para ${persona.nombre}`,
        onclick: () => { toque(); alAnadir(); },
      }, ['+']) : null,
    ]),
    cuentas ? el('p', { class: 'persona-cuentas' }, cuentas) : null,
  ]);
}

/** El precio que se le apuntó a la idea, que es lo más parecido a un precio que
 *  tiene un regalo antes de comprarse. El máximo antes que el mínimo: es el que
 *  escribe el formulario, y de los dos es el que no se queda corto. */
function precioApuntado(idea) {
  for (const valor of [idea?.precio_max, idea?.precio_min]) {
    if (typeof valor === 'number') return valor;
  }
  return null;
}

/**
 * Cuánto se va a gastar en esta persona: lo que ya se pagó más lo que se piensa
 * pagar.
 *
 * Un regalo solo tiene importe cuando alguien lo escribe **después** de
 * comprarlo. Para lo que aún no está comprado se usa el precio de su idea, que
 * es una estimación y por eso la cifra sale con `≈` en cuanto lleva una dentro.
 *
 * Lo que no tiene ni una cosa ni la otra no suma cero: se cuenta aparte y se
 * dice. Es la misma regla que ya escribió `gastoDe` en su día —distinguir lo
 * registrado de lo que falta por registrar evita enseñar una desviación
 * favorable inexistente—, y sin ella la suma se leería como si estuviera
 * completa.
 */
function dineroDe(regalos, ctx) {
  let suma = 0;
  let hay = false;
  let estimado = false;
  let sinPrecio = 0;

  for (const regalo of regalos) {
    if (typeof regalo.coste_real === 'number') {
      suma += regalo.coste_real;
      hay = true;
      continue;
    }
    const precio = precioApuntado(regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null);
    if (precio === null) {
      sinPrecio += 1;
      continue;
    }
    suma += precio;
    hay = true;
    estimado = true;
  }

  return { hay, suma, estimado, sinPrecio };
}

/** Las piezas del renglón de cuentas, con su separador entre medias. */
const unidasPor = (piezas, separador = ' · ') =>
  piezas.filter(Boolean).flatMap((pieza, i) => (i ? [separador, pieza] : [pieza]));

function cuentasDeLaSeccion(regalos, ctx) {
  if (!regalos.length) return ['Sin nada asignado'];

  const porComprar = regalos.filter((r) => estadoDeRegalo(r) === 'pendiente').length;
  const { hay, suma, estimado, sinPrecio } = dineroDe(regalos, ctx);

  return unidasPor([
    `${regalos.length} ${regalos.length === 1 ? 'regalo' : 'regalos'}`,
    porComprar
      ? el('span', { class: 'falta', texto: `${porComprar} por comprar` })
      : 'todo comprado',
    hay
      ? el('span', { class: 'dinero', texto: `${estimado ? '≈ ' : ''}${formatearImporte(suma)}` })
      : null,
    sinPrecio ? `${sinPrecio} sin precio` : null,
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

  // Volver a abrirse tal cual está: lo pide quitar un regalo, que cambia lo que
  // esta hoja enseña y no puede esperar a la próxima vez que se abra.
  const reabrir = () => abrirCumple(personaId, ctx, { dia, comentariosDe, acciones });

  // La hoja se rehace entera, así que la tarjeta que tuviera los verbos a la
  // vista ya no existe: se olvida aquí para no dejar apuntado un nodo que se ha
  // ido. Es la misma limpieza que hace la lista de ocasiones al repintarse.
  cerrarDeslizada();

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
      cuerpo.append(bloqueDeRegalosDelCumple(persona, ctx, reabrir));
    }

    if (comentariosDe) cuerpo.append(bloqueDeComentarios('evento', comentariosDe, ctx, { vistoHasta: ctx.vista.vistoHasta('evento', comentariosDe) }));
  }, [
    // Quién es va delante de qué se le cambia: primero se mira y luego se
    // corrige, que es el orden en que se usan. Antes esto era un enlace al pie
    // de la hoja, debajo de los comentarios, donde había que bajar a buscarlo.
    botonIcono('informacion', {
      etiqueta: `Ver la ficha de ${persona.nombre}`,
      tono: 'discreto',
      onclick: () => abrirFicha(personaId, ctx),
    }),
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
function bloqueDeRegalosDelCumple(persona, ctx, reabrir) {
  const ocasion = ocasionDelCumple(persona, ctx);
  const regalos = ocasion ? ctx.vista.regalosDe(ocasion.id) : [];
  // Lo que ha pedido cuenta igual que lo que se le ha apuntado: las dos cosas
  // salen al elegir el regalo, así que las dos valen para decir si hay algo
  // pensado o no hay nada.
  const ideas = [...ctx.vista.ideasPara(persona.id), ...ctx.vista.deseosDe(persona.id)];

  // Quitar uno tiene que rehacer **esta hoja**, no solo la pantalla de detrás:
  // `ctx.refrescar()` repinta la pestaña, pero la hoja se construyó una vez y se
  // quedaría enseñando el regalo que acaba de irse.
  const alQuitar = () => { ctx.refrescar(); reabrir(); };

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Regalos' }),
    ...regalos.map((regalo) => tarjetaDeRegalo(regalo, ctx, { alQuitar })),
    regalos.length ? null : el('p', {
      class: 'pista',
      texto: ideas.length
        ? `Nada asignado todavía, pero hay ${ideas.length} ${ideas.length === 1 ? 'cosa pensada' : 'cosas pensadas'} para ${persona.nombre}.`
        : 'Nada asignado todavía, y nada pensado tampoco.',
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

/**
 * Un regalo apuntado en una ocasión.
 *
 * Con `alQuitar`, deslizarla a la izquierda descubre el verbo de quitarlo, que
 * es el mismo «Quitar de la ocasión» que ya tiene su detalle: el gesto solo se
 * salta un paso, igual que en la pastilla de una ocasión. Y quitar aquí es
 * desenlazar, no borrar: se retira el regalo, y la idea se queda en el banco
 * libre para otra ocasión.
 */
function tarjetaDeRegalo(regalo, ctx, { alQuitar = null } = {}) {
  const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
  const tarjeta = el('button', { class: 'tarjeta', type: 'button', onclick: () => abrirDetalleRegalo(regalo.id, ctx) }, [
    el('div', { class: 'tarjeta-fila' }, [
      el('h3', { texto: idea?.titulo || 'Regalo' }),
      el('span', { class: 'etiqueta empujar', 'data-tono': 'regalo', texto: textoDeEstado(regalo).toLowerCase() }),
    ]),
    el('p', {
      texto: [
        regalo.responsable_id ? `se encarga ${ctx.vista.nombre(regalo.responsable_id)}` : 'sin encargado',
        typeof regalo.coste_real === 'number' ? formatearImporte(regalo.coste_real) : null,
        regalo.compartido ? 'compartido' : null,
      ].filter(Boolean).join(' · '),
    }),
  ]);

  if (!alQuitar) return tarjeta;

  return conVerbosAlDeslizar(tarjeta, [
    botonIcono('borrar', {
      etiqueta: `Quitar ${idea?.titulo || 'el regalo'} de la ocasión`,
      tono: 'peligro',
      onclick: async () => {
        await retirar('regalo', regalo.id);
        toque('media');
        avisar(idea ? 'Quitado. La idea vuelve a Disponibles.' : 'Regalo quitado');
        alQuitar();
      },
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

    // Un solo botón en el cuerpo, y solo cuando hay algo que hacer con esto: la
    // hoja de un deseo propio se queda sin ninguno, porque un deseo no se lleva
    // a ninguna parte —el regalo que saliera de ahí lo ocultaría el servidor a
    // su propio autor—.
    const verbo = idea.estado === 'descartada'
      ? el('button', {
          class: 'boton crecer', type: 'button',
          onclick: async () => { await guardar('idea', idea.id, { estado: 'activa' }); cerrarHoja(); ctx.refrescar(); },
        }, ['Reactivar'])
      : esDeseoPropio(idea, ctx) ? null : el('button', {
          class: 'boton crecer', type: 'button',
          onclick: () => abrirPromocion(idea, ctx),
        }, ['Llevar a una fecha señalada']);
    if (verbo) cuerpo.append(el('div', { class: 'acciones' }, [verbo]));

    // El hilo, que el modelo admitía desde el principio y ninguna pantalla
    // enseñaba: la tabla, el filtro del Worker y `especificacion.md` §5.3
    // hablaban de idea, regalo y evento, y solo los eventos lo dibujaban. Aquí
    // es donde se acuerda si la talla es la 39 o la 40.
    cuerpo.append(bloqueDeComentarios('idea', idea.id, ctx, { vistoHasta: ctx.vista.vistoHasta('idea', idea.id) }));

    // Borrar no vive aquí: es una operación de edición, y está donde se edita.
  }, [
    // Los dos verbos que se usan van arriba, junto al título, igual que en un
    // evento. Editar primero, que es lo que uno viene a hacer.
    botonIcono('editar', {
      etiqueta: 'Editar',
      onclick: () => abrirFormularioIdea(ctx, { id: idea.id }),
    }),
    // Descartar es la salida, y no lleva papelera porque no destruye nada:
    // aparta, y se reactiva desde la misma hoja. En tono discreto por lo mismo.
    // Sobre lo ya descartado no aparece: ahí el verbo es el otro.
    idea.estado === 'descartada' ? null : botonIcono('descartar', {
      etiqueta: esDeseoPropio(idea, ctx) ? 'Descartar el deseo' : 'Descartar la idea',
      tono: 'discreto',
      onclick: async () => {
        await guardar('idea', idea.id, { estado: 'descartada' });
        toque('media');
        cerrarHoja();
        avisar(esDeseoPropio(idea, ctx) ? 'Deseo descartado' : 'Idea descartada');
        ctx.refrescar();
      },
    }),
  ]);
}

/**
 * Un regalo por dentro: cómo va, quién se encarga, lo que costó y las dos puertas
 * por las que se sale.
 *
 * Las puertas importan porque un regalo no se entiende solo: se entiende por la
 * fecha a la que va y por la persona que lo va a recibir. Desde la lista de
 * regalos no hay otra manera de llegar a ninguna de las dos, y hacer el camino
 * por la pestaña de al lado —buscar la ocasión, abrirla, encontrar la línea— es
 * exactamente lo que esta pantalla vino a evitar.
 *
 * La ficha va arriba, con los verbos, y la ocasión dentro del cuerpo: la primera
 * es siempre el mismo gesto —mirar quién es— y la segunda lleva escrito el
 * nombre de la fecha y cuánto falta, que no cabe en un icono.
 */
/**
 * El regalo, que es la pantalla donde se le da a un botón y ya está.
 *
 * Los dos campos que se tocan de verdad —cómo va y quién se encarga— eran
 * desplegables, y un desplegable cuesta dos toques y una lista: abrirlo, buscar
 * y elegir. Aquí las opciones caben a la vista, así que están a la vista: tres
 * estados y los cuatro de casa, y marcar es un solo toque.
 *
 * Y se guarda al final, no campo a campo. Al pulsar un estado por error, antes
 * ya estaba escrito; ahora hay un botón de Guardar y otro de Cancelar, como en
 * el formulario de un evento o en el de una idea, y salir sin guardar no deja
 * nada hecho.
 */
export function abrirDetalleRegalo(regaloId, ctx) {
  const regalo = ctx.vista.regalo(regaloId);
  if (!regalo) return;
  const idea = regalo.idea_id ? ctx.vista.idea(regalo.idea_id) : null;
  const ocasion = ctx.vista.ocasion(regalo.ocasion_id);
  const destinatario = ctx.vista.persona(regalo.destinatario_principal_id);
  const cumpleanero = ocasion ? deQuienEsElCumple(ocasion, ctx) : null;

  const borrador = {
    estado: estadoDeRegalo(regalo),
    responsable_id: regalo.responsable_id || null,
    coste_real: typeof regalo.coste_real === 'number' ? regalo.coste_real : null,
  };

  // Adónde va, arriba y en un verbo: lleva al cumpleaños cuando la ocasión es
  // uno, porque esa es la hoja donde de verdad se prepara —con los años, la
  // felicitación y el resto de los regalos— y no la genérica.
  const verLaOcasion = ocasion ? botonIcono('informacion', {
    etiqueta: `Ver ${ocasion.nombre}`,
    tono: 'discreto',
    onclick: () => (cumpleanero ? abrirCumple(cumpleanero.id, ctx) : abrirOcasion(ocasion.id, ctx)),
  }) : null;

  // Quitar sube a la cabecera, junto al título, que es donde esta aplicación
  // pone el borrado de todo lo que se edita.
  const quitar = botonIcono('borrar', {
    etiqueta: 'Quitar de la ocasión', tono: 'peligro',
    onclick: async () => {
      await retirar('regalo', regalo.id);
      toque('media');
      cerrarHoja();
      // Se dice a dónde va, que es lo que no se veía: el regalo desaparece, pero
      // la idea de la que salió vuelve al banco y se puede volver a coger. Sin
      // decirlo, quitar un regalo parece perderlo todo.
      avisar(idea ? 'Quitado. La idea vuelve a Disponibles.' : 'Regalo quitado');
      ctx.refrescar();
    },
  });

  abrirHoja(idea?.titulo || 'Regalo', (cuerpo) => {
    // Para quién, y de qué ocasión. El nombre lleva a su ficha: es lo que había
    // en el icono de arriba antes de que este pasara a llevar a la ocasión, y se
    // consulta lo bastante como para no perderlo.
    cuerpo.append(el('p', { class: 'pista' }, [
      'Para ',
      destinatario
        ? el('button', {
            class: 'enlace-en-linea', type: 'button',
            onclick: () => abrirFicha(destinatario.id, ctx),
          }, [destinatario.nombre])
        : '—',
      ocasion ? ` · ${ocasion.nombre}, ${cuandoLaOcasion(ocasion.fecha)}` : null,
    ]));

    cuerpo.append(campo('Cómo va', pastillasDeEstado(borrador.estado, (valor) => {
      borrador.estado = valor;
    })));

    // La asignación de responsable resuelve el problema práctico de la
    // duplicidad: es visible para quien coordina y opaca para el destinatario. A
    // quien lo recibe no se le ofrece, que no va a comprarse su propia sorpresa.
    cuerpo.append(campoDeGente(ctx, {
      etiqueta: 'Quién se encarga',
      pista: 'Ponerse aquí evita que otra persona lo compre por segunda vez. Tocar de nuevo a quien esté puesto lo deja sin nadie.',
      elegidos: borrador.responsable_id ? [borrador.responsable_id] : [],
      unica: true,
      memoria: 'responsable',
      excluir: [regalo.destinatario_principal_id],
      alCambiar: (ids) => { borrador.responsable_id = ids[0] || null; },
    }));

    const coste = entrada({
      type: 'number', inputmode: 'decimal', step: '0.01',
      value: borrador.coste_real ?? '',
    });
    coste.addEventListener('input', () => {
      borrador.coste_real = coste.value.trim() === '' ? null : Number(coste.value);
    });
    cuerpo.append(campo('Lo que costó', coste, 'Opcional. Es lo que permite saber después en qué se fue una ocasión.'));

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          await guardar('regalo', regalo.id, {
            estado: borrador.estado,
            responsable_id: borrador.responsable_id,
            coste_real: Number.isFinite(borrador.coste_real) ? borrador.coste_real : null,
          });
          if (borrador.responsable_id) recordarElegidos('responsable', [borrador.responsable_id]);
          toque('media');
          cerrarHoja();
          avisar('Regalo actualizado');
          ctx.refrescar();
        },
      }, ['Guardar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));

    // El hilo va debajo de los verbos y no encima: aquí se viene a marcar cómo
    // va, y lo que se hable —quién lo compra al final, dónde estaba más barato—
    // se lee después de haber hecho lo que se venía a hacer.
    cuerpo.append(bloqueDeComentarios('regalo', regalo.id, ctx, { vistoHasta: ctx.vista.vistoHasta('regalo', regalo.id) }));
  }, [verLaOcasion, quitar]);
}

/** Los tres estados, a la vista y en una fila. Son pocos, cortos y excluyentes:
 *  justo lo que no había que haber metido nunca en un desplegable. */
function pastillasDeEstado(valor, alElegir) {
  const fila = el('div', { class: 'opciones' });
  for (const estado of ESTADOS_REGALO) {
    fila.append(el('button', {
      class: 'opcion', type: 'button',
      'aria-pressed': estado.valor === valor ? 'true' : 'false',
      onclick: () => {
        alElegir(estado.valor);
        for (const otro of fila.children) otro.setAttribute('aria-pressed', 'false');
        fila.children[ESTADOS_REGALO.indexOf(estado)].setAttribute('aria-pressed', 'true');
      },
    }, [estado.texto]));
  }
  return fila;
}

// -------------------------------------------------------------- Promoción --

/**
 * Llevar una idea a una ocasión, que aquí quiere decir **a una fecha señalada**.
 *
 * Los cumpleaños se quedan fuera de esta lista a propósito, aunque tengan
 * ocasión abierta. A un cumpleaños no se le lleva una idea suelta: se entra en
 * él —desde Ocasiones o desde la agenda— y allí se eligen los regalos de quien
 * cumple, con lo que se sabe de esa persona delante. Mezclar «Cumpleaños de
 * Marta 2026» con «Navidad» en un desplegable obligaba además a acertar el año
 * en un sitio donde no se ve ni de quién es.
 */
function abrirPromocion(idea, ctx) {
  const abiertas = (ctx.vista.datos.ocasiones || []).filter(
    (o) => o.estado === 'abierta' && estaActivo(o, 'activa') && !esDeCumple(o, ctx),
  );
  const destinos = (idea.orientaciones || []).map((o) => o.persona_id).filter(Boolean);

  abrirHoja('Llevar a una fecha señalada', (cuerpo) => {
    if (!abiertas.length) {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: 'No hay ninguna fecha señalada en marcha. Se crea en Ocasiones. Para un cumpleaños no hace falta: se entra en él y allí se eligen los regalos.',
      }));
      return;
    }
    const ocasion = seleccion(abiertas.map((o) => ({ valor: o.id, texto: `${o.nombre} · ${fechaCorta(o.fecha)}` })), abiertas[0].id);
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

  /**
   * Lo que ha pedido quien va a recibir el regalo.
   *
   * No está en el banco de ideas —un deseo es de quien lo escribe, no una idea
   * que la casa apunta para otro— y por eso hasta ahora no salía por aquí: lo
   * que alguien pedía solo se podía coger entrando en su ficha, justo cuando lo
   * que se estaba haciendo era prepararle un regalo. Va el primero de la lista,
   * porque una cosa que te han pedido gana a cualquier idea.
   */
  const pedidas = () => (para ? ctx.vista.deseosDe(para) : []);

  /** Todo lo que se puede elegir ahora mismo, para leer lo marcado de una sola
   *  lista: los deseos no están en el banco y se perderían al asociar. */
  const elegibles = () => [...apuntadas, ...pedidas()];

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
    const marca = (idea, { conDestino = false, pedido = false } = {}) => {
      const puesta = marcadas.has(idea.id);
      const destinos = conDestino
        ? (idea.orientaciones || [])
          .map((o) => (o.persona_id ? ctx.vista.nombre(o.persona_id) : ctx.vista.etiqueta(o.etiqueta_id)?.nombre))
          .filter(Boolean)
        : [];
      // En lo que ha pedido la propia persona, «de Marta» sobra: lo dice el
      // rótulo del grupo. En su lugar va lo que sí ayuda a decidir.
      const pista = pedido
        ? [precioDe(idea), ctx.vista.categoria(idea.categoria_id)?.nombre].filter(Boolean).join(' · ')
        : [
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
      const pide = pedidas().filter(encaja);
      const suyas = apuntadas.filter((i) => para && deQuien(i).includes(para)).filter(encaja);
      // «Sin destinatario» es la idea que no nombra a nadie: la apuntada solo con
      // una etiqueta —«adolescente», «viajera»— o sin nada. Sirve para cualquiera,
      // y por eso acompaña siempre a las de la persona.
      const sueltas = apuntadas.filter((i) => !deQuien(i).length).filter(encaja);
      const otras = apuntadas.filter((i) => !suyas.includes(i) && !sueltas.includes(i)).filter(encaja);

      vaciar(lista).append(
        ...grupo(para ? `Lo que pide ${ctx.vista.nombre(para)}` : 'Lo que ha pedido', pide, { pedido: true }),
        ...grupo(para ? `Apuntadas para ${ctx.vista.nombre(para)}` : 'Apuntadas', suyas),
        ...grupo('Sin destinatario', sueltas),
        ...(verOtras ? grupo('De otras personas', otras, { conDestino: true }) : []),
      );
      if (!pide.length && !suyas.length && !sueltas.length && !(verOtras && otras.length)) {
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

    pie.onclick = () => asociar(elegibles().filter((i) => marcadas.has(i.id)));

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
 * La misma hoja para crear una fecha señalada y para corregirla. Es la regla del
 * evento y la de la idea —se corrige por la misma puerta por la que se crea— y
 * con ella el borrado queda arriba, junto al título, y no entre lo que se mira.
 *
 * Hubo una tercera cosa aquí, duplicar la del año pasado, que traía el nombre con
 * el año siguiente y las mismas personas marcadas. Se retiró: crear la de este
 * año son cuatro toques, las personas rara vez son las mismas y lo único que
 * ahorraba era teclear el nombre, que es el trabajo que menos cuesta.
 *
 * Al editar no se reescriben ni el estado ni la autoría: una ocasión que ya está
 * cerrada no vuelve a abrirse por corregirle el nombre, y quien la creó sigue
 * siendo quien la creó.
 */
function abrirFormularioOcasion(ctx, { id = null } = {}) {
  const existente = id ? ctx.vista.ocasion(id) : null;
  let participantes = existente ? [...(existente.participantes || [])] : [];

  const titulo = existente ? 'Editar la ocasión' : 'Nueva fecha señalada';
  const borrarOcasion = existente ? botonIcono('borrar', {
    etiqueta: 'Borrar la ocasión', tono: 'peligro',
    onclick: () => confirmarBorradoDeOcasion(existente, ctx),
  }) : null;

  abrirHoja(titulo, (cuerpo) => {
    const nombre = entrada({ value: existente ? existente.nombre : '' });
    const fecha = el('input', { type: 'date', value: existente ? existente.fecha : iso(hoy()) });
    cuerpo.append(campo('Cómo se llama', nombre), campo('Cuándo', fecha));
    cuerpo.append(campoDeGente(ctx, {
      etiqueta: 'Para quién',
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
 * Dar una ocasión por cerrada, que es lo que la archiva.
 *
 * Nada se archiva solo al pasar la fecha: una Navidad que se celebra el día 26,
 * o un cumpleaños que se junta el sábado siguiente, seguirían haciendo falta el
 * día después. Lo que hace la fecha es bajar sus regalos a «Ya pasaron», y lo
 * que los saca de ahí es esto (specs/ux.md §6.2).
 *
 * Se pregunta porque no tiene vuelta: cerrar manda los regalos al histórico de
 * cada uno y da por cerradas las ideas que salieron de aquí, exactamente igual
 * que ocurre ya cuando el último regalo se marca como entregado. Una idea
 * cerrada es terminal por diseño y sale del banco para siempre
 * (specs/modelo-datos.md §5.2).
 */
function confirmarCierreDeOcasion(ocasion, ctx) {
  const regalos = ctx.vista.regalosDe(ocasion.id);
  const sinComprar = regalos.filter((r) => estadoDeRegalo(r) === 'pendiente').length;

  abrirHoja(`Cerrar ${ocasion.nombre}`, (cuerpo) => {
    cuerpo.append(el('p', {
      texto: regalos.length
        ? `${regalos.length === 1 ? 'Su regalo pasa al histórico de quien lo recibió' : `Sus ${regalos.length} regalos pasan al histórico de quien los recibió`}, y la ocasión deja de salir en la lista.`
        : 'La ocasión deja de salir en la lista. No tiene ningún regalo apuntado.',
    }));
    if (sinComprar) {
      cuerpo.append(el('p', {
        class: 'pista', 'data-tono': 'aviso',
        texto: sinComprar === 1
          ? 'Queda uno sin comprar. Se archiva igual, y quedará constancia de que se quedó así.'
          : `Quedan ${sinComprar} sin comprar. Se archivan igual, y quedará constancia de que se quedaron así.`,
      }));
    }
    cuerpo.append(el('p', {
      class: 'pista',
      texto: 'Las ideas que salieron de aquí se dan por cerradas y salen del banco, igual que cuando un regalo se entrega.',
    }));

    // El verbo delante y «Cancelar» a su derecha, como en los formularios: la
    // confirmación no es una figura aparte con las reglas al revés.
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          await guardar('ocasion', ocasion.id, { estado: 'cerrada' });
          toque('media');
          cerrarHoja();
          avisar('Ocasión cerrada');
          ctx.refrescar();
        },
      }, ['Cerrarla']),
      el('button', { class: 'boton crecer', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

/**
 * Borrar una idea se pregunta, y se pregunta diciendo qué se lleva por delante.
 *
 * Retirar no es descartar: lo descartado vuelve con un toque desde su propia
 * hoja, y esto no vuelve. Y hay un daño que no se ve venir: **el regalo que
 * saliera de esa idea se queda sin nombre**. Un regalo guarda de qué idea salió
 * y toma de ella su título; con la idea retirada, la instantánea deja de
 * traerla y la línea pasa a llamarse «Regalo» y nada más, en la lista, en la
 * ocasión y en el histórico de quien lo recibió.
 *
 * Sobre un deseo propio no se cuentan regalos. No es que no pueda haberlos: es
 * que no se ven —el servidor los oculta a su destinatario—, así que decir «no
 * hay ninguno» sería mentir con cara de dato, y decir cuántos hay sería contar
 * justo lo que no se puede contar.
 */
function confirmarBorradoDeIdea(idea, ctx, { alCancelar = null } = {}) {
  const esDeseo = esDeseoPropio(idea, ctx);
  const colgando = esDeseo ? [] : (ctx.vista.datos.regalos || [])
    .filter((r) => r.idea_id === idea.id && estaActivo(r));

  abrirHoja(`Borrar ${idea.titulo}`, (cuerpo) => {
    cuerpo.append(el('p', {
      texto: esDeseo
        ? 'Se retira de tus deseos. Para volver a pedirlo habrá que escribirlo otra vez.'
        : 'Se retira del banco de ideas. Para volver a usarla habrá que escribirla otra vez.',
    }));

    if (colgando.length) {
      cuerpo.append(el('p', {
        class: 'pista', 'data-tono': 'aviso',
        texto: colgando.length === 1
          ? 'Hay un regalo cogido a partir de ella. El regalo se queda, pero pierde el nombre: pasa a llamarse «Regalo» y nada más. Si quieres conservarlo, quita antes el regalo.'
          : `Hay ${colgando.length} regalos cogidos a partir de ella. Se quedan, pero pierden el nombre: pasan a llamarse «Regalo» y nada más. Si quieres conservarlo, quita antes los regalos.`,
      }));
    }

    // Descartar sigue estando y no es lo mismo, así que se dice: casi siempre es
    // lo que se quería hacer.
    if (idea.estado !== 'descartada') {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: esDeseo
          ? 'Si solo es que ya no te apetece, descartarlo lo aparta y se puede recuperar.'
          : 'Si solo es que ya no vale para nadie, descartarla la aparta y se puede recuperar.',
      }));
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: async () => {
          await retirar('idea', idea.id);
          toque('media');
          cerrarHoja();
          // La confirmación repite el verbo del botón: «Borrar» no puede
          // confirmar con «retirada», que aquí es otra cosa.
          avisar(esDeseo ? 'Deseo borrado' : 'Idea borrada');
          ctx.refrescar();
        },
      }, ['Borrar']),
      el('button', {
        class: 'boton crecer', 'data-tono': 'discreto', type: 'button',
        // Reabrir ya cierra esta: la hoja es una sola. Cerrarla antes a mano
        // dejaría un parpadeo entre las dos.
        onclick: () => (alCancelar ? alCancelar() : cerrarHoja()),
      }, ['Cancelar']),
    ]));
  });
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
        ? `Se retira la ocasión y con ella ${regalos.length === 1 ? 'el regalo que tiene apuntado' : `los ${regalos.length} regalos que tiene apuntados`}. Las ideas se quedan en el banco, disponibles para otra ocasión.`
        : 'Se retira la ocasión. No tiene ningún regalo apuntado.',
    }));

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: async () => {
          for (const regalo of regalos) await retirar('regalo', regalo.id);
          await retirar('ocasion', ocasion.id);
          toque('media');
          cerrarHoja();
          avisar('Ocasión borrada');
          ctx.refrescar();
        },
      }, ['Borrar']),
      el('button', { class: 'boton crecer', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
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
    etiqueta: esDeseoPropio(existente, ctx) ? 'Borrar el deseo' : 'Borrar la idea',
    tono: 'peligro',
    // Se pregunta antes, y cancelar devuelve al formulario: la hoja es una sola,
    // así que la pregunta se come lo que hubiera abierto y hay que reponerlo.
    onclick: () => confirmarBorradoDeIdea(existente, ctx, {
      alCancelar: () => abrirFormularioIdea(ctx, { id: existente.id }),
    }),
  }) : null;

  // El título dice qué se está apuntando: desde Deseos se viene a pedir algo,
  // no a apuntarle una idea a otro.
  const esUnDeseo = existente ? esDeseoPropio(existente, ctx) : paraPersona === ctx.vista.yo.id;
  abrirHoja(existente ? (esUnDeseo ? 'Editar el deseo' : 'Editar idea')
    : esUnDeseo ? 'Pedir algo' : 'Apuntar una idea', (cuerpo) => {
    const titulo = entrada({ value: existente?.titulo || '' });
    enfocarAlAbrir(titulo);

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

    // Pidiendo algo no se pregunta para quién: se sabe. El campo entero sobra, y
    // con él sobra el aviso de que esto se guarda como un deseo, que era lo que
    // había que decir cuando uno llegaba aquí sin querer.
    const pistaDeseo = el('p', { class: 'pista', hidden: true });
    if (esUnDeseo) {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: 'Es para ti. Lo ve tu familia, y a ti no se te dirá si alguien lo coge.',
      }));
    } else {
      cuerpo.append(campoDeGente(ctx, {
        etiqueta: 'Para quién',
        pista: 'Nombrar a una persona con cuenta oculta la idea para ella, de forma automática y permanente.',
        elegidos: destinatarios,
        alCambiar: (ids) => { destinatarios = ids; ajustarPedir(); avisoDeDeseo(); },
      }));

      // Marcarse a uno mismo cambia lo que se está apuntando, y conviene decirlo
      // antes de guardar: lo que se escribe deja de ser una idea para regalar y
      // pasa a ser lo que uno pide, que vive en otro sitio.
      pistaDeseo.setAttribute('data-tono', 'aviso');
      pistaDeseo.textContent = 'Solo estás tú: esto se guarda como algo que pides. Va a Deseos y a tu ficha, no al banco de ideas para regalar.';
      cuerpo.append(pistaDeseo);
    }
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
        : soloParaMi() ? 'Apuntado en Deseos' : 'Idea apuntada');
      ctx.refrescar();
    };

    titulo.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') guardarIdea(); });

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', { class: 'boton crecer', type: 'button', onclick: guardarIdea }, [existente ? 'Guardar' : 'Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  }, [borrarIdea]);
}
