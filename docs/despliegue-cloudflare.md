# Puesta en marcha: Cloudflare, Apple y GitHub

Guía de despliegue de la Agenda Familiar. Va en orden: cada paso deja algo que
se puede comprobar antes de seguir al siguiente. Calcule **una tarde** la
primera vez, casi toda esperando a Apple.

Sustituya en todo el documento:

| Marcador | Qué es | Ejemplo |
|---|---|---|
| `EJEMPLO` | Su subdominio de `workers.dev` o el nombre corto de su cuenta | `garciadoral` |
| `agenda.example.com` | El dominio de la aplicación web | `agenda.migarcia.es` |
| `com.example.agenda` | El identificador del paquete de iOS | `es.migarcia.agenda` |

---

## 0. Lo que hace falta antes de empezar

- **Cuenta de Cloudflare** gratuita. El plan gratuito basta de sobra: D1 incluye
  5 GB y 5 millones de lecturas de fila al día, y Workers 100.000 peticiones
  diarias. Un hogar no se acerca ni de lejos.
- **Un dominio**, si quiere que la aplicación web tenga una dirección propia. No
  es obligatorio: Pages da una del tipo `agenda-familiar.pages.dev` y funciona
  igual. Sí lo es si va a usar Sign in with Apple en la web, porque Apple no
  admite dominios de terceros en las URL de retorno; en ese caso el dominio ha de
  ser suyo.
- **Apple Developer Program**, 99 € al año. Necesario para firmar la aplicación
  iOS y para Sign in with Apple. Sin él puede desplegar la PWA y usarla, pero no
  habrá acceso con Apple ni aplicación en el teléfono.
- **Node 20 o posterior** y `npm` en su máquina.
- Para la app de iOS, además: un **Mac con Xcode** y **CocoaPods**
  (`brew install cocoapods`). `npx cap add ios` hace `pod install`, que no
  funciona en Linux ni en CI.
- Acceso de escritura a este repositorio de GitHub.

```bash
npm install -g wrangler
wrangler login          # abre el navegador y autoriza la cuenta
```

---

## 1. Cloudflare: la base de datos

El registro canónico de la agenda vive en D1, que es SQLite gestionado. Esto
cierra la decisión pendiente §12.1 de `specs/plan-semanal.md`.

```bash
cd api
wrangler d1 create agenda-familiar
```

El comando imprime un bloque con `database_id`. **Cópielo a `api/wrangler.toml`**
en lugar de `PENDIENTE-DE-RELLENAR`.

Cree el esquema y los catálogos:

```bash
npm run migrar:remoto
```

Comprobación:

```bash
wrangler d1 execute agenda-familiar --remote \
  --command "SELECT id, nombre, emoji FROM tipo_evento ORDER BY orden"
```

Debe devolver los diez tipos de evento con sus emojis.

---

## 2. Cloudflare: los secretos y el Worker

Dos secretos. Genérelos con algo que no sea su cabeza:

```bash
openssl rand -base64 48   # para SESION_SECRETO
openssl rand -base64 32   # para TOKEN_SERVICIO
```

- **`SESION_SECRETO`** es la clave con la que el Worker firma las sesiones de los
  dispositivos. Si la cambia, todo el mundo tendrá que volver a entrar.
- **`TOKEN_SERVICIO`** es la credencial del generador del plan semanal, que lee
  el registro entero. Guárdela: la volverá a necesitar en el paso 7.

```bash
wrangler secret put SESION_SECRETO
wrangler secret put TOKEN_SERVICIO
```

Antes de desplegar, ajuste el bloque `[vars]` de `api/wrangler.toml`:

```toml
ORIGENES_PERMITIDOS = "https://agenda.example.com,http://localhost:8788"
APPLE_AUD_WEB = "com.example.agenda.web"
APPLE_AUD_IOS = "com.example.agenda"
```

`ORIGENES_PERMITIDOS` es lo que decide qué webs pueden hablar con la API. Sin
coincidencia no se emiten cabeceras CORS y el navegador corta la petición.

```bash
npm run desplegar
```

