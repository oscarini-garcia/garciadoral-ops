/**
 * Lío: los turnos de paseo, sus estados y el trato que los cambia de dueño.
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

/**
 * Cómo se llama un turno cuando hay sitio para escribirlo: «Por la mañana».
 *
 * El sol y la luna no desaparecen —siguen delante, y en el carril de la semana
 * son lo único que hay, porque en una pastilla de 38 puntos no cabe una frase—.
 * Lo que se retiró fue escribir solo el emoji, o el emoji con la palabra suelta
 * «Mañana» detrás: la una obligaba a traducirlo cada vez y la otra decía a medias
 * lo que la frase dice entera.
 */
export const nombreDeTurno = (turno) => `Por la ${String(turno?.nombre || '').toLowerCase()}`;

/** El mismo nombre con su sol o su luna delante, para los rótulos que lo llevan:
 *  el título de la hoja del turno y las columnas del cuadro de Ajustes. */
export const rotuloDeTurno = (turno) => `${turno?.emoji || ''} ${nombreDeTurno(turno)}`.trim();

/** El identificador de un paseo se compone, no se inventa: el dispositivo marca
 *  antes de haber visto ninguna fila y tiene que dar con la misma que el
 *  servidor. */
export const idPaseo = (fechaIso, turnoId) => `lio:${fechaIso}:${turnoId}`;

export function cuadroVacio() {
  return Object.fromEntries(IDS_TURNO.map((turno) => [turno, Array(7).fill(null)]));
}

/** Un cuadro suelto, saneado: catorce casillas siempre, con el lunes en 0. */
function saneado(bruto) {
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
 * El cuadro no es uno: es la lista de los que ha habido, con el instante desde
 * el que valió cada uno.
 *
 * **Porque cambiar el reparto no puede reescribir el pasado.** Un turno sin fila
 * de `paseo` se deriva del cuadro, y con un solo cuadro se derivaba del de
 * ahora: el martes pasado que nadie marcó cambiaba de dueño al tocar Ajustes.
 * Con la lista, cada turno se deriva del que gobernaba cuando se abrió su
 * ventana. El porqué y las alternativas están en
 * `specs/propuesta-cuadro-con-vigencia.html`.
 *
 * Lo que hay guardado del formato viejo —un cuadro suelto— se lee como una
 * versión sin `desde`, que vale desde siempre; y una instantánea vieja en la
 * caché del dispositivo también, que es lo que hace que esto no rompa nada al
 * llegar.
 */
export function versionesDe(instantanea) {
  const bruto = instantanea?.lio_cuadro;
  if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
    return [{ desde: null, cuadro: saneado(bruto) }];
  }
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((version) => version && typeof version === 'object')
    .map((version) => ({
      desde: typeof version.desde === 'string' && version.desde ? version.desde : null,
      cuadro: saneado(version.cuadro),
    }))
    .sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || '')));
}

/**
 * Qué cuadro gobernaba en un instante: el último que empezó antes.
 *
 * Antes del primero vale el primero, que es lo más antiguo que se sabe del
 * reparto: un turno de hace tres meses no se queda sin dueño por haber sido
 * anterior a la primera vez que alguien tocó Ajustes.
 */
export function cuadroEn(instantanea, cuando) {
  const versiones = versionesDe(instantanea);
  if (!versiones.length) return cuadroVacio();
  const momento = (cuando instanceof Date ? cuando : new Date(cuando)).toISOString();
  let elegida = versiones[0];
  for (const version of versiones) {
    if (!version.desde || version.desde <= momento) elegida = version;
    else break;
  }
  return elegida.cuadro;
}

/** El cuadro que rige ahora, que es el que se edita en Ajustes y el que se
 *  enseña como reparto de la casa. */
export const cuadroDe = (instantanea) => cuadroEn(instantanea, new Date());

/**
 * ¿Hay Lío en esta casa?
 *
 * Mientras nadie haya puesto el cuadro no se dibuja nada: ni carril en la
 * semana, ni bloque en Hoy. Un módulo vacío ocupando sitio todos los días es
 * peor que no tenerlo, y quien no vive en casa ni siquiera recibe estos datos.
 */
