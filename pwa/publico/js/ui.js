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

  const utiles = [].concat(acciones).filter(Boolean);
  if (titulo && utiles.length) {
    contenedor.append(el('div', { class: 'hoja-cabecera' }, [
      el('h2', { texto: titulo }),
      el('div', { class: 'hoja-acciones' }, utiles),
    ]));
  } else if (titulo) {
    contenedor.append(el('h2', { texto: titulo }));
  }

  const cuerpo = el('div', { class: 'hoja-seccion' });
  contenedor.append(cuerpo);
  construir(cuerpo);

  contenedor.hidden = false;
  scrim().hidden = false;
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
  vaciar(hoja());
  document.removeEventListener('keydown', alPulsarEscape);
  cerrarActual = null;
}

export const hayHojaAbierta = () => Boolean(cerrarActual);

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

// ------------------------------------------------------------- Formularios --

export function campo(etiqueta, control, pista) {
  return el('div', { class: 'campo' }, [
    el('label', { texto: etiqueta, for: control.id || undefined }),
    control,
    pista ? el('p', { class: 'pista', texto: pista }) : null,
  ]);
}

export function entrada(atributos = {}) {
  return el('input', { type: 'text', ...atributos });
}

export function seleccion(opciones, valor, atributos = {}) {
  const nodo = el('select', atributos);
  for (const opcion of opciones) {
    nodo.append(el('option', { value: opcion.valor, selected: opcion.valor === valor }, [opcion.texto]));
  }
  return nodo;
}

/** Grupo de botones de selección múltiple o única, por reconocimiento y no por
 *  memoria: se muestran las opciones en lugar de pedir que se escriban. */
export function opciones(lista, seleccionadas, alCambiar, { unica = false } = {}) {
  const elegidas = new Set(seleccionadas);
  const contenedor = el('div', { class: 'opciones' });

  for (const opcion of lista) {
    const boton = el('button', {
      type: 'button',
      class: 'opcion',
      'aria-pressed': elegidas.has(opcion.valor) ? 'true' : 'false',
      onclick: () => {
        if (unica) {
          elegidas.clear();
          for (const otro of contenedor.children) otro.setAttribute('aria-pressed', 'false');
          elegidas.add(opcion.valor);
          boton.setAttribute('aria-pressed', 'true');
        } else if (elegidas.has(opcion.valor)) {
          elegidas.delete(opcion.valor);
          boton.setAttribute('aria-pressed', 'false');
        } else {
          elegidas.add(opcion.valor);
          boton.setAttribute('aria-pressed', 'true');
        }
        alCambiar([...elegidas]);
      },
    }, [opcion.texto]);
    contenedor.append(boton);
  }
  return contenedor;
}
