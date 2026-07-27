/**
 * Lio: los turnos de paseo, sus estados y el trato que los cambia de dueño.
 *
 * Espejo de `api/src/lio.js` y de `scripts/agenda/lio.py`. Aquí vive todo lo que
 * hay que saber sobre un turno sin dibujar nada: quién lo tiene, si está hecho,
 * si alguien ha pedido algo sobre él y qué se puede hacer.
 *
 * **Un turno no es una fila mientras no pasa nada.** Se deriva del cuadro
 * semanal —catorce casillas en `configuracion`, que edita un administrador desde
 * Ajustes— igual que un cumpleaños se deriva de una fecha de nacimiento. Solo
 * cuando alguien marca que lo sacó, o cuando se acuerda un cambio para ese día,
 * se escribe una fila de `paseo`. Y desde ese momento esa fila manda sobre el
 * cuadro para siempre: cambiar el reparto cambia el futuro y no reescribe el
 * pasado, que es justamente lo que se le pide a un histórico.
 *
 * **El estado que nadie marca lo pone el reloj.** Nadie va a decir «no lo he
 * sacado»: lo que hay es previsto y hecho, y un previsto cuya ventana ya pasó se
 * lee como sin marcar. Sin marcar no es una acusación —casi siempre el perro
 * salió y lo que faltó fue el gesto—, así que la pantalla pregunta en lugar de
 * afirmar.
 *
 * La forma está en `specs/ux.md` §10.3 y las entidades, en
 * `specs/modelo-datos.md` §2.6.
 */

import { guardar } from './sincronizacion.js';
import { ahora, estaActivo, nuevoId } from './modelo.js';
import { indiceDia, iso, parsearMomento } from './semana.js';

/**
 * Los dos turnos, con la ventana en que se dan por hechos.
 *
 * De 6 a 10 y de 20 a 24. Las horas no se configuran: solo sirven para decidir
 * cuándo un turno previsto pasa a estar sin marcar, y una cifra ajustable más
 * sería una pregunta más en una pantalla que ya hace catorce.
 */
export const TURNOS = [
  { id: 'manana', nombre: 'Mañana', emoji: '☀️', desde: 6, hasta: 10 },
  { id: 'noche', nombre: 'Noche', emoji: '🌙', desde: 20, hasta: 24 },
];

export const IDS_TURNO = TURNOS.map((t) => t.id);

export const turnoPorId = (id) => TURNOS.find((t) => t.id === id) || null;

/** El identificador de un paseo se compone, no se inventa: el dispositivo marca
 *  antes de haber visto ninguna fila y tiene que dar con la misma que el
 *  servidor. */
export const idPaseo = (fechaIso, turnoId) => `lio:${fechaIso}:${turnoId}`;

export function cuadroVacio() {
  return Object.fromEntries(IDS_TURNO.map((turno) => [turno, Array(7).fill(null)]));
}

/** El cuadro tal como llega, saneado: catorce casillas siempre, con el lunes
 *  en 0. */
export function cuadroDe(instantanea) {
  const bruto = instantanea?.lio_cuadro;
  const cuadro = cuadroVacio();
  if (!bruto || typeof bruto !== 'object') return cuadro;
  for (const turno of IDS_TURNO) {
    const fila = Array.isArray(bruto[turno]) ? bruto[turno] : [];
    for (let dia = 0; dia < 7; dia += 1) {
      cuadro[turno][dia] = typeof fila[dia] === 'string' && fila[dia] ? fila[dia] : null;
    }
  }
  return cuadro;
}

/**
 * ¿Hay Lio en esta casa?
 *
 * Mientras nadie haya puesto el cuadro no se dibuja nada: ni carril en la
 * semana, ni bloque en Hoy. Un módulo vacío ocupando sitio todos los días es
 * peor que no tenerlo, y quien no vive en casa ni siquiera recibe estos datos.
 */
export function hayLio(instantanea) {
  if (!instantanea) return false;
  const cuadro = cuadroDe(instantanea);
  if (IDS_TURNO.some((turno) => cuadro[turno].some(Boolean))) return true;
  return (instantanea.paseos || []).some((p) => estaActivo(p));
}

/** Los de casa, que son los únicos que pueden sacarlo. */
export const genteDeCasa = (vista) => vista.personasDe('familia').filter((p) => p.tiene_cuenta);

