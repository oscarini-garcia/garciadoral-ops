/**
 * «Qué hay en la agenda»: la hoja de los plugins, la de cada uno, y los dos
 * formularios que se escriben con forma propia —la actividad y la escapada—.
 *
 * Es la figura de «Calendarios» del calendario de iOS
 * (`specs/propuesta-plugins-agenda.html`, B1): una lista de lo que se está
 * viendo, a un toque de la pantalla donde se ve —el botón de capas junto al
 * periodo de la agenda—, con un interruptor por plugin para quien mira y
 * detrás la hoja de cada uno. Ajustes se queda para la aplicación —tema,
 * sincronización, cuenta— y Lío y Viajes, que vivían allí, se vienen aquí.
 *
 * **Los mandos comunes van arriba de cada hoja** y son cuatro (D1, D2, D4, D5):
 * enseñar en mi agenda, quién lo ve, avisar, y nombre y emoji. Debajo, lo
 * propio de cada plugin, que es lo que se decidió en
 * `specs/propuesta-plugins-hojas.html`.
 */

import {
  abrirHoja, avisar, botonIcono, campo, cerrarHoja, el, enfocarAlAbrir, entrada, icono, selectorDeFecha, selectorDeHora, vaciar,
} from '../ui.js';
import {
  guardar, instantanea, pegarEnlaceDeViajes, quitarEnlaceDeViajes, retirar, sincronizar,
} from '../sincronizacion.js';
import {
  ANTELACIONES, CON_CIRCULO, CON_NOMBRE, PLUGINS, ajustesDe, avisoDePlugin, comoOtro, esOtro, guardarAjustesDePlugin, marcarAvisoDePlugin, marcarPluginOculto, nombreDeOtro, otrosRecientes, pluginOculto, recordarOtro,
} from '../plugins.js';
import { CIRCULOS, emojiVisible, estaActivo, nuevoId, partirEmoji } from '../modelo.js';
import {
  INICIALES_DIA, NOMBRES_DIA, diasSemanalesDe, formatearFechaLarga, formatearHace, horarioDelDia, hoy, indiceDia, iso, parsearMomento, soloFecha, sumarDias,
} from '../semana.js';
import {
  TURNOS, cuadroDe, genteDeCasa, guardarCuadro, hayLio, inicialesDe, nombreDeTurno, rotuloDeTurno,
} from '../lio.js';
import { campoDeGente, recordarElegidos } from '../gente.js';
import { toque } from '../native.js';
import { VERSION_APP } from '../version.js';
import { lugaresDe, nombreDeLugar } from '../sitios.js';
import { abrirFormularioEvento, fechaQuePropone } from './semana.js';

/** ¿Es de casa quien mira? Lío y Sitios solo existen para quien lo es. */
const deCasa = (ctx) => (ctx.vista.datos.yo?.circulo || ctx.vista.persona(ctx.vista.yo.id)?.circulo) === 'familia';

// ------------------------------------------------------- La lista de plugins --

/**
 * La hoja con los seis. Cada fila dice de qué va —«de Óscar, por Flighty»,
 * «hípica, martes»—, lleva su interruptor y abre su hoja.
 */
export function abrirPlugins(ctx) {
  abrirHoja('Qué hay en la agenda', (cuerpo) => {
    cuerpo.append(el('p', {
      class: 'pista',
      texto: 'Lo que sale en tu semana, y de dónde viene cada cosa. Apagar uno lo quita de tu agenda en este aparato; a los demás no les cambia nada.',
    }));

    const lista = el('div', { class: 'plugins' });
    for (const plugin of PLUGINS) {
      if (plugin.id === 'lio' && !deCasa(ctx)) continue;
      lista.append(filaDePlugin(plugin, ctx));
    }
    cuerpo.append(lista);
  }, [
    botonIcono('cerrar', { etiqueta: 'Cerrar', tono: 'discreto', onclick: cerrarHoja }),
  ]);
}

function filaDePlugin(plugin, ctx) {
  const ajustes = ajustesDe(ctx.vista.datos, plugin.id);
  const casilla = el('input', { type: 'checkbox', 'aria-label': `Enseñar ${ajustes.nombre} en mi agenda` });
  casilla.checked = !pluginOculto(plugin.id);
  casilla.addEventListener('change', () => {
    marcarPluginOculto(plugin.id, !casilla.checked);
    ctx.refrescar();
    ctx.reprogramarAvisos?.();
  });

  return el('div', { class: 'plugin-fila', 'data-apagado': casilla.checked ? 'no' : 'si' }, [
    el('button', {
      class: 'plugin-cuerpo', type: 'button',
      'aria-label': `${ajustes.nombre}: ${deQueVa(plugin.id, ctx)}. Ajustar.`,
      onclick: () => abrirHojaDePlugin(plugin.id, ctx),
    }, [
      el('span', { class: 'plugin-emoji', 'aria-hidden': 'true', texto: emojiVisible(ajustes.emoji) }),
      el('span', { class: 'plugin-texto' }, [
        el('span', { class: 'plugin-nombre', texto: ajustes.nombre }),
        el('span', { class: 'plugin-de', texto: deQueVa(plugin.id, ctx) }),
      ]),
      el('span', { class: 'plugin-flecha', 'aria-hidden': 'true', texto: '›' }),
    ]),
    el('label', { class: 'conmutador plugin-interruptor' }, [casilla]),
  ]);
}

/** La segunda línea de cada fila: qué hay ahora mismo de ese plugin. */
function deQueVa(id, ctx) {
  const datos = ctx.vista.datos;
  if (id === 'lio') return hayLio(datos) ? 'los turnos de casa' : 'sin cuadro todavía';
  if (id === 'viajes') {
    const duenos = (datos.calendarios_externos || [])
      .filter((c) => c.tiene_enlace || c.id === 'cal-viajes')
      .map((c) => ctx.vista.persona(c.persona_id)?.nombre)
      .filter(Boolean);
    return duenos.length ? `de ${duenos.join(' y ')}, por Flighty` : 'sin ningún enlace pegado';
  }
  if (id === 'cumples') {
    const cuantos = ctx.vista.personas().filter((p) => p.fecha_nacimiento).length;
    return cuantos ? `${cuantos} con fecha en Gente` : 'nadie con fecha en Gente';
  }
  if (id === 'puntuales') return 'cenas, citas y lo que no tiene regla';
  if (id === 'extraescolares') {
    const nombres = actividadesDe(ctx).map((e) => ctx.vista.caraDe(e).titulo);
    return nombres.length ? nombres.slice(0, 3).join(', ') : 'ninguna actividad todavía';
  }
  if (id === 'finde') {
    const proxima = escapadasDe(ctx).find((e) => iso(parsearMomento(e.fin || e.inicio)) >= iso(hoy()));
    return proxima ? `${ctx.vista.caraDe(proxima).titulo}, ${formatearFechaLarga(parsearMomento(proxima.inicio))}` : 'ninguna escapada a la vista';
  }
  return '';
}

/** Las actividades vivas, por nombre. */
export const actividadesDe = (ctx) => (ctx.vista.datos.eventos || [])
  .filter((e) => e.plugin_id === 'extraescolar' && estaActivo(e))
  .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));

/** Las escapadas vivas, por fecha. */
export const escapadasDe = (ctx) => (ctx.vista.datos.eventos || [])
  .filter((e) => e.plugin_id === 'finde' && estaActivo(e))
  .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

