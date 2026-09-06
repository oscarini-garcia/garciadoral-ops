/**
 * El aviso previo desde el servidor: «Mañana: 🐴 Hípica · 18:00».
 *
 * Es la otra mitad del mando común de «avisar» de cada plugin
 * (`specs/propuesta-plugins-agenda.html`, D4). El dispositivo programa sus
 * recordatorios locales con lo que ya tiene, y eso funciona sin red; pero un
 * teléfono que lleva días sin abrir la aplicación se queda con la agenda de
 * entonces, y lo que se apuntó después no le suena. Un cron del Worker compone
 * cada mañana lo que toca avisar a cada aparato y lo empuja por APNs.
 *
 * **La antelación es del aparato**, como decidió la D4, y por eso viaja con el
 * token en el alta de los avisos —`dispositivo.avisos`— y no por la cola de
 * cambios. La de los cumpleaños es de la casa, por círculo de quien cumple, y
 * está en `plugins.cumples.aviso`. Los mismos valores y los mismos defectos que
 * `pwa/publico/js/plugins.js`: son dos listas que tienen que decir lo mismo.
 *
 * **La visibilidad se aplica componiendo la instantánea de cada persona**, como
 * en `avisos.js`: lo que no le llegaría al teléfono tampoco se le avisa. Y con
 * el aparato en modo remoto, el dispositivo deja de programar los suyos —salvo
 * el turno de Lío, que sigue siendo local—, para que no suenen dos.
 */

import { enviarAviso, hayApnsConfigurado } from './apns.js';
import { componerInstantanea } from './filtrado.js';
import { circuloAdmite, circuloDe, pluginDeEvento } from './plugins.js';
import { olvidarToken } from './avisos.js';

/** Los mismos cuatro valores que ofrece la hoja de cada plugin. */
const ANTELACION_EN_DIAS = { nunca: null, dia: 0, vispera: 1, semana: 7 };
const AVISO_POR_DEFECTO = { viajes: 'vispera', puntuales: 'vispera', extraescolares: 'nunca', finde: 'vispera' };
const AVISO_CUMPLES_POR_DEFECTO = { familia: 7, extendida: 1, amigos: 0 };

/** Hasta cuántos días adelante se mira: la antelación más larga que se ofrece. */
const HORIZONTE_DIAS = 7;
/** Y cuántos avisos como mucho por aparato y mañana: más es una pantalla de
 *  bloqueo que no se lee. */
const TECHO_POR_APARATO = 6;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// ------------------------------------------------------------- Fechas --

const aFecha = (iso) => {
  const [anno, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(anno, mes - 1, dia));
};
const aIso = (fecha) => fecha.toISOString().slice(0, 10);
const sumarDias = (iso, dias) => aIso(new Date(aFecha(iso).getTime() + dias * 86400000));
const diaDeSemana = (iso) => (aFecha(iso).getUTCDay() + 6) % 7; // lunes en 0
const horaDe = (evento) => (evento.jornada_completa ? null : String(evento.inicio || '').slice(11, 16) || null);
const ultimoDia = (anno, mes) => new Date(Date.UTC(anno, mes, 0)).getUTCDate();

/**
 * Los días entre `desde` y `hasta` en que arranca una aparición del evento.
 * Solo el primer día de lo que dura varios: el aviso previo es de que empieza.
 * Es la expansión de `pwa/publico/js/semana.js` reducida a fechas.
 */
