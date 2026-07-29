/**
 * Parser de iCalendar (RFC 5545), reducido a lo que un calendario de viajes
 * necesita (`specs/calendario-viajes.md` §4).
 *
 * No usa dependencias: el Worker no las tiene, y un `.ics` de Google es
 * regular. Se traduce cada `VEVENT` a la forma con la que el modelo guarda un
 * evento —`inicio`/`fin` como marcas locales ingenuas, jornada completa como
 * fecha de diez caracteres— y se dejan fuera tres cosas por decisión de la
 * spec: la recurrencia (se importa solo la primera aparición, §5.5), las
 * instancias de una serie (`RECURRENCE-ID`) y todo lo que no sea contenido.
 */

/** La zona en la que vive la casa. Las marcas absolutas (`...Z`) se convierten a
 *  su hora de pared; una fecha sin hora es flotante y no se toca. */
export const ZONA = 'Europe/Madrid';

/** Deshace el plegado de líneas: una línea que empieza por espacio o tabulador
 *  continúa la anterior (RFC 5545 §3.1). Se normaliza CRLF y CR a LF antes. */
function desplegar(texto) {
  return texto.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '');
}

/** Devuelve el valor de una propiedad TEXT con los escapes deshechos. */
function desescapar(valor) {
  return valor
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/** Parte una línea de contenido en nombre, parámetros y valor.
 *  `DTSTART;VALUE=DATE:20260710` → { nombre: 'DTSTART', params: {VALUE:'DATE'}, valor: '20260710' } */
function partirLinea(linea) {
  const dosPuntos = linea.indexOf(':');
  if (dosPuntos === -1) return null;
  const izquierda = linea.slice(0, dosPuntos);
  const valor = linea.slice(dosPuntos + 1);
  const [nombre, ...trozos] = izquierda.split(';');
  const params = {};
  for (const trozo of trozos) {
    const igual = trozo.indexOf('=');
    if (igual !== -1) params[trozo.slice(0, igual).toUpperCase()] = trozo.slice(igual + 1);
  }
  return { nombre: nombre.toUpperCase(), params, valor };
}

const dosCifras = (n) => String(n).padStart(2, '0');

/** Una marca UTC (`...Z`) llevada a la hora de pared de `zona`, como
 *  `YYYY-MM-DDTHH:MM:SS`. Sin librerías: se compone la fecha y se lee en la zona. */
function utcAZona(y, mes, d, h, min, s, zona) {
  const instante = new Date(Date.UTC(y, mes - 1, d, h, min, s));
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(instante);
  const g = (tipo) => partes.find((p) => p.type === tipo).value;
  const hora = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}-${g('month')}-${g('day')}T${hora}:${g('minute')}:${g('second')}`;
}

/** Interpreta un valor de fecha u hora de iCalendar.
 *  Devuelve { fecha } para una fecha sin hora, o { marca } para una con hora. */
function interpretarMomento(valor, params, zona) {
  const soloFecha = params.VALUE === 'DATE' || /^\d{8}$/.test(valor);
  if (soloFecha) {
    const m = valor.match(/^(\d{4})(\d{2})(\d{2})/);
    return { fecha: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mes, d, h, min, s, z] = m;
  if (z === 'Z') {
    return { marca: utcAZona(+y, +mes, +d, +h, +min, +s, zona) };
  }
  // Con TZID o flotante se toma la hora de pared tal cual: es como la lee quien
  // mira su propio calendario. La conversión exacta desde un TZID ajeno a la
  // casa queda como limitación conocida (§4, «Zonas horarias»).
  return { marca: `${y}-${mes}-${d}T${h}:${min}:${s}` };
}

/** Resta un día a una fecha `YYYY-MM-DD`. El fin de un evento de jornada
 *  completa es exclusivo en iCalendar, y aquí se guarda inclusivo (§7). */
function diaAnterior(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return `${t.getUTCFullYear()}-${dosCifras(t.getUTCMonth() + 1)}-${dosCifras(t.getUTCDate())}`;
}

/** Traduce un bloque `VEVENT` ya desplegado a un evento, o `null` si debe
 *  descartarse (sin UID, o instancia de una serie recurrente). */
function traducirEvento(lineas, zona) {
  const prop = {};
  for (const linea of lineas) {
    const p = partirLinea(linea);
    if (p) prop[p.nombre] = p;
  }

  // Una instancia concreta de una serie no se importa: la recurrencia se ignora
  // y solo se toma la primera aparición, de modo que estas sobran (§5.5).
  if (prop['RECURRENCE-ID']) return null;
  const uid = prop.UID?.valor?.trim();
  if (!uid) return null;

  const inicioMomento = prop.DTSTART ? interpretarMomento(prop.DTSTART.valor, prop.DTSTART.params, zona) : null;
  if (!inicioMomento) return null;
  const jornadaCompleta = 'fecha' in inicioMomento;

  let inicio;
  let fin = null;
  if (jornadaCompleta) {
    inicio = inicioMomento.fecha;
    if (prop.DTEND) {
      const finMomento = interpretarMomento(prop.DTEND.valor, prop.DTEND.params, zona);
      const inclusivo = finMomento?.fecha ? diaAnterior(finMomento.fecha) : inicio;
      fin = inclusivo > inicio ? inclusivo : null;
    }
  } else {
    inicio = inicioMomento.marca;
    if (prop.DTEND) {
      const finMomento = interpretarMomento(prop.DTEND.valor, prop.DTEND.params, zona);
      const marca = finMomento?.marca ?? null;
      fin = marca && marca > inicio ? marca : null;
    }
  }

  return {
    uid,
    titulo: prop.SUMMARY ? desescapar(prop.SUMMARY.valor).trim() : '',
    inicio,
    fin,
    jornadaCompleta,
    ubicacion: prop.LOCATION ? desescapar(prop.LOCATION.valor).trim() : '',
    notas: prop.DESCRIPTION ? desescapar(prop.DESCRIPTION.valor).trim() : '',
    cancelado: (prop.STATUS?.valor || '').toUpperCase() === 'CANCELLED',
  };
}

/**
 * Traduce un documento iCalendar a una lista de eventos.
 *
 * @param {string} texto  El `.ics` completo.
 * @param {string} [zona] Zona de la casa para convertir marcas UTC.
 * @returns {Array<{uid,titulo,inicio,fin,jornadaCompleta,ubicacion,notas,cancelado}>}
 */
export function parsearICal(texto, zona = ZONA) {
  const lineas = desplegar(String(texto || '')).split('\n');
  const eventos = [];
  let bloque = null;
  for (const linea of lineas) {
    const recortada = linea.trim();
    if (recortada === 'BEGIN:VEVENT') {
      bloque = [];
    } else if (recortada === 'END:VEVENT') {
      if (bloque) {
        const evento = traducirEvento(bloque, zona);
        if (evento) eventos.push(evento);
      }
      bloque = null;
    } else if (bloque) {
      bloque.push(linea);
    }
  }
  return eventos;
}
