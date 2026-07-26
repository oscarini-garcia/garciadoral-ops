# Puesta en marcha: Cloudflare, Apple y GitHub

Guía de despliegue de la Agenda Familiar. Va en orden: cada paso deja algo que
se puede comprobar antes de seguir al siguiente. Calcule **una tarde** la
primera vez, casi toda esperando a Apple.

Los nombres propios de esta instalación ya están fijados en el repositorio:

| Qué | Valor | Dónde se declara |
|---|---|---|
| Dominio de la aplicación web | `garciadoral-ops.galoopa.store` | `pwa/publico/config.json`, `api/wrangler.toml` |
| Identificador del paquete de iOS (App ID) | `com.garciadoral.ops` | `pwa/capacitor.config.json`, `APPLE_AUD_IOS` |
| Identificador de servicio de la web (Services ID) | `com.garciadoral.ops.web` | `config.json`, `APPLE_AUD_WEB` |

Queda un único marcador por sustituir, porque depende de la cuenta de Cloudflare
y no se conoce hasta el paso 2:

| Marcador | Qué es | Ejemplo |
|---|---|---|
| `EJEMPLO` | Su subdominio de `workers.dev` | `garciadoral` |

Que esos tres ficheros sigan contando la misma historia lo comprueba
`tests/test_configuracion.py` en cada empujón: el Services ID de la web contra el
que admite el Worker, el identificador del paquete contra el suyo, y la URL de
retorno contra los orígenes admitidos. Es una discrepancia que no rompe nada al
desplegar y aparece más tarde, en el dispositivo, como un `invalid_client` o un
error de CORS sin explicación.

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
npm install -g wrangler --allow-scripts=esbuild,workerd
wrangler login          # abre el navegador y autoriza la cuenta
wrangler --version
```

> **Por qué ese `--allow-scripts`.** Las versiones recientes de npm no ejecutan
> los scripts de instalación por defecto. Sin ellos, `esbuild` y `workerd` se
> quedan sin el binario de la plataforma y `wrangler deploy` falla más tarde, con
> un error que no menciona la instalación. Si prefiere no repetirlo en cada
> instalación: `npm config set allow-scripts=esbuild,workerd --location=user`.
>
> Y cuidado con el aviso que imprime npm: sugiere el comando **sin el nombre del
> paquete**. Tal cual, npm intenta instalar el paquete del directorio actual, y
> la raíz de este repositorio no tiene `package.json` —solo lo tienen `api/` y
> `pwa/`—, de modo que responde `ENOENT ... could not read package.json`.

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

Sobre una base que ya exista, esta misma orden es la que aplica las migraciones
nuevas: todas se escriben con `CREATE TABLE IF NOT EXISTS`, de modo que
ejecutarla otra vez no toca nada de lo que ya está.

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

Hay tres secretos más —`APPLE_CLAVE_P8`, `APPLE_CLAVE_ID` y `APPLE_EQUIPO`— que
solo intervienen cuando alguien elimina su cuenta y que se registran en el paso
4.5, porque salen de la cuenta de Apple Developer. Todo lo demás funciona sin
ellos.

La **clave de Anthropic**, en cambio, no es un secreto del Worker: se guarda en
la base de datos desde *Ajustes → Inteligencia artificial*, dentro de la propia
aplicación y solo para administradores. Es lo que enciende las tres cosas que la
agenda le pide a un modelo: el segundo botón de compartir —el del destello—, que
cuenta en dos frases un día, la semana, el mes o lo que viene antes de enviarlo;
la propuesta de regalo al apuntar una idea para alguien; y la felicitación de
cumpleaños, que se escribe al abrir un cumpleaños en Regalos → Ocasiones y se
copia al portapapeles. Sin clave no aparece ninguno de los tres botones y todo lo
demás funciona igual. El encargo de cada una —lo que se le pide al modelo— se
reescribe en ese mismo apartado. Se registra
allí y no aquí porque es lo único de esta instalación que se cambia con cierta
frecuencia —al rotarla, al cambiar de modelo— y hacerlo con `wrangler` obligaría
a volver a desplegar cada vez.

El bloque `[vars]` de `api/wrangler.toml` ya viene relleno con los nombres de
esta instalación; compruébelo antes de desplegar:

```toml
ORIGENES_PERMITIDOS = "https://garciadoral-ops.galoopa.store,http://localhost:8788"
APPLE_AUD_WEB = "com.garciadoral.ops.web"
APPLE_AUD_IOS = "com.garciadoral.ops"
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

