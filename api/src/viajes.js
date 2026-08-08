/**
 * El calendario de viajes: descarga del feed, reconciliación y sello.
 *
 * Realiza lo que la spec (`specs/calendario-viajes.md`) encomienda al servidor:
 * descargar el `.ics` privado —cuya URL es un secreto que no sale de aquí (§8)—,
 * traducirlo con `ical.js` y llevar el resultado al registro canónico
 * reconciliando por UID (§5.2). La descarga vive en el Worker, no en el
 * dispositivo, por el secreto y porque aquí es donde se escribe el registro (§5.1).
 *
 * Tres reglas gobiernan la escritura:
 *
 * - **El identificador del evento se deriva del UID**, de modo que la siguiente
 *   sincronización actualice en lugar de duplicar.
 * - **El emoji no se toca.** Es un dato propio de la aplicación (§6.1): el
 *   importador escribe el contenido y deja el emoji como esté, para que un
 *   cambio del título en Google no borre el avión que alguien eligió.
 * - **Nada se borra.** Un viaje que desaparece del feed, o que llega cancelado,
 *   se marca inactivo; no se elimina (§5.2). Y una descarga fallida conserva el
 *   último estado: un feed vacío por un error de red no cancela los viajes (§5.3).
 */

import { inspeccionarICal, ZONA } from './ical.js';

/** El calendario que siembra `migraciones/0014_viajes.sql`. */
export const CALENDARIO_VIAJES = 'cal-viajes';

/** Identificador estable de un viaje a partir del calendario y el UID. Un hash
 *  de 64 bits en hexadecimal: determinista, sin caracteres raros del UID y con
 *  colisión despreciable para la escala de una casa. */
export function idDeViaje(calendarioId, uid) {
  const semilla = `${calendarioId} ${uid}`;
  // FNV-1a de 64 bits con BigInt: el UID de Google es largo y de caracteres
  // libres, y meterlo crudo en el id lo haría frágil.
  let h = 0xcbf29ce484222325n;
  const primo = 0x100000001b3n;
  const mascara = 0xffffffffffffffffn;
  for (let i = 0; i < semilla.length; i += 1) {
    h ^= BigInt(semilla.charCodeAt(i));
    h = (h * primo) & mascara;
  }
  return `viaje-${h.toString(16).padStart(16, '0')}`;
}

const b01 = (v) => (v ? 1 : 0);

/** Los campos de contenido que el importador gobierna. El emoji queda fuera a
 *  propósito: es del dueño, no del feed. */
function contenidoDe(evento, tipoEventoId, calendarioId) {
  return {
    titulo: evento.titulo || 'Viaje',
    tipo_id: tipoEventoId,
    inicio: evento.inicio,
    fin: evento.fin,
    jornada_completa: b01(evento.jornadaCompleta),
    ubicacion: evento.ubicacion || '',
    notas: evento.notas || '',
    origen: 'importado',
    calendario_id: calendarioId,
    activo: evento.cancelado ? 0 : 1,
  };
}

/** ¿Difiere lo que hay en la base de lo que trae el feed, en los campos que el
 *  importador gobierna? Se compara solo eso para no reescribir —y con ello
 *  resellar la última modificación— cuando nada ha cambiado. */
function cambia(fila, contenido) {
  return (
    fila.titulo !== contenido.titulo ||
    (fila.inicio || null) !== (contenido.inicio || null) ||
    (fila.fin || null) !== (contenido.fin || null) ||
    b01(fila.jornada_completa) !== contenido.jornada_completa ||
    (fila.ubicacion || '') !== contenido.ubicacion ||
    (fila.notas || '') !== contenido.notas ||
    b01(fila.activo) !== contenido.activo ||
    fila.origen !== 'importado'
  );
}

/**
 * Lo que pasó en la última sincronización, en una línea legible.
 *
 * No es un registro de depuración: es lo que Ajustes escribe para que se pueda
 * contestar «¿por qué no está mi vuelo?» sin abrir nada.
 * `ultima_sincronizacion` solo se toca cuando sale bien —es la fecha de la
 * última correcta—, así que un fallo tenía que dejar rastro en otro sitio o no
 * dejarlo en ninguno, que es lo que pasaba.
 */
function resumenEnUnaLinea(r) {
  if (r.estado !== 'ok') {
    return `error al descargar${r.codigo ? ` (${r.codigo})` : ''}${r.mensaje ? `: ${r.mensaje}` : ''}`;
  }
  const partes = [
    `${r.vistos} en el feed`,
    `${r.importables} legibles`,
    `${r.altas} nuevos`,
    `${r.cambios} cambios`,
    `${r.bajas} retirados`,
  ];
  if (r.ignorados?.length) {
    partes.push(`descartados: ${r.ignorados.map((i) => i.motivo).join('; ')}`);
  }
  return partes.join(' · ');
}

/** Deja el resultado en el propio calendario, que ya viaja en la instantánea. */
async function anotarResultado(db, calendarioId, ahora, texto) {
  try {
    await db
      .prepare('UPDATE calendario_externo SET ultimo_resultado = ?, ultimo_intento = ? WHERE id = ?')
      .bind(texto, ahora, calendarioId)
      .run();
  } catch (error) {
    // Las columnas llegan con la 0019. Entre desplegar y migrar hay una ventana,
    // y no vale la pena tumbar una sincronización por no poder anotarla.
    if (!/no such column/i.test(String(error?.message || error))) throw error;
  }
}

