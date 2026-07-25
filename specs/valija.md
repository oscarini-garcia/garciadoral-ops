# Agenda Familiar — Valija

**Versión:** 0.2
**Fecha:** 25 de julio de 2026
**Documentos complementarios:** Agenda Familiar — Especificación Funcional · Agenda Familiar — Modelo de Datos y Flujos
**Alcance:** definición funcional del módulo. Las entidades se proponen en el apartado 8 y se incorporarán al documento de modelo de datos cuando el módulo entre en construcción.

---

## 1. Propósito

Llivia, Cambrils y Pamplona no son destinos: son sitios a los que se vuelve. Y lo
que se aprende de un sitio se olvida antes de la siguiente visita. El restaurante
que gustó en agosto no está en ninguna parte en Navidad; el que no gustó tampoco,
de modo que se repite. La tienda que había que ver, el plan que salió mal, el
detalle de la casa que solo se recuerda al llegar y comprobar que falta.

Todo eso vive hoy en la cabeza de alguien, en una nota suelta o en un mensaje que
se hundió en el hilo del grupo. La **valija** es el cuaderno de cada sitio: se
abre antes de ir y se escribe mientras se está allí.

El principio es el mismo que sostiene el módulo de Ideas: **se anota una vez y se
reutiliza**. Su valor es acumulativo y se manifiesta tarde —un apunte de este
verano rinde el verano que viene—, lo que impone una condición sobre todo lo
demás: la captura ha de costar segundos, porque se produce de pie en una acera y
compitiendo con la conversación que la provocó.

**No es un gestor de viajes.** No hay objeto viaje ni estancia, ni fechas, ni
preparativos que se cierren. Hay lugares y apuntes sobre ellos, y esa renuncia es
deliberada: es lo que permite que el contenido no caduque ni haya que trasladarlo
de una salida a la siguiente.

---

## 2. El lugar

Un lugar es un sitio del que merece la pena acumular apuntes. Cualquier persona
con cuenta lo crea cuando lo necesita, escribiendo su nombre y nada más.

**No hay clases de lugar.** Las casas de la familia no se distinguen en el modelo
de un destino de vacaciones de una sola semana. La diferencia entre ambos es real
—una casa acumulará cien apuntes y un destino puntual cuatro—, pero la produce el
uso y no hace falta modelarla: introducir la distinción obligaría a decidir, en el
momento de crear el lugar, algo que solo se sabe después.

Un lugar no se elimina. Conforme a la convención de borrado del modelo de datos,
se marca inactivo y sus apuntes permanecen consultables.

---

## 3. El apunte

Es el único objeto del módulo. Un restaurante al que ir, un jersey que hay que
llevar y el aviso de que la llave está en casa del vecino son el mismo objeto con
distinto tipo.

La alternativa —separar las listas de equipaje del banco de descubrimientos— fue
descartada porque duplica el formulario de captura para distinguir cosas que se
escriben en el mismo momento y en el mismo estado de ánimo. **El tipo clasifica,
no separa.**

### 3.1 Campos

| Campo | Notas |
|---|---|
| lugar | Obligatorio. Uno solo. |
| tipo | Obligatorio. Catálogo cerrado del apartado 3.2. |
| título | Obligatorio. Lo único que se exige junto a lugar y tipo. |
| nota | Texto libre. Aquí vive la descripción y la opinión. |
| enlace | Opcional. La primera versión no admite imágenes ni adjuntos en ningún módulo (especificación funcional §10); el enlace cubre la referencia a la web del restaurante o a un punto del mapa. |
| permanencia | `permanente` por defecto, o `puntual`. Apartado 3.3. |
| estado | `activo` o `archivado`. Solo lo puntual llega a archivarse. |
| autor, fecha de creación, fecha de modificación | Automáticos y no editables, como en toda entidad de contenido. |

La captura mínima son tres datos: lugar, tipo y título. El resto se completa
después o no se completa nunca. Es el mismo criterio del apartado 5.1 de la
especificación funcional, y por la misma razón: exigir texto en el instante de la
ocurrencia hace que la ocurrencia sencillamente no se registre.

### 3.2 Tipos

