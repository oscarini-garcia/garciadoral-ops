/**
 * Sesión propia: un JWT HS256 corto que el cliente presenta en cada petición.
 *
 * El token de Apple se verifica una sola vez, al iniciar sesión; a partir de ahí
 * el dispositivo lleva este otro, que solo este Worker sabe firmar. Guarda el
 * identificador de la persona, no el de Apple: la correspondencia entre ambos
 * vive en el registro y la mantiene un administrador (spec funcional §8).
 */

const VIGENCIA = 60 * 60 * 24 * 30; // treinta días

/**
 * La sesión de espera dura menos porque no acredita nada: solo permite
 * preguntar si ya te han aprobado y retirar tu solicitud. Siete días cubren de
 * sobra la vida de una solicitud, que caduca a los catorce.
 */
const VIGENCIA_ESPERA = 60 * 60 * 24 * 7;

export const TIPO_PLENA = 'plena';
export const TIPO_ESPERA = 'espera';

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

async function firmar(secreto, contenido) {
  const cabecera = textoABase64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const cuerpo = textoABase64url(JSON.stringify(contenido));
  const firma = await crypto.subtle.sign(
    'HMAC',
    await clave(secreto),
    new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  );
  return `${cabecera}.${cuerpo}.${datosABase64url(firma)}`;
}

export async function emitirSesion(secreto, persona, plataforma) {
  const ahora = Math.floor(Date.now() / 1000);
  return firmar(secreto, {
    sub: persona.id,
    tipo: TIPO_PLENA,
    rol: persona.rol,
    plataforma,
    iat: ahora,
    exp: ahora + VIGENCIA,
  });
}

/**
 * Credencial de quien está en la sala de espera.
 *
 * No tiene persona detrás —todavía no es del hogar—, así que su `sub` es el
 * identificador de Apple y no el de una ficha. Existe únicamente para que
 * comprobar si ya te han aprobado no obligue a abrir otra vez la hoja de Apple,
 * y para que se pueda retirar la solicitud, que la directriz 5.1.1(v) exige en
 * cuanto se ha guardado el correo de alguien.
 *
 * Lleva dentro el correo que dijo Apple. Podría pedírsele al cliente cuando
 * envía el formulario, pero entonces el correo sería lo que el solicitante
 * quiera escribir, y el correo es justamente lo único de esa pantalla que no es
 * declarado: viene atestiguado por Apple y quien aprueba se fía de él. Aquí va
 * firmado por este Worker, que es la forma de que siga siéndolo cuando vuelva.
 */
export async function emitirEspera(secreto, identificadorApple, plataforma, correo = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  return firmar(secreto, {
    sub: identificadorApple,
    tipo: TIPO_ESPERA,
    plataforma,
    correo: correo.direccion || null,
    correo_privado: Boolean(correo.privado),
    iat: ahora,
    exp: ahora + VIGENCIA_ESPERA,
  });
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
 * Las dos credenciales están firmadas por la misma clave, de modo que lo único
 * que separa a quien espera en la puerta de quien vive en la casa es el `tipo`.
 * Por eso la comprobación es explícita y va por delante, en lugar de confiar en
 * que buscar una persona con un identificador de Apple no encuentre ninguna:
 * eso hoy falla por casualidad, y una frontera de seguridad no puede depender
 * de una casualidad.
 *
 * Los tokens emitidos antes de que existiera la sala de espera no llevan `tipo`
 * y siguen siendo válidos treinta días: su ausencia se lee como sesión plena.
 */
export async function verificarSesionPlena(secreto, token) {
  const datos = await verificarSesion(secreto, token);
  if ((datos.tipo || TIPO_PLENA) !== TIPO_PLENA) {
    throw new Error('esta sesión no da acceso a la agenda');
  }
  return datos;
}

export async function verificarSesionDeEspera(secreto, token) {
  const datos = await verificarSesion(secreto, token);
  if (datos.tipo !== TIPO_ESPERA) throw new Error('sesión de espera no válida');
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
