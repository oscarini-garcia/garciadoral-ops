/**
 * Sesión propia: un JWT HS256 corto que el cliente presenta en cada petición.
 *
 * El token de Apple se verifica una sola vez, al iniciar sesión; a partir de ahí
 * el dispositivo lleva este otro, que solo este Worker sabe firmar. Guarda el
 * identificador de la persona, no el de Apple: la correspondencia entre ambos
 * vive en el registro y la mantiene un administrador (spec funcional §8).
 */

const VIGENCIA = 60 * 60 * 24 * 30; // treinta días

function datosABase64url(datos) {
  let binario = '';
  for (const octeto of new Uint8Array(datos)) binario += String.fromCharCode(octeto);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textoABase64url(texto) {
  return datosABase64url(new TextEncoder().encode(texto));
}

function base64urlATexto(texto) {
  const relleno = '='.repeat((4 - (texto.length % 4)) % 4);
  return atob((texto + relleno).replace(/-/g, '+').replace(/_/g, '/'));
}

async function clave(secreto) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function emitirSesion(secreto, persona, plataforma) {
  const ahora = Math.floor(Date.now() / 1000);
  const cabecera = textoABase64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = textoABase64url(
    JSON.stringify({
      sub: persona.id,
      rol: persona.rol,
      plataforma,
      iat: ahora,
      exp: ahora + VIGENCIA,
    }),
  );
  const firma = await crypto.subtle.sign(
    'HMAC',
    await clave(secreto),
    new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  );
  return `${cabecera}.${cuerpo}.${datosABase64url(firma)}`;
}

/** Devuelve el cuerpo del token si la firma y la vigencia son correctas. */
export async function verificarSesion(secreto, token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new Error('sesión mal formada');

  const [cabecera, cuerpo, firma] = partes;
  const esperada = await crypto.subtle.sign(
    'HMAC',
    await clave(secreto),
    new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  );
  if (datosABase64url(esperada) !== firma) throw new Error('firma de sesión inválida');

  const datos = JSON.parse(base64urlATexto(cuerpo));
  if (typeof datos.exp !== 'number' || datos.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('sesión caducada');
  }
  return datos;
}

/**
 * Comparación en tiempo constante, para el token de servicio del generador del
 * plan semanal. Una comparación normal filtra el secreto carácter a carácter.
 */
export function coincideEnTiempoConstante(a, b) {
  const A = new TextEncoder().encode(String(a || ''));
  const B = new TextEncoder().encode(String(b || ''));
  if (A.length !== B.length) return false;
  let diferencia = 0;
  for (let i = 0; i < A.length; i += 1) diferencia |= A[i] ^ B[i];
  return diferencia === 0;
}