Anote la URL que devuelve —`https://agenda-familiar-api.EJEMPLO.workers.dev`— y
compruébela:

```bash
curl https://agenda-familiar-api.EJEMPLO.workers.dev/api/salud
# {"estado":"ok","ahora":"..."}
```

---

## 3. La primera persona

Todavía no hay nadie en el registro, y sin una persona administradora no se puede
entrar. Se crea a mano, una sola vez:

```bash
wrangler d1 execute agenda-familiar --remote --command "
  INSERT INTO persona (id, nombre, apellidos, tiene_cuenta, rol, activa)
  VALUES ('p-oscar', 'Óscar', 'García', 1, 'administrador', 1)"
```

Deje `identificador_apple` vacío: se rellena en el paso 6, cuando esa persona
intente entrar por primera vez y la aplicación le diga cuál es.

El resto del hogar se da de alta desde la propia aplicación, en Familia →
*Añadir una persona*. La carga inicial es manual a propósito: importar los
contactos del teléfono arrastraría duplicados y datos irrelevantes que después
habría que depurar uno a uno.

---

## 4. Apple: Sign in with Apple

Esta parte se hace en <https://developer.apple.com/account>, y es la que más
espera tiene: los cambios de dominio tardan unos minutos en propagarse.

### 4.1 Identificador de la aplicación (App ID)

1. **Certificates, Identifiers & Profiles → Identifiers → +**
2. Tipo **App IDs → App**.
3. Description: `Agenda Familiar`. Bundle ID **explícito**: `com.example.agenda`.
4. En Capabilities marque **Sign in with Apple**.
5. Guarde.

Ese Bundle ID es el que va en `APPLE_AUD_IOS` y en `pwa/capacitor.config.json`.

### 4.2 Identificador de servicio (Services ID), para la web

1. **Identifiers → + → Services IDs**.
2. Description: `Agenda Familiar Web`. Identifier: `com.example.agenda.web`.
3. Guarde, vuelva a abrirlo y marque **Sign in with Apple → Configure**:
   - **Primary App ID**: el del paso 4.1.
   - **Domains and Subdomains**: `agenda.example.com`
   - **Return URLs**: `https://agenda.example.com`
4. Guarde. Apple pedirá verificar el dominio descargando un fichero y
   publicándolo en `https://agenda.example.com/.well-known/apple-developer-domain-association.txt`.
   Descárguelo y colóquelo en `pwa/publico/.well-known/` antes de continuar; se
   publicará con el siguiente despliegue de Pages.

Ese Services ID es el que va en `APPLE_AUD_WEB` y en `pwa/publico/config.json`.

> **Si no tiene dominio propio.** Apple no admite `*.pages.dev` como dominio
> verificable. Puede desplegar la PWA y usarla, pero el botón de Apple fallará;
> la aplicación iOS sí funcionará, porque en nativo no hace falta dominio. La
> alternativa es apuntar un dominio suyo a Pages, que es gratis salvo el registro
> del dominio.

### 4.3 Nada de claves privadas

Este diseño **no** necesita la clave `.p8` de Sign in with Apple ni el flujo de
`client_secret`: el Worker verifica el `id_token` contra las claves públicas de
Apple (`https://appleid.apple.com/auth/keys`) y con eso le basta. Un secreto
menos que rotar.

---

## 5. Cloudflare Pages: la aplicación web

Antes de publicar, deje la configuración apuntando a lo suyo. Edite
`pwa/publico/config.json`:

```json
{
  "api": "https://agenda-familiar-api.EJEMPLO.workers.dev",
  "appleClienteWeb": "com.example.agenda.web",
  "redireccion": "https://agenda.example.com",
  "otaManifiesto": "https://github.com/oscarini-garcia/garciadoral-ops/releases/latest/download/latest.json"
}
```

Genere los iconos y el registro de demostración —hace falta una vez, y otra cada
vez que cambien los catálogos—:

```bash
python3 herramientas/preparar-pwa.py
```

Después, en el **panel de Cloudflare → Workers & Pages → Create → Pages →
Connect to Git**:

