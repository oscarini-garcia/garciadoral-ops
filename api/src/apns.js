/**
 * El transporte hasta el teléfono: APNs con autenticación por token.
 *
 * Es a los avisos remotos lo que `scripts/callmebot.py` es al plan semanal —el
 * cable, y nada más—. Aquí no se decide a quién se avisa ni qué dice el aviso:
 * eso está en `avisos.js`. Aquí solo está cómo llega.
 *
 * **Se habla con Apple directamente y sin biblioteca.** APNs es una petición
 * HTTP/2 con una cabecera de más y un JWT firmado con ES256, y las dos cosas
 * las sabe hacer el propio Worker: `fetch` negocia HTTP/2 y `crypto.subtle`
 * firma ECDSA P-256. Meter una dependencia para esto sería meterla para
 * cincuenta líneas.
 *
 * **El JWT se guarda, no se firma en cada aviso.** Apple lo dice con números:
 * un token de proveedor vale una hora y no se puede renovar más de una vez cada
 * veinte minutos; quien firma uno por petición acaba en `TooManyProviderTokenUpdates`
 * y con la conexión inservible hasta que pase el rato. Se guarda en memoria del
 * isolate durante cuarenta y cinco minutos, que cae dentro de la ventana por los
 * dos lados. Si algún día hicieran falta muchos isolates a la vez, el sitio
 * donde compartirlo sería `configuracion`; hoy, para una casa de cuatro, sobra.
 *
 * **Un token muerto se borra, no se reintenta.** APNs contesta `410` o
 * `BadDeviceToken` cuando el aparato desinstaló la aplicación o le cambió el
 * token, y eso no se arregla insistiendo: se devuelve `caducado` y quien llama
 * lo quita de la base. El teléfono vuelve a darse de alta solo la próxima vez
 * que abra.
 */

const SERVIDORES = {
  produccion: 'https://api.push.apple.com',
  pruebas: 'https://api.sandbox.push.apple.com',
};

/** Cuarenta y cinco minutos: Apple rechaza los de más de una hora y no admite
 *  renovar antes de veinte. Justo en medio. */
const VIDA_DEL_JWT_MS = 45 * 60 * 1000;

/** Lo que un aviso aguanta esperando a un teléfono apagado. Pasado un día, lo
 *  que decía ya no le sirve a nadie. */
const CADUCIDAD_SEGUNDOS = 24 * 60 * 60;

/** Motivos por los que un token no vuelve a servir jamás. */
const MOTIVOS_DE_TOKEN_MUERTO = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
]);

let jwtEnMemoria = null; // { valor, nacido }

/**
 * ¿Hay por dónde empujar?
 *
 * Sin las tres piezas no se avisa y no pasa nada más: la aplicación sigue
 * enseñando el sobre al abrirla, que es lo que hacía antes de que esto
 * existiera. Un despliegue sin claves de APNs no es un despliegue roto.
 */
export function hayApnsConfigurado(env) {
  return Boolean(env.APNS_CLAVE_P8 && env.APNS_CLAVE_ID && env.APPLE_EQUIPO);
}

/** El identificador del paquete de iOS, que es también el asunto de APNs. Se
 *  reutiliza el que ya declara la autenticación en lugar de pedir otra variable
 *  que diría lo mismo. */
const topico = (env) => env.APNS_TOPICO || env.APPLE_AUD_IOS || 'com.garciadoral.ops';

const servidor = (env) => SERVIDORES[env.APNS_ENTORNO] || SERVIDORES.produccion;

// ------------------------------------------------------------ La firma --

