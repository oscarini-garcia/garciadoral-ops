# Puesta en marcha: Cloudflare, Apple y GitHub

Guía de despliegue de la Agenda Familiar. Va en orden: cada paso deja algo que
se puede comprobar antes de seguir al siguiente. Calcule **una tarde** la
primera vez, casi toda esperando a Apple.

Los nombres propios de esta instalación ya están fijados en el repositorio:

| Qué | Valor | Dónde se declara |
|---|---|---|
| Dominio de la aplicación web | `garciadoral-ops.galoopa.store` | `pwa/publico/config.json`, `api/wrangler.toml` |
| Identificador del paquete de iOS (App ID) | `store.galoopa.agenda` | `pwa/capacitor.config.json`, `APPLE_AUD_IOS` |
| Identificador de servicio de la web (Services ID) | `store.galoopa.agenda.web` | `config.json`, `APPLE_AUD_WEB` |

Queda un único marcador por sustituir, porque depende de la cuenta de Cloudflare
y no se conoce hasta el paso 2:

| Marcador | Qué es | Ejemplo |
|---|---|---|
| `EJEMPLO` | Su subdominio de `workers.dev` | `garciadoral` |

---

## 0. Lo que hace falta antes de empezar

- **Cuenta de Cloudflare** gratuita. El plan gratuito basta de sobra: D1 incluye
  5 GB y 5 millones de lecturas de fila al día, y Workers 100.000 peticiones
  diarias. Un hogar no se acerca ni de lejos.
- **Un dominio propio.** Aquí es `galoopa.store`, del que se usa únicamente el
  subdominio `garciadoral-ops.galoopa.store`. No es obligatorio para desplegar
  —Pages da una dirección del tipo `agenda-familiar.pages.dev` y la aplicación
  funciona igual—, pero sí para usar Sign in with Apple en la web: Apple no admite
  `*.pages.dev` ni ningún otro dominio de terceros como URL de retorno, así que
  el dominio ha de ser suyo y verificable. Cómo se apunta a Pages está en el
  paso 5.2.
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

El bloque `[vars]` de `api/wrangler.toml` ya viene relleno con los nombres de
esta instalación; compruébelo antes de desplegar:

```toml
ORIGENES_PERMITIDOS = "https://garciadoral-ops.galoopa.store,http://localhost:8788"
APPLE_AUD_WEB = "store.galoopa.agenda.web"
APPLE_AUD_IOS = "store.galoopa.agenda"
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
3. Description: `Agenda Familiar`. Bundle ID **explícito**: `store.galoopa.agenda`.
4. En Capabilities marque **Sign in with Apple**.
5. Guarde.

Ese Bundle ID es el que va en `APPLE_AUD_IOS` y en `pwa/capacitor.config.json`.

### 4.2 Identificador de servicio (Services ID), para la web

Haga antes el paso 5: el dominio tiene que estar sirviendo por HTTPS y con el
certificado emitido para que Apple pueda verificarlo.

1. **Identifiers → + → Services IDs**.
2. Description: `Agenda Familiar Web`. Identifier: `store.galoopa.agenda.web`.
3. Guarde, vuelva a abrirlo y marque **Sign in with Apple → Configure**:
   - **Primary App ID**: el del paso 4.1.
   - **Domains and Subdomains**: `garciadoral-ops.galoopa.store`
   - **Return URLs**: `https://garciadoral-ops.galoopa.store`
4. Guarde. Apple pedirá verificar el dominio descargando un fichero y
   publicándolo en la ruta
   `/.well-known/apple-developer-domain-association.txt` del dominio.
   Descárguelo y colóquelo en `pwa/publico/.well-known/` antes de continuar; se
   publicará con el siguiente empujón a `main`. Compruébelo con `curl` antes de
   pulsar *Verify* —el paso 5.3 explica qué mirar y qué hacer si da 404—.

Ese Services ID es el que va en `APPLE_AUD_WEB` y en `pwa/publico/config.json`.

> **La *Return URL* debe coincidir carácter a carácter** con el campo
> `redireccion` de `pwa/publico/config.json`, que es lo que la web entrega a
> Apple como `redirectURI` (`pwa/publico/js/sesion.js`). Sin barra final, en
> minúsculas y con `https://`. Un solo carácter de diferencia y Apple devuelve
> `invalid_client` sin más explicación.

> **Un único dominio, no uno de autenticación aparte.** El acceso web usa el
> flujo de ventana emergente (`usePopup: true`), que exige que la URL de retorno
> esté en el **mismo origen** que la página donde está el botón. Es decir: el
> dominio que se declara aquí tiene que ser aquel en el que vive la PWA. Un
> `auth-…` separado del dominio de la aplicación no simplifica nada y obliga a
> montar un puente entre orígenes.

