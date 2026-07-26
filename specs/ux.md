# Agenda Familiar — Propuesta de Experiencia de Usuario

**Versión:** 0.5
**Fecha:** 24 de julio de 2026
**Documentos complementarios:** Especificación Funcional · Modelo de Datos y Flujos

---

## 1. Criterios de evaluación

Las cinco opciones se han construido y contrastado con los mismos criterios, tomados de las guías de referencia del sector y recogidos en el apartado 9.

**Reconocimiento antes que memoria.** El usuario no debe recordar nada para operar. Al asignar un destinatario se muestran las personas con su iniciativa y su próxima ocasión, no un campo de texto en el que escribir un nombre.

**Divulgación progresiva.** Se presenta lo esencial y se difiere lo secundario. La captura de una idea pide un título; el resto de campos aparece solo si se piden.

**Coherencia con la plataforma.** Barra de pestañas para las secciones de primer nivel y nunca para acciones, entre tres y cinco en iPhone, navegación jerárquica para el detalle y presentación modal para las tareas puntuales.

**Prevención del error antes que su mensaje.** Un error bien redactado es peor que un error imposible. En este producto, el error grave es revelar una sorpresa.

**Interfaz optimista.** La escritura es local e inmediata. No hay indicadores de espera en el camino principal, porque una aplicación que hace esperar sin red se percibe como averiada.

**Accesibilidad.** Objetivos táctiles de 44 por 44 puntos, tipografía dinámica y contraste mínimo de 4,5 a 1.

---

## 2. Restricciones propias de este producto

Cuatro circunstancias condicionan el diseño más que cualquier preferencia estética.

**La ocultación debe ser indetectable.** No basta con no mostrar el contenido oculto. No debe haber huecos, numeraciones interrumpidas, contadores que no cuadren ni tiempos de carga distintos. Un adolescente atento deduce mucho de una discontinuidad.

**El uso es marcadamente estacional.** La agenda se consulta cada semana; las ocasiones concentran su actividad en noviembre y diciembre y en torno a cuatro o cinco cumpleaños. Una arquitectura que dé el mismo peso permanente a ambas cosas dedica media pantalla a algo inactivo diez meses al año.

**Conviven dos perfiles muy distintos.** Ana y Oscar coordinan, presupuestan y ocultan. Las hijas consultan, desean y aportan anécdotas. La misma aplicación debe resultar densa para los primeros y ligera para las segundas, sin construir dos productos.

**La captura compite con el mundo real.** Una idea se anota en una tienda, en una conversación o al bajar del coche. Si registrarla cuesta más de diez segundos, no se registra, y sin captura el resto del sistema carece de contenido.

---

## 3. Decisiones comunes a todas las opciones

Estas resoluciones no dependen de la arquitectura elegida y deberían adoptarse en cualquier caso.

**Captura en un gesto.** Un mismo punto de entrada, siempre accesible, que abre un campo de título y un botón de guardar. La clasificación —persona, categoría, precio— se ofrece debajo pero no se reclama. La idea nace incompleta y se enriquece después.

**El botón de crear pertenece a la pantalla, no a la aplicación.** Un único botón flotante cuya acción depende de dónde esté el usuario: en la semana crea un evento, en Regalos una idea, en la ficha de una persona una idea ya orientada a ella, y en el detalle de un evento asocia un regalo entre los de sus participantes. Un botón genérico obligaría a elegir el tipo antes de escribir, que es exactamente la fricción que la captura rápida trata de evitar. En las pantallas sin acción de creación —búsqueda y presupuesto— el botón no aparece.

**Escritura local e indicador discreto.** Toda acción se refleja de inmediato. Un indicador pequeño y permanente informa del estado de sincronización, con una marca de última actualización correcta. Nunca un bloqueo, nunca un modal.

**El panel "Por aquí no se mira".** Sobre el contenido propio, un panel siempre presente con esa leyenda, sin recuento ni fecha. Al ser constante, no informa de nada: ni su aparición ni su desaparición pueden interpretarse.

**Selección por reconocimiento.** Los selectores de persona muestran iniciativa, nombre y próxima ocasión relevante. Los de idea muestran título, precio orientativo y quién la propuso.

**Aprendizaje contextual.** Sin recorrido guiado inicial. Las indicaciones aparecen en el momento en que se necesitan: la advertencia de que las etiquetas no ocultan surge al escribir la primera etiqueta, no en una pantalla de bienvenida.

**Sin imágenes en la primera versión.** Los avatares se generan a partir de las iniciales con un color estable por persona, lo que sostiene el reconocimiento sin infraestructura de archivos.

---

## 4. Recorridos de contraste

Las cinco opciones se evalúan contra los mismos tres recorridos.

**R1 — Captura urgente.** Estás en una tienda y ves algo para tu madre. Diez segundos.
**R2 — Coordinación de Navidad.** Es noviembre. Ana y tú repartís doce destinatarios, veis qué falta y quién compra qué.
**R3 — Consulta ligera.** Una hija abre la aplicación el jueves para ver el plan del fin de semana y añadir un deseo.

---

## 5. Opción A — Cuatro pestañas

Cada módulo del modelo se corresponde con una pestaña.

```mermaid
flowchart TD
    T[Barra de pestañas] --> A[Agenda]
    T --> I[Ideas]
    T --> O[Ocasiones]
    T --> F[Familia]
    A --> A1[Detalle de evento]
    I --> I1[Detalle de idea]
    O --> O1[Listas por persona]
    F --> F1[Ficha de persona]
    F --> F2[Anecdotario]
```

**Pantalla de inicio:** la agenda en vista de lista cronológica.

