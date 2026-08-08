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

/** Un instante llevado a la hora de pared de `zona`, como `YYYY-MM-DDTHH:MM:SS`.
 *  Sin librerías: se lee el instante en la zona y se recompone la cadena. */
function aZona(instante, zona) {
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

/**
 * Una hora de pared de `zona` llevada al instante que le corresponde.
 *
 * Es la operación inversa de `aZona` y no tiene inversa cerrada: hay que
 * buscarla. Se parte de la hora tratada como si fuera UTC y se corrige con el
 * desfase que la zona tiene **en ese instante**; la segunda pasada existe
 * porque el desfase pudo cambiar entre la aproximación y el resultado, que es
 * justo lo que ocurre las dos madrugadas del año en que se cambia la hora.
 *
 * Devuelve `null` si la zona no la reconoce el motor —un `TZID` de Windows como
 * «Romance Standard Time», o uno inventado—, y entonces el llamante se queda con
 * la hora de pared tal cual: preferible a tirar el evento entero.
 */
function deZonaAInstante(y, mes, d, h, min, s, zona) {
  const ingenuo = Date.UTC(y, mes - 1, d, h, min, s);
  try {
    let instante = ingenuo;
    for (let vuelta = 0; vuelta < 2; vuelta += 1) {
      const leido = Date.parse(`${aZona(new Date(instante), zona)}Z`);
      instante = ingenuo - (leido - instante);
    }
    return new Date(instante);
  } catch {
    return null;
  }
}

/** El `TZID` tal y como se puede usar en `Intl`: sin las comillas que RFC 5545
 *  permite alrededor del valor de un parámetro. */
function nombreDeZona(tzid) {
  return String(tzid || '').replace(/^"|"$/g, '').trim();
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
    return { marca: aZona(new Date(Date.UTC(+y, +mes - 1, +d, +h, +min, +s)), zona) };
  }

  // Con `TZID` se convierte a la hora de pared de la casa, que es lo que pide
  // la spec (§4, «Zonas horarias»): la conversión va en la importación y no en
  // la presentación, «para que la fecha con la que un evento se sitúa en la
  // semana sea inequívoca».
  //
  // No es un detalle de minutos: un vuelo que sale de Nueva York a las 18:40 se
  // guardaba con esa cifra, y en Madrid ese instante son las 00:40 del día
  // siguiente. El evento aparecía **un día antes del que le toca**, y si ese día
  // era domingo, en la semana anterior. Es lo que hacía que un viaje «no
  // apareciera» donde se le buscaba.
  //
  // Si la zona no se reconoce se cae a la hora de pared, que es lo que había.
  if (params.TZID) {
    const instante = deZonaAInstante(+y, +mes, +d, +h, +min, +s, nombreDeZona(params.TZID));
    if (instante) return { marca: aZona(instante, zona) };
  }

  // Sin zona es una hora flotante: se toma tal cual, que es como la lee quien
  // mira su propio calendario, y es lo que manda la norma para este caso.
  return { marca: `${y}-${mes}-${d}T${h}:${min}:${s}` };
}

/** Resta un día a una fecha `YYYY-MM-DD`. El fin de un evento de jornada
 *  completa es exclusivo en iCalendar, y aquí se guarda inclusivo (§7). */
function diaAnterior(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return `${t.getUTCFullYear()}-${dosCifras(t.getUTCMonth() + 1)}-${dosCifras(t.getUTCDate())}`;
}

/**
 * Traduce un bloque `VEVENT` ya desplegado.
 *
 * Devuelve `{ evento }` o `{ motivo, uid }` con la razón por la que se descarta.
 * El motivo no es adorno: un evento que se cae en silencio se ve desde la agenda
 * exactamente igual que uno que nunca existió, y no había manera de distinguir
 * «el feed no lo trae» de «el feed lo trae y no lo entendí».
 */
