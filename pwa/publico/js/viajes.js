/**
 * Los viajes de cada uno, emparejados a partir de sus vuelos.
 *
 * Flighty manda vuelos, no viajes: el de ida un sábado y el de vuelta un
 * martes, y en medio nada. La agenda enseñaba las dos líneas sueltas y el
 * domingo no decía que Óscar no estaba. Lo que se eligió
 * (`specs/propuesta-plugins-hojas.html`, C2) es la banda en los días de vuelo y
 * una línea gris —«Óscar fuera»— en los de en medio, sin inventar un viaje:
 * los vuelos siguen siendo los dos que llegaron.
 *
 * **Cómo se emparejan.** Los vuelos de un mismo calendario se recorren por
 * fecha; una ida abre un viaje y se encadena con lo que salga desde donde ha
 * llegado —una escala, otra ciudad—, y el viaje se cierra cuando un vuelo vuelve
 * a la ciudad de la que salió el primero, o cuando pasan más de treinta días.
 * Con la ciudad de origen y no con «casa», porque la casa no se sabe: el
 * calendario no lo dice y no hace falta que lo diga.
 *
 * **Y lo que no se puede trazar se escribe a mano.** Quien va a un sitio y
 * vuelve en tren no tiene vuelo de vuelta, y el emparejado lo dejaría fuera
 * para siempre. Un vuelo importado admite en `extra.vuelta` la fecha en que se
 * vuelve, puesta desde su hoja; con ella el viaje se cierra ahí aunque no haya
 * vuelo, y sin ella el viaje sin vuelta no dice nada de los días de después.
 */

import { estaActivo, presentarVuelo } from './modelo.js';
import { iso, parsearMomento, soloFecha, sumarDias } from './semana.js';

/** A partir de cuántos días sin volver se deja de esperar la vuelta. */
const DIAS_DE_UN_VIAJE = 30;

/** Los vuelos importados vivos, con lo que hace falta para emparejarlos. */
function vuelosDe(instantanea) {
  return (instantanea?.eventos || [])
    .filter((e) => e.origen === 'importado' && estaActivo(e))
    .map((evento) => ({ evento, vuelo: presentarVuelo(evento), dia: soloFecha(parsearMomento(evento.inicio)) }))
    .filter((v) => v.vuelo && v.dia && !Number.isNaN(v.dia.getTime()))
    .sort((a, b) => a.dia - b.dia || String(a.evento.inicio).localeCompare(String(b.evento.inicio)));
}

const ciudad = (vuelo, lado) => String(vuelo?.[lado] || vuelo?.[lado === 'origen' ? 'codigoOrigen' : 'codigoDestino'] || '')
  .trim().toLowerCase();

/**
 * Los viajes de la instantánea: por cada uno, el vuelo de ida, el de vuelta si
 * lo hay, de quién es el calendario y entre qué días —ambos incluidos— se está
 * fuera.
 *
 * `vuelta` puede ser `null` con `hasta` puesto: es la vuelta escrita a mano.
 */
export function viajesDe(instantanea) {
  const porCalendario = new Map();
  for (const vuelo of vuelosDe(instantanea)) {
    const clave = vuelo.evento.calendario_id || 'sin-calendario';
    if (!porCalendario.has(clave)) porCalendario.set(clave, []);
    porCalendario.get(clave).push(vuelo);
  }

  const viajes = [];
  for (const [calendarioId, vuelos] of porCalendario) {
    let abierto = null;
    for (const actual of vuelos) {
      if (abierto) {
        const enlaza = ciudad(actual.vuelo, 'origen') === abierto.donde;
        const tarde = (actual.dia - abierto.ida.dia) / 86400000 > DIAS_DE_UN_VIAJE;
        if (enlaza && !tarde) {
          abierto.tramos.push(actual);
          abierto.donde = ciudad(actual.vuelo, 'destino');
          if (abierto.donde === abierto.origen) {
            abierto.vuelta = actual;
            viajes.push(cerrar(abierto, calendarioId));
            abierto = null;
          }
          continue;
        }
        viajes.push(cerrar(abierto, calendarioId));
        abierto = null;
      }
      abierto = {
        ida: actual,
        tramos: [actual],
        origen: ciudad(actual.vuelo, 'origen'),
        donde: ciudad(actual.vuelo, 'destino'),
        vuelta: null,
      };
    }
    if (abierto) viajes.push(cerrar(abierto, calendarioId));
  }
  return viajes.sort((a, b) => a.desde - b.desde);
}

function cerrar(viaje, calendarioId) {
  const desde = viaje.ida.dia;
  const escrita = viaje.ida.evento.extra?.vuelta ? soloFecha(parsearMomento(viaje.ida.evento.extra.vuelta)) : null;
  // La vuelta trazada manda; la escrita a mano solo vale cuando no hay vuelo
  // de vuelta, que es exactamente el caso para el que existe.
  const hasta = viaje.vuelta ? viaje.vuelta.dia : (escrita && escrita >= desde ? escrita : null);
  return {
    calendarioId,
    ida: viaje.ida.evento,
    vuelta: viaje.vuelta ? viaje.vuelta.evento : null,
    tramos: viaje.tramos.map((t) => t.evento),
    desde,
    hasta,
    destino: viaje.ida.vuelo.destino || viaje.ida.vuelo.codigoDestino || null,
    vueltaEscrita: Boolean(!viaje.vuelta && escrita),
  };
}

/** El viaje del que forma parte un vuelo, o `null`. */
export function viajeDelVuelo(instantanea, eventoId) {
  return viajesDe(instantanea).find((v) => v.tramos.some((t) => t.id === eventoId)) || null;
}

/**
 * Los días de en medio, como eventos derivados de un día entero: «Óscar fuera»
 * del día siguiente a la ida al anterior a la vuelta. Un viaje de ida y vuelta
 * en el mismo día, o de días seguidos, no deja ninguno.
 */
export function eventosDeFuera(instantanea) {
  const derivados = [];
  for (const viaje of viajesDe(instantanea)) {
    if (!viaje.hasta) continue;
    const primero = sumarDias(viaje.desde, 1);
    const ultimo = sumarDias(viaje.hasta, -1);
    if (ultimo < primero) continue;
    const calendario = (instantanea.calendarios_externos || []).find((c) => c.id === viaje.calendarioId);
    const dueno = calendario?.persona_id
      ? (instantanea.personas || []).find((p) => p.id === calendario.persona_id)
      : null;
    derivados.push({
      id: `derivado:fuera:${viaje.ida.id}`,
      titulo: dueno ? `${dueno.nombre} fuera` : 'Fuera',
      tipo_id: 'viaje',
      emoji: '✈️',
      inicio: iso(primero),
      fin: iso(ultimo),
      jornada_completa: true,
      repeticion: 'ninguna',
      origen: 'derivado',
      calendario_id: viaje.calendarioId,
      // Lo que enseña el detalle: adónde y hasta cuándo, sin inventar nada más.
      extra: { viaje: viaje.ida.id, destino: viaje.destino, hasta: iso(viaje.hasta) },
      participantes: [],
      activo: true,
    });
  }
  return derivados;
}
