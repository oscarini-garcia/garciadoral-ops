# Agenda Familiar — aplicación iOS

SwiftUI, iOS 17 o posterior, sin dependencias externas. El proyecto de Xcode se
genera con XcodeGen a partir de `project.yml`.

```bash
brew install xcodegen
cd ios
xcodegen generate
open AgendaFamiliar.xcodeproj
```

El núcleo se puede compilar y probar sin simulador ni interfaz, en cualquier
plataforma con Swift instalado:

```bash
cd ios && swift test
```

> Las pruebas del núcleo no se han ejecutado en el entorno donde se escribió este
> código, que no tiene cadena de herramientas de Swift. Compílelas en el Mac
> antes de dar por buena la primera integración.

## Cómo está organizada

```
Package.swift                  · el núcleo como paquete propio
project.yml                    · descriptor de XcodeGen
Sources/AgendaFamiliarCore/
  Modelo.swift                 · entidades y consultas sobre la instantánea
  Visibilidad.swift            · la regla, para verificarla con pruebas
  Semana.swift                 · semana, recurrencias y eventos de varios días
  Almacen.swift                · instantánea y cola de cambios en disco
  ClienteAPI.swift             · sesión, descarga y subida
Tests/AgendaFamiliarCoreTests/ · las mismas reglas que Python y JavaScript
App/AgendaFamiliar/
  AgendaFamiliarApp.swift      · arranque, pestañas y Sign in with Apple
  Estado.swift                 · escritura optimista y sincronización
  Vistas/                      · semana · regalos · familia · buscar
```

## Decisiones que conviene conocer

**El núcleo va aparte de la aplicación.** El modelo, la función de visibilidad y
la expansión de la semana no necesitan interfaz, y separarlos permite probarlos
con `swift test` contra las mismas reglas que verifican la suite de Python y la
de JavaScript. Que las tres comprueben lo mismo es deliberado: una divergencia
entre implementaciones significaría que la aplicación y el plan semanal ocultan
cosas distintas.

**La visibilidad del cliente no protege nada.** `Visibilidad.swift` existe para
poder verificar la regla y para componer vistas previas. La protección real la
ejerce el Worker, que filtra antes de transmitir: el dispositivo nunca llega a
almacenar lo que su titular no puede ver, que es el requisito no funcional de
mayor importancia del sistema.

**El aviso «Por aquí no se mira» se deriva de una condición estática** —¿va este
evento de mí?—, nunca de un recuento recibido del servidor, que sería por sí
mismo el dato que se pretende ocultar. Y se muestra siempre, haya contenido o no.

**La instantánea se sustituye entera** en cada sincronización correcta. Es lo que
hace que la retirada retroactiva funcione sola.

**Un cambio solo lleva los campos que cambian.** `Fusion.aplicar` los mezcla con
la fila que ya está en la instantánea, de modo que ninguna pantalla necesita
conocer todos los campos de la entidad que toca.

## Configuración

- `Info.plist` → `AgendaAPI`: la URL del Worker. Se cambia sin tocar código.
- `AgendaFamiliar.entitlements` declara Sign in with Apple.
- El identificador del paquete (`store.galoopa.agenda`) debe coincidir con
  `APPLE_AUD_IOS` en la configuración del Worker.
- **El dominio de la web no interviene aquí.** En iOS, Sign in with Apple valida
  contra el identificador del paquete, no contra un dominio verificado. Que la
  PWA viva en `agenda.galoopa.store` no obliga a tocar nada de este proyecto ni
  del proceso de distribución por TestFlight. Solo haría falta declarar el
  dominio —como *Associated Domain*, con su `apple-app-site-association`— si
  algún día se quisieran enlaces universales, que hoy no se usan.

Los pasos de alta en Apple Developer y en Cloudflare están en
`docs/despliegue-cloudflare.md`.

## Qué falta

- El módulo **Anecdotario**, cuya especificación funcional está diferida.
- Los **calendarios externos** importados: el modelo los contempla y la interfaz
  los muestra como eventos no editables, pero no hay todavía conector que los
  traiga.
- Las **notificaciones locales** del recordatorio previo. La preferencia existe
  en el modelo; falta programarlas en el dispositivo.