```
┌────────────────────────────┐
│ Agenda                  ⟳  │
├────────────────────────────┤
│ ESTE FIN DE SEMANA         │
│  sáb  Torneo de hípica     │
│  dom  Comida con los abuelos│
│                            │
│ PRÓXIMAMENTE               │
│  12 nov  Cumpleaños abuela │
│  25 dic  Navidad           │
└────────────────────────────┘
│ Agenda  Ideas  Ocasiones  Familia │
└────────────────────────────┘
```

**R1, captura.** Tres toques: pestaña Ideas, botón de añadir, título. Correcto, aunque obliga a cambiar de sección.
**R2, Navidad.** Excelente. La pestaña de Ocasiones es un espacio dedicado con toda la coordinación reunida.
**R3, consulta ligera.** Correcto. La agenda abre por defecto y el deseo se añade desde Familia, lo que resulta poco evidente.

**Fortalezas.** Es la arquitectura más predecible y la de menor coste de aprendizaje. Cada cosa está donde su nombre indica. Es también la más barata de construir, porque la interfaz refleja el modelo de datos sin capas intermedias.

**Debilidades.** Refleja la estructura del sistema y no la tarea del usuario. La relación entre Ideas y Ocasiones —que son el mismo objeto en dos momentos de su vida— queda como algo que el usuario debe aprender. La pestaña de Ocasiones permanece prácticamente vacía de febrero a octubre, ocupando un cuarto de la navegación permanente. Y la lista de deseos, que es lo que más usarán las hijas, queda enterrada dentro de Familia.

**A quién conviene.** A una familia que quiera algo inmediatamente comprensible y no le importe que la aplicación sea un archivador correcto antes que un asistente.

---

## 6. Opción B — El momento

La pantalla principal compone lo que importa ahora. Ideas y Ocasiones se unifican en una sola sección, porque son el mismo objeto en dos estados.

```mermaid
flowchart TD
    T[Barra de pestañas] --> H[Hoy]
    T --> R[Regalos]
    T --> F[Familia]
    T --> B[Buscar]
    H --> A1[Agenda completa]
    H --> O1[Ocasión abierta]
    R --> R1[Banco de ideas]
    R --> R2[Campañas]
    F --> F1[Ficha de persona]
    F --> F2[Anecdotario]
```

**Pantalla de inicio:** una composición que cambia con la estación.

```
┌────────────────────────────┐
│ Hoy                     ⟳  │
├────────────────────────────┤
│ ESTE FIN DE SEMANA         │
│  sáb  Torneo de hípica     │
│  dom  Comida con los abuelos│
│                            │
│ NAVIDAD 2026               │
│  12 personas · 4 sin idea  │
│  Tú tienes 3 por comprar   │
│                            │
│ ÚLTIMAS IDEAS              │
│  Zapatillas de trail       │
│  Curso de cerámica         │
└────────────────────────────┘
│  Hoy   Regalos   Familia   🔍 │
└────────────────────────────┘
```

En marzo, el bloque de Navidad no aparece y su espacio lo ocupan el próximo cumpleaños y las ideas recientes. La aplicación cambia de forma tres veces al año sin que nadie la configure.

**R1, captura.** Óptimo si el botón de captura reside en la capa global de la barra inferior, accesible desde cualquier pestaña. Dos toques.
**R2, Navidad.** Muy bueno. El bloque de la pantalla de inicio lleva directamente al reparto, y la sección de Regalos ofrece el detalle.
**R3, consulta ligera.** Óptimo. El fin de semana es lo primero que se ve al abrir.

**Fortalezas.** Se ajusta al ritmo real de uso. Reduce la navegación a tres destinos y una búsqueda, dentro de la horquilla recomendada. Unificar Ideas y Ocasiones bajo Regalos elimina la distinción conceptual que en la opción A el usuario debía aprender: hay un banco y hay campañas, y una idea pasa de uno a otra.

**Debilidades.** Una pantalla compuesta es más difícil de acertar y más costosa de construir: hay que decidir qué se muestra, en qué orden y con qué umbrales. Existe el riesgo conocido de que un panel de resumen deje de leerse. Y la composición estacional debe apoyarse en reglas explícitas, o la pantalla resultará impredecible.

**A quién conviene.** A una familia que use la aplicación con regularidad y valore que le presente lo pertinente sin pedírselo. Es la opción con mayor techo y también con mayor riesgo de ejecución.

---

### 6.1 La pantalla de ocasiones, como se construyó

Lo que sigue no es una opción sino la decisión tomada. La pestaña de Regalos se quedó con las secciones de esta opción —Ideas y Ocasiones, y más tarde Regalos entre las dos (§6.2)—, y esto es lo que hay dentro de la última.

**Hay dos tipos de ocasión, y por eso hay dos apartados.** Una **fecha señalada** —Navidad, Reyes, un aniversario— es una ronda: mucha gente, muchos regalos y una coordinación que dura semanas. Un **cumpleaños** es lo contrario: una persona, una fecha que vuelve sola cada año y, casi siempre, un mensaje que mandar. Mezclados en una sola lista había que leerla entera para encontrar cualquiera de las dos cosas.

El nombre del primer apartado es el que se usa en casa para esas fechas. Mientras se diseñaba se llamó *campañas*, que describe bien el trabajo pero que nadie usa: a la Navidad no se la llama campaña.

```
┌──────────────────────────────┐
│ Regalos            ⟳    ⚙   │
│ ┌ Ideas ┬ Regalos ┬ Ocasiones ┐│
├──────────────────────────────┤
│ Fechas señaladas  1 en marcha ⌃│
│ ┌──────────────────────────┐ │
│ │ Navidad 2026      25 Dic │ │
│ │ 3 personas · sin regalos │ │
│ └──────────────────────────┘ │
│ [ Nueva fecha señalada ]     │
│                              │
│ Cumpleaños  el próximo, la abuela en 4 días ⌄│
└──────────────────────────────┘
```

