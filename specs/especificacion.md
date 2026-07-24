# Agenda Familiar — Especificación Funcional

**Versión:** 0.8
**Fecha:** 24 de julio de 2026
**Documento complementario:** Agenda Familiar — Modelo de Datos y Flujos
**Alcance:** definición conceptual y funcional. El stack técnico queda fuera de este documento.

---

## 1. Propósito

La aplicación cubre cuatro necesidades del núcleo familiar que hoy están dispersas entre calendarios, mensajes y notas sueltas: la planificación compartida de eventos, la acumulación continua de ideas de regalo, la coordinación de las ocasiones en las que esos regalos se materializan, y la conservación del patrimonio verbal de la familia.

El principio rector es que la información se introduce una vez y se reutiliza en los distintos contextos. Una idea anotada en marzo debe estar disponible sin esfuerzo en diciembre, y una fecha de nacimiento registrada una vez debe generar el cumpleaños de todos los años sin intervención manual.

La primera versión incluye los cuatro módulos. El Anecdotario entra en alcance, si bien su especificación de detalle se aborda en una etapa posterior.

---

## 2. Personas y roles

El sistema mantiene un **registro único de Personas** que incluye a todo aquel que pueda recibir un regalo o aparecer en un evento. Cada persona lleva un atributo que indica si dispone o no de cuenta.

**Personas con cuenta.** Ana, Oscar y las hijas. Acceden mediante su identificador de Apple y participan de forma plena: crean eventos, aportan ideas, mantienen su lista de deseos y añaden entradas al anecdotario.

**Personas sin cuenta.** Padres, sobrinos y demás familia extendida. Existen como destinatarios y como sujetos de eventos —su cumpleaños aparece en la agenda—, pero no acceden a la aplicación.

La carga inicial del registro es manual. El volumen es reducido y una importación desde los contactos del teléfono arrastraría duplicados y datos irrelevantes que después habría que depurar uno a uno.

La ficha de cada persona acumula información que gana valor con el tiempo: fecha de nacimiento, parentesco, tallas, preferencias y restricciones. Estos atributos se introducen como pares de clave y valor de creación libre, con sugerencias a partir de los ya empleados en el hogar. Un catálogo cerrado envejecería mal, porque lo que conviene recordar de un sobrino de ocho años no se parece a lo que conviene recordar de un padre de setenta.

El histórico de regalos recibidos no se almacena en la ficha: se deriva por consulta sobre las ocasiones cerradas, de modo que no existe posibilidad de divergencia entre ambos.

Entre las personas con cuenta se distinguen dos roles. El **administrador** (Ana y Oscar) gestiona el registro de personas, el catálogo de categorías y sus reglas de visibilidad, la fusión de etiquetas y el panel de presupuesto. El **miembro** dispone de funcionalidad completa sobre los contenidos, sin capacidad de modificar la configuración del hogar.

Cuando una hija se independiza conserva su cuenta y su historial. La familia no deja de serlo por un cambio de domicilio, y la baja queda como decisión expresa de un administrador.

---

## 3. Modelo de visibilidad

Es el elemento estructural más delicado del diseño, porque un fallo aquí no produce un error visible sino que arruina una sorpresa. Se resuelve mediante dos mecanismos independientes que se aplican de forma acumulativa, más un conjunto de reglas derivadas que cierran las vías indirectas de filtración.

### 3.1 Visibilidad por categoría

Todo elemento de los módulos de Ideas y Ocasiones pertenece a una categoría. Cada categoría lleva asociada una de tres reglas:

- **Pública.** Visible para todas las personas con cuenta.
- **Restringida.** Visible únicamente para una lista explícita de personas con cuenta.
- **Privada.** Visible únicamente para los administradores.

Las categorías restringidas y privadas no aparecen en la interfaz de quien no tiene acceso. No se muestra un contenedor bloqueado, porque la existencia misma de la categoría es información.

**Catálogo inicial.** General, tecnología, libros y música, deporte, ropa y complementos, experiencias, y casa y cocina, todas ellas públicas; más una categoría privada destinada a la coordinación entre Ana y Oscar, que hace innecesario un espacio separado para los regalos entre ambos.

