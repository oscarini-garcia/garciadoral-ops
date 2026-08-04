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

- **El portero está extraído, y la baja llevaba una semana rota.** La auditoría
  de esta vuelta encontró que `POST /api/cuenta/baja` contestaba 500 a todo el
  mundo desde el 27 de julio —un refactor renombró `verificarSesion` en el
  `import` de `index.js` y una línea del handler se quedó con el nombre viejo;
  ninguna prueba ejercitaba la ruta—, que es la 5.1.1(v) incumplida. Está
  arreglado, y lo que lo habría cazado existe ahora: `api/test/rutas.test.js`
  pide a los handlers de verdad con una base de mentira, y los errores van por
  clases —`SinCredencial`, un solo `Rechazo`— en vez de por la regex
  `/sesión|token|firma/` que clasificaba 401 contra 500 por la redacción del
  mensaje. **Lo genérico del acceso vive en `api/src/portero/`** —Apple,
  sesiones, revocación y sala de espera— y no sabe qué es una `persona`: la
  aprobación recibe un adaptador, `api/src/cuentas.js`, que es lo único que
  conoce el esquema local, y otra aplicación con el mismo patrón —autenticación
  por Apple, autorización por la app— copia la carpeta y escribe el suyo. En la
  PWA la puerta es `acceso.js`, con sus enganches (`alEntrar`, `verDemo`,
  `pie`), y la bandeja, `bandeja.js`. El removal quedó parejo: quitarle la
  cuenta a alguien desde su ficha limpia ahora lo mismo que la baja voluntaria
  —dispositivos con su token de push, preferencias, accesos a categorías—,
  pregunta antes con el daño escrito y avisa si se va la última administradora;
  y salir o darse de baja cancelan los recordatorios locales, que seguían
  sonando sesenta días con el contenido de una agenda ajena. Los estados raros
  también: la persona aprobada nace en el círculo que diga la bandeja —antes
  caía en `extendida` y quedaba fuera de Lío sin que nada lo dijera—, reenviar
  la solicitud no pisa el correo que el administrador miraba, la caducidad de
  los catorce días cuenta desde `visto_en`, el rechazado tiene «Volver a
  pedirlo», el push de «alguien quiere entrar» se agrupa por Apple ID —insistir
  ya no tamborilea— y `identificador_apple` solo acepta `null` por
  `/api/cambios`: el vínculo lo establece únicamente la aprobación. De UI: la
  agenda pinta el regalo con el mismo texto de estado y el mismo pie que
  Regalos, fechas en palabras donde había ISO, el único `confirm()` nativo pasó
  a hoja, «Crear» al crear y «Guardar» al editar, «Cancelar» siempre a la
  derecha del verbo y en tono discreto, `--ink-faint` sube de 2,4:1 a 4,5:1,
  los blancos de toque llegan a 44 por pseudoelemento sin tocar el dibujo, el
  botón de Apple es un `<button>` de verdad que se desactiva mientras la
  petición viaja, `campo()` asocia cada etiqueta a su control y la hoja modal
  toma nombre de su título. Queda abierto: **retirar la cláusula «token sin
  `tipo` = sesión plena»** cuando caduquen los últimos viejos (a partir del 27
  de agosto); **el resto de la lista A4** —`emojiVisible` fuera de Sitios, el
  sobre con iconos dibujados en vez de emoji, las tres casillas casi iguales,
  títulos de hoja con un patrón—; y **el endurecimiento B4** —verificar el
  `nonce` de Apple, freno de tasa en `/api/sesion`, y `migrar:local`/`remoto`,
  que siguen aplicando solo de la 0001 a la 0004—. Ascender el portero a
  paquete compartido espera a que exista un segundo consumidor de verdad.
