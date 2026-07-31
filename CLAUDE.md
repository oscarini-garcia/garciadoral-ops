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
  no quiera clasificar no tenga que hacerlo. **«Llevar» no es una clase más: es
  una lista de la compra** —una línea, una casilla y un aspa, sin descripción, sin
  voto y sin hilo—, va la primera porque es lo único que se mira de pie y antes de
  salir, tocar la línea entera tacha, y lo tachado baja al final para que lo que
  falta quede arriba. Cada línea lleva su firma —quién la puso y, **solo si ya no
  es de hoy**, cuándo— y la lista se comparte sola con su verbo en el rótulo. **El
  voto enseña las iniciales de
  quien votó y no un número** —con cuatro en casa, «MA·OS» contesta la pregunta
  que de verdad se hace— y **ordena su grupo**, que es lo único que separa un voto
  de un adorno. La pestaña tiene dos alturas dentro de sí misma y no una hoja para
  el sitio, y de ahí sale que el botón flotante tenga sus dos significados solos.
  La navegación entre las dos alturas son **migas en la línea del título**
  —«Sitios › Bolonia», con «Sitios» tocable—, y para eso el título de una pestaña
  puede devolver un nodo y no solo una cadena. En la lista, cada sitio dice **de
  qué va y no cuánto tiene**: «3 llevar · 2 hacer · 1 ir». Y el emoji pasa por
  `emojiVisible`, que le añade el selector de variación: sin él, 🏖 y compañía se
  dibujan a trazo monocromo y en un título de 29 puntos parecen un icono roto.
  **Y el emoji se escribe dentro del nombre**, como en un evento, no en un campo
  aparte: el campo aparte tenía un emoji de marcador, y **un marcador con emoji
  se ve igual que un valor** —el color se lo pone la fuente y el gris del CSS no
  le llega—, así que parecía relleno, se guardaba vacío y el sitio salía sin
  emoji sin que nada lo dijera. Un marcador nunca debe ser un emoji.
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
  razón de que existiera siendo tan poco código era la de después**, que ya ha
  llegado: `api/src/avisos.js` es esa misma pieza en el servidor, escrita con la
  misma forma —una lista de `FUENTES`— en vez de repartida por dentro de `hoy.js`.
  Lo que no son es la misma pregunta: **en el dispositivo un aviso es un estado**
  —qué te espera sin contestar— y **en el servidor es un suceso** —qué acaba de
  pasar—. Por eso uno se deriva de la instantánea y el otro, del lote de cambios.
- **Las notificaciones remotas están construidas.** Lo que se programaba en el
  dispositivo solo alcanzaba a lo que ya se sabía; que a otro le suene el teléfono
  porque acabas de pedirle un cambio de turno no lo puede programar nadie por
  adelantado, y ese era justo el aviso que servía para algo a las 7:40. Suena
  **Lío entero** —petición, corrección, acepto, no puedo, retirada, y los dos
  atajos que se escriben sin preguntar— y los comentarios en algo tuyo o en un
  hilo donde ya hablaste. **La visibilidad hay que volver a aplicarla**, porque el
  texto lo compone el servidor: se aplica componiendo la instantánea de quien
  recibiría el aviso y mirando si el objeto está dentro, sin escribir una segunda
  copia de la regla. La prueba que lo sostiene está en `api/test/avisos.test.js` y
  el caso que ataja no es teórico —quien comentó una idea antes de que se orientara
  hacia ella seguiría «participando en el hilo»—. **El texto viaja entero**, a
  sabiendas de que pasa por Apple y se queda en la pantalla de bloqueo: un aviso
  que hay que abrir para leer obliga a entrar para saber si hacía falta entrar.
  **Los botones abren la app** en vez de contestar a oscuras, porque una acción de
  segundo plano se pierde justo con la aplicación cerrada, que es el caso que
  importa. Y cuando alguien se queda el turno de otro, a quién se avisa sale del
  **cuadro que gobernaba al abrirse la ventana** y no del de ahora, por lo mismo
  que lo hace la pantalla: con el de ahora, tocar Ajustes cambiaría a quién se le
  avisó de un turno de la semana pasada. **Y no hace falta ningún esquema de URL**: una notificación no abre la
  aplicación por un enlace, la abre y le entrega su contenido. **Lo de Lío
  atraviesa el modo concentración y lo demás no** —menos las correcciones, que
  hablan del pasado—, que es la única distinción de urgencia que se hace: marcar
  de urgente lo que no lo es se paga en que nadie se fía del tercer aviso. **Y el
  globo del icono cuenta lo que espera respuesta y solo eso**, no las novedades:
  un comentario no reclama nada de nadie, y un número que solo baja abriendo la
  aplicación es un número que no se mira. Va en todos los avisos aunque no sean
  de Lío, porque es absoluto: uno que llegara sin él dejaría puesta la cuenta
  anterior. **Y lo escriben dos: el servidor en cada aviso** —lo único que
  funciona con la aplicación cerrada— **y la aplicación en cada instantánea**
  —lo único que funciona al contestar desde dentro, porque contestarte a ti mismo
  no genera aviso ninguno—. Esa segunda mitad es la única dependencia nativa que
  se añade además del push (`@capawesome/capacitor-badge`): ponerlo **a cero** se
  puede sin nada, pero a cero no es lo que hay que poner. Está en `specs/ux.md` §12.4, el token en `specs/modelo-datos.md` §2.9
  y el despliegue en `docs/despliegue-cloudflare.md` §4.6 y §8.3. **El recordatorio del turno
  propio se queda siendo local** y convive con el remoto: dicen cosas distintas
  —«te toca ahora» y «alguien ha tocado tu turno»— y el local funciona sin red y
  sin permiso de APNs, que es una red de seguridad que no cuesta nada. **Y
  descartar un aviso del teléfono no descarta nada del sobre**: son dos sitios, y
  iOS solo avisa del descarte si la aplicación está despierta, de modo que
  enlazarlos funcionaría a veces sí y a veces no. Queda abierto **qué pasa cuando
  alguien acumule avisos de una semana fuera**, que hoy es una pila que se
  descarta a mano. Y una atadura nueva: **el entorno de
  APNs tiene que coincidir con cómo se instaló la app** —`pruebas` desde Xcode,
  `produccion` desde TestFlight—; equivocarse da `BadDeviceToken` y nada más.
