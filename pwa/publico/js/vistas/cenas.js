/**
 * Cenas: la semana como plan, el recetario y cómo se cocina en casa.
 *
 * Es la sexta pestaña (`specs/propuesta-cenas.html`, A4). La pantalla enseña
 * la semana en curso —lo escrito y, en cada noche vacía, «Proponer»— y debajo
 * dos apartados plegables: cómo se cocina en casa, con la dieta y la línea de
 * las niñas (D1), y el recetario con lo que se dijo de cada receta (B1). Hoy
 * corrige la noche; esta pantalla planifica la semana (E1).
 *
 * Las propuestas son del séptimo encargo de IA (C1). Antes de pedirlas se
 * puede escribir lo que hay más o menos en casa, que viaja con esa petición y
 * no se guarda (la nota de E).
 */

import {
  abrirHoja, acordeon, avisar, botonIcono, campo, carruselDePropuestas, cerrarHoja, el, entrada, icono, vaciar,
} from '../ui.js';
import { toque } from '../native.js';
import { guardar, proponerCenas, retirar } from '../sincronizacion.js';
import { nuevoId } from '../modelo.js';
import {
  INICIALES_DIA, MESES_LARGOS, formatearFechaLarga, hoy, indiceDia, iso, lunesDe, sumarDias,
} from '../semana.js';
import {
  VEREDICTOS, cenaDe, elegirPropuesta, escribirNoche, hayCenas, nochesDeLaSemana, platoDe, platoDeLasNinas,
  recetaPorId, recetas, usoDeReceta, vaciarNoche, veredictoDeReceta,
} from '../cenas.js';

/** El lunes de la semana que se está mirando. Se pierde al cerrar sesión. */
let lunesVisto = null;

export function reiniciarCenas() {
  lunesVisto = null;
}

export function pintarCenas(pantalla, subcabecera, ctx) {
  const datos = ctx.vista.datos;
  vaciar(pantalla);
  vaciar(subcabecera);

  if (!hayCenas(datos)) {
    pantalla.append(el('p', { class: 'vacio', texto: 'Las cenas son de quien vive en casa.' }));
    return;
  }

  const lunes = lunesVisto || lunesDe(hoy());
  subcabecera.append(periodo(lunes, ctx));

  pantalla.append(
    semana(lunes, ctx),
    el('div', { class: 'grupo' }, [
      acordeon('Cómo se cocina en casa', (cuerpo) => cocina(cuerpo, ctx), {
        nota: datos.cenas_casa?.dieta ? null : 'sin escribir',
      }),
      acordeon('Recetario', (cuerpo) => recetario(cuerpo, ctx), {
        nota: String(recetas(datos).length),
      }),
    ]),
  );
}

// ------------------------------------------------------------ La semana --

/** «21 – 27 de Septiembre», con las flechas a los lados y «Hoy» si no es esta. */
function periodo(lunes, ctx) {
  const domingo = sumarDias(lunes, 6);
  const rango = lunes.getMonth() === domingo.getMonth()
    ? `${lunes.getDate()} – ${domingo.getDate()} de ${MESES_LARGOS[domingo.getMonth()]}`
    : `${lunes.getDate()} de ${MESES_LARGOS[lunes.getMonth()]} – ${domingo.getDate()} de ${MESES_LARGOS[domingo.getMonth()]}`;
  const esEsta = iso(lunes) === iso(lunesDe(hoy()));
  const mover = (dias) => { toque(); lunesVisto = sumarDias(lunes, dias); ctx.refrescar(); };

  return el('div', { class: 'cenas-periodo' }, [
    el('button', { class: 'cenas-flecha', type: 'button', 'aria-label': 'Semana anterior', onclick: () => mover(-7) }, ['‹']),
    el('span', { class: 'cenas-rango', texto: rango }),
    el('button', { class: 'cenas-flecha', type: 'button', 'aria-label': 'Semana siguiente', onclick: () => mover(7) }, ['›']),
    esEsta ? null : el('button', {
      class: 'boton-mini', type: 'button',
      onclick: () => { toque(); lunesVisto = null; ctx.refrescar(); },
    }, ['Hoy']),
  ]);
}

