// Aplica al proyecto iOS generado por Capacitor lo que no cabe en la web: el
// arreglo del rebote del scroll, la declaración de que esto es una aplicación de
// iPhone, el cumplimiento de exportación y el entitlement de los avisos remotos.
// Es idempotente y se engancha a `npm run sync:ios`.
//
// El «rubber-band» del WKWebView es lo que más delata que dentro hay una web.
// Se quita subclaseando el controlador y poniendo `scrollView.bounces = false`.
//
// El bache conocido: además de crear el `.swift` hay que **registrarlo en el
// `.pbxproj`**. Si no se registra, no se compila, el storyboard apunta a una
// clase que no existe y la aplicación arranca en pantalla negra.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_IOS = 'ios/App/App';

if (!existsSync(APP_IOS)) {
  console.log('[patch-ios] ios/ no existe todavía — ejecuta "npx cap add ios" en el Mac. Omitido.');
  process.exit(0);
}

// 1) El controlador que desactiva el rebote.
const rutaControlador = join(APP_IOS, 'MainViewController.swift');
const fuente = `import Capacitor

/// Cáscara de la Agenda Familiar.
///
/// Lo único que hace es quitar el rebote del scroll: es el detalle que delata
/// que dentro hay un WKWebView y no una vista nativa.
class MainViewController: CAPBridgeViewController {
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        webView?.scrollView.bounces = false
    }
}
`;

if (!existsSync(rutaControlador) || readFileSync(rutaControlador, 'utf8') !== fuente) {
  writeFileSync(rutaControlador, fuente);
  console.log('[patch-ios] MainViewController.swift escrito.');
}

// 2) Registrarlo en el proyecto de Xcode.
const rutaProyecto = 'ios/App/App.xcodeproj/project.pbxproj';

if (existsSync(rutaProyecto)) {
  let proyecto = readFileSync(rutaProyecto, 'utf8');

  if (proyecto.includes('MainViewController.swift')) {
    console.log('[patch-ios] Ya estaba registrado en Xcode.');
  } else {
    const IDENTIFICADOR_BUILD = 'A6E11DA0000000000000001';
    const IDENTIFICADOR_FICHERO = 'A6E11DA0000000000000002';

    proyecto = proyecto.replace(
      /(\w{24} \/\* AppDelegate\.swift in Sources \*\/ = \{isa = PBXBuildFile;[^\n]*\};\n)/,
      `$1\t\t${IDENTIFICADOR_BUILD} /* MainViewController.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${IDENTIFICADOR_FICHERO} /* MainViewController.swift */; };\n`,
    );
    proyecto = proyecto.replace(
      /(\w{24} \/\* AppDelegate\.swift \*\/ = \{isa = PBXFileReference;[^\n]*\};\n)/,
      `$1\t\t${IDENTIFICADOR_FICHERO} /* MainViewController.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = MainViewController.swift; sourceTree = "<group>"; };\n`,
    );
    proyecto = proyecto.replace(
      /(\w{24} \/\* AppDelegate\.swift \*\/,\n)/,
      `$1\t\t\t\t${IDENTIFICADOR_FICHERO} /* MainViewController.swift */,\n`,
    );
    proyecto = proyecto.replace(
      /(\w{24} \/\* AppDelegate\.swift in Sources \*\/,\n)/,
      `$1\t\t\t\t${IDENTIFICADOR_BUILD} /* MainViewController.swift in Sources */,\n`,
    );

    const registrado =
      proyecto.split(IDENTIFICADOR_BUILD).length - 1 === 2 &&
      proyecto.split(IDENTIFICADOR_FICHERO).length - 1 === 3;

    if (registrado) {
      writeFileSync(rutaProyecto, proyecto);
      console.log('[patch-ios] Registrado en Xcode ✅');
    } else {
      console.warn(
        '[patch-ios] ⚠ No he sabido registrarlo: la plantilla de Capacitor ha cambiado.\n' +
        '            Añádelo a mano en Xcode → clic derecho en App → Add Files to "App" → target App.',
      );
    }
  }
}