### 2.1 Que no haya que volver a desplegar a mano

Esta primera vez se hace desde su máquina, porque hasta aquí no hay repositorio
configurado. A partir de ahí lo hace el workflow `desplegar-api.yml` en cuanto
un cambio de `api/` entra en `main`, igual que el bundle OTA. Solo necesita un
secreto:

1. En Cloudflare, **My Profile → API Tokens → Create Token**, plantilla **Edit
   Cloudflare Workers**. Añádale además el permiso **Account → D1 → Edit**, que
   la plantilla no trae y hace falta para las migraciones.
2. En GitHub, **Settings → Secrets and variables → Actions → New repository
   secret**, con el nombre `CLOUDFLARE_API_TOKEN`.
3. Si ese token ve más de una cuenta de Cloudflare, añada también
   `CLOUDFLARE_ACCOUNT_ID`. Con una sola cuenta no hace falta.

El workflow pasa las pruebas del Worker antes de subir nada y comprueba
`/api/salud` después. Se puede lanzar a mano desde la pestaña **Actions**, y
allí tiene una casilla —*Aplicar también las migraciones de esquema*— para las
versiones que traen tablas nuevas: es la manera de migrar sin una terminal
delante.

Esa casilla se puede marcar sin pensarlo, porque solo aplica lo que se puede
repetir sin consecuencias. Quedan fuera dos clases de fichero:

- **Los catálogos** (`0002`), que van con `INSERT OR REPLACE` y pisarían lo que
  se haya cambiado desde la aplicación.
- **Las migraciones de un solo uso**, las que llevan `.unavez.sql` en el
  nombre. Son las que hacen `ALTER TABLE` —que falla si la columna ya está— o
  reparten datos que ya existen. Para esas hay un campo al lado de la casilla:
  se escribe el nombre del fichero, se lanza una vez, y se deja vacío en
  adelante. Si el nombre no existe, el workflow para antes de tocar nada.

Sin el secreto, el workflow falla en el paso de desplegar y no toca nada: el
despliegue sigue siendo el de siempre, `npm run desplegar`.

---

## 3. La primera persona

Todavía no hay nadie en el registro, y sin una persona administradora no se puede
entrar. Se crea a mano, una sola vez:

```bash
wrangler d1 execute agenda-familiar --remote --command "
  INSERT INTO persona (id, nombre, apellidos, tiene_cuenta, rol, activa)
  VALUES ('p-oscar', 'Óscar', 'García', 1, 'administrador', 1)"
```

Deje `identificador_apple` vacío: se rellena en el paso 6.1, cuando esa persona
intente entrar por primera vez.

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
3. Description: `Garcia Doral Ops`. Bundle ID **explícito**:
   `com.garciadoral.ops`.
4. En Capabilities marque **Sign in with Apple** y también **Push
   Notifications**.
5. Guarde.

> **Por qué Push Notifications si los avisos son locales.** Hoy no hace falta:
> los recordatorios se programan en el dispositivo y no pasan por APNs. Se marca
> igualmente porque activarla ahora no cuesta nada y no obliga a usarla, mientras
> que añadirla más tarde obliga a regenerar los perfiles de aprovisionamiento y a
> volver a firmar. Si algún día se quieren avisos que nazcan en el servidor, la
> capacidad ya estará puesta.

Ese Bundle ID es el que va en `APPLE_AUD_IOS` y en `pwa/capacitor.config.json`.

