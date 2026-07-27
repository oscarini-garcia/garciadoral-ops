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

- **Sitios está construido**, y es el segundo módulo que no cuelga de la agenda.
  Un sitio es la carpeta y los apuntes cuelgan de él, con **cuatro clases que son
  verbos —Llevar, Hacer, Ir y Saber—** y «Saber» puesta de origen, para que quien
  no quiera clasificar no tenga que hacerlo. **El voto enseña las iniciales de
  quien votó y no un número** —con cuatro en casa, «MA·OS» contesta la pregunta
  que de verdad se hace— y **ordena su grupo**, que es lo único que separa un voto
  de un adorno. La pestaña tiene dos alturas dentro de sí misma y no una hoja para
  el sitio, y de ahí sale que el botón flotante tenga sus dos significados solos.
  **Borrar un sitio exige vaciarlo antes**, y eso lo comprueba también el Worker,
  porque la pantalla decide con la instantánea que tenga. Compartir va a dos
  alturas con dos contenidos distintos: el sitio **sin** votos ni nombres, un
  apunte **con** su hilo entero, y la aplicación lo dice antes de enviar. Está en
  `specs/ux.md` §12.1, las entidades en `specs/modelo-datos.md` §2.7, y el porqué
  de cada decisión en `specs/propuesta-sitios.html`. Queda abierto **cómo partir un
  sitio cuando acumule cuarenta apuntes** —hoy los cuatro rótulos bastan— y **si un
  sitio debería poder salir del círculo de casa**, que hoy se decidió que no.
- **`avisos.js` es la pieza que no es de Sitios.** Reúne lo que espera a quien
  mira, venga del módulo que venga, **derivado de la instantánea y no de una
  tabla**: si un aviso fuera una fila escrita por el Worker, contestar un trato
  desde la agenda la dejaría ahí mintiendo. Dar de alta un módulo es una línea en
  `FUENTES`. Se enseña en **un sobre en la cabecera que solo existe cuando hay
  algo** —que aparezca *es* el aviso, sin punto ni número—, con dos grupos de los
  que **solo el de abajo se descarta**: quitar una petición de turno dejaría al
  otro esperando sin rastro. Descartar significa «ya lo he visto», así que un
  comentario posterior lo trae de vuelta. Hoy conserva su banda de lo que espera
  respuesta, que se contesta de un toque. Está en `specs/ux.md` §12.2. **Y la
  razón de que exista siendo tan poco código es la de después:** cuando llegue
  APNs, el servidor tendrá que contestar esa misma pregunta, y se reescribirá con
  la misma forma en vez de estar repartida por dentro de `hoy.js`.
- **La marca de lo visto viaja: la tabla `visto`.** Guarda persona, tipo, objeto y
  **hasta qué momento**, no un booleano, que es lo que permite que un aviso
  descartado vuelva. Solo llega a su dueño. Se escribe al abrir el hilo, al
  descartar y al vaciar.
- **La cabecera ya no lleva el punto de sincronización**: se fue a Ajustes, a un
  apartado propio, con la fecha de la última correcta en palabras y la línea que
  es a la vez el dato y el verbo. Lo que había que no perder —que algo lleve un
  rato sin subir— lo dice **una línea en la subcabecera de Hoy**, y solo cuando
  pasa; y la demostración conserva **pastilla escrita permanente** en la cabecera,
  porque es lo único que cambia el significado de todo lo que se ve.
- **Los comentarios ya no están enchufados a medias.** La lista de tipos vive en
  `api/src/comentables.js` —con su espejo en `scripts/agenda/modelo.py`— y el
  `CHECK` de la tabla se retiró en la `0009`, que es lo que hacía que cada módulo
  nuevo costara rehacerla. **Idea y regalo enseñan por fin su hilo**, que el modelo
  les prometía desde el principio y ninguna pantalla cumplía. Y la pieza creció lo
  justo: fecha en palabras, borrar el comentario propio, una frase cuando está
  vacío y la raya de «sin leer».
- **Buscar se retiró de la barra** y no se sustituye. De las tres colecciones que
  su búsqueda global cubría, solo el banco de ideas acumula volumen. Si algún día
  duele, lo apuntado es **una lupa en la cabecera de Regalos** que filtre esa
  pantalla; lo que no debe volver a pasar es gastar un hueco de la barra en eso.
  `specs/ux.md` §7.3 no habla de esto: es el buscador de personas de Gente, que
  sigue en pie.
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
  cuestión 3 de §14, y **si Hoy debería tener botón flotante**; hoy no lo tiene.
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
- **No queda ninguna migración por aplicar.** Las once están puestas, incluidas
  las tres `.unavez` —los círculos (`0005`), el género (`0006`) y la `0009`, que
  rehizo `comentario` para quitarle el `CHECK`—, que no se vuelven a pedir porque
  no se pueden repetir: el `ALTER TABLE` falla si la columna ya está, y rehacer una
  tabla dos veces es copiar y tirar sin motivo. El paquete que las llevó todas
  juntas —`todas-las-pendientes.unavez.sql`, con su prueba— se borró al aplicarse,
  que era lo previsto: valía para una sola noche y las numeradas son las que
  cuentan la historia. **Al escribir una nueva**: corriente si se puede repetir
  —`CREATE TABLE IF NOT EXISTS`, un `UPDATE` que la segunda vez no encuentre nada—
  y entonces basta con marcar la casilla al desplegar; `.unavez` si lleva
  `ALTER TABLE`, reparte datos o rehace una tabla, y entonces hay que escribir su
  nombre en el campo de al lado. Y que **termine en una sentencia y no en
  comentarios**: lo que quede detrás del último `;` se lo lleva `wrangler` a un
  aviso que no avisa de nada.
- **La pantalla de Gente está decidida y construida**: tres círculos
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
