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
import { ajustesDe, seEnsena } from './plugins.js';
import { eventosDeFuera } from './viajes.js';

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

/**
 * Cuándo pasó algo, contado como se cuenta en voz alta.
 *
 * «hace un rato», «ayer», «el martes», «el 12 de julio». Lo escribe el hilo de
 * comentarios y lo escribe el sobre de avisos, que son los dos sitios donde la
 * fecha no es un dato que se consulte sino el orden en que ocurrieron las
 * cosas: ahí «2026-07-14» obliga a hacer una resta mental para saber si eso es
 * de antes o de después de lo que se acaba de leer.
 *
 * A partir de la semana se escribe la fecha, porque «hace nueve días» ya no
 * sitúa nada: nadie sabe qué día fue eso sin contar. Y del año pasado en
 * adelante se añade el año, que es cuando empieza a hacer falta.
 */
export function formatearHace(momento, ahora = new Date()) {
  const cuando = momento instanceof Date ? momento : parsearMomento(momento);
  if (!cuando || Number.isNaN(cuando.getTime())) return '';

  const minutos = Math.round((ahora - cuando) / 60000);
  if (minutos < 0) return 'ahora mismo';
  if (minutos < 60) return minutos < 5 ? 'hace un rato' : `hace ${minutos} min`;

  const dias = Math.round((soloFecha(ahora) - soloFecha(cuando)) / 86400000);
  if (dias === 0) return `hoy a las ${formatearHora(cuando)}`;
  if (dias === 1) return `ayer a las ${formatearHora(cuando)}`;
  if (dias < 7) return `el ${NOMBRES_DIA[indiceDia(cuando)]}`;

  const fecha = `el ${cuando.getDate()} de ${MESES_LARGOS[cuando.getMonth()]}`;
  return cuando.getFullYear() === ahora.getFullYear() ? fecha : `${fecha} de ${cuando.getFullYear()}`;
}

// ------------------------------------------------------- Eventos derivados --

/**
 * Cumpleaños generados a partir de las fechas de nacimiento, para todas las
 * personas del registro, tengan cuenta o no. No se editan directamente: se
 * corrigen en la ficha de la persona, de modo que el dato maestro y su reflejo
 * en la agenda no puedan divergir (specs/modelo-datos.md §7.4).
 *
 * **Y los santos, desde la 0021, por el mismo camino**: `persona.santo` guarda
 * el día como «MM-DD» y de ahí sale «✨ Santo de Lucía» cada año. Se apagan
 * desde la hoja de Cumpleaños y santos si la casa no los celebra.
 *
 * **Y las ausencias**, que son de Lío: quien no está unos días sale como una
 * banda en la semana —«Marta fuera»— además de ceder sus turnos.
 */