// 3) Solo iPhone.
//
// La plantilla de Capacitor deja el proyecto como universal
// (`TARGETED_DEVICE_FAMILY = "1,2"`), y eso tiene una consecuencia que no
// aparece hasta el final: App Store Connect exige capturas de iPad de 13
// pulgadas y no deja enviar sin ellas. Se puede sortear haciéndolas en el
// simulador, pero entonces se publica para iPad una interfaz pensada para el
// pulgar, con las pestañas abajo y una sola columna: capturas honradas de algo
// que nadie ha mirado en esa pantalla.
//
// Así que se declara lo que es: una aplicación de iPhone. Añadir iPad más
// adelante es quitar esta línea y diseñarlo en serio.
if (existsSync(rutaProyecto)) {
  const proyecto = readFileSync(rutaProyecto, 'utf8');

  if (!proyecto.includes('TARGETED_DEVICE_FAMILY = "1,2"')) {
    console.log('[patch-ios] Ya estaba declarada como aplicación de iPhone.');
  } else {
    writeFileSync(
      rutaProyecto,
      proyecto.replaceAll('TARGETED_DEVICE_FAMILY = "1,2"', 'TARGETED_DEVICE_FAMILY = 1'),
    );
    console.log('[patch-ios] Solo iPhone: no se pedirán capturas de iPad ✅');
  }
}

// 4) Declarar el cumplimiento de exportación en el Info.plist.
//
// Esta aplicación solo usa HTTPS, que es criptografía exenta, pero si no se
// declara, App Store Connect pregunta por ella en **cada** subida y deja la
// build retenida hasta que alguien conteste. Contestarlo aquí, una vez, ahorra
// ese paso en todas las siguientes.
//
// Va en el parche y no a mano en Xcode porque `ios/` no se versiona: escrito a
// mano se perdería en el siguiente `cap add ios`, y volvería la pregunta sin
// que nadie recuerde por qué.
const rutaPlist = join(APP_IOS, 'Info.plist');

if (existsSync(rutaPlist)) {
  const plist = readFileSync(rutaPlist, 'utf8');

  if (plist.includes('ITSAppUsesNonExemptEncryption')) {
    console.log('[patch-ios] El cumplimiento de exportación ya estaba declarado.');
  } else {
    const cierre = plist.lastIndexOf('</dict>');
    if (cierre === -1) {
      console.warn('[patch-ios] ⚠ Info.plist no tiene la forma esperada; declare la exportación en Xcode.');
    } else {
      const declaracion = '\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n';
      writeFileSync(rutaPlist, plist.slice(0, cierre) + declaracion + plist.slice(cierre));
      console.log('[patch-ios] Cumplimiento de exportación declarado ✅');
    }
  }
}

// 4 bis) El nombre que se ve bajo el icono.
//
// Capacitor escribe `appName` en el Info.plist **al generar** el proyecto, y
// `cap sync` no lo renombra después: cambiar `capacitor.config.json` en un
// proyecto ya creado no tiene ningún efecto, y el teléfono sigue enseñando el
// nombre viejo. Eso costó un rechazo de la App Store por la directriz 2.3.8,
// que exige que el nombre de la tienda y el del dispositivo se parezcan.
//
// Se sincroniza aquí, en cada `sync:ios`, para que la única fuente sea
// `capacitor.config.json` y no un campo de Xcode que nadie recuerda haber
// tocado —y que además se perdería en el siguiente `cap add ios`, porque
// `ios/` no se versiona—.
if (existsSync(rutaPlist)) {
  const { appName } = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
  const plist = readFileSync(rutaPlist, 'utf8');
  const clave = /(<key>CFBundleDisplayName<\/key>\s*<string>)([^<]*)(<\/string>)/;
  const puesto = plist.match(clave)?.[2];

  if (!appName) {
    console.warn('[patch-ios] ⚠ capacitor.config.json no tiene appName; el nombre se queda como está.');
  } else if (puesto === appName) {
    console.log(`[patch-ios] El nombre ya era «${appName}».`);
  } else if (puesto !== undefined) {
    writeFileSync(rutaPlist, plist.replace(clave, `$1${appName}$3`));
    console.log(`[patch-ios] Nombre en pantalla: «${puesto}» → «${appName}» ✅`);
  } else {
    const cierre = plist.lastIndexOf('</dict>');
    if (cierre === -1) {
      console.warn('[patch-ios] ⚠ Info.plist no tiene la forma esperada; ponga el nombre en Xcode.');
    } else {
      const declaracion = `\t<key>CFBundleDisplayName</key>\n\t<string>${appName}</string>\n`;
      writeFileSync(rutaPlist, plist.slice(0, cierre) + declaracion + plist.slice(cierre));
      console.log(`[patch-ios] Nombre en pantalla declarado: «${appName}» ✅`);
    }
  }
}

