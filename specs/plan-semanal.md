# Plan Semanal por WhatsApp — Especificación Funcional

**Versión:** 0.1
**Fecha:** 24 de julio de 2026
**Documentos complementarios:** Despachador de mensajes de WhatsApp con GitHub Actions · Agenda Familiar — Especificación Funcional · Agenda Familiar — Modelo de Datos y Flujos
**Alcance:** el envío automático, cada domingo, de un resumen de la semana entrante al grupo familiar de WhatsApp. Este documento define **qué** se envía, con **qué reglas** y **de dónde** procede el contenido. La infraestructura de despacho —cola, workflow, CallMeBot— se especifica en el documento del despachador y aquí se da por conocida. La forma concreta de acoplamiento con esa infraestructura queda como decisión abierta y se trata, sin cerrarse, en el apartado 9.

---

## 1. Propósito

La Agenda Familiar es un sistema de consulta: alguien abre la aplicación y ve lo que viene. Cubre bien la pregunta formulada, pero no la que nadie formula. Buena parte del valor de una agenda compartida no está en poder consultarla, sino en que llegue sin pedirla.

Este documento especifica ese complemento: un único mensaje semanal, enviado el domingo al grupo de WhatsApp de la familia, con el plan de los siete días siguientes. No sustituye a la aplicación ni compite con ella. La aplicación es el registro completo y editable; el mensaje es un vistazo pasivo que se recibe con el teléfono en la mano un domingo por la tarde, sin abrir nada.

El principio rector es de asimetría deliberada: **la aplicación tira, el mensaje empuja.** Quien quiera el detalle abre la agenda; quien solo quiera saber si hay algo el sábado lo lee en la notificación. Un canal que la mayoría de la familia ya mira a diario hace el trabajo que una aplicación, por buena que sea, no puede hacer: aparecer sin ser invocada.

---

## 2. Encaje en el conjunto

Tres piezas, con responsabilidades separadas:

| Pieza | Responsabilidad |
|---|---|
| Agenda Familiar (app iOS) | Registro canónico de eventos. Se consulta y se edita. |
| Este documento | Define el resumen semanal: qué contiene y qué reglas lo gobiernan. |
| Despachador de WhatsApp | Transporte. Entrega el mensaje al grupo vía CallMeBot. |

El plan semanal es, en esencia, una **vista de la agenda expresada como texto y entregada por un canal distinto**. No introduce datos nuevos: los eventos ya existen en la agenda. Introduce un momento —el domingo— y un formato —un mensaje plano—, y sobre todo introduce una regla de recorte que no existía mientras el contenido vivía dentro de la aplicación, y que constituye el núcleo de este documento (apartado 5).

---

## 3. Cadencia y momento

**El domingo por la tarde.** La semana es la unidad real de la vida familiar, y el domingo es el momento en que esa unidad se piensa: qué hay de lunes a domingo, quién tiene entreno, si el sábado hay torneo, si toca comida con los abuelos. Enviar el plan antes de ese momento lo desperdicia; enviarlo después llega tarde para organizarse.

La ventana de «tarde del domingo» es suficiente. Igual que en el resto del sistema, no se busca precisión al minuto: un mensaje que llega a las 18:00 o a las 18:40 cumple idéntica función. Esto encaja con las restricciones de puntualidad del despachador, que sondea y despacha lo vencido en lugar de disparar a una hora exacta.

**La semana que se describe es la entrante**, de lunes a domingo, no la que termina esa misma noche. El domingo por la tarde el interés está por completo en lo que viene.

**Zona horaria `Europe/Madrid`**, con resolución automática del horario de verano, en coherencia con el despachador.

---

## 4. Origen del contenido

El contenido procede de una única fuente: los eventos de la Agenda Familiar cuya fecha cae dentro de la semana entrante. No hay composición manual ni edición previa al envío; el mensaje es un derivado mecánico del estado de la agenda en el momento de generarse.

Se incluyen los eventos de cualquier origen —manual, derivado o importado— sin distinción, porque para el lector la procedencia es irrelevante: un cumpleaños generado a partir de una fecha de nacimiento y una cita creada a mano son, en el plan, la misma clase de línea.

De cada evento, el mensaje toma únicamente su **cara pública**: día, hora si la tiene, título, emoji del tipo y, cuando aporta, las personas implicadas. No toma nada más. En particular, no toma absolutamente nada de la dimensión de regalos —ocasión vinculada, destinatario, presupuesto, estado de compra—, que en este canal no existe.

---

## 5. La regla de visibilidad — consideración crítica

Es el apartado que justifica que este resumen merezca un documento propio y no una nota al pie en el del despachador. Un error aquí no produce un fallo visible: **arruina una sorpresa**, que es el modo de fallo grave de todo el sistema.

**El problema.** Dentro de la aplicación, el bloque de regalos de un evento se compone para cada observador: Ana ve los regalos de la hija, la hija ve el aviso «Por aquí no se mira». Esa protección se apoya en que cada dispositivo recibe una vista distinta. **El mensaje de WhatsApp no admite esa composición.** Es una difusión única: el mismo texto llega a la vez a todos los miembros del grupo, incluidas las hijas, que son precisamente las personas a quienes hay que ocultar las sorpresas. No hay un mensaje por persona; hay un mensaje.

