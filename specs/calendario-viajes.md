# Agenda Familiar — Calendario de Viajes (Integración)

**Versión:** 0.2
**Fecha:** 24 de julio de 2026
**Documentos complementarios de:** Especificación Funcional · Modelo de Datos y Flujos · Propuesta de Experiencia de Usuario
**Alcance:** especificación funcional y de datos de la primera fuente de eventos importados, un calendario de viajes de Google. Define qué se importa, cómo se corresponde con el modelo existente y cómo se sincroniza. El stack técnico queda fuera del documento.

---

## 1. Propósito y encaje

El calendario de viajes es la primera materialización del origen **Importado** descrito en el apartado 4.2 de la Especificación Funcional. No introduce un concepto nuevo: el modelo ya prevé la entidad **CalendarioExterno** (modelo de datos, 2.4), el origen **importado** del evento y el tipo de evento **viaje** con su emoji de avión. Este documento cierra el detalle que aquellos dejaban abierto.

El calendario contiene, en esta primera versión, los **viajes de Oscar**. El objetivo no es trasladar su gestión a la aplicación, sino **reflejarlos**: que aparezcan en la semana junto al resto de la vida familiar, de modo que en casa se sepa cuándo viaja sin necesidad de preguntarlo. La planificación del viaje sigue ocurriendo en Google; la agenda lo muestra.

Son, por tanto, eventos **puramente informativos**: no llevan participantes ni regalos asociados (apartado 6). Los datos propios de la aplicación que sí tienen sentido sobre ellos son el emoji y la configuración de avisos. Esta decisión es de esta versión, no del modelo: el modelo sigue admitiendo que un evento importado lleve regalos, de modo que habilitarlo más adelante no exige rehacer nada.

El principio rector es que **la fuente externa es la única autoridad sobre el contenido del evento**. Título, fechas, lugar y descripción se corrigen en Google y la aplicación los reproduce. Cualquier edición de esos campos dentro de la aplicación se perdería en la siguiente sincronización, por lo que sencillamente no se ofrece.

---

## 2. La fuente

El calendario se consume como un **feed iCalendar (`.ics`)** publicado por Google Calendar en su dirección privada. Sus propiedades condicionan todo lo demás:

**Es de solo lectura y de sentido único.** El feed se descarga; no se escribe. La aplicación no crea, modifica ni elimina eventos en Google. Toda la coordinación de viajes que la familia quiera hacer sigue en Google, y la aplicación no aspira a sustituirla.

**Su dirección incorpora un secreto.** La URL privada contiene un token que actúa como credencial: quien la posee lee el calendario completo, sin autenticación adicional. De ahí se derivan los requisitos del apartado 8. El token **no forma parte de este documento ni del repositorio**; se aprovisiona en el despliegue, del mismo modo que los datos semilla del registro de Personas.

**Se actualiza con retardo.** Google regenera el feed privado con una latencia que puede alcanzar varias horas. Un viaje añadido en Google no aparece de inmediato en la aplicación. Es una limitación de la fuente, no de la sincronización, y conviene que las expectativas se fijen en consecuencia: este calendario informa de planes, no de cambios de última hora.

**La granularidad es la de un calendario, no la de una agenda personal.** El feed entrega todos los eventos del calendario de viajes, sin distinguir participantes ni aplicar más filtro que el propio calendario. Lo que se decide incluir en él es una decisión que se toma en Google, no en la aplicación.

Se consideró la alternativa de la API de Google Calendar mediante OAuth, que reduciría la latencia y permitiría notificaciones de cambio a cambio de un coste de integración y de gestión de credenciales mayor. **La decisión está tomada: la integración se construye sobre el feed iCal**, cuya simplicidad se ajusta a un calendario que informa de planes y no de cambios inmediatos. La latencia de regeneración se asume como propiedad conocida de la fuente, no como carencia por resolver.

---

## 3. Encaje con el modelo de datos

La integración no añade entidades nuevas al modelo; instancia y precisa las existentes.

### 3.1 CalendarioExterno

Se crea una fila única para este calendario, con los campos previstos en el modelo (2.4) más las precisiones que la fuente exige:

| Campo | Contenido para el calendario de viajes |
|---|---|
| nombre | Descriptivo, p. ej. "Viajes" |
| identificador_fuente | Identificador estable del calendario de Google |
| url_privada | Dirección del feed `.ics`. **Secreto**, aprovisionado fuera del repositorio (apartado 8) |
| tipo_evento_por_defecto | **viaje**, del que se hereda el emoji de avión |
| estado_ultima_sincronizacion | Resultado del último intento: correcto, con marca de tiempo; o con error, sin sobrescribir el contenido ya importado |
| marca_ultima_sincronizacion | Instante de la última sincronización correcta |

