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

// --------------------------------------------------------------------- Hoja --

const hoja = () => document.getElementById('hoja');
const scrim = () => document.getElementById('scrim');
let cerrarActual = null;

/**
 * Presentación modal para las tareas puntuales, según la convención de la
 * plataforma (specs/ux.md §1). Devuelve el nodo de contenido.
 */
export function abrirHoja(titulo, construir) {
  cerrarHoja();
  const contenedor = vaciar(hoja());
  contenedor.append(el('div', { class: 'hoja-asa' }));
  if (titulo) contenedor.append(el('h2', { texto: titulo }));

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