> **Sin dominio propio no hay acceso web.** Apple no admite `*.pages.dev` como
> dominio verificable. Puede desplegar la PWA y usarla en modo demostración,
> pero el botón de Apple fallará. La aplicación iOS sí funcionaría igualmente,
> porque en nativo la audiencia es el identificador del paquete y no hace falta
> dominio ninguno.

### 4.3 Pendiente: el acceso con Apple dentro de la cáscara de iOS

Esto está sin resolver y conviene saberlo antes de subir nada a TestFlight.

En el navegador, el acceso funciona: la web pide el token con el SDK de Apple en
ventana emergente, desde el origen `https://garciadoral-ops.galoopa.store`, que
es el que se declara arriba. Dentro de la cáscara de Capacitor, en cambio, la
misma web se sirve desde el origen `capacitor://localhost`, y `app.js` llama al
mismo `entrarConApple` de `sesion.js`. Ese origen no se puede registrar como
*Return URL* en Apple, así que el flujo de ventana emergente no tiene a dónde
volver.

El repositorio no trae hoy ningún complemento nativo de Sign in with Apple —las
dependencias de `pwa/package.json` son háptica, compartir y el actualizador—, de
modo que el botón, tal cual, fallará en el teléfono aunque funcione en el
navegador.

Las salidas, de menor a mayor cambio: añadir un complemento nativo de Sign in
with Apple y usarlo cuando `esNativo()` sea cierto, que es lo que se suele hacer;
o cambiar el flujo web al de redirección en lugar de ventana emergente; o hacer
que la cáscara cargue la web del dominio con `server.url`, lo que devolvería el
origen correcto pero renunciaría al bundle local y al OTA. No es una decisión de
despliegue, así que aquí solo queda anotada.

Nada de esto afecta al acceso desde el navegador, que es lo que se pone en marcha
en los pasos 4 y 5.

### 4.4 Nada de claves privadas

Este diseño **no** necesita la clave `.p8` de Sign in with Apple ni el flujo de
`client_secret`: el Worker verifica el `id_token` contra las claves públicas de
Apple (`https://appleid.apple.com/auth/keys`) y con eso le basta. Un secreto
menos que rotar.

---

## 5. Cloudflare Pages: la aplicación web

### 5.1 Publicar el sitio

Antes de publicar, sustituya `EJEMPLO` por el subdominio real del Worker en
`pwa/publico/config.json`. El resto ya está puesto:

```json
{
  "api": "https://agenda-familiar-api.EJEMPLO.workers.dev",
  "appleClienteWeb": "store.galoopa.agenda.web",
  "redireccion": "https://garciadoral-ops.galoopa.store",
  "otaManifiesto": "https://github.com/oscarini-garcia/garciadoral-ops/releases/latest/download/latest.json"
}
```

Genere los iconos y el registro de demostración —hace falta una vez, y otra cada
vez que cambien los catálogos—:

```bash
python3 herramientas/preparar-pwa.py
```

Después, en el **panel de Cloudflare → Workers & Pages → Create**. Aquí hay que
ir con cuidado, porque el asistente ofrece **Workers** por defecto y Pages está
en una pestaña aparte: **cambie a la pestaña «Pages»** y solo entonces
*Connect to Git*.

| Campo | Valor |
|---|---|
| Repositorio | `oscarini-garcia/garciadoral-ops` |
| Rama de producción | `main` |
| Framework preset | *None* |
| Build command | *(vacío)* |
| Build output directory | `pwa/publico` |

No hay proceso de compilación: lo que se publica es literalmente el contenido de
`pwa/publico`. Cada empujón a `main` republica.

> **Cómo saber que se ha equivocado de producto.** Si en la configuración
> aparecen los campos *Deploy command* y *Version command*, o si las pestañas del
> proyecto son *Bindings*, *Observability* y *Domains*, lo que ha creado es un
> Worker, no un proyecto de Pages. Un Worker así falla en la compilación con
> `Could not detect a directory containing static files`: ejecuta
> `npx wrangler deploy` en la raíz, donde no hay ningún `wrangler.toml` —el único
> está en `api/`—, y se pone a buscar activos estáticos que en la raíz no existen.
>
> No lo arregle añadiendo un `wrangler.toml` con `[assets]`, aunque funcionaría
> para servir la PWA: los dominios propios de un Worker exigen que la zona entera
> esté alojada en Cloudflare, que es precisamente lo que aquí no interesa (5.2).
> Pages, en cambio, admite un CNAME desde un DNS de fuera. Borre el Worker
> —comparte espacio de nombres con los proyectos de Pages— y vuelva a crearlo en
> la pestaña correcta.

