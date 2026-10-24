/**
 * Adjuntos de una idea o de un regalo: fotos y algún PDF, guardados en D1.
 *
 * La foto llega ya reducida desde el teléfono —1600 puntos de lado, JPEG— con
 * su miniatura aparte, las dos en base64. La instantánea solo transmite la
 * ficha de cada adjunto (`FICHA`), y los bytes se piden de uno en uno, porque
 * meterlos en la instantánea haría que cada sincronización descargara todas
 * las fotos de la casa. Un adjunto hereda la visibilidad del objeto al que
 * pertenece, igual que un comentario (`comentables.js`): quien no ve la idea
 * no ve su foto, ni en la lista ni pidiéndola por su identificador.
 */

import { Rechazo } from './portero/errores.js';

/** A qué se puede adjuntar algo. */
export const ADJUNTABLES = ['idea', 'regalo'];

/** Lo que se acepta: las fotos, ya convertidas a JPEG en el teléfono, y PDF. */
export const TIPOS_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** Los topes, en bytes ya decodificados. Una fila de D1 no pasa de 2 MB, y el
 *  base64 crece un tercio. */
export const TOPE_DE_ADJUNTO = 1_200_000;
export const TOPE_DE_MINIATURA = 60_000;
/** Cuántos adjuntos caben en una misma idea o un mismo regalo. */
export const TOPE_POR_OBJETO = 12;

/** Las columnas que viajan en la instantánea: todo menos los bytes. */
export const FICHA = 'id, objeto_tipo, objeto_id, nombre, tipo_mime, tamano, ancho, alto, autor_id, activo, creado_en, actualizado_en';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Los bytes que ocupa un base64, sin decodificarlo. */
export function bytesDeBase64(texto) {
  const limpio = String(texto || '');
  if (!limpio || !BASE64.test(limpio)) return -1;
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0;
  return Math.floor((limpio.length * 3) / 4) - relleno;
}

/**
 * Comprueba un adjunto nuevo y devuelve la fila a insertar. `visibles` es la
 * instantánea de quien lo sube: solo se adjunta a lo que uno ve.
 */
export function prepararAdjunto(cuerpo, lector, visibles, { id, ahora, yaHay = 0 }) {
  const tipo = String(cuerpo?.objeto_tipo || '');
  const objetoId = String(cuerpo?.objeto_id || '');
  if (!ADJUNTABLES.includes(tipo)) throw new Rechazo('solo se adjunta a una idea o a un regalo');
  const coleccion = tipo === 'idea' ? visibles.ideas : visibles.regalos;
  if (!(coleccion || []).some((o) => o.id === objetoId)) throw new Rechazo('no se encuentra esa idea o ese regalo');
  if (yaHay >= TOPE_POR_OBJETO) throw new Rechazo(`caben ${TOPE_POR_OBJETO} adjuntos; quita alguno antes`);

  const mime = String(cuerpo?.tipo_mime || '');
  if (!TIPOS_ADMITIDOS.includes(mime)) throw new Rechazo('se adjuntan fotos y PDF');

  const datos = String(cuerpo?.datos || '');
  const tamano = bytesDeBase64(datos);
  if (tamano <= 0) throw new Rechazo('el adjunto llegó vacío o dañado');
  if (tamano > TOPE_DE_ADJUNTO) throw new Rechazo('el adjunto pasa de 1,2 MB');

  const miniatura = cuerpo?.miniatura ? String(cuerpo.miniatura) : null;
  if (miniatura) {
    const pesa = bytesDeBase64(miniatura);
    if (pesa <= 0 || pesa > TOPE_DE_MINIATURA) throw new Rechazo('la miniatura no es válida');
  }

  const entero = (valor) => (Number.isFinite(Number(valor)) && Number(valor) > 0 ? Math.round(Number(valor)) : null);
  return {
    id,
    objeto_tipo: tipo,
    objeto_id: objetoId,
    nombre: String(cuerpo?.nombre || '').trim().slice(0, 120) || null,
    tipo_mime: mime,
    tamano,
    ancho: entero(cuerpo?.ancho),
    alto: entero(cuerpo?.alto),
    datos,
    miniatura,
    autor_id: lector.id,
    activo: 1,
    creado_en: ahora,
    actualizado_en: ahora,
  };
}

/** Los adjuntos que sobreviven al recorte: los de lo que ya viaja. */
export function adjuntosVisibles(adjuntos, { ideas = [], regalos = [] }) {
  const ids = { idea: new Set(ideas.map((i) => i.id)), regalo: new Set(regalos.map((r) => r.id)) };
  return (adjuntos || []).filter((a) => ids[a.objeto_tipo]?.has(a.objeto_id));
}

/** De base64 a bytes, para devolverlos tal cual. */
export function bytesDe(texto) {
  const binario = atob(texto);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
