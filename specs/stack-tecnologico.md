# Agenda Familiar — Stack Tecnológico

**Versión:** 0.2
**Fecha:** 24 de julio de 2026
**Documentos complementarios:** Especificación Funcional · Modelo de Datos y Flujos · Propuesta de Experiencia de Usuario · Plan Semanal por WhatsApp · Despachador de mensajes de WhatsApp
**Alcance:** define **con qué** se construye la Agenda Familiar —cliente, backend, sincronización, autenticación y entrega—. No redefine el **qué** ni el **cómo funcional**, que quedan cerrados en los documentos complementarios. Toda decisión de este documento se justifica por un requisito ya establecido allí.

---

## 1. Principios que ordenan las decisiones

Cuatro requisitos, tomados de las specs funcionales y de UX, gobiernan el stack por encima de cualquier preferencia:

**Offline-first, no offline-tolerant.** El modelo de datos ya obliga a IDs generados en el dispositivo, auditoría de creación/modificación/autor y borrado lógico. La red es una mejora, no un requisito para operar. La escritura es siempre local e inmediata; el envío al servidor se encola y se reconcilia después.

**La ocultación debe ser indetectable.** No basta con no mostrar una sorpresa: no debe existir físicamente en el dispositivo de quien no debe verla. Esto convierte el filtrado por usuario **en el servidor** en un requisito estructural, no en una comodidad, y descarta cualquier motor que replique tablas completas al cliente.

**Coste cero de operación.** Todo se apoya en planes gratuitos: Cloudflare Workers, D1 y Pages; GitHub Actions para el despachador; distribución del bundle OTA autoalojada. Ningún componente introduce una factura recurrente.

**Un solo código de producto.** La app iOS y la PWA nacen del mismo código React. No se mantienen dos productos.

---

## 2. Visión de conjunto

| Capa | Elección | Responsabilidad |
|---|---|---|
| Cliente (UI) | React + TypeScript, build con Vite | Interfaz, escritura optimista, lógica de presentación |
| Empaquetado iOS | Capacitor | Envolver el código web en una app iOS nativa |
| Distribución web | PWA sobre Cloudflare Pages | Servir el mismo código como aplicación instalable |
| Actualización | OTA del bundle JS (Capgo autoalojado) | Publicar cambios sin pasar por la App Store |
| Almacén local | IndexedDB vía Dexie | Caché offline del subconjunto del usuario y cola de mutaciones |
| Backend | Cloudflare Worker | API de sincronización y de lectura; punto único de autoridad |
| Persistencia | Cloudflare D1 (SQLite) | Registro canónico de todas las entidades |
| Pasarela de IA | Endpoint en el mismo Worker | Reenviar llamadas a la API de Claude sin exponer la clave |
| Autenticación | Sign in with Apple (capa abstraída) | Identidad de las personas con cuenta |

El principio de acoplamiento es deliberado: **el cliente es autónomo y optimista; el servidor es la autoridad y el filtro.** El cliente nunca espera al servidor para operar, y el servidor nunca confía en el cliente para decidir qué puede ver cada quien.

---

## 3. Cliente

### 3.1 Lenguaje y build

**React con TypeScript**, empaquetado con **Vite**. TypeScript no es opcional: el modelo de visibilidad y la reconciliación de sync son terreno donde un error de tipos se traduce en una sorpresa arruinada o en un dato perdido. El tipado estático es la primera línea de defensa.

Vite aporta el servidor de desarrollo, el empaquetado de producción y el plugin de PWA en una sola herramienta, sin configuración de bundler propia.

### 3.2 PWA

El plugin `vite-plugin-pwa` genera el *manifest* y el *service worker*. El service worker cachea el *app shell* (HTML, JS, CSS) para arranque instantáneo sin red. **No** se usa el service worker para cachear datos de negocio: de eso se encarga la capa de sincronización sobre IndexedDB, que es transaccional y consultable. La división es clara —el service worker sirve el código; Dexie sirve los datos—.