- **Entrar con Apple ya no pregunta nada, y eso vino de un rechazo de la App
  Store.** La 1.1 se cayó por la **directriz 4**: después de Sign in with Apple no
  se puede pedir un dato que el marco de Apple ya entrega, y la sala de espera
  abría un formulario con «¿quién eres?». La trampa está en que **Apple solo
  entrega el nombre en la primerísima autorización de esa cuenta**, así que un
  campo «solo para cuando falte» acaba siendo el campo de todo el mundo a partir
  de la segunda vez —y quien revisa la aplicación entra siempre por esa segunda—.
  Ahora entrar con Apple **es** pedir entrar: la solicitud sale sola con lo que
  Apple haya dado, sin nombre si no lo hay, y ponerlo es un enlace voluntario en
  la pantalla de espera. En el Worker, `registrarSolicitud` ya no lo exige y
  guarda `''` —no `NULL`, para no rehacer la tabla que la `0003` declaró
  `NOT NULL`—, reenviar sin nombre no borra el que ya hubiera, la bandeja dice
  «Sin nombre» y el aviso al administrador, «Alguien quiere entrar». Y donde
  había un formulario de reserva ahora hay un «Volver a intentarlo»: pedir un
  dato a cambio de un fallo de red era lo mismo con otra excusa. Está en
  `specs/autenticacion.md` §4, §5 y §8. Los otros dos rechazos de esa misma
  ronda —2.1(a), que no podían entrar, y 2.3.8, que el nombre bajo el icono
  decía «Agenda»— ya estaban arreglados en `main` (#72 y #113): la build
  revisada era de antes. **Y el botón dice ahora «Continuar con Apple»**, que es
  una de las tres fórmulas oficiales de Apple en español; «Entrar con Apple» no
  lo es y la directriz 4 cubre también el rótulo. De las tres, esta y no
  «Iniciar sesión con Apple» porque el botón hace las dos cosas —quien ya es de
  casa entra, y quien no, deja su solicitud—, que es justo el caso para el que
  Apple reserva «Continuar». No lo habían citado; se cambia porque cuesta una
  línea y la aplicación ya viene señalada por esa directriz una vez.
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
  descarta a mano. Y una regla que no se toca: **`APNS_ENTORNO` se queda en
  `produccion`**. Tiene que coincidir con cómo se instaló la app —`pruebas` desde
  Xcode, `produccion` desde TestFlight y la App Store—, y aquí se instala siempre
  por TestFlight; equivocarse da `BadDeviceToken` y nada más.
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
  noventa días dejen de compensar. **Y lo que era una atadura de §4.6 ya no lo
  es**: el Worker apunta a un solo entorno de APNs, y con eso no se podía depurar
  desde Xcode con `pruebas` y tener sonando los teléfonos de casa a la vez. Se ha
  decidido no depurar así —todo se prueba desde TestFlight y producción—, de modo
  que el conflicto no llega a existir y la variable se queda quieta.
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
- **Ajustes junta ahora sync, versión y viajes en un solo apartado**, que se
  llama «Sincronización», va el primero y es el único abierto de origen. Eran
  tres —«La aplicación» con «Buscar actualización», «Sincronización» con su
  línea y «✈️ Viajes» con su botón— y entre los tres **obligaban a acertar cuál
  era tu problema antes de dejarte mirar**; nadie llega ahí sabiendo eso. Un solo
  botón, «Comprobar ahora», hace las tres en el orden que importa —datos,
  viajes, bundle— y las cuenta en una sola lista que se lee de arriba abajo. Los
  viajes solo los trae quien administra, porque la ruta es suya, y a quien no lo
  sea sencillamente no le sale ese renglón. «✈️ Viajes» se queda sin botón y con
  su diagnóstico, que es otra cosa. La idea es de `meeting-ops-air`, que copió
  esta pantalla y luego la mejoró.
  **Y los apartados llevan ahora moneda**, la figura de los Ajustes del
  sistema. Antes solo dos llevaban algo delante —🐾 Lío y ✈️ Viajes—, y no por
  ninguna decisión sino heredado de donde salió cada módulo, de modo que la
  columna se leía como un descuido. Los emoji se van: los dibuja iOS, no siguen
  el tema y varios —✈️ el primero— salen a trazo monocromo sin el selector de
  variación, que es el fallo que ya dio 🏖 en Sitios. Los dibujos están en
  `ICONOS` de `js/ui.js`, sobre la misma rejilla de 24 y con el mismo grosor que
  los de la barra; el de la IA no hubo que dibujarlo, es `destello`, que ya
  significaba «esto lo escribe la IA». **La moneda va en tinta suave con el
  dibujo en tinta, no al revés**: a fondo pleno —que es como se construyó
  primero— ocho monedas seguidas cantaban y convertían la columna izquierda en
  lo más fuerte de una pantalla que se abre dos veces al año. Es el par que la
  aplicación ya usa para decir «esto es de aquí» sin levantar la voz, y sirve a
  los dos temas sin una regla aparte. Un color por apartado, al estilo de iOS,
  sería un arco iris que esta aplicación no usa en ningún sitio. No cuesta alto
  —la moneda mide 28 puntos y la fila ya tenía 44 de área de toque—, y solo
  aparece donde se pide: `acordeon` la dibuja si le pasan `icono`, así que los
  apartados de Regalos y Ocasiones siguen sin ella. Las cinco formas que se
  estudiaron están en `specs/prototipo-iconos-de-ajustes.html`. Lo que **no** se
  ha tocado es el 🐾 de Hoy, del carril de la semana y de la hoja del turno: ahí
  el emoji distingue al perro dentro de una lista de otras cosas, que es otro
  trabajo.
  **El orden lo abre Aspecto y no Sincronización**, que es el más corto y el
  único que no habla de una avería; Sincronización va detrás y sigue siendo el
  abierto de origen, porque lo que decide eso es a qué se viene y no el orden.
  **Y el tema es un segmentado, no un desplegable.** Un `select` de tres
  opciones esconde dos detrás de una rueda de iOS que tapa media pantalla, y el
  tema es lo único de esta hoja cuyo efecto se ve en el sitio: con la rueda
  encima no se ve nada hasta cerrarla. Es el `.seg` que ya usan Gente, Regalos y
  la Agenda, aquí a lo ancho del campo —`.campo > .seg`—, y es la misma figura
  con la que macOS resuelve este mismo ajuste. «Como el sistema» pasó a
  **«Automático»** porque no hay segmento que sostenga quince caracteres; el
  valor guardado sigue siendo `auto`.
  **Y «La aplicación» se retiró**: era un apartado entero para dos enlaces de
  una línea, y desde que «Buscar actualización» se fue a Sincronización no le
  quedaba nada más. Privacidad y Ayuda bajan al pie de «Tu cuenta», que es de lo
  que hablan, y siguen ahí para el día que se use la ficha de la App Store.
- **El botón de Ajustes se fue de la cabecera a la barra de abajo**, el sexto y
  a la derecha. Arriba a la derecha es lo que peor alcanza el pulgar de una mano
  sola, y es justo el sitio al que hay que estirarse cuando algo no va. De paso
  la cabecera se queda con una sola cosa: el sobre, que solo existe cuando hay
  algo que contestar, de modo que esa esquina está vacía casi siempre. **No es
  una pestaña**: no lleva `data-pestana`, abre la hoja y la barra se queda como
  estaba, y por eso nunca toma `aria-current` y se queda en gris mientras la
  pestaña de verdad está en tinta. El bucle que cablea las pestañas filtra ahora
  por `.tab[data-pestana]`; sin ese filtro, tocar Ajustes le pondría a `pestana`
  un valor que no existe.
- **Las mejoras son ideas sobre la propia aplicación**, apuntadas desde el móvil
  y guardadas en `mejora`. **No se llaman «idea» a propósito**: aquí una idea es
  una idea de regalo y está en el centro del modelo de ocultación, y compartir el
  nombre habría hecho que cada consulta tuviera que decir de cuál habla. Y por lo
  mismo **no pasan por `visible()`**: no tienen destinatario, así que no hay de
  quién ocultarlas —lo único que se pide para recibirlas es tener cuenta—.
  Viajan por el contrato que ya hay, `guardar('mejora', …)` y la cola de siempre,
  y no por una ruta propia: una ruta propia haría esperar a la pantalla o pediría
  su propia cola, reintento e idempotencia, que es el motor de sincronización
  escrito dos veces para un cuaderno. Eso último no es teoría: `meeting-ops-air`
  las hizo primero en `localStorage` y lo deshizo, porque **sobre una idea de la
  aplicación se actúa en otra máquina**, y una nota que esa máquina no puede leer
  se atiende cuando alguien se acuerda de copiarla.
  **Y una mejora se puede dar por hecha**, que era el agujero: el único final era
  quitarla, y quitar se lee como «me equivoqué» y no como «ya está». Es la
  casilla de «Llevar» —tacha, baja al final lo tachado, y lo que falta queda
  arriba—, con la columna `hecho` que ya usa un apunte y **sin quién ni cuándo a
  propósito**: eso sería un registro de trabajo y esto es una lista de la compra.
  **La pantalla dice ahora que las ve toda la casa**, que era la pregunta que no
  se contestaba en ningún sitio, y **el rótulo lleva las que faltan**; el número
  se escribe desde el bloque y no se pasa hecho, porque una mejora se marca sin
  cerrar la hoja y con una cadena el rótulo se quedaba con el de cuando se abrió
  Ajustes —de ahí que `acordeon` acepte un nodo en `nota`—. La firma pasa a la
  regla de `firmaDeApunte`: quién la puso y **el cuándo solo si ya no es de hoy**,
  en palabras y no en ISO. Y hay **un tope de 2000 caracteres, cortado en el
  dispositivo y rechazado en el Worker**: sin él un pegado largo entra en la
  instantánea de los cuatro y se descarga en cada sincronización, para siempre.
  Quitar sigue llamándose Quitar y no Borrar —lo que hace es `activo = 0`— pero
  la pregunta dice ya a quién afecta, porque cualquiera puede quitar la de
  cualquiera y eso hay que decirlo antes y no descubrirlo después. La comparación
  entera con las *roadmap notes* de las que salieron está en
  `specs/propuesta-mejoras.html`. Queda abierto **cómo llega una mejora a donde
  se actúa**: quien las hace lee este repositorio y no la instantánea, así que el
  transporte sigue siendo una persona —justo lo que `meeting-ops-air` se quitó de
  encima, porque su Mac lee la misma base y aquí no hay tal Mac—. Y se decidió
  que **se apuntan solo desde Ajustes**: el atajo desde la pantalla que te
  molesta quitaría roce, pero metería un verbo de la herramienta entre los del
  trabajo, y «+» en esta aplicación ha significado siempre un evento, un regalo o
  un sitio.
- **Un evento puede durar varios días, y eso ya estaba medio hecho.** La tabla
  tenía `fin` desde la primera migración y `repartirPorDia` ya colocaba la
  instancia en todos los días que ocupa; lo que faltaba era **poder escribirlo**,
  porque el formulario nunca mandaba `fin` y el único que lo escribía era el
  importador de vuelos. Ahora hay una casilla **«Hasta» al lado del «Cuándo»**, y
  arriba y no detrás de «Más opciones»: es la otra mitad del cuándo, y escondida
  no la encuentra quien no sepa ya que existe. Vacía es un evento de un día, y un
  «hasta» igual al día **se guarda sin fin**, para que la agenda no tenga que
  distinguir dos formas del mismo caso.
  **La marca de los días de en medio es «(cont.)»**, detrás del título. Se probó
  a cambiarla por `2/3` en el hueco de la hora —decía además por dónde va— y se
  volvió atrás: dos cifras y una barra piden descifrarse, y lo que hace falta
  saber de un vistazo es solo que eso de hoy viene de antes. El primer día se
  queda con su hora; los que siguen no la repiten, porque repetirla diría que
  empieza tres veces.
  **Y la lista reparte por días igual que la semana**, que era lo que se pedía
  desde el principio. Enseñaba el evento una sola vez, en su día de arranque, y
  eso dejaba mintiendo justo a la pantalla a la que se le pregunta si hoy hay
  alguien en casa. En su tarjeta va además **«3 días»**, que es lo que la línea
  de la semana no tiene sitio para decir. La hoja del evento dice el rango entero
  —«sábado 1 – lunes 3 de Agosto · 3 días»— en vez de la fecha del día por el que
  se entró. Lo que sostiene todo esto es `pwa/test/varios-dias.test.js`, y lo que
  prueba es lo único que no se ve mirando: que un día es continuación **aunque su
  primer día caiga fuera de lo que se está mirando**.
  **Las dos casillas van una debajo de otra**, no en la misma fila: una casilla
  de fecha trae su propio ancho mínimo —el navegador dibuja `dd/mm/aaaa` dentro—
  y a 390 puntos las dos juntas se aprietan hasta cortar el texto.
- **Un calendario externo tiene dueño, y por eso un vuelo dice de quién es.** Un
  viaje importado llegaba con `origen` y `calendario_id` y nada más, de modo que
  en la agenda de los cuatro salía «Madrid → Bolonia» sin decir de quién era. El
  dueño va en `calendario_externo.persona_id` y no en cada evento por dos
  razones: **es verdad** —el feed es de alguien y eso no cambia vuelo a vuelo— y
  **`persona_origen_id` habría encendido los avisos**, porque es lo que mira
  `esMio()`, y a su dueño le sonaría el teléfono con cada cambio de cada vuelo.
  Se escribe «de Óscar» en la tarjeta de la lista y en la hoja del evento, no en
  la línea de la semana: allí la fila mide 38 puntos y el título ya se recorta.
  La `0018` se lo pone al de viajes **buscando por nombre**, porque el
  identificador de una persona lo pone cada base; si no encuentra a nadie deja
  `NULL`, que es lo que había, y entonces no se escribe dueño.
- **El «+» de la barra propone el día del periodo que se está mirando**, salvo
  que ese periodo contenga hoy, y entonces hoy. Antes proponía hoy siempre, así
  que crear desde la semana que viene nacía en la de esta. La lista propone hoy
  sin más: no es un periodo sino una cuerda que arranca ahí. El porqué de las
  cuatro decisiones está en `specs/propuesta-eventos-de-varios-dias.html`.
- **Ya no hay lista de migraciones pendientes, y no debe volver a haberla.** La
  base lleva ahora su propio registro —la tabla `migracion`, sembrada por la
  `0016` con las catorce que estaban puestas ese día— y el despliegue de la API
  **aplica solo lo que no conste ahí, en cada empujón a `main` y sin casilla**.
  Escribir una migración es dejar el `.sql` en `api/migraciones/`; no hay que
  anotarla en ningún sitio ni acordarse de marcar nada. **Y eso fue mentira
  durante tres PR**, porque `api/migraciones/**` no estaba en los `paths` del
  workflow: un cambio que solo añadía una migración no tocaba `api/src/**` y no
  disparaba despliegue ninguno, así que la tabla se quedaba sin la columna y la
  pantalla que la usaba salía en blanco sin decir por qué. Le pasó a la `0018`;
  a la `0017` no, y solo porque su PR tocaba además el repositorio. Ya está en
  la lista. Esto sustituye a una
  lista escrita a mano que mintió dos veces —la `0012` y la `0013` se quedaron
  apuntadas como pendientes después de aplicarse— y costó tres despliegues en
  rojo: quien se fiaba de ella volvía a pedirlas y el `ALTER TABLE` contestaba
  `duplicate column name`. **Si alguna vez vuelves a leer aquí una lista de
  pendientes, sobra: pregúntale a la tabla.**
  Lo que sí hay que seguir respetando al escribir una: **corriente si se puede
  repetir** —`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`— y **`.unavez` si
  lleva `ALTER TABLE`, reparte datos o rehace una tabla. Y eso ya no depende de
  que alguien se acuerde: `pruebas.yml` rechaza un `.sql` sin `.unavez` que lleve
  `ALTER TABLE`, `DROP`, `INSERT INTO` o `INSERT OR REPLACE`. El registro hace
  que en la práctica cada fichero se pase una sola vez, pero la regla sigue en
  pie para el día que el registro no esté: una base restaurada o un entorno
  nuevo los recorre todos.
  `0002_catalogos.sql` es la única excepción permanente y va por su nombre en los
  dos sitios: es la semilla, va con `INSERT OR REPLACE` y volver a pasarla
  pisaría los catálogos que se hayan tocado desde la aplicación. Y para volver a
  aplicar una a mano —lo único que queda del disparo manual— está el campo
  «forzar» del workflow.
  Y que **termine en una sentencia y no en comentarios**: lo que quede detrás del
  último `;` se lo lleva `wrangler` a un aviso que no avisa de nada.
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

## Cómo se cuenta cada vuelta

Lo que dice la respuesta es lo único que hay hasta que la pantalla lo confirme, y
una pantalla que todavía no lo confirma se ve igual que una donde no se hizo nada.
Por eso la forma de contarlo no es cuestión de gusto.

**Al mergear, tres cosas y en este orden.**

1. **Qué ha cambiado, en lista o en tabla.** Una línea por cambio, no un párrafo
   del que haya que sacarlos.
2. **Qué versión tiene que estar puesta.** Un número, y dónde mirarlo: la
   aplicación escribe la suya abajo a la derecha en Hoy. Sin eso, la primera
   pregunta ante cualquier cosa que no se ve es «¿tengo lo nuevo?», y esa pregunta
   no se puede contestar desde la pantalla. Con el número delante sí: si lo que se
   ve no coincide es que falta el OTA, y si coincide es un fallo y hay que ir a
   buscarlo.
3. **Qué puede quedar pendiente.** Es lo que más se cae, porque la vuelta que
   acaba de terminar es justo la que parece terminada.

**Si una vuelta no se ha mergeado, dilo con esas palabras.** Un resumen de trabajo
hecho se lee como trabajo entregado, y desde el teléfono una rama abierta y una
fusionada son indistinguibles. Di qué rama, qué PR y de qué está esperando.

**«Dame opciones» significa un artefacto, en línea y con cuatro como mínimo.** No
una lista en la respuesta: las opciones se comparan mirándolas a la vez, que es
justo para lo que se renderizan los prototipos y las propuestas de `specs/`. Cada
opción lleva **letra y número** —`A1`, `C3`— para que decidir quepa en una ficha
corta y siga siendo inequívoco cuando hay tres preguntas sobre la mesa a la vez.
El artefacto enseña **lo que he pedido o lo que cambia, y nada más**: las
decisiones ya tomadas se quedan fuera salvo que sean justo lo que se reabre, o
salvo que las pida yo — repetir lo ya discutido entierra la única pregunta viva.
Es la excepción al «no publiques artefactos al implementar» de aquí arriba: pedir
opciones es pedir verlas.

## Los bloques que se copian y se pegan

Un bloque de comandos es para pegarlo en una terminal, no para leerlo. **Sin
comentarios dentro**: ni `#` explicando qué hace cada línea, ni texto entre las
órdenes. Lo que haya que explicar va fuera del bloque, en prosa, antes o después.

Un comentario dentro de un bloque de comandos se pega junto con el resto, ensucia
el historial de la shell y obliga a leer para saber dónde termina lo que hay que
copiar. Si un bloque necesita comentarse línea a línea, es que son dos bloques
con una frase en medio.