**Los dos se pliegan, y los dos arrancan abiertos.** Lo que se viene a mirar está en los dos, y plegar sirve para quitar de en medio lo que hoy estorbe, no para tener que abrir algo cada vez que se entra. El rótulo de los cumpleaños dice de todos modos quién es el próximo y cuánto falta, que es lo que hace que plegarlos no cueste nada. Lo que se pliegue se queda plegado mientras dure la sesión, porque la pantalla se rehace en cada sincronización y si no, plegar algo duraría unos segundos.

**Cada cumpleaños dice tres cosas y ninguna dos veces.** El nombre va entero, con apellidos, que es lo que distingue a dos Marías en una lista que las lleva a todas. A la derecha, cuánto falta: en días si es pronto, y por la fecha —«el 12 de Mayo»— cuando queda medio año, que es lo único que significa algo a esa distancia. **Con los de casa la cuenta atrás no se apaga nunca**: sus cumpleaños se llevan así todo el año, y «en 213 días» dice algo que su fecha no dice. Debajo, los años que cumple y qué hay pensado; y la fecha entera **solo cuando arriba van los días**, porque si la pastilla ya dice el día, escribirlo otra vez dos renglones más abajo es leer dos veces lo mismo.

**Los cumpleaños no son filas de nada.** Salen de la fecha de nacimiento de cada ficha, igual que en la agenda, y se ordenan por el aniversario que viene: primero el que está más cerca. No se editan ni se borran desde aquí —se corrigen en la ficha, que es el dato de origen— y por eso su pastilla no lleva verbos detrás. A quien no tiene fecha no se le inventa una: no sale en la lista, pero al pie se dice cuántos son, porque un cumpleaños del que la agenda no va a avisar nunca es algo que conviene saber.

**Qué ocasión es el cumpleaños de quién no se guarda: se deduce.** Una ocasión que cae el mismo día del año que nació uno de sus participantes es su cumpleaños, y por eso no aparece entre las fechas señaladas. Así se reconocen también las que se crearon antes de que esta pantalla existiera, y el dato no puede quedarse desactualizado. La ocasión de un cumpleaños no se crea hasta que hace falta —al asociarle el primer regalo—, y lo que la ata a él son la fecha y el participante: un cumpleaños no tiene fila en `evento` a la que apuntar con `evento_id`.

**Al abrir un cumpleaños pasan tres cosas**, en el orden en que hacen falta:

1. **Cuándo es y cuántos cumple.** Los años que cumple, no los cumplidos: el día mismo son los mismos, y a partir del día siguiente se habla ya del próximo.
2. **La felicitación.** Es lo que de verdad se hace un cumpleaños. La escribe un modelo con lo que la agenda sabe de esa persona, se pasan cinco como se pasan las propuestas de regalo, se piden otras cinco si ninguna vale y se **copia al portapapeles** en lugar de guardarse: no es un dato de la agenda, es un mensaje que se manda una vez por WhatsApp. Es el único texto de la aplicación con emojis, porque en un WhatsApp de cumpleaños son la mitad del tono.
3. **Qué se le regala**, con los regalos de su ocasión si alguien ya la abrió y, si no hay ninguno, cuántas ideas hay apuntadas para esa persona.

Debajo, un enlace a su ficha, que es donde está todo lo demás.

**Lo que se le cuenta al modelo para felicitar es menos que para un regalo, y no por ahorrar.** La felicitación se le manda a quien cumple, así que solo puede llevar lo que esa persona ya sabe de sí misma: su nombre, qué es en la familia, los años que cumple y lo que hay apuntado sobre ella. Las ideas, los regalos y lo que recibió otros años se quedan fuera; un modelo al que se le da un regalo pendiente acaba mencionándolo.

**Sobre el cumpleaños propio no hay nada que mirar.** Ni felicitación —felicitarse uno mismo no es nada— ni regalos: en su sitio va el sello de siempre. El recuento tampoco aparece en la pastilla, ni siquiera en cero, porque si solo saliera cuando existe, su ausencia contaría lo mismo que su presencia.

**Los verbos de una fecha señalada están detrás de su pastilla.** Se desliza a la izquierda y aparecen editar y borrar. Es el atajo, no el camino: tocarla la abre, y dentro está el mismo *editar* arriba junto al título, como en un evento y como en una idea. El desplazamiento vertical manda —si el dedo baja, es la página la que se mueve—, solo una fila puede estar abierta a la vez y, con ella abierta, el primer toque sobre la pastilla la recoge en lugar de abrir el detalle. Con el teclado no hay gesto que hacer: los dos botones existen en el árbol y la fila se abre sola al enfocarlos.

**Borrar pregunta, y pregunta diciendo qué se lleva por delante.** Los regalos cuelgan de la ocasión, y una Navidad con ocho apuntados no puede desaparecer de un dedo distraído. Se retiran con ella: dejarlos vivos apuntando a una ocasión que ya no está los volvería invisibles pero no inexistentes, y sus ideas se quedarían «en curso» para siempre, señaladas con una ocasión que nadie puede abrir. Las ideas se quedan en el banco, libres para otra ocasión.

**Cuándo dejará de servir.** El día que las fechas señaladas cerradas se acumulen —una Navidad al año— el apartado pedirá archivarlas o agruparlas por año. Nada de lo de aquí lo impide.

### 6.2 La pantalla de regalos, como se construyó

Entre Ideas y Ocasiones hay una tercera sección, y existe porque el ciclo se contaba a trozos. Una **idea** se apunta suelta; en un cumpleaños o en una fecha señalada se convierte en un **regalo** para alguien; el regalo espera mientras se compra; y termina cuando se entrega o cuando su ocasión se da por cerrada. De ese ciclo, la aplicación enseñaba el principio —el banco de ideas— y el contenedor —la ocasión—, pero no la parte de en medio, que es donde está el trabajo: qué falta por comprar y quién lo lleva. Para responder a eso había que abrir las ocasiones una por una y sumar de cabeza.

