# Especificación · Acceso, solicitud y aprobación

> Desarrolla el apartado 8 de `specs/especificacion.md`, que fija el principio
> —solo Sign in with Apple, incorporación por decisión de un administrador— pero
> no el recorrido. Este documento cierra el recorrido.

---

## 1. Qué se quiere

Una persona se descarga la aplicación, entra con su identificador de Apple y
queda **en espera**. No ve la agenda ni figura en el registro del hogar: solo una
pantalla que explica que su solicitud está hecha. En el dispositivo de un
administrador aparece esa solicitud, con quién dice ser y qué correo trae, y allí
se decide: se le da cuenta con un rol, o no.

Es lo que ya ocurre hoy, pero con el recado viajando por dentro. La aplicación
responde hoy con `403 sin_vincular` y le enseña al recién llegado el
identificador opaco que Apple le ha asignado —`000123.abc…`—, con el encargo de
hacérselo llegar al administrador por WhatsApp para que lo pegue a mano en su
ficha. Funciona, y es indefendible: obliga a copiar una cadena sin sentido, se
transcribe mal, y convierte el alta en una conversación fuera de la aplicación.

**El alcance es el hogar y sus allegados.** Quien se aprueba entra como miembro y
ve la agenda salvo lo que esté en categorías restringidas. Este documento no
introduce un tercer rol ni toca la función de visibilidad: la decisión de a quién
se deja entrar es del administrador, y es ahí donde reside el control.

---

## 2. La solicitud no es una persona

La tentación es crear la fila de `persona` en el momento del registro, con
`tiene_cuenta = 0`, y que aprobar consista en rellenarle el rol. Se rechaza.

Una `persona` es un miembro del hogar. Todo el sistema lo da por supuesto: entra
en el registro que devuelve `leerRegistro`, puede figurar como participante de un
evento o destinatario de un regalo, aparece en los desplegables de la interfaz y
viaja en las instantáneas de sincronización de todo el mundo. Un desconocido que
ha pulsado un botón no es nada de eso. Si el registro fuera la sala de espera,
bastaría con que alguien se descargara la aplicación para colarse en la pantalla
de Familia de las hijas.

Por tanto: **tabla aparte**. Quien no está aprobado no existe para el resto del
sistema. La aprobación es la operación que traslada a alguien de una a otra, y es
el único punto del código donde eso ocurre.

La separación tiene un segundo beneficio, que no es accesorio. El modelo ya
contempla la persona sin cuenta como estado de primera clase —la abuela, que
cumple años y recibe regalos pero no entra en la aplicación
(`specs/modelo-datos.md` §2.1)—. Cuando esa abuela se decida a entrar, su
solicitud no debe crear una segunda abuela: debe **vincularse a la que ya está**,
conservando su historial. Con tabla aparte, la aprobación tiene los dos caminos a
la vista y el administrador elige. Con la solicitud dentro de `persona`, el
duplicado es el camino por defecto y el historial se pierde en silencio.

---

## 3. Estados

Un identificador de Apple se encuentra siempre en uno de estos estados frente al
hogar:

| Estado | Qué significa | Qué ve |
|---|---|---|
| **Desconocido** | Nunca ha entrado, o su solicitud caducó | La solicitud se manda sola y pasa a la sala de espera |
| **En espera** | Ha solicitado acceso y nadie lo ha resuelto | La sala de espera |
| **Rechazado** | Un administrador dijo que no | Un mensaje neutro |
| **Con cuenta** | Vinculado a una persona activa del registro | La aplicación |

Las transiciones son pocas y todas explícitas: *desconocido → en espera* la hace
el propio interesado al entrar con Apple; *en espera → con cuenta* y *en
espera → rechazado* las hace un administrador; *en espera → desconocido* la hace
el interesado al retirar su solicitud, o el tiempo al caducarla; y *con cuenta →
desconocido* es la baja que ya existe (`darDeBajaCuenta`), que deshace el vínculo
con Apple y devuelve a esa persona a la puerta.

