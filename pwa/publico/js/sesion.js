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

import { autorizacionDeAppleNativa, esNativo, nombreDe } from './native.js';

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

async function autorizacionPorLaWeb(configuracion) {
  if (!configuracion.appleClienteWeb) {
    throw new Error('Esta instalación todavía no tiene configurado el acceso de Apple.');
  }

  await cargarSdkDeApple();
  window.AppleID.auth.init({
    clientId: configuracion.appleClienteWeb,
    // El correo es lo único que verá quien decide si esta persona entra, así
    // que hay que pedirlo. Ojo al probar: el ámbito se fija en la **primera**
    // autorización, y ampliarlo después no vuelve a preguntar. Quien ya entrara
    // alguna vez seguirá sin correo hasta que retire la aplicación en Ajustes →
    // su nombre → Inicio de sesión y seguridad (specs/autenticacion.md §8).
    scope: 'name email',
    redirectURI: configuracion.redireccion || window.location.origin,
    usePopup: true,
  });

  const respuesta = await window.AppleID.auth.signIn();
  return {
    identityToken: respuesta?.authorization?.id_token ?? null,
    authorizationCode: respuesta?.authorization?.code ?? null,
    nombre: nombreDe(respuesta?.user?.name?.firstName, respuesta?.user?.name?.lastName),
  };
}

/**
 * Devuelve en qué estado está este identificador de Apple frente al hogar.
 *
 * Con cuenta, `{ estado: 'activa', token, persona }`. Sin ella, el estado de su
 * solicitud —`sin_solicitud`, `pendiente` o `rechazada`— y un `token_espera`
 * con el que preguntar y retirarse, que es lo único que esa credencial permite.
 *
 * Llegar sin cuenta no es un error: es el estado normal de quien acaba de
 * descargarse la aplicación, y por eso la API responde 200 y esta función no
 * lanza nada.
 */
export async function entrarConApple(configuracion) {
  if (!configuracion.api) {
    throw new Error('Esta instalación todavía no tiene configurada la API.');
  }

  const plataforma = esNativo() ? 'ios' : 'web';
  const autorizacion = esNativo()
    ? await autorizacionDeAppleNativa(configuracion)
    : await autorizacionPorLaWeb(configuracion);
  const idToken = autorizacion?.identityToken ?? null;

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
  if (!canje.ok) throw new Error(datos.error || `La API respondió ${canje.status}.`);

  // El nombre que Apple acaba de dar viaja con la respuesta para que nadie
  // tenga que teclearlo. Solo llega en la primera autorización, así que este es
  // el único momento en que se puede recoger.
  return { ...datos, nombre_apple: autorizacion?.nombre ?? null };
}

// ------------------------------------------------------- Sala de espera --

/**
 * Las tres llamadas de quien todavía no es del hogar.
 *
 * Van con el `token_espera`, que no da acceso a la agenda: solo permite pedir
 * entrar, preguntar en qué ha quedado la petición y retirarla. Esa última no es
 * una comodidad, es la directriz 5.1.1(v) de la App Store, que aplica desde el
 * momento en que se ha guardado el correo de alguien.
 */
async function enLaPuerta(configuracion, token, metodo, cuerpo) {
  if (!configuracion.api) {
    throw new Error('Esta instalación todavía no tiene configurada la API.');
  }

  const respuesta = await fetch(`${configuracion.api}/api/solicitud`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || `La API respondió ${respuesta.status}.`);
  return datos;
}

export const pedirEntrar = (configuracion, token, nombre) =>
  enLaPuerta(configuracion, token, 'POST', { nombre });

export const consultarSolicitud = (configuracion, token) =>
  enLaPuerta(configuracion, token, 'GET');

/**
 * Retirar la solicitud. Lleva el código de autorización, como la baja de una
 * cuenta: es lo único con lo que el Worker puede pedirle a Apple que revoque el
 * vínculo, y quien deja una solicitud ya pasó por Sign in with Apple.
 */
export const retirarSolicitud = (configuracion, token, codigo) =>
  enLaPuerta(configuracion, token, 'DELETE', { codigo_apple: codigo ?? null });

// ------------------------------------------------------ Baja de la cuenta --

/**
 * Vuelve a pasar por Apple para obtener un **código de autorización**, que es
 * lo único con lo que el Worker puede pedirle a Apple que revoque el vínculo.
 *
 * Se pide aquí, en el momento de la baja, y no al entrar: así el camino de
 * acceso —el más frágil del sistema— no cambia, y no hay que guardar en el
 * servidor ningún secreto de larga vida por cada persona. De paso, volver a
 * identificarse justo antes de una acción irreversible es lo que uno espera.
 *
 * Devuelve `null` si no se puede obtener, por la razón que sea: que alguien
 * cancele la hoja de Apple, o que la esté usando desde una versión antigua de
 * la cáscara sin el complemento, no puede impedirle darse de baja.
 */
export async function codigoDeAutorizacion(configuracion) {
  try {
    const autorizacion = esNativo()
      ? await autorizacionDeAppleNativa(configuracion)
      : await autorizacionPorLaWeb(configuracion);
    return autorizacion?.authorizationCode ?? null;
  } catch {
    return null;
  }
}

/**
 * Pide la baja a la API. El token de sesión es el que acredita quién la pide:
 * nadie puede dar de baja a otra persona, ni siquiera una administradora.
 */
export async function eliminarLaCuenta(configuracion, token, codigo) {
  if (!configuracion.api) {
    throw new Error('Esta instalación todavía no tiene configurada la API.');
  }

  const respuesta = await fetch(`${configuracion.api}/api/cuenta/baja`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ codigo_apple: codigo }),
  });

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(datos.mensaje || datos.error || `La API respondió ${respuesta.status}.`);
  }
  return datos;
}