**La consecuencia.** Al no poder componerse por destinatario, el plan solo puede contener aquello que sea seguro para **el lector más restringido** del grupo. Lo que en la aplicación se resuelve mostrando cosas distintas a cada uno, aquí se resuelve mostrando a todos únicamente la **intersección** de lo que cada uno puede ver.

De ahí dos reglas, que el generador aplica sin excepción:

**Primera: los regalos no existen en este canal.** El plan no menciona jamás una ocasión, un regalo, un destinatario de regalo, un presupuesto ni un estado de compra. No se recorta esa información: sencillamente no se lee. La fuente del mensaje es la agenda de eventos, no el módulo de Ocasiones.

**Segunda: los eventos reservados se excluyen por completo.** Un evento que pertenece a una categoría restringida o privada —los que son *en sí mismos* una sorpresa, como la planificación de una celebración— no aparece en el plan. No se sustituye por un hueco ni por una línea genérica: desaparece, exactamente igual que desaparece en la agenda de quien no debe verlo. Su sola presencia, aun sin detalle, sería información.

**Lo que sí aparece, y conviene no confundir.** Un cumpleaños es un evento público: figura en la agenda de todos, incluida la persona que cumple años. Por tanto **sí** aparece en el plan —«sábado, cumpleaños de la abuela»—. Lo que no aparece es lo que cuelga de él por el lado de los regalos, que vive en otro módulo y nunca se lee. La cara pública del evento es segura; la dimensión de regalos no entra en el canal. Distinguir ambas cosas es lo que permite que el plan sea a la vez útil y hermético.

**Formulación operativa.** Un evento entra en el plan si, y solo si, su categoría es pública. La comprobación es la misma función de visibilidad del sistema, evaluada con un observador que representa al conjunto del grupo: si el evento estuviera oculto para *cualquiera* de los destinatarios, no entra. Como no se puede afinar por persona, se toma el mínimo común. El plan es, por diseño, **menos completo que la vista semanal que cada miembro ve dentro de la aplicación**, y esa incompletitud es correcta: es el precio de un canal de difusión única, y se paga a favor de la seguridad.

---

## 6. Composición del mensaje

El mensaje reproduce en texto el marco fijo de siete días de la vista de semana: una fila por día, los días vacíos incluidos. La forma constante hace que la lectura sea casi automática y que los días libres informen tanto como los ocupados —enseñan la forma de la semana— en lugar de omitirse.

WhatsApp admite texto plano con saltos de línea y un marcado ligero (`*negrita*`). El generador se limita a eso; no hay tablas ni alineaciones que un cliente móvil rompería.

Esquema:

```
*Plan de la semana*
28 jul – 3 ago

L 28  🏇 Entreno de hípica · 18:00
M 29  —
X 30  —
J 31  🩺 Dentista (Ana) · 10:00
V  1  —
S  2  🎂 Cumpleaños de la abuela
D  3  🍽️ Comida con los abuelos · 14:00
```

Decisiones de formato:

- **Una línea por evento.** Emoji, título recortado, hora si la tiene. El emoji cumple aquí la misma función que en la agenda: permite reconocer un evento sin leerlo y convierte la semana en algo que se abarca de un vistazo.
- **Días vacíos con un guion.** Presentes y marcados, nunca omitidos.
- **Techo de tres eventos por día.** A partir del cuarto, una línea de resumen —«y 2 más»— en lugar de un muro de texto. El recuento de ese resumen se calcula, igual que en la aplicación, solo sobre los eventos visibles: nunca debe delatar la existencia de un evento reservado que se excluyó.
- **Sin enlaces ni identificadores.** El mensaje es de lectura, no de navegación. Quien quiera actuar abre la aplicación.
- **Emojis de tipo, no libres.** Se reutiliza la asignación por defecto de la agenda, acotada. La variedad ilimitada convertiría el mensaje en un mosaico ruidoso.

El conjunto debe caber en una pantalla de móvil sin desplazamiento en una semana normal. Es un resumen, no un boletín.

---

## 7. La semana sin eventos

Cuando la semana entrante no tiene ningún evento público, **el mensaje se envía igualmente**, con una línea que lo declara:

```
*Plan de la semana*
28 jul – 3 ago

Sin nada en el calendario esta semana.
```

Se envía siempre por la misma razón por la que el aviso «Por aquí no se mira» está siempre presente: la regularidad construye el hábito. Si el mensaje solo llegara las semanas con contenido, su ausencia una tarde de domingo sería ambigua —¿semana vacía o envío fallido?— y la familia dejaría de confiar en él. Un canal en el que se confía llega también para decir que no hay nada.

Hay además una razón de hermetismo: una semana que se salta el envío por «no tener nada visible» podría, en el límite, delatar que lo único que contenía era un evento reservado que se excluyó. Enviar siempre cierra esa vía.

---

## 8. Destinatarios