### 3.3 Empaquetado iOS con Capacitor

Capacitor envuelve exactamente el mismo build web en una app iOS nativa. El código React no cambia entre la PWA y la app; solo se añaden, cuando hacen falta, plugins nativos (Sign in with Apple, actualizador OTA). Esto cumple «iOS nativo y PWA» sin bifurcar el producto, a diferencia de React Native, donde la versión web exigiría una capa distinta.

La app iOS se distribuye por **TestFlight** para el uso familiar; no se requiere publicación en la App Store abierta.

### 3.4 Actualización OTA

El envoltorio nativo instalado (el binario de TestFlight) cambia rara vez. El contenido —el bundle JS de React— se actualiza **por aire** mediante `@capgo/capacitor-updater` en **modo autoalojado**: los bundles se publican en Cloudflare (Pages o un endpoint del Worker) y el plugin los descarga y aplica en el siguiente arranque. No se usa el servicio de pago de Capgo ni Appflow.

Esto es idéntico en espíritu a la PWA: en web, un *deploy* nuevo se sirve al recargar; en iOS, el actualizador descarga el mismo bundle. Un único acto de publicación llega a los dos canales.

> **Nota de cumplimiento.** Apple permite la actualización OTA de código interpretado (JS) siempre que no altere el propósito de la app. Es la práctica estándar de Capacitor, Cordova y React Native, y no supone riesgo de rechazo para un uso privado por TestFlight.

### 3.5 Almacén local y estado

**IndexedDB mediante Dexie** cumple dos funciones:

1. **Caché del subconjunto del usuario.** Una copia local de las entidades que esa persona puede ver, con la que la UI opera sin red. Como el filtrado ocurre en el servidor (apartado 5), este almacén **solo contiene datos autorizados**: en el dispositivo de una hija no hay ni rastro de las sorpresas ocultas.
2. **Cola de mutaciones.** Cada escritura local se registra como una mutación pendiente, con su ID local, su marca temporal y su autor, lista para enviarse cuando haya red.

Se elige IndexedDB/Dexie sobre SQLite WASM porque el volumen es de escala familiar y el filtrado pesado vive en el servidor: el cliente no necesita un motor de consultas relacional, solo un almacén transaccional fiable. Si en el futuro una vista exigiera consultas locales complejas, se puede reconsiderar SQLite WASM sin tocar el protocolo de sync.

Para el estado en memoria y la reactividad de la interfaz se usa un almacén ligero (**Zustand**) alimentado desde Dexie. La UI lee del almacén en memoria, que se hidrata de IndexedDB al arrancar y se mantiene sincronizado con él.

---

## 4. Backend

### 4.1 Cloudflare Worker

Un único **Worker** expone la API. Concentra tres responsabilidades:

- **Sincronización:** recibe lotes de mutaciones (`push`) y devuelve los cambios pendientes para el usuario (`pull`).
- **Lectura filtrada:** todo lo que sale hacia un dispositivo pasa por las reglas de visibilidad del apartado 6. El cliente no filtra nada sensible; el servidor decide.
- **Autenticación:** valida la identidad en cada petición (apartado 7).

El Worker es la **única autoridad**. El cliente propone cambios; el servidor los acepta, los ordena y decide qué devuelve a quién.

### 4.2 Cloudflare D1

**D1** (SQLite gestionado) es el registro canónico. El esquema traduce directamente las entidades del documento de Modelo de Datos —Persona, AtributoPersona, Categoría, AccesoCategoría, Etiqueta, Evento, Idea, Ocasión y demás—, conservando las convenciones ya fijadas allí:

- **IDs de dispositivo** como clave primaria (texto), no autoincrementos. Elimina colisiones al sincronizar.
- **Campos de auditoría** (`creado_en`, `modificado_en`, `autor`) en toda entidad de contenido, base de la resolución de conflictos.
- **Borrado lógico** (`activa`/`inactiva`), nunca físico. Retención indefinida.

Las migraciones de esquema se gestionan con **Wrangler** (la CLI de Cloudflare), versionadas en el repositorio.

