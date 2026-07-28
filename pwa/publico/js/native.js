/**
 * Puente con la cáscara nativa de iOS.
 *
 * El modelo es el de la receta: el binario nativo casi nunca cambia y los
 * cambios de web se reparten por OTA, sin pasar por Apple. Aquí vive la parte
 * web de ese trato —háptica, compartir, portapapeles, comprobación del bundle y
 * los avisos, los que se programan aquí y los que llegan de fuera— y todo lo que
 * hay es **seguro en el navegador**: fuera de la cáscara
 * cada función es una operación nula o cae al equivalente web, de modo que la
 * PWA y las pruebas siguen funcionando igual.
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

/**
 * Al portapapeles, para pegarlo donde haga falta.
 *
 * Sin plugin por medio: `navigator.clipboard` funciona dentro del WebView de la
 * cáscara igual que en el navegador, y meter `@capacitor/clipboard` obligaría a
 * publicar un binario nuevo para algo que la web ya sabe hacer. El truco del
 * área de texto queda como último recurso, para los contextos donde el
 * portapapeles moderno no está permitido.
 *
 * Hay que llamarla **dentro del gesto** que la pide: un portapapeles que se
 * escribe un segundo después, ya fuera del toque, lo rechaza el navegador.
 */
export async function copiar(texto) {
  if (!texto) return false;

  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    /* sin permiso o sin contexto seguro: se prueba a la antigua */
  }

  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.append(area);
    area.select();
    const copiado = document.execCommand('copy');
    area.remove();
    return copiado;
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
/**
 * Los turnos de Lío que le tocan a quien mira, como aviso al empezar la ventana.
 *
 * Es lo único que Lío puede notificar hoy: la cáscara programa avisos locales a
 * partir de lo que ya tiene, y no hay manera de que a otro le suene el teléfono
 * porque uno acabe de pedirle un cambio. Un turno propio sí se sabe por
 * adelantado, así que ese sí se avisa —y solo si sigue sin marcar cuando se
 * programa, que es cuando el recordatorio significa algo.
 */
function avisoDeTurno(turno, ahora) {
  if (!turno.mio || turno.estado === 'hecho' || turno.trato) return null;
  const cuando = turno.inicio;
  if (!cuando || cuando <= ahora) return null;
  return {
    id: idDeAviso(`lio:${turno.fechaIso}:${turno.turnoId}`),
    // La huella en el título, porque el aviso es de Lío; y de qué turno se trata
    // lo dice el renglón de debajo, con su sol o su luna y con todas sus
    // palabras: «☀️ Por la mañana».
    title: '🐾 Te toca sacar a Lío',
    body: turno.rotulo,
    schedule: { at: cuando, allowWhileIdle: true },
  };
}

export async function programarRecordatorios(instancias, turnosDeLio = []) {
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

    // Los turnos van aparte del techo de los eventos: son dos al día como mucho
    // y no compiten con la agenda por el mismo cupo.
    const deLio = turnosDeLio.map((turno) => avisoDeTurno(turno, ahora)).filter(Boolean);

    const todos = [...avisos, ...deLio];
    if (todos.length) await notificaciones.schedule({ notifications: todos });
    return { estado: 'programados', cuantos: todos.length };
  } catch (error) {
    return { estado: 'error', detalle: String(error?.message ?? error) };
  }
}

export const HORIZONTE_RECORDATORIOS_DIAS = HORIZONTE_DIAS;

// ------------------------------------------------- Avisos remotos (APNs) --

/**
 * Lo que sí puede empujarse: que a otro le suene el teléfono porque tú acabas
 * de escribir algo.
 *
 * Es la mitad que a los recordatorios locales les faltaba. Un turno propio se
 * sabe por adelantado y se programa aquí; que alguien te pida un cambio no se
 * sabe hasta que lo pide, y no hay manera de que un dispositivo programe un
 * aviso por un suceso que ocurre en otro. De ahí que esto salga del servidor
 * (`api/src/avisos.js`), que es quien se entera.
 *
 * **La visibilidad ya no se cumple sola**, que era la ventaja de programarlos en
 * el dispositivo: el texto lo compone el Worker, así que allí hay que volver a
 * aplicarla. Se aplica componiendo la instantánea de quien recibiría el aviso y
 * mirando si el objeto está dentro; no hay una segunda copia de la regla.
 *
 * **Los botones no los pone este plugin.** `@capacitor/push-notifications` no
 * tiene `registerActionTypes`, pero las categorías de notificación son de la
 * aplicación entera y no del plugin que las declara: se registran con el de
 * notificaciones locales, el servidor nombra la categoría en el sobre, y la
 * respuesta vuelve por `pushNotificationActionPerformed` porque Capacitor
 * reparte por el tipo de disparador y no por quién registró la categoría. Todo
 * esto vive en JS, así que los botones y sus rótulos se cambian por OTA.
 *
 * La forma entera está en `specs/ux.md` §12.4.
 */