// --------------------------------------------------------- La hoja de uno --

export function abrirHojaDePlugin(id, ctx) {
  const plugin = PLUGINS.find((p) => p.id === id);
  if (!plugin) return;
  const ajustes = ajustesDe(ctx.vista.datos, id);

  abrirHoja(`${emojiVisible(ajustes.emoji)} ${ajustes.nombre}`, (cuerpo) => {
    cuerpo.append(...mandosComunes(id, ctx));
    const propio = {
      lio: bloqueDeLio,
      viajes: bloqueDeViajes,
      cumples: bloqueDeCumples,
      puntuales: bloqueDePuntuales,
      extraescolares: bloqueDeExtraescolares,
      finde: bloqueDeFinde,
    }[id];
    if (propio) propio(cuerpo, ctx);
  }, [
    botonIcono('cerrar', { etiqueta: 'Volver a la lista', tono: 'discreto', onclick: () => abrirPlugins(ctx) }),
  ]);
}

/**
 * Los cuatro mandos comunes, los que toquen a cada plugin.
 *
 * Enseñar es de quien mira y de este aparato; el círculo y el nombre son de la
 * casa y los cambia quien administra; avisar es de este aparato, porque el
 * recordatorio se programa aquí. Lío no tiene círculo —está fijo en casa— ni
 * aviso —el suyo es el del turno propio, que ya suena—; los cumpleaños tienen
 * el aviso desplegado por círculo dentro de su propio bloque.
 */
function mandosComunes(id, ctx) {
  const datos = ctx.vista.datos;
  const ajustes = ajustesDe(datos, id);
  const administra = ctx.vista.esAdministrador();
  const mandos = [];

  const casilla = el('input', { type: 'checkbox' });
  casilla.checked = !pluginOculto(id);
  casilla.addEventListener('change', () => {
    marcarPluginOculto(id, !casilla.checked);
    ctx.refrescar();
    ctx.reprogramarAvisos?.();
  });
  mandos.push(el('label', { class: 'conmutador' }, [casilla, 'Enseñar en mi agenda']));

  if (CON_CIRCULO.includes(id)) {
    if (administra) {
      const seg = segmentado(
        [['familia', 'Casa'], ['extendida', 'Familia'], ['amigos', 'Amigos']],
        ajustes.circulo,
        async (valor) => { await guardarAjustesDePlugin(datos, id, { circulo: valor }); ctx.refrescar(); },
      );
      mandos.push(campo('Lo ven', seg, 'Hasta qué círculo llega. Casa es solo el hogar; Amigos, todo el mundo con cuenta.'));
    } else {
      mandos.push(el('p', { class: 'pista', texto: `Lo ven: ${CIRCULOS[ajustes.circulo] || ajustes.circulo}.` }));
    }
  }

  if (id !== 'lio' && id !== 'cumples') {
    const seg = segmentado(
      ANTELACIONES.map((a) => [a.valor, a.texto]),
      avisoDePlugin(id),
      (valor) => { marcarAvisoDePlugin(id, valor); ctx.reprogramarAvisos?.(); },
    );
    mandos.push(campo('Avisar', seg, 'El recordatorio en este teléfono.'));
  }

  if (CON_NOMBRE.includes(id) && administra) {
    const nombre = entrada({ value: `${emojiVisible(ajustes.emoji)} ${ajustes.nombre}` });
    const guardarNombre = async () => {
      const { emoji, resto } = partirEmoji(nombre.value);
      const limpio = resto.trim();
      if (!limpio) { nombre.value = `${emojiVisible(ajustes.emoji)} ${ajustes.nombre}`; return; }
      if (limpio === ajustes.nombre && (emoji || ajustes.emoji) === ajustes.emoji) return;
      await guardarAjustesDePlugin(datos, id, { nombre: limpio, emoji: emoji || ajustes.emoji });
      avisar('Guardado');
      ctx.refrescar();
    };
    nombre.addEventListener('blur', guardarNombre);
    nombre.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') { evento.preventDefault(); nombre.blur(); } });
    mandos.push(campo('Cómo se llama', nombre, 'Con el emoji delante del nombre, como en un sitio: «🐴 Hípica».'));
  }

  return mandos;
}

/** Un segmentado de los de la aplicación, con lo elegido marcado y un solo verbo. */
function segmentado(opciones, elegido, alElegir) {
  const seg = el('div', { class: 'seg', role: 'group' });
  for (const [valor, texto] of opciones) {
    seg.append(el('button', {
      type: 'button',
      'aria-pressed': valor === elegido ? 'true' : 'false',
      onclick: (evento) => {
        for (const otro of seg.children) otro.setAttribute('aria-pressed', 'false');
        evento.currentTarget.setAttribute('aria-pressed', 'true');
        alElegir(valor);
      },
    }, [texto]));
  }
  return seg;
}

// ------------------------------------------------------------------- Lío --

/**
 * El cuadro de Lío, que vivía en Ajustes: una línea por día con el nombre
 * entero, y encima **dos filas de atajo** —lunes a viernes y fin de semana—
 * que escriben las cinco o las dos casillas de un toque
 * (`specs/propuesta-plugins-hojas.html`, B1). Es lo que ahorraba los catorce
 * toques que la especificación dejaba escritos como lo que faltaba. El atajo
 * pisado por una edición suelta —el miércoles distinto— dice «varios» y no
 * miente.
 */
function bloqueDeLio(cuerpo, ctx) {
  if (!ctx.vista.esAdministrador()) {
    cuerpo.append(el('p', { class: 'pista', texto: 'El reparto lo cambia quien administra. Un día suelto se cambia desde el propio turno.' }));
    cuerpo.append(el('p', { class: 'pista', texto: 'Las ausencias —quien no está unos días— se escriben en la ficha de cada uno, en Gente.' }));
    return;
  }

  const casa = genteDeCasa(ctx.vista);
  if (!casa.length) {
    cuerpo.append(el('p', { class: 'pista', texto: 'Todavía no hay nadie en el círculo de casa.' }));
    return;
  }

  const cuadro = cuadroDe(instantanea());
  const vueltas = [null, ...casa.map((p) => p.id)];
  const dias = el('div', { class: 'lio-dias' });
  const celdas = [];

  dias.append(el('div', { class: 'lio-dia lio-dia-cabecera' }, [
    el('span'),
    ...TURNOS.map((turno) => el('span', { texto: rotuloDeTurno(turno) })),
  ]));

  const ATAJOS = [
    { rotulo: 'L a V', largo: 'Lunes a viernes', dias: [0, 1, 2, 3, 4] },
    { rotulo: 'S y D', largo: 'Fin de semana', dias: [5, 6] },
  ];
  const atajos = [];
  for (const atajo of ATAJOS) {
    dias.append(el('div', { class: 'lio-dia lio-dia-atajo' }, [
      el('span', { class: 'lio-dia-rotulo', texto: atajo.rotulo, title: atajo.largo }),
      ...TURNOS.map((turno) => {
        const boton = celdaDeAtajo(cuadro, turno, atajo, casa, vueltas, () => repintar());
        atajos.push(boton);
        return boton.nodo;
      }),
    ]));
  }

  for (let dia = 0; dia < 7; dia += 1) {
    dias.append(el('div', { class: 'lio-dia' }, [
      el('span', { class: 'lio-dia-rotulo', texto: mayusculaInicial(NOMBRES_DIA[dia].slice(0, 3)) }),
      ...TURNOS.map((turno) => {
        const celda = celdaDelCuadro(cuadro, turno, dia, casa, vueltas, () => repintar());
        celdas.push(celda);
        return celda.nodo;
      }),
    ]));
  }

  function repintar() {
    for (const celda of celdas) celda.pintar();
    for (const atajo of atajos) atajo.pintar();
  }

  cuerpo.append(
    el('p', {
      class: 'pista',
      texto: 'Toca un turno para pasar a la siguiente persona; las dos filas de arriba escriben de golpe los días de diario o los del fin de semana. Lo que cambies vale de ahora en adelante; lo que ya pasó se queda como fue.',
    }),
    dias,
    el('p', { class: 'pista', texto: `En la semana: ${casa.map((p) => `${inicialesDe(p)} ${p.nombre}`).join(' · ')}` }),
    el('p', { class: 'pista', texto: 'Quien no está unos días lo dice en su ficha, en Gente: sus turnos pasan a quien cubra, y la semana lo enseña como una banda.' }),
  );
}