Por dentro siguen siendo dos entidades y no tres. Se estudió fundirlas —una idea con estados sería justo lo que se cuenta— y no conviene: una idea sirve para varias personas y varios años, un regalo es de una persona y de una fecha; el regalo tiene responsable, coste y ocasión, que en una idea están vacíos siempre; y sobre todo se ocultan de manera distinta, que es la pieza central del modelo. Lo que se funde es el relato, no las filas.

```
┌──────────────────────────────┐
│ Regalos            ⟳    ⚙   │
│ ┌ Ideas ┬ Regalos ┬ Ocasiones ┐│
├──────────────────────────────┤
│ (Todos) ( Los que llevo yo ) (Sin nadie)│
│ POR COMPRAR · 2              │
│ ┌──────────────────────────┐ │
│ │ Botas de montar  lo llevas tú│
│ │ para Marta · Cumpleaños de │
│ │ Marta 2026 · en 6 días   │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Hamaca de playa  sin nadie│ │
│ │ para la abuela · … · en 4 días│
│ └──────────────────────────┘ │
│ LISTOS · 1                   │
│ ┌──────────────────────────┐ │
│ │ Curso de cerámica  lo lleva Ana│
│ │ para Rosa · Navidad 2026 · 38 €│
│ └──────────────────────────┘ │
│ Ya pasaron              1  ⌄ │
└──────────────────────────────┘
```

**Se ordena por estado y no por ocasión.** La pregunta que se trae aquí es «¿qué me falta por comprar?», y esa se contesta de una vez para todas las fechas; por ocasión ya está la pantalla de al lado. Son dos grupos, *Por comprar* y *Listos*, y cada uno dice cuántos lleva en el rótulo.

**La pastilla de la derecha dice quién lo lleva**, que es lo que hay que repartir. *Sin nadie* va marcado en color de aviso: no es un error, pero es lo único de la lista que pide que alguien haga algo. Con dos excepciones, que son los dos casos en los que el estado dice algo que el rótulo del grupo no dice ya: lo entregado, que dentro de *Listos* es lo único que se distingue del resto, y lo que se quedó sin comprar cuando la fecha ya pasó.

**Los tres filtros de arriba son los tres cortes que se hacen de verdad**: todos, los que llevo yo y los que no lleva nadie. En un hogar de cuatro, la mitad de los regalos son de otros y en la lista solo estorban; y *sin nadie* convierte la pantalla en la lista de lo que hay que repartir antes de que llegue la fecha.

**Pasada la fecha, nada desaparece solo.** Los regalos de una ocasión cuya fecha ya se fue bajan a un apartado plegado al final —*Ya pasaron*—, con lo que quedó sin comprar señalado. Archivar es esconder, y esconder solo lo que se ha terminado a medias sería esconder justamente lo que hay que mirar: una Navidad que se celebra el 26, o un cumpleaños que se junta el sábado siguiente, siguen haciendo falta el día después. Lo que los archiva de verdad es **dar la ocasión por cerrada**, que es un verbo que se ejerce a mano desde la ocasión y que manda sus regalos al histórico de quien los recibió.

**Cerrar se pregunta**, porque no tiene vuelta: da por cerradas también las ideas que salieron de allí, exactamente igual que ocurre ya cuando el último regalo se marca como entregado. Una idea cerrada es terminal por diseño; para volver a usarla se duplica.

**Desde un regalo se sale por dos puertas: su ocasión y su destinatario.** Un regalo no se entiende solo —se entiende por la fecha a la que va y por la persona que lo va a recibir—, y desde esta lista no había otra manera de llegar a ninguna de las dos. Cuando la ocasión es un cumpleaños, el enlace lleva a la hoja del cumpleaños y no a la genérica: es allí donde de verdad se prepara, con los años, la felicitación y el resto de los regalos.

**Cuándo dejará de servir.** El día que un diciembre acumule treinta regalos, los dos grupos pedirán partirse por ocasión dentro de cada estado. Los filtros de arriba aguantan ese volumen; los rótulos, seguramente no.

---

## 7. Opción C — Las personas

El eje organizador es la persona. La pantalla principal es la familia, y cada persona reúne todo lo que le concierne.

```mermaid
flowchart TD
    T[Barra de pestañas] --> P[Personas]
    T --> A[Agenda]
    T --> B[Buscar]
    P --> P1[Ficha de persona]
    P1 --> D1[Su cumpleaños]
    P1 --> D2[Su lista de deseos]
    P1 --> D3[Ideas orientadas a ella]
    P1 --> D4[Regalos en curso]
    P1 --> D5[Histórico]
    P1 --> D6[Sus anécdotas]
```

**Pantalla de inicio:** la familia.

```
┌────────────────────────────┐
│ Personas                ⟳  │
├────────────────────────────┤
│   (AG)   (MG)   (LG)       │
│   Ana    ...    ...        │
│                            │
│   (JG)   (CG)   (RG)       │
│   Abuelo Abuela Sobrino    │
│                            │
│ Cumpleaños en 12 días: abuela│
└────────────────────────────┘
│   Personas    Agenda     🔍 │
└────────────────────────────┘
```

**R1, captura.** Bueno si el botón global está presente; algo peor si obliga a entrar antes en la persona.
**R2, Navidad.** El punto débil. Coordinar doce destinatarios exige recorrer doce fichas, y la visión de conjunto del presupuesto no tiene un lugar natural.
**R3, consulta ligera.** Regular. La agenda pasa a segundo plano y el plan del fin de semana requiere un toque adicional.

**Fortalezas.** Es la arquitectura que mejor refleja cómo se piensa un regalo, que siempre parte de una persona y no de una categoría. Concentra el valor acumulado de la ficha: tallas, preferencias, histórico y anécdotas juntos. Y resuelve con naturalidad la ocultación, porque la ficha propia es simplemente la que muestra el panel reservado.

