# garciadoral-ops

La agenda de una familia. Implementación de las especificaciones de `specs/`:
cuatro piezas que comparten un mismo modelo y una misma regla de visibilidad.

| Pieza | Dónde | Qué es |
|---|---|---|
| **API** | `api/` | Worker de Cloudflare sobre D1. Guarda el registro canónico y **filtra antes de transmitir** |
| **Aplicación** | `pwa/` | Una sola base de código: PWA instalable y, con la misma web dentro, la app de iOS |
| **Plan semanal** | `scripts/plan_semanal.py` | Un mensaje de WhatsApp por persona, cada domingo |
| **Despachador** | `scripts/despachar.py` | La cola de mensajes programados |

Los pasos de despliegue —Cloudflare, Apple Developer y GitHub— están en
[`docs/despliegue-cloudflare.md`](docs/despliegue-cloudflare.md).

## La regla que lo gobierna todo

El modo de fallo grave de este sistema no es un error visible: es **arruinar una
sorpresa**. De ahí que la función de visibilidad (`specs/modelo-datos.md` §6)
esté implementada dos veces —Python para el plan semanal, JavaScript para el
Worker— y que las dos suites de pruebas comprueben exactamente lo mismo. Una
divergencia entre ellas significaría que la aplicación y el plan semanal ocultan
cosas distintas.

Y de ahí, sobre todo, que el filtrado se produzca **en el servidor, antes de
transmitir**: ningún dispositivo llega a almacenar lo que su titular no puede
ver, porque en un modelo sin conexión esa información permanecería accesible por
otras vías. Es el requisito no funcional de mayor importancia del sistema.

La regla alcanza a todo lo derivado. Un aviso remoto lo compone el servidor, así
que allí hay que **volver a aplicarla**: se compone la instantánea de quien
recibiría el aviso y se mira si el objeto está dentro, en lugar de escribir una
segunda copia de la regla. Lo mismo con lo que se le manda a un modelo de
lenguaje: cada encargo se compone de la instantánea de quien lo pide.

---

## 1. Qué hay aquí

```
api/                  · Worker de Cloudflare y esquema de D1
  src/                · rutas, visibilidad, filtrado, Lío, sitios, avisos, redacción
  migraciones/        · 18 ficheros; `.unavez` las que no se pueden repetir
pwa/                  · la aplicación: web instalable y cáscara de iOS con OTA
  publico/js/         · los módulos, servidos tal cual: no hay empaquetador
  publico/js/vistas/  · las cinco secciones de la barra
  scripts/patch-ios.mjs · lo que el proyecto de Xcode necesita y `cap sync` no hace
docs/
  despliegue-cloudflare.md · Cloudflare, Apple Developer y GitHub, paso a paso
  mapa.md             · mapa del repositorio; generado, no se edita a mano
herramientas/
  preparar-pwa.py     · iconos y datos de demostración
  mapa.py             · genera el mapa a partir del código
  aeropuertos.py      · la tabla de códigos con la que se nombra un vuelo
  aprobar-solicitud.sh · aprobar a alguien desde la línea de órdenes
.github/workflows/
  despachador.yml     · sondeo diario que despacha la cola
  plan-semanal.yml    · el plan de la semana entrante, los domingos por la tarde
  mantenimiento.yml   · latido contra la desactivación por inactividad
  desplegar-api.yml   · sube el Worker y aplica las migraciones que falten
  ota.yml             · publica el bundle web que se descargan las apps de iOS
  pruebas.yml         · las tres suites y los guardianes, en cada PR
scripts/
  despachar.py        · recorre queue.json y envía lo vencido
  plan_semanal.py     · compone un plan por destinatario y lo entrega
  callmebot.py        · transporte compartido por ambos
  agenda/
    modelo.py         · entidades y reglas de integridad
    visibilidad.py    · la función de visibilidad
    semana.py         · semana entrante, recurrencias y eventos de varios días
    lio.py            · los turnos de paseo, derivados del cuadro semanal
    mensaje.py        · el texto para WhatsApp
    fuente.py         · lectura del registro canónico de la agenda
datos/
  catalogos.json      · tipos de evento, categorías y emojis acotados
  agenda.ejemplo.json · registro de ejemplo, con datos inventados
estado/
  plan-semanal.json   · qué semana se envió y a quién
queue.json            · la cola del despachador
tests/                · las reglas de las especificaciones, una prueba por regla
```