const mayusculaInicial = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

function celdaDelCuadro(cuadro, turno, dia, casa, vueltas, alCambiar) {
  const nombre = el('span', { class: 'lio-dia-nombre' });
  const nodo = el('button', { class: 'lio-dia-turno', type: 'button' }, [nombre]);
  const pintar = () => {
    const persona = casa.find((p) => p.id === cuadro[turno.id][dia]) || null;
    nombre.textContent = persona ? persona.nombre : 'Nadie';
    nodo.dataset.vacio = persona ? 'no' : 'si';
    nodo.setAttribute('aria-label', `${NOMBRES_DIA[dia]} ${nombreDeTurno(turno).toLowerCase()}: ${persona ? persona.nombre : 'nadie'}. Cambiar.`);
  };
  nodo.onclick = async () => {
    toque();
    const actual = vueltas.indexOf(cuadro[turno.id][dia]);
    cuadro[turno.id][dia] = vueltas[(actual + 1) % vueltas.length];
    alCambiar();
    await guardarCuadro(cuadro);
  };
  pintar();
  return { nodo, pintar };
}

function celdaDeAtajo(cuadro, turno, atajo, casa, vueltas, alCambiar) {
  const nombre = el('span', { class: 'lio-dia-nombre' });
  const nodo = el('button', { class: 'lio-dia-turno lio-dia-turno-atajo', type: 'button' }, [nombre]);
  const comun = () => {
    const valores = atajo.dias.map((dia) => cuadro[turno.id][dia]);
    return valores.every((v) => v === valores[0]) ? { igual: true, valor: valores[0] } : { igual: false, valor: null };
  };
  const pintar = () => {
    const { igual, valor } = comun();
    const persona = igual ? casa.find((p) => p.id === valor) || null : null;
    nombre.textContent = !igual ? 'Varios' : (persona ? persona.nombre : 'Nadie');
    nodo.dataset.vacio = igual && persona ? 'no' : 'si';
    nodo.setAttribute('aria-label', `${atajo.largo} ${nombreDeTurno(turno).toLowerCase()}: ${nombre.textContent.toLowerCase()}. Escribir los ${atajo.dias.length} días.`);
  };
  nodo.onclick = async () => {
    toque();
    const { igual, valor } = comun();
    // De «varios» se pasa a la primera persona; de una persona, a la siguiente.
    const siguiente = igual ? vueltas[(vueltas.indexOf(valor) + 1) % vueltas.length] : vueltas[1] || null;
    for (const dia of atajo.dias) cuadro[turno.id][dia] = siguiente;
    alCambiar();
    await guardarCuadro(cuadro);
  };
  pintar();
  return { nodo, pintar };
}

// ---------------------------------------------------------------- Viajes --

/**
 * Una fila por persona de casa, con su enlace de Flighty pegado o por pegar
 * (`specs/propuesta-plugins-hojas.html`, D1). El dueño es el de la fila, así
 * que un vuelo sale «de Marta» sin más; y la última lectura se lee en la
 * fila, sin verbo, porque «Comprobar ahora» sigue en Sincronización.
 */
function bloqueDeViajes(cuerpo, ctx) {
  const datos = ctx.vista.datos;
  const administra = ctx.vista.esAdministrador();
  const yo = ctx.vista.yo.id;
  const calendarios = datos.calendarios_externos || [];
  const casa = ctx.vista.personasDe('familia').filter((p) => p.tiene_cuenta);

  const lista = el('div', { class: 'plugins' });
  for (const persona of casa) {
    const calendario = calendarios.find((c) => c.id === `cal-${persona.id}`)
      || calendarios.find((c) => c.id === 'cal-viajes' && c.persona_id === persona.id);
    const puedeTocar = administra || persona.id === yo;
    const conEnlace = Boolean(calendario?.tiene_enlace) || calendario?.id === 'cal-viajes';
    const detalle = conEnlace
      ? `Flighty · ${calendario.ultima_sincronizacion ? formatearHace(calendario.ultima_sincronizacion) : 'sin leer todavía'}${calendario.ultimo_resultado && !/^error/.test(calendario.ultimo_resultado) ? ' ✓' : ''}`
      : 'sin calendario';

    lista.append(el('div', { class: 'plugin-fila' }, [
      el('div', { class: 'plugin-cuerpo plugin-cuerpo-quieto' }, [
        el('span', { class: 'plugin-texto' }, [
          el('span', { class: 'plugin-nombre', texto: persona.nombre }),
          el('span', { class: 'plugin-de', texto: detalle }),
        ]),
      ]),
      puedeTocar && conEnlace && calendario.id !== 'cal-viajes'
        ? el('button', {
            class: 'boton-mini', 'data-tono': 'discreto', type: 'button',
            onclick: () => confirmarQuitarEnlace(persona, ctx),
          }, ['Quitar'])
        : null,
      puedeTocar && !conEnlace
        ? el('button', {
            class: 'boton-mini', 'data-tono': 'principal', type: 'button',
            onclick: () => pedirEnlace(persona, ctx),
          }, ['Pegar enlace'])
        : null,
    ]));
  }
  cuerpo.append(el('p', { class: 'pista', texto: 'El enlace de Flighty de cada uno. Se pega una vez y los vuelos llegan solos; cada uno pega el suyo, y quien administra puede pegar el de los demás.' }));
  cuerpo.append(lista);

  // El diagnóstico de siempre, que es de quien administra y no de quien se
  // pregunta si está todo al día.
  if (administra) {
    const viajes = (datos.eventos || []).filter((e) => e.origen === 'importado');
    const fechas = viajes.map((e) => e.inicio).filter(Boolean).sort();
    const lineas = [];
    for (const cal of calendarios) {
      lineas.push(`${cal.nombre}${cal.persona_id ? ` (${ctx.vista.nombre(cal.persona_id)})` : ''}: ${cal.tiene_enlace || cal.id === 'cal-viajes' ? 'con enlace' : 'sin enlace'}`);
      if (cal.ultima_sincronizacion) lineas.push(`  última correcta: ${cal.ultima_sincronizacion}`);
      if (cal.ultimo_resultado) lineas.push(`  y salió: ${cal.ultimo_resultado}`);
    }
    lineas.push(`Vuelos cargados: ${viajes.length}`);
    if (fechas.length) lineas.push(`  fechas: de ${fechas[0]} a ${fechas[fechas.length - 1]}`);
    lineas.push(`Versión de la app: ${VERSION_APP}`);
    cuerpo.append(el('pre', { class: 'traza', texto: lineas.join('\n') }));
  }
}

