/**
 * Lio: el cuadro semanal de paseos y las reglas que lo gobiernan en el servidor.
 *
 * Espejo de `pwa/publico/js/lio.js` y de `scripts/agenda/lio.py`. Lo que vive
 * aquí es lo que el Worker necesita saber por su cuenta: qué es un turno, dónde
 * se guarda el cuadro, quién puede tocar qué y cuándo una propuesta sin
 * contestar deja de estar viva.
 *
 * Los turnos son dos y sus ventanas están fijadas: mañana de 6 a 10 y noche de
 * 20 a 24. No son configurables a propósito —una tercera cifra por ajustar es
 * una pregunta más en una pantalla que ya hace catorce—, y sirven para lo único
 * que el sistema decide solo: cuándo un turno previsto pasa a estar sin marcar.
 *
 * Las entidades y su alcance están en `specs/modelo-datos.md` §2.6.
 */

export const CLAVE_CUADRO = 'lio.cuadro';

export const TURNOS = [
  { id: 'manana', nombre: 'Mañana', emoji: '☀️', desde: 6, hasta: 10 },
  { id: 'noche', nombre: 'Noche', emoji: '🌙', desde: 20, hasta: 24 },
];

export const IDS_TURNO = TURNOS.map((t) => t.id);

/** Catorce casillas vacías: siete días, dos turnos, con el lunes en 0. */
export function cuadroVacio() {
  return Object.fromEntries(IDS_TURNO.map((turno) => [turno, Array(7).fill(null)]));
}

/**
 * El cuadro tal como se guarda, saneado.
 *
 * Se sanea al leer y no solo al escribir porque la fila de `configuracion` es
 * texto libre para la base: un JSON a medias, escrito por una versión anterior o
 * por una mano, no puede tumbar la sincronización de todo el hogar.
 */
export function normalizarCuadro(bruto) {
  const cuadro = cuadroVacio();
  if (!bruto || typeof bruto !== 'object') return cuadro;
  for (const turno of IDS_TURNO) {
    const fila = Array.isArray(bruto[turno]) ? bruto[turno] : [];
    for (let dia = 0; dia < 7; dia += 1) {
      const valor = fila[dia];
      cuadro[turno][dia] = typeof valor === 'string' && valor ? valor : null;
    }
  }
  return cuadro;
}

export async function leerCuadro(db) {
  const fila = await db
    .prepare('SELECT valor FROM configuracion WHERE clave = ?')
    .bind(CLAVE_CUADRO)
    .first();
  if (!fila?.valor) return cuadroVacio();
  try {
    return normalizarCuadro(JSON.parse(fila.valor));
  } catch {
    return cuadroVacio();
  }
}

export async function guardarCuadro(db, persona, bruto) {
  const cuadro = normalizarCuadro(bruto);
  await db
    .prepare(
      `INSERT INTO configuracion (clave, valor, actualizado_en, actualizado_por)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(clave) DO UPDATE SET
         valor = excluded.valor,
         actualizado_en = excluded.actualizado_en,
         actualizado_por = excluded.actualizado_por`,
    )
    .bind(CLAVE_CUADRO, JSON.stringify(cuadro), persona.id)
    .run();
  return cuadro;
}

/**
 * Quién ve y toca los paseos: los cuatro de casa, y nadie más.
 *
 * No pasa por la función de visibilidad general porque no es la misma pregunta.
 * Aquella oculta una cosa a su destinatario —el regalo a quien lo va a
 * recibir—; esta acota un módulo entero a un círculo. Mezclarlas obligaría a
 * inventar un «destinatario» para algo que no lo tiene.
 */
export function esDeLaCasa(persona) {
  return Boolean(persona && persona.tiene_cuenta && persona.circulo === 'familia');
}

/**
 * Propuestas que ya no pueden aceptarse, y a qué vuelve el turno.
 *
 * Un cambio caduca cuando termina la ventana de su turno: aceptarlo después no
 * significaría nada, y dejarlo vivo llenaría la bandeja de peticiones de días
 * que ya pasaron. Una corrección habla del pasado y no vence con él, pero
 * tampoco puede esperar indefinidamente: se le da una semana.
 *
 * Al caducar no hay nada que deshacer. Mientras una propuesta está pendiente el
 * turno sigue siendo de quien lo tenía —el trato no adelanta nada—, de modo que
 * caducar es exactamente no haber pasado nunca.
 */
export const DIAS_DE_GRACIA_CORRECCION = 7;

export async function caducarTratos(db, ahora = new Date()) {
  const limiteCambio = ahora.toISOString();
  const limiteCorreccion = new Date(ahora.getTime() - DIAS_DE_GRACIA_CORRECCION * 86400000)
    .toISOString()
    .slice(0, 10);

  // El fin de la ventana se compone en SQL a partir de la fecha del turno para
  // no traerse las filas al Worker solo para compararlas con el reloj. La
  // comparación es lexicográfica y funciona con las 24:00 de la noche, que no
  // es una hora válida pero sí ordena donde debe: después de las 23:59 de su
  // día y antes de las 00:00 del siguiente.
  //
  // El reloj del Worker es UTC y las ventanas son de aquí, así que en verano la
  // caducidad llega dos horas tarde. Se acepta a sabiendas: el error va hacia el
  // lado seguro —una propuesta nunca caduca antes de tiempo— y la alternativa
  // sería meter una zona horaria en la base para ganar dos horas.
  const finales = TURNOS.map((t) => `WHEN '${t.id}' THEN '${String(t.hasta).padStart(2, '0')}:00:00'`).join(' ');

  await db
    .prepare(
      `UPDATE trato_paseo
          SET estado = 'caducado', resuelto_en = ?, actualizado_en = ?
        WHERE estado = 'pendiente' AND activo = 1 AND clase = 'cambio'
          AND fecha || 'T' || (CASE turno ${finales} ELSE '23:59:59' END) < ?`,
    )
    .bind(limiteCambio, limiteCambio, limiteCambio)
    .run();

  await db
    .prepare(
      `UPDATE trato_paseo
          SET estado = 'caducado', resuelto_en = ?, actualizado_en = ?
        WHERE estado = 'pendiente' AND activo = 1 AND clase = 'correccion'
          AND fecha < ?`,
    )
    .bind(limiteCambio, limiteCambio, limiteCorreccion)
    .run();
}