export function arranquesEntre(evento, desde, hasta) {
  const inicio = String(evento.inicio || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return [];
  const tope = evento.repeticion_hasta ? String(evento.repeticion_hasta).slice(0, 10) : null;
  const vale = (dia) => dia >= inicio && dia >= desde && dia <= hasta && (!tope || dia <= tope);
  const repeticion = evento.repeticion || 'ninguna';
  const salida = [];

  if (repeticion === 'ninguna') {
    if (vale(inicio)) salida.push(inicio);
  } else if (repeticion === 'semanal') {
    const dias = Array.isArray(evento.extra?.dias) && evento.extra.dias.length
      ? evento.extra.dias.map(Number).filter((d) => d >= 0 && d <= 6)
      : [diaDeSemana(inicio)];
    for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
      if (dias.includes(diaDeSemana(dia)) && vale(dia)) salida.push(dia);
    }
  } else if (repeticion === 'mensual') {
    const [, , diaMes] = inicio.split('-').map(Number);
    for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
      const [anno, mes, d] = dia.split('-').map(Number);
      if (d === Math.min(diaMes, ultimoDia(anno, mes)) && vale(dia)) salida.push(dia);
    }
  } else if (repeticion === 'anual') {
    const [, mes, diaMes] = inicio.split('-').map(Number);
    for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
      const [anno, m, d] = dia.split('-').map(Number);
      // El 29 de febrero se traslada al 1 de marzo, como en el resto de sitios.
      const cae = (m === mes && d === diaMes) || (mes === 2 && diaMes === 29 && m === 3 && d === 1 && ultimoDia(anno, 2) === 28);
      if (cae && vale(dia)) salida.push(dia);
    }
  }
  return salida;
}

// ------------------------------------------------------------ Componer --

/** Lo derivado de las fichas, como lo deriva el dispositivo: cumpleaños y
 *  santos de quien esté a la vista de esta persona, según el círculo del plugin. */
function derivadosDe(instantanea) {
  const plugins = instantanea.plugins || {};
  const yo = instantanea.yo || {};
  if (!circuloAdmite(circuloDe(plugins, 'cumples'), yo.circulo)) return [];
  const conSantos = plugins.cumples?.santos !== false;
  const salida = [];
  for (const persona of instantanea.personas || []) {
    if (persona.activa === 0 || persona.activa === false) continue;
    if (persona.fecha_nacimiento) {
      salida.push({
        id: `derivado:cumpleanos:${persona.id}`, titulo: `Cumpleaños de ${persona.nombre}`, emoji: '🎂',
        inicio: persona.fecha_nacimiento, jornada_completa: true, repeticion: 'anual', persona_origen_id: persona.id,
      });
    }
    if (conSantos && /^\d{2}-\d{2}$/.test(persona.santo || '')) {
      salida.push({
        id: `derivado:santo:${persona.id}`, titulo: `Santo de ${persona.nombre}`, emoji: '✨',
        inicio: `1900-${persona.santo}`, jornada_completa: true, repeticion: 'anual', persona_origen_id: persona.id,
      });
    }
  }
  return salida;
}

/** Con cuántos días se avisa de un evento a este aparato, o `null`. */
export function antelacionDe(instantanea, avisosDelAparato, evento) {
  const plugin = pluginDeEvento(evento);
  if (plugin === 'lio') return null;
  if (plugin === 'cumples') {
    const persona = (instantanea.personas || []).find((p) => p.id === evento.persona_origen_id);
    const escrito = instantanea.plugins?.cumples?.aviso || {};
    const dias = { ...AVISO_CUMPLES_POR_DEFECTO, ...escrito }[persona?.circulo || 'extendida'];
    return Number.isInteger(dias) ? dias : null;
  }
  const valor = avisosDelAparato?.[plugin] || AVISO_POR_DEFECTO[plugin] || 'vispera';
  return valor in ANTELACION_EN_DIAS ? ANTELACION_EN_DIAS[valor] : 1;
}

function cuandoEs(evento, fecha, antelacion) {
  const hora = horaDe(evento);
  if (antelacion === 0) return hora ? `Hoy a las ${hora}` : 'Hoy';
  const dia = aFecha(fecha);
  if (antelacion === 1) return hora ? `Mañana a las ${hora}` : 'Mañana';
  return `El ${DIAS[dia.getUTCDay()]} ${dia.getUTCDate()}, dentro de ${antelacion} días${hora ? `, a las ${hora}` : ''}`;
}

function caraDe(instantanea, evento) {
  const titulo = String(evento.titulo || '').trim();
  if (/^\p{Extended_Pictographic}/u.test(titulo)) return titulo;
  const tipo = (instantanea.tipos_evento || []).find((t) => t.id === evento.tipo_id);
  return `${evento.emoji || tipo?.emoji || '📌'} ${titulo}`.trim();
}