export function eventosDerivados(instantanea) {
  const derivados = [];
  const tipos = new Set((instantanea.tipos_evento || []).map((t) => t.id));
  const personas = (instantanea.personas || []).filter((p) => estaActivo(p, 'activa'));

  if (tipos.has('cumpleanos')) {
    for (const persona of personas) {
      if (!persona.fecha_nacimiento) continue;
      derivados.push({
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
      });
    }
  }

  if (tipos.has('santo') && ajustesDe(instantanea, 'cumples').santos) {
    for (const persona of personas) {
      const santo = String(persona.santo || '').match(/^(\d{2})-(\d{2})$/);
      if (!santo) continue;
      derivados.push({
        id: `derivado:santo:${persona.id}`,
        titulo: `Santo de ${persona.nombre}`,
        tipo_id: 'santo',
        // Un año cualquiera de antes de que hubiera agenda: el santo no tiene
        // año, y la repetición anual arranca en el del inicio.
        inicio: `1900-${santo[1]}-${santo[2]}`,
        fin: null,
        jornada_completa: true,
        repeticion: 'anual',
        origen: 'derivado',
        persona_origen_id: persona.id,
        participantes: [{ persona_id: persona.id, rol: 'protagonista' }],
        activo: true,
      });
    }
  }

  for (const ausencia of instantanea.ausencias || []) {
    if (!estaActivo(ausencia)) continue;
    const persona = personas.find((p) => p.id === ausencia.persona_id);
    if (!persona || !ausencia.desde) continue;
    derivados.push({
      id: `derivado:ausencia:${ausencia.id}`,
      titulo: `${persona.nombre} fuera`,
      tipo_id: 'viaje',
      emoji: '🧳',
      inicio: ausencia.desde,
      fin: ausencia.hasta && ausencia.hasta > ausencia.desde ? ausencia.hasta : null,
      jornada_completa: true,
      repeticion: 'ninguna',
      origen: 'derivado',
      extra: { ausencia: ausencia.id, cubre_id: ausencia.cubre_id || null, motivo: ausencia.motivo || '' },
      participantes: [],
      activo: true,
    });
  }

  return derivados.concat(eventosDeFuera(instantanea));
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
    // Por fecha frente al inicio y no por instante: el martes de una actividad
    // con horario propio puede empezar antes que la hora escrita en el evento.
    if (soloFecha(momento) < soloFecha(inicio) || t < limiteInf || t > limiteSup) return false;
    if (tope && soloFecha(momento) > soloFecha(tope)) return false;
    return true;
  };

  const arranques = [];
  // La duración de un arranque concreto cuando no es la del evento: la de su
  // día de la semana, en una actividad con horario propio.
  const duraciones = new Map();
  const repeticion = evento.repeticion || 'ninguna';

  if (repeticion === 'ninguna') {
    if (admisible(inicio)) arranques.push(inicio);
  } else if (repeticion === 'semanal') {
    // Una actividad puede caer en varios días de la semana —martes y jueves—,
    // que es lo que un «se repite: semanal» a secas no sabe decir: `extra.dias`
    // los lleva con el lunes en 0, y se recorre cada semana entera desde la
    // del inicio. Sin ellos es la repetición de siempre, el mismo día cada
    // semana.
    const diasDeLaSemana = diasSemanalesDe(evento);
    const salto = Math.round((limiteInf - inicio.getTime()) / 86400000);
    if (diasDeLaSemana) {
      const lunes = sumarDias(inicio, -indiceDia(inicio));
      let semana = sumarDias(lunes, Math.max(0, Math.floor(salto / 7) - 1) * 7);
      while (semana.getTime() <= limiteSup) {
        for (const dia of diasDeLaSemana) {
          const candidato = sumarDias(semana, dia);
          // Cada día a su hora (B1): el horario del día si la actividad lo
          // lleva, y si no la hora del evento. Y la duración va con él.
          const propio = horarioDelDia(evento, dia);
          candidato.setHours(propio ? propio.desde.h : inicio.getHours(), propio ? propio.desde.m : inicio.getMinutes(), 0, 0);
          if (admisible(candidato)) {
            arranques.push(candidato);
            if (propio) duraciones.set(candidato.getTime(), propio.duracion);
          }
        }
        semana = sumarDias(semana, 7);
      }
    } else {
      let actual = sumarDias(inicio, Math.max(0, Math.ceil(salto / 7)) * 7);
      while (actual.getTime() <= limiteSup) {
        if (admisible(actual)) arranques.push(actual);
        actual = sumarDias(actual, 7);
      }
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
      fin: new Date(arranque.getTime() + (duraciones.has(arranque.getTime()) ? duraciones.get(arranque.getTime()) : duracion)),
    }));
}

/**
 * El horario propio de un día de la semana de una actividad, o `null`:
 * `extra.horario[dia] = { desde: 'HH:MM', hasta: 'HH:MM' }` (B1 en
 * specs/propuesta-ocho-cosas.html). Devuelve las horas partidas y la
 * duración en milisegundos, para que quien expande no tenga que parsear.
 */