export function hayLio(instantanea) {
  if (!instantanea) return false;
  // Cualquier versión con algo escrito cuenta: si el cuadro de ahora está vacío
  // pero hubo reparto en marzo, Lío existe y su historia se puede mirar.
  const conAlguien = versionesDe(instantanea).some((version) =>
    IDS_TURNO.some((turno) => version.cuadro[turno].some(Boolean)));
  if (conAlguien) return true;
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
  // **El cuadro que gobierna es el de cuando se abrió la ventana**, no el de
  // ahora: así, cambiar el reparto en Ajustes cambia lo que viene y no reescribe
  // el turno del martes pasado que nadie llegó a marcar.
  const cuadro = cuadroEn(instantanea, inicioDeVentana(dia, turnoId));
  // Y la fila manda sobre el cuadro: si existe es porque ese día no fue como
  // estaba previsto, y eso ya no lo cambia ningún reparto.
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
    // Si la ventana ha llegado a abrirse. Antes de que abra no se puede decir
    // que el perro haya salido —son las cuatro de la tarde y el turno de noche
    // empieza a las ocho—, así que lo único que cabe hacer con un turno por
    // venir es cambiarle el dueño.
    empezado: referencia >= inicioDeVentana(dia, turnoId),
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
 * «Ya está» y «Lo saqué yo»: queda escrito que el turno lo sacó quien lo dice.
 *
 * **Mientras el día está vivo, coger trabajo no necesita permiso.** Aunque el
 * turno fuera de otro se escribe en el acto: quien dice que ha sacado al perro
 * no le está imponiendo nada a la persona que lo tenía —le está quitando un
 * recado de encima—, y hacerle confirmar algo que solo le beneficia era ponerle
 * un trámite a una buena noticia.
 *
 * **Un turno ajeno que ya venció sin marcar es otra cosa**, y por eso es el
 * único caso que vuelve a pasar por el trato. Ahí no se está cargando con un
 * recado: se está escribiendo, un día después, qué pasó con el turno de otro. Y
 * eso puede ser una corrección o puede ser un error, así que lo confirma quien
 * lo tenía. Hasta que conteste, el turno se queda como estaba.
 *
 * Lo que sí sigue necesitando un sí en cualquier momento es lo contrario:
 * soltar el turno propio para que lo saque otro.
 *
 * El asignado no se toca. La fila conserva de quién era el turno y añade quién
 * lo sacó, que es lo que hace que el histórico siga contando lo que pasó de
 * verdad y no lo que estaba previsto.
 */
export async function marcarHecho(instantanea, turno) {
  const yo = instantanea.yo.id;

  if (turno.asignadoId && turno.asignadoId !== yo && turno.estado === 'sin-marcar') {
    await proponer(turno, {
      clase: 'correccion',
      proponente_id: yo,
      destinatario_id: turno.asignadoId,
      asignado_previo_id: turno.asignadoId,
    });
    return { marcado: false, pedidoA: turno.asignadoId };
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

/**
 * «No puedo»: se le pide a alguien que lo saque por uno.
 *
 * Hasta que conteste, el turno sigue siendo de quien lo pide.
 */
export function pedirCambio(instantanea, turno, aQuienId) {
  return proponer(turno, {
    clase: 'cambio',
    proponente_id: instantanea.yo.id,
    destinatario_id: aQuienId,
    asignado_previo_id: turno.asignadoId,
  });
}

/**
 * «Cógele el turno»: el turno de otro pasa a ser mío, sin preguntar.
 *
 * Por la misma razón que marcar: nadie necesita permiso para cargar con un
 * recado ajeno. Quien lo tenía se entera al mirar la semana y se encuentra un
 * turno menos, que es exactamente lo que quería quien se lo quitó.
 */
export function cogerTurno(instantanea, turno) {
  return guardar('paseo', idPaseo(turno.fechaIso, turno.turno.id), {
    fecha: turno.fechaIso,
    turno: turno.turno.id,
    asignado_id: instantanea.yo.id,
    activo: 1,
  });
}

/** Hacia quién va el turno si se acepta la propuesta: siempre el que no lo
 *  tenía. */
export const nuevoDuenoDe = (trato) => (
  trato.proponente_id === trato.asignado_previo_id ? trato.destinatario_id : trato.proponente_id
);

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
      asignado_id: nuevoDuenoDe(trato),
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