- **La aplicación se reparte por TestFlight interno y no por la App Store.** La
  revisión existe para que llegue cualquiera, y aquí no la va a usar nadie de
  fuera de casa: el círculo interno **no pasa por revisión** y la build está en
  los teléfonos minutos después de subirla. Cuesta dar de alta a cada una como
  usuaria de App Store Connect —con el rol más acotado, y con su Apple ID de
  siempre— y **no cuesta ficha ninguna**: ni descripción, ni capturas, ni
  cuestionario de privacidad. Lo único que se paga es que **una build caduca a
  los noventa días** y hay que volver a archivar, aunque no haya cambiado nada:
  lo de esos tres meses ya está en los teléfonos por OTA. Está en
  `docs/despliegue-cloudflare.md` §8.5, y el §8.4 —la ficha entera de la App
  Store— sigue escrito y sin usar, que es donde hay que ir el día que los
  noventa días dejen de compensar. La atadura que hereda es la de §4.6: **el
  Worker apunta a un solo entorno de APNs**, así que mientras se depura desde
  Xcode con `pruebas`, a los teléfonos de casa no les suena nada.
- **La marca de lo visto viaja: la tabla `visto`.** Guarda persona, tipo, objeto y
  **hasta qué momento**, no un booleano, que es lo que permite que un aviso
  descartado vuelva. Solo llega a su dueño. Se escribe al abrir el hilo, al
  descartar y al vaciar.
- **La cabecera ya no lleva el punto de sincronización**: se fue a Ajustes, a un
  apartado propio y por debajo de «La aplicación», con la fecha de la última correcta en palabras y la línea que
  es a la vez el dato y el verbo. Lo que había que no perder —que algo lleve un
  rato sin subir— lo dice **una línea en la subcabecera de Hoy**, y solo cuando
  pasa; y la demostración conserva **pastilla escrita permanente** en la cabecera,
  porque es lo único que cambia el significado de todo lo que se ve. **Y cuando falla dice por qué**: el estado
  guarda el motivo —«la API respondió 500», «no se pudo abrir la conexión segura
  con la API»— y lo escriben Ajustes y el `title` de esa línea. **Ese renglón se
  toca y se copia**, con el mensaje crudo del navegador dentro: un error de TLS no
  se transcribe a mano desde un teléfono. Antes se tiraba, y el
  panel acababa diciendo «no se ha podido: sin sincronizar», que es la misma
  frase dos veces.