| Tipo | Qué recoge |
|---|---|
| 🍽️ Restaurante | Dónde comer. Los que faltan por probar y los ya probados con su veredicto. |
| 🛍️ Tienda | Comercios que ver, y los que no merecieron el paseo. |
| 🧭 Plan | Qué hacer: una excursión, una playa, un museo, una feria. |
| 🎒 Llevar | Lo que hay que meter en el coche o en la maleta para ese sitio. |
| 📌 Tener en cuenta | Lo que describe la casa o el sitio: dónde está la llave, que no hay secador, que la estufa necesita pastillas, la clave del wifi. |

El catálogo es **cerrado**, igual que el de tipos de evento (§4.3). Un vocabulario
abierto aquí produciría dispersión inmediata —«comida», «comer», «restaurantes»—
sin que el volumen del módulo lo justifique. Se amplía por decisión, no por
escritura libre.

### 3.3 Permanente y puntual

La pregunta que separa ambos no es si algo está hecho, sino **si sigue aplicando
cuando la estancia termina**.

Un apunte **permanente** describe el sitio. No lleva casilla, porque no hay nada
que completar: la clave del wifi, el restaurante bueno y el plan que no repetimos
siguen siendo ciertos el año que viene. Es el estado por defecto y el que
concentra el valor del módulo.

Un apunte **puntual** aplica a la próxima vez y deja de tener sentido después:
llevar el traje de la boda, recoger el paquete del vecino, comprar el regalo antes
de subir. Lleva casilla; al marcarse se archiva, sale de la vista y queda
consultable.

De aquí se deriva la regla que gobierna el módulo y que conviene enunciar aparte,
porque es exactamente lo contrario de lo que hace una lista de tareas:

> **Haber probado algo no lo archiva.** Al volver de un restaurante no se marca
> nada: se le añade la opinión a la nota. Un módulo que tachara lo consumido
> destruiría, visita a visita, la memoria que justifica su existencia.

### 3.4 La valoración es texto

No hay campo de puntuación ni de veredicto. Que un plan gustase o no se escribe en
la nota, con la libertad de matizar por qué —«bien, pero no con las niñas»,
«carísimo para lo que es»— que ningún selector de estrellas admite.

**Limitación conocida.** La consecuencia es que la valoración no es filtrable: no
se puede pedir «los restaurantes de Cambrils que nos gustaron», solo leerlos. Con
pocos apuntes por sitio es irrelevante; si con el uso una casa acumula decenas de
restaurantes, la falta se notará y habrá que añadir un campo acotado. La decisión
se toma a sabiendas, y revisarla no invalidaría nada de lo ya escrito.

---

## 4. Visibilidad

Todo el contenido del módulo es visible para todas las personas con cuenta. No hay
categorías, ni ocultación por destinatario, ni reglas propias. Las personas sin
cuenta no acceden a la aplicación y por tanto tampoco a la valija.

Es el primer módulo del sistema que no atraviesa la función de visibilidad, y eso
obliga a decir en voz alta lo que implica:

> **La valija no protege nada.** Cualquier apunte es legible por toda la familia,
> hijas incluidas. Lo que sea sorpresa —una tienda que se visita para comprar un
> regalo, un plan que se quiere anunciar en su momento— no se apunta aquí: se
> anota en Ideas, que sí aplica ocultación por destinatario (§3.2 de la
> especificación funcional). Conviene que la interfaz lo advierta al crear el
> apunte, con el mismo criterio con que advierte que las etiquetas clasifican pero
> no protegen (§5.4).

De ahí se sigue una frontera que el módulo no debe cruzar: **la valija no aloja
regalos ni se vincula a ocasiones.** Precisamente porque no puede ocultar nada, no
puede contener aquello cuya ocultación es el requisito más importante del sistema.

---

## 5. Consulta y captura

Se entra por el lugar. Dentro, los apuntes se presentan agrupados por tipo, con lo
**puntual pendiente en cabeza**: es lo único que caduca y lo único que alguien
necesita ver antes de salir por la puerta.