El mensaje se dirige al conjunto de la familia mediante el mapa `RECIPIENTS_JSON` que ya emplea el despachador. El campo `to` admite una lista, de modo que un mismo texto se reparte entre todos los destinatarios en una sola entrada.

El destinatario natural es el grupo familiar completo, hijas incluidas. Es justamente por incluirlas por lo que la regla del apartado 5 no es negociable: el plan se diseña seguro para ellas, no se les oculta el plan.

---

## 9. Integración con el despachador *(decisión abierta)*

Este apartado enmarca la integración sin cerrarla; su resolución es la primera de las decisiones pendientes. La cuestión de fondo es **dónde se genera el texto** y **cuánta antelación** media entre generarlo y enviarlo, porque de esa antelación depende que el plan refleje o no los cambios de última hora en la agenda.

**Opción A — Pre-generación desde la app y encolado.** Un dispositivo designado compone el texto del plan y lo escribe en `queue.json` con `send_at` en el próximo domingo y `repeat: "semanal"`. El despachador lo trata como un mensaje más. *A favor:* no exige infraestructura nueva; reutiliza el despachador tal cual. *En contra:* el contenido queda congelado en el momento de encolarlo; si la semana cambia entre el jueves y el domingo, el mensaje sale desactualizado. Además ata la generación a que un dispositivo concreto se ejecute, lo que contradice la premisa del despachador de mantener el teléfono fuera del camino crítico.

**Opción B — Generación en el momento del envío, desde el registro canónico.** Un segundo workflow programado para el domingo lee los eventos de la semana entrante del registro canónico de la agenda, aplica la regla de visibilidad, compone el texto y lo entrega. *A favor:* el plan refleja el estado real de la agenda en el instante del envío; nada se congela. *En contra:* exige que el backend canónico de la agenda exponga de forma consultable los eventos públicos de un rango de fechas, interfaz que hoy no está especificada.

**Opción C — Híbrida (dirección recomendada).** La **generación** vive con el registro canónico (como en B), porque el contenido es automático y sensible a los cambios de última hora; la **entrega** reutiliza el transporte del despachador —`RECIPIENTS_JSON` y el envío por CallMeBot— pero no su cola, que está pensada para mensajes que un humano compone y programa. El plan no es eso: es un derivado que se recalcula cada semana. Separar generación de transporte deja cada pieza en su sitio.

La recomendación es la opción C, con una salvedad de calendario: mientras el backend canónico no exponga la consulta de eventos por rango, la opción A es un puente legítimo que permite arrancar sin bloquear, a cambio de asumir la desactualización. La elección definitiva se pospone —«luego miramos cómo integrarlo»— y depende del estado del backend cuando se aborde la construcción.

Sea cual sea la opción, **la regla de visibilidad del apartado 5 se aplica en la generación**, nunca en la presentación, en coherencia con el principio del sistema de no dejar que un dato oculto llegue siquiera a componerse en un mensaje que va a salir.

---

## 10. Robustez y fallos

**Envío perdido.** Si el envío del domingo falla o el sondeo se retrasa, se aplica una ventana de gracia acotada, como en el despachador. Un plan semanal que llegara el martes, con dos días de la semana ya consumidos, pierde su sentido; la gracia debe cubrir un retraso de horas, no de días. Un domingo perdido no es catastrófico: la aplicación sigue siendo la fuente completa y el envío se reanuda al domingo siguiente.

**Fuente no disponible.** Si en el momento de generar no se puede leer la agenda —backend caído en la opción B/C, dispositivo ausente en la A—, no se envía un mensaje vacío ni erróneo: se omite el envío de esa semana y queda constancia en la traza. Un mensaje incorrecto es peor que un mensaje ausente, sobre todo si el error consistiera en incluir algo que debía excluirse.

**Auditoría.** Igual que en el despachador, el historial de ejecuciones es la auditoría: qué semana se envió, con qué contenido y con qué resultado, sin instrumentación adicional.

---

## 11. Limitaciones asumidas

- Precisión de «la tarde del domingo», no al minuto. Adecuada para un resumen semanal.
- El plan es deliberadamente menos completo que la vista semanal de cada miembro dentro de la aplicación: solo contiene eventos públicos. Es el precio del canal de difusión única y se paga a favor del hermetismo.
- El mensaje es de lectura. No permite editar ni confirmar; para actuar se abre la aplicación.
- Hereda las limitaciones del transporte: CallMeBot es un servicio gratuito de un tercero sin compromiso de disponibilidad, y los mensajes llegan desde el número del bot.

---

## 12. Decisiones pendientes

1. **La integración con el despachador (apartado 9): opción A, B o C.** Depende de si el backend canónico de la agenda expone la consulta de eventos públicos por rango de fechas en el momento de construir esta pieza. Es la decisión de la que penden todas las demás.
2. La hora concreta del domingo y la amplitud de la ventana de gracia.
3. El marcador exacto de los días vacíos y el texto de la semana sin eventos, sujetos a prueba con mensajes reales en un cliente de WhatsApp.
4. Si el plan debe distinguir de algún modo los eventos de varios días —un torneo o un viaje que cruza varias jornadas— o basta con repetir la línea en cada día afectado.