Anote la dirección que le asigna Pages —`agenda-familiar.pages.dev` o parecida—:
hace falta en el paso siguiente.

### 5.2 Apuntar `garciadoral-ops.galoopa.store` a Pages

`galoopa.store` no está alojado en Cloudflare: sus servidores de nombres son los
de Google Cloud DNS (`ns-cloud-d1…d4.googledomains.com`), heredados de Google
Domains, cuyas cuentas pasaron a Squarespace cuando el servicio cerró. El panel
donde se editan los registros es hoy el de Squarespace Domains; el DNS por
detrás sigue siendo el mismo.

Eso no impide usar el dominio: Pages admite dominios cuyo DNS vive fuera de
Cloudflare, y basta con un registro.

> **El apex está ocupado.** `galoopa.store` resuelve a `23.227.38.65`, que es
> Shopify. No se toca: todo esto cuelga de un subdominio y la tienda sigue
> exactamente igual.

1. En el proyecto de Pages: **Custom domains → Set up a custom domain** →
   `garciadoral-ops.galoopa.store`. Como el dominio no está en Cloudflare, la
   interfaz le dirá que cree el registro usted y le mostrará el destino.
2. En el panel de DNS del dominio, un único registro nuevo:

   | Tipo | Nombre | Valor | TTL |
   |---|---|---|---|
   | CNAME | `garciadoral-ops` | `<su-proyecto>.pages.dev` | 300 mientras prueba |

3. Cloudflare detecta el CNAME, valida y emite el certificado solo. De unos
   minutos a una hora. No siga hasta que el dominio figure como **Active** en
   *Custom domains*: si Apple intenta verificar antes de que haya certificado,
   falla y hay que reintentarlo.

Comprobación: abra `https://garciadoral-ops.galoopa.store` y pulse **Ver una
demostración con datos de ejemplo**. Si la semana aparece con sus siete filas,
la parte estática está bien.

> **Mover la zona entera a Cloudflare** —añadir el sitio y cambiar los
> servidores de nombres en el registrador— es más cómodo a la larga: Pages
> crearía el registro solo y habría un único sitio donde mirar. Pero obliga a
> repasar registro por registro lo que hoy sirve la tienda y el correo antes de
> conmutar, y no aporta nada a este despliegue. El CNAME de arriba basta.

### 5.3 El fichero de verificación de Apple

El `.txt` que entrega Apple (paso 4.2) va en `pwa/publico/.well-known/`, que ya
existe en el repositorio con sus instrucciones. Tras el empujón que lo publique:

```bash
curl -i https://garciadoral-ops.galoopa.store/.well-known/apple-developer-domain-association.txt
```

> **Aquí `200` no basta, y este es el error que más tiempo hace perder.** Este
> proyecto de Pages no tiene `404.html`, de modo que **cualquier ruta que no
> exista devuelve `200` con el `index.html` de la aplicación**. Compruébelo:
> `curl -o /dev/null -w '%{http_code}\n' https://garciadoral-ops.galoopa.store/esto-no-existe`
> también responde `200`.
>
> Lo que hay que mirar en la respuesta es la cabecera **`content-type`**:
>
> - `text/plain` → el fichero se está sirviendo de verdad. Adelante.
> - `text/html` → el fichero **no** está; le están devolviendo la aplicación.
>   Apple fallará la verificación con un error que no explica nada.
>
> Y el cuerpo debe ser la cadena que entregó Apple, no `<!DOCTYPE html>`.
> Tampoco debe haber redirección por el camino.

Si el `content-type` es `text/html`, la causa es conocida: los despliegues de
Pages no siempre suben los directorios cuyo nombre empieza por punto. La salida,
sin depender de ese comportamiento, es servirlo desde una ruta normal y
reescribir la petición
—Pages admite «proxying» con código 200 en `_redirects`, que es una reescritura
interna y no una redirección, de modo que Apple ve el fichero donde lo espera—:

1. Mueva el fichero a `pwa/publico/apple-dominio.txt`.
2. Cree `pwa/publico/_redirects` con una línea:

   ```
   /.well-known/apple-developer-domain-association.txt /apple-dominio.txt 200
   ```

3. Vuelva a empujar y repita el `curl`.

### 5.4 La cabecera de seguridad

Cuando todo funcione, abra `pwa/publico/_headers`, descomente la línea
`Content-Security-Policy` y sustituya el subdominio del Worker en `connect-src`.
Actívela y compruebe el acceso en el mismo paso: con `connect-src` mal puesto la
aplicación deja de hablar con la API.

### 5.5 Lo que el dominio *no* obliga a cambiar

