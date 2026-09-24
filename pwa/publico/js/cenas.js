/**
 * Cenas: el recetario de la casa, lo que se cena cada noche y su veredicto.
 *
 * Lo decidido está al pie de `specs/propuesta-cenas.html` (A4 · B1 · C1 · D1 ·
 * E1 · F1). Una cena es una noche, con el identificador compuesto
 * `cena:<fecha>`, y enlaza una receta o lleva texto suelto; lo de las niñas va
 * aparte, con la misma forma, porque a veces no cenan lo mismo. Lo planeado
 * cuenta como cenado salvo que se corrija (F1): no hay casilla de «cenado».
 *
 * Aquí solo hay consultas y escrituras sobre la instantánea; lo que se dibuja
 * está en `vistas/cenas.js` y el bloque de Hoy, en `vistas/hoy.js`.
 */

import { estaActivo, nuevoId } from './modelo.js';
import { guardar } from './sincronizacion.js';
import { iso, lunesDe, sumarDias } from './semana.js';

export const VEREDICTOS = [
  { id: 'repetir', nombre: 'Repetir', emoji: '👍' },
  { id: 'no_mas', nombre: 'No más', emoji: '👎' },
];

export const idCena = (fecha) => `cena:${fecha}`;

/** ¿Hay Cenas para quien mira? Fuera de casa la instantánea no las trae. */
export const hayCenas = (datos) => Array.isArray(datos?.cenas);

export const recetas = (datos) => (datos.recetas || [])
  .filter((r) => estaActivo(r))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

export const recetaPorId = (datos, id) =>
  (id && (datos.recetas || []).find((r) => r.id === id && estaActivo(r))) || null;

/** La cena de una noche, o `null` si no hay nada escrito. */
export function cenaDe(datos, fecha) {
  const cena = (datos.cenas || []).find((c) => c.id === idCena(fecha));
  return cena && estaActivo(cena) ? cena : null;
}

/** El nombre de un plato: la receta enlazada, o el texto suelto. La receta se
 *  busca aunque se haya quitado del recetario: quitarla no borra lo cenado. */
function plato(datos, recetaId, texto) {
  const receta = recetaId ? (datos.recetas || []).find((r) => r.id === recetaId) : null;
  return receta?.nombre || String(texto || '').trim() || '';
}

export const platoDe = (datos, cena) => (cena ? plato(datos, cena.receta_id, cena.texto) : '');
export const platoDeLasNinas = (datos, cena) => (cena ? plato(datos, cena.ninas_receta_id, cena.ninas_texto) : '');

/** Las siete noches de la semana que contiene `dia`, de lunes a domingo. */
export const nochesDeLaSemana = (dia) => Array.from({ length: 7 }, (_, i) => sumarDias(lunesDe(dia), i));

/** Lo último que se dijo de una receta, que es lo que cuenta. */
export function veredictoDeReceta(datos, recetaId) {
  let ultimo = null;
  for (const cena of datos.cenas || []) {
    if (!estaActivo(cena) || cena.receta_id !== recetaId || !cena.veredicto) continue;
    if (!ultimo || cena.fecha > ultimo.fecha) ultimo = cena;
  }
  return ultimo?.veredicto || null;
}

/** Cuántas veces se ha cenado y cuándo fue la última. */
export function usoDeReceta(datos, recetaId) {
  const suyas = (datos.cenas || []).filter((c) => estaActivo(c) && c.receta_id === recetaId);
  const ultima = suyas.reduce((max, c) => (c.fecha > max ? c.fecha : max), '');
  return { veces: suyas.length, ultima: ultima || null };
}

/** La receta que se llama así, sin mirar mayúsculas: escribir un nombre del
 *  recetario enlaza esa receta en vez de dejar un texto suelto igual. */
export function recetaPorNombre(datos, nombre) {
  const buscado = String(nombre || '').trim().toLocaleLowerCase('es');
  if (!buscado) return null;
  return recetas(datos).find((r) => r.nombre.trim().toLocaleLowerCase('es') === buscado) || null;
}

/**
 * Escribe lo que se cena una noche.
 *
 * `que` y `ninas` son texto: si coincide con una receta del recetario se
 * enlaza, y si no se guarda tal cual. Solo se tocan los campos que vengan.
 */
