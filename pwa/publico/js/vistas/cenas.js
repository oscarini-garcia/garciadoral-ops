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
  VEREDICTOS, cenaDe, deLasDeSiempre, elegirPropuesta, escribirNoche, hayCenas, laQueHay, nochesDeLaSemana,
  platoDe, platoDeLasNinas, recetaPorId, recetas, usoDeReceta, vaciarNoche, veredictoDeReceta,
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
  subcabecera.append(tiraDeLaSemana(lunes, ctx));

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

/**
 * La tira de la semana, la de meeting-ops-air (`specs/propuesta-cenas-segunda-vuelta.html`,
 * A1): siete columnas fijas de lunes a domingo, la flecha es una semana y el
 * punto dice qué noche tiene cena. Lo pasado va atenuado y se sigue pudiendo
 * tocar, para corregir lo que se cenó o dar el veredicto.
 */
function tiraDeLaSemana(lunes, ctx) {
  const datos = ctx.vista.datos;
  const hoyIso = iso(hoy());
  const mover = (dias) => { toque(); lunesVisto = sumarDias(lunes, dias); ctx.refrescar(); };

  return el('div', { class: 'tira' }, [
    el('button', { class: 'tira-flecha', type: 'button', 'aria-label': 'La semana anterior', onclick: () => mover(-7) }, ['‹']),
    el('div', { class: 'tira-dias' }, nochesDeLaSemana(lunes).map((noche) => {
      const fecha = iso(noche);
      const plato = platoDe(datos, cenaDe(datos, fecha));
      return el('button', {
        class: 'tira-dia', type: 'button',
        'data-hoy': fecha === hoyIso ? 'si' : null,
        'data-pasado': fecha < hoyIso ? 'si' : null,
        'aria-label': `${formatearFechaLarga(noche)}: ${plato || 'sin cena'}`,
        onclick: () => { toque(); abrirNoche(fecha, ctx); },
      }, [
        el('span', { class: 'tira-letra', texto: INICIALES_DIA[indiceDia(noche)] }),
        el('span', { class: 'tira-num', texto: String(noche.getDate()) }),
        el('span', { class: 'tira-punto', 'data-hay': plato ? 'si' : null, 'aria-hidden': 'true' }),
      ]);
    })),
    el('button', { class: 'tira-flecha', type: 'button', 'aria-label': 'La semana siguiente', onclick: () => mover(7) }, ['›']),
  ]);
}