function pedirEnlace(persona, ctx) {
  abrirHoja(`El Flighty de ${persona.nombre}`, (cuerpo) => {
    const enlace = entrada({ type: 'url', placeholder: 'webcal://…', autocomplete: 'off', spellcheck: 'false' });
    cuerpo.append(campo('Enlace del calendario', enlace, 'En Flighty: Ajustes › Calendario › copiar el enlace de suscripción. Es un secreto: se guarda en el servidor y no vuelve a salir.'));
    const boton = el('button', {
      class: 'boton crecer', type: 'button',
      onclick: async () => {
        const url = enlace.value.trim();
        if (!url) { avisar('Pega el enlace'); enlace.focus(); return; }
        boton.disabled = true;
        boton.textContent = 'Leyendo el calendario…';
        try {
          const { resumen } = await pegarEnlaceDeViajes(url, persona.id);
          await sincronizar().catch(() => {});
          avisar(resumen?.estado === 'ok' ? 'Enlace guardado y calendario leído' : 'Enlace guardado');
          ctx.refrescar();
          abrirHojaDePlugin('viajes', ctx);
        } catch (error) {
          boton.disabled = false;
          boton.textContent = 'Guardar';
          avisar(error.message || 'No he podido guardarlo');
        }
      },
    }, ['Guardar']);
    cuerpo.append(el('div', { class: 'acciones' }, [
      boton,
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: () => abrirHojaDePlugin('viajes', ctx) }, ['Cancelar']),
    ]));
    enfocarAlAbrir(enlace);
  });
}

function confirmarQuitarEnlace(persona, ctx) {
  abrirHoja(`Quitar el Flighty de ${persona.nombre}`, (cuerpo) => {
    cuerpo.append(el('p', { texto: 'Se borra el enlace del servidor y sus vuelos salen de la agenda de todos. Para volver a tenerlos hay que pegarlo otra vez.' }));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: async () => {
          try {
            await quitarEnlaceDeViajes(persona.id);
            await sincronizar().catch(() => {});
            avisar('Enlace quitado');
            ctx.refrescar();
            abrirHojaDePlugin('viajes', ctx);
          } catch (error) {
            avisar(error.message || 'No he podido quitarlo');
          }
        },
      }, ['Quitar']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: () => abrirHojaDePlugin('viajes', ctx) }, ['Cancelar']),
    ]));
  });
}

// ------------------------------------------------------ Cumpleaños y santos --

/**
 * La antelación por círculo (G1), y si salen los santos y la edad. Es de la
 * casa, así que la toca quien administra; el resto la lee.
 */
function bloqueDeCumples(cuerpo, ctx) {
  const datos = ctx.vista.datos;
  const ajustes = ajustesDe(datos, 'cumples');
  const administra = ctx.vista.esAdministrador();

  const guardarAviso = async (circulo, dias) => {
    await guardarAjustesDePlugin(datos, 'cumples', { aviso: { ...ajustes.aviso, [circulo]: dias } });
    ctx.reprogramarAvisos?.();
  };
  const OPCIONES = [[0, 'Ese día'], [1, 'La víspera'], [7, 'Una semana']];

  cuerpo.append(el('p', { class: 'grupo-titulo', texto: 'Avisar' }));
  for (const [circulo, nombre] of [['familia', 'Casa'], ['extendida', 'Familia'], ['amigos', 'Amigos']]) {
    if (administra) {
      cuerpo.append(campo(nombre, segmentado(OPCIONES, ajustes.aviso[circulo], (dias) => guardarAviso(circulo, dias))));
    } else {
      const texto = OPCIONES.find(([dias]) => dias === ajustes.aviso[circulo])?.[1] || `${ajustes.aviso[circulo]} días antes`;
      cuerpo.append(el('p', { class: 'pista', texto: `${nombre}: ${texto.toLowerCase()}.` }));
    }
  }
  cuerpo.append(el('p', { class: 'pista', texto: 'Una semana para casa da tiempo al regalo; el mismo día para un amigo es cuando se felicita.' }));

  const santos = el('input', { type: 'checkbox' });
  santos.checked = ajustes.santos;
  santos.disabled = !administra;
  santos.addEventListener('change', async () => {
    await guardarAjustesDePlugin(datos, 'cumples', { santos: santos.checked });
    ctx.refrescar();
  });
  const edad = el('input', { type: 'checkbox' });
  edad.checked = ajustes.edad;
  edad.disabled = !administra;
  edad.addEventListener('change', async () => {
    await guardarAjustesDePlugin(datos, 'cumples', { edad: edad.checked });
    ctx.refrescar();
  });
  cuerpo.append(
    el('label', { class: 'conmutador' }, [santos, 'Los santos también']),
    el('p', { class: 'pista', texto: 'El santo se escribe en la ficha de cada uno, en Gente, y sale en la agenda como el cumpleaños.' }),
    el('label', { class: 'conmutador' }, [edad, 'Escribir los años que cumple']),
  );
}

// ------------------------------------------------------------- Puntuales --

/**
 * Qué tipos se ofrecen en «Qué es» (I1): el catálogo tiene diez y la casa usa
 * cuatro. Los tres que ahora tienen plugin propio —cumpleaños, santo y viaje—
 * no se ofrecen aquí.
 */
export const TIPOS_DE_OTROS_PLUGINS = ['cumpleanos', 'santo', 'viaje'];

export function tiposVisibles(ctx, ademas = null) {
  const ajustes = ajustesDe(ctx.vista.datos, 'puntuales');
  const todos = ctx.vista.tiposEvento().filter((t) => !TIPOS_DE_OTROS_PLUGINS.includes(t.id));
  const marcados = ajustes.tipos ? todos.filter((t) => ajustes.tipos.includes(t.id)) : todos;
  const lista = marcados.length ? marcados : todos;
  if (ademas && !lista.some((t) => t.id === ademas)) {
    const extra = ctx.vista.tipoEvento(ademas);
    if (extra) lista.push(extra);
  }
  return lista;
}

function bloqueDePuntuales(cuerpo, ctx) {
  const datos = ctx.vista.datos;
  const ajustes = ajustesDe(datos, 'puntuales');
  const administra = ctx.vista.esAdministrador();
  const todos = ctx.vista.tiposEvento().filter((t) => !TIPOS_DE_OTROS_PLUGINS.includes(t.id));
  let marcados = new Set(ajustes.tipos || todos.map((t) => t.id));

  const fila = el('div', { class: 'opciones' });
  const pintar = () => {
    vaciar(fila);
    for (const tipo of todos) {
      fila.append(el('button', {
        class: 'opcion', type: 'button',
        'aria-pressed': marcados.has(tipo.id) ? 'true' : 'false',
        disabled: administra ? null : true,
        onclick: async () => {
          if (marcados.has(tipo.id)) marcados.delete(tipo.id); else marcados.add(tipo.id);
          if (!marcados.size) marcados = new Set([tipo.id]);
          pintar();
          await guardarAjustesDePlugin(datos, 'puntuales', { tipos: todos.filter((t) => marcados.has(t.id)).map((t) => t.id) });
        },
      }, [`${tipo.emoji} ${tipo.nombre}`]));
    }
  };
  pintar();
  cuerpo.append(
    el('p', { class: 'grupo-titulo', texto: 'Qué tipos se ofrecen' }),
    fila,
    el('p', { class: 'pista', texto: 'Los marcados salen en «Qué es» al apuntar algo. Lo ya apuntado con un tipo desmarcado se queda como está.' }),
  );
}