- **Los comentarios ya no están enchufados a medias.** La lista de tipos vive en
  `api/src/comentables.js` —con su espejo en `scripts/agenda/modelo.py`— y el
  `CHECK` de la tabla se retiró en la `0009`, que es lo que hacía que cada módulo
  nuevo costara rehacerla. **Idea y regalo enseñan por fin su hilo**, que el modelo
  les prometía desde el principio y ninguna pantalla cumplía. Y la pieza creció lo
  justo: fecha en palabras, borrar el comentario propio y la raya de «sin leer».
  **Pero se dibuja como el extra que es**, no como una sección más de la hoja: sin
  rótulo, cada comentario en un renglón corrido y en gris —nombre en tinta, texto
  y cuándo en gris—, el campo sin caja y con el «Enviar» apareciendo al escribir.
  Ocupaba 87 de los 331 puntos del detalle de un evento sin ningún comentario;
  ahora 34, y 110 con dos en vez de 215. Se retiró la frase de «nadie ha dicho
  nada todavía», que costaba cuarenta puntos por decir lo que el hueco ya decía, y
  el tinte de la barra de cada comentario nuevo, porque la raya de «sin leer» ya
  dice dónde empieza lo que falta. **Lo que no se hizo fue esconderlos** detrás de
  un plegable, que ocupaba menos todavía: un comentario existe para que otro lo
  lea. Las cuatro formas están en `specs/prototipo-comentarios.html`.
- **Buscar se retiró de la barra** y no se sustituye. De las tres colecciones que
  su búsqueda global cubría, solo el banco de ideas acumula volumen. Si algún día
  duele, lo apuntado es **una lupa en la cabecera de Regalos** que filtre esa
  pantalla; lo que no debe volver a pasar es gastar un hueco de la barra en eso.
  `specs/ux.md` §7.3 no habla de esto: es el buscador de personas de Gente, que
  sigue en pie.
- **Al mergear, di qué versión tiene que estar puesta.** Un número, y dónde
  mirarlo: la aplicación escribe la suya abajo a la derecha en Hoy. Sin eso, la
  primera pregunta ante cualquier cosa que no se ve es «¿tengo lo nuevo?», y esa
  pregunta no se puede contestar desde la pantalla. Con el número delante, si lo
  que se ve no coincide es que falta el OTA, y si coincide es un fallo y hay que
  ir a buscarlo.
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
  en mergearse publica su trabajo bajo una versión que la primera ya quemó. Pasó
  con la 1.15.0 y volvió a pasar con la 1.27.0, que se llevó Sitios por delante:
  la web servía lo nuevo y los teléfonos seguían con lo anterior.
  **La red está ahora en el PR y no después del merge.** `ota.yml` sabía
  distinguir el caso desde la 1.15.0, pero avisa cuando el trabajo ya está en
  `main` y arreglarlo es otro PR. Y la comprobación de `pruebas.yml` no lo veía:
  miraba `pull_request.base.sha` —la `main` de cuando se abrió el PR—, y desde esa
  base las dos ramas ven un salto correcto. Ahora compara contra **la punta de
  `main` en el momento de correr**, comprueba que la versión sube y no baja, y
  pregunta además si esa versión ya tiene release publicada. Si vuelve a pasar,
  falla antes de mergear, que es cuando todavía se puede escribir otra cifra.
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
- **La frase del día es el quinto encargo de IA**, y el único que nadie pide: los
  otros cuatro contestan a un toque y este sale solo al abrir Hoy, bajo el
  saludo. Dos líneas con guasa sobre lo que hay apuntado —o sobre no haber nada,
  que es lo más frecuente—, **una al día y guardada en el teléfono**
  (`agenda.chispa` en `localStorage`, con su fecha dentro, que es lo que hace que
  no haya nada que barrer: la de ayer no se borra, se deja de reconocer). Pedirla
  en cada apertura la cambiaría al volver de la pestaña de al lado y dejaría de
  ser la frase *del día*; se toca y pasa a la siguiente. **Vienen de cinco en
  cinco y se enseñan de una en una**, así que el guardado lleva también por cuál
  se va —sin el índice, cerrar la aplicación volvería a la primera y las otras
  cuatro no se verían nunca—: cuesta lo mismo que pedir una, el toque contesta en
  el acto, y al gastar las cinco se pide otra tanda con las ya enseñadas dentro
  para que no repita. **Cada uno recibe la suya**, compuesta de su propia instantánea, y por
  eso la regla de ocultación se cumple sola: una sola para toda la casa habría
  obligado a inventar una instantánea «pública» que no existe. La maquinaria es
  la de los otros cuatro —mismo freno por minuto, misma cadena de modelos,
  instrucción editable en Ajustes (`ia.chispa`)—; lo suyo es el material y
  **el tema al azar**, sacado de los tipos de evento que la casa usa de verdad,
  que es lo que salva los días vacíos. **El tono se le marca a mano** —ironía seca, insinuar en vez de
  decir, y prohibidos los tacos y las exclamaciones—, porque sin decírselo no lo
  acierta: la primera tanda de verdad trajo un taco puesto para dar énfasis. Dos
  reglas más que no son de estilo: el encargo **prohíbe nombrar regalos, ideas y
  deseos** aunque el material nunca se los dé, porque esta es la pantalla que se
  lee con alguien al lado; y
  `/api/ia/chispa` **contesta 200 con la frase vacía** en vez de 503 cuando algo
  falla, porque nadie ha pedido nada y no hay a quién darle el error: la línea
  sencillamente no aparece. Está en `specs/ux.md` §6.5 y el porqué de cada
  decisión, en `specs/propuesta-frase-del-dia.html`. Queda abierto **si debería
  poder apagarse desde Ajustes sin borrar la clave**, que hoy no se puede.
