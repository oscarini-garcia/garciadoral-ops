/**
 * Lío: el cuadro semanal de paseos y las reglas que lo gobiernan en el servidor.
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

/** La casa está en Madrid, y las ventanas de los turnos son horas locales. El
 *  Worker corre en UTC, así que para saber si una ventana se ha abierto hay que
 *  traducir. */
const ZONA = 'Europe/Madrid';

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

/**
 * El cuadro no es uno: es una lista de los que ha habido, con la fecha desde la
 * que valió cada uno.
 *
 * **Porque cambiar el reparto no puede reescribir el pasado.** Un turno sin fila
 * de `paseo` se deriva del cuadro, y con un solo cuadro se derivaba del de
 * ahora: el martes pasado que nadie marcó cambiaba de dueño al tocar Ajustes, y
 * la aplicación pasaba a decir que le tocaba a alguien que aquel día no tenía
 * nada que ver. Con la lista, cada turno se deriva del cuadro que estaba en
 * vigor **cuando se abrió su ventana**, y lo que pasó, pasó.
 *
 * El formato viejo —un solo cuadro suelto— se lee como una versión sin `desde`,
 * que vale desde siempre. Por eso esto no necesita migración: lo que cambia es
 * la forma de dentro de un texto que la base no mira.
 */
export function normalizarVersiones(bruto) {
  // Lo que hay guardado de antes: un cuadro suelto, que valió desde siempre.
  if (bruto && typeof bruto === 'object' && !Array.isArray(bruto)) {
    return [{ desde: null, cuadro: normalizarCuadro(bruto) }];
  }
  if (!Array.isArray(bruto)) return [];

  return bruto
    .filter((version) => version && typeof version === 'object')
    .map((version) => ({
      desde: typeof version.desde === 'string' && version.desde ? version.desde : null,
      cuadro: normalizarCuadro(version.cuadro),
    }))
    // Sin `desde` solo puede ir la primera, y el orden es el que decide cuál
    // gobierna: se ordena al leer para no depender de cómo se escribió.
    .sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || '')));
}

/**
 * Qué cuadro gobernaba en un instante: el último que empezó antes.
 *
 * Si el instante es anterior a todos —un turno de antes de que esto se pusiera—
 * vale el primero, que es lo más antiguo que se sabe del reparto.
 */
export function cuadroEn(versiones, cuando) {
  if (!versiones.length) return cuadroVacio();
  const momento = cuando instanceof Date ? cuando.toISOString() : String(cuando);
  let elegida = versiones[0];
  for (const version of versiones) {
    if (!version.desde || version.desde <= momento) elegida = version;
    else break;
  }
  return elegida.cuadro;
}

/**
 * En qué tramo del día cae un instante, en hora local: antes de que abra la
 * mañana, entre las dos ventanas, o de la noche en adelante.
 *
 * Sirve para una sola cosa: saber si entre dos momentos se ha abierto alguna
 * ventana. Dos instantes del mismo tramo son indistinguibles para cualquier
 * turno, porque ninguno empezó entre medias.
 */
export function tramoLocal(momento) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  }).formatToParts(momento);
  const valor = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  const hora = Number(valor.hour) % 24;
  const franja = TURNOS.filter((turno) => hora >= turno.desde).length;
  return `${valor.year}-${valor.month}-${valor.day}:${franja}`;
}

export async function leerCuadro(db) {
  const fila = await db
    .prepare('SELECT valor FROM configuracion WHERE clave = ?')
    .bind(CLAVE_CUADRO)
    .first();
  if (!fila?.valor) return [];
  try {
    return normalizarVersiones(JSON.parse(fila.valor));
  } catch {
    return [];
  }
}

/**
 * Guardar no pisa lo que había: añade una versión que empieza ahora.
 *
 * **Salvo que la anterior no haya llegado a gobernar nada.** El cuadro se edita
 * a toques, uno por casilla, y cada toque guarda: catorce toques seguidos son
 * una sola decisión, y las trece versiones intermedias no rigieron ningún turno
 * porque entre ellas no se abrió ninguna ventana. Cuando eso pasa se sustituye
 * la última en lugar de apilar otra, y la lista crece una vez por cambio de
 * reparto y no una vez por toque.
 */
export async function guardarCuadro(db, persona, bruto, ahora = new Date()) {
  const versiones = await leerCuadro(db);
  const nueva = { desde: ahora.toISOString(), cuadro: normalizarCuadro(bruto) };

  const ultima = versiones[versiones.length - 1];
  const mismaTanda = Boolean(ultima?.desde) && tramoLocal(new Date(ultima.desde)) === tramoLocal(ahora);
  const siguientes = mismaTanda ? [...versiones.slice(0, -1), nueva] : [...versiones, nueva];

  await db
    .prepare(
      `INSERT INTO configuracion (clave, valor, actualizado_en, actualizado_por)
       VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(clave) DO UPDATE SET
         valor = excluded.valor,
         actualizado_en = excluded.actualizado_en,
         actualizado_por = excluded.actualizado_por`,
    )
    .bind(CLAVE_CUADRO, JSON.stringify(siguientes), persona.id)
    .run();
  return siguientes;
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
 * que ya pasaron.
 *
 * Una corrección habla del pasado y no vence con él, pero tampoco puede esperar
 * indefinidamente: se le da una semana **desde que se pide**, y no desde la
 * fecha del turno. Contándola desde el turno había un caso que fallaba callando:
 * quien marcaba un turno ajeno de hace más de siete días creaba una propuesta ya
 * caducada, que moría en la sincronización siguiente sin que nadie pudiera
 * aceptarla. Se veía marcar y no quedaba nada. Contada desde que se pide,
 * cualquier corrección tiene siempre su semana para que la contesten, sea de
 * anteayer o del mes pasado.
 *
 * Al caducar no hay nada que deshacer. Mientras una propuesta está pendiente el
 * turno sigue siendo de quien lo tenía —el trato no adelanta nada—, de modo que
 * caducar es exactamente no haber pasado nunca.
 */
export const DIAS_DE_GRACIA_CORRECCION = 7;

/**
 * Igual que en la lectura del registro: entre desplegar el Worker y marcar la
 * casilla de las migraciones hay una ventana en la que la tabla no existe, y
 * esto se ejecuta después de **cada** lote de cambios. Sin el resguardo, esa
 * ventana convierte cualquier escritura de la agenda en un error.
 */
const sinTablaTodavia = (error) => /no such table/i.test(String(error?.message || error));

export async function caducarTratos(db, ahora = new Date()) {
  const limiteCambio = ahora.toISOString();
  const limiteCorreccion = new Date(ahora.getTime() - DIAS_DE_GRACIA_CORRECCION * 86400000)
    .toISOString();

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

  try {
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
        // Por `creado_en` y no por `fecha`: el plazo corre desde que se pide. Lo
        // escribe `aplicarCambio` con la marca del dispositivo, en el mismo
        // formato ISO con el que se compara aquí.
        `UPDATE trato_paseo
            SET estado = 'caducado', resuelto_en = ?, actualizado_en = ?
          WHERE estado = 'pendiente' AND activo = 1 AND clase = 'correccion'
            AND creado_en < ?`,
      )
      .bind(limiteCambio, limiteCambio, limiteCorreccion)
      .run();
  } catch (error) {
    if (!sinTablaTodavia(error)) throw error;
  }
}