No hay estado intermedio entre rechazado y desconocido: pasados treinta días la
solicitud rechazada se borra y, si esa persona vuelve a intentarlo, vuelve a
aparecer en la bandeja. Un rechazo es un «ahora no», no una lista negra
perpetua, y guardar para siempre el correo de alguien a quien se dijo que no es
justamente lo contrario de lo que este sistema pretende ser.

---

## 4. Datos

**SolicitudAcceso.** Una fila por identificador de Apple que ha llamado a la
puerta.

| Campo | Notas |
|---|---|
| id | |
| identificador_apple | Único. Es la identidad real; todo lo demás es declarado |
| correo | Lo que diga Apple. Puede ser un buzón de reenvío, o nulo |
| correo_privado | Si Apple indicó `is_private_email` |
| nombre_declarado | Lo da Apple la primera vez, o lo corrige la persona. Puede estar vacío |
| estado | pendiente o rechazada |
| resuelta_por | Qué administrador la rechazó |
| creado_en, actualizado_en, visto_en | `visto_en` es el último intento de entrar |

**No hay estado «aprobada»: al aprobar, la fila se borra.** Conservarla dejaría
el correo de alguien que ya está en el hogar guardado para siempre, porque
ninguna caducidad alcanza a una solicitud resuelta a favor. A quien entró se le
busca en `persona`, que es donde está.

La unicidad del identificador no es un detalle de implementación: es el freno.
Volver a entrar con el mismo identificador de Apple no crea una solicitud nueva,
actualiza `visto_en` de la que ya hay. Nadie puede generar dos avisos, ni cien.

`nombre_declarado` es texto sin verificar y hay que tratarlo como tal. Se escapa
al pintarlo y se limita en longitud. Quien lo lee es un administrador que decide
sobre esa base, y conviene que la interfaz sea explícita en de dónde sale: lo da
Apple en la primera autorización y puede corregirlo el solicitante. Se guarda
`''` y no `NULL` cuando no hay ninguno, para no rehacer la tabla de la `0003`
—que lo declaró `NOT NULL`— por un caso que ya no es excepcional.

**Ningún cambio en `persona`.** De la solicitud no se copia nada a la ficha: al
aprobar, el nombre declarado se usa como propuesta editable del formulario y el
correo se va con la solicitud cuando se purgue. El correo no se guarda porque no
se usa —este sistema no envía correo a nadie— y conservar un dato personal «por
si acaso» es la clase de acumulación que el resto del diseño evita. Si algún día
hiciera falta, `atributo_persona` existe para eso y no requiere migración.

---

## 5. El recorrido de quien pide entrar

**Primera pantalla.** La de acceso, tal cual está: entrar con Apple, o ver la
demostración.

**Al volver de Apple.** La API responde con el estado del identificador. Si es
desconocido, la aplicación **no pregunta nada**: manda la solicitud con lo que
Apple acaba de entregar —el identificador, el correo y, si es la primerísima
autorización, el nombre— y enseña la sala de espera.

Aquí hubo un campo, «¿quién eres?», y **costó un rechazo de la App Store por la
directriz 4**: pedir después de Sign in with Apple un dato que el marco de Apple
ya entrega no está permitido. La trampa es que el nombre solo llega la primera
vez (§8), de modo que un formulario «solo para cuando falte» acaba siendo el
formulario de todo el mundo a partir de la segunda —y quien revisa la aplicación
entra siempre por esa segunda—.

Sin nombre la solicitud sale igual y quien decide ve el correo; si además está
oculto, la bandeja lo dice y el nombre se escribe al aprobar. Y quien espera
puede ponerlo desde la sala de espera con un enlace, que es una corrección
voluntaria y no un peaje. Se descartó pedir además de qué os conocéis: en un
grupo pequeño y de confianza, quien aprueba ya sabe quién viene —normalmente
porque él mismo le dijo que se descargara la aplicación—, así que la explicación
es un campo que se rellena por cortesía y no se lee.