Conviene tenerlo claro para no ir buscando dónde más hay que tocar:

- **Ningún workflow conoce el dominio.** `pruebas` ejecuta las suites;
  `plan-semanal` y `despachador` hablan con el Worker por `AGENDA_URL`, que
  apunta a `workers.dev`; `mantenimiento` solo escribe un latido; y `ota`
  empaqueta `pwa/publico` tal cual. Cambiar de dominio no obliga a tocar CI.
- **El despliegue de la web** lo hace la integración con Git de Pages, no un
  workflow: cada empujón a `main` republica `pwa/publico`. Añadir un dominio
  propio no altera la compilación, solo por dónde entra el tráfico.
- **El binario de iOS no lleva el dominio dentro.** La cáscara empaqueta la web
  (`webDir: publico`) y la actualiza por OTA; no carga la web desde el dominio.
  Ni el archivado ni TestFlight cambian por esto. Solo haría falta declarar el
  dominio —*Associated Domains* y `apple-app-site-association`— si en el futuro
  se quisieran enlaces universales, que hoy no se usan.
- **`config.json` se lee en caliente.** Cambiar el dominio o el Services ID no
  exige reconstruir la PWA, solo republicarla.

Y dos cosas que **sí** dependen de esto, que es donde se pierde el tiempo:

- **El Worker no se despliega solo.** `ORIGENES_PERMITIDOS` vive en
  `api/wrangler.toml`, y ese fichero solo surte efecto al ejecutar
  `npm run desplegar` a mano. Si cambia el dominio, ese redespliegue es el paso
  que se olvida y el que produce el error de CORS.
- **El workflow `ota` falla mientras `config.json` conserve `EJEMPLO`.** Es
  deliberado —un bundle con marcadores dejaría a todos los teléfonos apuntando a
  una API inexistente—, pero significa que hasta que no despliegue el Worker y
  sustituya su subdominio, cualquier empujón a `main` que toque `pwa/publico`
  deja el workflow en rojo. Primero el paso 2, después lo demás.

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

La identidad ya está puesta en `pwa/capacitor.config.json`:

```json
{ "appId": "store.galoopa.agenda", "appName": "Agenda", "webDir": "publico" }
```

`appId` es **el mismo** App ID del paso 4.1 y el mismo valor que `APPLE_AUD_IOS`
en el Worker. Cambiarlo después es un lío: un Bundle ID no se puede renombrar en
Apple.

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
| Dominio | 10–15 € al año. `galoopa.store` ya está pagado; el subdominio no cuesta nada aparte |
| Apple Developer Program | 99 € al año, solo si quiere la app iOS |

---

## 11. Cuando algo no va

| Síntoma | Causa habitual |
|---|---|
| La web carga pero el botón de Apple no hace nada | El dominio no está verificado en el Services ID, o `appleClienteWeb` no coincide con él |
| Apple responde `invalid_client` | La *Return URL* del Services ID y el campo `redireccion` de `config.json` no son idénticos. Compare carácter a carácter, incluida la barra final |
| Apple no consigue verificar el dominio | El `.txt` no se está sirviendo. Lance el `curl` del paso 5.3: si da 404, aplique la reescritura con `_redirects` que allí se explica. Si da 301 o 302, Apple tampoco lo acepta |
| El dominio propio no sale de «pending» en Pages | El CNAME no ha propagado o apunta a otro proyecto. `dig garciadoral-ops.galoopa.store CNAME` debe devolver su `pages.dev` |
| `Could not detect a directory containing static files` | El proyecto es un Worker y no uno de Pages, o el *Build output directory* no es `pwa/publico`. Vea el aviso del paso 5.1 |
| Se rompió la tienda de `galoopa.store` | Nada de este despliegue toca el apex. Revise si al añadir el CNAME se modificó por error el registro `A` que apunta a Shopify |
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
5. App ID en Apple.
6. Proyecto de Pages con salida `pwa/publico` y `config.json` relleno.
7. CNAME `garciadoral-ops` → `<proyecto>.pages.dev` en el DNS del dominio, y
   esperar a que el dominio propio figure como *Active* en Pages.
8. Services ID en Apple, publicar el `.txt` de verificación y comprobarlo con
   `curl` antes de pulsar *Verify*.
9. Entrar, copiar el identificador de Apple a la ficha, volver a entrar.
10. Secretos de GitHub y simulacro del plan semanal.
11. En el Mac: `npx cap add ios` → `npm run sync:ios` → assets → Xcode → TestFlight.
12. Recorrer la lista de comprobaciones del apartado 9.
13. Validar en un iPhone real que el OTA entra: suba la versión, mergee y abra
    la app dos veces.