> **Sin guiones, aunque Apple los admita.** Apple acepta guiones en un Bundle ID,
> pero el CLI de Capacitor no: valida el `appId` con las reglas comunes a iOS y
> Android —forma de paquete Java— y rechaza `cap add`, `cap sync` y `cap copy` por
> igual, aunque el proyecto solo tenga iOS. Y un Bundle ID no se puede renombrar
> en Apple: si se descubre tarde, hay que registrar otro identificador y volver a
> enlazar el Services ID. Lo comprueba `tests/test_configuracion.py`.

### 4.2 Identificador de servicio (Services ID), para la web

Haga antes el paso 5: el dominio tiene que estar sirviendo por HTTPS y con el
certificado emitido para que Apple pueda verificarlo.

1. **Identifiers → + → Services IDs**.
2. Description: `Garcia Doral Ops Web`. Identifier:
   `com.garciadoral.ops.web`.
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

### 4.3 Dos caminos hacia el mismo token

Conviene entenderlo antes de depurar el primer acceso, porque el botón es el
mismo pero por dentro no lo es.

En el navegador, la web pide el token con el SDK de Apple en ventana emergente,
con el Services ID como cliente y `https://garciadoral-ops.galoopa.store` como
URL de retorno. Dentro de la cáscara de iOS ese camino no cabe: allí la web se
sirve desde el origen `capacitor://localhost`, que Apple no admite como *Return
URL*, de modo que la ventana emergente no tendría a dónde volver. La cáscara usa
la hoja nativa, que no necesita origen ni dominio verificado porque se identifica
con el paquete.

`sesion.js` elige solo según `esNativo()`, y el canje contra la API es el mismo
en los dos casos. La diferencia se ve en las trazas del Worker:

| Dónde | Cliente ante Apple | Audiencia del token |
|---|---|---|
| Navegador | Services ID | `APPLE_AUD_WEB` |
| Cáscara de iOS | el paquete, implícito | `APPLE_AUD_IOS` |

Las dos audiencias están admitidas y desembocan en el **mismo** `sub`, siempre
que el Services ID tenga ese App ID como *Primary* (paso 4.2). Si se configura
mal, la misma persona recibe dos identificadores y hay que vincular los dos.

> **El acceso nativo no llega por OTA.** El complemento
> `@capacitor-community/apple-sign-in` es código nativo: entra en el binario, no
> en el bundle web. Una cáscara compilada sin él enseña el mensaje «hace falta
> una compilación nueva» y no deja entrar por mucho que se actualice la web. Si
> ya hay versiones en TestFlight, esta es de las que obligan a subir binario.

### 4.4 Entrar no necesita ninguna clave privada

Para **el acceso**, este diseño no necesita la clave `.p8` ni el flujo de
`client_secret`: el Worker verifica el `id_token` contra las claves públicas de
Apple (`https://appleid.apple.com/auth/keys`) y con eso le basta. Un secreto
menos que rotar, y ningún fallo de firma posible en el camino por el que entra
todo el mundo todos los días.

Hay exactamente una cosa que sí la necesita, y es la del apartado siguiente.

### 4.5 La clave para revocar, que solo se usa al darse de baja

Apple no se conforma con que la aplicación olvide a quien elimina su cuenta:
exige que **se le avise a Apple**, mediante el endpoint de revocación de su API
REST, para que esta aplicación desaparezca de la lista de «Apps que usan tu
Apple ID». Es la mitad invisible de la directriz 5.1.1(v) y el único punto del
sistema que pide una clave privada.

1. En <https://developer.apple.com/account> → **Certificates, Identifiers &
   Profiles → Keys → +**.
2. Nómbrela «Agenda Familiar — revocación», marque **Sign in with Apple** y en
   *Configure* elija como *Primary App ID* el `com.garciadoral.ops` del paso 4.1.
3. Descargue el `.p8`. **Solo se descarga una vez**; si lo pierde hay que
   revocar la clave y crear otra.
4. Anote el **Key ID** que muestra la ficha y el **Team ID**, que está arriba a
   la derecha de la cuenta.

```bash
cd api
wrangler secret put APPLE_CLAVE_P8   # pegue el contenido entero del .p8, cabeceras incluidas
wrangler secret put APPLE_CLAVE_ID   # el Key ID: diez caracteres
wrangler secret put APPLE_EQUIPO     # el Team ID: diez caracteres
```