Para orientarse sin recorrer todo esto, [`docs/mapa.md`](docs/mapa.md) lista los
módulos con una línea cada uno, las rutas de la API, los workflows con su `cron`,
las variables de entorno y el recuento de pruebas. Se genera del propio código
—`python3 herramientas/mapa.py`—, de modo que no envejece, y es lo que el hook
`SessionStart` inyecta al abrir una sesión de Claude Code.

---

## 2. Qué hace la aplicación

Cinco secciones en la barra de abajo, y Ajustes como sexto botón que no es una
pestaña.

| Sección | Qué es |
|---|---|
| **Hoy** | Con lo que abre. El saludo, lo del día con los cumpleaños dentro, la banda de lo que espera respuesta y los turnos del perro |
| **Agenda** | La semana, el mes y la lista sobre los mismos datos. Un evento puede durar varios días y aparece en todos |
| **Regalos** | Deseos, ideas, regalos y ocasiones: el ciclo entero de lo que se regala, que es lo que la regla de visibilidad protege |
| **Gente** | Tres círculos —Familia, Familia Extendida y Amigos—, con el parentesco relativo a quien mira |
| **Sitios** | Lo que una casa sabe de un lugar y se le olvida cada año, en cuatro clases que son verbos: Llevar, Hacer, Ir y Saber |

Y dos módulos que no cuelgan de la agenda: **Lío**, los turnos de paseo del
perro, derivados de un cuadro semanal con vigencia y con el trato que los cambia
de dueño; y el propio **Sitios**.

Lo que atraviesa a todos:

- **Los comentarios**, en cualquier cosa que los admita. La lista de tipos vive
  en un solo sitio (`api/src/comentables.js`), de modo que dar de alta un módulo
  nuevo no obliga a rehacer la tabla.
- **Los avisos**, en dos mitades que contestan preguntas distintas: en el
  dispositivo, un sobre en la cabecera que **solo existe cuando hay algo** y
  reúne lo que espera sin contestar; en el servidor, los avisos remotos por APNs,
  que son lo que hace sonar el teléfono de otro. El globo del icono cuenta lo que
  espera respuesta y solo eso.
- **Sin conexión.** Interfaz optimista sobre una cola persistente: lo que se
  escribe se ve en el acto y sube cuando hay red.
- **Seis encargos a un modelo de Anthropic**, todos opcionales y apagados si no
  hay clave: contar un día, proponer un regalo, apuntar cosas de un sitio,
  redactar una felicitación, la frase del día y la voz del perro. Cada uno se
  compone de la instantánea de quien lo pide, así que la ocultación se cumple
  sola.
- **Un modo demostración** con una familia inventada, en el que se elige con los
  ojos de quién se mira. Sin cuenta y sin servidor.

El acceso es **solo Sign in with Apple**, y entrar no da acceso: deja una
solicitud que aprueba un administrador desde la propia aplicación
(`specs/autenticacion.md`).

### El reparto: el binario casi no cambia

La app de iOS es la misma web dentro de una cáscara de Capacitor, y eso decide
cómo se publica. Un cambio de pantalla es **un bundle OTA** que `ota.yml` corta y
los teléfonos se descargan solos, sin pasar por Apple. Solo lo nativo —un plugin,
un entitlement, el nombre bajo el icono— obliga a archivar un binario y volver a
la revisión.