| Campo | Valor |
|---|---|
| Repositorio | `oscarini-garcia/garciadoral-ops` |
| Rama de producción | `main` |
| Framework preset | *None* |
| Build command | *(vacío)* |
| Build output directory | `pwa/publico` |

No hay proceso de compilación: lo que se publica es literalmente el contenido de
`pwa/publico`. Cada empujón a `main` republica.

**Dominio propio:** en el proyecto de Pages, *Custom domains → Set up a custom
domain* → `agenda.example.com`. Si el dominio ya está en Cloudflare, el registro
DNS se crea solo.

**Cabecera de seguridad:** cuando todo funcione, abra `pwa/publico/_headers`,
descomente la línea `Content-Security-Policy` y sustituya el subdominio del
Worker en `connect-src`. Actívela y compruebe el acceso en el mismo paso: con
`connect-src` mal puesto la aplicación deja de hablar con la API.

Comprobación: abra `https://agenda.example.com` y pulse **Ver una demostración
con datos de ejemplo**. Si la semana aparece con sus siete filas, la parte
estática está bien.

---

## 6. Vincular a las personas con su identificador de Apple

Cada persona entra una vez y la aplicación le dirá qué hay que vincular.

1. La persona abre la web (o la app) y pulsa **Entrar con Apple**.
2. Como su identificador todavía no está en el registro, aparece un aviso con la
   cadena que Apple asigna: algo como `000123.a1b2c3…`.
3. Un administrador abre **Familia → la persona → Editar la ficha** y pega esa
   cadena en *Identificador de Apple*. Si es la primera persona, y como todavía
   no puede entrar nadie, hágalo desde la línea de órdenes:

```bash
wrangler d1 execute agenda-familiar --remote --command "
  UPDATE persona SET identificador_apple = '000123.a1b2c3…' WHERE id = 'p-oscar'"
```

4. Esa persona vuelve a pulsar **Entrar con Apple** y ya está dentro.

El identificador que Apple entrega es **distinto para cada aplicación**, pero
comparte el mismo App ID entre la web y iOS si el Services ID tiene ese App ID
como *Primary*. Por eso el paso 4.2 importa: si se configura mal, la misma
persona recibe dos identificadores y hay que vincular los dos.

---

## 7. El plan semanal de los domingos

El generador ya está en el repositorio; solo hay que decirle de dónde leer y a
quién escribir. En **GitHub → Settings → Secrets and variables → Actions**:

| Secreto | Valor |
|---|---|
| `AGENDA_URL` | `https://agenda-familiar-api.EJEMPLO.workers.dev/api/registro` |
| `AGENDA_TOKEN` | El `TOKEN_SERVICIO` del paso 2 |
| `RECIPIENTS_JSON` | El mapa de destinatarios, más abajo |

Cada destinatario necesita antes su clave de CallMeBot: envía al bot el mensaje
de autorización desde su propio WhatsApp y recibe una `apikey`.

```json
{
  "oscar":  { "phone": "+34600111222", "apikey": "123456", "persona_id": "p-oscar" },
  "ana":    { "phone": "+34600333444", "apikey": "789012", "persona_id": "p-ana" },
  "marta":  { "phone": "+34600555666", "apikey": "345678", "persona_id": "p-marta" },
  "abuela": { "phone": "+34600777888", "apikey": "901234" }
}
```

`persona_id` es lo que decide **con los ojos de quién se compone su mensaje**.
Sin ese campo —la abuela— se compone la vista pública, que es la más
conservadora: solo eventos públicos, sin nada reservado. Añada `"plan": false` a
quien deba seguir en el despachador pero no recibir el plan.

Compruébelo antes del primer domingo, desde **Actions → plan-semanal → Run
workflow**, marcando **simulacro**. Imprime el mensaje de cada persona sin
enviarlo. Léalos: es el momento de verificar que a las hijas no les llega lo que
no debe llegarles.

Cuando esté conforme, ejecute el workflow **sin** simulacro y con **forzar**
marcado, para saltarse la ventana del domingo y ver el mensaje de verdad en el
teléfono.

> **Recuerde lanzar cada workflow a mano una vez.** En repositorios nuevos, la
> programación de GitHub Actions puede no activarse hasta la primera ejecución
> manual.

