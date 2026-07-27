# CLAUDE.md

Guía para trabajar en este repositorio.

## Orientarse sin leerse la aplicación

Al abrir una sesión, el hook `SessionStart` inyecta el mapa del repositorio
—módulos y qué hace cada uno, rutas de la API, workflows, correspondencia con
`specs/`, variables de entorno, pruebas— más el estado de la rama. Se genera en
ese momento con `herramientas/mapa.py`, así que describe el código de ese
instante y no puede desfasarse.

Con eso basta para saber **dónde mirar**; el detalle se lee bajo demanda. No
hace falta recorrer la aplicación entera al empezar.

- `docs/mapa.md` es ese mismo texto, versionado. **Es generado: no se edita a
  mano.** Se regenera con `python3 herramientas/mapa.py` y `pruebas.yml`
  comprueba que corresponde al código de su commit.
- Si un módulo nuevo no aparece bien descrito en el mapa, lo que falta es su
  docstring, no una entrada en el mapa: la primera frase del docstring es lo que
  se publica ahí. Lo mismo con la correspondencia con `specs/`, que se lee de las
  citas a `specs/…md §N` que el código lleva en sus comentarios.

## En curso

Lo único de todo esto que se escribe a mano, porque no se deduce del código.
Actualízalo al terminar un trabajo: qué queda abierto y qué decisión está
pendiente. El hook lo inyecta al final del mapa.

- **Hay una propuesta cerrada y sin construir: el módulo de Sitios**, en
  `specs/propuesta-sitios.html`. **No queda nada por decidir**, y el orden de
  construcción está en su parte 10: primero la migración de `comentario` y el
  registro de comentables —que arregla algo que ya está mal y no depende de nada—,
  después Sitios sin voto ni hilo, luego el voto y el hilo, después `avisos.js` con
  la tabla `visto` y el sobre, después el apartado de sincronización en Ajustes, y
  por último los apuntes del modelo, que es lo único que puede quedarse sin hacer
  sin que el módulo cojee. Un sitio con apuntes de **llevar, hacer, ir o
  saber**, cada uno con descripción y hoja propia, con voto —un pulgar, con las
  iniciales de quien votó en vez de un número— e hilo de comentarios; en el hueco
  que deja Buscar en la barra de abajo, que se retira sin sustituto. **Borrar un
  sitio exige vaciarlo antes.** La hoja del apunte lleva sus tres verbos arriba
  junto al título —editar, compartir y borrar—, y ahí **se desvía a propósito de la
  regla del evento**, que manda borrar al formulario: un apunte es una línea y su
  formulario son dos campos. Lleva dos cosas más: apuntes escritos por un modelo,
  que es un encargo más de los que ya viven en Ajustes y un extremo más en el
  Worker, y compartir, que va a dos alturas y con dos contenidos distintos —el sitio
  entero **sin** votos ni comentarios, porque sale del círculo de casa; un apunte
  suelto **con** su descripción y su hilo, porque ahí lo que se manda es la
  conversación, y la hoja lo dice antes de enviar—. El verbo que le pide apuntes al
  modelo **vive dentro del formulario de apunte nuevo**, debajo del título, que es
  cuando uno ya está pensando justo eso; ni botón fijo en la cabecera del sitio ni
  cuatro renglones al pie de los cuatro grupos. Y **un sitio no sale del círculo de
  casa**, que es de donde sale gratis que el módulo nunca evalúe la función de
  visibilidad.