**La sala de espera.** Una pantalla honesta: la solicitud está hecha, la revisa
una persona, no hay plazo. Con dos acciones: **comprobar** —que vuelve a
preguntar a la API— y **retirar la solicitud**, que borra el rastro y devuelve a
la pantalla de acceso.

La comprobación ocurre además sola cada vez que se abre la aplicación. No hay
sondeo en segundo plano ni notificación de que ya está: quien espera, abre la
aplicación y lo ve. Montar avisos remotos para esto exigiría APNs, credenciales
nuevas y un servicio que hoy no existe, y todo para un acontecimiento que ocurre
una vez en la vida de cada usuario.

Y una tercera acción, discreta, al pie: **ver la demostración**. Le da algo que
mirar mientras espera, y sobre todo resuelve el problema del revisor de la App
Store, que es exactamente quien va a quedarse en esta pantalla (§11). La
demostración ya advierte por su cuenta de que los datos son inventados y de que
nada de lo que se haga allí sale del dispositivo, que es lo que evita la
confusión entre lo de mentira y lo de verdad.

**Si lo aprueban**, el siguiente arranque entra directamente. **Si lo rechazan**,
un mensaje sin explicación —«de momento no hay acceso para esta cuenta»— y el
botón de retirar. La aplicación no inventa motivos ni promete revisiones.

---

## 6. El recorrido del administrador

El aviso vive **dentro de la aplicación**, y solo ahí. La pantalla de Familia
lleva un contador de solicitudes pendientes, visible únicamente para los
administradores, que abre la bandeja.

**Resuelve cualquier administrador**, sin distinción entre ellos. Es lo que ya
hace el resto de la configuración del hogar —`comprobarPermiso` trata a los
administradores como equivalentes— y no introduce la figura del dueño, que
sería un concepto nuevo en el modelo y un punto único de fallo: si quien tuviera
esa condición se ausenta o se da de baja, las solicitudes se quedarían sin nadie
que las mirase.

Cada solicitud muestra el nombre declarado —o «Sin nombre», que es lo que ocurre
cuando Apple no lo entrega—, el correo —marcado como buzón de reenvío cuando lo
sea— y la fecha. Y ofrece tres salidas:

1. **Dar cuenta a alguien que ya está en el registro.** Se elige a una persona sin
   cuenta de la lista y se le asigna rol. Es el camino de la abuela: conserva su
   ficha, su fecha de nacimiento y todo lo que otros escribieron con ella.
2. **Crear una persona nueva.** Nombre y apellidos vienen propuestos desde lo que
   escribió el solicitante, editables; rol obligatorio.
3. **Rechazar.**

La aprobación es una sola operación indivisible: crea o localiza la persona, le
pone `tiene_cuenta`, rol e identificador de Apple, y marca la solicitud. Si algo
falla, no queda a medias.

**Dos casos que la operación tiene que rechazar con un mensaje claro**, porque
ocurrirán: que la solicitud ya la haya resuelto el otro administrador mientras
esta pantalla estaba abierta —se resuelve condicionando la escritura al estado
pendiente, no leyendo antes—, y que el identificador de Apple ya figure en la
ficha de otra persona, que la restricción de unicidad de `persona` impediría de
todos modos pero con un error ininteligible.

**Sobre el contador y la regla de §9 de la especificación funcional.** Allí se
prohíbe que un aviso se genere a partir de un recuento recibido del servidor,
porque en aquel caso —los regalos ocultos al destinatario— el recuento *es* el
dato que se pretende ocultar. Aquí no aplica: quien recibe el número es el
administrador, y no hay nada que ocultarle sobre las solicitudes. El recuento
viaja en la instantánea de sincronización, y solo en la de los administradores.

---

## 7. La API

**Sesión de espera.** Quien está en la sala de espera no tiene persona y por
tanto no puede tener una sesión normal, pero necesita alguna credencial: sin ella
cada comprobación del estado obligaría a abrir otra vez la hoja de Apple, que es
inaceptable. Se emite un token limitado.