// 5) Los avisos remotos: el entitlement y el reenvío del token.
//
// Es lo único de todo el módulo de avisos que no puede llegar por OTA. Las
// categorías, los botones, sus rótulos, a quién se avisa y qué dice el aviso son
// JavaScript o Worker; esto son dos cosas del binario:
//
//   a) `aps-environment`, sin el cual iOS ni siquiera pide un token.
//   b) El reenvío del token desde el AppDelegate, que la plantilla de Capacitor
//      no trae: sin él, `register()` no falla —simplemente no llega nunca el
//      token— y desde la web parece que Apple no contesta.
//
// Queda un paso que ningún script puede dar: habilitar Push Notifications para
// el App ID en el portal de Apple Developer. Con la firma automática, Xcode lo
// hace solo al leer este entitlement; si la firma es manual, hay que ir.
const rutaEntitlements = join(APP_IOS, 'App.entitlements');

// `development` es el valor para lo que se instala desde Xcode. Al archivar
// para TestFlight o la App Store, la firma lo sustituye por `production`, y
// entonces el Worker tiene que hablar con el APNs de producción: es lo que
// decide `APNS_ENTORNO` en `api/wrangler.toml`. Los tokens de un entorno no
// valen en el otro, y el síntoma es `BadDeviceToken` sin más explicación.
// El segundo entitlement es el que deja marcar un aviso como urgente
// (`interruption-level: time-sensitive`), que es lo que hace que una petición de
// turno atraviese el modo concentración. No hay que pedírselo a Apple ni
// justificarlo —eso es lo de las alertas críticas—: basta con declararlo. Sin
// él, iOS entrega el aviso igual pero como uno corriente, y el fallo no se ve
// hasta que alguien tiene el teléfono en concentración a las siete y media.
const ENTITLEMENTS = {
  'aps-environment': '\t<string>development</string>',
  'com.apple.developer.usernotifications.time-sensitive': '\t<true/>',
};