- **Y de ahí sale una pieza que no es de Sitios: `avisos.js`.** Lo que se acumula
  arriba de Hoy ya es un módulo de avisos —hoy `vistas/hoy.js` importa
  `tratosParaMi` de `lio.js` y dibuja sus peticiones—. Lo decidido es **un registro
  derivado de la instantánea**, no una tabla: cada módulo dice qué tiene pendiente
  para quien mira, y Hoy lo pinta sin saber qué es un turno de perro. **Lleva solo
  lo que hay que contestar**; que a uno le hayan comentado se sabe por **marcas en
  contexto** —punto en la tarjeta del sitio, punto en la línea del apunte, raya de
  «sin leer» dentro del hilo— y no por una lista de novedades. La razón de escribir
  el registro es la de después: cuando llegue APNs, el servidor tendrá que
  contestar esa misma pregunta, y si vive repartida por dentro de `hoy.js` habrá
  que escribirla dos veces. **Se enseña en un sobre en la cabecera que solo existe
  cuando hay algo** —así el icono no está mudo veinticinco días de cada treinta, y
  que aparezca *es* el aviso, sin punto ni número—; sobre y no campana, porque una
  campana que no puede sonar enseña a no fiarse del icono. Dentro van dos grupos, y
  **solo el de abajo se descarta**: descartar una petición de turno dejaría al otro
  esperando una respuesta que ya nadie va a dar. Descartar significa «ya lo he
  visto», así que un comentario posterior en ese hilo lo trae de vuelta. Y con una
  × y no con un deslizamiento: `deslizarHorizontal` ya significa «llévame al
  siguiente» en la agenda, y darle un segundo significado es como un gesto deja de
  ser fiable.
- **Y eso obliga a que la marca de lo visto viaje: entra la tabla `visto`.** Se
  propuso local mientras era pasiva —leer—, pero **un descarte es un acto**, y un
  acto que se deshace al abrir el iPad no es un acto. Guarda persona, tipo, objeto y
  **hasta qué momento**, no un booleano: es lo que permite que el aviso vuelva
  cuando llega algo posterior. Solo viaja a su dueño y hereda la visibilidad sola,
  porque la escribe quien ya podía ver el objeto.
- **La cabecera pierde el punto de sincronización.** Se va a Ajustes, a un apartado
  propio —no dentro de «La aplicación», que es de la instalación—, con la fecha de
  la última correcta escrita en palabras y con la misma forma que la versión: la
  línea es a la vez el dato y el verbo, y al tocarla cuenta los tres pasos reales
  —subir lo pendiente, traer la copia, guardarla—. **Lo que hay que no romper al
  hacerlo:** ese punto era el único sitio donde se veían tres estados —sin conexión,
  sin sincronizar y **demostración**—. Lo propuesto es nada mientras va bien y una
  línea en la subcabecera de Hoy cuando lleva un rato fallando; y la demostración,
  que cambia el significado de todo lo que se ve, se queda con **pastilla escrita
  permanente en la cabecera**, solo en demostración.
- **Y la parte que importa aunque nada de eso se construya: los comentarios están
  enchufados a medias.** `pwa/publico/js/comentarios.js` es una pieza compartida de verdad,
  pero solo se la llama con `'evento'` —`vistas/semana.js` y `vistas/regalos.js`,
  dos llamadas en toda la aplicación—, mientras que la tabla, el filtro del
  Worker, el modelo en Python y `especificacion.md` §5.3 admiten los tres tipos:
  una idea o un regalo pueden tener hilo y **ninguna pantalla lo enseña**. Y la
  lista de tipos está copiada en cinco sitios —el `CHECK` de `0001_esquema.sql`,
  `filtrado.js`, `TIPOS_COMENTARIO` y su diccionario en `modelo.py`, y
  `comentarios_visibles` en `visibilidad.py`—, así que un cuarto tipo los toca los
  cinco y además obliga a rehacer la tabla, porque un `CHECK` de SQLite no se
  altera.