Es el mismo JWT firmado por el Worker, con dos diferencias: lleva `tipo: espera`,
y su `sub` es el identificador de Apple en lugar del de una persona. Dura siete
días y solo sirve para las tres rutas de solicitud.

Esto obliga a una comprobación explícita, y es la parte de este diseño donde un
error sería grave: **`lectorAutenticado` debe rechazar todo token cuyo `tipo` no
sea de sesión plena**. Hoy fallaría de rebote, porque buscaría una persona con
identificador de Apple y no la encontraría, pero depender de eso es depender de
una casualidad. La comprobación va delante y es explícita. Los tokens ya emitidos
no llevan `tipo` y siguen siendo válidos treinta días: la ausencia se interpreta
como sesión plena.

| Ruta | Quién | Qué hace |
|---|---|---|
| `POST /api/sesion` | Token de Apple | Devuelve el estado: `activa` con sesión y persona, o `sin_solicitud` / `pendiente` / `rechazada` con una sesión de espera |
| `POST /api/solicitud` | Sesión de espera | Crea la solicitud. El nombre es opcional; sin él se guarda vacío |
| `GET /api/solicitud` | Sesión de espera | Estado actual |
| `DELETE /api/solicitud` | Sesión de espera | Retira y borra |
| `GET /api/solicitudes` | Sesión de administrador | Bandeja de pendientes |
| `POST /api/solicitudes/resolver` | Sesión de administrador | Aprueba —con persona existente o nueva— o rechaza |

La resolución va por cuerpo y no por ruta con parámetro porque el enrutador de
`api/src/index.js` compara caminos exactos. Meter segmentos variables obligaría a
reescribirlo para una sola ruta.

`POST /api/sesion` deja de responder `403` para el caso no vinculado. No es un
error de autorización: es el estado normal de alguien que acaba de llegar, y el
cliente necesita el cuerpo para saber qué pantalla pintar. El identificador de
Apple deja de devolverse: ya no hay que copiarlo a ninguna parte.

---

## 8. Lo que Apple da, y lo que no

Esta sección es la que decide si el flujo funciona. Tres hechos incómodos:

**El correo no llega con la configuración actual.** Los dos caminos piden
`scope: 'name'` —`pwa/publico/js/sesion.js` y `pwa/publico/js/native.js`—, de
modo que el token de identidad no trae la reclamación `email` y toda esta
especificación se quedaría sin el dato que la motiva. Hay que pedir también
`email`.

Con una trampa para las pruebas: el ámbito se fija en la **primera**
autorización. Quien ya haya entrado alguna vez con su Apple ID en esta
aplicación no volverá a ver la pantalla de permisos y seguirá sin correo hasta
que la retire en Ajustes → su nombre → Inicio de sesión y seguridad → Apps que
usan Apple ID. Afecta a quien pruebe esto, no a los usuarios nuevos, pero
explica un «no funciona» que costaría medio día.

**«Ocultar mi correo» va a ser frecuente.** Cuando alguien lo elige, lo que llega
es `a1b2c3d4@privaterelay.appleid.com`. Es un correo válido y estable, y no
identifica a nadie. Un flujo que se apoye en el correo para saber quién pide
entrar falla justo en esos casos, y por eso la bandeja no puede apoyarse solo en
él. Lo que **no** se puede hacer es cubrir ese hueco preguntando el nombre: eso
es la directriz 4 (§5). Se cubre al aprobar, que es donde hay alguien que sabe
quién viene. El campo `correo_privado` existe para que la bandeja lo diga en
lugar de mostrar un buzón absurdo sin más. Y si algún día se quisiera escribir a esa dirección, habría que
registrar el dominio remitente en el Private Email Relay Service de Apple: sin
eso, rebota.

**El nombre de Apple solo se obtiene una vez.** No viaja nunca en el token de
identidad: llega en la respuesta de la primera autorización y no vuelve. Si la
persona ya entró alguna vez —o si se dio de baja y regresa— no habrá nombre. No
se puede depender de él, y no se depende: `nombre_declarado` se guarda vacío y
la solicitud vale igual.

