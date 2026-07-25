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
export async function comprobarActualizacion({ alAvanzar } = {}) {
  const paso = (fase, datos = {}) => {
    try {
      alAvanzar?.({ fase, ...datos });
    } catch {
      /* que un fallo pintando no tumbe la actualización */
    }
    return { estado: fase, ...datos };
  };

  const actualizador = plugin('CapacitorUpdater');
  if (!esNativo() || !actualizador) return paso('no-aplica');

  let quitarOyente = null;
  try {
    paso('comprobando');
    const actual = await actualizador.current();
    const instalada = actual?.bundle?.version ?? null;

    const respuesta = await fetch(await urlDelManifiesto(), { cache: 'no-store' });
    if (!respuesta.ok) return paso('sin-manifiesto');

    const manifiesto = await respuesta.json(); // { version, url, checksum }
    if (!manifiesto?.version || !manifiesto?.url) return paso('sin-manifiesto');
    if (manifiesto.version === instalada) return paso('al-dia', { version: instalada });

    paso('hay-version', { version: manifiesto.version, instalada });

    // El complemento emite el porcentaje mientras descarga. Es opcional: si esta
    // versión no lo emite, la descarga sigue igual y solo se pierde el detalle.
    try {
      const oyente = await actualizador.addListener?.('download', ({ percent }) => {
        paso('descargando', { version: manifiesto.version, porcentaje: percent });
      });
      quitarOyente = () => oyente?.remove?.();
    } catch {
      /* sin porcentaje */
    }
    paso('descargando', { version: manifiesto.version });

    const bundle = await actualizador.download({
      url: manifiesto.url,
      version: manifiesto.version,
      checksum: manifiesto.checksum,
    });

    paso('instalando', { version: manifiesto.version });
    // Se aplica en la próxima carga. `notifyAppReady` en el arranque es lo que
    // impide que la cáscara lo revierta por creerlo defectuoso.
    await actualizador.set(bundle);
    return paso('descargada', { version: manifiesto.version });
  } catch (error) {
    return paso('error', { detalle: String(error?.message ?? error) });
  } finally {
    quitarOyente?.();
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

// ------------------------------------------------- Acceso con Apple --------

/**
 * Pide el token de identidad de Apple por la vía nativa.
 *
 * Dentro de la cáscara, la web se sirve desde el origen `capacitor://localhost`,
 * que Apple no admite como *Return URL*: el flujo de ventana emergente que usa
 * el navegador no tiene a dónde volver. La hoja nativa no necesita origen ni
 * dominio verificado, porque valida contra el identificador del paquete.
 *
 * De ahí la diferencia que verá en las trazas del Worker: en el navegador el
 * token llega con la audiencia del Services ID (`APPLE_AUD_WEB`) y aquí con la
 * del paquete (`APPLE_AUD_IOS`). Las dos están admitidas y desembocan en el
 * mismo `sub`, siempre que el Services ID tenga ese App ID como *Primary*.
 *
 * Devuelve `null` fuera de la cáscara o si el complemento no está instalado,
 * para que quien llame pueda caer al camino web sin comprobar la plataforma.
 *
 * De la hoja salen dos cosas y se devuelven las dos. El **token de identidad**
 * es el que se canjea por una sesión al entrar. El **código de autorización**
 * solo hace falta para darse de baja, porque es lo único con lo que el Worker
 * puede pedirle a Apple que revoque el vínculo; se pide en ese momento, no
 * aquí, y por eso esta función se usa desde los dos sitios.
 */
export async function autorizacionDeAppleNativa({ appleClienteWeb, redireccion } = {}) {
  const acceso = plugin('SignInWithApple');
  if (!esNativo() || !acceso) return null;

  // En iOS estos dos campos no se usan —la hoja nativa se identifica sola con el
  // paquete—, pero el complemento los exige en la firma y sí los aprovecha en su
  // camino web. Se pasan los mismos valores que usaría el navegador.
  const { response } = await acceso.authorize({
    clientId: appleClienteWeb,
    redirectURI: redireccion,
    // Igual que en la web: sin el ámbito `email` el token no trae el correo, y
    // sin correo la bandeja de solicitudes se queda sin el único dato de esa
    // pantalla que no es declarado (specs/autenticacion.md §8).
    scopes: 'name email',
  });

  return {
    identityToken: response?.identityToken ?? null,
    authorizationCode: response?.authorizationCode ?? null,
  };
}

export async function tokenDeAppleNativo(configuracion) {
  const autorizacion = await autorizacionDeAppleNativa(configuracion);
  return autorizacion?.identityToken ?? null;
}

// ---------------------------------------------- Recordatorios locales --

/**
 * El recordatorio previo al evento, que es la única notificación activa por
 * defecto (specs/especificacion.md §3.5).
 *
 * Se programan **en el dispositivo**, no se envían desde el servidor, y esa
 * decisión es lo que hace que la regla «las notificaciones heredan la
 * visibilidad» se cumpla sola: el Worker filtra antes de transmitir, de modo
 * que la instantánea local nunca contiene lo que su titular no puede ver, y un
 * aviso compuesto a partir de ella tampoco puede delatarlo. Con avisos remotos
 * habría que volver a aplicar la regla al componer cada mensaje, y el texto
 * pasaría además por los servidores de Apple.
 */

const ANTELACION_MINUTOS = 30;
const HORA_VISPERA = 20; // los de jornada completa se avisan la tarde anterior
const HORIZONTE_DIAS = 60;

// iOS solo conserva las 64 notificaciones locales pendientes más próximas y
// descarta el resto sin avisar. Se recorta aquí para que el corte sea nuestro y
// no una sorpresa del sistema.
const TECHO_PENDIENTES = 64;

/** Identificador estable y numérico, que es lo que exige el complemento. */
function idDeAviso(texto) {
  let acumulado = 0;
  for (let i = 0; i < texto.length; i += 1) {
    acumulado = (acumulado * 31 + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(acumulado) % 2147483647;
}

/** Cuándo avisar de una instancia, o `null` si ya no ha lugar. */
function momentoDelAviso(instancia, ahora) {
  const inicio = instancia.inicio;
  const cuando = instancia.evento.jornada_completa
    ? new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() - 1, HORA_VISPERA, 0)
    : new Date(inicio.getTime() - ANTELACION_MINUTOS * 60 * 1000);
  return cuando > ahora ? cuando : null;
}

function textoDelAviso(instancia) {
  const { evento } = instancia;
  const cuerpo = evento.jornada_completa
    ? 'Mañana'
    : `A las ${String(instancia.inicio.getHours()).padStart(2, '0')}:${String(instancia.inicio.getMinutes()).padStart(2, '0')}`;
  return {
    title: `${evento.emoji || '📌'} ${evento.titulo}`,
    body: evento.ubicacion ? `${cuerpo} · ${evento.ubicacion}` : cuerpo,
  };
}

/**
 * Rehace por completo los recordatorios pendientes a partir de la instantánea.
 *
 * Se cancela todo y se vuelve a programar, en lugar de calcular diferencias,
 * por el mismo motivo por el que la instantánea se sustituye entera: es lo que
 * hace que la retirada retroactiva funcione sola. Si un evento deja de ser
 * visible para esta persona, su aviso pendiente desaparece con él.
 *
 * Fuera de la cáscara no hace nada: la web no programa notificaciones.
 */
export async function programarRecordatorios(instancias) {
  const notificaciones = plugin('LocalNotifications');
  if (!esNativo() || !notificaciones) return { estado: 'no-aplica' };

  try {
    let permiso = await notificaciones.checkPermissions();
    if (permiso.display === 'prompt' || permiso.display === 'prompt-with-rationale') {
      permiso = await notificaciones.requestPermissions();
    }
    if (permiso.display !== 'granted') return { estado: 'sin-permiso' };

    const pendientes = await notificaciones.getPending();
    if (pendientes?.notifications?.length) await notificaciones.cancel(pendientes);

    const ahora = new Date();
    const avisos = instancias
      .map((instancia) => ({ instancia, cuando: momentoDelAviso(instancia, ahora) }))
      .filter(({ cuando }) => cuando)
      .sort((a, b) => a.cuando - b.cuando)
      .slice(0, TECHO_PENDIENTES)
      .map(({ instancia, cuando }) => ({
        id: idDeAviso(`${instancia.evento.id}@${cuando.toISOString()}`),
        ...textoDelAviso(instancia),
        schedule: { at: cuando, allowWhileIdle: true },
      }));

    if (avisos.length) await notificaciones.schedule({ notifications: avisos });
    return { estado: 'programados', cuantos: avisos.length };
  } catch (error) {
    return { estado: 'error', detalle: String(error?.message ?? error) };
  }
}

export const HORIZONTE_RECORDATORIOS_DIAS = HORIZONTE_DIAS;

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