// -------------------------------------------------------- Extraescolares --

function bloqueDeExtraescolares(cuerpo, ctx) {
  const actividades = actividadesDe(ctx);
  const lista = el('div', { class: 'plugins' });
  for (const actividad of actividades) {
    const cara = ctx.vista.caraDe(actividad);
    const quien = ctx.vista.protagonistas(actividad).map((id) => ctx.vista.nombre(id)).join(', ');
    const dias = (diasSemanalesDe(actividad) || [indiceDia(parsearMomento(actividad.inicio))])
      .map((d) => NOMBRES_DIA[d]).join(' y ');
    lista.append(el('div', { class: 'plugin-fila' }, [
      el('button', {
        class: 'plugin-cuerpo', type: 'button',
        onclick: () => abrirFormularioActividad(ctx, { id: actividad.id }),
      }, [
        el('span', { class: 'plugin-emoji', 'aria-hidden': 'true', texto: cara.emoji }),
        el('span', { class: 'plugin-texto' }, [
          el('span', { class: 'plugin-nombre', texto: cara.titulo }),
          el('span', { class: 'plugin-de', texto: [quien, dias, horaDeActividad(actividad)].filter(Boolean).join(' · ') }),
        ]),
        el('span', { class: 'plugin-flecha', 'aria-hidden': 'true', texto: '›' }),
      ]),
    ]));
  }
  cuerpo.append(el('p', { class: 'grupo-titulo', texto: 'Actividades' }));
  cuerpo.append(actividades.length ? lista : el('p', { class: 'vacio', texto: 'Ninguna todavía.' }));
  cuerpo.append(el('div', { class: 'acciones' }, [
    el('button', { class: 'boton crecer', type: 'button', onclick: () => abrirFormularioActividad(ctx) }, ['Nueva actividad']),
  ]));
  cuerpo.append(el('p', { class: 'pista', texto: 'Cada actividad lleva su curso, sus días, su hora y quién lleva y recoge. Un día suelto se cambia desde la propia agenda.' }));
}

const horaDeActividad = (evento) => {
  // Cada día a su hora (B1): «M 17:00 · J 18:00» cuando difieren.
  const dias = diasSemanalesDe(evento) || [];
  const propios = dias.map((d) => [d, horarioDelDia(evento, d)]).filter(([, h]) => h);
  if (propios.length) {
    const hh = (t) => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
    const distintas = new Set(propios.map(([, h]) => hh(h.desde)));
    if (distintas.size > 1) return propios.map(([d, h]) => `${INICIALES_DIA[d]} ${hh(h.desde)}`).join(' · ');
    return [...distintas][0];
  }
  if (evento.jornada_completa) return null;
  const inicio = parsearMomento(evento.inicio);
  const fin = evento.fin ? parsearMomento(evento.fin) : null;
  const hh = (m) => `${String(m.getHours()).padStart(2, '0')}:${String(m.getMinutes()).padStart(2, '0')}`;
  return fin && fin > inicio ? `${hh(inicio)} – ${hh(fin)}` : hh(inicio);
};

// ------------------------------------------------------------------ Finde --

function bloqueDeFinde(cuerpo, ctx) {
  const escapadas = escapadasDe(ctx).filter((e) => iso(parsearMomento(e.fin || e.inicio)) >= iso(sumarDias(hoy(), -1)));
  const lista = el('div', { class: 'plugins' });
  for (const escapada of escapadas) {
    const cara = ctx.vista.caraDe(escapada);
    lista.append(el('div', { class: 'plugin-fila' }, [
      el('button', {
        class: 'plugin-cuerpo', type: 'button',
        onclick: () => abrirFormularioEscapada(ctx, { id: escapada.id }),
      }, [
        el('span', { class: 'plugin-emoji', 'aria-hidden': 'true', texto: cara.emoji }),
        el('span', { class: 'plugin-texto' }, [
          el('span', { class: 'plugin-nombre', texto: cara.titulo }),
          el('span', { class: 'plugin-de', texto: `${formatearFechaLarga(parsearMomento(escapada.inicio))} · ${quienesVan(escapada, ctx)}` }),
        ]),
        el('span', { class: 'plugin-flecha', 'aria-hidden': 'true', texto: '›' }),
      ]),
    ]));
  }
  cuerpo.append(el('p', { class: 'grupo-titulo', texto: 'Escapadas' }));
  cuerpo.append(escapadas.length ? lista : el('p', { class: 'vacio', texto: 'Ninguna a la vista.' }));
  cuerpo.append(el('div', { class: 'acciones' }, [
    el('button', { class: 'boton crecer', type: 'button', onclick: () => abrirFormularioEscapada(ctx) }, ['Nueva escapada']),
  ]));
  cuerpo.append(el('p', { class: 'pista', texto: 'Una escapada enlaza con un sitio de Sitios: la víspera, Hoy dice cuánto queda por meter de su lista de Llevar.' }));
}

/** «todos», o las iniciales de quien va cuando no van los cuatro. */
export function quienesVan(evento, ctx) {
  const van = ctx.vista.participantes(evento);
  const casa = ctx.vista.personasDe('familia').map((p) => p.id);
  if (!van.length) return 'sin decir quién';
  if (casa.length && casa.every((id) => van.includes(id))) return 'todos';
  return van.map((id) => ctx.vista.persona(id)).filter(Boolean).map((p) => inicialesDe(p)).join('·');
}

// --------------------------------------------------------------- El «+» --

/**
 * Lo que abre el «+» de la agenda (H2): una lista corta con lo que se puede
 * apuntar —un evento, una actividad, un fin de semana—, cada uno con su
 * formulario. Se paga un toque en la cena del sábado; lo que se gana es que
 * los dos plugins escritos se creen desde donde se piensa, que es la agenda.
 */
export function abrirMenuDeNuevo(ctx) {
  const datos = ctx.vista.datos;
  const fecha = fechaQuePropone();
  const filas = [
    { id: 'puntuales', texto: 'Evento', pista: 'una cena, una cita, lo que sea de un día', abrir: () => abrirFormularioEvento(ctx, { fecha }) },
    { id: 'extraescolares', texto: 'Actividad', pista: 'con su curso, sus días y su hora', abrir: () => abrirFormularioActividad(ctx, { fecha }) },
    { id: 'finde', texto: 'Fin de semana', pista: 'una escapada, con su sitio y quién va', abrir: () => abrirFormularioEscapada(ctx, { fecha }) },
  ];
  abrirHoja('Nuevo', (cuerpo) => {
    for (const fila of filas) {
      const ajustes = ajustesDe(datos, fila.id);
      cuerpo.append(el('button', { class: 'eleccion', type: 'button', onclick: fila.abrir }, [
        el('span', { class: 'eleccion-emoji', 'aria-hidden': 'true', texto: emojiVisible(ajustes.emoji) }),
        el('span', { class: 'eleccion-texto' }, [
          el('span', { class: 'eleccion-nombre', texto: fila.id === 'puntuales' ? fila.texto : ajustes.nombre }),
          el('span', { class: 'eleccion-pista', texto: fila.pista }),
        ]),
      ]));
    }
  });
}