- **Al tocar cualquier cosa de `pwa/publico/`, sube dos versiones, no una.**
  Son dos caminos distintos: `VERSION` en `pwa/publico/sw.js` es lo que hace que
  el **navegador** deje de servir los módulos de su caché, y `version` en
  `pwa/package.json` es lo que hace que `ota.yml` corte un bundle nuevo para la
  **app de iPhone**. Los dos fallos se ven igual: el cambio está en el
  repositorio y en la pantalla sigue lo de antes. `pruebas.yml` comprueba las dos
  en cada PR.
  **Y con la del OTA va pegada una tercera**, `VERSION_APP` en
  `pwa/publico/js/version.js`, que es la copia que lee la pantalla de Hoy para
  escribir qué versión hay instalada: aquí no hay empaquetador que la inyecte.
  Esa no es un camino más —no hace que nada llegue ni deje de llegar—, solo tiene
  que decir la verdad, y `tests/test_version.py` falla si deja de coincidir con
  `pwa/package.json`.
  **Y súbelas por encima de lo que haya en `main` en ese momento, no de donde
  saliste.** Con dos ramas abiertas a la vez, las dos suben desde la misma base a
  la misma versión, git funde las dos líneas idénticas sin conflicto y la segunda
  en mergearse se encuentra la versión ocupada. Eso pasó con la 1.15.0. El
  workflow ya no lo deja pasar callando: si la versión tiene release y el empujón
  cambia el bundle, falla y dice qué se habría quedado sin publicar.
- **La barra inferior tiene ahora cinco entradas y la primera es Hoy**, que es
  con la que abre la aplicación. Es la síntesis que `specs/ux.md` §11 dejaba
  apuntada y está descrita en §6.5: la semana no ha cambiado en nada, solo se ha
  corrido a la segunda pestaña. De momento Hoy compone tres cosas —el saludo con
  el nombre de quien mira, ocupando la línea del título; la lista del día, con
  los cumpleaños dentro; y la versión instalada abajo a la derecha, que al
  tocarla busca si hay una nueva y va contando por dónde va en esa misma línea—.
  Queda abierto **qué bloques estacionales entran después y con qué umbrales**
  —la ocasión abierta, el próximo cumpleaños, las últimas ideas—, que es la
  cuestión 3 de §13, y **si Hoy debería tener botón flotante**; hoy no lo tiene.
  Con la versión hay una atadura nueva: la cifra vive en `pwa/package.json` y la
  web lleva su copia en `pwa/publico/js/version.js`, así que **al subir la
  versión del OTA hay que subir también esa**. `tests/test_version.py` falla si
  se separan.
- **Lío está construido**, y es el primer módulo que no cuelga de la agenda.
  Los turnos —mañana de 6 a 10, noche de 20 a 24— **se derivan de un cuadro de
  catorce casillas** que vive en `configuracion` y que solo editan los
  administradores desde Ajustes; **se escribe una fila de `paseo` cuando alguien
  marca el turno o cuando se acuerda un cambio**, y desde entonces esa fila manda
  sobre el cuadro. Eso es lo que hace que cambiar el reparto cambie el futuro y
  no reescriba el pasado; si algún día se toca `lio.js`, esa es la regla que hay
  que no romper —y está en los tres sitios a la vez: `pwa/publico/js/lio.js`,
  `api/src/lio.js` y `scripts/agenda/lio.py`—. En la semana va como carril propio
  encima de la rejilla, no como línea de día; en Hoy, la banda de lo que hay que
  contestar y los dos turnos; y sale en el plan de WhatsApp en su propio renglón,
  fuera del techo de tres. Está en `specs/ux.md` §10.3, las entidades en
  `specs/modelo-datos.md` §2.6 y el porqué de la forma, en
  `specs/propuesta-lio.html`. **Y el sol y la luna van delante del nombre, no en su lugar**: «☀️ Por la
  mañana», «🌙 Por la noche», en la hoja del turno, en las filas de Hoy, en las
  columnas del cuadro de Ajustes y en el aviso del teléfono; en el carril de la
  semana van solos, porque en 38 puntos no cabe la frase. La regla de quién puede escribir qué tiene
  ahora una frontera de reloj: dentro de la ventana, decir que has sacado a Lío
  se escribe en el acto aunque el turno fuera de otro; **pasada la ventana, eso
  vuelve al trato** y lo confirma quien lo tenía, porque ya no es cargar con un
  recado sino escribir la memoria de otro. Y «Cancelar» va a la derecha del verbo y en
  su misma línea, como en el formulario de evento; solo cuando no hay verbo
  ninguno se va al final de la hoja. La propuesta pendiente dentro de la hoja del
  turno va sin caja: el recuadro de color se queda para la banda de Hoy.
  **La lista tiene ahora dos niveles de separador**: el grupo de proximidad en
  serifa y el día en versalita con una raya hasta el margen, elegido entre las
  cuatro formas de `specs/prototipo-separadores-de-lista.html`; y en cuanto hay
  separador de día, la fecha sale de dentro de la tarjeta, también en el detalle
  del mes. Queda abierto **si el rezagado de ayer debería
  poder marcarse más de un día después** —hoy sube una vez y desaparece— y **qué
  hacer cuando alguien se va de vacaciones**, que hoy se resuelve a mano cambiando
  turno a turno. Y una atadura: el aviso de que te piden un cambio **no puede
  empujarse**; las notificaciones son locales y solo alcanzan al turno propio.