> **La baja funciona igual sin estos tres secretos.** Si faltan, el Worker
> deshace el vínculo aquí y anota en su log que no pudo avisar a Apple. Es
> deliberado: la regla que no se puede incumplir es que eliminar la cuenta sea
> siempre posible, y un servidor ajeno que no responde no puede impedirlo. Pero
> configúrelos antes de enviar a revisión: sin ellos se cumple media directriz.

**Por qué el código de autorización se pide al darse de baja y no al entrar.**
Para revocar hace falta un `refresh_token`, y para obtenerlo hay que canjear un
código de autorización de Apple. Lo natural sería canjearlo al iniciar sesión y
guardarlo, lo que significaría meter una llamada de red más —y un fallo más— en
el camino más frágil del sistema, y guardar en la base un secreto de larga vida
por cada persona. Como darse de baja es raro, la aplicación abre la hoja de
Apple en ese momento: el acceso no se toca, no se almacena nada, y volver a
identificarse justo antes de una acción irreversible es lo que uno espera.

---

## 5. Cloudflare Pages: la aplicación web

### 5.1 Publicar el sitio

Antes de publicar, sustituya `EJEMPLO` por el subdominio real del Worker en
`pwa/publico/config.json`. El resto ya está puesto:

```json
{
  "api": "https://agenda-familiar-api.EJEMPLO.workers.dev",
  "appleClienteWeb": "com.garciadoral.ops.web",
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

> **Mire el `content-type`, no solo el `200`.** Sin un `404.html`, Pages
> devuelve `200` con el `index.html` de la aplicación para **cualquier** ruta que
> no exista, y entonces esta comprobación da un falso positivo redondo: parece
> que el fichero está publicado cuando no lo está. El repositorio incluye ya un
> `pwa/publico/404.html` justamente para que eso no pase, pero la comprobación
> fiable sigue siendo la misma, y vale con cualquier despliegue:
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

## 6. Dar acceso a las personas

Nadie se vincula a mano: cada persona lo pide desde la aplicación y un
administrador lo aprueba desde la aplicación.

1. La persona abre la web (o la app), pulsa **Entrar con Apple** y escribe su
   nombre en la pantalla que aparece.
2. En el dispositivo de un administrador, la pantalla de **Familia** muestra
   *Hay N personas esperando*.
3. Ahí se ve quién dice ser y con qué correo, y se elige: darle acceso —creando
   una ficha nueva o **vinculándola a una que ya exista**— o rechazar.
4. Esa persona vuelve a pulsar **Entrar con Apple** y ya está dentro.

El paso 3 tiene una trampa que conviene no pisar. Si quien pide entrar ya
figuraba en el registro sin cuenta —la abuela, que cumple años y recibe
regalos—, hay que elegirla en *Quién es* en lugar de crear una ficha nueva: así
conserva su fecha de nacimiento y todo lo que otros escribieron con ella.

El identificador que Apple entrega es **distinto para cada aplicación**, pero
comparte el mismo App ID entre la web y iOS si el Services ID tiene ese App ID
como *Primary*. Por eso el paso 4.2 importa: si se configura mal, la misma
persona recibe dos identificadores y aparece dos veces en la bandeja.

### 6.1 La primera vez: vincularse uno mismo

La primera persona administradora no puede aprobarse a sí misma, así que su
vínculo sí se escribe a mano. Pulse **Entrar con Apple**, envíe la solicitud, y
lea de la base de datos el identificador que Apple le ha asignado:

```bash
wrangler d1 execute agenda-familiar --remote --command "
  SELECT identificador_apple, correo, nombre_declarado FROM solicitud_acceso"
```

Con esa cadena, vincúlese a la ficha que creó en el paso 3 y borre la solicitud:

```bash
wrangler d1 execute agenda-familiar --remote --command "
  UPDATE persona SET identificador_apple = '000123.a1b2c3…' WHERE id = 'p-oscar';
  DELETE FROM solicitud_acceso WHERE identificador_apple = '000123.a1b2c3…'"