**Debilidades.** Los eventos con varios participantes encajan mal en una estructura centrada en el individuo. La coordinación de una campaña con muchos destinatarios resulta laboriosa. Y la agenda, que es el uso más frecuente, queda relegada.

**A quién conviene.** A una familia cuyo interés principal sea el archivo de personas más que la coordinación. Como arquitectura principal es arriesgada; como pantalla dentro de otra opción, es valiosa.

### 7.1 La pantalla de personas, como se construyó

Lo que sigue no es una opción sino la decisión tomada: de las cuatro maneras que se pusieron sobre la mesa en `propuesta-familia-circulos.html` se eligió la de las pestañas.

La pantalla se llama **Gente** en la barra, y *Familia* es uno de los tres círculos que hay dentro. Conviene que no coincidan: la pestaña reúne a todo el mundo, y sólo cuatro son de casa.

**Tres círculos, y no dos grupos por si tienen cuenta.** Hasta aquí la pantalla se partía por `tiene_cuenta`, que es un dato técnico —quién ha entrado con Apple— usado como si fuera un vínculo. No lo es: la abuela no tiene cuenta y es de la familia, y un amigo podría tenerla sin serlo. Lo que ordena la pantalla pasa a ser el vínculo, escrito aparte en `persona.circulo`:

- **Familia**, los cuatro de casa. Conjunto cerrado.
- **Familia Extendida** y **Amigos**, abiertos.

Cada persona pertenece a uno solo. Son tres y cerrados a propósito: un cuarto círculo obligaría a decidir en cada alta a cuál va cada quien, que es justo la pregunta que esta pantalla evita.

**La forma.** Los cuatro de casa, arriba y siempre, en una fila de cuatro columnas. Debajo, un conmutador entre los otros dos círculos y una sola rejilla que cambia de contenido. Así la pantalla no crece cuando crecen los amigos, y queda dicho sin escribirlo que el hogar no es un grupo más.

```
┌──────────────────────────────┐
│ Gente              ⟳    ⚙   │
│ ⌕ Buscar una persona         │
├──────────────────────────────┤
│ FAMILIA          (lo ve Marta)│
│ ┌─────┐┌─────┐┌─────┐┌─────┐ │
│ │Marta││Óscar││Lucía││ Ana │ │
│ │ yo  ││papá ││herma││mamá │ │
│ │en 6d││3 nov││19feb││12may│ │
│ └─────┘└─────┘└─────┘└─────┘ │
│                              │
│ ┌ Familia Extendida·4 ┬ Amigos·3 ┐ │
│ ┌───────┐┌───────┐┌───────┐  │
│ │abuela ││ Rosa  ││abuelo │  │
│ │en 4 d ││en 26 d││ 5 mar │  │
│ └───────┘└───────┘└───────┘  │
│ ┌───────┐┌ ─ ─ ─ ┐           │
│ │ Javi  ││   +   │           │
│ │sinfech││ Añadir│           │
│ └───────┘└ ─ ─ ─ ┘           │
└──────────────────────────────┘
```

**Sin avatares.** Las iniciales sobre un color inventado no decían nada que no dijera el nombre, que va justo debajo. En su lugar va lo que de verdad se consulta —de quién es y cuándo cumple—, que además cabe en menos alto. El avatar se conserva en la cabecera de la ficha, donde identifica de quién es la hoja abierta y no compite con nada.

**El parentesco, dentro de casa, se dice respecto a quien mira.** El campo lo escribió quien dio de alta a esa persona, y es el papel que ocupa en el hogar: «madre», «padre», «hija». Puesto tal cual bajo el nombre no dice nada de nadie —Marta leía «madre» junto a Ana, que no es la madre de nadie en abstracto sino la suya—, así que en el círculo de casa se traduce a lo que esa persona es para quien tiene el teléfono en la mano:

| Mira | Ve a los mayores | Ve a los pequeños | Se ve a sí mismo |
|---|---|---|---|
| una hija | mamá, papá | hermana, hermano | yo |
| la madre o el padre | pareja | hija, hijo | yo |

Se infiere del dato, no se pregunta: nadie escribe dos veces lo mismo. Fuera de ese círculo no hay nada que inferir —la tía es la tía mire quien mire— y se deja lo escrito; tampoco se infiere cuando quien mira no es de casa, porque para alguien de fuera «madre» y «padre» sí describen el hogar. Lo que no encaje en esas formas se deja tal cual: menos útil, pero nunca falso. La ficha usa la misma traducción, para que no diga «madre» lo que en la rejilla ponía «mamá».

De todo esto, la única inferencia que va más allá del dato es **«pareja»**: nadie ha escrito que los dos adultos lo sean, se deduce de que comparten hogar y generación. Es una línea de código y se quita sola si algún día deja de ser cierto.

**El género, que solo existe para nombrar bien.** La ficha lleva un campo de género —femenino, masculino, o sin decir— del que la aplicación no saca nada más: sirve para elegir entre «mamá» y «papá», o entre «hermana» y «hermano», cuando la palabra del parentesco no lo lleva dentro. El caso que lo hizo falta es **«lóver»**, que dice la relación y calla el género: sin el campo no habría manera de saber qué tiene que leer una hija. Cuando está en blanco se deduce de la propia palabra, que en castellano casi siempre lo dice; y si tampoco, se cae del lado femenino sin más razón que tener que elegir uno.

Que «lóver» se traduzca a «mamá» o «papá» supone que esa pareja es madre o padre de las crías. Cuando no lo sea, están **«madrastra»** y **«padrastro»** en la misma lista, que se leen tal cual y no se traducen.

**Los años que hará, entre paréntesis.** Junto a la fecha o a los días que faltan va la edad que cumple —`en 6 d (16)`, `3 nov (48)`—, que es la cifra que se está buscando cuando uno mira esa línea, porque es la que decide el regalo. Los que hará, no los que tiene.