- **Quedan dos migraciones por aplicar: `0007_estado_regalo.sql`**, que convierte
  a «comprado» lo que estuviera «envuelto», **y `0008_lio.sql`**, que crea las dos
  tablas de Lío. Las dos son corrientes y no `.unavez` —se pueden repetir sin
  consecuencias—, así que basta con marcar la casilla de las migraciones al
  desplegar la API. Sin la de Lío, la aplicación no falla pero el módulo no
  aparece: el cuadro no se puede guardar y no hay dónde escribir los paseos. Las dos `.unavez` —los círculos (`0005`) y el
  género (`0006`)— ya están puestas, y no se vuelven a pedir porque no se pueden
  repetir: el `ALTER TABLE` falla si la columna ya está. La
  pantalla de Gente está decidida y construida: tres círculos
  —Familia (los cuatro de casa, cerrado), Familia Extendida y Amigos—, con
  conmutador y sin avatares, el parentesco relativo a quien mira y el género
  para afinarlo. Está en `specs/ux.md` §7.1 a §7.3; el porqué de la elección se
  conserva en `specs/propuesta-familia-circulos.html`.
- **La pestaña de Ocasiones ya está construida** en dos apartados plegables:
  Fechas señaladas —Navidad y compañía, con sus verbos detrás de la pastilla— y
  Cumpleaños, derivados de las fichas y ordenados por el que viene antes. Está en
  `specs/ux.md` §6.1. No hay nada que migrar para desplegarla: la felicitación
  guarda su encargo en la tabla `configuracion`, que ya existe, y se apaga sola si
  no hay clave de Anthropic puesta. Queda abierto **si los cumpleaños deben
  arrancar desplegados** —hoy van plegados, con el próximo escrito en el rótulo— y
  qué hacer con las fechas señaladas cerradas cuando se acumulen una por año.
- **La pestaña de Regalos tiene cuatro apartados**: Deseos, Ideas, Regalos y
  Ocasiones. Los tres últimos van en el orden del ciclo; **Deseos va el primero**
  porque no es un paso de ese ciclo —es lo único que habla de uno mismo— y está
  en `specs/ux.md` §6.3. Allí no se pregunta para quién ni se dice nunca cómo va
  un deseo: la pastilla de «en curso» sobre lo que uno pide sería el aviso de que
  alguien te ha comprado eso. Y lo que alguien ha pedido encabeza ahora el
  selector de regalos, que antes solo ofrecía el banco de ideas y dejaba los
  deseos alcanzables únicamente desde la ficha de esa persona. Queda abierto **si
  «Deseos» debería ser también la pestaña con la que se abre**; hoy se abre en
  Ideas.
- **La sección de Regalos** está en `specs/ux.md` §6.2: lo
  que hay cogido para alguien, por estado —Por comprar y Listos—, con los filtros
  de «los que llevo yo» y «sin nadie», y lo que ya pasó de fecha en un apartado
  plegado al final. **Nada se archiva solo al pasar la fecha**: lo que archiva es
  dar la ocasión por cerrada a mano, que es un verbo nuevo del detalle de la
  ocasión y que además cierra las ideas que salieron de allí. Los estados del
  regalo son ahora tres —se retiró «envuelto»—. El análisis del ciclo y las
  opciones que se descartaron están en `specs/propuesta-ciclo-del-regalo.html`;
  queda abierto **cómo partir los dos grupos cuando un diciembre acumule treinta
  regalos**, que es cuando los rótulos dejarán de bastar.