Conviene advertir que, con la ocultación por destinatario asumiendo el peso de la protección, la regla restringida apenas encuentra uso en la primera versión. Se conserva en el modelo por coste nulo, pero no forma parte del catálogo inicial.

### 3.2 Ocultación por destinatario

Cuando un elemento tiene un destinatario asignado, esa persona no lo ve, con independencia de la regla de la categoría. La regla no admite excepciones: se aplica también a los administradores, de modo que un regalo que Oscar registra para Ana queda oculto para ella aunque Ana administre la aplicación.

Un regalo tiene un destinatario principal, que determina en qué lista aparece, y puede marcarse además como compartido, incorporando a las demás personas implicadas. **La ocultación alcanza a todas ellas.** Un regalo conjunto para dos hermanas figura en la lista de una y queda oculto para ambas.

La regla solo tiene efecto sobre destinatarios con cuenta. Los regalos destinados a personas sin cuenta son visibles para todos los miembros, que es el comportamiento buscado: la lista de los abuelos debe poder consultarse y coordinarse sin restricción.

Los elementos ocultos desaparecen por completo. No se sustituyen por un marcador de tipo "reservado", ya que ese marcador revelaría la existencia del regalo y su destinatario. La única salvedad es el aviso genérico del apartado 3.6.

### 3.3 Regla resultante

Un elemento es visible para una persona con cuenta si, y solo si, la categoría se lo permite **y** esa persona no figura entre sus destinatarios.

### 3.4 Distinción entre deseo, idea y regalo asignado

Conviene separar con claridad tres objetos que se confunden con facilidad:

- El **deseo** es lo que una persona solicita para sí misma. Es visible para su autor y para el resto de miembros, y no se oculta nunca a quien lo escribe. No admite orden de prioridad: la lista de deseos es un conjunto de sugerencias, y jerarquizarla introduciría una negociación que no aporta nada.
- La **idea** es una sugerencia que alguien anota pensando en otro. Se rige por la ocultación por destinatario.
- El **regalo asignado** es la decisión de compra dentro de una ocasión concreta. Se rige igualmente por la ocultación por destinatario.

Cuando una persona registra una idea cuyo destinatario es ella misma, el sistema la trata como deseo y la encamina a su lista. De no hacerlo, la ocultación la haría desaparecer en el mismo momento de crearla.

### 3.5 Reglas derivadas

La ocultación solo funciona si se aplica de forma consistente en todas las vías por las que la información puede filtrarse. Cuatro se pasan por alto con facilidad:

**Las notificaciones heredan la visibilidad.** Si un miembro asocia un regalo al cumpleaños de otra persona, esa persona no recibe aviso alguno. La configuración por defecto refuerza esta protección: solo está activo el recordatorio previo al evento, y los avisos de modificación quedan desactivados.

**La búsqueda aplica el mismo filtro.** La búsqueda global de la primera versión cubre Ideas y Ocasiones, y evalúa la visibilidad sobre cada resultado antes de mostrarlo. Lo mismo rige para contadores y sumatorios.

**El sello de última modificación es engañoso.** Si alguien abre su propio cumpleaños y lee que se modificó hace dos minutos sin apreciar cambio alguno, la deducción es inmediata. El sello debe reflejar únicamente las modificaciones visibles para quien consulta.

**Los filtros de conveniencia no son controles de acceso.** El selector de regalos de un evento propone las ideas orientadas a los participantes. Es una ayuda de uso. La protección reside exclusivamente en la ocultación aplicada durante la sincronización. Un filtro de conveniencia se relaja en cuanto estorba; un control de acceso no admite excepciones.

### 3.6 El aviso sobre el contenido propio

Sobre su propio evento u ocasión, el destinatario ve un aviso en lugar de la ausencia total del bloque. **El aviso se muestra siempre**, exista o no contenido asociado: si apareciera solo cuando hay regalos, su ausencia a mediados de diciembre resultaría tan informativa como su presencia.

