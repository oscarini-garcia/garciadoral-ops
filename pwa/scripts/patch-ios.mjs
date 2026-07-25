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

// 3) Apuntar el storyboard al controlador nuevo.
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
