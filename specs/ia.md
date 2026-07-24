# Agenda Familiar — Funciones de IA

**Versión:** 0.1
**Fecha:** 24 de julio de 2026
**Documentos complementarios:** Stack Tecnológico (apartado 8, Pasarela a la API de Claude) · Especificación Funcional · Modelo de Datos y Flujos · Plan Semanal por WhatsApp
**Alcance:** define **qué** funciones de la aplicación se apoyan en la API de Claude, con **qué entrada**, **qué salida** y **qué reglas**. La infraestructura —la pasarela en el Worker, la clave como secreto, el control de gasto— se especifica en el documento del Stack y aquí se da por conocida.

---

## 1. Propósito

La IA no es un módulo nuevo: es un **auxiliar de los módulos existentes**. No introduce datos propios ni sustituye ninguna funcionalidad; toma información que ya vive en la agenda y produce texto o sugerencias que ahorran trabajo de redacción o de recuerdo. El principio rector es de **asistencia, no de autoridad**: la IA propone, la persona dispone. Salvo una excepción acotada (el plan semanal, apartado 5), nada de lo que genera la IA se guarda ni se envía sin que un miembro lo revise.

La primera versión contempla tres funciones, cada una anclada a un módulo ya especificado. El resumen del Anecdotario entra en alcance pero queda condicionado a que se cierre su especificación funcional.

---

## 2. Principios comunes

Estas reglas gobiernan **todas** las funciones de IA y no dependen de cuál se implemente primero.

**La IA no escribe en la base de datos.** Produce texto o sugerencias que el usuario convierte en entidades mediante la captura normal —optimista, local, offline—. La IA nunca crea, modifica ni borra registros por su cuenta. La única excepción es el plan semanal, cuyo texto va directo al canal de WhatsApp; por eso su contenido factual se blinda (apartado 5).

**El prompt se ensambla en el servidor, con el mismo filtro de visibilidad que la sincronización.** Ninguna función recibe datos que la persona solicitante no podría ver en la aplicación. El modelo de visibilidad del sistema (público / restringido / privado) se aplica **antes** de construir la petición a Claude, no después. Esto es especialmente crítico en la sugerencia de regalos: una sorpresa oculta jamás debe entrar en un prompt que devuelve texto al dispositivo de quien no debe verla.

**Autenticación obligatoria.** Toda llamada pasa por la pasarela autenticada del apartado 8 del Stack. Las funciones de la app se autorizan con el token de sesión de la persona (Sign in with Apple); el plan semanal, que corre desatendido, se autoriza con un **token de servicio** propio del despachador (apartado 5).

**Online-only, degradación elegante.** Las funciones de IA requieren red y **no se encolan** como las mutaciones de datos. La interfaz las ofrece cuando hay conexión y las oculta o deshabilita sin ella, sin tocar el camino principal de escritura, que sigue siendo instantáneo y offline.

**Modelo y parámetros los fija el servidor.** El cliente invoca una función («sugiéreme regalos para esta persona»), no un modelo. El Worker mapea cada función a un modelo, un tope de `max_tokens` y un límite de uso. La app no codifica identificadores de modelo.

**Minimización de datos.** A la API solo se envía lo estrictamente necesario para la función. No se envían identificadores internos ni atributos que no aporten a la tarea. Véase el apartado 7 sobre el envío de datos personales a un servicio externo.

---

## 3. Función 1 — Sugerir ideas de regalo

**Módulo:** Ideas / Personas.

**Qué hace.** Desde la ficha de una persona (o desde el módulo de Regalos orientado a ella), ofrece una lista breve de ideas de regalo adecuadas a esa persona.

**Entrada** (ensamblada en el servidor, filtrada por visibilidad):

- Atributos de la ficha relevantes: edad o franja de edad, parentesco, aficiones, tallas, restricciones (alergias, cosas a evitar).
- Ideas ya registradas para esa persona, para **no duplicar**.
- Histórico de regalos de sus ocasiones cerradas, para **no repetir** lo ya regalado.

**Salida.** Una lista de sugerencias en texto. El usuario elige cuáles convertir en **Ideas** mediante la captura rápida; la sugerencia no se guarda por sí sola.

**Visibilidad.** La sugerencia hereda la visibilidad del contexto desde el que se invoca —típicamente la categoría de la idea que el usuario vaya a crear—. La IA solo ha recibido datos que el solicitante puede ver, de modo que ninguna sorpresa oculta se filtra ni de entrada ni de salida.

**Modelo.** Predeterminado `claude-opus-5` (la calidad de la sugerencia es el valor de la función); evaluable a `claude-sonnet-5` si el coste lo aconseja.

---

## 4. Función 2 — Resumir el Anecdotario

**Módulo:** Anecdotario (previsto en la primera versión; su especificación de detalle es etapa posterior).

**Qué hace.** Recopila y resume entradas del anecdotario —por persona, por tema o por periodo— para producir una lectura continua a partir de fragmentos sueltos.