function traducirEvento(lineas, zona) {
  const prop = {};

  // Solo las propiedades del propio VEVENT. Un evento puede llevar dentro sus
  // recordatorios —`BEGIN:VALARM`…`END:VALARM`— y esos traen `SUMMARY` y
  // `DESCRIPTION` propios: sin saltárselos, el vuelo se importaba titulado
  // «Recordatorio» y con el texto de la alarma por notas. No desaparecía, que es
  // lo que parecía desde la agenda; llegaba con otro nombre, y por eso no se
  // reconocía ni lo pillaba `presentarVuelo`.
  //
  // Se cuenta la profundidad en vez de mirar solo VALARM: lo mismo valdría para
  // cualquier componente anidado que un cliente decida meter ahí.
  let dentro = 0;
  for (const linea of lineas) {
    const recortada = linea.trim();
    if (/^BEGIN:/i.test(recortada)) { dentro += 1; continue; }
    if (/^END:/i.test(recortada)) { dentro -= 1; continue; }
    if (dentro > 0) continue;

    const p = partirLinea(linea);
    if (p) prop[p.nombre] = p;
  }

  // Una instancia concreta de una serie no se importa: la recurrencia se ignora
  // y solo se toma la primera aparición, de modo que estas sobran (§5.5).
  const uid = prop.UID?.valor?.trim() || null;
  if (prop['RECURRENCE-ID']) return { motivo: 'instancia de una serie', uid };
  if (!uid) return { motivo: 'sin UID', uid: null };

  if (!prop.DTSTART) return { motivo: 'sin DTSTART', uid };
  const inicioMomento = interpretarMomento(prop.DTSTART.valor, prop.DTSTART.params, zona);
  if (!inicioMomento) return { motivo: `DTSTART ilegible: ${prop.DTSTART.valor}`, uid };
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

  return { evento: {
    uid,
    titulo: prop.SUMMARY ? desescapar(prop.SUMMARY.valor).trim() : '',
    inicio,
    fin,
    jornadaCompleta,
    ubicacion: prop.LOCATION ? desescapar(prop.LOCATION.valor).trim() : '',
    notas: prop.DESCRIPTION ? desescapar(prop.DESCRIPTION.valor).trim() : '',
    cancelado: (prop.STATUS?.valor || '').toUpperCase() === 'CANCELLED',
  } };
}

/**
 * Traduce un documento iCalendar a una lista de eventos.
 *
 * @param {string} texto  El `.ics` completo.
 * @param {string} [zona] Zona de la casa para convertir marcas UTC.
 * @returns {Array<{uid,titulo,inicio,fin,jornadaCompleta,ubicacion,notas,cancelado}>}
 */
export function inspeccionarICal(texto, zona = ZONA) {
  const lineas = desplegar(String(texto || '')).split('\n');
  const eventos = [];
  const ignorados = [];
  let vistos = 0;
  let bloque = null;
  let profundidad = 0;

  for (const linea of lineas) {
    const recortada = linea.trim();

    // El VEVENT se abre en el nivel de fuera. Lo que se abra dentro —un VALARM—
    // es del bloque y va con él: se cuenta la profundidad para no cerrar el
    // evento con el `END` de su alarma.
    if (bloque === null && recortada === 'BEGIN:VEVENT') {
      bloque = [];
      profundidad = 0;
      vistos += 1;
      continue;
    }
    if (bloque === null) continue;

    if (/^BEGIN:/i.test(recortada)) profundidad += 1;
    if (/^END:/i.test(recortada) && profundidad === 0) {
      const { evento, motivo, uid } = traducirEvento(bloque, zona);
      if (evento) eventos.push(evento);
      else ignorados.push({ uid, motivo });
      bloque = null;
      continue;
    }
    if (/^END:/i.test(recortada)) profundidad -= 1;
    bloque.push(linea);
  }

  return { vistos, eventos, ignorados };
}

/** Los eventos y nada más, que es lo que necesita quien no está diagnosticando. */
export function parsearICal(texto, zona = ZONA) {
  return inspeccionarICal(texto, zona).eventos;
}