---

## 8. La aplicación iOS

No hay una aplicación nativa aparte: la de iOS es una **cáscara de Capacitor**
con la misma web dentro. El binario casi nunca cambia —se sube a Apple la primera
vez y solo se vuelve a subir cuando se toca algo nativo—, y los cambios de web
llegan a los teléfonos por OTA sin pasar por revisión.

Primero, deje la identidad puesta en `pwa/capacitor.config.json`:

```json
{ "appId": "com.example.agenda", "appName": "Agenda", "webDir": "publico" }
```

`appId` tiene que ser **el mismo** App ID del paso 4.1 y el mismo valor que
`APPLE_AUD_IOS` en el Worker. Cambiarlo después es un lío, así que elíjalo bien.

En el Mac:

```bash
cd pwa
npm install
npx cap add ios          # hace pod install; solo funciona en macOS
npm run sync:ios         # copia la web, sincroniza y aplica el parche del scroll
npm run assets:ios       # iconos y splash desde una fuente opaca de 1024×1024
npm run open:ios
```

En Xcode:

1. **Signing & Capabilities** → elija su *Team* y confirme el bundle id.
2. Añada la capacidad **Sign in with Apple**.
3. *Any iOS Device* → **Product ▸ Archive** → **Distribute App ▸ App Store
   Connect ▸ Upload**.
4. Pruebe en **TestFlight** (interno, casi sin revisión) antes de enviar a la
   App Store.

Ejecute en un teléfono real: Sign in with Apple no funciona bien en el simulador
sin una cuenta de iCloud configurada.

> `pwa/ios/` **no se versiona**: lo regenera `cap add ios`, y `pod install`
> necesita macOS. Está en `pwa/.gitignore`.

### 8.1 El día a día: publicar una actualización

Esta es la parte que ahorra el trámite con Apple.

1. Cambie lo que sea de `pwa/publico`.
2. **Suba la versión** en `pwa/package.json` (por ejemplo `1.0.0 → 1.0.1`).
3. Mergee a `main`.

El workflow `bundle OTA` empaqueta el contenido de `publico/` en un `bundle.zip`,
calcula su `sha256`, escribe `latest.json` y crea el release `ota-v<versión>`.
Las apps leen ese manifiesto al abrir y, si hay versión nueva, la descargan y la
aplican en la **siguiente** apertura.

Si no cambia la versión, no se publica nada: un empujón normal a `main` es
inofensivo. Y si `config.json` todavía tiene marcadores `EJEMPLO`, el workflow
falla a propósito antes de publicar: un bundle con ellos dejaría a todos los
teléfonos apuntando a una API que no existe, y encima se aplicaría solo.

Solo hay que volver a Xcode cuando cambie algo **nativo**: un plugin nuevo, los
iconos, los permisos o la versión de Capacitor.

---

## 9. Comprobaciones finales

Recorra esta lista antes de dar el sistema por bueno. Las tres primeras son las
que importan de verdad, porque el modo de fallo grave de este producto no es un
error visible: es arruinar una sorpresa.

- [ ] Entrar como administrador y crear un evento reservado (Nuevo evento → Más
      opciones → Reserva → *Ocultarlo a alguien*).
- [ ] Entrar como una hija —o abrir la demostración como Marta— y comprobar que
      **ese día aparece vacío**, sin hueco ni marcador.
- [ ] Abrir el propio cumpleaños y ver el panel *Por aquí no se mira*, sin
      recuento ni fecha.
- [ ] Apuntar una idea orientada a otra persona y comprobar que a esa persona no
      le aparece en el banco.
- [ ] Poner el teléfono en modo avión, crear un evento, volver a la red y
      comprobar que aparece en el otro dispositivo.
- [ ] Ejecutar el plan semanal en simulacro y leer los siete mensajes.
- [ ] Encolar un mensaje de prueba en `queue.json` con `send_at` a diez minutos y
      verificar que llega.
- [ ] En la app de iOS, subir la versión de `pwa/package.json`, mergear y
      comprobar que el cambio entra al abrirla por segunda vez.