export async function escribirNoche(datos, fecha, { que, ninas, veredicto } = {}, autorId) {
  const clave = typeof fecha === 'string' ? fecha : iso(fecha);
  const anterior = cenaDe(datos, clave);
  const campos = { fecha: clave, autor_id: anterior?.autor_id || autorId, activo: 1 };

  if (que !== undefined) {
    const receta = recetaPorNombre(datos, que);
    campos.receta_id = receta?.id || null;
    campos.texto = receta ? null : (String(que).trim() || null);
    // Cambiar de plato deja sin sentido lo que se dijo del anterior.
    if (anterior && platoDe(datos, anterior) !== (receta?.nombre || String(que).trim())) campos.veredicto = null;
  }
  if (ninas !== undefined) {
    const receta = recetaPorNombre(datos, ninas);
    campos.ninas_receta_id = receta?.id || null;
    campos.ninas_texto = receta ? null : (String(ninas).trim() || null);
  }
  if (veredicto !== undefined) campos.veredicto = veredicto || null;

  return guardar('cena', idCena(clave), campos);
}

/** Deja una noche sin nada. No borra la receta, que sigue en el recetario. */
export const vaciarNoche = (fecha) => guardar('cena', idCena(fecha), { activo: 0 });

/**
 * Elegir una propuesta de la IA: la escribe en el recetario —si no estaba— y
 * en la noche, con lo de las niñas si lo trae (`specs/propuesta-cenas.html`,
 * B1: «la escribe la IA al elegir una propuesta»).
 */
export async function elegirPropuesta(datos, fecha, propuesta, autorId) {
  const nombre = String(propuesta.que || '').trim();
  if (!nombre) return null;

  let receta = recetaPorNombre(datos, nombre);
  if (!receta) {
    receta = { id: nuevoId(), nombre };
    await guardar('receta', receta.id, {
      nombre, nota: propuesta.porque || null, autor_id: autorId, activo: 1,
    });
  }

  const campos = {
    fecha, receta_id: receta.id, texto: null, veredicto: null, autor_id: autorId, activo: 1,
  };
  const ninas = String(propuesta.ninas || '').trim();
  if (ninas) {
    campos.ninas_receta_id = null;
    campos.ninas_texto = ninas;
  }
  return guardar('cena', idCena(fecha), campos);
}

/**
 * Lo ya apuntado una noche, con la forma de una propuesta: es la primera
 * alternativa de sus flechas, para poder quedarse con ello sin reescribirlo
 * (`specs/propuesta-cenas-segunda-vuelta.html`, C1). `null` si no hay nada.
 */
export function laQueHay(datos, fecha) {
  const cena = cenaDe(datos, fecha);
  const que = platoDe(datos, cena);
  if (!que) return null;
  return { que, porque: 'La que hay apuntada', ninas: platoDeLasNinas(datos, cena), actual: true };
}

const DIAS_SIN_REPETIR = 7;

/**
 * «De las de siempre», sin IA (D4): del recetario, lo que no se ha dicho que
 * no, empezando por lo que gustó y dentro de eso por lo que lleva más tiempo
 * sin cenarse. Lo cenado la última semana no se ofrece.
 */
export function deLasDeSiempre(datos, fecha, { descartadas = [], cuantas = 5 } = {}) {
  const fuera = new Set(descartadas.map((d) => String(d).toLocaleLowerCase('es')));
  const limite = iso(sumarDias(new Date(`${fecha}T12:00:00`), -DIAS_SIN_REPETIR));
  const dias = (desde) => Math.round((Date.parse(fecha) - Date.parse(desde)) / 86400000);

  return recetas(datos)
    .map((receta) => ({ receta, veredicto: veredictoDeReceta(datos, receta.id), uso: usoDeReceta(datos, receta.id) }))
    .filter(({ receta, veredicto, uso }) => veredicto !== 'no_mas'
      && !fuera.has(receta.nombre.toLocaleLowerCase('es'))
      && !(uso.ultima && uso.ultima > limite && uso.ultima <= fecha))
    .sort((a, b) => (a.veredicto === 'repetir' ? 0 : 1) - (b.veredicto === 'repetir' ? 0 : 1)
      || (a.uso.ultima || '').localeCompare(b.uso.ultima || ''))
    .slice(0, cuantas)
    .map(({ receta, veredicto, uso }) => ({
      que: receta.nombre,
      porque: [
        veredicto === 'repetir' ? 'Gustó' : null,
        uso.ultima ? `la última, hace ${dias(uso.ultima)} días` : 'sin cenar todavía',
        receta.como,
      ].filter(Boolean).join(' · '),
      ninas: '',
    }));
}