/**
 * Los botones de cada clase de propuesta, con las palabras de la hoja del turno.
 *
 * Los identificadores son los de `api/src/avisos.js` —`CATEGORIA_CAMBIO` y
 * `CATEGORIA_CORRECCION`— y tienen que decir lo mismo en los dos sitios, como
 * los turnos de Lío. Los rótulos, en cambio, son solo de aquí: son pantalla.
 *
 * Van todos con `foreground`, es decir, abriendo la aplicación. Una acción de
 * segundo plano contestaría sin abrir nada, que suena mejor hasta que se mira de
 * cerca: iOS despierta el proceso pero el WebView tarda en estar vivo, y la
 * respuesta se perdería justo en el caso que más importa, con la aplicación
 * cerrada. Abriendo, se ve lo que se ha contestado.
 */
export const CATEGORIAS_DE_AVISO = [
  {
    id: 'LIO_CAMBIO',
    actions: [
      { id: 'aceptar', title: 'Acepto', foreground: true },
      { id: 'rechazar', title: 'No puedo', foreground: true, destructive: true },
    ],
  },
  {
    id: 'LIO_CORRECCION',
    actions: [
      { id: 'aceptar', title: 'Es verdad', foreground: true },
      { id: 'rechazar', title: 'No fue así', foreground: true, destructive: true },
    ],
  },
];

const pushDisponible = () => Boolean(esNativo() && plugin('PushNotifications'));

/** ¿Se puede siquiera preguntar? En el navegador, no: esto es de la cáscara. */
export const hayAvisosRemotos = () => pushDisponible();

/**
 * En qué ha quedado el permiso, sin pedirlo.
 *
 * `concedido`, `denegado` —y entonces solo se arregla en los Ajustes de iOS—,
 * `sin-preguntar` o `no-aplica`.
 */
export async function permisoDeAvisos() {
  const push = plugin('PushNotifications');
  if (!pushDisponible()) return 'no-aplica';
  try {
    const { receive } = await push.checkPermissions();
    if (receive === 'granted') return 'concedido';
    if (receive === 'denied') return 'denegado';
    return 'sin-preguntar';
  } catch {
    return 'no-aplica';
  }
}

/**
 * Registrarse en APNs y devolver el token, que es por donde se alcanza a este
 * aparato.
 *
 * El token no lo devuelve `register()`: llega después, por un oyente, y puede no
 * llegar —sin red, o con el aparato en un estado en el que Apple no contesta—.
 * De ahí la espera con tope: sin ella, encender el interruptor podría quedarse
 * girando para siempre.
 */
const ESPERA_DEL_TOKEN_MS = 15000;

/** Una promesa que se contesta desde fuera y una sola vez, venga la respuesta de
 *  donde venga: del token, de un error de Apple o del reloj. */
class PromesaDelToken {
  constructor() {
    this.espera = new Promise((cumplir) => { this.cumplir = cumplir; });
    this.contestada = false;
  }

  resolver(valor) {
    if (this.contestada) return;
    this.contestada = true;
    this.cumplir(valor);
  }
}

export async function activarAvisosRemotos() {
  const push = plugin('PushNotifications');
  if (!pushDisponible()) return { estado: 'no-aplica' };

  try {
    let permiso = await push.checkPermissions();
    if (permiso.receive === 'prompt' || permiso.receive === 'prompt-with-rationale') {
      permiso = await push.requestPermissions();
    }
    if (permiso.receive !== 'granted') return { estado: 'sin-permiso' };

    await registrarCategorias();

    // Los oyentes se ponen **antes** de registrarse, y por eso se esperan: si se
    // pidiera el registro primero, el token podría llegar antes de que hubiera
    // nadie escuchando y la espera se agotaría con el aparato ya dado de alta.
    const respuesta = new PromesaDelToken();
    const oyentes = await Promise.all([
      push.addListener('registration', ({ value }) => respuesta.resolver(value || null)),
      push.addListener('registrationError', () => respuesta.resolver(null)),
    ]);

    const reloj = setTimeout(() => respuesta.resolver(null), ESPERA_DEL_TOKEN_MS);
    push.register().catch(() => respuesta.resolver(null));

    const token = await respuesta.espera;
    clearTimeout(reloj);
    for (const oyente of oyentes) oyente?.remove?.();

    if (!token) return { estado: 'sin-token' };
    return { estado: 'registrado', token };
  } catch (error) {
    return { estado: 'error', detalle: String(error?.message ?? error) };
  }
}

