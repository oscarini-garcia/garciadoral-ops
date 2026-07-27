/**
 * El campo con el que se elige gente, en todas las pantallas que lo piden.
 *
 * Todas hacían lo mismo y de la misma manera mala: enseñar a todo el mundo de
 * una vez, en un montón de pastillas por orden alfabético. Con once personas ya
 * son tres filas; un hogar con los primos y los amigos pasa de treinta y el
 * campo se come la pantalla. Aquí está una sola vez y con la misma regla:
 *
 * - En reposo se ven **los de casa**, que son a quienes se elige casi siempre, y
 *   quien ya esté elegido de fuera, que no puede esconderse nunca: guardar sin
 *   ver a quién se ha nombrado sería un silencio peligroso justo en el campo que
 *   decide, en las ideas, quién no las ve.
 * - El **«+»** abre debajo un buscador con una sola lista: mientras no se
 *   escribe son los últimos que se eligieron en este teléfono, y al escribir
 *   pasa a ser el resultado. Nunca las dos a la vez, de modo que el hueco es el
 *   mismo antes y después de teclear.
 * - Se busca por nombre y por parentesco, sin acentos ni mayúsculas: «abu»
 *   encuentra a los dos abuelos, «tía» encuentra a Rosa.
 *
 * Va dentro de la hoja que esté abierta y no en otra encima porque la aplicación
 * tiene una sola: abrir la segunda cerraría el formulario a medio escribir.
 *
 * La memoria es por uso y no una sola: a quien se le apuntan regalos y quien va
 * a los eventos no son la misma gente, y mezclarlas daría sugerencias peores en
 * los dos sitios.
 */

import { el, vaciar, campo, entrada } from './ui.js';
import { recordarElegidos, ultimosElegidos } from './almacen.js';
import { normalizar } from './modelo.js';

/** Cuántos se enseñan al abrir. Con cuatro, la lista entra en una línea y no
 *  empuja el formulario hacia abajo. */
const CUANTOS = 4;

/** De dónde sale el orden de relleno cuando este teléfono todavía no tiene
 *  elegidos suyos, por uso. */
const RESPALDO = {
  regalo: (vista) => vista.masRegaladas(),
  evento: (vista) => vista.masEnEventos(),
  // Encargarse de un regalo lo hace quien usa la aplicación, así que el relleno
  // de este son las cuentas y no a quien más se le regala, que es justo la otra
  // punta de la misma pantalla.
  responsable: (vista) => vista.personasConCuenta().map((persona) => persona.id),
};

export { recordarElegidos };

/**
 * Devuelve el `.campo` ya montado. Quien lo llama se queda con su propia lista
 * de identificadores: `alCambiar` la recibe entera cada vez que se toca algo.
 *
 * `unica` deja una sola elección —sustituye en lugar de sumar— y cierra el
 * buscador al elegir, que es lo que hacía el desplegable al que sustituye.
 */
export function campoDeGente(ctx, {
  etiqueta,
  pista = null,
  elegidos = [],
  alCambiar = () => {},
  unica = false,
  excluir = [],
  memoria = 'regalo',
} = {}) {
  let seleccionados = [...elegidos];

  const fila = el('div', { class: 'opciones' });
  const busca = entrada({
    type: 'search', 'aria-label': 'Buscar a una persona',
    placeholder: 'Buscar por nombre o parentesco',
  });
  const rotulo = el('p', { class: 'buscagente-rotulo' });
  const lista = el('div', { class: 'opciones' });
  const panel = el('div', { class: 'buscagente', hidden: true }, [busca, rotulo, lista]);

  let abierto = false;

  const fuera = new Set(excluir);
  const deCasa = ctx.vista.personasDe('familia').filter((p) => !fuera.has(p.id));
  const enLaFila = () => new Set([...deCasa.map((p) => p.id), ...seleccionados]);

  const marcar = (id) => {
    if (unica) seleccionados = seleccionados.includes(id) ? [] : [id];
    else if (seleccionados.includes(id)) seleccionados = seleccionados.filter((otro) => otro !== id);
    else seleccionados = [...seleccionados, id];
    alCambiar([...seleccionados]);
  };

  const pastilla = (persona, alElegir = null) => {
    const marcada = seleccionados.includes(persona.id);
    return el('button', {
      class: 'opcion', type: 'button',
      'aria-pressed': marcada ? 'true' : 'false',
      onclick: () => {
        marcar(persona.id);
        if (alElegir) alElegir();
        pintar();
      },
    }, [persona.nombre, marcada && !unica ? el('span', { class: 'opcion-quitar', texto: '×' }) : null]);
  };

  function pintarFila() {
    vaciar(fila);
    for (const persona of deCasa) fila.append(pastilla(persona));
    for (const id of seleccionados) {
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
   * Con quién se abre: los últimos que se eligieron aquí para esto mismo.
   *
   * Y cuando no llegan a cuatro —el primer día, un móvil recién estrenado— se
   * completa con quienes más aparecen en el hogar y, si aún faltan, con el resto
   * de la gente. Abrir y encontrar el hueco vacío sería la peor bienvenida, y en
   * un hogar recién dado de alta sería además la única.
   */
  function conQuienAbrir(candidatos) {
    const porId = new Map(candidatos.map((p) => [p.id, p]));
    const recientes = ultimosElegidos(memoria).filter((id) => porId.has(id));
    const respaldo = (RESPALDO[memoria] || RESPALDO.regalo)(ctx.vista);
    const orden = [...recientes, ...respaldo, ...candidatos.map((p) => p.id)];

    const gente = [];
    for (const id of orden) {
      if (!porId.has(id) || gente.some((p) => p.id === id)) continue;
      gente.push(porId.get(id));
      if (gente.length === CUANTOS) break;
    }
    return { gente, hayRecientes: recientes.length > 0 };
  }

  function pintarLista() {
    vaciar(lista);
    const aguja = normalizar(busca.value).trim();
    // Quien ya está en la fila no se repite aquí: se toca arriba.
    const puestos = enLaFila();
    const candidatos = ctx.vista.personas().filter((p) => !puestos.has(p.id) && !fuera.has(p.id));

    if (!aguja) {
      const { gente, hayRecientes } = conQuienAbrir(candidatos);
      // El rótulo dice la verdad: «los últimos» solo cuando de verdad lo son.
      rotulo.textContent = hayRecientes ? 'Los últimos'
        : gente.length ? 'De tu gente' : 'Escribe un nombre o un parentesco';
      for (const persona of gente) lista.append(pastilla(persona));
      return;
    }

    const hallados = candidatos.filter(
      (p) => normalizar(p.nombre).includes(aguja) || normalizar(p.parentesco).includes(aguja),
    );
    rotulo.textContent = hallados.length ? 'Resultados' : 'Nadie con ese nombre';
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
  // Enter dentro del buscador no guarda el formulario: aquí se está eligiendo.
  busca.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') evento.preventDefault();
  });

  pintar();

  const nodo = campo(etiqueta, fila, pista);
  // El buscador va entre las pastillas y la pista, que explica el campo entero.
  fila.after(panel);
  return nodo;
}