De esa decisión se deriva un requisito sobre la redacción. Una fórmula del tipo "hay sorpresas preparadas" sería falsa cuando no hay nada, y esa falsedad constituye por sí misma un dato. El texto no debe afirmar nada sobre el contenido. Se adopta **"Por aquí no se mira"**, cierta en ambos casos.

El aviso no muestra en ningún caso el número de regalos, sus categorías, sus autores, los importes ni la fecha de la última incorporación.

---

## 4. Módulo Agenda

Concentra los eventos familiares con relevancia compartida. La agenda es autónoma: no se superponen calendarios externos ni se sincroniza con el calendario del dispositivo. La aplicación contiene lo que es familiar y compartido, y no aspira a sustituir la agenda personal de nadie.

### 4.1 Evento

Cada evento registra título, tipo, fecha de inicio y fin, indicador de jornada completa, ubicación, personas implicadas, notas y regla de recurrencia. El catálogo inicial de tipos comprende cumpleaños, aniversario, viaje, competición, entreno, celebración, fecha escolar, cita médica y otro, y es ampliable por los administradores.

Los cumpleaños se generan de forma automática a partir de las fechas de nacimiento del registro de Personas, incluidas las de quienes no tienen cuenta. Estos eventos no se editan directamente: se corrigen desde la ficha de la persona, de modo que el dato maestro y su reflejo en la agenda no puedan divergir.

La repetición admite cuatro valores: sin repetición, semanal, mensual y anual, con fecha de fin opcional. La repetición semanal cubre el caso más frecuente en esta familia, que es el entrenamiento durante una temporada.

Se ofrecen tres vistas: mensual, lista cronológica y próximos eventos. Las notificaciones se configuran por evento; por defecto solo está activo el recordatorio previo.

Los eventos son públicos por defecto. Puede asignarse una categoría restringida cuando el evento en sí constituye una sorpresa, como la planificación de una celebración.

### 4.2 Orígenes de un evento

Todo evento procede de uno de tres orígenes, y el origen determina dónde se corrige.

**Manual.** Alguien lo crea en la aplicación. Editable sin restricción.

**Derivado.** Generado a partir de otro dato del sistema, como el cumpleaños que nace de una fecha de nacimiento. No se edita directamente: se corrige en la ficha de la persona, de modo que el dato maestro y su reflejo no puedan divergir.

**Importado.** Procedente de un calendario externo que se sincroniza, como un calendario de viajes. Se muestra como un evento más, pero su contenido se corrige en su origen.

Cada calendario importado se asocia a un tipo de evento en el momento de conectarlo. De ahí se deriva su presentación sin necesidad de reglas particulares por fuente.

De los tres orígenes, solo el manual admite edición completa. En los otros dos son editables el emoji, la asociación de regalos y la configuración de avisos, que son datos propios de esta aplicación y no del sistema de origen.

### 4.3 Tipos y emojis

Cada tipo de evento lleva asociado un emoji, que se aplica de forma automática al crearlo: pastel para un cumpleaños, avión para un viaje, trofeo para una competición, mochila para una fecha escolar.

El emoji no es decoración. En una fila de una sola línea es lo que permite reconocer un evento sin leerlo, y convierte la semana en algo que se abarca de un vistazo en lugar de leerse. Por eso lo asigna el sistema y no se pide al usuario: un campo obligatorio de emoji sería fricción, mientras que un emoji correcto por defecto es una ayuda gratuita.

Puede sustituirse en un toque desde una selección acotada de unas veinte opciones. No se abre el teclado completo de emojis: la variedad ilimitada convierte la semana en un mosaico ruidoso y destruye precisamente el reconocimiento que se buscaba.

Al no ser el emoji el único portador de significado —el título siempre está presente—, la lectura con VoiceOver no se ve afectada.

### 4.4 Regalos asociados a un evento

**No todos los eventos llevan regalos.** El formulario plantea la pregunta de forma explícita, y solo cuando la respuesta es afirmativa aparecen los campos correspondientes: ocasión vinculada, destinatario y regalos asociados. La respuesta se propone según el tipo —afirmativa en cumpleaños, aniversarios y celebraciones; negativa en entrenos, fechas escolares y citas— y siempre puede corregirse. Un entreno o una revisión del coche no deben mostrar campos que nunca se van a rellenar.