**El parentesco se elige de una lista, distinta en cada círculo.** Era un campo libre, y un campo libre aquí se llena de variantes de lo mismo —«mamá», «madre», «Mama»— que después no hay quien lea. Dentro de casa importa el doble, porque de ese texto sale la traducción de arriba. Como el parentesco depende del círculo, el círculo se pregunta antes en el formulario, y la lista se rehace al cambiarlo conservando lo elegido si sigue estando.

| Círculo | Se ofrece |
|---|---|
| Familia | madre, padre, hija, hijo |
| Familia Extendida | abuela y abuelo, hermana y hermano, tía y tío, prima y primo, sobrina y sobrino, nieta y nieto, suegra y suegro, cuñada y cuñado, nuera y yerno, madrina y padrino |
| Amigos | amiga y amigo, vecina y vecino, compañera y compañero |

En orden de cercanía y no alfabético: de una lista corta se elige mirando, no leyéndola entera. Encima de todas, **Sin decir**, porque el dato no es obligatorio; y al final, **Otro…**, que abre un campo libre para lo que no entre en ninguna lista —«el marido de mi prima»— y se guarda tal cual. Lo que ya estuviera escrito de antes, o quedara fuera de lista al mover a alguien de círculo, no se pierde: reaparece en *Otro* con su texto puesto.

**La fecha de nacimiento, con las dos maneras de ponerla.** El selector del sistema es cómodo para lo cercano y penoso para lo lejano: poner 1947 exige recorrer setenta y nueve pantallas de calendario, y las fechas que se meten aquí son sobre todo de gente mayor. Al lado va una casilla en `dd/mm/aaaa`, que es como se dice una fecha en voz alta y se escribe de un tirón.

**Las barras las pone la casilla, no quien escribe.** Se teclea `01121974` y se lee `01/12/1974`. Obligar a intercalar dos barras rompe ese tirón justo en el campo que existe para escribir deprisa, y en un teclado numérico la barra ni siquiera está a la vista. La máscara solo separa lo que ya se ha escrito —`011` da `01/1` y nunca `01/1/`—, de modo que el borrado no necesita nada especial: al quitar el último dígito, la barra que lo precedía desaparece sola. El cursor se recoloca contando dígitos y no caracteres; contándolos en caracteres, cada barra que aparece lo empujaría un puesto atrás y las cifras saldrían desordenadas al corregir en medio.

Las dos escriben sobre el mismo valor y se copian la una a la otra. La casilla enmascara siempre, pero solo se cree lo que sea una fecha entera y válida —el 31 de febrero no cuela—; no protesta mientras se escribe, y al salir del campo se corrige sola a lo que haya guardado.

### 7.2 La ficha

**El círculo no se dice en ninguna parte**, ni en la ficha ni en la tabla de resultados. A las dos se llega desde él, y en la tabla ocupaba media columna para repetir lo que el parentesco dice mejor: «tía» sitúa a alguien más deprisa que «Familia Extendida». Lo que va es el parentesco, el mismo relativo a quien mira —donde la rejilla ponía «mamá», la ficha no puede poner «madre»—; y cuando no hay ninguno escrito, **«amiga»** o **«amigo»** según el género, que es lo que queda por decir de alguien de quien no se ha dicho nada.

**El cumpleaños con la edad detrás**: «Cumple el 1 de agosto, y hará 16». Es lo que se pregunta justo después de la fecha.

**Editar y compartir van arriba, junto al título**, como en el detalle de un evento, y no en un botón al pie. Editar solo lo ven los administradores.

Compartir exporta **la cara pública y nada más**: cómo se llama, de quién es, cuándo cumple y lo que conviene recordar de ella —las tallas, las alergias—, que es justo lo que se le manda a quien pregunta qué comprarle.

```
Marta Ejemplo
hija
Cumple el 1 de agosto, y hará 16

talla de calzado: 39
```

Ni una palabra de la dimensión de regalos: ni deseos, ni ideas apuntadas, ni histórico. Es la misma regla que rige el compartir de un evento, y aquí importa más, porque este texto sale del hogar. Tampoco se ofrece la redacción por IA: los datos de una persona son cuatro líneas de hechos, y contarlos «en dos frases» solo podría estropearlos.

### 7.3 Buscar

El buscador vive en la subcabecera, sobre los tres círculos, y lleva **un aspa que lo vacía y devuelve la pantalla a como estaba**, con la pestaña que hubiera abierta. `type="search"` trae una del navegador, pero en la cáscara de iOS no aparece, que es justo donde se usa esto.

Lo que devuelve **no es una rejilla sino una tabla**. Una celda de rejilla da para un nombre corto y poco más, y el resultado de una búsqueda es donde hace falta lo contrario: tres columnas que se leen hacia abajo de un vistazo.

| Quién | De qué | Cumple |
|---|---|---|
| Rosa Ejemplo | tía | 21 ago (54) |
| el abuelo | abuelo | 5 mar (80) |
| Javi Ejemplo | tío | sin fecha |

El nombre va entero, con apellidos, que es lo que distingue a dos Marías. Y el orden es el mismo de las rejillas: por el aniversario que viene, y los sin fecha al final.

**El cumpleaños, en sus dos lecturas.** Bajo cada nombre, una línea: `en 6 d` si cae dentro de un mes, en tinta; el día si cae lejos; y `sin fecha` —escrito, no en blanco— si no la hay. Un hueco vacío no se ve; escrito, es un cumpleaños del que la agenda no va a avisar y una ficha que pide que la abran. Dentro de cada rejilla se ordena por el aniversario que viene, y quien no tiene fecha queda al final, junto.

**El «+» es una celda más de la rejilla**, con el borde discontinuo y el tamaño de una persona, al final del círculo al que pertenece. Puesto ahí no tiene que preguntar a cuál se añade. Familia no lo ofrece: quien intente crecerla se encuentra con que no hay por dónde, que es la manera más barata de sostener que son cuatro. El botón flotante desaparece de esta pantalla, porque un segundo «+» encima que hiciera otra cosa dejaría dos signos iguales con dos significados.