> **Sin almacenamiento de ficheros en v1.** El modelo de datos deja la entidad Adjunto prevista pero no implementada, y los avatares se generan de iniciales. Por tanto **no se aprovisiona R2** todavía. Queda como decisión futura (apartado 10).

---

## 5. Sincronización offline

Es el núcleo del stack y el que materializa «muy offline-first, con cambios encolados». Se implementa a mano —cola de mutaciones propia con **last-write-wins**— por tres razones ya presentes en las specs: los IDs son locales, la auditoría por fecha y autor ya existe, y el filtrado por usuario exige un servidor que no se limite a replicar.

### 5.1 Escritura local (optimista)

Toda acción del usuario hace dos cosas de forma síncrona, sin red:

1. Aplica el cambio al almacén local (la UI se actualiza al instante).
2. Anexa una **mutación** a la cola: `{ id_local, entidad, operación, campos, modificado_en, autor }`.

No hay bloqueos ni modales de espera, en cumplimiento del criterio de «interfaz optimista» de la UX.

### 5.2 Envío (`push`)

Cuando hay red, el cliente envía el lote de mutaciones pendientes al Worker. El envío es **idempotente**: cada mutación lleva un identificador estable, de modo que un reintento tras un corte de red no duplica efectos. El servidor confirma las aceptadas y el cliente las retira de la cola.

### 5.3 Recepción (`pull`)

El cliente mantiene un **cursor** (marca de la última sincronización recibida). En cada `pull` pide «lo que ha cambiado para mí desde el cursor». El servidor devuelve **solo entidades que esa persona puede ver** (apartado 6), ya sea altas, modificaciones o bajas lógicas, y un cursor nuevo.

### 5.4 Resolución de conflictos: last-write-wins

Cuando dos dispositivos modifican la misma entidad estando desconectados, gana la escritura con `modificado_en` más reciente; el `autor` desempata y deja traza. Es coherente con el dominio: la concurrencia real es baja (una familia pequeña) y las entidades son en su mayoría de un solo dueño. No se justifica la complejidad de un CRDT para este perfil de uso.

Las bajas se tratan como cualquier modificación (borrado lógico), de modo que una baja tardía de un dispositivo desconectado se reconcilia igual que un cambio de campo.

### 5.5 Redacción indetectable

Detalle sutil pero crítico para no arruinar sorpresas: si una entidad **deja de ser visible** para una persona —porque su categoría pasa a restringida o privada— el servidor debe emitir hacia el dispositivo de esa persona una instrucción de **retirada de la caché local que es indistinguible de una baja lógica normal**. El dispositivo elimina el registro sin recibir ninguna señal de *por qué*. Así, ni la desaparición ni su motivo son deducibles. Este comportamiento se especifica aquí porque solo es posible con filtrado en servidor.

---

## 6. Modelo de seguridad y visibilidad

El apartado 3 de la Especificación Funcional define visibilidad por categoría (pública, restringida, privada) y reglas derivadas contra filtraciones indirectas. El stack lo hace cumplir en un único punto:

**Todo dato que sale del Worker hacia un dispositivo pasa por el filtro de visibilidad, calculado en el servidor para la persona autenticada.** El cliente nunca recibe algo que deba ocultar. En consecuencia:

- La caché offline de cada dispositivo es, por construcción, un **subconjunto autorizado**. Inspeccionar el almacenamiento del móvil de una hija no revela nada oculto, porque no está.
- No hay huecos, contadores descuadrados ni tiempos de carga distintos que delaten una ocultación, porque el dispositivo desconoce por completo la existencia de lo oculto.
- Las reglas de visibilidad viven **solo en el servidor**. El cliente no las conoce ni podría eludirlas.

Este es el motivo por el que se rechazaron los motores de replicación total (ElectricSQL, PowerSync y similares): replican tablas al cliente y dejan el filtrado en la interfaz, exactamente el patrón que la spec de UX prohíbe.

---

## 7. Autenticación