Cualquier miembro puede asociar regalos a un evento. El selector propone las ideas del banco orientadas a las personas participantes, lo que acota la búsqueda sin impedir la selección de cualquier otra idea.

**El bloque de regalos de un evento no es contenido único: se compone para cada observador.** En el cumpleaños de una hija, Ana y Oscar ven el mismo conjunto y ella ve el aviso del apartado 3.6. En un evento con varios participantes, como un viaje familiar, cada persona ve los regalos destinados a los demás y no los propios, de manera que ningún miembro contempla la misma lista.

Los regalos no residen en el evento, sino en la ocasión vinculada, conforme al apartado 6.4.

---

## 5. Módulo Ideas

Es un banco permanente, deliberadamente desacoplado de cualquier fecha u ocasión. Su valor reside en registrar la ocurrencia en el momento en que se produce, para recuperarla meses después.

### 5.1 Campos del objeto

**Obligatorios en la captura.** Título y autoría. El autor y la fecha de creación se registran de forma automática y no son editables.

**Recomendados.** Descripción en texto libre. Se exige al promover la idea a una ocasión, no al capturarla: una idea surge en segundos, a menudo en una tienda o en mitad de otra conversación, y exigir texto en ese instante hace que sencillamente no se registre.

**Opcionales.** Orientación de destinatario, categoría, rango de precio, enlace y establecimiento. La primera versión no admite imágenes ni adjuntos en ningún módulo; el enlace cubre la necesidad de referencia visual a un coste de desarrollo muy inferior.

**Automáticos.** Fecha de creación, autor, fecha de última modificación y estado.

### 5.2 Ciclo de vida

| Estado | Significado | Presencia en el banco |
|---|---|---|
| **Activa** | Estado inicial. Disponible para ser elegida. | Sí |
| **En curso** | Promovida a una ocasión concreta. | Sí, marcada con la ocasión |
| **Cerrada** | El regalo se entregó. | No, consultable en el histórico |
| **Descartada** | Ha dejado de ser válida. | No, se conserva consultable |

El diseño se sostiene sobre un principio: **solo dos transiciones son manuales**, el descarte y la reactivación. Las restantes se derivan de lo que ocurre en la ocasión vinculada, de modo que nadie mantiene el estado a mano. Es en ese mantenimiento donde este tipo de sistemas se degrada hasta quedar inservible.

El estado En curso mantiene la idea visible en el banco, señalada con su ocasión. Retirarla de la vista invitaría a que otra persona la registrase de nuevo por su cuenta.

Cerrada es terminal. Para reutilizar la misma idea con otro destinatario se emplea una acción de duplicado, que genera una idea nueva en estado Activa. Descartada revierte a Activa en cualquier momento.

### 5.3 Comentarios

Se admiten comentarios sobre ideas, regalos y eventos. Los eventos se incorporaron después de la decisión inicial: en la práctica, la coordinación de quién lleva el remolque o quién trae el postre ocurre alrededor de un evento y no de un regalo, y desviarla a otro canal vacía de contenido el propio evento. Se trata de una lista plana, sin respuestas anidadas ni menciones, con autor y fecha automáticos. Cada comentario solo puede editarlo o eliminarlo quien lo escribió.

Los comentarios heredan la visibilidad del objeto al que pertenecen, incluida la ocultación por destinatario. Al promover una idea a una ocasión, el hilo viaja con ella: perder la conversación en el momento de decidir la compra dejaría el módulo de Ocasiones sin el contexto que justificó la elección.

### 5.4 Orientación de destinatario

El campo "para quién" es opcional y admite indistintamente dos tipos de valor:

- Una **persona** del registro, con cuenta o sin ella.
- Una **etiqueta** descriptiva, cuando la idea encaja con un perfil pero no con alguien concreto: adolescente, aficionado a la cocina, viajero.

El campo admite varios valores, que pueden mezclar ambos tipos.

