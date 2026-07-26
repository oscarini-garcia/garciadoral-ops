/**
 * La semana como marco fijo de siete días.
 *
 * Espejo de `scripts/agenda/semana.py`. La semana es la unidad real de la vida
 * familiar y por eso abre la aplicación: al ser un marco fijo se aprende dónde
 * cae cada día y la lectura se vuelve casi automática (specs/ux.md §8).
 *
 * Las marcas temporales del registro son locales e ingenuas —«2026-07-28» o
 * «2026-07-28T18:00:00»—, de modo que se interpretan en la zona del dispositivo
 * y nunca a través de `new Date(cadena)`, que trataría las fechas sueltas como
 * UTC y desplazaría medio calendario.
 */

import { estaActivo } from './modelo.js';

export const INICIALES_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
// Los meses van con mayúscula inicial: en la aplicación no aparecen dentro de
// una frase sino como rótulo —«20 – 26 de Julio de 2026», «Julio de 2026»—, y
// ahí la mayúscula los separa del resto de la línea de un vistazo.
export const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const TECHO_EVENTOS_DIA = 3;

/** Índice de día con el lunes en 0, como en el resto del sistema. */
export const indiceDia = (fecha) => (fecha.getDay() + 6) % 7;

export function parsearMomento(texto) {
  if (!texto) return null;
  const [fecha, hora = ''] = String(texto).split('T');
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return new Date(anio, (mes || 1) - 1, dia || 1, h || 0, m || 0);
}

export const soloFecha = (momento) => new Date(momento.getFullYear(), momento.getMonth(), momento.getDate());

export function iso(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

export function isoConHora(fecha) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${iso(fecha)}T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:00`;
}

export const sumarDias = (fecha, dias) => {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
};

export const hoy = () => soloFecha(new Date());

/** Lunes de la semana que contiene `fecha`. */
export function lunesDe(fecha) {
  return sumarDias(soloFecha(fecha), -indiceDia(fecha));
}

export function diasDeLaSemana(lunes) {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/**
 * Rango de la semana, con el mes escrito entero y el año.
 *
 * El mes va con su nombre completo y no abreviado: «20 – 26 de julio de 2026»
 * se lee de un vistazo, mientras que «jul» hay que descifrarlo. Y el año
 * importa, porque sin él el rótulo no dice de cuándo se está hablando en cuanto
 * uno se aleja unos meses del presente; se escribe una sola vez salvo que la
 * semana cambie de año, que es el único caso en que hacen falta los dos.
 */
export function formatearRango(lunes) {
  const domingo = sumarDias(lunes, 6);
  const mes = (fecha) => MESES_LARGOS[fecha.getMonth()];
  if (lunes.getFullYear() !== domingo.getFullYear()) {
    return `${lunes.getDate()} de ${mes(lunes)} de ${lunes.getFullYear()}`
      + ` – ${domingo.getDate()} de ${mes(domingo)} de ${domingo.getFullYear()}`;
  }
  if (lunes.getMonth() === domingo.getMonth()) {
    return `${lunes.getDate()} – ${domingo.getDate()} de ${mes(domingo)} de ${domingo.getFullYear()}`;
  }
  return `${lunes.getDate()} de ${mes(lunes)} – ${domingo.getDate()} de ${mes(domingo)} de ${domingo.getFullYear()}`;
}

export function formatearHora(momento) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(momento.getHours())}:${dos(momento.getMinutes())}`;
}

export function formatearFechaLarga(fecha) {
  return `${NOMBRES_DIA[indiceDia(fecha)]} ${fecha.getDate()} de ${MESES_LARGOS[fecha.getMonth()]}`;
}

// ------------------------------------------------------- Eventos derivados --

/**
 * Cumpleaños generados a partir de las fechas de nacimiento, para todas las
 * personas del registro, tengan cuenta o no. No se editan directamente: se
 * corrigen en la ficha de la persona, de modo que el dato maestro y su reflejo
 * en la agenda no puedan divergir (specs/modelo-datos.md §7.4).
 */
export function eventosDerivados(instantanea) {
  if (!instantanea.tipos_evento?.some((t) => t.id === 'cumpleanos')) return [];
  return (instantanea.personas || [])
    .filter((p) => estaActivo(p, 'activa') && p.fecha_nacimiento)
    .map((persona) => ({
      id: `derivado:cumpleanos:${persona.id}`,
      titulo: `Cumpleaños de ${persona.nombre}`,
      tipo_id: 'cumpleanos',
      inicio: persona.fecha_nacimiento,
      fin: null,
      jornada_completa: true,
      repeticion: 'anual',
      origen: 'derivado',
      persona_origen_id: persona.id,
      participantes: [{ persona_id: persona.id, rol: 'protagonista' }],
      activo: true,
    }));
}

/**
 * La fecha del próximo aniversario, sea este año o el que viene.
 *
 * Vive aquí y no en la pantalla de personas porque lo consultan dos: la rejilla
 * de Gente, para ordenarla y para decir cuándo cumple cada uno, y la pestaña de
 * Ocasiones, que compone con esto su lista de cumpleaños.
 */
export function proximoAniversario(persona) {
  const nacimiento = parsearMomento(persona.fecha_nacimiento);
  if (!nacimiento) return null;
  const referencia = hoy();
  const deEsteAno = new Date(referencia.getFullYear(), nacimiento.getMonth(), nacimiento.getDate());
  return deEsteAno < referencia
    ? new Date(referencia.getFullYear() + 1, nacimiento.getMonth(), nacimiento.getDate())
    : deEsteAno;
}

/** Quien no tiene fecha va al final de la lista, no al principio. */
export function diasHastaElCumple(persona) {
  if (!persona.fecha_nacimiento) return Infinity;
  return Math.round((proximoAniversario(persona) - hoy()) / 86400000);
}