// ---------------------------------------------------------- La actividad --

/** Los turnos de casa a los que se les puede dar el llevar y el recoger. */
const opcionesDeCasa = (ctx) => [null, ...ctx.vista.personasDe('familia').filter((p) => p.tiene_cuenta).map((p) => p.id)];

/**
 * La ficha de una actividad (E1 y K1): quién, qué días, a qué hora, dónde, el
 * curso, y el cuadro de llevar y recoger por día de actividad. Es un evento
 * semanal con `extra.dias` y `extra.reparto`, y por eso el plan de los
 * domingos lo cuenta sin saber que es una actividad.
 */
export function abrirFormularioActividad(ctx, { id = null, fecha = null } = {}) {
  const existente = id ? ctx.vista.evento(id) : null;
  const extra = existente?.extra || {};
  const inicio = existente ? parsearMomento(existente.inicio) : null;
  const finDeSesion = existente?.fin ? parsearMomento(existente.fin) : null;
  const hh = (m) => (m ? `${String(m.getHours()).padStart(2, '0')}:${String(m.getMinutes()).padStart(2, '0')}` : '');

  const borrador = {
    titulo: existente?.titulo || '',
    quien: existente ? ctx.vista.protagonistas(existente) : [],
    dias: new Set(diasSemanalesDe(existente) || (inicio ? [indiceDia(inicio)] : [])),
    reparto: { ...(extra.reparto || {}) },
  };

  const borrar = existente ? botonIcono('borrar', {
    etiqueta: 'Borrar la actividad', tono: 'peligro',
    onclick: async () => {
      await retirar('evento', existente.id);
      toque('media');
      cerrarHoja();
      avisar('Actividad borrada');
      ctx.refrescar();
    },
  }) : null;

  abrirHoja(existente ? 'Editar la actividad' : 'Nueva actividad', (cuerpo) => {
    const titulo = entrada({ value: borrador.titulo, placeholder: '🐴 Hípica' });
    if (!existente) enfocarAlAbrir(titulo);

    const desde = selectorDeFecha({ valor: existente ? iso(inicio) : iso(fecha || hoy()) });
    const hasta = selectorDeFecha({
      valor: existente?.repeticion_hasta || '',
      min: desde.valor,
      vacio: 'Sin fin',
    });
    desde.nodo.querySelector('.fecha-boton').addEventListener('click', () => { /* nada: el mínimo se ajusta al elegir */ });

    const lugar = entrada({ value: existente?.ubicacion || '' });

    // Cada día a su hora (B1): una fila de inicio y fin por día marcado, con
    // el reloj propio. Se guarda en `extra.horario[dia]`; el inicio y el fin
    // del evento se quedan con los del primer día, que es lo que lee todo lo
    // que no sabe de horarios.
    const horaPorDefecto = existente && !existente.jornada_completa ? hh(inicio) : '18:00';
    const finPorDefecto = hh(finDeSesion);
    const horario = { ...(extra.horario || {}) };
    const filasDeHora = el('div', { class: 'horario-dias' });
    const relojes = new Map();
    const pintarHoras = () => {
      vaciar(filasDeHora);
      const dias = [...borrador.dias].sort();
      for (const dia of dias) {
        if (!relojes.has(dia)) {
          const guardado = horario[dia] || horario[String(dia)] || {};
          const desde = selectorDeHora({ valor: guardado.desde || horaPorDefecto });
          const hasta = selectorDeHora({ valor: guardado.hasta || finPorDefecto, vacio: 'Sin fin' });
          relojes.set(dia, { desde, hasta });
        }
        const reloj = relojes.get(dia);
        filasDeHora.append(el('div', { class: 'horario-dia' }, [
          el('span', { class: 'lio-dia-rotulo', texto: mayusculaInicial(NOMBRES_DIA[dia].slice(0, 3)) }),
          reloj.desde.nodo,
          el('span', { class: 'horario-guion', texto: '–', 'aria-hidden': 'true' }),
          reloj.hasta.nodo,
        ]));
      }
    };

    // Los días de la semana como pastillas: es lo que un «se repite: semanal»
    // no sabe decir.
    const chips = el('div', { class: 'opciones dias-semana' });
    const reparto = el('div', { class: 'lio-dias' });
    const pintarDias = () => {
      vaciar(chips);
      for (let dia = 0; dia < 7; dia += 1) {
        chips.append(el('button', {
          class: 'opcion opcion-dia', type: 'button',
          'aria-pressed': borrador.dias.has(dia) ? 'true' : 'false',
          'aria-label': NOMBRES_DIA[dia],
          onclick: () => {
            if (borrador.dias.has(dia)) borrador.dias.delete(dia); else borrador.dias.add(dia);
            pintarDias();
          },
        }, [INICIALES_DIA[dia]]));
      }
      pintarHoras();
      pintarReparto();
    };

    const casa = opcionesDeCasa(ctx);
    const nombreDe = (quien) => (esOtro(quien) ? nombreDeOtro(quien) : quien ? ctx.vista.nombre(quien) : 'Nadie');
    // Quién lleva y quién recoge: los de casa, «otro» con nombre —la abuela, el
    // autobús— y los últimos otros escritos, de un toque (C4). El toque en una
    // casilla despliega debajo sus opciones en vez de rotar: con nombres libres
    // rotar sería pasar por todos para llegar a escribir.
    let abierta = null; // `${dia}:${clave}` de la casilla desplegada
    const pintarReparto = () => {
      vaciar(reparto);
      const dias = [...borrador.dias].sort();
      if (!dias.length) return;
      reparto.append(el('div', { class: 'lio-dia lio-dia-cabecera' }, [
        el('span'), el('span', { texto: 'Lleva' }), el('span', { texto: 'Recoge' }),
      ]));
      for (const dia of dias) {
        const fila = borrador.reparto[dia] || {};
        const celda = (clave) => {
          const boton = el('button', {
            class: 'lio-dia-turno', type: 'button', 'data-vacio': fila[clave] ? 'no' : 'si',
            'aria-expanded': abierta === `${dia}:${clave}` ? 'true' : 'false',
          }, [
            el('span', { class: 'lio-dia-nombre', texto: nombreDe(fila[clave] || null) }),
          ]);
          boton.onclick = () => {
            abierta = abierta === `${dia}:${clave}` ? null : `${dia}:${clave}`;
            pintarReparto();
          };
          return boton;
        };
        reparto.append(el('div', { class: 'lio-dia' }, [
          el('span', { class: 'lio-dia-rotulo', texto: mayusculaInicial(NOMBRES_DIA[dia].slice(0, 3)) }),
          celda('lleva'), celda('recoge'),
        ]));
        if (abierta && abierta.startsWith(`${dia}:`)) {
          const clave = abierta.split(':')[1];
          const elegir = (quien) => {
            if (esOtro(quien)) recordarOtro(nombreDeOtro(quien));
            borrador.reparto[dia] = { ...fila, [clave]: quien };
            abierta = null;
            pintarReparto();
          };
          const chips = el('div', { class: 'opciones reparto-opciones' });
          for (const quien of casa) {
            chips.append(el('button', {
              class: 'opcion', type: 'button', 'aria-pressed': (fila[clave] || null) === quien ? 'true' : 'false',
              onclick: () => elegir(quien),
            }, [nombreDe(quien)]));
          }
          for (const nombre of otrosRecientes()) {
            chips.append(el('button', {
              class: 'opcion', type: 'button', 'aria-pressed': fila[clave] === comoOtro(nombre) ? 'true' : 'false',
              onclick: () => elegir(comoOtro(nombre)),
            }, [nombre]));
          }
          const texto = entrada({ placeholder: 'Otro: la abuela, el autobús…', 'aria-label': 'Otro, con su nombre' });
          texto.addEventListener('keydown', (evento) => {
            if (evento.key !== 'Enter') return;
            evento.preventDefault();
            if (texto.value.trim()) elegir(comoOtro(texto.value));
          });
          reparto.append(el('div', { class: 'reparto-eligiendo' }, [
            el('p', { class: 'grupo-subtitulo', texto: `${clave === 'lleva' ? 'Lleva' : 'Recoge'} el ${NOMBRES_DIA[dia]}` }),
            chips,
            el('div', { class: 'fila-otro' }, [
              texto,
              el('button', { class: 'boton', type: 'button', onclick: () => { if (texto.value.trim()) elegir(comoOtro(texto.value)); } }, ['Vale']),
            ]),
          ]));
        }
      }
    };
    pintarDias();

    cuerpo.append(
      campo('Qué', titulo, 'Con el emoji delante, si quieres otro que el de un entreno.'),
      campoDeGente(ctx, {
        etiqueta: 'De quién es',
        elegidos: borrador.quien,
        alCambiar: (ids) => { borrador.quien = ids; },
        memoria: 'evento',
        unica: true,
      }),
      el('div', { class: 'campo' }, [el('label', { texto: 'Qué días' }), chips]),
      el('div', { class: 'campo' }, [
        el('label', { texto: 'A qué hora' }),
        filasDeHora,
        el('p', { class: 'pista', texto: 'Cada día a la suya. Empieza y termina; el fin puede quedarse vacío.' }),
      ]),
      campo('Dónde', lugar),
      campo('Desde', desde.nodo, 'El primer día del curso.'),
      campo('Hasta', hasta.nodo, 'El último. Sin fin, la actividad sigue cada semana.'),
      el('div', { class: 'campo' }, [
        el('label', { texto: 'Quién lleva y quién recoge' }),
        reparto,
        el('p', { class: 'pista', texto: 'Toca una casilla para elegir: alguien de casa, u otro con su nombre. Un día suelto se cambia desde la agenda.' }),
      ]),
    );

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!titulo.value.trim()) { avisar('Ponle un nombre'); titulo.focus(); return; }
          if (!borrador.dias.size) { avisar('Elige al menos un día'); return; }
          const dias = [...borrador.dias].sort();
          const horarioNuevo = {};
          for (const dia of dias) {
            const reloj = relojes.get(dia);
            if (!reloj?.desde.valor) { avisar(`Dile a qué hora el ${NOMBRES_DIA[dia]}`); return; }
            horarioNuevo[dia] = {
              desde: reloj.desde.valor,
              hasta: reloj.hasta.valor && reloj.hasta.valor > reloj.desde.valor ? reloj.hasta.valor : null,
            };
          }
          // El inicio es el primer día del curso que caiga en uno de los días
          // elegidos: la repetición arranca ahí y no antes. Su hora es la de
          // ese día, y el fin también: es lo que lee quien no sabe de horarios.
          let primero = parsearMomento(desde.valor);
          for (let i = 0; i < 7 && !dias.includes(indiceDia(primero)); i += 1) primero = sumarDias(primero, 1);
          const delPrimero = horarioNuevo[indiceDia(primero)];
          const inicioIso = `${iso(primero)}T${delPrimero.desde}:00`;
          const finIso = delPrimero.hasta ? `${iso(primero)}T${delPrimero.hasta}:00` : null;
          const reparto = {};
          for (const dia of dias) if (borrador.reparto[dia]) reparto[dia] = borrador.reparto[dia];

          await guardar('evento', existente ? existente.id : nuevoId(), {
            titulo: titulo.value.trim(),
            tipo_id: existente?.tipo_id && !TIPOS_DE_OTROS_PLUGINS.includes(existente.tipo_id) ? existente.tipo_id : 'entreno',
            plugin_id: 'extraescolar',
            inicio: inicioIso,
            fin: finIso,
            jornada_completa: 0,
            ubicacion: lugar.value.trim(),
            notas: existente?.notas || '',
            repeticion: 'semanal',
            repeticion_hasta: hasta.valor || null,
            extra: { ...extra, dias, reparto, horario: horarioNuevo },
            categoria_id: existente?.categoria_id || null,
            origen: 'manual',
            autor_id: existente?.autor_id || ctx.vista.yo.id,
            activo: 1,
            participantes: borrador.quien.map((persona_id) => ({ persona_id, rol: 'protagonista' })),
          });
          recordarElegidos('evento', borrador.quien);
          toque('media');
          cerrarHoja();
          avisar(existente ? 'Actividad guardada' : 'Actividad creada');
          ctx.refrescar();
        },
      }, [existente ? 'Guardar' : 'Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  }, [borrar]);
}