La asociación del calendario a un tipo de evento se decide una sola vez, al conectarlo, y de ahí se deriva la presentación de todo lo que llegue sin necesidad de reglas por evento, conforme al apartado 4.2 de la Especificación Funcional.

### 3.2 Evento importado

Cada entrada del feed produce un **Evento** con origen **importado** y referencia a la fila de CalendarioExterno anterior. Estos eventos no admiten edición de su contenido; sí de los datos propios de esta aplicación, según el apartado 6.

Cada evento importado conserva el **identificador externo** de su entrada de origen (el `UID` de iCalendar), que es la clave por la que se reconcilian las sucesivas sincronizaciones. Sin ese identificador, cada descarga crearía duplicados en lugar de actualizar lo existente.

---

## 4. Correspondencia de campos

La traducción de una entrada iCalendar a un Evento se fija de forma explícita para que no dependa de la interpretación de quien la implemente.

| Campo iCalendar | Campo del Evento | Notas |
|---|---|---|
| `UID` | identificador externo | Clave de reconciliación. No se muestra |
| `SUMMARY` | título | |
| `DTSTART` | fecha de inicio | |
| `DTEND` | fecha de fin | Para eventos de jornada completa, iCalendar expresa el fin como **exclusivo**: se resta un día para la presentación (apartado 7) |
| `VALUE=DATE` en `DTSTART` | indicador de jornada completa | Un viaje suele expresarse como fechas sin hora |
| `LOCATION` | ubicación | Puede venir vacío |
| `DESCRIPTION` | notas | Texto libre, tal cual |
| `RRULE` | — | **Se ignora**: de un evento recurrente se importa solo su primera aparición (apartado 5.5) |
| `STATUS:CANCELLED` | evento inactivo | Se trata como una baja (apartado 5.2) |
| `SEQUENCE` / `LAST-MODIFIED` | — | Se emplean para detectar cambios, no se almacenan como contenido |
| — | emoji | El del tipo **viaje** (avión). Sustituible en la aplicación, como dato propio (apartado 6) |
| — | tipo de evento | **viaje**, heredado del CalendarioExterno |
| — | participantes | **No se derivan del feed**, y en esta versión no se asignan (apartado 6.2) |
| — | categoría | Pública. Un calendario importado no porta reglas de visibilidad |

**Zonas horarias.** Las entradas con hora llegan referidas a una zona (`TZID`) o en UTC (`Z`). La conversión a la zona local debe realizarse en la importación y no en la presentación, para que la fecha con la que un evento se sitúa en la semana sea inequívoca. Los eventos de jornada completa carecen de zona: son fechas flotantes y no deben desplazarse por conversión alguna.

Durante un tiempo esto se cumplió solo a medias: las marcas `Z` se convertían y las `TZID` no, y se anotó como limitación conocida. No lo era. Un vuelo que sale de Nueva York a las 18:40 son las 00:40 del día siguiente en Madrid, de modo que el evento se situaba **un día antes del que le toca** —y si ese día era domingo, en la semana anterior—. Ya se convierten las tres formas, y `api/test/ical.test.js` comprueba que un mismo instante escrito en `Z`, en `TZID` de casa y en `TZID` ajeno da el mismo resultado. Una zona que el motor no reconozca —los nombres de Windows, «Romance Standard Time»— cae a la hora de pared, que es lo que había: perder el vuelo entero sería mucho peor que perder la hora.

---

## 5. Sincronización y reconciliación

### 5.1 Dónde ocurre

La descarga del feed se realiza **en el servidor**, nunca en el dispositivo. Hay dos razones y ambas son determinantes. La primera es de seguridad: el secreto del apartado 8 no debe distribuirse a los dispositivos. La segunda es de arquitectura: el modelo de sincronización (modelo de datos, 7.3) sitúa el registro canónico en el servidor y transmite a cada dispositivo únicamente el conjunto que le corresponde. Un evento importado es un cambio más en ese registro canónico, y desde ahí se propaga a los dispositivos por la vía ordinaria.

En consecuencia, el dispositivo no distingue un evento importado de uno manual en cuanto al mecanismo de llegada: ambos entran por la cola de sincronización. La diferencia está en su origen y en qué campos admite editar.

### 5.2 Reconciliación por identificador