/**
 * Lleva los eventos ya parseados al registro, reconciliando por identificador.
 *
 * @returns {{altas:number, cambios:number, bajas:number}}
 */
export async function reconciliarViajes(db, { calendarioId, tipoEventoId, eventos, ahora }) {
  const existentes = new Map();
  const consulta = await db
    .prepare('SELECT * FROM evento WHERE calendario_id = ?')
    .bind(calendarioId)
    .all();
  for (const fila of consulta?.results || []) existentes.set(fila.id, fila);

  const deseados = new Set();
  let altas = 0;
  let cambios = 0;

  for (const evento of eventos) {
    const id = idDeViaje(calendarioId, evento.uid);
    deseados.add(id);
    const contenido = contenidoDe(evento, tipoEventoId, calendarioId);
    const fila = existentes.get(id);

    if (!fila) {
      await db
        .prepare(
          `INSERT INTO evento
             (id, titulo, tipo_id, inicio, fin, jornada_completa, ubicacion, notas,
              origen, calendario_id, activo, creado_en, actualizado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'importado', ?, ?, ?, ?)`,
        )
        .bind(
          id, contenido.titulo, contenido.tipo_id, contenido.inicio, contenido.fin,
          contenido.jornada_completa, contenido.ubicacion, contenido.notas,
          contenido.calendario_id, contenido.activo, ahora, ahora,
        )
        .run();
      altas += 1;
    } else if (cambia(fila, contenido)) {
      await db
        .prepare(
          `UPDATE evento SET
             titulo = ?, tipo_id = ?, inicio = ?, fin = ?, jornada_completa = ?,
             ubicacion = ?, notas = ?, origen = 'importado', calendario_id = ?,
             activo = ?, actualizado_en = ?
           WHERE id = ?`,
        )
        .bind(
          contenido.titulo, contenido.tipo_id, contenido.inicio, contenido.fin,
          contenido.jornada_completa, contenido.ubicacion, contenido.notas,
          contenido.calendario_id, contenido.activo, ahora, id,
        )
        .run();
      cambios += 1;
    }
  }

  // Bajas: lo que estaba activo y ya no aparece en el feed. No se borra.
  let bajas = 0;
  for (const [id, fila] of existentes) {
    if (!deseados.has(id) && b01(fila.activo) === 1) {
      await db
        .prepare('UPDATE evento SET activo = 0, actualizado_en = ? WHERE id = ?')
        .bind(ahora, id)
        .run();
      bajas += 1;
    }
  }

  return { altas, cambios, bajas };
}

/**
 * Sincroniza el calendario de viajes de punta a punta: descarga, parseo,
 * reconciliación y sello. La usa tanto el cron del Worker como la ruta manual.
 *
 * `descargar` se inyecta para poder probar sin red; por defecto es `fetch`.
 * Devuelve un resumen, y en caso de fallo de descarga **no toca nada** y lo
 * refleja en `estado`.
 */
export async function sincronizarViajes(env, {
  ahora,
  descargar = (url) => fetch(url),
  calendarioId = CALENDARIO_VIAJES,
} = {}) {
  const url = (env.VIAJES_ICAL_URL || '').trim();
  if (!url) return { estado: 'sin-configurar' };

  const cal = await env.DB
    .prepare('SELECT id, tipo_evento_id FROM calendario_externo WHERE id = ?')
    .bind(calendarioId)
    .first();
  if (!cal) return { estado: 'sin-calendario' };

  let texto;
  try {
    const respuesta = await descargar(url);
    if (!respuesta || !respuesta.ok) {
      const fallo = { estado: 'error-descarga', codigo: respuesta?.status ?? 0 };
      await anotarResultado(env.DB, calendarioId, ahora, resumenEnUnaLinea(fallo));
      return fallo;
    }
    texto = await respuesta.text();
  } catch (error) {
    const fallo = { estado: 'error-descarga', mensaje: String(error?.message || error) };
    await anotarResultado(env.DB, calendarioId, ahora, resumenEnUnaLinea(fallo));
    return fallo;
  }

  // Se inspecciona en vez de solo parsear: hace falta poder distinguir «el feed
  // vino vacío» de «el feed trae cosas y no las entiendo». Desde la agenda las
  // dos se ven igual —no hay viaje— y hasta ahora las dos decían «sin cambios».
  const { vistos, eventos, ignorados } = inspeccionarICal(texto, ZONA);
  const resumen = await reconciliarViajes(env.DB, {
    calendarioId,
    tipoEventoId: cal.tipo_evento_id,
    eventos,
    ahora,
  });

  const lectura = {
    bytes: texto.length,
    vistos,
    importables: eventos.length,
    ignorados: ignorados.slice(0, 5),
  };

  await anotarResultado(env.DB, calendarioId, ahora, resumenEnUnaLinea({ estado: 'ok', ...resumen, ...lectura }));
  await env.DB
    .prepare('UPDATE calendario_externo SET ultima_sincronizacion = ? WHERE id = ?')
    .bind(ahora, calendarioId)
    .run();

  return { estado: 'ok', ...resumen, ...lectura };
}