La identidad definitiva es **Sign in with Apple**, coherente con «iOS nativo» y con el registro de personas del modelo de datos (`identificador_apple`). La cuenta de desarrollador de Apple **ya está activa**, de modo que Sign in with Apple es el camino real desde el arranque, no un objetivo diferido.

- **Sign in with Apple como proveedor de identidad.** Funciona tanto en la app iOS (plugin nativo de Capacitor) como en la PWA (Sign in with Apple JS). El Worker valida el token de identidad de Apple, comprueba su firma y audiencia, y a partir de ahí emite un **token de sesión propio**.
- **Interfaz estable de identidad**, abstraída del proveedor. El cliente y el Worker trabajan siempre contra el token de sesión propio; Apple queda detrás de esa interfaz. Esto mantiene abierta la puerta a un método adicional en el futuro (por ejemplo, enlace mágico por correo si alguien de la familia no usa iPhone) sin tocar la lógica de sesión, sync ni visibilidad.
- **Proveedor de desarrollo (stub)** para el entorno local, detrás de la misma interfaz: un login simple que asigna la sesión a una persona con cuenta del registro semilla, para desarrollar sin depender de Apple en cada iteración. No se despliega en producción.

El servidor asocia cada sesión a una Persona con cuenta, y de ahí derivan tanto el `autor` de las mutaciones como el filtro de visibilidad. Las personas sin cuenta (familia extendida) nunca autentican: existen como destinatarios y sujetos, según ya fija la spec.

Esta identidad de sesión es, además, la que autoriza la pasarela de IA del apartado 8: solo una persona con cuenta autenticada puede provocar una llamada a la API de Claude.

---

## 8. Pasarela a la API de Claude

Algunas funciones de la aplicación se apoyarán en la **API de Claude** (por ejemplo, redactar o pulir el texto del plan semanal, sugerir ideas de regalo a partir de la ficha de una persona, o resumir el anecdotario). El requisito es explícito: **la clave de la API nunca debe salir del servidor ni viajar al dispositivo.**

La solución encaja con el resto del stack sin piezas nuevas: **el mismo Worker expone un endpoint de IA que actúa de pasarela** hacia `api.anthropic.com`.

- **La clave vive como secreto del Worker** (`wrangler secret put ANTHROPIC_API_KEY`), nunca en el cliente, en el repositorio ni en el bundle. El cliente no la ve jamás.
- **El acceso está autenticado.** El endpoint de IA exige el token de sesión del apartado 7: solo una persona con cuenta puede consumirlo. Esto impide que un tercero use la pasarela —y la factura— como un proxy abierto.
- **El Worker construye y reenvía la petición** a la API de Claude, añade la cabecera `x-api-key` con el secreto, y **retransmite la respuesta al cliente** (con streaming SSE cuando la función lo requiera, para no bloquear la interfaz).
- **Control de gasto.** La API de Claude es de pago sobre la clave del hogar, así que la pasarela es el punto natural para acotar el consumo: límite de peticiones por persona y por día, tope de `max_tokens` por función y elección del modelo según el caso de uso. El endpoint no acepta que el cliente fije modelo o parámetros arbitrarios; cada función de la app mapea a una configuración cerrada en el Worker.
- **Modelo por caso de uso.** El identificador del modelo se decide en el servidor. Para trabajo de calidad el predeterminado es `claude-opus-5`; para funciones ligeras y de alto volumen puede bajarse a un modelo más económico (`claude-sonnet-5` o `claude-haiku-4-5`). La app no codifica ningún identificador de modelo.

**Encaje con el offline-first.** Las funciones de IA son **online-only por naturaleza**: requieren red y no se encolan como las mutaciones de datos. La interfaz las degrada con elegancia —se ofrecen cuando hay conexión y se ocultan o deshabilitan sin red—, sin contaminar el camino principal de escritura local, que sigue siendo instantáneo y offline.

---

## 9. Entrega y despliegue