Hoy se reparte por **TestFlight interno**, que no pasa por revisión
(`docs/despliegue-cloudflare.md` §8.5). La ficha de la App Store está escrita en
el §8.4 y es el paso en curso.

Al tocar cualquier cosa de `pwa/publico/` hay que subir **tres cifras a la vez**:
`VERSION` en `sw.js` —el navegador—, `version` en `pwa/package.json` —el bundle
OTA— y su copia en `pwa/publico/js/version.js`, que es la que la pantalla de Hoy
escribe abajo a la derecha. `pruebas.yml` falla si alguna se queda atrás, y
compara contra la punta de `main` en el momento de correr, no contra la base del
PR: dos ramas abiertas a la vez veían un salto correcto desde su base común y
publicaban bajo la misma versión.

---

## 3. Correspondencia con las especificaciones

Esta tabla es la lectura razonada. La mecánica —qué fichero cita qué apartado,
extraída de los comentarios del propio código— está en `docs/mapa.md`, y es la
que delata a un módulo que dejó de citar su especificación.

| Documento | Dónde está implementado |
|---|---|
| `specs/despachador.md` §5–§9 | `scripts/despachar.py`, `queue.json`, workflows `despachador` y `mantenimiento` |
| `specs/plan-semanal.md` | `scripts/plan_semanal.py`, `agenda/semana.py`, `agenda/mensaje.py`, workflow `plan-semanal` |
| `specs/modelo-datos.md` §2 y §4 | `scripts/agenda/modelo.py`, `api/migraciones/` |
| `specs/modelo-datos.md` §6 | `scripts/agenda/visibilidad.py` |
| `specs/modelo-datos.md` §7.4 | `eventos_derivados` en `scripts/agenda/semana.py` |
| `specs/modelo-datos.md` §2.6 (Lío) | `api/src/lio.js`, `pwa/publico/js/lio.js`, `scripts/agenda/lio.py` |
| `specs/modelo-datos.md` §2.7 (Sitios) | `pwa/publico/js/sitios.js`, `pwa/publico/js/vistas/sitios.js` |
| `specs/modelo-datos.md` §2.9 (avisos) | `api/src/avisos.js`, `api/src/apns.js` |
| `specs/especificacion.md` §3.1 y §4.1 | `datos/catalogos.json`, `api/migraciones/0002_catalogos.sql` |
| `specs/especificacion.md` §3 (visibilidad) | `api/src/visibilidad.js` y `api/src/filtrado.js` |
| `specs/especificacion.md` §8 (acceso) | `api/src/apple.js` y `pwa/publico/js/sesion.js` |
| `specs/autenticacion.md` (sala de espera y aprobación) | `api/src/solicitudes.js` |
| `specs/especificacion.md` §9 (sin conexión) | `pwa/publico/js/sincronizacion.js` y `pwa/publico/js/almacen.js` |
| `specs/calendario-viajes.md` | `api/src/viajes.js` y `api/src/ical.js` |
| `specs/ux.md` §6 a §12 | `pwa/publico/js/vistas/` |

`specs/especificacion.md` §7 (Anecdotario) tiene la especificación diferida y no
se modela, tal como el propio documento indica.

Las decisiones de diseño de cada módulo —lo que se descartó y por qué— viven en
las propuestas y prototipos de `specs/`, que son HTML para poder mirarlos.

---

## 4. El despachador

Un sondeo diario a las 07:07 UTC recorre `queue.json`, envía lo vencido por
CallMeBot y devuelve el estado actualizado al repositorio con un commit. El
teléfono queda fuera del camino crítico: los envíos se producen con el móvil
bloqueado, apagado o sin cobertura.

`queue.json` es un array; las marcas temporales se escriben en hora local sin
desplazamiento y se interpretan en `Europe/Madrid`:

```json
[
  {
    "id": "3F2A9C1E",
    "to": ["maria", "papa"],
    "text": "Resumen de la semana",
    "send_at": "2026-07-27T09:00:00",
    "repeat": "ninguna",
    "status": "pendiente"
  }
]
```

