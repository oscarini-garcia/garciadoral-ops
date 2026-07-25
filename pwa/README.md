# Agenda Familiar — la aplicación

Una sola base de código para las dos formas de usarla:

- **La web**, una PWA instalable sin proceso de compilación: módulos ES nativos,
  CSS propio y service worker. Lo que se publica es el contenido de `publico/`.
- **La app de iOS**, una cáscara de Capacitor con esa misma web empaquetada
  dentro, que se actualiza **por OTA** sin pasar por Apple cada vez.

La arquitectura es la **opción D** de `specs/ux.md`: la semana abre la
aplicación, los regalos viven en su propia pestaña y la ficha de persona de la
opción C hace de pantalla de detalle dentro de Familia.

## Probarla en local

```bash
python3 herramientas/preparar-pwa.py     # iconos y registro de demostración
npx http-server pwa/publico -p 8788 -c-1
```

Abra `http://127.0.0.1:8788` y pulse **Ver una demostración con datos de
ejemplo**. Se elige con los ojos de quién se mira: entrando como Ana el jueves
23 aparece «Ver el sitio para la fiesta», y entrando como Marta ese día está
vacío. Es la misma semana y son dos semanas distintas.

En la demostración el recorte lo hace el navegador porque no hay servidor con el
que hablar. **No es el modelo de seguridad**: en la aplicación real el filtrado
ocurre en el Worker, antes de transmitir, y el dispositivo nunca llega a recibir
lo que su titular no puede ver. La copia de la función de visibilidad de
`js/demo.js` existe solo para que la demostración enseñe lo que se verá.

## Cómo está organizada

```
package.json            · versión (la que dispara el OTA) y dependencias nativas
capacitor.config.json   · identidad de la app y ajustes de los plugins
scripts/patch-ios.mjs   · quita el rebote del scroll en el proyecto generado
publico/
  index.html            · armazón: acceso, cabecera, pantalla, pestañas
  config.json           · API, Services ID de Apple y manifiesto OTA
  manifest.webmanifest  · instalación como PWA
  sw.js                 · caché del armazón; la API nunca se cachea
  _headers              · cabeceras de Cloudflare Pages
  css/estilos.css       · dos temas completos, no una inversión del claro
  js/
    app.js              · arranque, pestañas y botón de crear contextual
    native.js           · puente con la cáscara: háptica, compartir y OTA
    sesion.js           · Sign in with Apple en la web
    almacen.js          · IndexedDB: instantánea y cola de cambios
    sincronizacion.js   · escritura optimista y subida diferida
    modelo.js           · consultas sobre la instantánea
    semana.js           · semana, recurrencias y eventos de varios días
    demo.js             · solo para la demostración
    vistas/             · semana · regalos · familia · buscar
  demo/, iconos/        · generados por herramientas/preparar-pwa.py
ios/                    · lo genera `cap add ios` en el Mac; no se versiona
```

## Decisiones que conviene conocer

**La instantánea se sustituye entera.** El servidor devuelve todo lo que su
titular puede ver y el cliente reemplaza su almacén con ello. Es lo que hace que
la retirada retroactiva funcione sola: cuando alguien pasa a ser destinatario de
algo que ya tenía sincronizado, la siguiente respuesta no lo trae y desaparece
de su dispositivo. A escala de un hogar —unos cientos de filas— sale más barato
que un delta y no deja huecos por los que un elemento retirado sobreviva.

**El aviso «Por aquí no se mira» se genera en el dispositivo** a partir de una
condición estática: ¿va este evento de mí? Nunca de un recuento recibido del
servidor, que sería por sí mismo el dato que se pretende ocultar.

**El service worker no cachea la API.** Guardar respuestas de `/api/` sería
guardar una instantánea filtrada para un titular en un almacén que no distingue
titulares. Lo que se cachea es el armazón; los datos viven en IndexedDB.

**El botón de crear pertenece a la pantalla.** En la semana crea un evento, en
Regalos y en Familia apunta una idea, y en Buscar no aparece.

---

## La app de iOS

El binario nativo casi nunca cambia: se sube a Apple la primera vez y solo se
vuelve a subir cuando se toca algo nativo —un plugin, los iconos, los permisos—.
Todo lo demás viaja por OTA.

```bash
cd pwa
npm install
npx cap add ios          # solo en el Mac: hace pod install
npm run sync:ios         # copia la web, sincroniza y aplica el parche del scroll
npm run assets:ios       # iconos y splash desde una fuente de 1024×1024
npm run open:ios
```

En Xcode: *Signing & Capabilities* → su equipo, y el identificador del paquete
igual que `appId` en `capacitor.config.json` y que `APPLE_AUD_IOS` en el Worker.
Después, *Any iOS Device* → **Product ▸ Archive** → **Distribute App**.

### Publicar una actualización

1. Cambie lo que sea de `pwa/publico`.
2. **Suba la versión** en `pwa/package.json`.
3. Mergee a `main`.

El workflow `bundle OTA` empaqueta `publico/` en un `bundle.zip`, calcula su
`sha256`, escribe `latest.json` y crea el release `ota-v<versión>`. Las apps leen
ese manifiesto al abrir y, si hay versión nueva, la descargan y la aplican en la
**siguiente** apertura. Si no cambia la versión, no se publica nada: un empujón
normal a `main` es inofensivo.

Antes de publicar, el workflow comprueba que `config.json` no tenga marcadores
`EJEMPLO`. Un bundle con ellos dejaría a todos los teléfonos apuntando a una API
que no existe, y encima se aplicaría solo.

### Tres detalles que conviene conocer

**El puente no necesita empaquetador.** La receta importa `@capacitor/core`, lo
que obligaría a meter Vite solo para eso. Como esta webapp son módulos ES
servidos tal cual, `native.js` habla con los plugins a través del puente global
que la propia cáscara inyecta (`window.Capacitor.Plugins`). Los paquetes de npm
siguen haciendo falta para que `cap sync` instale los pods; lo que cambia es cómo
los llama la web. Fuera de la cáscara todo son operaciones nulas, así que la PWA
y las pruebas no se enteran.

**El service worker no se registra dentro de la app.** Allí el armazón ya viene
empaquetado y quien decide cuándo cambia es el OTA. Dos cachés compitiendo por lo
mismo solo producen pantallas viejas que nadie sabe por qué no se van.

**Háptica y compartir no son adorno.** Son las capacidades nativas que sostienen
que esto sea una aplicación y no una web envuelta, que es lo que mira la guía 4.2
de Apple. Compartir un evento saca solo su cara pública: ni una palabra de la
dimensión de regalos.

---

## Despliegue

Consulte `docs/despliegue-cloudflare.md`. En resumen: un proyecto de Cloudflare
Pages con directorio de salida `pwa/publico`, `config.json` apuntando al Worker
y al Services ID de Apple, y el dominio de la PWA declarado en
`ORIGENES_PERMITIDOS` del Worker.