```

Vuelva a entrar y ya estará dentro. A partir de aquí, todo lo demás se hace
desde la aplicación.

### 6.2 Si no queda ningún administrador

Darse de baja es un derecho y la aplicación no lo impide, ni siquiera a la última
persona con permisos de administración (es la directriz 5.1.1(v) de la App
Store). Pero si eso ocurre, no queda nadie que pueda aprobar solicitudes y estas
se acumulan sin que nadie pueda tocarlas desde la aplicación.

La salida es la misma que la del apartado 6.1: devolverle el rol a alguien desde
la línea de órdenes.

```bash
wrangler d1 execute agenda-familiar --remote --command "
  UPDATE persona SET rol = 'administrador' WHERE id = 'p-oscar' AND tiene_cuenta = 1"
```

Si esa persona también había perdido la cuenta, hay que rehacer el vínculo con
Apple como en 6.1.

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
{ "appId": "com.garciadoral.ops", "appName": "Agenda", "webDir": "publico" }
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
2. Añada la capacidad **Sign in with Apple**. No es opcional: sin ella el
   complemento nativo del paso 4.3 falla al abrir la hoja, y el acceso desde el
   teléfono no funciona aunque en el navegador vaya perfecto. Añada también
   **Push Notifications**, por lo dicho en el paso 4.1.
3. *Any iOS Device* → **Product ▸ Archive** → **Distribute App ▸ App Store
   Connect ▸ Upload**.
4. Pruebe en **TestFlight** (interno, casi sin revisión) antes de enviar a la
   App Store.

Ejecute en un teléfono real: Sign in with Apple no funciona bien en el simulador
sin una cuenta de iCloud configurada.

Comprobación de que el acceso nativo está bien montado: pulse **Entrar con
Apple** en el teléfono. Debe salir la hoja del sistema —con Face ID o la
contraseña de Apple—, no una ventana de navegador. Si aparece el mensaje «esta
versión no trae el acceso con Apple», el complemento no entró en el binario:
repita `npm install` y `npm run sync:ios` y vuelva a archivar.

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

**Lo que no viaja por OTA** es todo lo nativo: los complementos de Capacitor
—háptica, compartir, el actualizador y el acceso con Apple—, los permisos, los
iconos y cualquier cambio en `capacitor.config.json`. Añadir o quitar un
complemento obliga a `npm install`, `npm run sync:ios` y una subida nueva a
TestFlight. El código JavaScript que los invoca, en cambio, sí viaja: cambiar
cómo se usa un complemento ya instalado es una actualización web normal.

Solo hay que volver a Xcode cuando cambie algo **nativo**: un plugin nuevo, los
iconos, los permisos o la versión de Capacitor.

### 8.2 Los recordatorios

El recordatorio previo al evento —la única notificación activa por defecto según
la especificación funcional— lo programa **el propio teléfono**, no el servidor.
No pasa por APNs, no hay claves que rotar y funciona sin conexión.

Esa decisión no es de comodidad: es lo que hace que se cumpla sola la regla de
que **las notificaciones heredan la visibilidad**. El Worker filtra antes de
transmitir, de modo que la instantánea del dispositivo no contiene lo que su
titular no puede ver, y un aviso compuesto a partir de ella tampoco puede
delatarlo. Con avisos remotos habría que volver a aplicar la regla al componer
cada mensaje, y el texto pasaría además por los servidores de Apple.

Cuándo avisa, con los valores de hoy:

| Evento | Aviso |
|---|---|
| Con hora | 30 minutos antes |
| De jornada completa | la tarde anterior, a las 20:00 |

La primera vez que la app sincroniza, iOS pide permiso. Si se deniega, no pasa
nada más: la agenda funciona igual y no vuelve a insistir. Se puede conceder
después desde Ajustes → Agenda → Notificaciones.

Los avisos se rehacen enteros en cada sincronización, en lugar de calcular
diferencias. Es lo mismo que hace la instantánea, y por el mismo motivo: así la
retirada retroactiva funciona sola. Si un evento deja de ser visible para esa
persona, su aviso pendiente desaparece con él.

> **Dos límites que conviene conocer.** iOS solo conserva las **64**
> notificaciones locales pendientes más próximas; el resto las descarta sin
> avisar, así que el recorte se hace en el código para que sea nuestro y no una
> sorpresa. Y el horizonte de programación son 60 días: un evento más lejano no
> tiene aviso hasta que alguna sincronización posterior lo acerque.
>
> **Lo que falta.** La tabla `preferencia_notificacion` existe en el esquema,
> con el recordatorio activo y los avisos de modificación desactivados, pero ni
> se sirve al cliente ni hay pantalla para tocarla. Hoy, por tanto, rige ese
> valor por defecto para todo el mundo y con la misma antelación. Poder
> configurarlo por evento, como pide la especificación, es el paso siguiente.

### 8.3 Enviar a la App Store

Subir el binario **no es publicarlo**: lo deja en App Store Connect esperando
una ficha. Este apartado es esa ficha, y las tres cosas de esta aplicación en
concreto que hacen que la revisión se tuerza.

#### Lo que ya está resuelto en el repositorio

| Requisito | Dónde |
|---|---|
| Eliminar la cuenta desde la app (5.1.1(v)) | Ajustes → **Eliminar mi cuenta** |
| Revocación del token ante Apple | Paso 4.5; sin la clave, la baja funciona pero no avisa |
| Política de privacidad | `/privacidad.html`, servida por Pages |
| Página de soporte | `/soporte.html` |
| Cumplimiento de exportación | `patch-ios.mjs` lo declara en el `Info.plist` |

Antes de archivar, revise que el correo de contacto de `soporte.html` es el que
quiere hacer público: esa página la lee cualquiera.

#### El obstáculo de verdad: el revisor no puede entrar

Aquí el alta la aprueba una persona. Quien pulsa «Entrar con Apple» por primera
vez deja una solicitud y se queda en la sala de espera, y eso es exactamente lo
que le va a pasar al equipo de revisión. Sin más, es un rechazo por la directriz
2.1 con el texto de siempre: «no pudimos acceder a la funcionalidad de la
aplicación». Dígalo en las notas de revisión, además de dejar el botón a la
vista: la sala de espera ofrece la demostración, pero conviene no depender de
que el revisor la encuentre.

La salida está construida desde el principio y es el **modo de demostración**:
datos inventados, sin servidor, con el recorte por titular funcionando a la
vista. Va dentro del binario porque `npm run sync:ios` ejecuta antes
`preparar-pwa.py`. Lo único que hay que hacer es decirlo en las notas de
revisión, y decirlo en inglés, que es lo que lee quien revisa:

> This is a private family organiser. Accounts are not self-service: a household
> administrator links an Apple ID to a family member before that person can sign
> in, so there is no demo account we can provide.
>
> To review the full app without an account, tap **"Ver una demostración con
> datos de ejemplo"** on the sign-in screen and pick any of the family members.
> The same week shows different content depending on who is looking — that is
> the core feature: gift plans stay hidden from their recipient.
>
> Account deletion (guideline 5.1.1(v)) lives in **Settings (gear icon, top
> right) → "Eliminar mi cuenta"**. It requires a signed-in account, so it is not
> reachable from the demo. It unlinks the Apple ID, deletes devices,
> notification preferences and permissions, and calls the Sign in with Apple
> REST API to revoke the token.
>
> Native capabilities in use: Sign in with Apple (native sheet), haptics, the
> system share sheet, and local notifications scheduled on-device — reminders
> never leave the phone.

Ese último párrafo no es relleno: la **4.2** (funcionalidad mínima) es el otro
riesgo real de una aplicación que por dentro es una web, y conviene ponerle
delante la lista de lo que sí es nativo antes de que la busquen.

#### La ficha, campo a campo

- **Nombre**: «Agenda Familiar». **Subtítulo**: la semana, los regalos y la gente.
- **Categoría**: Productividad; secundaria, Estilo de vida.
- **URL de política de privacidad**:
  `https://garciadoral-ops.galoopa.store/privacidad.html`.