// ------------------------------------------------------------ La escapada --

/**
 * La ficha de una escapada (F1, M2, N2, O2 y la víspera): cuándo y hasta
 * cuándo, si se sale la víspera, quién va, a qué sitio de Sitios se va, y qué
 * pasa con Lío. Es un evento de varios días con `plugin_id = 'finde'`.
 *
 * **Se sale la víspera** es la nota que llegó con la decisión: el finde en la
 * sierra empieza el viernes por la tarde, y para planificarlo hay que verlo
 * también el viernes. Con la casilla puesta el evento arranca el día antes,
 * con la hora si se dice, y la agenda enseña ese día como «salida».
 */
export function abrirFormularioEscapada(ctx, { id = null, fecha = null } = {}) {
  const existente = id ? ctx.vista.evento(id) : null;
  const extra = existente?.extra || {};
  const inicio = existente ? parsearMomento(existente.inicio) : null;
  const casa = ctx.vista.personasDe('familia');
  const lugares = lugaresDe(ctx.vista.datos);

  const primerDia = existente
    ? (extra.primer_dia || iso(inicio))
    : iso(fecha ? proximoSabado(fecha) : proximoSabado(hoy()));

  const borrador = {
    quien: existente ? ctx.vista.participantes(existente) : casa.map((p) => p.id),
    lio: extra.lio || null,
    lioCon: extra.lio_con ? [extra.lio_con] : [],
  };

  const borrar = existente ? botonIcono('borrar', {
    etiqueta: 'Borrar la escapada', tono: 'peligro',
    onclick: async () => {
      await deshacerLioDeEscapada(ctx, existente);
      await retirar('evento', existente.id);
      toque('media');
      cerrarHoja();
      avisar('Escapada borrada');
      ctx.refrescar();
    },
  }) : null;

  abrirHoja(existente ? 'Editar la escapada' : 'Nueva escapada', (cuerpo) => {
    const sitio = el('select', { 'aria-label': 'Sitio' }, [
      el('option', { value: '' }, ['Sin sitio de Sitios']),
      ...lugares.map((lugar) => el('option', { value: lugar.id, selected: extra.lugar_id === lugar.id }, [nombreDeLugar(lugar)])),
    ]);
    const titulo = entrada({ value: existente?.titulo || '', placeholder: '🏔️ La sierra' });
    sitio.addEventListener('change', () => {
      const lugar = lugares.find((l) => l.id === sitio.value);
      if (lugar && !titulo.value.trim()) titulo.value = nombreDeLugar(lugar);
    });
    if (!existente) enfocarAlAbrir(titulo);

    const desde = selectorDeFecha({ valor: primerDia });
    const hasta = selectorDeFecha({
      valor: existente?.fin ? iso(parsearMomento(existente.fin)) : iso(sumarDias(parsearMomento(primerDia), 1)),
      min: primerDia,
    });
    desde.nodo.addEventListener('click', () => { hasta.min = desde.valor; if (hasta.valor && hasta.valor < desde.valor) hasta.valor = desde.valor; });

    const vispera = el('input', { type: 'checkbox' });
    vispera.checked = Boolean(extra.vispera);
    const horaSalida = selectorDeHora({
      valor: existente && !existente.jornada_completa ? `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}` : '',
      vacio: 'Sin hora',
    });
    const filaHora = el('div', { class: 'campo', hidden: !vispera.checked }, [
      el('label', { texto: 'A qué hora salimos' }), horaSalida.nodo,
      el('p', { class: 'pista', texto: 'Puede quedarse vacía.' }),
    ]);
    vispera.addEventListener('change', () => { filaHora.hidden = !vispera.checked; });

    const conQuien = campoDeGente(ctx, {
      etiqueta: 'Con quién se queda',
      elegidos: borrador.lioCon,
      alCambiar: (ids) => { borrador.lioCon = ids; },
      memoria: 'evento',
      unica: true,
    });
    conQuien.hidden = borrador.lio !== 'se_queda';
    const lio = segmentado(
      [[null, 'Sin decidir'], ['viene', 'Viene'], ['se_queda', 'Se queda']],
      borrador.lio,
      (valor) => { borrador.lio = valor; conQuien.hidden = valor !== 'se_queda'; },
    );

    cuerpo.append(
      campo('Adónde', titulo, 'Con el emoji delante, como el nombre de un sitio.'),
      lugares.length ? campo('Sitio de Sitios', sitio, 'Enlazado, la víspera Hoy dice cuánto queda por meter de su lista de Llevar.') : null,
      campo('Cuándo', desde.nodo, 'El primer día allí.'),
      campo('Hasta', hasta.nodo),
      el('label', { class: 'conmutador' }, [vispera, 'Salimos la víspera']),
      filaHora,
      campoDeGente(ctx, {
        etiqueta: 'Quién va',
        elegidos: borrador.quien,
        alCambiar: (ids) => { borrador.quien = ids; },
        memoria: 'evento',
      }),
    );
    if (hayLio(ctx.vista.datos) && deCasa(ctx)) {
      cuerpo.append(
        campo('🐾 Lío', lio, 'Si se queda, sus turnos de esos días pasan a quien se quede con él, o a nadie.'),
        conQuien,
      );
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => {
          if (!titulo.value.trim()) { avisar('Dile adónde'); titulo.focus(); return; }
          if (!desde.valor) { avisar('Falta el día'); return; }
          const primero = desde.valor;
          const ultimo = hasta.valor && hasta.valor >= primero ? hasta.valor : primero;
          const diaDeSalida = vispera.checked ? iso(sumarDias(parsearMomento(primero), -1)) : primero;
          const conHora = vispera.checked && horaSalida.valor;
          const nuevoExtra = {
            ...extra,
            lugar_id: sitio.value || null,
            primer_dia: primero,
            vispera: vispera.checked,
            lio: borrador.lio,
            lio_con: borrador.lio === 'se_queda' ? (borrador.lioCon[0] || null) : null,
          };
          const eventoId = existente ? existente.id : nuevoId();
          const campos = {
            titulo: titulo.value.trim(),
            tipo_id: 'viaje',
            plugin_id: 'finde',
            inicio: conHora ? `${diaDeSalida}T${horaSalida.valor}:00` : diaDeSalida,
            fin: ultimo > diaDeSalida ? (conHora ? `${ultimo}T${horaSalida.valor}:00` : ultimo) : null,
            jornada_completa: conHora ? 0 : 1,
            ubicacion: existente?.ubicacion || '',
            notas: existente?.notas || '',
            repeticion: 'ninguna',
            extra: nuevoExtra,
            categoria_id: existente?.categoria_id || null,
            origen: 'manual',
            autor_id: existente?.autor_id || ctx.vista.yo.id,
            activo: 1,
            participantes: borrador.quien.map((persona_id) => ({ persona_id, rol: 'asistente' })),
          };
          await guardar('evento', eventoId, campos);
          await aplicarLioDeEscapada(ctx, { id: eventoId, ...campos, participantes: campos.participantes });
          recordarElegidos('evento', borrador.quien);
          toque('media');
          cerrarHoja();
          avisar(existente ? 'Escapada guardada' : 'Escapada creada');
          ctx.refrescar();
        },
      }, [existente ? 'Guardar' : 'Crear']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  }, [borrar]);
}

