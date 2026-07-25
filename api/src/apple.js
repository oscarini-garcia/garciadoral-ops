/**
 * Verificación del token de identidad de Sign in with Apple.
 *
 * El acceso se realiza exclusivamente mediante Sign in with Apple: no existen
 * credenciales propias ni recuperación de contraseña, lo que elimina toda una
 * categoría de incidencias de soporte (spec funcional §8).
 *
 * El mismo endpoint atiende a la aplicación iOS y a la PWA, que presentan
 * audiencias distintas: el identificador del paquete en iOS y el Services ID en
 * la web. Ambas se declaran en la configuración del Worker.
 */

const CLAVES_APPLE = 'https://appleid.apple.com/auth/keys';
const EMISOR = 'https://appleid.apple.com';
const VIGENCIA_CACHE = 60 * 60 * 1000; // las claves de Apple rotan con holgura

let cacheClaves = null;
let cacheExpira = 0;

export function base64urlADatos(texto) {
  const relleno = '='.repeat((4 - (texto.length % 4)) % 4);
  const normal = (texto + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(normal);
  const datos = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) datos[i] = binario.charCodeAt(i);
  return datos;
}

function decodificarJson(parte) {
  return JSON.parse(new TextDecoder().decode(base64urlADatos(parte)));
}

async function clavesDeApple() {
  const ahora = Date.now();
  if (cacheClaves && ahora < cacheExpira) return cacheClaves;

  const respuesta = await fetch(CLAVES_APPLE);
  if (!respuesta.ok) throw new Error(`no se pudieron leer las claves de Apple (${respuesta.status})`);

  const { keys } = await respuesta.json();
  cacheClaves = keys;
  cacheExpira = ahora + VIGENCIA_CACHE;
  return keys;
}

/**
 * Devuelve `{ sub, email }` si el token es auténtico y está vigente.
 * Lanza excepción en cualquier otro caso; nunca devuelve un resultado parcial.
 */
export async function verificarTokenDeApple(idToken, audiencias) {
  const partes = String(idToken || '').split('.');
  if (partes.length !== 3) throw new Error('el token de Apple está mal formado');

  const [cabeceraB64, cuerpoB64, firmaB64] = partes;
  const cabecera = decodificarJson(cabeceraB64);
  const cuerpo = decodificarJson(cuerpoB64);

  if (cabecera.alg !== 'RS256') throw new Error(`algoritmo inesperado: ${cabecera.alg}`);
  if (cuerpo.iss !== EMISOR) throw new Error(`emisor inesperado: ${cuerpo.iss}`);

  const admitidas = audiencias.filter(Boolean);
  if (!admitidas.includes(cuerpo.aud)) throw new Error(`audiencia no admitida: ${cuerpo.aud}`);

  const ahora = Math.floor(Date.now() / 1000);
  if (typeof cuerpo.exp !== 'number' || cuerpo.exp < ahora) throw new Error('el token de Apple ha caducado');

  const jwk = (await clavesDeApple()).find((k) => k.kid === cabecera.kid);
  if (!jwk) throw new Error('la clave del token no figura entre las de Apple');

  const clave = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const valida = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    clave,
    base64urlADatos(firmaB64),
    new TextEncoder().encode(`${cabeceraB64}.${cuerpoB64}`),
  );
  if (!valida) throw new Error('la firma del token de Apple no es válida');

  return { sub: cuerpo.sub, email: cuerpo.email || null };
}