const enBase64Url = (bytes) => {
  let binario = '';
  for (const octeto of new Uint8Array(bytes)) binario += String.fromCharCode(octeto);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const textoEnBase64Url = (texto) => enBase64Url(new TextEncoder().encode(texto));

/**
 * La clave `.p8` de Apple ya viene en PEM PKCS#8, que es justo lo que
 * `importKey` espera: se le quitan las guardas y los saltos de línea y se
 * descodifica el base64 de dentro.
 */
async function clavePrivada(p8) {
  const cuerpo = String(p8).replace(/-----[^-]*-----/g, '').replace(/\s+/g, '');
  const binario = atob(cuerpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
}

/**
 * El token de proveedor, recién firmado o el que ya había.
 *
 * WebCrypto devuelve la firma ECDSA en crudo —los dos enteros de 32 octetos,
 * uno detrás de otro—, que es exactamente lo que ES256 pide. Es la diferencia
 * con el `crypto` de Node, que la devuelve en DER y obliga a convertirla; media
 * tarde de las de no entender por qué Apple dice que la firma es inválida.
 */
export async function tokenDeProveedor(env, ahora = Date.now()) {
  if (jwtEnMemoria && ahora - jwtEnMemoria.nacido < VIDA_DEL_JWT_MS) return jwtEnMemoria.valor;

  const cabecera = textoEnBase64Url(JSON.stringify({ alg: 'ES256', kid: env.APNS_CLAVE_ID }));
  const cuerpo = textoEnBase64Url(JSON.stringify({
    iss: env.APPLE_EQUIPO,
    iat: Math.floor(ahora / 1000),
  }));

  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await clavePrivada(env.APNS_CLAVE_P8),
    new TextEncoder().encode(`${cabecera}.${cuerpo}`),
  );

  jwtEnMemoria = { valor: `${cabecera}.${cuerpo}.${enBase64Url(firma)}`, nacido: ahora };
  return jwtEnMemoria.valor;
}

/** Para las pruebas y para el reintento tras un `ExpiredProviderToken`. */
export const olvidarTokenDeProveedor = () => { jwtEnMemoria = null; };

// ------------------------------------------------------------- El envío --

/**
 * El sobre tal como lo espera Apple.
 *
 * `category` es lo que hace que salgan los botones: la aplicación declara qué
 * botones lleva cada categoría y aquí solo se nombra cuál es. Lo que va fuera de
 * `aps` llega intacto al dispositivo y es lo que le dice a qué pantalla ir.
 */
function sobre(aviso) {
  return {
    aps: {
      alert: { title: aviso.titulo, body: aviso.cuerpo },
      sound: 'default',
      // El globo del icono, con lo que espera respuesta. Es un número absoluto y
      // no un incremento: se manda siempre, incluso a cero, porque omitirlo deja
      // puesto el de antes y un globo que no baja es peor que ninguno.
      badge: Number.isInteger(aviso.globo) ? aviso.globo : undefined,
      category: aviso.categoria || undefined,
      'thread-id': aviso.hilo || undefined,
      // Lo urgente atraviesa el modo concentración y el resumen programado; lo
      // demás espera su turno como cualquier otro aviso. La diferencia importa
      // en un solo caso y es el que justifica todo esto: una petición de turno a
      // las 7:40 que llega a mediodía no es un aviso, es un reproche.
      'interruption-level': aviso.urgente ? 'time-sensitive' : undefined,
    },
    ...aviso.datos,
  };
}

/**
 * Un aviso a un teléfono. No lanza: un aviso que no llega no puede tumbar la
 * escritura que lo provocó.
 */
export async function enviarAviso(env, tokenDispositivo, aviso, { reintento = false } = {}) {
  if (!hayApnsConfigurado(env)) return { ok: false, motivo: 'sin-configurar' };
  if (!tokenDispositivo) return { ok: false, motivo: 'sin-token' };

  let respuesta;
  try {
    respuesta = await fetch(`${servidor(env)}/3/device/${tokenDispositivo}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${await tokenDeProveedor(env)}`,
        'apns-topic': topico(env),
        // Sin `apns-push-type` APNs puede retrasar o descartar el aviso, y sin
        // prioridad 10 lo agrupa a su criterio. Lo que se manda es de ahora.
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + CADUCIDAD_SEGUNDOS),
        // Dos avisos sobre lo mismo se sustituyen en lugar de apilarse. Es lo
        // que hace que reenviar la cola tras una sincronización a medias no deje
        // el mismo aviso dos veces en la pantalla de bloqueo.
        ...(aviso.agrupa ? { 'apns-collapse-id': String(aviso.agrupa).slice(0, 64) } : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(sobre(aviso)),
    });
  } catch (error) {
    return { ok: false, motivo: `sin salida: ${String(error?.message || error)}` };
  }

  if (respuesta.status === 200) return { ok: true };

  const detalle = await respuesta.json().catch(() => ({}));
  const motivo = detalle.reason || `apns ${respuesta.status}`;

  // Un token de proveedor caducado se arregla firmando otro, y una sola vez: si
  // el segundo también caduca, lo que falla es el reloj o la clave.
  if (!reintento && (respuesta.status === 403 || motivo === 'ExpiredProviderToken')) {
    olvidarTokenDeProveedor();
    return enviarAviso(env, tokenDispositivo, aviso, { reintento: true });
  }

  return {
    ok: false,
    motivo,
    caducado: respuesta.status === 410 || MOTIVOS_DE_TOKEN_MUERTO.has(motivo),
  };
}