**Dos detalles menores.** `email_verified` llega unas veces como booleano y otras
como cadena `"true"`; se normaliza. Y el identificador `sub` es único por equipo
de desarrollo, no por aplicación, así que el paquete de iOS y el Services ID de
la web devuelven el mismo valor para la misma persona: es lo que ya permite que
`abrirSesion` admita las dos audiencias contra una sola ficha.

---

## 9. Abuso, límites y retención

La aplicación estará en la App Store y cualquiera puede descargarla, así que
cualquiera puede llamar a la puerta. Tres frenos, ninguno complicado:

- **Una solicitud por identificador de Apple.** Insistir no multiplica nada.
- **Diez pendientes simultáneas como mucho.** Superado el tope, las nuevas se
  rechazan con un mensaje neutro. Es un techo deliberadamente bajo: en un hogar
  llegarán tres solicitudes al año, y con ese margen cualquier intento de
  inundar la bandeja se queda en ruido acotado. El precio es que, si alguna vez
  se junta un grupo de verdad, hay que ir resolviendo para que quepan los
  siguientes.
- **El coste de entrada.** Cada solicitud exige una autorización real de Apple.
  No es una barrera infranqueable, pero descarta el abuso trivial.

**Caducidad.** Las aprobadas desaparecen en el acto —aprobar es borrar—, las
pendientes sin resolver se borran a los catorce días —contados desde la última
vez que su titular asomó, no desde la primera: quien abre la aplicación cada
mañana esperando está diciendo que su solicitud sigue viva— y las rechazadas a
los treinta. La purga la hace el propio Worker al paso, en los dos
momentos en que alguien mira esta tabla: cuando alguien intenta entrar y cuando
un administrador abre la bandeja. No hay tarea programada, y por tanto tampoco
credenciales que custodiar ni un proceso que pueda llevar meses caído sin que
nadie lo note. El precio es que en un hogar completamente inactivo las filas
sobreviven a su fecha; como el primero que asome las barre, y como nadie las lee
entretanto, es un precio que se paga con gusto.

Catorce días son pocos a propósito: los datos de alguien que quizá nunca entre
duran lo mínimo, y una solicitud que lleva dos semanas sin mirarse ya no es una
solicitud, es un descuido. La consecuencia hay que asumirla y decirla en la sala
de espera: quien tarde más de dos semanas en avisarte por otra vía tendrá que
volver a pedirlo. Como la vuelta a pedirlo cuesta un botón, el descuido se
corrige solo.

**Privacidad.** Se guarda el correo y el nombre declarado de gente que quizá
nunca entre. Es poco, y es temporal, pero es dato personal de terceros y toca
decirlo en `pwa/publico/privacidad.html`: qué se guarda, cuánto tiempo, y que se
puede retirar desde la propia aplicación en cualquier momento.

---

## 10. Poder borrarse, también estando en espera

La directriz 5.1.1(v) de la App Store exige que quien puede crear una cuenta
pueda eliminarla desde dentro de la aplicación. En cuanto se guarda el correo de
alguien, aunque no tenga cuenta, esa exigencia aplica: **retirar la solicitud es
un requisito, no una comodidad.** De ahí `DELETE /api/solicitud`, y de ahí que
la sesión de espera exista.

Retirar borra la fila entera. No deja constancia de que alguien lo intentó, que
es lo que uno espera de un botón que dice que borra.

La baja de quien sí tiene cuenta no cambia: `darDeBajaCuenta` sigue haciendo lo
que hace. Con una consecuencia que ahora es más visible: al deshacer el vínculo,
ese identificador vuelve a ser un desconocido y su siguiente intento de entrar
aparecerá en la bandeja como una solicitud nueva. Es coherente, y conviene que
la pantalla de baja lo diga con esas palabras.

---

## 11. Dos situaciones que hay que dejar previstas