function semana(lunes, ctx) {
  const datos = ctx.vista.datos;
  const hoyIso = iso(hoy());
  const noches = nochesDeLaSemana(lunes);
  const esEsta = iso(lunes) === iso(lunesDe(hoy()));
  const grupo = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: esEsta ? 'Esta semana' : 'Esa semana' }),
  ]);

  for (const noche of noches) grupo.append(filaDeNoche(noche, ctx, hoyIso));

  // Rellenar solo pide lo que falta y lo que todavía no ha pasado: una noche de
  // ayer sin escribir no se planifica, se apunta.
  const vacias = noches.filter((n) => iso(n) >= hoyIso && !platoDe(datos, cenaDe(datos, iso(n))));
  if (vacias.length) {
    grupo.append(el('button', {
      class: 'boton cenas-rellenar', type: 'button', 'data-con-icono': 'si',
      onclick: () => { toque(); abrirRellenar(vacias.map(iso), ctx); },
    }, [icono('destello'), vacias.length === 1 ? 'Proponer la que falta' : `Rellenar la semana (${vacias.length})`]));
  }
  return grupo;
}

function filaDeNoche(noche, ctx, hoyIso) {
  const datos = ctx.vista.datos;
  const fecha = iso(noche);
  const cena = cenaDe(datos, fecha);
  const plato = platoDe(datos, cena);
  const ninas = platoDeLasNinas(datos, cena);
  const veredicto = VEREDICTOS.find((v) => v.id === cena?.veredicto);

  return el('button', {
    class: 'cena-fila', type: 'button',
    'data-hoy': fecha === hoyIso ? 'si' : null,
    'data-vacia': plato ? null : 'si',
    'aria-label': `${formatearFechaLarga(noche)}: ${plato || 'sin decidir'}`,
    onclick: () => { toque(); abrirNoche(fecha, ctx); },
  }, [
    el('span', { class: 'cena-dia' }, [
      el('span', { class: 'cena-dia-letra', texto: INICIALES_DIA[indiceDia(noche)] }),
      el('span', { class: 'cena-dia-num', texto: String(noche.getDate()) }),
    ]),
    el('span', { class: 'cena-texto' }, [
      el('span', { class: 'cena-plato', texto: plato || (fecha >= hoyIso ? 'Proponer' : '—') }),
      ninas ? el('span', { class: 'cena-ninas', texto: `Las niñas: ${ninas}` }) : null,
    ]),
    veredicto ? el('span', { class: 'cena-veredicto', title: veredicto.nombre, texto: veredicto.emoji }) : null,
  ]);
}

// ------------------------------------------------------------ Una noche --

