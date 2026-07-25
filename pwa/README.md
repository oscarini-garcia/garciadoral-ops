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
                          la cabecera lleva el estado de sincronización y los ajustes
  404.html              · para que una ruta inexistente no devuelva la app
  privacidad.html       · política de privacidad, obligatoria en la ficha de la App Store
  soporte.html          · página de ayuda, la otra URL que la ficha exige
  config.json           · API, Services ID de Apple y manifiesto OTA
  manifest.webmanifest  · instalación como PWA
  sw.js                 · caché del armazón; la API nunca se cachea
  _headers              · cabeceras de Cloudflare Pages
  css/estilos.css       · dos temas completos, no una inversión del claro
  js/
    app.js              · arranque, pestañas y botón de crear contextual
    native.js           · puente con la cáscara: háptica, compartir, OTA,
                          acceso y recordatorios locales
    sesion.js           · Sign in with Apple, por la web o por la hoja nativa
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

**Los ajustes viven en la cabecera, no en una quinta pestaña.** No son un sitio
al que se vaya a hacer algo: se entra, se toca una cosa y se sale. Una pestaña
les daría un peso que no tienen y se lo quitaría a las cuatro que sí. Dentro
están el aspecto, la actualización de la app, el cierre de sesión y la baja.

**Darse de baja no es desaparecer del hogar.** «Cuenta» y «persona» son cosas
distintas, y el modelo ya las separaba antes de que Apple lo exigiera: una
persona sin cuenta es un estado de primera clase, el de quien cumple años y
recibe regalos pero no entra en la aplicación. La baja deshace el vínculo con
Apple, los dispositivos, los avisos y los permisos, y deja a la persona ahí,
con lo que la familia escribió sobre ella —que no es dato de la cuenta y no le
pertenece a solas—. Volver exige que alguien vuelva a vincularla, igual que la
primera vez.

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

Eso deja el binario en App Store Connect, que no es lo mismo que publicarlo. La
ficha, las notas de revisión y el obstáculo que tiene esta aplicación en
concreto —que quien la revisa no puede entrar, porque el acceso es por
invitación— están en `docs/despliegue-cloudflare.md` §8.3.

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

### Cinco detalles que conviene conocer

**Los recordatorios los programa el teléfono, no el servidor.** Treinta
minutos antes de un evento con hora, la tarde anterior si ocupa la jornada
completa. No pasan por APNs y funcionan sin conexión, pero lo importante es
otra cosa: como se componen a partir de la instantánea, que el Worker ya ha
filtrado, **heredan la visibilidad sin que haya que volver a aplicarla**. Se
cancelan y reprograman enteros en cada sincronización, igual que la
instantánea se sustituye entera, y por el mismo motivo: así un evento que
deja de ser visible se lleva su aviso pendiente con él. iOS solo guarda las 64
más próximas, así que el recorte se hace aquí.

**El acceso con Apple tiene dos caminos, y no es por gusto.** En el navegador va
por el SDK en ventana emergente, con el Services ID y el dominio de la PWA como
URL de retorno. Dentro de la cáscara ese flujo no cabe: el origen es
`capacitor://localhost`, que Apple no admite como *Return URL*, así que allí se
usa la hoja nativa, que se identifica con el paquete y no necesita dominio.
`sesion.js` elige según `esNativo()` y el canje contra la API es idéntico; el
Worker admite las dos audiencias y devuelve la misma persona. Consecuencia
práctica: **el acceso nativo no llega por OTA**, porque el complemento es código
del binario.

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