- **URL de soporte**: `https://garciadoral-ops.galoopa.store/soporte.html`.
  Las dos son obligatorias y Apple las comprueba: un 404 aquí es un rechazo sin
  llegar a revisión. `tests/test_configuracion.py` comprueba que los ficheros
  existen; que Pages los sirva, compruébelo con `curl` una vez desplegado.
- **Clasificación por edades**: sin contenido sensible; 4+.
- **Capturas**: obligatorias las de 6,9″. Sáquelas del **modo de demostración**,
  nunca de la agenda real: son públicas y con datos del hogar dejarían de serlo.
- **Derechos de autor** y **datos de contacto**: los suyos.

#### Privacidad de la ficha (*App Privacy*)

Se declara lo que realmente se recoge, que es poco:

| Dato | Uso | ¿Vinculado a la identidad? | ¿Rastreo? |
|---|---|---|---|
| Identificador de usuario (el `sub` de Apple) | Funcionalidad de la app | Sí | No |
| Otro contenido del usuario (la agenda) | Funcionalidad de la app | Sí | No |

No se recoge correo electrónico —el token se pide con `scope: 'name'` y el
Worker no guarda el que venga—, no hay analítica, no hay publicidad y no hay
rastreo, de modo que no hace falta *App Tracking Transparency*. La aplicación
tampoco recoge identificador de dispositivo: la columna `dispositivo` se rellena
con un valor derivado de la propia persona.

