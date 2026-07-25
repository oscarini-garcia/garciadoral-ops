/**
 * Acceso mediante Sign in with Apple.
 *
 * El cliente obtiene de Apple un token de identidad y esta aplicación lo canjea
 * en la API por una sesión propia. Ni el token de Apple ni ningún dato de la
 * agenda se quedan por el camino: la API responde con el identificador de la
 * persona del registro a la que ese identificador está vinculado, o con un
 * error explicando que todavía no lo está.
 *
 * De dónde sale el token depende de dónde se ejecute la web, y esa es la única
 * diferencia entre los dos caminos:
 *
 * - **En el navegador**, del SDK de Apple en ventana emergente, con el Services
 *   ID como cliente y el dominio de la PWA como URL de retorno.
 * - **Dentro de la cáscara de iOS**, de la hoja nativa. Allí el origen es
 *   `capacitor://localhost`, que no se puede registrar como URL de retorno, de
 *   modo que el flujo web sencillamente no cabe.
 *
 * El canje contra la API es el mismo en los dos casos: el Worker admite las dos
 * audiencias y devuelve la misma persona.
 */

import { esNativo, tokenDeAppleNativo } from './native.js';

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

async function tokenPorLaWeb(configuracion) {
  if (!configuracion.appleClienteWeb) {
    throw new Error('Esta instalación todavía no tiene configurado el acceso de Apple.');
  }

  await cargarSdkDeApple();
  window.AppleID.auth.init({
    clientId: configuracion.appleClienteWeb,
    scope: 'name',
    redirectURI: configuracion.redireccion || window.location.origin,
    usePopup: true,
  });

  const respuesta = await window.AppleID.auth.signIn();
  return respuesta?.authorization?.id_token ?? null;
}

/**
 * Devuelve `{ token, persona }` o lanza un error con `mensaje` legible.
 * El error de vinculación pendiente lleva además el identificador que hay que
 * pegar en la ficha de esa persona.
 */
export async function entrarConApple(configuracion) {
  if (!configuracion.api) {
    throw new Error('Esta instalación todavía no tiene configurada la API.');
  }

  const plataforma = esNativo() ? 'ios' : 'web';
  const idToken = esNativo()
    ? await tokenDeAppleNativo(configuracion)
    : await tokenPorLaWeb(configuracion);

  if (!idToken) {
    throw new Error(
      plataforma === 'ios'
        ? 'Esta versión de la aplicación no trae el acceso con Apple. Hace falta una compilación nueva, no basta con una actualización por OTA.'
        : 'Apple no devolvió un token de identidad.',
    );
  }

  const canje = await fetch(`${configuracion.api}/api/sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken, plataforma }),
  });

  const datos = await canje.json().catch(() => ({}));

  if (!canje.ok) {
    const error = new Error(datos.mensaje || datos.error || `La API respondió ${canje.status}.`);
    error.identificador = datos.identificador;
    throw error;
  }

  return datos;
}