if (!existsSync(rutaEntitlements)) {
  const claves = Object.entries(ENTITLEMENTS)
    .map(([clave, valor]) => `\t<key>${clave}</key>\n${valor}`)
    .join('\n');
  writeFileSync(rutaEntitlements, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${claves}
</dict>
</plist>
`);
  console.log('[patch-ios] App.entitlements escrito (avisos y urgencia) ✅');
} else {
  // Ya existe —lo habitual si la capacidad se marcó a mano en Xcode—, así que
  // solo se le añade lo que le falte, sin tocar lo que ya diga.
  let plist = readFileSync(rutaEntitlements, 'utf8');
  const faltan = Object.entries(ENTITLEMENTS).filter(([clave]) => !plist.includes(`<key>${clave}</key>`));

  if (!faltan.length) {
    console.log('[patch-ios] App.entitlements ya lo tenía todo.');
  } else {
    const cierre = plist.lastIndexOf('</dict>');
    if (cierre === -1) {
      console.warn('[patch-ios] ⚠ App.entitlements no tiene la forma esperada; añade las claves en Xcode.');
    } else {
      const nuevas = faltan.map(([clave, valor]) => `\t<key>${clave}</key>\n${valor}\n`).join('');
      plist = plist.slice(0, cierre) + nuevas + plist.slice(cierre);
      writeFileSync(rutaEntitlements, plist);
      console.log(`[patch-ios] App.entitlements completado: ${faltan.map(([c]) => c).join(', ')} ✅`);
    }
  }
}

if (existsSync(rutaProyecto)) {
  const proyecto = readFileSync(rutaProyecto, 'utf8');

  if (proyecto.includes('CODE_SIGN_ENTITLEMENTS')) {
    console.log('[patch-ios] El entitlement ya estaba declarado en Xcode.');
  } else {
    // El identificador del paquete solo aparece en las configuraciones del
    // target de la aplicación, que son exactamente aquellas donde tiene que ir
    // el entitlement. No hace falta añadir el fichero al proyecto: esto es una
    // ruta, no un fuente que se compile.
    const conEntitlement = proyecto.replace(
      /(\n(\s*)PRODUCT_BUNDLE_IDENTIFIER = [^;]+;\n)/g,
      (_, linea, sangria) => `${linea}${sangria}CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n`,
    );
    if (conEntitlement === proyecto) {
      console.warn(
        '[patch-ios] ⚠ No he encontrado dónde declarar el entitlement.\n' +
        '            Ponlo a mano: target App → Signing & Capabilities → + Push Notifications.',
      );
    } else {
      writeFileSync(rutaProyecto, conEntitlement);
      console.log('[patch-ios] Entitlement de avisos declarado ✅');
    }
  }
}

const rutaDelegado = join(APP_IOS, 'AppDelegate.swift');

if (existsSync(rutaDelegado)) {
  const delegado = readFileSync(rutaDelegado, 'utf8');

  if (delegado.includes('didRegisterForRemoteNotificationsWithDeviceToken')) {
    console.log('[patch-ios] El reenvío del token de avisos ya estaba.');
  } else {
    const reenvio = `
    // El token que APNs le da a este aparato. Capacitor lo espera por el centro
    // de notificaciones, y su plantilla no trae este reenvío: sin él,
    // \`PushNotifications.register()\` no da error y el token no llega nunca.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications,
                                        object: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                        object: error)
    }
`;
    const cierre = delegado.lastIndexOf('}');
    if (cierre === -1) {
      console.warn('[patch-ios] ⚠ AppDelegate.swift no tiene la forma esperada; añade el reenvío a mano.');
    } else {
      writeFileSync(rutaDelegado, delegado.slice(0, cierre) + reenvio + delegado.slice(cierre));
      console.log('[patch-ios] Reenvío del token de avisos añadido ✅');
    }
  }
}

// 6) Apuntar el storyboard al controlador nuevo.
const rutaStoryboard = join(APP_IOS, 'Base.lproj', 'Main.storyboard');

if (existsSync(rutaStoryboard)) {
  let storyboard = readFileSync(rutaStoryboard, 'utf8');
  const original = 'customClass="CAPBridgeViewController" customModule="Capacitor"';

  if (storyboard.includes(original)) {
    storyboard = storyboard.replace(original, 'customClass="MainViewController" customModuleProvider="target"');
    writeFileSync(rutaStoryboard, storyboard);
    console.log('[patch-ios] Storyboard apuntado. Rebote desactivado ✅');
  } else if (storyboard.includes('MainViewController')) {
    console.log('[patch-ios] El storyboard ya apuntaba al controlador.');
  } else {
    console.warn(
      '[patch-ios] ⚠ El storyboard no tiene la clase que esperaba.\n' +
      '            Ponla a mano: Main.storyboard → clase de la vista → MainViewController.',
    );
  }
}