#### Números de versión

`pwa/package.json` gobierna el **OTA** y no toca el binario. Los de la ficha son
los de Xcode, y son otros dos:

- `MARKETING_VERSION` (*Version*): lo que ve el público, `1.0` la primera vez.
- `CURRENT_PROJECT_VERSION` (*Build*): tiene que **subir en cada subida**, aunque
  no cambie nada más. App Store Connect rechaza una build repetida.

Conviene que la versión de marketing acompañe a la del bundle cuando se suba
binario, para que un informe de fallos se pueda situar.

#### El orden

1. TestFlight interno primero, en un iPhone real: la hoja nativa de Apple no se
   comporta igual en el simulador.
2. Recorra desde el teléfono: entrar, sincronizar, un aviso local, compartir un
   evento y **eliminar la cuenta**. Después vuelva a entrar: aparecerá en la
   bandeja como una solicitud más, que es también el ensayo de la recuperación
   del paso 6.1.
3. Rellene la ficha, adjunte las notas de revisión de arriba y envíe.
4. La primera revisión suele tardar entre uno y tres días.

Si llega un rechazo, casi siempre es de los dos de este apartado —2.1 porque no
supieron entrar, 4.2 porque les pareció una web envuelta—. Los dos se responden
en el mismo hilo de *Resolution Center* señalando el modo de demostración y la
lista de capacidades nativas; no hace falta subir binario nuevo para contestar.

#### Después

Publicada la aplicación, el trámite desaparece del día a día: los cambios de la
parte web siguen yendo por OTA sin pasar por revisión (apartado 8.1), y solo un
cambio nativo obliga a volver por aquí. Cuando eso ocurra, la revisión de una
actualización es bastante más rápida que la primera.

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
- [ ] Entrar con Apple **desde el navegador** y **desde el teléfono**, con la
      misma cuenta, y comprobar que caen en la misma persona. Si el teléfono pide
      vincular un identificador distinto, el Services ID no tiene ese App ID como
      *Primary* (paso 4.2) y hay que corregirlo antes de dar de alta a nadie más.
- [ ] Pedir una ruta que no exista —`/loquesea`— y comprobar que responde `404`,
      no la aplicación con un `200`.
- [ ] En el teléfono, aceptar el permiso de notificaciones, crear un evento
      dentro de la próxima hora y comprobar que el aviso llega 30 minutos antes.
- [ ] Y la que de verdad importa: crear un evento reservado que una hija no deba
      ver, y comprobar **desde su teléfono** que no le llega recordatorio. Es el
      mismo modo de fallo del resto del sistema, por otra puerta.

