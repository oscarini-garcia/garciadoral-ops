// Aplica al proyecto iOS generado por Capacitor el arreglo del rebote del
// scroll. Es idempotente y se engancha a `npm run sync:ios`.
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

// 5) Apuntar el storyboard al controlador nuevo.
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