/** Las recetas como sugerencias del campo: escribir una la enlaza. */
function listaDeRecetas(datos) {
  const id = `recetas-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    nodo: el('datalist', { id }, recetas(datos).map((r) => el('option', { value: r.nombre }))),
  };
}

/** Lo que se va a escribir en el campo de lo que hay en casa, compartido entre
 *  las hojas de una misma sesión: se escribe una vez y vale para la tarde. */
let despensa = '';

function campoDespensa() {
  const hay = entrada({ value: despensa, placeholder: 'Calabacín, pollo, medio brócoli' });
  hay.addEventListener('input', () => { despensa = hay.value; });
  return {
    control: hay,
    nodo: campo('Qué hay en casa', hay, 'Opcional. Se tiene en cuenta al proponer y no se guarda.'),
  };
}

function pintarPropuesta(propuesta) {
  return [
    el('p', { class: 'propuesta-que', texto: propuesta.que }),
    propuesta.porque ? el('p', { class: 'propuesta-porque', texto: propuesta.porque }) : null,
    propuesta.ninas ? el('p', { class: 'propuesta-porque', texto: `Las niñas: ${propuesta.ninas}` }) : null,
  ];
}

export function abrirNoche(fecha, ctx) {
  const datos = ctx.vista.datos;
  const cena = cenaDe(datos, fecha);
  const [a, m, d] = fecha.split('-').map(Number);
  const noche = new Date(a, m - 1, d);
  const pasada = fecha <= iso(hoy());

  abrirHoja(`Cena del ${formatearFechaLarga(noche)}`, (cuerpo) => {
    const lista = listaDeRecetas(datos);
    const que = entrada({ value: platoDe(datos, cena), placeholder: 'Lubina a la plancha', list: lista.id });
    const ninas = entrada({ value: platoDeLasNinas(datos, cena), placeholder: 'Lo mismo', list: lista.id });
    let veredicto = cena?.veredicto || null;

    cuerpo.append(
      lista.nodo,
      campo('Qué se cena', que, 'Una receta del recetario, o lo que sea: «pizza, pedida», «fuera».'),
      campo('Las niñas', ninas, 'Solo si cenan otra cosa.'),
    );

    // El veredicto, cuando ya se ha cenado (F1): lo que hace que la
    // sugerencia aprenda. Tocar el que está puesto lo quita.
    if (pasada) {
      const opciones = el('div', { class: 'opciones' }, VEREDICTOS.map((v) => el('button', {
        class: 'opcion', type: 'button', 'aria-pressed': veredicto === v.id ? 'true' : 'false',
        onclick: (evento) => {
          veredicto = veredicto === v.id ? null : v.id;
          for (const otro of evento.currentTarget.parentElement.children) otro.setAttribute('aria-pressed', 'false');
          if (veredicto) evento.currentTarget.setAttribute('aria-pressed', 'true');
        },
      }, [`${v.emoji} ${v.nombre}`])));
      cuerpo.append(campo('¿Qué tal?', opciones));
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!que.value.trim() && !ninas.value.trim()) {
            if (cena) await vaciarNoche(fecha);
          } else {
            await escribirNoche(datos, fecha, {
              que: que.value, ninas: ninas.value, veredicto: pasada ? veredicto : undefined,
            }, ctx.vista.yo.id);
          }
          toque('media');
          cerrarHoja();
          ctx.refrescar();
        },
      }, [cena ? 'Guardar' : 'Apuntar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));

    // Proponer va debajo: es lo que se hace cuando no se sabe qué poner arriba.
    const hay = campoDespensa();
    const carrusel = carruselDePropuestas({
      pedir: ({ mas, yaDichas }) => {
        if (mas) toque();
        return proponerCenas([fecha], { hay: hay.control.value, descartadas: yaDichas });
      },
      pintar: pintarPropuesta,
      clave: (propuesta) => propuesta.que,
      holgado: true,
      verbo: {
        texto: 'Elegir',
        hacer: async (propuesta) => {
          toque('media');
          await elegirPropuesta(datos, fecha, propuesta, ctx.vista.yo.id);
          cerrarHoja();
          avisar(`Apuntado: ${propuesta.que}`);
          ctx.refrescar();
        },
      },
    });

    cuerpo.append(el('div', { class: 'cenas-proponer' }, [
      el('p', { class: 'grupo-titulo', texto: 'Proponer' }),
      hay.nodo,
      el('button', {
        class: 'boton', type: 'button', 'data-tono': 'discreto', 'data-con-icono': 'si',
        onclick: () => { toque(); carrusel.abrir(); },
      }, [icono('destello'), cena ? 'Proponer otra cosa' : 'Proponer cinco']),
      carrusel.nodo,
    ]));
  }, [
    cena ? botonIcono('borrar', {
      etiqueta: 'Dejar la noche sin nada',
      tono: 'peligro',
      onclick: async () => {
        await vaciarNoche(fecha);
        toque('media');
        cerrarHoja();
        ctx.refrescar();
      },
    }) : null,
  ]);
}

// ------------------------------------------------------ Rellenar la semana --

function abrirRellenar(fechas, ctx) {
  const datos = ctx.vista.datos;

  abrirHoja(fechas.length === 1 ? 'Proponer la que falta' : 'Rellenar la semana', (cuerpo) => {
    const hay = campoDespensa();
    const resultado = el('div', { class: 'cenas-propuestas' });
    let propuestas = [];
    let yaDichas = [];

    const pedir = el('button', { class: 'boton crecer', type: 'button', 'data-tono': 'discreto', 'data-con-icono': 'si' }, [icono('destello'), 'Proponer']);
    const escribir = el('button', { class: 'boton crecer', type: 'button', hidden: true }, ['Apuntarlas']);

    pedir.onclick = async () => {
      toque();
      pedir.disabled = true;
      vaciar(resultado).append(el('p', { class: 'pista', texto: 'Pensando…' }));
      try {
        propuestas = await proponerCenas(fechas, { hay: hay.control.value, descartadas: yaDichas });
        yaDichas = [...yaDichas, ...propuestas.map((p) => p.que)];
        vaciar(resultado);
        propuestas.slice(0, fechas.length).forEach((propuesta, i) => {
          const [a, m, d] = fechas[i].split('-').map(Number);
          const noche = new Date(a, m - 1, d);
          resultado.append(el('div', { class: 'cenas-propuesta' }, [
            el('span', { class: 'cena-dia' }, [
              el('span', { class: 'cena-dia-letra', texto: INICIALES_DIA[indiceDia(noche)] }),
              el('span', { class: 'cena-dia-num', texto: String(noche.getDate()) }),
            ]),
            el('div', { class: 'cena-texto' }, pintarPropuesta(propuesta)),
          ]));
        });
        escribir.hidden = !propuestas.length;
        pedir.lastChild.textContent = 'Otras';
        if (!propuestas.length) resultado.append(el('p', { class: 'pista', texto: 'No ha propuesto nada.' }));
      } catch (error) {
        vaciar(resultado).append(el('p', { class: 'pista', texto: error.message || 'No he podido pedírselo' }));
      } finally {
        pedir.disabled = false;
      }
    };

    escribir.onclick = async () => {
      toque('media');
      for (const [i, propuesta] of propuestas.slice(0, fechas.length).entries()) {
        await elegirPropuesta(datos, fechas[i], propuesta, ctx.vista.yo.id);
      }
      cerrarHoja();
      avisar(propuestas.length === 1 ? 'Apuntada' : `Apuntadas ${Math.min(propuestas.length, fechas.length)}`);
      ctx.refrescar();
    };

    cuerpo.append(
      el('p', { class: 'pista', texto: 'Una cena por noche vacía, equilibradas entre sí. Nada se apunta hasta que lo digas.' }),
      hay.nodo,
      resultado,
      el('div', { class: 'acciones' }, [
        pedir, escribir,
        el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
      ]),
    );
  });
}

// ------------------------------------------------ Cómo se cocina en casa --

const CASILLAS = [
  { id: 'cocina', nombre: 'Con qué cocináis', ejemplo: 'Plancha, horno y olla exprés; nada de freír.' },
  { id: 'dieta', nombre: 'Qué dieta', ejemplo: 'Cenas ligeras: proteína y verdura, poco hidrato.' },
  { id: 'dieta_ninas', nombre: 'Las niñas', ejemplo: 'Pueden tomar hidrato; nada picante.' },
];

function cocina(cuerpo, ctx) {
  const casa = ctx.vista.datos.cenas_casa || {};

  // Solo quien administra lo cambia (D1); los demás lo leen.
  if (!ctx.vista.esAdministrador()) {
    for (const casilla of CASILLAS) {
      cuerpo.append(el('div', { class: 'campo' }, [
        el('label', { texto: casilla.nombre }),
        el('p', { texto: casa[casilla.id] || '—' }),
      ]));
    }
    cuerpo.append(el('p', { class: 'pista', texto: 'Lo cambia quien administra.' }));
    return;
  }

  const controles = {};
  for (const casilla of CASILLAS) {
    const area = el('textarea', { rows: '2', placeholder: casilla.ejemplo });
    area.value = casa[casilla.id] || '';
    controles[casilla.id] = area;
    cuerpo.append(campo(casilla.nombre, area));
  }
  cuerpo.append(
    el('p', { class: 'pista', texto: 'Texto libre. Es lo que se le da a la IA cada vez que propone.' }),
    el('div', { class: 'acciones' }, [el('button', {
      class: 'boton crecer', type: 'button',
      onclick: async () => {
        await guardar('cenas_casa', 'cenas', Object.fromEntries(
          CASILLAS.map((c) => [c.id, controles[c.id].value.trim()]),
        ));
        toque('media');
        avisar('Guardado');
        ctx.refrescar();
      },
    }, ['Guardar'])]),
  );
}

// ------------------------------------------------------------ Recetario --

function recetario(cuerpo, ctx) {
  const datos = ctx.vista.datos;
  const lista = recetas(datos);

  if (!lista.length) {
    cuerpo.append(el('p', { class: 'pista', texto: 'Se llena solo al elegir lo que propone la IA, o a mano.' }));
  }

  for (const receta of lista) {
    const veredicto = VEREDICTOS.find((v) => v.id === veredictoDeReceta(datos, receta.id));
    const uso = usoDeReceta(datos, receta.id);
    const pie = [
      receta.como,
      receta.tiempo ? `${receta.tiempo} min` : null,
      uso.veces ? `${uso.veces} ${uso.veces === 1 ? 'vez' : 'veces'}` : 'sin cenar todavía',
    ].filter(Boolean).join(' · ');
    cuerpo.append(el('button', {
      class: 'receta-fila', type: 'button',
      onclick: () => { toque(); abrirReceta(ctx, receta.id); },
    }, [
      el('span', { class: 'cena-texto' }, [
        el('span', { class: 'cena-plato', texto: receta.nombre }),
        el('span', { class: 'cena-ninas', texto: pie }),
      ]),
      veredicto ? el('span', { class: 'cena-veredicto', title: veredicto.nombre, texto: veredicto.emoji }) : null,
    ]));
  }

  cuerpo.append(el('button', {
    class: 'anadir-persona', type: 'button',
    onclick: () => { toque(); abrirReceta(ctx, null); },
  }, ['+ Una receta']));
}

function abrirReceta(ctx, id) {
  const receta = id ? recetaPorId(ctx.vista.datos, id) : null;

  abrirHoja(receta ? receta.nombre : 'Una receta', (cuerpo) => {
    const nombre = entrada({ value: receta?.nombre || '', placeholder: 'Lubina a la plancha' });
    const como = entrada({ value: receta?.como || '', placeholder: 'Plancha' });
    const tiempo = entrada({ value: receta?.tiempo ?? '', placeholder: '15', inputmode: 'numeric' });
    const etiquetas = entrada({ value: receta?.etiquetas || '', placeholder: 'ligera, proteína, verdura' });
    const nota = el('textarea', { rows: '3', placeholder: 'Sal a la lubina, plancha fuerte y limón al final' });
    nota.value = receta?.nota || '';

    cuerpo.append(
      campo('Nombre', nombre),
      campo('Cómo se hace', como),
      campo('Minutos', tiempo),
      campo('Etiquetas', etiquetas, 'Separadas por comas.'),
      campo('Nota', nota),
      el('div', { class: 'acciones' }, [
        el('button', {
          class: 'boton crecer', type: 'button',
          onclick: async () => {
            const texto = nombre.value.trim();
            if (!texto) { avisar('Ponle un nombre'); return; }
            const minutos = Number.parseInt(tiempo.value, 10);
            await guardar('receta', id || nuevoId(), {
              nombre: texto,
              como: como.value.trim() || null,
              tiempo: Number.isFinite(minutos) && minutos > 0 ? minutos : null,
              etiquetas: etiquetas.value.trim() || null,
              nota: nota.value.trim() || null,
              autor_id: receta?.autor_id || ctx.vista.yo.id,
              activo: 1,
            });
            toque('media');
            cerrarHoja();
            ctx.refrescar();
          },
        }, [receta ? 'Guardar' : 'Crear']),
        el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
      ]),
    );
  }, [
    receta ? botonIcono('borrar', {
      etiqueta: 'Quitar del recetario',
      tono: 'peligro',
      onclick: async () => {
        await retirar('receta', receta.id);
        toque('media');
        cerrarHoja();
        avisar('Quitada del recetario; lo cenado se queda');
        ctx.refrescar();
      },
    }) : null,
  ]);
}