/** El `avisos` de un aparato, que llega como texto JSON o como nada. */
export function avisosDelAparato(bruto) {
  if (!bruto) return {};
  try {
    const valor = typeof bruto === 'string' ? JSON.parse(bruto) : bruto;
    return valor && typeof valor === 'object' ? valor : {};
  } catch {
    return {};
  }
}

/**
 * Los avisos de una mañana para un aparato. Sin efectos: se le da el registro,
 * el aparato —persona y antelaciones— y qué día es, y devuelve la lista.
 */
export function recordatoriosDe(registro, aparato, hoy) {
  const persona = (registro.personas || []).find((p) => p.id === aparato.persona_id);
  if (!persona || !persona.tiene_cuenta) return [];
  const instantanea = componerInstantanea(registro, persona);
  const avisos = avisosDelAparato(aparato.avisos);
  const hasta = sumarDias(hoy, HORIZONTE_DIAS);
  const cancelados = new Set((instantanea.dias_evento || [])
    .filter((d) => d.cancelado && d.activo !== 0 && d.activo !== false)
    .map((d) => `${d.evento_id}:${d.fecha}`));

  const salida = [];
  const eventos = [
    ...(instantanea.eventos || []).filter((e) => e.activo !== 0 && e.activo !== false),
    ...derivadosDe(instantanea),
  ];
  for (const evento of eventos) {
    const antelacion = antelacionDe(instantanea, avisos, evento);
    if (antelacion === null) continue;
    const objetivo = sumarDias(hoy, antelacion);
    for (const fecha of arranquesEntre(evento, objetivo, objetivo)) {
      if (cancelados.has(`${evento.id}:${fecha}`)) continue;
      salida.push({
        para: persona.id,
        titulo: caraDe(instantanea, evento),
        cuerpo: evento.ubicacion ? `${cuandoEs(evento, fecha, antelacion)} · ${evento.ubicacion}` : cuandoEs(evento, fecha, antelacion),
        agrupa: `recordatorio:${evento.id}:${fecha}`,
        urgente: false,
        datos: { tipo: 'recordatorio', evento: evento.id, fecha },
      });
    }
  }
  salida.sort((a, b) => a.datos.fecha.localeCompare(b.datos.fecha) || a.titulo.localeCompare(b.titulo));
  return salida.slice(0, TECHO_POR_APARATO);
}

// -------------------------------------------------------------- Empujar --

/**
 * El cron de las mañanas. Lee los aparatos con token, compone lo suyo a cada
 * uno y lo empuja. Nunca lanza: lo que falle se anota y se sigue con el
 * siguiente, porque un aparato con el token caducado no puede dejar sin aviso
 * a los demás.
 */
export async function empujarRecordatorios(env, { hoy, leerRegistro, enviar = enviarAviso } = {}) {
  if (!hayApnsConfigurado(env)) return { enviados: 0, motivo: 'sin-configurar' };

  let aparatos = [];
  try {
    const { results } = await env.DB
      .prepare('SELECT id, persona_id, token_push, avisos FROM dispositivo WHERE token_push IS NOT NULL')
      .all();
    aparatos = results || [];
  } catch (error) {
    // Sin la columna todavía —la ventana entre desplegar y migrar— no hay a
    // quién avisar, y no pasa nada por esperar a mañana.
    return { enviados: 0, motivo: String(error?.message || error) };
  }
  if (!aparatos.length) return { enviados: 0 };

  const registro = await leerRegistro(env.DB);
  const fecha = hoy || new Date().toISOString().slice(0, 10);
  let enviados = 0;
  for (const aparato of aparatos) {
    for (const aviso of recordatoriosDe(registro, aparato, fecha)) {
      const resultado = await enviar(env, aparato.token_push, aviso);
      if (resultado.ok) enviados += 1;
      else if (resultado.caducado) await olvidarToken(env.DB, aparato.id);
    }
  }
  return { enviados, aparatos: aparatos.length };
}