- **Lío tiene voz, y es el sexto encargo de IA** (`ia.lio`). Una frase suya dentro
  de su bloque de Hoy, bajo el rótulo y encima de los turnos, en primera persona.
  **Dentro del grupo y no encima**: fuera del rótulo sería otra frase del día, y
  ya hay una. Comparte maquinaria entera con la chispa —cinco de golpe, de una en
  una, `agenda.frases.<voz>` en `localStorage`, se toca y pasa—, de ahí que
  `construirVoz` sirva a las dos. Lo suyo es el material, que es el único que se
  **deriva** en vez de leerse: el turno sale de la regla de siempre —manda la
  fila de `paseo` si existe, y si no el cuadro que gobernaba al abrirse la
  ventana—, con `cuadroEn` e `inicioDeVentana`, que ya usaba `avisos.js`. No es
  una cuarta copia de la regla; es la que hay, llamada desde `redaccion.js`. **La
  idea es de `lio-ops`**, la otra aplicación del perro, que no está en uso y se
  queda en inspiración: allí Lío tenía siete frases fijas y era lo mejor que
  tenía. Se le prohíbe reñir de verdad y inventar quién lo sacó. Queda abierto
  **si debería callarse los días que no hay nada que contar**, que hoy habla
  siempre.
- **Lío está construido**, y es el primer módulo que no cuelga de la agenda.
  Los turnos —mañana de 6 a 10, noche de 20 a 24— **se derivan de un cuadro de
  catorce casillas** que vive en `configuracion` y que solo editan los
  administradores desde Ajustes; **se escribe una fila de `paseo` cuando alguien
  marca el turno o cuando se acuerda un cambio**, y desde entonces esa fila manda
  sobre el cuadro. Eso es lo que hace que cambiar el reparto cambie el futuro y
  no reescriba el pasado; si algún día se toca `lio.js`, esa es la regla que hay
  que no romper —y está en los tres sitios a la vez: `pwa/publico/js/lio.js`,
  `api/src/lio.js` y `scripts/agenda/lio.py`—. **Y a «¿sacaste a Lío?» se puede contestar que no**: el aspa al lado del visto en
  la fila de Hoy, «No salió» en la hoja, y solo sobre el turno propio. Sin marcar
  es no saberlo; no haber salido es saber que no. Se guarda con `hecho_en` y sin
  `hecho_por_id`, que es una combinación que no escribe ninguna otra operación,
  así que no llevó columna nueva.
  **Y el cuadro tiene vigencia: es la lista de los que ha habido, con el instante
  desde el que valió cada uno**, porque con uno solo cambiar el reparto reescribía
  hacia atrás los días que nadie marcó. Cada turno se deriva del que gobernaba al
  abrirse su ventana; guardar añade versión salvo que entre dos guardados no se
  haya abierto ninguna, que es lo que hace que los catorce toques de una edición
  sean una. No llevó migración: el formato viejo se lee como «una versión, desde
  siempre». Está en `specs/propuesta-cuadro-con-vigencia.html`.
  En la semana va como carril propio
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
  turno a turno. La atadura que tenía —que el aviso de pedirte un cambio no podía
  empujarse— **se ha levantado**: eso son ahora los avisos remotos, y Lío suena
  entero.
- **No queda ninguna migración por aplicar.** Las trece están puestas, incluidas
  las cinco `.unavez` —los círculos (`0005`), el género (`0006`), la `0009` que
  rehizo `comentario` para quitarle el `CHECK`, la `0012` de la casilla de la
  lista de la compra y la `0013` del token del aparato—. **Estas dos últimas
  estuvieron apuntadas aquí como pendientes después de aplicarse**, y esa mentira
  costó tres despliegues en rojo: quien se fía de esta lista vuelve a pedirlas y
  el `ALTER TABLE` contesta `duplicate column name`. Si una `.unavez` se repite
  ahora, el despliegue lo dice y **sigue** en lugar de cortarse, pero **este
  apartado hay que actualizarlo al aplicar una**, que es lo único que impide que
  vuelva a pasar. Ninguna de las cinco se vuelve a pedir porque no se pueden
  repetir: el `ALTER TABLE` falla si la columna ya está, y rehacer una tabla dos
  veces es copiar y tirar sin motivo. El paquete que las llevó todas
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