function semana(lunes, ctx) {
  const datos = ctx.vista.datos;
  const hoyIso = iso(hoy());
  const esEsta = iso(lunes) === iso(lunesDe(hoy()));
  const domingo = sumarDias(lunes, 6);
  const mes = MESES_LARGOS[domingo.getMonth()];
  // Debajo de la tira, solo lo que queda por delante: lo pasado está en la
  // tira, atenuado, y se abre desde allí.
  const noches = nochesDeLaSemana(lunes).filter((n) => iso(n) >= hoyIso);
  const grupo = el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: `${esEsta ? 'Esta semana' : 'Esa semana'} · ${mes}` }),
  ]);

  if (!noches.length) {
    grupo.append(el('p', { class: 'pista', texto: 'Esta semana ya ha pasado. Toca un día arriba para ver o corregir lo que se cenó.' }));
    if (!esEsta) {
      grupo.append(el('button', {
        class: 'boton-mini', type: 'button',
        onclick: () => { toque(); lunesVisto = null; ctx.refrescar(); },
      }, ['Volver a esta semana']));
    }
    return grupo;
  }

  for (const noche of noches) grupo.append(filaDeNoche(noche, ctx, hoyIso));

  // Rellenar recorre las noches que quedan, una fila por noche (B2); las que
  // ya tienen cena salen con la suya como primera alternativa (C1).
  const vacias = noches.filter((n) => !platoDe(datos, cenaDe(datos, iso(n)))).length;
  grupo.append(el('button', {
    class: 'boton cenas-rellenar', type: 'button', 'data-con-icono': 'si',
    'data-tono': vacias ? null : 'discreto',
    onclick: () => { toque(); abrirRellenar(noches.map(iso), ctx); },
  }, [icono('destello'), vacias ? `Rellenar la semana (${vacias})` : 'Otras ideas para la semana']));
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
    // Dos fuentes (D4): «Algo nuevo» lo pide a la IA, con lo que hay en casa;
    // «De las de siempre» sale del recetario, sin IA. En las dos, lo ya
    // apuntado esa noche es la primera alternativa (C1).
    const hay = campoDespensa();
    let fuente = 'nueva';
    const conLaQueHay = (lista, mas) => {
      const actual = laQueHay(datos, fecha);
      return !mas && actual ? [actual, ...lista.filter((p) => p.que !== actual.que)] : lista;
    };
    const hacerCarrusel = () => carruselDePropuestas({
      pedir: async ({ mas, yaDichas }) => {
        if (mas) toque();
        const lista = fuente === 'siempre'
          ? deLasDeSiempre(datos, fecha, { descartadas: yaDichas })
          : await proponerCenas([fecha], { hay: hay.control.value, descartadas: yaDichas });
        return conLaQueHay(lista, mas);
      },
      pintar: pintarPropuesta,
      clave: (propuesta) => propuesta.que,
      holgado: true,
      etiquetaMas: 'Otras',
      verbo: {
        texto: 'Elegir',
        hacer: async (propuesta) => {
          toque('media');
          if (!propuesta.actual) await elegirPropuesta(datos, fecha, propuesta, ctx.vista.yo.id);
          cerrarHoja();
          avisar(propuesta.actual ? 'Se queda la que había' : `Apuntado: ${propuesta.que}`);
          ctx.refrescar();
        },
      },
    });
    let carrusel = hacerCarrusel();
    const hueco = el('div', {}, [carrusel.nodo]);

    const fuentes = el('div', { class: 'opciones' }, [
      { id: 'nueva', nombre: 'Algo nuevo' },
      { id: 'siempre', nombre: 'De las de siempre' },
    ].map((opcion) => el('button', {
      class: 'opcion', type: 'button', 'aria-pressed': opcion.id === fuente ? 'true' : 'false',
      onclick: (evento) => {
        if (fuente === opcion.id) return;
        fuente = opcion.id;
        for (const otro of evento.currentTarget.parentElement.children) otro.setAttribute('aria-pressed', 'false');
        evento.currentTarget.setAttribute('aria-pressed', 'true');
        hay.nodo.hidden = fuente !== 'nueva';
        boton.lastChild.textContent = fuente === 'nueva' ? 'Proponer con IA' : 'Ver las de siempre';
        carrusel = hacerCarrusel();
        vaciar(hueco).append(carrusel.nodo);
      },
    }, [opcion.nombre])));

    const boton = el('button', {
      class: 'boton', type: 'button', 'data-tono': 'discreto', 'data-con-icono': 'si',
      onclick: () => { toque(); carrusel.abrir(); },
    }, [icono('destello'), 'Proponer con IA']);

    cuerpo.append(el('div', { class: 'cenas-proponer' }, [
      el('p', { class: 'grupo-titulo', texto: cena ? 'Otra cosa' : 'Proponer' }),
      fuentes,
      hay.nodo,
      boton,
      hueco,
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

/**
 * Rellenar la semana: una fila por noche, con el día fijo delante
 * (`specs/propuesta-cenas-segunda-vuelta.html`, B2). Cada fila tiene su casilla,
 * sus flechas para pasar de alternativa y su destello para pedir cinco más
 * para esa noche. Una noche que ya tiene cena empieza con la suya y sin marcar
 * (C1); solo se apunta lo marcado.
 */
function abrirRellenar(fechas, ctx) {
  const datos = ctx.vista.datos;

  abrirHoja('Rellenar la semana', (cuerpo) => {
    const hay = campoDespensa();
    const filas = fechas.map((fecha) => {
      const actual = laQueHay(datos, fecha);
      return { fecha, alternativas: actual ? [actual] : [], indice: 0, marcada: false, nodo: null };
    });
    const lista = el('div', { class: 'cenas-propuestas' });
    const apuntar = el('button', { class: 'boton crecer', type: 'button' }, ['Apuntar']);
    const todas = el('button', {
      class: 'boton', type: 'button', 'data-tono': 'discreto', 'data-con-icono': 'si',
    }, [icono('destello'), 'Proponer para todas']);

    const yaDichas = () => filas.flatMap((f) => f.alternativas.map((p) => p.que));
    const elegida = (fila) => fila.alternativas[fila.indice] || null;

    function pintarFila(fila) {
      const [a, m, d] = fila.fecha.split('-').map(Number);
      const noche = new Date(a, m - 1, d);
      const propuesta = elegida(fila);
      const nodo = el('div', { class: 'relleno', 'data-marcada': fila.marcada ? 'si' : null }, [
        el('span', { class: 'cena-dia' }, [
          el('span', { class: 'cena-dia-letra', texto: INICIALES_DIA[indiceDia(noche)] }),
          el('span', { class: 'cena-dia-num', texto: String(noche.getDate()) }),
        ]),
        el('button', {
          class: 'relleno-casilla', type: 'button', 'aria-pressed': fila.marcada ? 'true' : 'false',
          'aria-label': `Apuntar esta para el ${formatearFechaLarga(noche)}`,
          disabled: !propuesta || propuesta.actual,
          onclick: () => { toque(); fila.marcada = !fila.marcada; repintar(); },
        }, [fila.marcada ? icono('visto') : null]),
        el('div', { class: 'cena-texto' }, propuesta ? pintarPropuesta(propuesta)
          : [el('p', { class: 'propuesta-porque', texto: 'Sin propuesta todavía' })]),
        el('span', { class: 'relleno-mandos' }, [
          el('button', {
            class: 'propuesta-flecha', type: 'button', 'aria-label': 'Alternativa anterior',
            disabled: fila.indice === 0, onclick: () => mover(fila, -1),
          }, ['‹']),
          el('button', {
            class: 'propuesta-flecha', type: 'button', 'aria-label': 'Alternativa siguiente',
            disabled: fila.indice >= fila.alternativas.length - 1, onclick: () => mover(fila, 1),
          }, ['›']),
          el('button', {
            class: 'relleno-destello', type: 'button', 'aria-label': `Cinco más para el ${formatearFechaLarga(noche)}`,
            onclick: () => masParaLaNoche(fila),
          }, [icono('destello')]),
        ]),
      ]);
      fila.nodo = nodo;
      return nodo;
    }

    function repintar() {
      vaciar(lista).append(...filas.map(pintarFila));
      const cuantas = filas.filter((f) => f.marcada && elegida(f) && !elegida(f).actual).length;
      apuntar.textContent = cuantas ? `Apuntar las marcadas (${cuantas})` : 'Apuntar';
      apuntar.disabled = !cuantas;
    }

    // Pasar a otra alternativa la marca; volver a la que había la desmarca.
    function mover(fila, pasos) {
      toque();
      fila.indice = Math.min(fila.alternativas.length - 1, Math.max(0, fila.indice + pasos));
      fila.marcada = !elegida(fila)?.actual;
      repintar();
    }

    async function masParaLaNoche(fila) {
      toque();
      fila.nodo?.setAttribute('data-pensando', 'si');
      try {
        const nuevas = await proponerCenas([fila.fecha], { hay: hay.control.value, descartadas: yaDichas() });
        if (!nuevas.length) { avisar('No ha propuesto nada'); return; }
        fila.indice = fila.alternativas.length;
        fila.alternativas.push(...nuevas);
        fila.marcada = true;
      } catch (error) {
        avisar(error.message || 'No he podido pedírselo');
      } finally {
        repintar();
      }
    }

    todas.onclick = async () => {
      toque();
      todas.disabled = true;
      todas.lastChild.textContent = 'Pensando…';
      try {
        const nuevas = await proponerCenas(fechas, { hay: hay.control.value, descartadas: yaDichas() });
        nuevas.slice(0, filas.length).forEach((propuesta, i) => {
          const fila = filas[i];
          const tenia = elegida(fila)?.actual;
          fila.alternativas.push(propuesta);
          // Una noche con cena se queda con la suya; las vacías saltan a la nueva.
          if (!tenia) { fila.indice = fila.alternativas.length - 1; fila.marcada = true; }
        });
      } catch (error) {
        avisar(error.message || 'No he podido pedírselo');
      } finally {
        todas.disabled = false;
        todas.lastChild.textContent = 'Otras para todas';
        repintar();
      }
    };

    apuntar.onclick = async () => {
      const elegidas = filas.filter((f) => f.marcada && elegida(f) && !elegida(f).actual);
      if (!elegidas.length) return;
      toque('media');
      for (const fila of elegidas) await elegirPropuesta(datos, fila.fecha, elegida(fila), ctx.vista.yo.id);
      cerrarHoja();
      avisar(elegidas.length === 1 ? 'Apuntada' : `Apuntadas ${elegidas.length}`);
      ctx.refrescar();
    };

    repintar();
    cuerpo.append(
      el('p', { class: 'pista', texto: 'Una fila por noche. Las flechas pasan de una alternativa a otra, el destello pide cinco más para esa noche y solo se apunta lo marcado.' }),
      hay.nodo,
      todas,
      lista,
      el('div', { class: 'acciones' }, [
        apuntar,
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

  // Lo que es, dicho donde se mira: no es un libro de recetas con pasos.
  cuerpo.append(el('p', {
    class: 'pista',
    texto: 'Los platos que ya habéis cenado o apuntado. La IA repite lo que gustó y no vuelve a lo que no, y «De las de siempre» propone desde aquí sin IA.',
  }));
  if (!lista.length) {
    cuerpo.append(el('p', { class: 'pista', texto: 'Se llena solo al elegir lo que se propone, o a mano.' }));
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