`repeat` admite `ninguna`, `diaria`, `semanal` y `anual`. `status` evoluciona
entre `pendiente`, `enviado`, `caducado` y `error`, y lo gestiona exclusivamente
el script. El reparto es idempotente por destinatario: si falla el tercero de
cuatro envíos, el reintento del día siguiente solo cubre a quienes quedaron
pendientes.

---

## 5. El plan semanal

Cada domingo por la tarde, un mensaje por persona con el plan de los siete días
siguientes. No pasa por `queue.json`: es un derivado que se recalcula a partir
del estado vivo de la agenda, de modo que un cambio del sábado por la noche se
refleja en el plan del domingo.

**Se compone por destinatario.** Para cada uno se aplica la función de
visibilidad con esa persona como observador, igual que la vista de semana se
compone para cada dispositivo dentro de la aplicación. Ana y Óscar reciben los
eventos reservados; las hijas reciben la misma semana sin ellos, sin hueco ni
línea genérica. A quien no tiene cuenta —los abuelos— se le compone la vista
pública, que es la más conservadora.

El código blinda la correspondencia entre observador y texto: cada plan se
compone y se entrega dentro de la misma iteración, y `enviar_plan` aborta si el
destinatario no es aquel para el que se compuso. Un mensaje correcto para una
persona, remitido por error a otra, es una filtración consumada e irreversible.

Prueba en seco, sin enviar nada:

```bash
AGENDA_PATH=datos/agenda.ejemplo.json \
  python3 scripts/plan_semanal.py --simulacro --fecha 2026-07-26
```

produce, entre otros, este plan para una hija:

```
*Plan de la semana*
27 jul – 2 ago

L 27  🏇 Entreno de hípica · 18:00
      🐾 ☀️ Óscar · 🌙 Ana
M 28  🐾 ☀️ Ana · 🌙 Óscar
X 29  🐾 ☀️ Óscar · 🌙 Ana
J 30  🎂 Cumpleaños de la abuela
      🩺 Dentista (Ana) · 10:00
      🐾 ☀️ Ana · 🌙 Óscar
V 31  🐾 ☀️ Óscar · 🌙 Ana
S  1  🎂 Cumpleaños de Marta
      🏆 Torneo de hípica
      🐾 ☀️ Marta · 🌙 Óscar
D  2  🏆 Torneo de hípica (cont.)
      🍽️ Comida con los abuelos · 14:00
      🐾 ☀️ Lucía · 🌙 Ana
```

Tres cosas se ven ahí. La fila `V 31` contiene además
`📌 Preparar la fiesta de Ma… · 17:00` en el plan de Ana y de Óscar, y solo en el
suyo. El torneo del sábado se repite el domingo con `(cont.)`, porque un evento
de varios días aparece en todos. Y el renglón del perro va en su propia línea,
fuera del techo de tres eventos por día; a quien no tiene cuenta no le llega,
porque Lío es de la casa.

---

## 6. Puesta en marcha

Esto cubre los dos procesos programados. El Worker, la base y la aplicación
tienen su propia guía, paso a paso, en
[`docs/despliegue-cloudflare.md`](docs/despliegue-cloudflare.md).

1. **Claves de CallMeBot.** Cada destinatario activa la suya enviando al bot el
   mensaje de autorización.
2. **Secreto `RECIPIENTS_JSON`** en *Settings → Secrets and variables →
   Actions*. Los números de teléfono nunca residen en el repositorio.

   ```json
   {
     "maria":   { "phone": "+34600111222", "apikey": "123456", "persona_id": "p-maria" },
     "papa":    { "phone": "+34600333444", "apikey": "789012" },
     "oficina": { "phone": "+34600555666", "apikey": "345678", "plan": false }
   }
   ```

   Dos claves opcionales, que el despachador ignora y el plan usa:
   `persona_id` indica qué persona del registro actúa como observador —sin ella,
   o si esa persona no tiene cuenta, se compone la vista pública— y `plan: false`
   excluye a ese destinatario del envío semanal sin sacarlo del despachador.