/** El sábado que viene, o ese mismo día si ya es sábado: es lo que se propone
 *  al crear un finde desde un día cualquiera. */
function proximoSabado(fecha) {
  const dia = soloFecha(fecha);
  const faltan = (5 - indiceDia(dia) + 7) % 7;
  return sumarDias(dia, faltan);
}

/**
 * Lo que una escapada le hace a Lío: «se queda con Ana» es una ausencia de
 * cada uno de los que van, esos días, con Ana cubriendo —o nadie—; «viene» no
 * cambia nada, porque quien saque al perro en la sierra lo marca igual.
 *
 * Las ausencias que escribe se apuntan en `extra.ausencias` para poder
 * deshacerlas al cambiar de idea o al borrar la escapada.
 */
export async function aplicarLioDeEscapada(ctx, evento) {
  const extra = evento.extra || {};
  await deshacerLioDeEscapada(ctx, evento);
  if (extra.lio !== 'se_queda') return;

  const casa = new Set(ctx.vista.personasDe('familia').map((p) => p.id));
  const van = (evento.participantes || []).map((p) => p.persona_id || p).filter((id) => casa.has(id) && id !== extra.lio_con);
  const desde = extra.primer_dia || iso(parsearMomento(evento.inicio));
  const hasta = evento.fin ? iso(parsearMomento(evento.fin)) : desde;
  const ausencias = [];
  for (const personaId of van) {
    const id = nuevoId();
    ausencias.push(id);
    await guardar('ausencia', id, {
      persona_id: personaId,
      desde: iso(parsearMomento(evento.inicio)) < desde ? iso(parsearMomento(evento.inicio)) : desde,
      hasta,
      cubre_id: extra.lio_con || null,
      motivo: ctx.vista.caraDe(evento).titulo,
      autor_id: ctx.vista.yo.id,
      activo: 1,
    });
  }
  await guardar('evento', evento.id, { extra: { ...extra, ausencias } });
}

async function deshacerLioDeEscapada(ctx, evento) {
  const previas = evento.extra?.ausencias || [];
  for (const id of previas) await retirar('ausencia', id);
}