/** Las dos primeras letras del nombre: «Ós», «Ma». Cabe en una casilla del
 *  carril y distingue a dos personas que empiezan igual, que es lo que una sola
 *  inicial no hacía. */
export const inicialesDe = (persona) => String(persona?.nombre || '').trim().slice(0, 2) || '··';

// ------------------------------------------------------------- Los turnos --

const paseoDe = (instantanea, fechaIso, turnoId) =>
  (instantanea.paseos || []).find((p) => p.id === idPaseo(fechaIso, turnoId) && estaActivo(p)) || null;

/** La propuesta viva sobre un turno, si la hay. Solo puede haber una: la
 *  pantalla no ofrece pedir nada sobre un turno que ya tiene algo pendiente. */
const tratoDe = (instantanea, fechaIso, turnoId) =>
  (instantanea.tratos_paseo || []).find(
    (t) => t.fecha === fechaIso && t.turno === turnoId && t.estado === 'pendiente' && estaActivo(t),
  ) || null;

/** Cuándo se cierra la ventana de un turno, en hora local. */
export function finDeVentana(fecha, turnoId) {
  const turno = turnoPorId(turnoId);
  const dia = fecha instanceof Date ? fecha : parsearMomento(fecha);
  const fin = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  fin.setHours(turno ? turno.hasta : 24, 0, 0, 0);
  return fin;
}

/** Cuándo empieza, que es cuando tiene sentido recordárselo a quien le toca. */
export function inicioDeVentana(fecha, turnoId) {
  const turno = turnoPorId(turnoId);
  const dia = fecha instanceof Date ? fecha : parsearMomento(fecha);
  const inicio = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
  inicio.setHours(turno ? turno.desde : 0, 0, 0, 0);
  return inicio;
}

/**
 * Un turno resuelto: quién lo tiene, cómo está y qué hay pendiente sobre él.
 *
 * `estado` es uno de cuatro:
 *
 * - `hecho` — alguien dijo que lo sacó, y consta quién.
 * - `previsto` — tiene dueño y su ventana no ha terminado.
 * - `sin-marcar` — tenía dueño, la ventana pasó y nadie dijo nada.
 * - `sin-asignar` — el cuadro no dice de quién es y nadie lo ha cogido.
 */
export function turnoDe(instantanea, fecha, turnoId, referencia = new Date()) {
  const dia = fecha instanceof Date ? fecha : parsearMomento(fecha);
  const fechaIso = iso(dia);
  const paseo = paseoDe(instantanea, fechaIso, turnoId);
  const cuadro = cuadroDe(instantanea);
  // La fila manda sobre el cuadro: si existe es porque ese día no fue como
  // estaba previsto, y eso ya no lo cambia un reparto nuevo.
  const asignadoId = paseo ? paseo.asignado_id || null : cuadro[turnoId]?.[indiceDia(dia)] || null;
  const hechoPorId = paseo?.hecho_por_id || null;
  const vencido = referencia >= finDeVentana(dia, turnoId);

  let estado = 'previsto';
  if (hechoPorId) estado = 'hecho';
  else if (!asignadoId) estado = 'sin-asignar';
  else if (vencido) estado = 'sin-marcar';

  return {
    fecha: dia,
    fechaIso,
    turno: turnoPorId(turnoId),
    asignadoId,
    hechoPorId,
    hechoEn: paseo?.hecho_en || null,
    estado,
    vencido,
    trato: tratoDe(instantanea, fechaIso, turnoId),
    mio: Boolean(asignadoId) && asignadoId === instantanea?.yo?.id,
  };
}

export const turnosDe = (instantanea, fecha, referencia = new Date()) =>
  IDS_TURNO.map((turnoId) => turnoDe(instantanea, fecha, turnoId, referencia));

// ---------------------------------------------------------- Las propuestas --

/** Lo que le toca contestar a quien mira. Es lo que sube a Hoy. */
export function tratosParaMi(instantanea) {
  const yo = instantanea?.yo?.id;
  if (!yo) return [];
  return (instantanea.tratos_paseo || [])
    .filter((t) => t.destinatario_id === yo && t.estado === 'pendiente' && estaActivo(t))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.turno.localeCompare(b.turno));
}

