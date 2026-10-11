/**
 * Los festivos en la aplicación: los oficiales que trae la instantánea, los apuntados a mano, y qué recurrentes dejan sin día.
 *
 * Decidido como A1 · B1 · C1 · D3 · E1 en `specs/propuesta-festivos.html`.
 * Los oficiales no se calculan aquí: el Worker los compone de
 * `datos/festivos.json` —o de su regla, donde la tabla no llega— y viajan en
 * `festivos`. Los raros son filas de `evento` con `plugin_id = 'festivo'`, y a
 * quién afectan son sus protagonistas; ninguno es toda la casa.
 *
 * La regla de qué deja sin día a una recurrente está en los tres sitios:
 * aquí, en `api/src/festivos.js` y en `scripts/agenda/festivos.py`.
 */

import { estaActivo } from './modelo.js';

export const esFestivoManual = (evento) => evento?.plugin_id === 'festivo';

const protagonistasDe = (evento) => (evento?.participantes || [])
  .filter((p) => p.rol === 'protagonista')
  .map((p) => p.persona_id);

/** Los oficiales, como llegan: `{ fecha, nombre, ambito, de }`. */
export const festivosOficiales = (instantanea) => instantanea?.festivos?.dias || [];

/** Los apuntados a mano, vivos y por fecha. */
export const festivosApuntados = (instantanea) => (instantanea?.eventos || [])
  .filter((e) => esFestivoManual(e) && estaActivo(e))
  .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

/** Los festivos de un día, con a quién afectan (vacío, toda la casa). */
export function festivosDelDia(instantanea, fechaIso) {
  return [
    ...festivosOficiales(instantanea)
      .filter((f) => f.fecha === fechaIso)
      .map((f) => ({ nombre: f.nombre, oficial: true, afecta: [] })),
    ...festivosApuntados(instantanea)
      .filter((e) => String(e.inicio || '').slice(0, 10) === fechaIso)
      .map((e) => ({ nombre: e.titulo, oficial: false, afecta: protagonistasDe(e), id: e.id })),
  ];
}

/**
 * El nombre del festivo que deja sin día a una recurrente, o `null` (E1).
 * Solo anula recurrentes; un festivo de alguien, solo lo de esa persona; y
 * nada si la recurrente va en festivos o ese día se dijo «Sí hay».
 */
export function festivoQueAnula(instantanea, evento, fechaIso) {
  if (evento?.plugin_id !== 'extraescolar') return null;
  if (evento.extra?.en_festivos === 'si') return null;
  const dia = (instantanea?.dias_evento || [])
    .find((d) => d.evento_id === evento.id && d.fecha === fechaIso && estaActivo(d));
  if (dia && (dia.hay_en_festivo === true || dia.hay_en_festivo === 1)) return null;
  const suyos = protagonistasDe(evento);
  const festivo = festivosDelDia(instantanea, fechaIso)
    .find((f) => !f.afecta.length || f.afecta.some((id) => suyos.includes(id)));
  return festivo ? festivo.nombre : null;
}

/** Los oficiales como eventos de un día, para que la agenda los reparta como
 *  a un cumpleaños. El identificador es el mismo que usa el Worker. */
export function eventosDeFestivos(instantanea) {
  return festivosOficiales(instantanea).map((f) => ({
    id: `derivado:festivo:${f.fecha}`,
    titulo: f.nombre,
    tipo_id: 'festivo',
    inicio: f.fecha,
    fin: null,
    jornada_completa: true,
    repeticion: 'ninguna',
    origen: 'derivado',
    extra: { ambito: f.ambito, de: f.de },
    participantes: [],
    activo: true,
  }));
}

/** ¿Es un evento de festivos, oficial o apuntado? */
export const esDeFestivos = (evento) => esFestivoManual(evento) || String(evento?.id || '').startsWith('derivado:festivo:');

/** Lo que aún es previsión: «los locales de Barcelona de 2027». */
export function previsionesDe(instantanea) {
  return (instantanea?.festivos?.por_regla || []).map((p) => (
    p.ambito === (instantanea?.festivos?.lugar || '')
      ? `los locales de ${p.nombre} de ${p.anio}`
      : `los de ${p.nombre} de ${p.anio}`
  ));
}