| Artefacto | Dónde | Cómo |
|---|---|---|
| PWA (web) | Cloudflare Pages | *Deploy* del build de Vite. Instalable desde el navegador. |
| Worker + D1 | Cloudflare | `wrangler deploy`; migraciones de D1 versionadas. |
| App iOS | TestFlight | Envoltorio Capacitor; se re-sube solo cuando cambia código nativo. |
| Bundle OTA | Cloudflare (Pages/Worker) | Publicado en cada release; lo recogen la PWA (al recargar) y la app iOS (Capgo). |

Un único acto de publicación del bundle JS alcanza la PWA y la app iOS a la vez. El binario nativo de TestFlight solo se renueva cuando cambia algo nativo (un plugin nuevo, permisos), lo cual es infrecuente.

---

## 10. Encaje con el despachador de WhatsApp

El Plan Semanal se genera desde un workflow de GitHub Actions (documentos *Plan Semanal* y *Despachador*). Su decisión abierta sobre el origen del contenido se resuelve así con este stack: **el generador del plan lee la agenda desde una lectura autenticada del Worker** (un endpoint de solo lectura, con token propio, que devuelve los eventos de la semana entrante ya resueltos). D1 es la fuente canónica; el Worker es su única puerta.

Esto mantiene la separación de responsabilidades ya descrita: la app escribe y consulta a través del Worker; el despachador solo lee, y por el mismo punto de autoridad. El `queue.json` del despachador sigue gobernando el **transporte** del mensaje; su **contenido** procede ahora de la agenda vía Worker, no de una composición manual.

---

## 11. Costes, límites y decisiones futuras

**Coste.** A escala familiar, todos los componentes de infraestructura caben holgadamente en los planes gratuitos: Workers y D1 (lecturas/escrituras diarias muy por debajo de los límites), Pages (hosting estático), GitHub Actions (el despachador consume minutos irrelevantes), y OTA autoalojado (sin servicio de pago). No hay factura recurrente por la infraestructura.

**La única partida de pago es la API de Claude** (apartado 8), facturada por uso sobre la clave del hogar. Por eso el gasto se contiene en la pasarela —límites por persona, tope de `max_tokens` y modelo económico en las funciones de alto volumen— y no en el cliente. El resto del sistema sigue a coste cero.

**Decisiones diferidas, previstas pero no implementadas en v1:**

- **Adjuntos e imágenes.** Cuando entren, el almacén natural es **Cloudflare R2**; la entidad Adjunto ya está prevista en el modelo de datos.
- **Notificaciones push nativas.** El empuje semanal lo cubre WhatsApp; si más adelante se quiere push en la app, se evaluará (con la limitación conocida de la PWA en iOS).
- **Cifrado en reposo del almacén local.** Los datos sensibles (sorpresas) no residen en el dispositivo por diseño, de modo que no es un requisito de v1; puede añadirse si el alcance cambia.
- **SQLite WASM en cliente.** Solo si alguna vista futura exigiera consultas locales complejas; el protocolo de sync no cambiaría.

---

## 12. Resumen de decisiones

| Decisión | Elección | Requisito que la justifica |
|---|---|---|
| Empaquetado | React web + Capacitor (iOS) + PWA | Un solo código; «iOS nativo y PWA con OTA» |
| Actualización | OTA autoalojado (Capgo) | Publicar sin App Store; coste cero |
| Almacén local | IndexedDB / Dexie | Caché del subconjunto + cola de mutaciones |
| Backend | Cloudflare Worker | Autoridad única y filtro de visibilidad |
| Persistencia | Cloudflare D1 | Registro canónico; IDs locales, auditoría, borrado lógico |
| Sincronización | Cola propia + last-write-wins | Offline-first con cambios encolados; concurrencia baja |
| Visibilidad | Filtrado en servidor | Ocultación de sorpresas indetectable |
| IA | Pasarela en el Worker con la clave como secreto | Usar la API de Claude sin exponer la clave |
| Autenticación | Sign in with Apple (Apple ID ya activo) | Identidad de las personas con cuenta |