3. **Registro canónico de la agenda.** Copie `datos/agenda.ejemplo.json` a
   `datos/agenda.json` y sustituya su contenido, o —lo que se hace en producción—
   apunte `AGENDA_URL` a `GET /api/registro` del Worker con `AGENDA_TOKEN`.
   `datos/agenda.json` está en `.gitignore` a propósito: contiene nombres y
   fechas de nacimiento de menores, que se aprovisionan en el despliegue y se
   mantienen fuera del repositorio versionado.
4. **Confirme que los workflows están en la rama por defecto.** El disparador
   programado solo se evalúa desde ella.
5. **Lance cada workflow manualmente una vez** desde la pestaña Actions. Sin
   este paso la programación puede no activarse en un repositorio nuevo.
6. Encole un mensaje de prueba con `send_at` a diez minutos vista y verifique la
   ejecución.

Variables de entorno reconocidas por los scripts:

| Variable | Efecto |
|---|---|
| `RECIPIENTS_JSON` | Mapa de destinatarios. Obligatoria para enviar. |
| `AGENDA_URL`, `AGENDA_TOKEN` | Registro canónico accesible por HTTPS. |
| `AGENDA_PATH` | Registro canónico en fichero. Por defecto `datos/agenda.json`. |
| `CATALOGOS_PATH` | Catálogos. Por defecto `datos/catalogos.json`. |
| `QUEUE_PATH` | Cola del despachador. Por defecto `queue.json`. |
| `ESTADO_PLAN_PATH` | Registro de envíos del plan. Por defecto `estado/plan-semanal.json`. |

Las del Worker están en `api/wrangler.toml`, con su explicación al lado, y
listadas en `docs/mapa.md`.

### Las migraciones no se apuntan en ninguna lista

La base lleva su propio registro —la tabla `migracion`— y el despliegue de la API
aplica **solo lo que no conste ahí**, en cada empujón a `main`. Escribir una
migración es dejar el `.sql` en `api/migraciones/`; no hay que anotarla en ningún
sitio. Sustituye a una lista escrita a mano que mintió dos veces.

Lo que sí hay que respetar al escribir una: **corriente si se puede repetir**
—`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`— y **`.unavez`** si lleva
`ALTER TABLE`, reparte datos o rehace una tabla. `pruebas.yml` rechaza un `.sql`
sin `.unavez` que lleve `ALTER TABLE`, `DROP`, `INSERT INTO` o `INSERT OR REPLACE`.

---

## 7. Decisiones tomadas

Las especificaciones dejaban abiertos varios puntos. Lo resuelto aquí, y por qué:

**La hora del domingo y la ventana de gracia** (`plan-semanal.md` §12.3). La
ventana es de 17:00 a 23:00 en `Europe/Madrid`, y la comprueba el script, no el
`cron`: GitHub programa en UTC y el desplazamiento cambia con el horario de
verano. El workflow sondea cuatro veces dentro de esa franja, y el registro de
`estado/plan-semanal.json` impide que un segundo sondeo reenvíe lo ya entregado.
La gracia cubre así un fallo de horas, nunca de días: un plan que llegara el
martes, con dos días ya consumidos, habría perdido su sentido.

**Dónde reside el workflow del plan** (§12.2). En el mismo repositorio que el
despachador, del que reutiliza el transporte y el mapa de destinatarios.

**Los eventos de varios días** (§12.5). La línea se repite en cada jornada
afectada y las posteriores a la primera llevan `(cont.)`, que es la misma regla
que la vista de semana de la aplicación (`ux.md` §10.2).