**El buscador está encima de todo, no dentro de una pestaña.** Es el defecto conocido del conmutador —tener que acertar la pestaña antes de buscar—, y se resuelve así: mientras hay algo escrito la pantalla deja de estar dividida y enseña un único resultado sobre los tres círculos, con el círculo de cada persona escrito bajo su nombre. Al borrar la búsqueda vuelve la pestaña que estaba. Busca por nombre, apellidos y parentesco, e ignora las tildes: «abuel» tiene que dar con los dos abuelos aunque ninguno se llame así.

**Cuándo dejará de servir.** El día que *Amigos* pase de unas doce personas, su rejilla pedirá su propio buscador o un orden distinto. Nada de lo de aquí lo impide.

---

## 8. Opción D — La semana

La semana abre la aplicación. No es una lista de lo próximo, sino un marco fijo de siete filas que se repite siempre igual.

```mermaid
flowchart TD
    T[Barra de pestañas] --> S[Semana]
    T --> R[Regalos]
    T --> F[Familia]
    T --> B[Buscar]
    S --> V1[Vista de semana]
    S --> V2[Vista de mes]
    S --> V3[Vista de lista]
    S --> E1[Detalle de evento]
```

```
┌────────────────────────────┐
│ Semana                     │
│ [semana] [mes] [lista]     │
│ ‹   20 – 26 de julio    ›  │
├────────────────────────────┤
│ L 20 │ Reunión del colegio │
│ M 21 │ Libre               │
│ X 22 │ Libre               │
│ J 23 │ Entreno de hípica   │
│ V 24 │ Libre               │
│ S 25 │ Torneo de hípica    │
│ D 26 │ Comida con abuelos  │
└────────────────────────────┘
│  Semana  Regalos  Familia  🔍│
└────────────────────────────┘
```

**R1, captura.** Bueno, con el botón global.
**R2, Navidad.** Correcto. La coordinación existe pero queda en segundo plano.
**R3, consulta ligera.** Excelente. Es literalmente la primera pantalla.

**Fortalezas.** La semana es la unidad real de la vida familiar: la pregunta que más veces se formula en casa es qué hay este fin de semana. Al ser un marco fijo, se aprende dónde cae cada día y la lectura se vuelve casi automática, sin necesidad de interpretar una lista que cambia de forma cada vez. Los días vacíos son información y no espacio desperdiciado: enseñan la forma de la semana, que es justo lo que se quiere ver al planificar.

**Debilidades.** Una semana sin nada resulta desangelada, y en esta familia habrá bastantes. La maquinaria de regalos, que es la parte más compleja del producto, queda relegada a una pestaña secundaria. Y una vista de semana es más costosa de construir bien que una lista, sobre todo con eventos de varios días.

**A quién conviene.** A una familia con actividad semanal regular —entrenamientos, competiciones, turnos— para la que la agenda sea el uso dominante y los regalos una actividad estacional.

---

## 9. Opción E — Dos mundos

La aplicación se parte en dos mitades con ritmos y públicos distintos. Un conmutador superior elige el mundo; la barra inferior cambia de contenido según cuál esté activo.

```mermaid
flowchart TD
    M{Conmutador} --> F[Mundo Familia]
    M --> R[Mundo Regalos]
    F --> F1[Semana]
    F --> F2[Personas]
    F --> F3[Anécdotas]
    R --> R1[Campañas]
    R --> R2[Banco de ideas]
    R --> R3[Presupuesto]
```

**R1, captura.** Bueno, aunque exige estar en el mundo correcto o usar el botón global.
**R2, Navidad.** Excelente. Es la única opción que da al presupuesto un lugar propio.
**R3, consulta ligera.** Muy bueno. Una hija vive prácticamente siempre en el mundo Familia.

**Fortalezas.** Reconoce algo cierto del producto: sus dos mitades tienen ritmos y públicos distintos. La secretividad queda confinada a un mundo, lo que simplifica el modelo mental —dentro de Regalos uno sabe que hay cosas que no le corresponden—. Y permite tres secciones por mundo sin sobrecargar la barra inferior, lo que da sitio al presupuesto, que en las demás opciones queda escondido.

**Debilidades.** Se aparta de la convención de iOS, que sitúa la navegación principal abajo. Añade una decisión antes de cada tarea: primero el mundo, después la sección. Y quien use la aplicación de forma esporádica puede no descubrir nunca el segundo mundo.

**A quién conviene.** A una familia en la que dos personas asuman de verdad la gestión de los regalos, con presupuesto y seguimiento, mientras el resto vive en la mitad cotidiana.

---

## 10. La vista de semana como componente

Con independencia de la arquitectura elegida, la agenda debe ofrecer tres vistas sobre los mismos datos, conmutables desde la propia pantalla:

- **Semana**, marco fijo de siete días, incluidos los vacíos. Vista por defecto.
- **Mes**, retícula con marcas en los días con contenido y el detalle del día seleccionado debajo.
- **Lista**, orden cronológico agrupado por proximidad, que es la única que funciona bien cuando lo próximo está a cinco meses.

Las tres son necesarias porque responden a preguntas distintas: qué hay estos días, cómo se reparte el mes, y qué viene a continuación.

### 10.1 El formulario de evento

La creación tiene dos niveles. La hoja rápida pide título y día, y con eso guarda. El formulario completo se abre desde ella o al editar un evento existente, y agrupa los campos en seis bloques: cuándo, quién, dónde, qué es, reserva y más.

Tres decisiones merecen mención.

**El tipo va después de la fecha, no antes.** Podría defenderse lo contrario, ya que el tipo determina el emoji y algunos valores por defecto. Se ha situado después porque quien crea un evento tiene en la cabeza el qué y el cuándo, no la taxonomía; obligarle a clasificar antes de escribir invierte el orden natural.