La vista admite filtro por tipo. Lo archivado no aparece salvo que se pida de forma
expresa. La búsqueda global de la aplicación alcanza los apuntes, de modo que
«Llivia» y «pizzería» son dos caminos válidos hacia lo mismo.

Cualquier persona con cuenta crea, edita y archiva apuntes, y crea lugares. La nota
es colectiva y editable por cualquiera: es memoria de la familia, no opinión firmada
de nadie.

---

## 6. Funcionamiento sin conexión

Es el módulo que más se consulta donde peor va la red: en el coche, en el pueblo, ya
en la casa. El modelo local-first del apartado 9 de la especificación funcional lo
cubre sin excepciones.

Una precisión de implementación, no de funcionalidad: al ser todo el contenido
compartido, el filtrado previo a la transmisión no recorta nada en este módulo. Debe
implementarse igualmente como **identidad explícita** dentro del camino de filtrado,
y no como una ruta que lo esquiva. Si algún día la valija necesitara una regla de
visibilidad, el sitio donde aplicarla tiene que existir ya.

---

## 7. Encaje con el resto del sistema

| Módulo | Relación |
|---|---|
| **Agenda** | Ninguna. Un evento en Cambrils y la valija de Cambrils no se conocen. |
| **Plan semanal** | No aparece. El mensaje del domingo no menciona la valija ni cuando la semana entrante incluye un viaje. |
| **Ideas** | Frontera, no vínculo: lo que deba ocultarse va a Ideas. Un apunte no se promueve a idea ni a la inversa. |
| **Ocasiones** | Ninguna, por lo dicho en el apartado 4. |

La independencia respecto de la agenda es una decisión, no un olvido. El módulo se
sostiene solo, y el vínculo obligaría al evento a conocer los lugares y a resolver
qué ocurre cuando el sitio del evento no está entre ellos. Nada de lo definido aquí
impide añadirlo más adelante: bastaría un campo opcional en el evento.

---

## 8. Modelo

Entidades propuestas, para incorporar al documento de modelo de datos cuando el
módulo entre en construcción. Ambas incorporan los campos comunes —creación,
modificación y autor— y siguen la convención de borrado lógico.

**Lugar**

| Campo | Notas |
|---|---|
| id | |
| nombre | Único elemento obligatorio en la creación |
| activo | El borrado es lógico |

**Apunte**

| Campo | Notas |
|---|---|
| id | |
| lugar_id | Obligatorio |
| tipo | Valor del catálogo cerrado (§3.2) |
| titulo | Obligatorio |
| nota | Texto libre, opcional |
| enlace | Opcional |
| permanencia | `permanente` \| `puntual` |
| estado | `activo` \| `archivado` |

Reglas de integridad:

1. Un apunte pertenece siempre a un lugar y solo a uno.
2. Un apunte `permanente` no puede estar `archivado`: no dispone de la casilla que
   produce esa transición.
3. Archivar es reversible. Un apunte archivado vuelve a `activo` sin pérdida.
4. Desactivar un lugar no altera el estado de sus apuntes.

---

## 9. Decisiones abiertas

1. **Comentarios.** El módulo no los contempla: la opinión se escribe en la nota
   compartida. Si en el uso resulta que importa quién dijo qué —dos personas
   discrepando sobre el mismo restaurante—, el mecanismo del apartado 5.3 de la
   especificación funcional es aplicable sin cambios.
2. **Un apunte en dos lugares.** Descartado por ahora. Aparecerá cuando algo sea
   cierto de Cambrils y de Llivia a la vez; duplicar el apunte es una respuesta
   aceptable mientras sea excepcional.
3. **Orden de la lista de lugares.** Por uso reciente, alfabético o manual. Con
   media docena de lugares la decisión es menor y conviene tomarla viendo la lista
   real.
4. **El campo de valoración acotado**, según lo dicho en el apartado 3.4.
5. **El nombre del módulo.** «Valija» nombra bien la maleta y peor el cuaderno de
   un sitio, que es en lo que ha quedado. Se conserva por ser el nombre con el que
   nació en casa, que suele ganar a cualquier alternativa mejor razonada.

El módulo no está construido: no tiene entidades en el esquema, ni representación
en la aplicación, ni pieza alguna en el repositorio.