**La revisión de la App Store.** El revisor entrará con su propio Apple ID y
acabará en la sala de espera, que desde fuera es indistinguible de una
aplicación rota. Es una causa de rechazo perfectamente evitable, y se cubre por
dos vías a la vez: el botón de demostración está en la pantalla de acceso y
vuelve a estar en la sala de espera (§5), de modo que no hay forma de quedarse
encallado sin salida visible; y las notas de revisión lo dicen con todas las
letras —que el alta requiere aprobación de una persona, y que la funcionalidad
completa se evalúa desde la demostración—. Ninguna de las dos sobra: la primera
sirve al revisor que no lee las notas, la segunda al que se pregunta si eso es
un fallo.

**Quedarse sin administradores.** Ya está el aviso en el registro cuando se da de
baja la última cuenta administradora, pero con este flujo el efecto se agrava:
sin administrador no hay quien apruebe, y las solicitudes se acumulan sin que
nadie pueda hacer nada desde la aplicación. No se impide la baja —la directriz de
Apple manda—, pero la recuperación deja de ser folclore y se documenta como lo
que es: una sentencia contra D1 desde `wrangler`, en
`docs/despliegue-cloudflare.md`.

---

## 12. Lo que no se hace aquí

- **Invitaciones con código.** Repartir un enlace o un código de un solo uso
  eliminaría a los desconocidos de la bandeja, pero añade un objeto más que
  caduca, se comparte y se filtra, y sustituye la decisión explícita del
  administrador por la posesión de una cadena. La bandeja no molesta a nadie
  cuando llegan tres solicitudes al año.
- **Un tercer rol de alcance reducido.** Con el alcance decidido —hogar y
  allegados— no hace falta. Si algún día entra gente de fuera, la conversación es
  sobre la función de visibilidad, no sobre este flujo.
- **Avisos remotos al administrador.** Exigen APNs y un servicio de envío. Se
  descartan por ahora: el contador en la bandeja cumple.
- **Verificar el `nonce` del token de Apple.** `verificarTokenDeApple` no lo
  comprueba hoy. El riesgo de reutilización de un token robado es remoto y este
  cambio no lo agrava, pero queda anotado como endurecimiento pendiente.

---

## 13. Qué toca al implementar

Ningún punto de diseño queda abierto. El trabajo se reparte así:

| Dónde | Qué |
|---|---|
| `api/migraciones/` | Tabla `solicitud_acceso` |
| `api/src/apple.js` | Normalizar `email_verified`; recoger `is_private_email` |
| `api/src/sesion.js` | El `tipo` del token y la sesión de espera |
| `api/src/solicitudes.js` | La sala de espera entera: alta, purga, aprobar, rechazar |
| `api/src/index.js` | Las cinco rutas nuevas y el estado de `/api/sesion` |
| `api/src/repositorio.js` | El recuento de pendientes en el registro |
| `api/src/filtrado.js` | Transmitirlo solo a los administradores |
| `pwa/publico/js/sesion.js`, `native.js` | Añadir `email` al ámbito de Apple |
| `pwa/publico/js/app.js` | Formulario de solicitud y sala de espera |
| `pwa/publico/js/vistas/familia.js` | La bandeja; retirar el campo del identificador |
| `pwa/publico/privacidad.html` | Qué se guarda de quien solicita, y cuánto dura |
| `docs/despliegue-cloudflare.md` | La migración y la recuperación sin administradores |

La sala de espera va en un módulo propio y no dentro de `repositorio.js` porque
es la misma separación que sostiene todo lo demás: `repositorio.js` habla del
registro del hogar, y una solicitud todavía no forma parte de él.

El campo «Identificador de Apple» de la ficha de persona desaparece de la
interfaz. Era la contrapartida del flujo antiguo —el hueco donde se pegaba la
cadena que el recién llegado había copiado— y con la bandeja no tiene ya ningún
uso legítimo: el vínculo lo establece la aprobación, que es la única operación
que sabe hacerlo sin romper la unicidad. La columna se queda; el campo editable,
no.