- **El banco de ideas va en dos apartados plegables** —Seleccionadas primero y
  Disponibles después— y la marca de una idea ya cogida es un visto suelto, sin caja y
  sin palabra: la pastilla de «en curso» se retiró. Los verbos de una idea son
  editar y descartar, arriba junto al título; «Duplicar» ya no existe, así que
  reutilizar una idea del año pasado es volver a escribirla. Está en
  `specs/ux.md` §6.4, y las cuatro maneras de marcarla que se estudiaron, en
  `specs/prototipo-marca-seleccionada.html`.
- **Lo que queda del flujo de las ideas está analizado y sin construir**, en
  `specs/propuesta-idea-de-punta-a-punta.html`: el ciclo lineal —mientras una
  idea es regalo no es idea, y vuelve a la lista si se tira atrás el regalo—, la
  ficha con el precio dentro, «seleccionada» en lugar de «en curso», borrar como
  verbo de la cabecera y «Duplicar» fuera. La propuesta deja apuntado que hoy hay
  un punto sin retorno escondido: entregar el regalo cierra la idea para siempre,
  y retirarlo después no la devuelve.
- **Presupuesto.** El panel está retirado de la pestaña de Regalos mientras se
  decide qué forma tiene. Lo que sostiene sigue en pie y sin tocar: la escritura
  de `presupuesto` en el Worker, el envío del importe a los administradores en la
  instantánea, `gastoDe` en `modelo.js` y las reglas de la tabla en el CSS.
- **Si se deriva algo nuevo en el dispositivo**, hay que resolverlo también en
  `api/src/redaccion.js` (`visiblesDe`). Los cumpleaños no son filas de `evento`
  —se componen en `pwa/publico/js/semana.js` con un identificador
  `derivado:<qué>:<de quién>`— y el Worker los descartaba al redactar, de modo
  que el mensaje salía sin ellos y nadie se enteraba. Ya no calla: lo que no
  reconoce vuelve en `omitidos` y sale al probar desde Ajustes. Un evento de
  tipo «viaje» o uno importado de un calendario externo no entran en esto: son
  filas de `evento` y llegan en la instantánea como los demás.
- Lo demás pendiente de construir está en el apartado 7 del `README`: los
  calendarios externos, la copia periódica de salvaguarda y la parte configurable
  del recordatorio previo.

## Codificación de archivos generados

Todos los archivos `.md` y `.html` que se generen para especificaciones (specs) y
documentos similares deben crearse **siempre con codificación UTF-8**, para que los
caracteres acentuados y especiales se muestren correctamente como artefactos UTF-8.

- Guarda siempre en UTF-8 (sin BOM).
- En los `.html`, incluye `<meta charset="utf-8">` en el `<head>`.
- No sustituyas caracteres acentuados (á, é, í, ó, ú, ñ, ¿, ¡, …) por entidades ni
  por versiones sin acento; deben conservarse tal cual en UTF-8.

## Mostrar los ficheros como artefactos

Los artefactos son para **revisar especificaciones**, no para acompañar al código.

**Publica como artefacto** los `.md` y `.html` que se generen o se modifiquen
mientras se **redactan o iteran especificaciones**: los documentos de `specs/`,
los prototipos de interfaz y cualquier propuesta que esté sobre la mesa para
comentarla. En esa fase el usuario necesita verlos renderizados en el chat, no
abrirlos aparte.

- Al actualizar un fichero ya publicado, vuelve a publicar el artefacto en la
  misma URL en lugar de crear uno nuevo.
- Mantén el artefacto y el archivo guardado en el repositorio con el mismo
  contenido.

**No publiques artefactos al implementar.** Cuando el trabajo es escribir código
—incluidos su `README`, sus guías de despliegue, sus notas de operación o
cualquier otro documento que nazca junto al código—, basta con guardar los
ficheros en el repositorio y resumir el resultado en la conversación. Si en algún
caso concreto quiero ver uno de esos documentos renderizado, lo pediré.
