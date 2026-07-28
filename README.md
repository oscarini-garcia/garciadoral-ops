# garciadoral-ops

Implementación de las especificaciones de `specs/`. Cinco piezas que comparten
un mismo modelo y una misma regla de visibilidad:

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

---

## 1. Qué hay aquí

```
api/                  · Worker de Cloudflare y esquema de D1
pwa/                  · la aplicación: web instalable y cáscara de iOS con OTA
docs/
  despliegue-cloudflare.md · Cloudflare, Apple Developer y GitHub, paso a paso
  mapa.md             · mapa del repositorio; generado, no se edita a mano
herramientas/
  preparar-pwa.py     · iconos y datos de demostración
  mapa.py             · genera el mapa a partir del código
.github/workflows/
  despachador.yml     · sondeo diario que despacha la cola
  plan-semanal.yml    · el plan de la semana entrante, los domingos por la tarde
  mantenimiento.yml   · latido contra la desactivación por inactividad
  ota.yml             · publica el bundle web que se descargan las apps de iOS
  pruebas.yml         · unittest en cada empujón
scripts/
  despachar.py        · recorre queue.json y envía lo vencido
  plan_semanal.py     · compone un plan por destinatario y lo entrega
  callmebot.py        · transporte compartido por ambos
  agenda/
    modelo.py         · entidades y reglas de integridad
    visibilidad.py    · la función de visibilidad
    semana.py         · semana entrante, recurrencias y eventos de varios días
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

### Correspondencia con las especificaciones

Esta tabla es la lectura razonada. La mecánica —qué fichero cita qué apartado,
extraída de los comentarios del propio código— está en `docs/mapa.md`, y es la
que delata a un módulo que dejó de citar su especificación.

| Documento | Dónde está implementado |
|---|---|
| `specs/despachador.md` §5–§9 | `scripts/despachar.py`, `queue.json`, workflows `despachador` y `mantenimiento` |
| `specs/plan-semanal.md` | `scripts/plan_semanal.py`, `agenda/semana.py`, `agenda/mensaje.py`, workflow `plan-semanal` |
| `specs/modelo-datos.md` §2 y §4 | `scripts/agenda/modelo.py` |
| `specs/modelo-datos.md` §6 | `scripts/agenda/visibilidad.py` |
| `specs/modelo-datos.md` §7.4 | `eventos_derivados` en `scripts/agenda/semana.py` |
| `specs/especificacion.md` §3.1 y §4.1 | `datos/catalogos.json`, `api/migraciones/0002_catalogos.sql` |
| `specs/especificacion.md` §3 (visibilidad) | `api/src/visibilidad.js` y `api/src/filtrado.js` |
| `specs/especificacion.md` §8 (acceso) | `api/src/apple.js` y `pwa/publico/js/sesion.js` |
| `specs/autenticacion.md` (sala de espera y aprobación) | `api/src/solicitudes.js` |
| `specs/especificacion.md` §9 (sin conexión) | `pwa/publico/js/sincronizacion.js` y `pwa/publico/js/almacen.js` |
| `specs/ux.md` §11 (opción D) | `pwa/publico/js/vistas/` |

`specs/especificacion.md` §7 (Anecdotario) tiene la especificación diferida y no
se modela, tal como el propio documento indica.

---

## 2. El despachador

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

## 3. El plan semanal

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
M 28  —
X 29  —
J 30  🎂 Cumpleaños de la abuela
      🩺 Dentista (Ana) · 10:00
V 31  —
S  1  🎂 Cumpleaños de Marta
      🏆 Torneo de hípica
D  2  🏆 Torneo de hípica (cont.)
      🍽️ Comida con los abuelos · 14:00
```

La fila `V 31` de esa misma semana contiene `📌 Preparar la fiesta de Ma… · 17:00`
en el plan de Ana y de Óscar, y solo en el suyo.

---

## 4. Puesta en marcha

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
   `datos/agenda.json` y sustituya su contenido, o publique el registro en una
   URL y configure los secretos `AGENDA_URL` y, si hace falta, `AGENDA_TOKEN`.
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

---

## 5. Decisiones tomadas

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

## 6. Pruebas

```bash
python3 -m unittest discover -s tests -v   # despachador, plan semanal, modelo
cd api && npm test                         # visibilidad y filtrado del Worker
```

Cubren la función de visibilidad —incluidas la ocultación por destinatario, los
co-destinatarios, las categorías privadas y restringidas, y la limitación
conocida de las etiquetas—, las reglas de integridad del modelo, la expansión de
recurrencias, el formato del mensaje y la idempotencia del despachador. La
guarda que impide entregar a una persona un texto compuesto para otra tiene su
propia prueba.

---

## 7. Qué falta

El módulo **Anecdotario** queda fuera por decisión de la propia especificación
funcional, que difiere su detalle hasta cerrar la estructura de la importación
desde el export de Facebook.

De lo demás, dos cosas están modeladas pero no construidas: los **calendarios
externos** importados —el modelo los contempla y la interfaz los muestra como
eventos no editables, pero no hay conector que los traiga— y la **copia
periódica automática** de salvaguarda; la exportación bajo demanda sí funciona
(`docs/despliegue-cloudflare.md` §12).

El **recordatorio previo** ya avisa, pero solo dentro de la app de iOS y con la
misma antelación para todo el mundo: se programa en el dispositivo a partir de la
instantánea, treinta minutos antes de un evento con hora y la tarde anterior si
ocupa la jornada completa. Lo que falta es la parte configurable —la tabla
`preferencia_notificacion` existe en el esquema pero ni se sirve al cliente ni
hay pantalla para tocarla—, de modo que hoy vale su valor por defecto: el
recordatorio activo y los avisos de modificación desactivados.

Los **avisos remotos** sí están construidos, y son la otra mitad: lo que se
programa en el dispositivo solo alcanza a lo que ya se sabe, y que a otro le
suene el teléfono porque acabas de pedirle un cambio de turno no lo puede
programar nadie por adelantado. Los empuja el Worker por APNs, con Lío entero y
los comentarios, y se encienden desde Ajustes → Avisos. Piden dos secretos
(`docs/despliegue-cloudflare.md` §4.6) y, sin ellos, no se empuja nada y la
aplicación funciona igual.

La cáscara de iOS no se ha generado aquí: `npx cap add ios` hace `pod install` y
eso solo funciona en macOS. Los pasos están en `pwa/README.md` y en el apartado 8
de la guía de despliegue.
