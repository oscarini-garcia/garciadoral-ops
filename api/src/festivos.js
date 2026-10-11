/**
 * Los festivos: los oficiales del lugar de la casa, sacados de una tabla por año, y qué recurrentes dejan sin día.
 *
 * Decidido como A1 · B1 · C1 · D3 · E1 en `specs/propuesta-festivos.html`.
 *
 * **Los oficiales salen de `datos/festivos.json`**, una tabla por año copiada
 * de los calendarios publicados —el laboral de Cataluña y los dos locales de
 * cada municipio— que se amplía cada otoño. Lo que la tabla no tenga todavía se
 * calcula por regla —fechas fijas y las que dependen de la Pascua— y viaja
 * marcado (`por_regla`), para que la hoja de Festivos diga que esos días son
 * una previsión. La regla vive solo aquí: el registro lleva la lista ya hecha,
 * y la aplicación y el plan de los domingos la leen de él.
 *
 * **El lugar es de la casa**: `plugins.festivos.lugar`, que escribe quien
 * administra desde la hoja del plugin (B1).
 *
 * **Los raros se apuntan a mano** (C1) y son filas de `evento` con
 * `plugin_id = 'festivo'`: un día, un nombre, y a quién afecta en sus
 * protagonistas —ninguno es toda la casa—.
 *
 * **Y una recurrente no tiene día en festivo** (E1) salvo que diga
 * `extra.en_festivos = 'si'`, o que ese día se haya dicho «Sí hay»
 * (`evento_dia.hay_en_festivo`). Un festivo de alguien solo anula lo que es de
 * esa persona. Es la misma regla que `festivoQueAnula` en
 * `pwa/publico/js/festivos.js` y `festivo_que_anula` en
 * `scripts/agenda/festivos.py`.
 */

import TABLA from '../../datos/festivos.json' with { type: 'json' };

export const LUGAR_POR_DEFECTO = 'barcelona';

/** Los lugares que la tabla conoce, con su nombre. */
export const LUGARES = Object.fromEntries(
  Object.entries(TABLA.lugares).map(([id, lugar]) => [id, { id, nombre: lugar.nombre, comunidad: lugar.comunidad }]),
);

const NOMBRE_DE_AMBITO = { cataluna: 'Cataluña' };

export const lugarDe = (plugins) => {
  const escrito = plugins?.festivos?.lugar;
  return LUGARES[escrito] ? escrito : LUGAR_POR_DEFECTO;
};

const dos = (n) => String(n).padStart(2, '0');
const isoUtc = (fecha) => `${fecha.getUTCFullYear()}-${dos(fecha.getUTCMonth() + 1)}-${dos(fecha.getUTCDate())}`;
const masDias = (iso, dias) => isoUtc(new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000));

/** El domingo de Pascua de un año, por el cálculo gregoriano de siempre. */
export function pascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/**
 * La regla de reserva, para los años que la tabla aún no tiene. Da todos los
 * candidatos —catorce en Cataluña, cuando el calendario de verdad elige doce—:
 * es una previsión, y la hoja lo dice.
 */
const REGLA = {
  cataluna: (anio) => {
    const domingo = pascua(anio);
    return {
      [`${anio}-01-01`]: 'Año Nuevo',
      [`${anio}-01-06`]: 'Reyes',
      [masDias(domingo, -2)]: 'Viernes Santo',
      [masDias(domingo, 1)]: 'Lunes de Pascua',
      [`${anio}-05-01`]: 'Fiesta del Trabajo',
      [`${anio}-06-24`]: 'San Juan',
      [`${anio}-08-15`]: 'La Asunción',
      [`${anio}-09-11`]: 'Diada',
      [`${anio}-10-12`]: 'Fiesta Nacional',
      [`${anio}-11-01`]: 'Todos los Santos',
      [`${anio}-12-06`]: 'Día de la Constitución',
      [`${anio}-12-08`]: 'La Inmaculada',
      [`${anio}-12-25`]: 'Navidad',
      [`${anio}-12-26`]: 'San Esteban',
    };
  },
  barcelona: (anio) => ({
    [masDias(pascua(anio), 50)]: 'Segunda Pascua',
    [`${anio}-09-24`]: 'La Mercè',
  }),
};

/**
 * Los festivos oficiales de un lugar en unos años, por fecha. Un día que es
 * festivo por dos caminos sale una vez, con el primero.
 */
