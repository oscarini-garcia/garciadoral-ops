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
  // Descartar no es cerrar ni borrar, y por eso no es un aspa ni una papelera:
  // un aspa en la cabecera de una hoja se lee como «cierra esto», que es
  // justamente lo que no hace. El círculo con la raya dice «quítalo de la
  // lista», que es lo que pasa, y deja claro que no se destruye nada.
  descartar: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  visto: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  informacion: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/>'
    + '<path d="M12 7.6v.1" stroke-width="2.4"/>',
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
export function acordeon(titulo, construir, { abierta = false, nota = null } = {}) {
  const cuerpo = el('div', { class: 'acordeon-cuerpo' });
  construir(cuerpo);
  return el('details', { class: 'acordeon', open: abierta }, [
    // La nota va en el propio rótulo para que el apartado plegado siga diciendo
    // algo: «el próximo, Marta en seis días» ahorra desplegarlo solo para verlo.
    el('summary', {}, [
      el('span', { texto: titulo }),
      nota ? el('span', { class: 'acordeon-nota', texto: nota }) : null,
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