export function horarioDelDia(evento, dia) {
  const fila = evento?.extra?.horario?.[dia] ?? evento?.extra?.horario?.[String(dia)];
  const partir = (texto) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto || ''));
    return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
  };
  const desde = fila ? partir(fila.desde) : null;
  if (!desde) return null;
  const hasta = partir(fila.hasta);
  const minutos = hasta ? (hasta.h * 60 + hasta.m) - (desde.h * 60 + desde.m) : 0;
  return { desde, hasta, duracion: Math.max(0, minutos) * 60000 };
}

/**
 * Quién lleva o recoge según una fila de `evento_dia`: la persona por su
 * identificador, o «otro» —alguien que no es de casa— como `otro:<nombre>`
 * (C4). Un solo valor para las dos formas, que es lo que deja a la pantalla y
 * al trato tratar las dos igual; las columnas se parten al guardar.
 */
export function quienDelDia(fila, campo) {
  if (!fila) return null;
  if (fila[`${campo}_id`]) return fila[`${campo}_id`];
  if (fila[`${campo}_otro`]) return `otro:${fila[`${campo}_otro`]}`;
  return null;
}

/** Los días de la semana de una actividad, con el lunes en 0, o `null` si el
 *  evento no los lleva. Ordenados y sin repetir, vengan como vengan. */
export function diasSemanalesDe(evento) {
  const dias = evento?.extra?.dias;
  if (!Array.isArray(dias)) return null;
  const limpios = [...new Set(dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return limpios.length ? limpios : null;
}

/**
 * Lo que le pasa a un día suelto de un evento —que ese día no hay, o que ese
 * martes lleva otro—, o `null` si nada. Es una fila de `evento_dia`, con el
 * identificador compuesto como el de un paseo.
 */
export const idDiaDeEvento = (eventoId, fechaIso) => `dia:${eventoId}:${fechaIso}`;

export function diaDeEvento(instantanea, eventoId, fechaIso) {
  const fila = (instantanea?.dias_evento || []).find(
    (d) => d.id === idDiaDeEvento(eventoId, fechaIso) && estaActivo(d),
  );
  return fila || null;
}

const estaCancelado = (dia) => Boolean(dia?.cancelado) && dia.cancelado !== 0 && dia.cancelado !== '0';

/**
 * Todas las instancias del tramo, de todos los plugins que se enseñan.
 *
 * Aquí se aplican las dos cosas que el Worker no puede: lo apagado en este
 * aparato y el círculo de lo que se deriva en el dispositivo (`plugins.js`), y
 * los días de una actividad en los que se dijo que no hay.
 */
export function instanciasEn(instantanea, desde, hasta) {
  const fuentes = [...(instantanea.eventos || []).filter((e) => estaActivo(e)), ...eventosDerivados(instantanea)]
    .filter((evento) => seEnsena(instantanea, evento));
  return fuentes
    .flatMap((evento) => ocurrencias(evento, desde, hasta))
    .filter((instancia) => !estaCancelado(diaDeEvento(instantanea, instancia.evento.id, iso(instancia.inicio))));
}

/**
 * Coloca cada instancia en todos los días que ocupa. Las jornadas posteriores a
 * la primera quedan marcadas como continuación, en lugar de repetir el evento
 * como si fuera nuevo (specs/ux.md §10.2).
 */
export function repartirPorDia(instancias, dias) {
  const reparto = new Map(dias.map((dia) => [iso(dia), []]));

  for (const instancia of instancias) {
    const primero = soloFecha(instancia.inicio);
    const ultimo = soloFecha(instancia.fin);
    let cursor = primero;
    while (cursor <= ultimo) {
      const clave = iso(cursor);
      if (reparto.has(clave)) {
        reparto.get(clave).push({
          instancia,
          evento: instancia.evento,
          dia: new Date(cursor),
          continuacion: primero < cursor,
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