Cada sincronización descarga el feed completo y lo compara con lo ya importado de esa fuente, tomando el identificador externo como clave. Resultan tres casos:

- **Alta.** Un identificador presente en el feed y ausente en el sistema crea un Evento nuevo.
- **Modificación.** Un identificador presente en ambos actualiza los campos de contenido del Evento existente. Los datos propios de la aplicación no se tocan (apartado 6).
- **Baja.** Un identificador que estaba y ha dejado de aparecer —o que llega con `STATUS:CANCELLED`— marca el Evento como **inactivo**. No se elimina físicamente, conforme al criterio de borrado lógico del modelo (1, "Borrado"), lo que permite conservar los datos propios asociados y reconstruir el histórico.

La operación es **idempotente**: sincronizar dos veces el mismo feed sin cambios no produce ningún efecto. Esta propiedad es la que permite ejecutarla con la frecuencia que convenga sin acumular basura.

### 5.3 Tolerancia a fallos

Si el feed resulta inalcanzable, llega incompleto o no se puede interpretar, la sincronización **conserva el último estado conocido** y registra el error en `estado_ultima_sincronizacion`. En ningún caso una descarga fallida da de baja eventos: un feed vacío por un error de red no puede interpretarse como que la familia ha cancelado todos sus viajes. La baja de un evento solo procede cuando una descarga correcta demuestra que el identificador ha desaparecido.

### 5.4 Cadencia

La sincronización automática se ejecuta **una vez al día**. La frecuencia guarda proporción con la latencia de la propia fuente —Google regenera el feed cada varias horas y los viajes se planifican con antelación—, de modo que un intervalo diario cubre el uso real sin carga inútil. Se complementa con una **sincronización a petición** desde la configuración del calendario, para el caso en que se quiera ver un cambio recién hecho sin esperar al ciclo diario.

### 5.5 Recurrencia

De un evento importado con regla de recurrencia (`RRULE`) se importa **únicamente su primera aparición**; las repeticiones se ignoran. Es un caso que no se espera en un calendario de viajes, y resolverlo así evita la complejidad de expandir instancias o de reconciliar una serie, a cambio de una pérdida de información sin relevancia práctica. Si en el futuro un calendario externo trajera recurrencias significativas, el tratamiento se revisaría entonces.

---

## 6. Datos propios sobre un evento importado

Un evento importado es un objeto de doble naturaleza: su **contenido** pertenece a Google y sus **datos propios de la aplicación** pertenecen al hogar. La sincronización actualiza lo primero sin tocar lo segundo.

### 6.1 Qué es editable

Sobre un evento importado, y conforme al apartado 4.2 de la Especificación Funcional, son editables el emoji, la asociación de regalos y la configuración de avisos. Para este calendario de viajes, sin embargo, **solo el emoji y los avisos entran en juego**: los viajes son informativos y no se les asocian regalos (apartado 6.2).

Estos datos se guardan asociados al **identificador externo** del evento, no a un identificador interno que la reconciliación pudiera recrear. Así sobreviven a las sucesivas sincronizaciones: si Google cambia el título o las fechas del viaje, el emoji elegido y la configuración de avisos permanecen.

### 6.2 Sin participantes ni regalos

En esta versión los viajes importados son **puramente informativos**. No llevan participantes ni regalos asociados, por dos razones convergentes.

La primera es de la fuente: el feed no identifica a las personas del viaje en términos que puedan corresponderse con el registro de Personas, de modo que **no hay participantes que derivar**. La segunda es de uso: el calendario recoge los viajes de Oscar, que no son ocasión de regalo. No se ofrece, por tanto, la asignación manual de participantes sobre un viaje importado.

La consecuencia es que la maquinaria de ocultación por destinatario no interviene aquí: sin destinatarios, no hay nada que ocultar. Los viajes son visibles para el hogar, que es el comportamiento buscado. Habilitar más adelante la asociación de regalos —si algún viaje llegara a serlo— no exige cambios en el modelo, que ya lo contempla; sí exigiría resolver antes la asignación de participantes, que hoy queda fuera de alcance.

---

## 7. Eventos de varios días

Un viaje es el caso arquetípico de evento de varios días, y su presentación ya está resuelta en el apartado 10.2 de la propuesta de UX: **barra continua** en el margen de cada día afectado, con las jornadas posteriores a la primera señaladas como continuación en lugar de repetirse como eventos nuevos. Esta integración no introduce nada al respecto; se limita a alimentar ese componente con datos reales.

