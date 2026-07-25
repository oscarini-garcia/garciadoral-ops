// swift-tools-version: 5.9
import PackageDescription

/// El núcleo de la Agenda Familiar como paquete propio.
///
/// Separarlo de la aplicación tiene un motivo práctico: el modelo, la función de
/// visibilidad y la expansión de la semana se pueden compilar y probar en
/// cualquier plataforma, sin simulador y sin interfaz. `swift test` los verifica
/// contra las mismas reglas que las pruebas de Python y de JavaScript.
let package = Package(
    name: "AgendaFamiliarCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AgendaFamiliarCore", targets: ["AgendaFamiliarCore"]),
    ],
    targets: [
        .target(name: "AgendaFamiliarCore"),
        .testTarget(name: "AgendaFamiliarCoreTests", dependencies: ["AgendaFamiliarCore"]),
    ]
)