Las etiquetas son de creación libre. Al escribirlas se proponen las existentes que se aproximen, y los administradores disponen de una función de fusión que unifica duplicados reasignando todas las referencias. Un vocabulario controlado desde el inicio obligaría a anticipar categorías que solo se descubren con el uso; la fusión posterior corrige la dispersión sin frenar la captura.

Cuando el campo contiene una persona con cuenta, la idea queda oculta para ella de forma automática y permanente.

**Limitación conocida.** Las etiquetas no activan ocultación alguna, porque no identifican a nadie. Una idea etiquetada como "adolescente" es visible para vuestras hijas. Quien desee reservar una idea debe nombrar a la persona; la etiqueta clasifica, no protege. Conviene que la interfaz lo indique al introducir el dato.

### 5.5 Consulta

El banco se explora mediante filtros por persona, etiqueta, categoría y rango de precio, y a través de la búsqueda global. Cualquier idea puede promoverse a una ocasión con una única acción.

---

## 6. Módulo Ocasiones

Una ocasión es el contenedor de una campaña de regalos con fecha: Navidad 2026, el cumpleaños de una persona, un aniversario.

### 6.1 Estructura

Dentro de una ocasión, los regalos se organizan por destinatario. Cada persona que participe —con cuenta o sin ella— tiene su lista. Los datos son únicos y admiten dos presentaciones: agrupación por persona, natural en Navidad, o lista única con filtros, más práctica para revisar el estado de compra del conjunto.

Un miembro ve todas las listas salvo la suya propia, en cuyo lugar aparece el aviso del apartado 3.6.

Una ocasión nueva puede crearse duplicando otra anterior, lo que traslada la relación de personas participantes pero no los presupuestos ni los regalos. Los importes del año pasado son una referencia engañosa que induce a repetir sin revisar.

### 6.2 Regalo

Cada regalo registra su origen —promoción desde Ideas o creación directa—, destinatario principal, marca de compartido con las demás personas implicadas, responsable de la compra, coste real, estado de avance y categoría.

El coste real es opcional. Registrarlo tiene valor y exigirlo tiene un coste mayor: convertiría el marcado de una compra en un trámite y llevaría a no marcarla.

La asignación de responsable resuelve el problema práctico de la duplicidad. Cuando Ana marca un regalo como propio, Oscar lo ve asignado y no lo adquiere por segunda vez. La coordinación es visible para ambos y opaca para el destinatario.

### 6.3 Presupuesto

El presupuesto se fija por persona dentro de cada ocasión. No existe un importe global: el total de la ocasión se obtiene por suma, lo que evita el desajuste entre un techo general y el reparto individual.

Al ser opcional el coste real, el panel debe distinguir el gasto registrado del gasto total e indicar cuántos regalos carecen de importe. De no hacerlo mostraría una desviación favorable inexistente y el panel dejaría de merecer confianza.

El panel queda reservado a los administradores.

### 6.4 Vínculo con la agenda

Evento y ocasión son objetos distintos que se vinculan de forma opcional, uno a uno. Un cumpleaños es un evento de la agenda; los regalos de ese cumpleaños constituyen una ocasión. Se mantienen separados porque sus ciclos de vida difieren: el evento se repite cada año de forma automática y se consulta por su fecha, mientras que la ocasión se abre, se coordina, se cierra y agota su interés cuando los regalos se entregan.

El regalo reside siempre en la ocasión, que es su única fuente. El evento se limita a mostrarlo. Cuando un miembro asocia un regalo desde un evento que todavía no tiene ocasión vinculada, esta se crea de forma automática.

Navidad admite el mismo tratamiento: un evento el 25 de diciembre, vinculado a una ocasión que contiene las listas de todas las personas.

### 6.5 Cierre

Al cerrar una ocasión, sus regalos pasan a formar parte del histórico consultable de cada destinatario, que se deriva por consulta y no se almacena. Esto permite revisar en años sucesivos qué se regaló a cada persona, especialmente útil con la familia extendida.

---

## 7. Módulo Anecdotario