/** Lo que uno pidió y sigue sin contestar. No se pinta en Hoy —quien pregunta
 *  no tiene nada que hacer— pero el carril lo marca, para que no se pida dos
 *  veces lo mismo. */
export function misPeticiones(instantanea) {
  const yo = instantanea?.yo?.id;
  if (!yo) return [];
  return (instantanea.tratos_paseo || [])
    .filter((t) => t.proponente_id === yo && t.estado === 'pendiente' && estaActivo(t));
}

// ------------------------------------------------------------- Escrituras --

/**
 * «Ya está»: se marca que el turno lo sacó quien lo dice.
 *
 * Si es el suyo, se escribe y punto. Si era de otro, no se escribe nada todavía:
 * sale una propuesta de corrección para que ese otro la confirme, porque la
 * marca cuenta quién sacó al perro y eso no lo puede decidir un tercero solo.
 * El turno de nadie —una casilla vacía del cuadro— lo puede coger cualquiera sin
 * pedir permiso: no hay a quién pedírselo.
 */
export async function marcarHecho(instantanea, turno) {
  const yo = instantanea.yo.id;
  if (turno.asignadoId && turno.asignadoId !== yo) {
    return proponer(turno, {
      clase: 'correccion',
      proponente_id: yo,
      destinatario_id: turno.asignadoId,
      asignado_previo_id: turno.asignadoId,
    });
  }
  await guardar('paseo', idPaseo(turno.fechaIso, turno.turno.id), {
    fecha: turno.fechaIso,
    turno: turno.turno.id,
    asignado_id: turno.asignadoId || yo,
    hecho_por_id: yo,
    hecho_en: ahora(),
    activo: 1,
  });
  return { marcado: true };
}

/** Deshacer la marca propia. Solo la suya: quitar de la lista a quien dijo que
 *  lo sacó sería desdecir a otro sin preguntarle. */
export function desmarcar(turno) {
  return guardar('paseo', idPaseo(turno.fechaIso, turno.turno.id), {
    hecho_por_id: null,
    hecho_en: null,
  });
}

/** «No puedo»: se le pide a alguien que lo saque por uno. Hasta que conteste, el
 *  turno sigue siendo de quien lo pide. */
export function pedirCambio(instantanea, turno, aQuienId) {
  return proponer(turno, {
    clase: 'cambio',
    proponente_id: instantanea.yo.id,
    destinatario_id: aQuienId,
    asignado_previo_id: turno.asignadoId,
  });
}

function proponer(turno, campos) {
  return guardar('trato_paseo', nuevoId(), {
    fecha: turno.fechaIso,
    turno: turno.turno.id,
    estado: 'pendiente',
    activo: 1,
    ...campos,
  });
}

/** Retirar lo que uno pidió, mientras nadie haya contestado. */
export const retirarPropuesta = (trato) => guardar('trato_paseo', trato.id, { activo: 0 });

/**
 * Contestar una propuesta.
 *
 * Aceptar escribe dos cosas en el mismo lote: la propuesta resuelta y la fila
 * del paseo que resulta de ella. Rechazar escribe una sola, porque **no hay nada
 * que deshacer**: mientras la propuesta estaba pendiente el turno seguía siendo
 * de quien lo tenía, así que decir que no es volver exactamente a donde se
 * estaba.
 */
export async function resolverPropuesta(trato, acepta) {
  await guardar('trato_paseo', trato.id, {
    estado: acepta ? 'aceptado' : 'rechazado',
    resuelto_en: ahora(),
  });
  if (!acepta) return;

  const comun = { fecha: trato.fecha, turno: trato.turno, activo: 1 };
  if (trato.clase === 'cambio') {
    await guardar('paseo', idPaseo(trato.fecha, trato.turno), {
      ...comun,
      asignado_id: trato.destinatario_id,
    });
    return;
  }
  await guardar('paseo', idPaseo(trato.fecha, trato.turno), {
    ...comun,
    asignado_id: trato.asignado_previo_id || trato.destinatario_id,
    hecho_por_id: trato.proponente_id,
    hecho_en: ahora(),
  });
}

// ----------------------------------------------------------- El cuadro --

/** El cuadro entero de una vez: catorce casillas son un solo dato, y el Worker
 *  solo se lo admite a un administrador. */
export const guardarCuadro = (cuadro) => guardar('lio_cuadro', 'lio.cuadro', { cuadro });
