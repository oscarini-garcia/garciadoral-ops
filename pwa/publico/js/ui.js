/** Piezas de interfaz reutilizables: construcción de nodos, hoja modal y avisos. */

/** `el('div', {class: 'x'}, [hijo, 'texto'])`. Los atributos que empiezan por
 *  `on` se registran como escuchadores. */
export function el(etiqueta, atributos = {}, hijos = []) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (clave === 'texto') {
      nodo.textContent = valor;
    } else if (clave === 'html') {
      nodo.innerHTML = valor;
    } else if (valor === true) {
      nodo.setAttribute(clave, '');
    } else {
      nodo.setAttribute(clave, valor);
    }
  }
  for (const hijo of [].concat(hijos)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

export function vaciar(nodo) {
  while (nodo.firstChild) nodo.firstChild.remove();
  return nodo;
}

/**
 * Convierte en enlaces tocables las direcciones de un texto —`http(s)`, `www.`
 * y esquemas de aplicación como `flighty://`— y devuelve la lista de nodos para
 * meter en un elemento; lo demás viaja como texto. Es lo que hace clicable el
 * enlace que un evento importado trae en sus notas, en vez de dejar la URL cruda.
 */
export function enlazar(texto) {
  const cadena = String(texto || '');
  const patron = /((?:https?|[a-z][a-z0-9+.-]*):\/\/[^\s]+|www\.[^\s]+)/gi;
  const nodos = [];
  let ultimo = 0;
  let hallado;
  while ((hallado = patron.exec(cadena)) !== null) {
    if (hallado.index > ultimo) nodos.push(document.createTextNode(cadena.slice(ultimo, hallado.index)));
    const bruto = hallado[0];
    const href = bruto.startsWith('www.') ? `https://${bruto}` : bruto;
    const externa = /^https?:/i.test(href);
    nodos.push(el('a', { href, ...(externa ? { target: '_blank', rel: 'noopener' } : {}) }, [bruto]));
    ultimo = hallado.index + bruto.length;
  }
  if (ultimo < cadena.length) nodos.push(document.createTextNode(cadena.slice(ultimo)));
  return nodos;
}

/** Color estable por persona: el mismo nombre da siempre el mismo tono.
 *  Sin imágenes en la primera versión, los avatares se generan a partir de las
 *  iniciales (specs/ux.md §3). */
export function colorDePersona(id) {
  let suma = 0;
  for (const caracter of String(id)) suma = (suma * 31 + caracter.charCodeAt(0)) % 360;
  return `hsl(${suma} 42% 38%)`;
}

export function iniciales(persona) {
  const partes = `${persona.nombre || ''} ${persona.apellidos || ''}`.trim().split(/\s+/);
  return partes.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
}

export function avatar(persona, clase = 'avatar') {
  return el('div', { class: clase, style: `background:${colorDePersona(persona.id)}`, 'aria-hidden': 'true' }, [
    iniciales(persona),
  ]);
}

// ------------------------------------------------------------------- Iconos --

/**
 * Los pocos iconos que la aplicación dibuja en línea. Se escriben como trazo
 * sobre una rejilla de 24, igual que los de `index.html`, y heredan el color.
 *
 * El de compartir es el del sistema —la caja con la flecha hacia arriba—: en un
 * teléfono se reconoce sin leer nada, que es justo lo que una palabra dentro de
 * un botón no consigue.
 */
const ICONOS = {
  editar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  compartir: '<path d="M12 3v13"/><path d="m8 7 4-4 4 4"/><path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/>',
  borrar: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/>'
    + '<path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>'
    + '<path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  // Relleno y sin trazo: es una insignia, no un dibujo, y a este tamaño el
  // contorno la convertiría en una mancha.
  destello: '<path d="M12 2 13.6 8.4 20 10 13.6 11.6 12 18 10.4 11.6 4 10 10.4 8.4z"'
    + ' fill="currentColor" stroke-width="1"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  // El triángulo de un acordeón compacto (`acordeon(..., {compacta: true})`):
  // relleno, no trazo, porque a 13px un contorno de 1,8px se lee peor que una
  // mancha sólida — es la misma razón por la que `destello` tampoco lleva trazo.
  angulo: '<path d="M9 6l8 6-8 6z" fill="currentColor" stroke="none"/>',
  // Descartar no es cerrar ni borrar, y por eso no es un aspa ni una papelera:
  // un aspa en la cabecera de una hoja se lee como «cierra esto», que es
  // justamente lo que no hace. El círculo con la raya dice «quítalo de la
  // lista», que es lo que pasa, y deja claro que no se destruye nada.
  descartar: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  visto: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  informacion: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/>'
    + '<path d="M12 7.6v.1" stroke-width="2.4"/>',

  // Los de los apartados de Ajustes. Antes eran dos emoji sueltos —🐾 en Lío y
  // ✈️ en Viajes—, heredados de donde salió cada módulo; con las demás filas
  // sin nada delante eso se leía como un descuido. Dibujados aquí valen dos
  // cosas que un emoji no da: siguen el tema, porque heredan el color, y son
  // del mismo autor que los de la barra, de modo que comparten grosor y
  // perspectiva. El de la IA no está en esta lista porque ya estaba: es
  // `destello`, y ya significa eso en otras cuatro pantallas.
  sincronizar: '<path d="M20.5 12a8.5 8.5 0 0 1-15 5.4"/><path d="M3.5 12a8.5 8.5 0 0 1 15-5.4"/>'
    + '<path d="M18.5 2.9v3.7h-3.7"/><path d="M5.5 21.1v-3.7h3.7"/>',
  // Medio círculo relleno: es la figura del contraste, y sirve igual para
  // «claro», «oscuro» y «como el sistema» sin decantarse por ninguno.
  aspecto: '<circle cx="12" cy="12" r="8.6"/>'
    + '<path d="M12 3.4a8.6 8.6 0 0 0 0 17.2z" fill="currentColor" stroke="none"/>',
  // Cuatro dedos y la almohadilla, separados a propósito: pegados se apelmazan
  // en una mancha a los diecisiete puntos a los que se dibuja de verdad.
  huella: '<ellipse cx="6.5" cy="10" rx="1.6" ry="2"/><ellipse cx="10.1" cy="7.7" rx="1.6" ry="2.1"/>'
    + '<ellipse cx="13.9" cy="7.7" rx="1.6" ry="2.1"/><ellipse cx="17.5" cy="10" rx="1.6" ry="2"/>'
    + '<path d="M12 13.1c2.6 0 4.6 1.9 4.6 4.1 0 1.7-1.3 2.7-2.8 2.7-.7 0-1.2-.3-1.8-.3s-1.1.3-1.8.3'
    + 'c-1.5 0-2.8-1-2.8-2.7 0-2.2 2-4.1 4.6-4.1z"/>',
  avion: '<path d="M12 2.9c.85 0 1.35.85 1.35 1.95v4.5l6.9 3.95v2.1l-6.9-2.05v3.8l2.2 1.7v1.55L12 19.3'
    + 'l-3.55 1.1v-1.55l2.2-1.7v-3.8L3.75 15.4v-2.1l6.9-3.95v-4.5C10.65 3.75 11.15 2.9 12 2.9z"/>',
  campana: '<path d="M18 9.4a6 6 0 1 0-12 0c0 4.4-1.6 6.1-1.6 6.1h15.2S18 13.8 18 9.4z"/>'
    + '<path d="M10.2 18.6a2.1 2.1 0 0 0 3.6 0"/>',
  bombilla: '<path d="M9 16.6a6.4 6.4 0 1 1 6 0v1.8H9z"/><path d="M10.3 21.3h3.4"/>',
  persona: '<circle cx="12" cy="8.1" r="3.6"/><path d="M4.9 20.3a7.2 7.2 0 0 1 14.2 0"/>',
  // La bocina en trapecio, boca a la derecha, con una sola onda de sonido: a
  // los diecisiete puntos a los que se dibuja, una segunda onda se apelmaza
  // con la primera en vez de leerse como sonido.
  megafono: '<path d="M5 9.5L17 5v14L5 14.5z"/><path d="M19.3 8.6a6.2 6.2 0 0 1 0 6.8"/>',
  // Tres capas apiladas: es el dibujo de «qué hay en la agenda», la hoja que
  // lista los plugins con su interruptor, al lado del periodo en la agenda.
  capas: '<path d="M12 3.6 3.4 8.3 12 13l8.6-4.7z"/><path d="M3.4 12.6 12 17.3l8.6-4.7"/>'
    + '<path d="M3.4 16.6 12 21.3l8.6-4.7"/>',
  // El «‹» y el «›» del calendario propio, dibujados para que no dependan de
  // la fuente como los del paso de periodo.
  izquierda: '<path d="m14.5 6-6 6 6 6"/>',
  derecha: '<path d="m9.5 6 6 6-6 6"/>',
};

export function icono(nombre) {
  return el('span', {
    class: 'icono-svg',
    'aria-hidden': 'true',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ` stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre] || ''}</svg>`,
  });
}

/**
 * Botón de solo icono. La etiqueta no se dibuja, pero existe para quien no ve.
 *
 * `insignia` pega un segundo icono pequeño en la esquina, sobre su propia
 * moneda de tinta. Sirve para decir «esto es aquello, con algo encima» sin
 * tocar el dibujo de debajo: el de compartir sigue siendo el del sistema y se
 * reconoce igual.
 */
export function botonIcono(nombre, { etiqueta, tono = null, insignia = null, onclick }) {
  return el('button', {
    class: 'icono-accion', type: 'button',
    'data-tono': tono, 'aria-label': etiqueta, title: etiqueta,
    onclick,
  }, [
    icono(nombre),
    insignia ? el('span', { class: 'icono-insignia', 'aria-hidden': 'true' }, [icono(insignia)]) : null,
  ]);
}

// --------------------------------------------------------------------- Hoja --

const hoja = () => document.getElementById('hoja');
const scrim = () => document.getElementById('scrim');
let cerrarActual = null;

/**
 * Presentación modal para las tareas puntuales, según la convención de la
 * plataforma (specs/ux.md §1). Devuelve el nodo de contenido.
 *
 * `acciones` son botones de icono que se colocan a la altura del título, que es
 * donde se buscan: un pie de hoja no se ve hasta que se baja del todo.
 */
export function abrirHoja(titulo, construir, acciones = []) {
  cerrarHoja();
  const contenedor = vaciar(hoja());
  contenedor.append(el('div', { class: 'hoja-asa' }));

  // `hojaTitulo` es el nombre accesible del diálogo: `index.html` lo declara en
  // `aria-labelledby`, y sin él un lector de pantalla anuncia «diálogo» a secas.
  const utiles = [].concat(acciones).filter(Boolean);
  if (titulo && utiles.length) {
    contenedor.append(el('div', { class: 'hoja-cabecera' }, [
      el('h2', { id: 'hojaTitulo', texto: titulo }),
      el('div', { class: 'hoja-acciones' }, utiles),
    ]));
  } else if (titulo) {
    contenedor.append(el('h2', { id: 'hojaTitulo', texto: titulo }));
  }

  const cuerpo = el('div', { class: 'hoja-seccion' });
  contenedor.append(cuerpo);
  construir(cuerpo);

  contenedor.hidden = false;
  scrim().hidden = false;
  // Con una hoja abierta, las confirmaciones bajan al pie: ahí la banda de las
  // pestañas está tapada y la hoja la deja libre a propósito, así que es el
  // único sitio de la pantalla donde una pastilla no se pone encima de nada.
  document.body.classList.add('con-hoja');
  cerrarActual = cerrarHoja;
  scrim().onclick = cerrarHoja;
  document.addEventListener('keydown', alPulsarEscape);

  const primero = contenedor.querySelector('input, select, textarea, button');
  if (primero && !('ontouchstart' in window)) primero.focus();
  return cuerpo;
}

function alPulsarEscape(evento) {
  if (evento.key === 'Escape') cerrarHoja();
}

export function cerrarHoja() {
  hoja().hidden = true;
  scrim().hidden = true;
  document.body.classList.remove('con-hoja');
  vaciar(hoja());
  document.removeEventListener('keydown', alPulsarEscape);
  cerrarActual = null;
}

export const hayHojaAbierta = () => Boolean(cerrarActual);

/**
 * Un apartado plegable, con `<details>` y `<summary>` del propio navegador.
 *
 * Sin JavaScript por debajo a propósito: el elemento ya se abre al tocarlo y al
 * pulsar Enter, ya se anuncia como plegado o desplegado a quien no ve, y el
 * buscador del navegador abre por su cuenta el apartado donde encuentra algo.
 * Nada de eso saldría gratis con un `div` y una clase.
 */
export function acordeon(titulo, construir, {
  abierta = false, nota = null, icono: dibujo = null, compacta = false, verbos = null,
} = {}) {
  const cuerpo = el('div', { class: 'acordeon-cuerpo' });
  construir(cuerpo);
  return el('details', { class: compacta ? 'acordeon acordeon-compacta' : 'acordeon', open: abierta }, [
    // La nota va en el propio rótulo para que el apartado plegado siga diciendo
    // algo: «el próximo, Marta en seis días» ahorra desplegarlo solo para verlo.
    el('summary', {}, [
      // Compacto pone el ángulo el primero de la fila —Sitios, donde una
      // franja propia ya hace de marco y no necesita el ángulo al final para
      // saberse tocable—. El de Ajustes se queda con el de siempre, al final
      // por CSS (`::after`), que es el que no cambia aquí.
      compacta ? el('span', { class: 'acordeon-angulo', 'aria-hidden': 'true' }, [icono('angulo')]) : null,
      // La moneda solo aparece donde se pide, que hoy es Ajustes. Una lista de
      // apartados que son cosas —Deseos, Ideas, Cumpleaños— no la necesita: allí
      // el rótulo ya nombra lo que hay dentro, y aquí nombra dónde se toca.
      dibujo ? el('span', { class: 'acordeon-moneda', 'aria-hidden': 'true' }, [icono(dibujo)]) : null,
      el('span', { texto: titulo }),
      // Puede venir ya como nodo, y entonces manda quien lo trajo. Es lo que
      // hace falta cuando el número cambia sin cerrar la hoja —las mejoras se
      // dan por hechas ahí mismo—: con una cadena, el rótulo se queda diciendo
      // el número de cuando se abrió Ajustes.
      nota instanceof Node ? nota : (nota ? el('span', { class: 'acordeon-nota', texto: nota }) : null),
      // Un verbo propio del apartado —hoy solo «compartir lo que hay que
      // llevar»—, dentro de la cabecera y no suelto en una fila propia del
      // cuerpo: es lo que evita que un acordeón sin nada dentro que compartir
      // deje un botón huérfano.
      verbos,
    ]),
    cuerpo,
  ]);
}

// ------------------------------------------------------------------ Gestos --

/**
 * Deslizamiento horizontal sobre un nodo, para pasar al periodo anterior o al
 * siguiente sin buscar las flechas.
 *
 * Se escucha con eventos de puntero, que sirven igual al dedo y al ratón. El
 * desplazamiento vertical manda: si el dedo baja más de lo que se mueve a los
 * lados, es un desplazamiento de la página y no un gesto, y el navegador
 * cancela el puntero por su cuenta.
 *
 * Un gesto que empieza encima de un botón termina, para el navegador, en un
 * clic sobre ese botón. Por eso se traga el clic inmediatamente posterior: sin
 * eso, deslizar desde encima de un evento abriría su detalle al soltar.
 */
export function deslizarHorizontal(nodo, alDeslizar) {
  // Recorrido mínimo para que cuente como gesto y no como un toque con pulso.
  const MINIMO = 24;
  const DOMINANCIA = 1.4;
  const GRACIA = 400;

  let origen = null;
  let sordoHasta = 0;

  nodo.addEventListener('pointerdown', (evento) => {
    origen = evento.isPrimary ? { x: evento.clientX, y: evento.clientY } : null;
  });
  nodo.addEventListener('pointercancel', () => { origen = null; });
  nodo.addEventListener('pointerup', (evento) => {
    if (!origen) return;
    const dx = evento.clientX - origen.x;
    const dy = evento.clientY - origen.y;
    origen = null;
    if (Math.abs(dx) < MINIMO || Math.abs(dx) < Math.abs(dy) * DOMINANCIA) return;
    sordoHasta = performance.now() + GRACIA;
    alDeslizar(dx < 0 ? 1 : -1);
  });
  nodo.addEventListener('click', (evento) => {
    if (performance.now() >= sordoHasta) return;
    evento.preventDefault();
    evento.stopPropagation();
  }, true);

  return nodo;
}

/**
 * Los verbos de una tarjeta, escondidos detrás de ella.
 *
 * Se arrastra la tarjeta hacia la izquierda y aparecen debajo; se suelta y la
 * fila se queda abierta hasta que se toca algo. Es el atajo, no el camino: los
 * mismos verbos están dentro —al abrir la ocasión hay «editar», y borrar vive
 * donde se edita—, de modo que quien no descubra el gesto no se queda sin nada.
 *
 * Tres cuidados, que son los que hacen que no estorbe:
 *
 * - **El desplazamiento vertical manda.** Hasta que el dedo no recorre en
 *   horizontal más de lo que ha bajado, no se mueve nada; si baja, el gesto se
 *   abandona y la página se desliza como si esto no existiera.
 * - **Solo una abierta.** Al empezar a arrastrar se cierra la que hubiera, que es
 *   lo que hace la lista de un correo y lo que evita dejar verbos sueltos por la
 *   pantalla.
 * - **El clic de después no cuenta.** Un arrastre que empieza encima de la
 *   tarjeta termina, para el navegador, en un clic sobre ella; y con la fila
 *   abierta, el primer toque la cierra en lugar de abrir el detalle.
 *
 * Con el teclado no hay arrastre que hacer: los botones están en el árbol y la
 * fila se abre sola al enfocarlos, con `:focus-within` desde el CSS.
 */
export function conVerbosAlDeslizar(tarjeta, verbos) {
  const UMBRAL = 12;
  const DOMINANCIA = 1.4;
  const GRACIA = 400;

  const utiles = [].concat(verbos).filter(Boolean);
  if (!utiles.length) return tarjeta;

  const banda = el('div', { class: 'deslizable-verbos' }, utiles);
  const cara = el('div', { class: 'deslizable-cara' }, [tarjeta]);
  const marco = el('div', { class: 'deslizable', 'data-abierta': 'no' }, [banda, cara]);

  const ancho = () => banda.offsetWidth || 0;
  let abierta = false;
  let origen = null;
  let arrastrando = false;
  let sordoHasta = 0;

  const colocar = (x) => { cara.style.transform = x ? `translateX(${x}px)` : ''; };

  // Cerrar deja el nodo **sin** transformación en línea, y no en cero: así la
  // regla de `:focus-within` del CSS puede abrirla cuando se llega con el
  // tabulador, que una transformación en línea taparía.
  const cerrar = () => {
    abierta = false;
    marco.dataset.abierta = 'no';
    colocar(0);
    if (deslizadaAbierta?.nodo === marco) deslizadaAbierta = null;
  };

  const abrir = () => {
    if (deslizadaAbierta && deslizadaAbierta.nodo !== marco) deslizadaAbierta.cerrar();
    abierta = true;
    marco.dataset.abierta = 'si';
    colocar(-ancho());
    deslizadaAbierta = { nodo: marco, cerrar };
  };

  cara.addEventListener('pointerdown', (evento) => {
    if (!evento.isPrimary) return;
    origen = { x: evento.clientX, y: evento.clientY, base: abierta ? -ancho() : 0 };
    arrastrando = false;
    cara.style.transition = 'none';
  });

  cara.addEventListener('pointermove', (evento) => {
    if (!origen) return;
    const dx = evento.clientX - origen.x;
    const dy = evento.clientY - origen.y;

    if (!arrastrando) {
      if (Math.abs(dx) < UMBRAL) return;
      if (Math.abs(dx) < Math.abs(dy) * DOMINANCIA) { soltar(null); return; }
      arrastrando = true;
      if (deslizadaAbierta && deslizadaAbierta.nodo !== marco) cerrarDeslizada();
      // Sin captura, un arrastre que se sale de la tarjeta —con el ratón— deja
      // de recibir eventos y la fila se queda a medio camino.
      try { cara.setPointerCapture(evento.pointerId); } catch { /* da igual */ }
    }
    colocar(Math.min(0, Math.max(-ancho(), origen.base + dx)));
  });

  function soltar(evento) {
    if (!origen) return;
    const base = origen.base;
    const dx = evento ? evento.clientX - origen.x : 0;
    const hubo = arrastrando;
    origen = null;
    arrastrando = false;
    cara.style.transition = '';

    if (!hubo) { colocar(base); return; }
    sordoHasta = performance.now() + GRACIA;
    if (base + dx < -ancho() / 2) abrir(); else cerrar();
  }

  cara.addEventListener('pointerup', soltar);
  cara.addEventListener('pointercancel', () => {
    origen = null;
    arrastrando = false;
    cara.style.transition = '';
    colocar(abierta ? -ancho() : 0);
  });

  cara.addEventListener('click', (evento) => {
    if (performance.now() < sordoHasta) {
      evento.preventDefault();
      evento.stopPropagation();
      return;
    }
    // Con los verbos a la vista, el toque sobre la tarjeta los recoge. Abrir el
    // detalle desde ahí sorprendería: lo que se está mirando son los verbos.
    if (abierta) {
      evento.preventDefault();
      evento.stopPropagation();
      cerrar();
    }
  }, true);

  return marco;
}

/** La única fila con los verbos a la vista, si hay alguna. */
let deslizadaAbierta = null;

export function cerrarDeslizada() {
  if (deslizadaAbierta) deslizadaAbierta.cerrar();
}

/**
 * Doble toque sobre un nodo, contando los clics a mano.
 *
 * No se usa el evento `dblclick`: en la cáscara de iOS no llega —el doble toque
 * lo consume el propio sistema, que ya tiene el zoom desactivado— y lo que sí
 * llega, siempre y en todas partes, son dos `click` seguidos. Se cuelga del
 * contenedor y no de cada hijo, de modo que los dos toques cuentan aunque el
 * segundo caiga unos píxeles más allá, sobre otra pieza de la misma fila.
 */
export function dobleToque(nodo, accion, { ventana = 400 } = {}) {
  let anterior = 0;
  nodo.addEventListener('click', (evento) => {
    // El teclado no tiene doble clic: Enter y Espacio llegan como un clic sin
    // botón detrás (`detail` a cero) y valen por sí solos.
    if (evento.detail === 0) { accion(); return; }
    const ahora = performance.now();
    if (ahora - anterior < ventana) { anterior = 0; accion(); return; }
    anterior = ahora;
  });
  return nodo;
}

// ------------------------------------------------------------------ Avisos --

export function avisar(texto) {
  const burbuja = el('div', { class: 'aviso-burbuja', texto });
  document.getElementById('avisos').append(burbuja);
  setTimeout(() => burbuja.remove(), 2600);
}

// --------------------------------------------------- Propuestas de un modelo --

/**
 * La pastilla donde se pasan las propuestas de un modelo.
 *
 * Es la misma pieza en los dos sitios donde la agenda le pide algo escrito a un
 * modelo —cinco regalos para una persona, cinco felicitaciones para quien
 * cumple— y lo único que cambia entre ellos es qué se pide, cómo se dibuja cada
 * propuesta y qué verbo la aprovecha: usarla, o copiarla.
 *
 * Lo que la pieza sostiene:
 *
 * - **La tanda vive mientras la pastilla exista.** Cerrarla no la tira: volver a
 *   abrirla enseña lo que ya había, por donde iba, y eso no cuesta nada.
 * - **Pedir más añade al final.** No sustituye, de modo que se puede volver atrás
 *   a la que gustaba; y salta a la primera de las nuevas, que es lo que se acaba
 *   de pedir.
 * - **Lo ya propuesto se le devuelve al modelo**, o la segunda tanda repite a la
 *   primera: el material que ve es idéntico.
 * - **El marco no se mueve.** Solo cambia el texto de dentro, y por eso el hueco
 *   lleva el alto reservado en el CSS: si la tarjeta creciera con la propuesta
 *   más larga, el verbo se escaparía de debajo del dedo al pasar.
 */
export function carruselDePropuestas({
  pedir, pintar, verbo, etiquetaMas = 'Otras cinco', clave = (propuesta) => propuesta, holgado = false,
}) {
  let tanda = [];
  let indice = 0;

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
  const usar = el('button', {
    class: 'boton-mini', 'data-tono': 'principal', type: 'button',
    onclick: () => { if (tanda[indice] !== undefined) verbo.hacer(tanda[indice]); },
  }, [verbo.texto]);
  const mas = el('button', {
    class: 'boton-mini', type: 'button', onclick: () => solicitar({ mas: true }),
  }, [etiquetaMas]);

  const nodo = el('div', { class: 'propuesta', 'data-holgado': holgado ? 'si' : null, hidden: true }, [
    el('div', { class: 'propuesta-cuerpo' }, [atras, texto, adelante]),
    el('div', { class: 'propuesta-pie' }, [usar, mas, cuenta]),
  ]);

  function mover(pasos) {
    indice = Math.min(tanda.length - 1, Math.max(0, indice + pasos));
    dibujar();
  }

  function dibujar() {
    vaciar(texto).append(...[].concat(pintar(tanda[indice])).filter(Boolean));
    cuenta.textContent = `${indice + 1} / ${tanda.length}`;
    atras.disabled = indice === 0;
    adelante.disabled = indice >= tanda.length - 1;
    usar.disabled = false;
    mas.disabled = false;
  }

  function esperando() {
    nodo.hidden = false;
    vaciar(texto).append(el('p', { class: 'propuesta-porque', texto: 'Pensando…' }));
    cuenta.textContent = '';
    for (const boton of [atras, adelante, usar, mas]) boton.disabled = true;
  }

  async function solicitar({ mas: otras }) {
    const teniamos = tanda.length;
    esperando();

    try {
      const nuevas = await pedir({ mas: otras, yaDichas: tanda.map(clave) });
      if (!nuevas.length) {
        avisar('No ha propuesto nada');
        if (teniamos) dibujar(); else nodo.hidden = true;
        return;
      }
      tanda = otras ? [...tanda, ...nuevas] : nuevas;
      indice = otras ? teniamos : 0;
      dibujar();
    } catch (error) {
      avisar(error.message || 'No he podido pedírselo');
      if (teniamos) dibujar(); else nodo.hidden = true;
    }
  }

  return {
    nodo,
    /** La primera vez pide; después vuelve a enseñar lo que ya hay, que es lo
     *  que espera quien la cerró sin usarla. */
    abrir() {
      if (tanda.length) { nodo.hidden = false; dibujar(); return; }
      solicitar({ mas: false });
    },
    cerrar() { nodo.hidden = true; },
    /** Lo propuesto para otra persona no vale para esta. */
    olvidar() {
      tanda = [];
      indice = 0;
      nodo.hidden = true;
    },
    hay: () => tanda.length > 0,
  };
}

// ---------------------------------------------------------- El calendario --

const NOMBRES_DIA_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRES_DIA_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const aIso = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const deIso = (texto) => {
  const partes = String(texto || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : null;
};
const enPalabras = (iso) => {
  const fecha = deIso(iso);
  if (!fecha) return '';
  return `${NOMBRES_DIA_LARGO[(fecha.getDay() + 6) % 7]} ${fecha.getDate()} de ${NOMBRES_MES[fecha.getMonth()].toLowerCase()}`
    + (fecha.getFullYear() === new Date().getFullYear() ? '' : ` de ${fecha.getFullYear()}`);
};

/**
 * Un campo de fecha con calendario propio, en lugar del selector del sistema.
 *
 * El del sistema —`<input type="date">`— abre en iOS una rueda que tapa media
 * pantalla y que no enseña el mes: para una cena del sábado hay que rodar
 * tres cilindros sin ver dónde cae el sábado. Aquí el campo es un botón que
 * escribe la fecha en palabras, y al tocarlo despliega debajo un mes de siete
 * columnas, con hoy marcado y el día elegido relleno; se pasa de mes con las
 * flechas y se cierra al elegir. Es la figura del calendario de la agenda,
 * que ya se sabe leer.
 *
 * `vacio` es el texto que se enseña sin fecha, y ofrecerlo es lo que hace que
 * la fecha se pueda quitar: «Hasta» de un evento está vacío el 90 % de las
 * veces. Sin `vacio`, el campo siempre tiene una fecha. `min` deja sin tocar
 * los días anteriores.
 *
 * Devuelve `{ nodo, valor }`: el nodo va dentro de `campo()` y `valor` es el
 * ISO de diez caracteres, o cadena vacía. Se puede escribir para moverlo desde
 * fuera —«Hasta» se cae solo cuando «Cuándo» lo adelanta—.
 */
export function selectorDeFecha({ valor = '', min = null, vacio = null, alCambiar = () => {} } = {}) {
  let elegido = deIso(valor) ? valor.slice(0, 10) : '';
  let minimo = min ? String(min).slice(0, 10) : null;
  let abierto = false;
  let mirando = deIso(elegido) || new Date();

  const boton = el('button', { class: 'fecha-boton', type: 'button', 'aria-expanded': 'false' });
  const rotulo = el('span', { class: 'calendario-mes' });
  const rejilla = el('div', { class: 'calendario-rejilla', role: 'grid' });
  const panel = el('div', { class: 'calendario', hidden: true }, [
    el('div', { class: 'calendario-cabecera' }, [
      el('button', {
        class: 'calendario-paso', type: 'button', 'aria-label': 'Mes anterior',
        onclick: () => { mirando = new Date(mirando.getFullYear(), mirando.getMonth() - 1, 1); pintarMes(); },
      }, [icono('izquierda')]),
      rotulo,
      el('button', {
        class: 'calendario-paso', type: 'button', 'aria-label': 'Mes siguiente',
        onclick: () => { mirando = new Date(mirando.getFullYear(), mirando.getMonth() + 1, 1); pintarMes(); },
      }, [icono('derecha')]),
    ]),
    rejilla,
    el('div', { class: 'calendario-pie' }, [
      el('button', {
        class: 'enlace-discreto', type: 'button',
        onclick: () => { mirando = new Date(); pintarMes(); },
      }, ['Ir a hoy']),
      vacio !== null ? el('button', {
        class: 'enlace-discreto', type: 'button',
        onclick: () => { poner(''); cerrar(); },
      }, ['Quitar la fecha']) : null,
    ]),
  ]);
  const nodo = el('div', { class: 'fecha-propia' }, [boton, panel]);

  const escribirBoton = () => {
    boton.textContent = elegido ? enPalabras(elegido) : (vacio || 'Elegir un día');
    boton.dataset.vacio = elegido ? 'no' : 'si';
  };

  const poner = (iso, avisar = true) => {
    elegido = iso || '';
    if (elegido) mirando = deIso(elegido);
    escribirBoton();
    if (avisar) alCambiar(elegido);
  };

  function pintarMes() {
    rotulo.textContent = `${NOMBRES_MES[mirando.getMonth()]} de ${mirando.getFullYear()}`;
    vaciar(rejilla);
    for (const inicial of NOMBRES_DIA_CORTO) {
      rejilla.append(el('span', { class: 'calendario-dia-nombre', 'aria-hidden': 'true', texto: inicial }));
    }
    const primero = new Date(mirando.getFullYear(), mirando.getMonth(), 1);
    const arranque = new Date(primero);
    arranque.setDate(primero.getDate() - ((primero.getDay() + 6) % 7));
    const hoyIso = aIso(new Date());
    for (let i = 0; i < 42; i += 1) {
      const dia = new Date(arranque);
      dia.setDate(arranque.getDate() + i);
      const iso = aIso(dia);
      const fuera = dia.getMonth() !== mirando.getMonth();
      // La sexta fila solo cuando el mes la necesita; sin esto, un mes de
      // cinco semanas arrastra siete días del siguiente que no dicen nada.
      if (i >= 35 && fuera) break;
      const antes = minimo && iso < minimo;
      rejilla.append(el('button', {
        class: 'calendario-dia', type: 'button',
        'data-fuera': fuera ? 'si' : 'no',
        'data-hoy': iso === hoyIso ? 'si' : 'no',
        'aria-pressed': iso === elegido ? 'true' : 'false',
        'aria-label': enPalabras(iso),
        disabled: antes ? true : null,
        onclick: () => { poner(iso); cerrar(); },
      }, [String(dia.getDate())]));
    }
  }

  const abrir = () => {
    abierto = true;
    mirando = deIso(elegido) || (minimo && deIso(minimo) > new Date() ? deIso(minimo) : new Date());
    pintarMes();
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
  };
  const cerrar = () => {
    abierto = false;
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
  };

  boton.onclick = () => (abierto ? cerrar() : abrir());
  escribirBoton();

  return {
    nodo,
    get valor() { return elegido; },
    set valor(iso) { poner(iso, false); },
    /** Mover el mínimo desde fuera: «Hasta» no puede ir antes que «Cuándo». */
    set min(iso) { minimo = iso ? String(iso).slice(0, 10) : null; if (abierto) pintarMes(); },
    cerrar,
  };
}

// ------------------------------------------------------------- Formularios --

/**
 * Cada control de formulario toma su nombre de su etiqueta.
 *
 * El `for` necesita un `id`, y ningún control lo traía: la etiqueta era una
 * hermana muda y ningún campo de la aplicación se anunciaba por su nombre. Se
 * genera aquí uno por campo; cuando lo que llega no es un control —un
 * segmentado, unas pastillas—, la etiqueta se queda como texto, que es lo único
 * que puede ser.
 */
let numeroDeCampo = 0;

export function campo(etiqueta, control, pista) {
  const esControl = /^(INPUT|SELECT|TEXTAREA)$/.test(control?.tagName || '');
  if (esControl && !control.id) {
    numeroDeCampo += 1;
    control.id = `campo-${numeroDeCampo}`;
  }
  return el('div', { class: 'campo' }, [
    el('label', { texto: etiqueta, for: esControl ? control.id : undefined }),
    control,
    pista ? el('p', { class: 'pista', texto: pista }) : null,
  ]);
}

/**
 * Enfoca un control cuando la hoja ha terminado de subir, teclado incluido.
 *
 * Es la única manera de abrir el teclado al abrir una hoja, y por eso está
 * aquí y no repetida: había tres estrategias —esto mismo en línea, `autofocus`
 * en nodos insertados tarde, y el foco sin teclado de `abrirHoja`— y la misma
 * hoja de «apuntar algo» abría el teclado en un sitio y en otro no. El plazo es
 * para que la hoja haya subido: enfocar mientras se mueve deja el teclado
 * peleando con ella.
 */
export function enfocarAlAbrir(control) {
  setTimeout(() => control.focus(), 60);
}

export function entrada(atributos = {}) {
  return el('input', { type: 'text', ...atributos });
}

export function seleccion(opciones, valor, atributos = {}) {
  const nodo = el('select', atributos);
  for (const opcion of opciones) {
    nodo.append(el('option', {
      value: opcion.valor,
      selected: opcion.valor === valor,
      // Una opción que se enseña pero no se puede elegir. Sirve para que la
      // lista diga «está y no se puede» en vez de dejar un hueco, que desde
      // fuera se lee como «no está».
      disabled: opcion.desactivada || false,
    }, [opcion.texto]));
  }
  return nodo;
}


/**
 * Un campo de hora con reloj propio, de hora en hora y de cuarto en cuarto,
 * en lugar de la rueda del sistema (D1 en specs/propuesta-ocho-cosas.html).
 *
 * La misma figura que el calendario propio: el campo es un botón que escribe
 * la hora, y al tocarlo despliega debajo dos columnas que se desplazan —la
 * hora a la izquierda, :00 :15 :30 :45 a la derecha—, con lo elegido relleno.
 * Cabe cualquier hora del día en dos gestos y no tapa la hoja. `vacio` es el
 * texto sin hora, y ofrecerlo es lo que deja quitarla: un evento sin hora es
 * de jornada completa.
 *
 * Devuelve `{ nodo, valor }`: `valor` es `HH:MM` o cadena vacía, y se puede
 * escribir desde fuera.
 */
export function selectorDeHora({ valor = '', vacio = null, alCambiar = () => {} } = {}) {
  const valida = (t) => /^\d{2}:\d{2}$/.test(String(t || ''));
  let elegido = valida(valor) ? valor : '';
  let abierto = false;

  const boton = el('button', { class: 'fecha-boton hora-boton', type: 'button', 'aria-expanded': 'false' });
  const horas = el('div', { class: 'reloj-columna', role: 'listbox', 'aria-label': 'Hora' });
  const cuartos = el('div', { class: 'reloj-columna', role: 'listbox', 'aria-label': 'Minutos' });
  const panel = el('div', { class: 'reloj', hidden: true }, [
    el('div', { class: 'reloj-columnas' }, [horas, cuartos]),
    vacio !== null ? el('div', { class: 'calendario-pie' }, [
      el('button', { class: 'enlace-discreto', type: 'button', onclick: () => { poner(''); cerrar(); } }, ['Quitar la hora']),
    ]) : null,
  ]);
  const nodo = el('div', { class: 'fecha-propia' }, [boton, panel]);

  const partes = () => {
    const m = /^(\d{2}):(\d{2})$/.exec(elegido);
    return m ? { h: Number(m[1]), q: Math.round(Number(m[2]) / 15) * 15 % 60 } : { h: 18, q: 0 };
  };
  const escribirBoton = () => {
    boton.textContent = elegido || (vacio || 'Elegir una hora');
    boton.dataset.vacio = elegido ? 'no' : 'si';
  };
  const poner = (texto, avisar = true) => {
    elegido = valida(texto) ? texto : '';
    escribirBoton();
    if (avisar) alCambiar(elegido);
  };

  function pintar() {
    const { h, q } = partes();
    vaciar(horas);
    vaciar(cuartos);
    for (let hora = 0; hora < 24; hora += 1) {
      horas.append(el('button', {
        class: 'reloj-paso', type: 'button', role: 'option',
        'aria-selected': hora === h ? 'true' : 'false',
        onclick: () => { poner(`${String(hora).padStart(2, '0')}:${String(q).padStart(2, '0')}`); pintar(); },
      }, [String(hora).padStart(2, '0')]));
    }
    for (const minuto of [0, 15, 30, 45]) {
      cuartos.append(el('button', {
        class: 'reloj-paso', type: 'button', role: 'option',
        'aria-selected': minuto === q ? 'true' : 'false',
        onclick: () => { poner(`${String(h).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`); pintar(); cerrar(); },
      }, [`:${String(minuto).padStart(2, '0')}`]));
    }
    // La hora elegida, a la vista: la columna se desplaza hasta ella sin
    // animación, que aquí sería un carrusel cada vez que se abre.
    const marcada = horas.querySelector('[aria-selected="true"]');
    if (marcada) horas.scrollTop = Math.max(0, marcada.offsetTop - horas.clientHeight / 2 + marcada.offsetHeight / 2);
  }

  // Un reloj abierto cierra a los demás: dos abiertos a la vez en una hoja
  // de horarios por día eran cuatro columnas y ninguna fila alineada.
  document.addEventListener('agenda:reloj-abierto', (evento) => {
    if (evento.detail !== panel && abierto) cerrar();
  });
  const abrir = () => {
    document.dispatchEvent(new CustomEvent('agenda:reloj-abierto', { detail: panel }));
    abierto = true;
    pintar();
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    // El desplazamiento solo se puede medir con el panel a la vista.
    const marcada = horas.querySelector('[aria-selected="true"]');
    if (marcada) horas.scrollTop = Math.max(0, marcada.offsetTop - horas.clientHeight / 2 + marcada.offsetHeight / 2);
  };
  const cerrar = () => {
    abierto = false;
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
  };

  boton.onclick = () => (abierto ? cerrar() : abrir());
  escribirBoton();

  return {
    nodo,
    get valor() { return elegido; },
    set valor(texto) { poner(texto, false); },
    cerrar,
  };
}