---

## 10. Lo que esto cuesta

| Pieza | Coste |
|---|---|
| Cloudflare Workers + D1 + Pages | 0 € en el plan gratuito, con margen enorme |
| GitHub Actions | 0 € — unos 30 minutos al mes de una cuota de 2.000 |
| CallMeBot | 0 €, servicio gratuito de un tercero y sin garantía |
| Dominio | 10–15 € al año. `galoopa.store` ya está pagado; el subdominio no cuesta nada aparte |
| Apple Developer Program | 99 € al año, solo si quiere la app iOS |
| API de Anthropic | Se paga por uso y solo si configura la clave. Contar un día o proponer un regalo son unos cientos de palabras: con Haiku, céntimos al mes en un hogar |

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
| Alguien se queda en «Tu solicitud está hecha» | Es el comportamiento correcto la primera vez: apruébela en Familia → *Hay N personas esperando* (paso 6) |
| Una solicitud llega sin correo, o con uno de `privaterelay.appleid.com` | Esa persona eligió «Ocultar mi correo», o entró antes de que se pidiera el ámbito `email`. El nombre que escribió es entonces el único dato para reconocerla |
| La aplicación entra pero no ve datos | `ORIGENES_PERMITIDOS` no incluye el dominio de la PWA, o `api` en `config.json` apunta a otro sitio |
| Todo daba 401 de repente | Cambió `SESION_SECRETO`; hay que volver a entrar |
| El plan del domingo no sale | Mire la traza en Actions. Lo más común es `AGENDA_URL` sin `/api/registro` al final, o `AGENDA_TOKEN` distinto de `TOKEN_SERVICIO` |
| **Pantalla negra** al abrir la app | El `MainViewController.swift` existe pero no quedó registrado en el `.pbxproj`, así que no compila | `npm run patch:ios` lo registra; si avisa de que no ha sabido, añádalo a mano en Xcode (clic derecho en App → Add Files, target App) |
| El OTA no baja | Manifiesto inaccesible, o la versión no cambió | Compruebe `otaManifiesto` en `config.json`, que el release exista y que subió la versión en `pwa/package.json` |
| El bundle OTA carga en blanco | `index.html` no quedó en la raíz del zip | Se empaqueta el **contenido** de `publico/`, no la carpeta; el workflow ya lo hace así |
| La app revierte la actualización sola | No se llamó a `notifyAppReady()` | Lo hace `iniciarNativo()` al arrancar; compruebe que `app.js` lo sigue llamando |
| El despachador dejó de ejecutarse | GitHub deshabilita los workflows programados tras sesenta días sin commits en la rama por defecto. Reactívelo desde Actions y active el workflow `mantenimiento` |
| Una ruta nueva de la API contesta 404 | El Worker no se ha desplegado. Lance `desplegar-api` desde Actions, o `npm run desplegar` desde `api/`. La web y el OTA se publican solos; el Worker solo desde que existe ese workflow |
| El botón de contar el día no aparece | No hay clave de Anthropic guardada. Póngala en Ajustes → Inteligencia artificial, que solo ven los administradores |
| El botón de proponer un regalo no aparece | Lo mismo, o la idea todavía no tiene ninguna persona nombrada: con una etiqueta sola no se propone nada |
| Contar el día siempre acaba compartiendo la lista tal cual | Algo falla en la llamada al modelo. El botón *Probar* de ese mismo apartado enseña la traza de cada intento: código HTTP, tipo de error y el mensaje de la API |
| «demasiadas redacciones seguidas» o «demasiadas propuestas seguidas» | El freno por persona y minuto, compartido por las dos. Es deliberado: sin él, la clave de pago del hogar queda abierta a un bucle en la consola del navegador |
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
   Después, el secreto `CLOUDFLARE_API_TOKEN` en GitHub (paso 2.1) y ya no hay
   que volver a desplegar a mano.
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
14. Para publicar: los tres secretos de revocación del paso 4.5, la ficha de App
    Store Connect y las notas de revisión del apartado 8.3.
