# Agenda Familiar — Calendario de Viajes (Integración)

**Versión:** 0.1
**Fecha:** 24 de julio de 2026
**Documentos complementarios de:** Especificación Funcional · Modelo de Datos y Flujos · Propuesta de Experiencia de Usuario
**Alcance:** especificación funcional y de datos de la primera fuente de eventos importados, un calendario de viajes de Google. Define qué se importa, cómo se corresponde con el modelo existente y cómo se sincroniza. El stack técnico queda fuera del documento.

---

## 1. Propósito y encaje

El calendario de viajes es la primera materialización del origen **Importado** descrito en el apartado 4.2 de la Especificación Funcional. No introduce un concepto nuevo: el modelo ya prevé la entidad **CalendarioExterno** (modelo de datos, 2.4), el origen **importado** del evento y el tipo de evento **viaje** con su emoji de avión. Este documento cierra el detalle que aquellos dejaban abierto.

La familia mantiene ya sus viajes en un calendario de Google compartido. El objetivo no es trasladar esa gestión a la aplicación, sino **reflejarla**: que los viajes aparezcan en la semana junto al resto de la vida familiar, y que sobre ellos puedan colgarse los datos propios de esta aplicación —regalos, avisos, emoji—. La planificación del viaje sigue ocurriendo en Google; la agenda lo muestra.

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
| `RRULE` | regla de recurrencia | Poco frecuente en viajes; se contempla en el apartado 10 |
| `STATUS:CANCELLED` | evento inactivo | Se trata como una baja (apartado 5.2) |
| `SEQUENCE` / `LAST-MODIFIED` | — | Se emplean para detectar cambios, no se almacenan como contenido |
| — | emoji | El del tipo **viaje** (avión). Sustituible en la aplicación, como dato propio (apartado 6) |
| — | tipo de evento | **viaje**, heredado del CalendarioExterno |
| — | participantes | **No se derivan del feed** (apartado 6.2) |
| — | categoría | Pública. Un calendario importado no porta reglas de visibilidad |

**Zonas horarias.** Las entradas con hora llegan referidas a una zona (`TZID`) o en UTC (`Z`). La conversión a la zona local debe realizarse en la importación y no en la presentación, para que la fecha con la que un evento se sitúa en la semana sea inequívoca. Los eventos de jornada completa carecen de zona: son fechas flotantes y no deben desplazarse por conversión alguna.

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

La frecuencia de sincronización debe guardar proporción con la latencia de la propia fuente: descargar cada pocos minutos un feed que Google regenera cada varias horas no aporta frescura y sí carga inútil. Una cadencia del orden de unas pocas horas, con la posibilidad de una sincronización a petición desde la configuración del calendario, cubre el uso real. El valor concreto queda como decisión pendiente (apartado 10).

---

## 6. Datos propios sobre un evento importado

Un evento importado es un objeto de doble naturaleza: su **contenido** pertenece a Google y sus **datos propios de la aplicación** pertenecen a la familia. La sincronización actualiza lo primero sin tocar lo segundo.

### 6.1 Qué es editable

Sobre un evento importado, y conforme al apartado 4.2 de la Especificación Funcional, son editables únicamente:

- el **emoji**, que por defecto es el del tipo viaje;
- la **asociación de regalos**, es decir, el vínculo con una ocasión y los regalos que cuelguen de ella;
- la **configuración de avisos**.

Estos datos se guardan asociados al **identificador externo** del evento, no a un identificador interno que la reconciliación pudiera recrear. Así sobreviven a las sucesivas sincronizaciones: si Google cambia el título del viaje, el emoji elegido, la ocasión vinculada y los avisos permanecen.

### 6.2 Participantes y su consecuencia sobre la ocultación

El feed no identifica a las personas del viaje en términos que puedan corresponderse con el registro de Personas. Por tanto, **un evento importado no lleva participantes de forma automática**.

Esto tiene una consecuencia que conviene explicitar, porque afecta a la pieza más delicada del sistema. La composición del bloque de regalos de un evento y la ocultación por destinatario se apoyan en los participantes del evento (Especificación Funcional, 4.4). Un viaje importado sin participantes no propone destinatarios en el selector de regalos ni acota nada; la protección sigue residiendo, como siempre, en la función de visibilidad aplicada a cada regalo, no en el evento. Un miembro que quiera vincular regalos a un viaje —por ejemplo, un regalo de aniversario que se entrega durante el viaje— puede asignar los participantes manualmente, y esa asignación es un dato propio de la aplicación, editable y persistente. El modelado de esa asignación manual sobre eventos importados queda como decisión pendiente (apartado 10).

### 6.3 Baja en origen con datos propios asociados

Si un viaje se elimina en Google pero tenía una ocasión vinculada con regalos, el evento se marca inactivo (5.2) y **la ocasión persiste**. Es coherente con el modelo: el regalo reside en la ocasión, que es su única fuente, y el evento se limita a mostrarlo (Especificación Funcional, 6.4). Perder los regalos porque un viaje se reprograma en Google sería destruir trabajo de coordinación por un cambio ajeno a él.

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

## 10. Decisiones pendientes

El **mecanismo de conexión queda confirmado: feed iCal** (apartado 2). Restan las siguientes:

1. **Cadencia de sincronización.** Fijar el intervalo concreto, proporcionado a la latencia de regeneración del feed (apartado 5.4).
2. **Participantes en eventos importados.** Decidir si se ofrece —y cómo se modela— la asignación manual de participantes del registro de Personas sobre un viaje importado, requisito para vincularle regalos con ocultación por destinatario (apartado 6.2).
3. **Recurrencia importada.** Definir el tratamiento de un evento importado con `RRULE`. Es un caso improbable en un calendario de viajes, pero el feed puede contenerlo y conviene no dejarlo indefinido.
4. **Varios calendarios externos.** El modelo admite más de una fila de CalendarioExterno. Si en el futuro se conectan otros calendarios —escolar, deportivo—, cada uno se asocia a su tipo de evento por defecto; no requiere cambios en este diseño, pero conviene confirmarlo cuando llegue el caso.