**Entrada.** Las entradas del anecdotario que correspondan al criterio, respetando la visibilidad.

**Salida.** Un texto de resumen o recopilación. Como el resto, se muestra para revisión; no se guarda automáticamente.

**Modelo.** `claude-sonnet-5` o `claude-opus-5` según la longitud y la calidad buscada.

**Condición.** Esta función **depende de que se cierre la especificación funcional del Anecdotario** (entidades, campos, reglas de visibilidad). Queda definida a nivel de intención; su detalle se completará cuando exista ese documento.

---

## 5. Función 3 — Redactar el plan semanal

**Módulo:** Plan Semanal por WhatsApp.

**Qué hace.** Da una redacción más natural y legible al mensaje del domingo, a partir de los eventos de la semana entrante que ya produce el generador del plan.

**Entrada.** La lista **estructurada** de eventos de la semana (qué, quién, cuándo), ya derivada de la agenda y ya recortada según las reglas del documento del plan semanal.

**Salida.** El texto plano del mensaje, listo para el despachador.

**Excepción al principio general.** Este es el único caso en que la salida de la IA se **envía sin revisión humana**: va directa al grupo de WhatsApp. Por eso el contenido factual se blinda:

- La IA reescribe **el estilo**, no los datos. Recibe los eventos como datos estructurados y produce prosa; tiene instrucción estricta de no inventar, no añadir ni omitir eventos, y no alterar fechas, horas ni destinatarios.
- Se valida que el número de eventos del texto coincide con el de la entrada. Si la validación falla o la API no responde, **se cae a la plantilla determinista** —el mensaje se envía igual, con la redacción mecánica de siempre—. La IA es una mejora, nunca un punto único de fallo del envío.

**Dónde corre.** El generador del plan (workflow de GitHub Actions, según el documento del despachador) llama a la pasarela con un **token de servicio**, no con una sesión de usuario. Es el mismo punto de autoridad del apartado 8 del Stack, con un segundo tipo de llamante.

**Modelo.** Económico: `claude-haiku-4-5` o `claude-sonnet-5`. El texto es corto y de formato acotado; no requiere el modelo más capaz.

**Decisión abierta.** Si la redacción por IA es el comportamiento por defecto cada semana o una opción activable. Dado que la caída a plantilla es automática, puede activarse por defecto sin riesgo de que un fallo bloquee el envío.

---

## 6. Resumen de funciones

| Función | Módulo | Entrada (filtrada por visibilidad) | Salida | ¿Escribe en BD? | Modelo por defecto |
|---|---|---|---|---|---|
| Sugerir regalos | Ideas / Personas | Atributos de la ficha, ideas previas, histórico de ocasiones | Lista de ideas para captura | No (el usuario confirma) | `claude-opus-5` |
| Resumir anecdotario | Anecdotario | Entradas del anecdotario | Texto de resumen | No | `claude-sonnet-5` |
| Redactar plan semanal | Plan Semanal | Eventos estructurados de la semana | Texto del mensaje | No (va al despachador) | `claude-haiku-4-5` |

---

## 7. Privacidad y datos enviados a un servicio externo

La API de Claude es un servicio externo. Estas funciones envían fuera de la infraestructura del hogar información que puede incluir datos personales de la familia, incluidos menores (fechas de nacimiento, tallas, restricciones). Es una decisión consciente, con mitigaciones:

- **Minimización.** A cada llamada solo se envían los campos que la función necesita. No se envían identificadores internos, apellidos completos ni atributos irrelevantes para la tarea.
- **Sin persistencia añadida.** La IA no crea un almacén nuevo; opera sobre datos que ya existen en la agenda y devuelve texto efímero.
- **Filtrado de visibilidad previo.** Nunca se envía a la API contenido que el solicitante no podría ver.

**Decisiones abiertas** que conviene fijar antes de implementar:

- Si se anonimizan o generalizan ciertos campos antes de enviarlos (por ejemplo, «niño de 8 años aficionado al fútbol» en lugar de nombre y fecha exacta), cuando la función no pierde valor por ello.
- Qué condiciones de retención de la API son aceptables para el hogar.

Estas cuestiones se cierran en la implementación de cada función, no en este documento.

---

## 8. Encaje con el resto del sistema

- **Con la pasarela (Stack, apartado 8):** todas las funciones son clientes de ese endpoint. Introduce un segundo tipo de llamante autorizado —el token de servicio del despachador— además de las sesiones de usuario.
- **Con la visibilidad (Especificación, apartado 3):** la IA se somete al mismo filtro que la sincronización; no abre ninguna vía nueva de filtración de sorpresas.
- **Con el offline-first (UX):** las funciones de IA viven fuera del camino de escritura local; su ausencia sin red no degrada la operación básica de la aplicación.
- **Con el plan semanal:** resuelve la redacción del mensaje sin cambiar el origen del contenido, que sigue siendo la agenda leída en el momento del envío.
