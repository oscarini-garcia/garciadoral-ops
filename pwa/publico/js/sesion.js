/**
 * Acceso mediante Sign in with Apple en la web.
 *
 * El navegador obtiene de Apple un token de identidad y esta aplicación lo
 * canjea en la API por una sesión propia. Ni el token de Apple ni ningún dato
 * de la agenda se quedan por el camino: la API responde con el identificador de
 * la persona del registro a la que ese identificador está vinculado, o con un
 * error explicando que todavía no lo está.
 */

const SDK = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/es_ES/appleid.auth.js';

export async function cargarConfiguracion() {
  try {
    const respuesta = await fetch('/config.json', { cache: 'no-cache' });
    if (respuesta.ok) return respuesta.json();
  } catch {
    /* sin configuración solo funciona la demostración */
  }
  return {};
}

function cargarSdkDeApple() {
  if (window.AppleID) return Promise.resolve();
  return new Promise((resolver, rechazar) => {
    const guion = document.createElement('script');
    guion.src = SDK;
    guion.onload = resolver;
    guion.onerror = () => rechazar(new Error('no se pudo cargar el acceso de Apple'));
    document.head.append(guion);
  });
}

/**
 * Devuelve `{ token, persona }` o lanza un error con `mensaje` legible.
 * El error de vinculación pendiente lleva además el identificador que hay que
 * pegar en la ficha de esa persona.
 */
export async function entrarConApple(configuracion) {
  if (!configuracion.appleClienteWeb || !configuracion.api) {
    throw new Error('Esta instalación todavía no tiene configurados el acceso de Apple ni la API.');
  }

  await cargarSdkDeApple();
  window.AppleID.auth.init({
    clientId: configuracion.appleClienteWeb,
    scope: 'name',
    redirectURI: configuracion.redireccion || window.location.origin,
    usePopup: true,
  });

  const respuesta = await window.AppleID.auth.signIn();
  const idToken = respuesta?.authorization?.id_token;
  if (!idToken) throw new Error('Apple no devolvió un token de identidad.');

  const canje = await fetch(`${configuracion.api}/api/sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken, plataforma: 'web' }),
  });

  const datos = await canje.json().catch(() => ({}));

  if (!canje.ok) {
    const error = new Error(datos.mensaje || datos.error || `La API respondió ${canje.status}.`);
    error.identificador = datos.identificador;
    throw error;
  }

  return datos;
}