**El almacenamiento del registro canónico** (§12.1) sigue abierto, y por eso la
lectura está aislada en `agenda/fuente.py`: admite fichero o URL, y fijar el
almacenamiento más adelante no toca nada más. El generador del plan es un lector
de servidor de confianza, de modo que leer la fuente entera y filtrar por
destinatario es correcto; el requisito de «filtrar antes de transmitir» afecta a
los dispositivos de la aplicación, no a él.

**El ancho de línea del mensaje** no estaba fijado. Se recorta a unas 42
columnas, contando los emojis como dos: una línea más larga se parte en la
pantalla del móvil y la continuación cae al margen izquierdo sin sangría, lo que
rompe el «una línea por evento». La constante está en `agenda/mensaje.py` y se
ajusta en un sitio.

**Reparto del código del despachador.** El script del apartado 8 de
`specs/despachador.md` se implementa tal cual, salvo que el envío y la carga del
mapa viven en `callmebot.py`, compartidos con el generador del plan, y el bucle
principal se extrae a `procesar()` para poder probarlo sin red.

---

## 8. Pruebas

**320 en total**, repartidas en tres suites que corren en cada PR:

```bash
python3 -m unittest discover -s tests -v   # despachador, plan semanal, modelo, Lío
cd api && npm test                         # Worker: visibilidad, filtrado, avisos, IA
cd pwa && npm test                         # aplicación: acceso, varios días, vuelos
```

Cubren la función de visibilidad —incluidas la ocultación por destinatario, los
co-destinatarios, las categorías privadas y restringidas, y la limitación
conocida de las etiquetas—, las reglas de integridad del modelo, la expansión de
recurrencias, los turnos derivados del cuadro con vigencia, la composición de los
avisos remotos, el formato del mensaje y la idempotencia del despachador. La
guarda que impide entregar a una persona un texto compuesto para otra tiene su
propia prueba.

`pruebas.yml` añade además lo que no es una prueba pero falla igual: que
`docs/mapa.md` corresponde al código de su commit, que las tres versiones suben
juntas, que el registro de ejemplo compone los siete planes y que ninguna
migración repetible lleva un `ALTER TABLE` dentro.

---

## 9. Qué falta

El módulo **Anecdotario** queda fuera por decisión de la propia especificación
funcional, que difiere su detalle hasta cerrar la estructura de la importación
desde el export de Facebook.

La **copia periódica automática** de salvaguarda no está construida; la
exportación bajo demanda sí funciona (`docs/despliegue-cloudflare.md` §12).

El **recordatorio previo** avisa, pero con la misma antelación para todo el
mundo: se programa en el dispositivo a partir de la instantánea, treinta minutos
antes de un evento con hora y la tarde anterior si ocupa la jornada completa. Lo
que falta es la parte configurable —la tabla `preferencia_notificacion` existe en
el esquema pero ni se sirve al cliente ni hay pantalla para tocarla—, de modo que
hoy vale su valor por defecto.

Del **ciclo de la idea** queda por construir lo que analiza
`specs/propuesta-idea-de-punta-a-punta.html`, incluido un punto sin retorno que
hoy está escondido: entregar el regalo cierra la idea para siempre, y retirarlo
después no la devuelve.

La cáscara de iOS no se genera aquí: `npx cap add ios` hace `pod install` y eso
solo funciona en macOS. Los pasos están en `pwa/README.md` y en el apartado 8 de
la guía de despliegue. `ios/` no se versiona, así que todo lo que el proyecto de
Xcode necesita y `cap sync` no hace lo aplica `pwa/scripts/patch-ios.mjs` en cada
sincronización.

Lo que queda abierto de cada módulo —cómo partir un sitio con cuarenta apuntes,
qué hacer con los avisos de una semana fuera, si Hoy debería llevar botón
flotante— se anota en el apartado «En curso» de `CLAUDE.md`, que es lo único de
la documentación que se escribe a mano porque no se deduce del código.
