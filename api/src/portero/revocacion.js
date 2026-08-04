/**
 * Revocación del token de Sign in with Apple al darse de baja.
 *
 * Apple no se conforma con que la aplicación olvide a la persona: exige que,
 * cuando alguien elimina su cuenta, se le diga **a Apple** que ese vínculo se
 * ha roto, mediante el endpoint de revocación de la API REST. Es la otra mitad
 * de la directriz 5.1.1(v), la que no se ve desde la aplicación, y la única
 * parte de este sistema que necesita una clave privada.
 *
 * De ahí la forma de esta pieza, que no es la evidente:
 *
 * **El código de autorización se pide en el momento de la baja, no al entrar.**
 * Para revocar hace falta un `refresh_token`, y para obtenerlo hay que canjear
 * un código de autorización de Apple. Lo natural sería canjearlo al iniciar
 * sesión y guardarlo; sería también meter una llamada de red más —y un fallo
 * más— en el camino más frágil del sistema, y guardar en la base un secreto de
 * larga vida por cada persona. Como darse de baja es raro y volver a
 * identificarse antes de una acción irreversible es sano, el código se pide
 * allí: el acceso no se toca y no se almacena nada.
 *
 * **Si no hay clave configurada, la baja sigue adelante.** La directriz que no
 * se puede incumplir es que eliminar la cuenta sea siempre posible. Que la
 * revocación se haya podido cursar o no se informa en la respuesta, y se
 * registra en el log del Worker, pero nunca bloquea la baja.
 */

import { base64urlADatos } from './apple.js';

const APPLE = 'https://appleid.apple.com';
const VIGENCIA_SECRETO = 300; // Apple admite hasta seis meses; cinco minutos sobran

function textoABase64url(texto) {
  return datosABase64url(new TextEncoder().encode(texto));
}

function datosABase64url(datos) {
  let binario = '';
  for (const octeto of new Uint8Array(datos)) binario += String.fromCharCode(octeto);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** ¿Están puestos los tres valores que hacen falta para revocar? */
export function hayRevocacionConfigurada(env) {
  return Boolean(env.APPLE_CLAVE_P8 && env.APPLE_CLAVE_ID && env.APPLE_EQUIPO);
}

/**
 * Importa la clave `.p8` que descarga Apple, que viene en PEM PKCS#8.
 *
 * El secreto se guarda con `wrangler secret put` y llega con los saltos de
 * línea tal cual o escapados como `\n`, según cómo se haya pegado; se admiten
 * las dos formas porque la diferencia no es visible al pegarla y el error que
 * produce —una clave que no importa— no se parece en nada a su causa.
 */
async function importarClave(pem) {
  const cuerpo = String(pem)
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');

  return crypto.subtle.importKey(
    'pkcs8',
    base64urlADatos(cuerpo),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * El `client_secret` que Apple pide en sus dos endpoints: un JWT ES256 firmado
 * con la clave del equipo. Lo emite quien va a usarlo, en el momento, y caduca
 * en cinco minutos: no hay ningún secreto de larga vida que rotar.
 */
export async function secretoDeCliente(env, clienteId, ahora = Math.floor(Date.now() / 1000)) {
  const cabecera = textoABase64url(JSON.stringify({ alg: 'ES256', kid: env.APPLE_CLAVE_ID }));
  const cuerpo = textoABase64url(JSON.stringify({
    iss: env.APPLE_EQUIPO,
    iat: ahora,
    exp: ahora + VIGENCIA_SECRETO,
    aud: APPLE,
    sub: clienteId,
  }));

  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await importarClave(env.APPLE_CLAVE_P8),
    new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  );

  // WebCrypto entrega la firma como r‖s en crudo, que es exactamente lo que
  // espera JOSE para ES256. No hay que envolverla en DER.
  return `${cabecera}.${cuerpo}.${datosABase64url(firma)}`;
}

async function formulario(url, campos) {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos).toString(),
  });
  const texto = await respuesta.text();
  return { ok: respuesta.ok, estado: respuesta.status, texto };
}

/**
 * Canjea el código de autorización y revoca el token resultante.
 *
 * Devuelve `{ revocado, motivo }` y **no lanza nunca**: quien llama está en
 * mitad de una baja de cuenta, y un fallo aquí no puede impedirla. Los motivos
 * son cadenas cortas pensadas para el log, no para enseñárselas a nadie.
 *
 * El cliente ante Apple depende de por dónde entró esa persona: el
 * identificador del paquete en la app y el Services ID en el navegador. Son
 * clientes distintos para Apple, y un código emitido para uno no se canjea con
 * el otro. En el camino web hay que repetir además la URL de retorno exacta.
 */
export async function revocarEnApple(env, { codigo, plataforma, redireccion }) {
  if (!codigo) return { revocado: false, motivo: 'sin_codigo' };
  if (!hayRevocacionConfigurada(env)) return { revocado: false, motivo: 'sin_clave' };

  const esIos = plataforma === 'ios';
  const clienteId = esIos ? env.APPLE_AUD_IOS : env.APPLE_AUD_WEB;

  try {
    const secreto = await secretoDeCliente(env, clienteId);

    const canje = await formulario(`${APPLE}/auth/token`, {
      client_id: clienteId,
      client_secret: secreto,
      code: codigo,
      grant_type: 'authorization_code',
      ...(esIos ? {} : { redirect_uri: redireccion || '' }),
    });

    if (!canje.ok) return { revocado: false, motivo: `canje_${canje.estado}`, detalle: canje.texto };

    const { refresh_token: refresco, access_token: acceso } = JSON.parse(canje.texto);
    const token = refresco || acceso;
    if (!token) return { revocado: false, motivo: 'canje_sin_token' };

    const baja = await formulario(`${APPLE}/auth/revoke`, {
      client_id: clienteId,
      client_secret: secreto,
      token,
      token_type_hint: refresco ? 'refresh_token' : 'access_token',
    });

    return baja.ok
      ? { revocado: true }
      : { revocado: false, motivo: `revoke_${baja.estado}`, detalle: baja.texto };
  } catch (error) {
    return { revocado: false, motivo: 'error', detalle: String(error.message || error) };
  }
}