export function festivosOficiales(lugar, anios) {
  const id = LUGARES[lugar] ? lugar : LUGAR_POR_DEFECTO;
  const ambitos = [LUGARES[id].comunidad, id];
  const porFecha = new Map();
  const porRegla = [];
  for (const anio of anios) {
    for (const ambito of ambitos) {
      const deTabla = TABLA.anios?.[String(anio)]?.[ambito];
      const lista = deTabla || REGLA[ambito]?.(anio) || {};
      if (!deTabla) porRegla.push({ anio, ambito, nombre: NOMBRE_DE_AMBITO[ambito] || LUGARES[ambito]?.nombre || ambito });
      for (const [fecha, nombre] of Object.entries(lista)) {
        if (!porFecha.has(fecha)) porFecha.set(fecha, { fecha, nombre, ambito, de: deTabla ? 'tabla' : 'regla' });
      }
    }
  }
  return {
    dias: [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porRegla,
  };
}

/**
 * Lo que viaja en el registro: el lugar, los que hay para elegir, los festivos
 * del año pasado, este y el que viene, y qué parte de este y del siguiente es
 * todavía previsión. El año de casa se toma en hora de Madrid, por el borde de
 * la Nochevieja.
 */
export function festivosDelRegistro(plugins, ahora = new Date()) {
  const anio = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(ahora));
  const lugar = lugarDe(plugins);
  const { dias, porRegla } = festivosOficiales(lugar, [anio - 1, anio, anio + 1]);
  return {
    lugar,
    nombre: LUGARES[lugar].nombre,
    lugares: Object.values(LUGARES).map(({ id, nombre }) => ({ id, nombre })),
    dias,
    por_regla: porRegla.filter((p) => p.anio >= anio),
  };
}

const activo = (fila) => fila && fila.activo !== false && fila.activo !== 0;

/** ¿Es un festivo apuntado a mano? */
export const esFestivoManual = (evento) => evento?.plugin_id === 'festivo';

const protagonistasDe = (evento) => (evento?.participantes || [])
  .filter((p) => p.rol === 'protagonista')
  .map((p) => p.persona_id);

/** Los festivos de un día: los oficiales y los apuntados, con a quién afectan
 *  (una lista vacía es toda la casa). */
export function festivosDelDia(registro, fechaIso) {
  const oficiales = (registro?.festivos?.dias || [])
    .filter((f) => f.fecha === fechaIso)
    .map((f) => ({ nombre: f.nombre, oficial: true, afecta: [] }));
  const apuntados = (registro?.eventos || [])
    .filter((e) => esFestivoManual(e) && activo(e) && String(e.inicio || '').slice(0, 10) === fechaIso)
    .map((e) => ({ nombre: e.titulo, oficial: false, afecta: protagonistasDe(e), id: e.id }));
  return [...oficiales, ...apuntados];
}

/**
 * El nombre del festivo que deja sin día a una recurrente, o `null`. Solo
 * anula recurrentes; un festivo de alguien, solo lo de esa persona; y nada si
 * la recurrente dice que en festivos sí hay o ese día se dijo «Sí hay».
 */
export function festivoQueAnula(registro, evento, fechaIso) {
  if (evento?.plugin_id !== 'extraescolar') return null;
  if (evento.extra?.en_festivos === 'si') return null;
  const dia = (registro?.dias_evento || [])
    .find((d) => d.evento_id === evento.id && d.fecha === fechaIso && activo(d));
  if (dia && (dia.hay_en_festivo === true || dia.hay_en_festivo === 1)) return null;
  const suyos = protagonistasDe(evento);
  const festivo = festivosDelDia(registro, fechaIso)
    .find((f) => !f.afecta.length || f.afecta.some((id) => suyos.includes(id)));
  return festivo ? festivo.nombre : null;
}

/** Los oficiales como eventos de un día, con el identificador que usa el
 *  dispositivo, para quien cuenta la agenda desde el servidor. */
export function eventosDeFestivos(registro) {
  return (registro?.festivos?.dias || []).map((f) => ({
    id: `derivado:festivo:${f.fecha}`,
    titulo: f.nombre,
    tipo_id: 'festivo',
    inicio: f.fecha,
    fin: null,
    jornada_completa: true,
    repeticion: 'ninguna',
    origen: 'derivado',
    participantes: [],
    activo: true,
  }));
}