/**
 * Los años que cumple en ese aniversario, que no son los cumplidos: el día
 * mismo son los mismos, y a partir del día siguiente se habla ya del próximo.
 *
 * Es la cifra que se busca al mirar a alguien para decidir un regalo, y por eso
 * la piden tres sitios: la rejilla de Gente —«3 nov (48)»—, la lista de
 * cumpleaños de Ocasiones y el Worker al componer la felicitación, que hace esta
 * misma cuenta con las fechas del registro.
 */
export function aniosQueCumple(persona) {
  const nacimiento = parsearMomento(persona.fecha_nacimiento);
  const proximo = proximoAniversario(persona);
  if (!nacimiento || !proximo) return null;
  const anios = proximo.getFullYear() - nacimiento.getFullYear();
  return anios > 0 && anios < 130 ? anios : null;
}

// -------------------------------------------------------------- Recurrencia --

const ultimoDia = (anio, mes) => new Date(anio, mes + 1, 0).getDate();

/** 29 de febrero en año no bisiesto: al 1 de marzo, igual que el despachador. */
function mismoDiaOtroAnio(momento, anio) {
  const candidato = new Date(anio, momento.getMonth(), momento.getDate(), momento.getHours(), momento.getMinutes());
  if (candidato.getMonth() !== momento.getMonth()) return new Date(anio, 2, 1, momento.getHours(), momento.getMinutes());
  return candidato;
}

/** Instancias del evento que se solapan con [desde, hasta] (ambos días incluidos). */
export function ocurrencias(evento, desde, hasta) {
  const inicio = parsearMomento(evento.inicio);
  if (!inicio) return [];
  const fin = evento.fin ? parsearMomento(evento.fin) : null;
  const duracion = fin && fin > inicio ? fin - inicio : 0;

  const limiteInf = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).getTime() - duracion;
  const limiteSup = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(), 23, 59, 59).getTime();
  const tope = evento.repeticion_hasta ? parsearMomento(evento.repeticion_hasta) : null;

  const admisible = (momento) => {
    const t = momento.getTime();
    if (t < inicio.getTime() || t < limiteInf || t > limiteSup) return false;
    if (tope && soloFecha(momento) > soloFecha(tope)) return false;
    return true;
  };

  const arranques = [];
  const repeticion = evento.repeticion || 'ninguna';

  if (repeticion === 'ninguna') {
    if (admisible(inicio)) arranques.push(inicio);
  } else if (repeticion === 'semanal') {
    const salto = Math.round((limiteInf - inicio.getTime()) / 86400000);
    let actual = sumarDias(inicio, Math.max(0, Math.ceil(salto / 7)) * 7);
    while (actual.getTime() <= limiteSup) {
      if (admisible(actual)) arranques.push(actual);
      actual = sumarDias(actual, 7);
    }
  } else if (repeticion === 'mensual') {
    const primero = new Date(limiteInf);
    const ultimo = new Date(limiteSup);
    let anio = primero.getFullYear();
    let mes = primero.getMonth();
    while (anio < ultimo.getFullYear() || (anio === ultimo.getFullYear() && mes <= ultimo.getMonth())) {
      const dia = Math.min(inicio.getDate(), ultimoDia(anio, mes));
      const candidato = new Date(anio, mes, dia, inicio.getHours(), inicio.getMinutes());
      if (admisible(candidato)) arranques.push(candidato);
      mes += 1;
      if (mes > 11) { mes = 0; anio += 1; }
    }
  } else if (repeticion === 'anual') {
    for (const anio of new Set([new Date(limiteInf).getFullYear(), new Date(limiteSup).getFullYear()])) {
      const candidato = mismoDiaOtroAnio(inicio, anio);
      if (admisible(candidato)) arranques.push(candidato);
    }
  }

  return arranques
    .sort((a, b) => a - b)
    .map((arranque) => ({
      evento,
      inicio: arranque,
      fin: new Date(arranque.getTime() + duracion),
    }));
}

export function instanciasEn(instantanea, desde, hasta) {
  const fuentes = [...(instantanea.eventos || []).filter((e) => estaActivo(e)), ...eventosDerivados(instantanea)];
  return fuentes.flatMap((evento) => ocurrencias(evento, desde, hasta));
}

/**
 * Coloca cada instancia en todos los días que ocupa. Las jornadas posteriores a
 * la primera quedan marcadas como continuación, en lugar de repetir el evento
 * como si fuera nuevo (specs/ux.md §10.2).
 */
export function repartirPorDia(instancias, dias) {
  const reparto = new Map(dias.map((dia) => [iso(dia), []]));

  for (const instancia of instancias) {
    let cursor = soloFecha(instancia.inicio);
    const ultimo = soloFecha(instancia.fin);
    while (cursor <= ultimo) {
      const clave = iso(cursor);
      if (reparto.has(clave)) {
        reparto.get(clave).push({
          instancia,
          evento: instancia.evento,
          dia: new Date(cursor),
          continuacion: soloFecha(instancia.inicio) < cursor,
        });
      }
      cursor = sumarDias(cursor, 1);
    }
  }

  for (const apariciones of reparto.values()) {
    apariciones.sort((a, b) => orden(a) - orden(b) || a.evento.titulo.localeCompare(b.evento.titulo, 'es'));
  }
  return reparto;
}

function orden(aparicion) {
  if (aparicion.evento.jornada_completa || aparicion.continuacion) return -1;
  return aparicion.instancia.inicio.getHours() * 60 + aparicion.instancia.inicio.getMinutes();
}

export function horaDe(aparicion) {
  if (aparicion.evento.jornada_completa || aparicion.continuacion) return null;
  return formatearHora(aparicion.instancia.inicio);
}
