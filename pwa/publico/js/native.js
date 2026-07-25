/**
 * Puente con la cáscara nativa de iOS.
 *
 * El modelo es el de la receta: el binario nativo casi nunca cambia y los
 * cambios de web se reparten por OTA, sin pasar por Apple. Aquí vive la parte
 * web de ese trato —háptica, compartir y comprobación del bundle— y todo lo que
 * hay es **seguro en el navegador**: fuera de la cáscara cada función es una
 * operación nula o cae al equivalente web, de modo que la PWA y las pruebas
 * siguen funcionando igual.
 *
 * **Una desviación de la receta.** Esta webapp no tiene empaquetador: son
 * módulos ES servidos tal cual. En lugar de importar `@capacitor/core`, que
 * exigiría meter Vite por medio solo para esto, se habla con los plugins a
 * través del puente global que la propia cáscara inyecta en el WebView
 * (`window.Capacitor.Plugins`). Los paquetes de npm siguen haciendo falta para
 * que `cap sync` instale los pods; lo que cambia es cómo los invoca la web.
 */

const MANIFIESTO_POR_DEFECTO =
  'https://github.com/oscarini-garcia/garciadoral-ops/releases/latest/download/latest.json';

const puente = () => globalThis.Capacitor;
const plugin = (nombre) => puente()?.Plugins?.[nombre];

/** ¿Estamos dentro de la cáscara, o en un navegador normal? */
export function esNativo() {
  try {
    return puente()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ Háptica --

/**
 * Un golpe seco al confirmar algo. En web no hace nada.
 *
 * No es adorno: junto con la hoja de compartir es lo que sostiene que esto sea
 * una aplicación y no una web envuelta, que es lo que mira la guía 4.2 de Apple.
 */
export async function toque(intensidad = 'ligera') {
  const haptica = plugin('Haptics');
  if (!haptica) return;
  const estilos = { ligera: 'LIGHT', media: 'MEDIUM', fuerte: 'HEAVY' };
  try {
    await haptica.impact({ style: estilos[intensidad] || 'LIGHT' });
  } catch {
    /* sin háptica: da igual */
  }
}

// --------------------------------------------------------------- Compartir --

/** Hoja de compartir nativa; en web cae a `navigator.share` si existe. */
export async function compartir({ titulo, texto, url } = {}) {
  const nativo = plugin('Share');
  if (nativo) {
    try {
      await nativo.share({ title: titulo, text: texto, url });
      return true;
    } catch {
      return false; // el usuario canceló, o el plugin no está disponible
    }
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: titulo, text: texto, url });
      return true;
    }
  } catch {
    /* cancelado */
  }
  try {
    await navigator.clipboard?.writeText([titulo, texto].filter(Boolean).join('\n'));
    return true;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------- OTA --

async function urlDelManifiesto() {
  try {
    const respuesta = await fetch('/config.json', { cache: 'no-cache' });
    if (respuesta.ok) {
      const configuracion = await respuesta.json();
      if (configuracion.otaManifiesto) return configuracion.otaManifiesto;
    }
  } catch {
    /* sin configuración: se usa el valor por defecto */
  }
  return MANIFIESTO_POR_DEFECTO;
}

/**
 * Lee el manifiesto y, si hay versión nueva, la descarga y la deja lista para
 * la siguiente apertura. Devuelve el estado para poder enseñarlo en el panel.
 */
export async function comprobarActualizacion() {
  const actualizador = plugin('CapacitorUpdater');
  if (!esNativo() || !actualizador) return { estado: 'no-aplica' };

  try {
    const actual = await actualizador.current();
    const respuesta = await fetch(await urlDelManifiesto(), { cache: 'no-store' });
    if (!respuesta.ok) return { estado: 'sin-manifiesto' };

    const manifiesto = await respuesta.json(); // { version, url, checksum }
    if (!manifiesto?.version || !manifiesto?.url) return { estado: 'sin-manifiesto' };
    if (manifiesto.version === actual?.bundle?.version) {
      return { estado: 'al-dia', version: actual?.bundle?.version };
    }

    const bundle = await actualizador.download({
      url: manifiesto.url,
      version: manifiesto.version,
      checksum: manifiesto.checksum,
    });
    // Se aplica en la próxima carga. `notifyAppReady` en el arranque es lo que
    // impide que la cáscara lo revierta por creerlo defectuoso.
    await actualizador.set(bundle);
    return { estado: 'descargada', version: manifiesto.version };
  } catch (error) {
    return { estado: 'error', detalle: String(error?.message ?? error) };
  }
}

export async function versionInstalada() {
  const actualizador = plugin('CapacitorUpdater');
  if (!actualizador) return null;
  try {
    return (await actualizador.current())?.bundle?.version ?? null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------- Arranque --

/**
 * Se llama una vez al arrancar. En el navegador no hace absolutamente nada.
 */
export async function iniciarNativo() {
  if (!esNativo()) return;

  const actualizador = plugin('CapacitorUpdater');
  try {
    // Confirma que el arranque ha ido bien: sin esto, la cáscara revierte el
    // bundle recién aplicado por si lo hubiera roto.
    await actualizador?.notifyAppReady();
  } catch {
    /* si no está el plugin, no hay nada que confirmar */
  }

  comprobarActualizacion(); // en segundo plano; se aplica en la próxima apertura
}