---

## 10. Lo que esto cuesta

| Pieza | Coste |
|---|---|
| Cloudflare Workers + D1 + Pages | 0 € en el plan gratuito, con margen enorme |
| GitHub Actions | 0 € — unos 30 minutos al mes de una cuota de 2.000 |
| CallMeBot | 0 €, servicio gratuito de un tercero y sin garantía |
| Dominio | 10–15 € al año, opcional |
| Apple Developer Program | 99 € al año, solo si quiere la app iOS |

---

## 11. Cuando algo no va

| Síntoma | Causa habitual |
|---|---|
| La web carga pero el botón de Apple no hace nada | El dominio no está verificado en el Services ID, o `appleClienteWeb` no coincide con él |
| «Este identificador de Apple todavía no está vinculado» | Es el comportamiento correcto la primera vez: copie el identificador a la ficha (paso 6) |
| La aplicación entra pero no ve datos | `ORIGENES_PERMITIDOS` no incluye el dominio de la PWA, o `api` en `config.json` apunta a otro sitio |
| Todo daba 401 de repente | Cambió `SESION_SECRETO`; hay que volver a entrar |
| El plan del domingo no sale | Mire la traza en Actions. Lo más común es `AGENDA_URL` sin `/api/registro` al final, o `AGENDA_TOKEN` distinto de `TOKEN_SERVICIO` |
| **Pantalla negra** al abrir la app | El `MainViewController.swift` existe pero no quedó registrado en el `.pbxproj`, así que no compila | `npm run patch:ios` lo registra; si avisa de que no ha sabido, añádalo a mano en Xcode (clic derecho en App → Add Files, target App) |
| El OTA no baja | Manifiesto inaccesible, o la versión no cambió | Compruebe `otaManifiesto` en `config.json`, que el release exista y que subió la versión en `pwa/package.json` |
| El bundle OTA carga en blanco | `index.html` no quedó en la raíz del zip | Se empaqueta el **contenido** de `publico/`, no la carpeta; el workflow ya lo hace así |
| La app revierte la actualización sola | No se llamó a `notifyAppReady()` | Lo hace `iniciarNativo()` al arrancar; compruebe que `app.js` lo sigue llamando |
| El despachador dejó de ejecutarse | GitHub deshabilita los workflows programados tras sesenta días sin commits en la rama por defecto. Reactívelo desde Actions y active el workflow `mantenimiento` |
| Un cambio hecho en el móvil no aparece en la web | Mire el indicador de sincronización. Si dice «sin sincronizar», el servidor rechazó algo: la consola del navegador lista qué y por qué |

Trazas en vivo del Worker:

```bash
cd api && wrangler tail
```

---

## 12. Copias de seguridad

La especificación pide dos mecanismos: una exportación completa bajo demanda y
una copia periódica automática. La primera protege frente al abandono de la
aplicación; la segunda, frente al fallo.

La exportación bajo demanda ya está disponible:

```bash
cd api && wrangler d1 export agenda-familiar --remote --output copia-$(date +%F).sql
```

Guárdela fuera de Cloudflare. Conviene ponerlo en el calendario una vez al
trimestre, o automatizarlo con un workflow de GitHub que ejecute ese mismo
comando y suba el resultado a un almacenamiento privado; no está montado todavía.

---

## 13. Orden resumido

1. `wrangler d1 create` y anotar el `database_id`.
2. `npm run migrar:remoto`.
3. `wrangler secret put` de los dos secretos y `npm run desplegar`.
4. Insertar a mano la primera persona administradora.
5. App ID y Services ID en Apple, con el dominio verificado.
6. Proyecto de Pages con salida `pwa/publico` y `config.json` relleno.
7. Entrar, copiar el identificador de Apple a la ficha, volver a entrar.
8. Secretos de GitHub y simulacro del plan semanal.
9. En el Mac: `npx cap add ios` → `npm run sync:ios` → assets → Xcode → TestFlight.
10. Recorrer la lista de comprobaciones del apartado 9.
11. Validar en un iPhone real que el OTA entra: suba la versión, mergee y abra
    la app dos veces.