**«De quién es» y «quién va» son campos distintos.** El primero determina a quién se le ocultan los regalos del evento y qué ideas se proponen al asociarlos; el segundo es informativo. La diferencia se explica bajo los campos, en lenguaje llano, porque no es evidente y sus consecuencias son importantes.

**La reserva se expresa como acción, no como categoría.** El control dice «ocultarlo a alguien» en lugar de «asignar categoría restringida», y al activarse explica qué implica: el evento desaparece por completo de la agenda de esas personas, sin dejar hueco ni llegar a su dispositivo.

### 10.2 Densidad: varios eventos en un mismo día

Es el punto donde la vista de semana se rompe. Si cada fila crece con su contenido, un sábado cargado desplaza el domingo fuera de la pantalla y se pierde exactamente aquello que justifica la vista, que es abarcar los siete días de una vez. Se resuelve con cuatro reglas.

**Filas de una sola línea.** Cada evento ocupa una línea: hora, título recortado. La tarjeta amplia se reserva para la vista de día y para el detalle.

**Techo de tres eventos por día.** A partir del cuarto aparece un enlace con el resto, que abre la vista de día. El marco de siete filas se conserva intacto en cualquier semana realista.

**Vista de día como segundo nivel.** Tocar la fecha o el enlace de desbordamiento abre el día completo, con todos sus eventos en formato amplio. La semana resume; el día detalla.

**Eventos de varios días con barra continua.** Un viaje o un torneo de dos jornadas se marca con una banda vertical en el margen izquierdo de cada día afectado, y las jornadas posteriores a la primera se señalan como continuación en lugar de repetir el evento como si fuera nuevo.

**Consecuencia sobre los permisos.** El recuento del enlace de desbordamiento se calcula sobre los eventos visibles para quien mira. Si un evento pertenece a una categoría reservada, no cuenta. Un enlace que anuncie dos eventos más y muestre solo uno al abrirlo revela la existencia de lo que se pretendía ocultar, que es justamente el fallo que este diseño trata de impedir.

---

## 11. Comparación y recomendación

| Criterio | A. Pestañas | B. El momento | C. Personas | D. La semana | E. Dos mundos |
|---|---|---|---|---|---|
| Coste de aprendizaje | Muy bajo | Bajo | Medio | Muy bajo | Medio |
| R1 Captura | Correcto | Óptimo | Bueno | Bueno | Bueno |
| R2 Navidad | Excelente | Muy bueno | Débil | Correcto | Excelente |
| R3 Consulta ligera | Correcto | Óptimo | Regular | Excelente | Muy bueno |
| Ajuste a la estacionalidad | Débil | Fuerte | Medio | Medio | Fuerte |
| Coste de construcción | Bajo | Medio | Medio | Medio | Alto |
| Riesgo de ejecución | Bajo | Medio | Alto | Bajo | Medio |

**Dirección elegida: la opción D**, con la ficha de persona de la opción C como pantalla de detalle y el bloque estacional de la B incorporado dentro de la semana.

La semana abre la aplicación. Es la unidad real de la vida familiar y el marco fijo hace que la lectura sea casi automática. La coordinación de regalos vive en su propia pestaña, que es donde debe estar: se visita con intención, no de paso.

Lo que sigue recoge el análisis previo a esa decisión.

**Alternativa: la opción B**, con una precisión importante.

La unificación de Ideas y Ocasiones bajo una sola sección es la decisión de mayor rendimiento del conjunto, porque suprime una distinción que existe en el modelo de datos y no en la cabeza del usuario. La composición estacional de la pantalla de inicio es lo que hace que la aplicación resulte útil en marzo y no solo en diciembre.

La precisión es que **la ficha de persona de la opción C debe adoptarse dentro de la opción B**, como pantalla de detalle dentro de Familia. Es el mejor elemento de las cinco propuestas y no exige renunciar a nada: reúne el histórico derivado, los atributos acumulados y las anécdotas en el lugar donde se consultan de verdad, que es cuando alguien se pregunta qué regalar a esa persona concreta.

Si se prefiere reducir el riesgo, la opción A es una primera versión legítima que puede evolucionar hacia la B: la pantalla de inicio compuesta se añade después sin rehacer nada, porque la navegación por pestañas permanece.

**Sobre la opción D.** Es la mejor candidata si la agenda va a ser el uso dominante, y su riesgo de ejecución es el más bajo de las cinco después de la A. Cabe además una síntesis con la B: conservar la pantalla compuesta como inicio y situar la semana inmediatamente detrás, en la primera pestaña. Se obtiene el resumen estacional sin renunciar al marco fijo.

**Sobre la opción E.** Es la única que da al presupuesto un lugar propio, y su separación de mundos encaja con la realidad de que dos personas gestionan y el resto consulta. El precio es apartarse de la convención de iOS y añadir una decisión antes de cada tarea. La recomendaría solo si la gestión de regalos va a tener más peso del previsto.

---

## 12. Fuentes

- Apple, *Human Interface Guidelines*: barras de pestañas, navegación y presentación modal.
- Nielsen Norman Group: las diez heurísticas de usabilidad, divulgación progresiva y reconocimiento frente a memoria.
- Documentación sectorial sobre patrones de diseño sin conexión: interfaz optimista, colas de sincronización e indicadores de estado.

---

## 13. Cuestiones abiertas

1. Confirmar la opción de arquitectura antes de detallar pantallas.
2. Decidir si el botón de captura reside en la capa global inferior o en cada sección.
3. Definir las reglas explícitas de composición de la pantalla de inicio en la opción B: qué bloques, con qué umbrales y en qué orden.
4. Determinar si el Anecdotario merece pestaña propia o vive dentro de Familia, lo que depende de su especificación pendiente.