/**
 * Dejar de recibirlos.
 *
 * `unregister()` le dice a APNs que este aparato ya no quiere nada; quitar el
 * token de la base es cosa del Worker, y quien llama tiene que hacer las dos.
 * Solo con lo de aquí, el servidor seguiría empujando a un token que ya no
 * escucha; solo con lo del servidor, el permiso del sistema quedaría puesto sin
 * que nada lo use.
 */
export async function desactivarAvisosRemotos() {
  const push = plugin('PushNotifications');
  if (!pushDisponible()) return { estado: 'no-aplica' };
  try {
    await push.unregister();
    return { estado: 'retirado' };
  } catch (error) {
    return { estado: 'error', detalle: String(error?.message ?? error) };
  }
}

/**
 * El globo rojo del icono, con lo que espera respuesta.
 *
 * Lo escriben **dos** y tienen que escribir lo mismo. El servidor lo manda en
 * cada aviso, que es lo único que funciona con la aplicación cerrada —ahí no hay
 * JavaScript corriendo—; y esto lo reescribe en cada instantánea nueva, que es lo
 * único que funciona cuando contestas desde dentro, porque contestarte a ti mismo
 * no genera ningún aviso y el globo se quedaría contando lo que ya no espera.
 *
 * De ahí la única dependencia nativa que se añade además del push. Se puede
 * poner a cero sin ninguna —`removeAllDeliveredNotifications` lo hace de
 * pasada—, pero a cero no es lo que hay que poner: quien abre la aplicación con
 * dos peticiones sin contestar y sale sin contestarlas sigue teniendo dos.
 */
export async function ponerElGlobo(cuantos) {
  const globo = plugin('Badge');
  if (!esNativo() || !globo) return;
  try {
    if (cuantos > 0) await globo.set({ count: cuantos });
    else await globo.clear();
  } catch {
    /* sin globo: no es nada que arreglar aquí */
  }
}

/** Las categorías se declaran con el plugin de las locales, que es el único que
 *  sabe hacerlo; valen para las dos clases de aviso porque son de la aplicación. */
async function registrarCategorias() {
  const locales = plugin('LocalNotifications');
  if (!locales?.registerActionTypes) return;
  try {
    await locales.registerActionTypes({ types: CATEGORIAS_DE_AVISO });
  } catch {
    /* sin botones: el aviso sigue llegando y se abre tocándolo */
  }
}

/**
 * Qué hacer cuando alguien toca un aviso, o uno de sus botones.
 *
 * Llega `{ accion, datos }`: la acción es `tap` si se tocó el cuerpo, o el
 * identificador del botón; los datos son lo que el Worker puso fuera de `aps`
 * —de qué módulo es y de qué objeto—, que es lo que dice a qué pantalla ir.
 *
 * **No hace falta ningún esquema de URL para esto.** Un `garciadoral://` sirve
 * para entrar desde fuera —un enlace en un mensaje—, y sería un binario nuevo
 * por algo que aquí no se usa: una notificación no abre la aplicación por una
 * URL, la abre y le entrega su contenido. Capacitor además retiene el suceso
 * hasta que alguien lo escucha, así que un arranque en frío no lo pierde: se
 * atiende en cuanto este oyente queda puesto.
 */
export async function alTocarUnAviso(atender) {
  const push = plugin('PushNotifications');
  if (!pushDisponible()) return;
  try {
    await push.addListener('pushNotificationActionPerformed', ({ actionId, notification }) => {
      const { aps, ...datos } = notification?.data || {};
      try {
        atender({ accion: actionId || 'tap', datos });
      } catch {
        /* que un fallo navegando no rompa el oyente */
      }
    });
  } catch {
    /* sin oyente: el aviso abre la aplicación por donde estuviera */
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