> **Especificación diferida.** El módulo forma parte del alcance de la primera versión, pero su definición de detalle se aborda en una etapa posterior. El contenido que sigue recoge la conversación inicial y no debe considerarse cerrado. Queda igualmente fuera del documento de modelo de datos.
>
> La importación desde el export de Facebook condiciona la estructura de datos del módulo, por lo que conviene cerrar esta especificación antes de iniciar la construcción.

Recoge el patrimonio verbal de la familia. Todos los miembros pueden añadir entradas, lo que lo convierte en un espacio colectivo y no en un archivo mantenido por los padres.

Se distinguen tres tipos de entrada. La **frase** registra algo dicho en un momento concreto. La **palabra propia** documenta un término inventado por la familia e incorpora su definición, formando un glosario doméstico. El **momento** describe una situación que merece conservarse aunque no se reduzca a una cita literal.

El contenido inicial procede de un export de Facebook y de notas personales. El proceso de importación no incorpora las entradas directamente: las presenta como propuestas en una bandeja de revisión, donde un miembro confirma o corrige la atribución y la fecha. La atribución automática resulta poco fiable y una corrección posterior es más costosa que una validación inicial.

---

## 8. Autenticación y acceso

El acceso se realiza exclusivamente mediante Sign in with Apple. No existen credenciales propias ni recuperación de contraseña, lo que elimina toda una categoría de incidencias de soporte.

Cada persona con cuenta accede desde su dispositivo. La incorporación se produce por invitación de un administrador, que vincula el identificador a la persona correspondiente del registro. Una persona sin cuenta puede pasar a tenerla más adelante sin pérdida de su historial, sin más que asociarle un identificador.

La aplicación gestiona un único hogar por instalación.

---

## 9. Funcionamiento sin conexión

La aplicación opera bajo un modelo local-first: toda lectura y escritura se realiza sobre el almacén local del dispositivo, y la sincronización se produce en segundo plano cuando hay conectividad. La experiencia no debe degradarse en ausencia de red.

**Consideración crítica.** La ocultación por destinatario debe aplicarse en el momento de la sincronización, no en la capa de presentación. El dispositivo de una persona nunca debe descargar los datos que le están ocultos. Filtrar únicamente en la interfaz dejaría la información en el almacén local, accesible por otras vías y persistente incluso sin conexión. Es el requisito no funcional de mayor importancia del sistema.

Dos consecuencias derivadas. Cuando alguien pasa a ser destinatario de un elemento que ya tenía sincronizado, ese elemento debe eliminarse de su almacén local en la siguiente conexión. Y el aviso del apartado 3.6 debe generarse en el dispositivo a partir de una condición estática, nunca de un recuento recibido del servidor, que constituiría por sí mismo el dato que se pretende ocultar.

La resolución de conflictos opera por campo, con criterio de última escritura. En los campos de coordinación —responsable de compra y estado del regalo— se conserva la versión descartada y se señala para revisión, dado que un conflicto en ese punto suele indicar que dos personas están actuando sobre el mismo regalo.

---

## 10. Principios transversales

La interfaz se presenta únicamente en castellano. No se contempla soporte multilingüe, ni siquiera como preparación estructural, dado que la totalidad del hogar comparte idioma.

La primera versión no admite imágenes ni adjuntos en ningún módulo.

No se contempla publicidad ni la cesión de datos a terceros.

La información se conserva de forma indefinida. No hay purga automática de elementos descartados ni de ocasiones cerradas: el valor de este sistema es acumulativo y una purga destruiría precisamente aquello que lo justifica.

Se ofrecen dos mecanismos de salvaguarda: una exportación completa bajo demanda de cualquier administrador, y una copia periódica automática. La primera protege frente al abandono de la aplicación; la segunda, frente al fallo.

---

## 11. Decisiones pendientes

1. Composición del registro inicial de Personas: quiénes entran, con cuenta y sin ella, y con qué fechas de nacimiento.
2. Especificación de detalle del módulo Anecdotario, incluida la estructura de la importación desde Facebook.
3. Confirmación del catálogo inicial de tipos de evento y de categorías propuestos en los apartados 4.1 y 3.1.