El único punto de cuidado es el ya señalado en el apartado 4: en los eventos de jornada completa, iCalendar expresa la fecha de fin de forma **exclusiva**. Un viaje del 10 al 12 llega con `DTEND` igual al día 13. Si se presentara sin corregir, la barra continua se extendería un día de más. La resta de un día se realiza en la importación, de modo que la duración almacenada sea ya la real.

---

## 8. Seguridad y privacidad

La dirección privada del feed es una **credencial**. Quien la conoce lee el calendario de viajes de la familia sin más. De ahí un conjunto de reglas no negociables:

- **No se versiona.** La URL no aparece en el repositorio, ni en este documento ni en ningún otro. Se aprovisiona como secreto en el despliegue, igual que los datos semilla que incluyen fechas de nacimiento de menores.
- **No se distribuye al cliente.** La descarga es exclusivamente del servidor (5.1). El secreto no llega nunca a un dispositivo.
- **No se registra.** La URL no debe aparecer en trazas, registros de error ni telemetría. Un secreto en un registro es un secreto filtrado.
- **Es rotable.** Google permite restablecer la dirección privada del calendario, lo que invalida la anterior. Si el secreto se filtra, se rota en Google y se actualiza la configuración del despliegue; el `identificador_fuente` del calendario no cambia, de modo que la rotación no rompe la correspondencia de los eventos ya importados.

La información que este feed introduce en la aplicación —los viajes— es pública dentro del hogar por defecto (apartado 4). No porta reglas de visibilidad propias, y no debe inferirse ninguna de su origen.

---

## 9. Presentación

Un evento importado se muestra en la agenda **como uno más**. No lleva distintivo de procedencia en la fila: el emoji de avión y el título bastan para reconocerlo, y una etiqueta de "importado" sería ruido sin función. La única diferencia perceptible es que, al abrirlo para editar, los campos de contenido aparecen como no editables, con una indicación de que se corrigen en su calendario de origen.

El estado de la sincronización se refleja en el indicador discreto y permanente ya previsto para el conjunto de la aplicación (UX, 3, "Escritura local e indicador discreto"), sin modales ni bloqueos. Un fallo de descarga del feed no interrumpe el uso: la agenda sigue mostrando el último estado conocido.

---

## 10. Decisiones cerradas

Las decisiones que este documento dejaba abiertas quedan resueltas:

1. **Mecanismo de conexión: feed iCal** (apartado 2), frente a la API de Google Calendar.
2. **Cadencia: sincronización diaria**, más sincronización a petición (apartado 5.4).
3. **Recurrencia: se ignora**; de un evento recurrente se importa solo la primera aparición (apartado 5.5).
4. **Participantes y regalos: ninguno.** Los viajes importados son informativos en esta versión (apartado 6.2).
5. **Alcance: solo el calendario de viajes.** El modelo admite varias fuentes, pero no se conecta ni se generaliza ninguna otra por ahora. Si en el futuro se añade un calendario escolar o deportivo, cada uno se asociará a su tipo de evento por defecto sin cambios en este diseño; se revisará entonces.

No restan decisiones abiertas en esta iteración.

---

## 11. Realización

La integración se implementa dentro del Worker, que es donde vive el registro
canónico y desde donde manda la spec descargar el feed (apartado 5.1):

- **Descarga y reconciliación** en `api/src/viajes.js`, sobre el parser sin
  dependencias `api/src/ical.js`. El disparador es un **cron del propio Worker**
  (`[triggers]` en `api/wrangler.toml`, `scheduled()` en `api/src/index.js`),
  diario; más una ruta `POST /api/viajes/sincronizar`, autenticada con el token
  de servicio, para el "sincronizar ahora" de Ajustes.
- **El identificador del evento se deriva del UID** (`idDeViaje`), de modo que
  el "identificador externo" del apartado 6.1 y el `id` interno son el mismo: el
  emoji propio, que vive en la fila del evento, sobrevive a las sincronizaciones
  sin necesidad de una tabla de solapa aparte.
- **Detección de cambios por comparación de contenido**, no por `SEQUENCE`: los
  feeds de Google no lo pueblan de forma fiable. El importador solo reescribe
  —y con ello resella la última modificación— cuando algún campo de contenido
  difiere, y **nunca toca el emoji**.
- **La fuente es única y sembrada** por `api/migraciones/0014_viajes.sql`; no hay
  pantalla de gestión de calendarios (apartado 10). El secreto `VIAJES_ICAL_URL`
  se registra en el despliegue (`docs/despliegue-cloudflare.md` §2.2).
