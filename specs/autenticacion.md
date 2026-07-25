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
| **Desconocido** | Nunca ha entrado, o su solicitud caducó | El formulario de solicitud |
| **En espera** | Ha solicitado acceso y nadie lo ha resuelto | La sala de espera |
| **Rechazado** | Un administrador dijo que no | Un mensaje neutro |
| **Con cuenta** | Vinculado a una persona activa del registro | La aplicación |

Las transiciones son pocas y todas explícitas: *desconocido → en espera* la hace
el propio interesado al enviar el formulario; *en espera → con cuenta* y *en
espera → rechazado* las hace un administrador; *en espera → desconocido* la hace
el interesado al retirar su solicitud, o el tiempo al caducarla; y *con cuenta →
desconocido* es la baja que ya existe (`darDeBajaCuenta`), que deshace el vínculo
con Apple y devuelve a esa persona a la puerta.

No hay estado intermedio entre rechazado y desconocido: pasados noventa días la
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
| nombre_declarado | Lo escribe la persona. Obligatorio |
| nota | «De qué nos conocemos». Libre y opcional |
| estado | pendiente, aprobada, rechazada |
| persona_id | A quién se vinculó, al aprobar |
| resuelta_por | Qué administrador la resolvió |
| creado_en, actualizado_en, visto_en | `visto_en` es el último intento de entrar |

La unicidad del identificador no es un detalle de implementación: es el freno.
Volver a entrar con el mismo identificador de Apple no crea una solicitud nueva,
actualiza `visto_en` de la que ya hay. Nadie puede generar dos avisos, ni cien.

`nombre_declarado` es texto sin verificar y hay que tratarlo como tal. Se escapa
al pintarlo y se limita en longitud. Quien lo lee es un administrador que decide
sobre esa base, y conviene que la interfaz sea explícita en que ese nombre lo ha
escrito el solicitante, no Apple.

**Ningún cambio en `persona`.** El correo del solicitante no se copia a su ficha
al aprobar: la solicitud se marca como aprobada y el dato se va con ella cuando
se purgue. No se guarda porque no se usa —este sistema no envía correo a nadie— y
guardar un dato personal «por si acaso» es exactamente la clase de acumulación
que el resto del diseño evita. Si algún día hace falta, `atributo_persona` existe
para eso y no requiere migración.

---

## 5. El recorrido de quien pide entrar

**Primera pantalla.** La de acceso, tal cual está: entrar con Apple, o ver la
demostración.

**Al volver de Apple.** La API responde con el estado del identificador. Si es
desconocido, la aplicación pide dos cosas y nada más:

- **«¿Quién eres?»** — obligatorio.
- **«¿De qué nos conocemos?»** — una línea, opcional.

Que el nombre lo escriba la persona no es desconfianza hacia Apple, es que Apple
no lo da de forma fiable (§8). Y la nota resuelve el problema real del
administrador, que no es identificar a quien pide entrar sino acordarse de por
qué le dijo que se descargara la aplicación.

**La sala de espera.** Una pantalla honesta: la solicitud está hecha, la revisa
una persona, no hay plazo. Con dos acciones: **comprobar** —que vuelve a
preguntar a la API— y **retirar la solicitud**, que borra el rastro y devuelve a
la pantalla de acceso.

La comprobación ocurre además sola cada vez que se abre la aplicación. No hay
sondeo en segundo plano ni notificación de que ya está: quien espera, abre la
aplicación y lo ve. Montar avisos remotos para esto exigiría APNs, credenciales
nuevas y un servicio que hoy no existe, y todo para un acontecimiento que ocurre
una vez en la vida de cada usuario.

**Si lo aprueban**, el siguiente arranque entra directamente. **Si lo rechazan**,
un mensaje sin explicación —«de momento no hay acceso para esta cuenta»— y el
botón de retirar. La aplicación no inventa motivos ni promete revisiones.

---

## 6. El recorrido del administrador

El aviso vive **dentro de la aplicación**, y solo ahí. La pantalla de Familia
lleva un contador de solicitudes pendientes, visible únicamente para los
administradores, que abre la bandeja.

Cada solicitud muestra el nombre declarado, la nota, el correo —marcado como
buzón de reenvío cuando lo sea— y la fecha. Y ofrece tres salidas:

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
| `POST /api/solicitud` | Sesión de espera | Crea la solicitud con nombre y nota |
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
entrar falla justo en esos casos, y por eso el nombre se pide a mano. El campo
`correo_privado` existe para que la bandeja lo diga en lugar de mostrar un buzón
absurdo sin más. Y si algún día se quisiera escribir a esa dirección, habría que
registrar el dominio remitente en el Private Email Relay Service de Apple: sin
eso, rebota.

**El nombre de Apple solo se obtiene una vez.** No viaja nunca en el token de
identidad: llega en la respuesta de la primera autorización y no vuelve. Si la
persona ya entró alguna vez —o si se dio de baja y regresa— no habrá nombre. No
se puede depender de él, y no se depende.

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
- **Un tope de pendientes simultáneas.** Superado, las nuevas se rechazan con un
  mensaje neutro. Un techo bajo —del orden de veinte— es más que suficiente para
  un hogar y convierte cualquier intento de inundación en ruido acotado.
- **El coste de entrada.** Cada solicitud exige una autorización real de Apple.
  No es una barrera infranqueable, pero descarta el abuso trivial.

**Caducidad.** Las pendientes sin resolver se borran a los treinta días; las
rechazadas, a los noventa. Se hace en la misma pasada de mantenimiento que ya
existe (`.github/workflows/mantenimiento.yml`), no con un proceso nuevo.

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
aplicación rota. Es una causa de rechazo perfectamente evitable: el modo de
demostración ya existe y funciona sin cuenta, así que basta con que el botón sea
visible en la pantalla de acceso —lo es— y con decirlo explícitamente en las
notas de revisión. Conviene además que la propia sala de espera recuerde que se
puede ver la demostración mientras tanto.

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

## 13. Decisiones pendientes

1. **El tope de pendientes simultáneas.** Se propone veinte.
2. **Si la nota debe llegar también a la ficha de la persona al aprobarla.** Hoy
   se descarta con la solicitud; podría conservarse como `atributo_persona`, y
   quizá merezca la pena para un «es el primo de Ana» que dentro de dos años ya
   no recordará nadie.
3. **Si la sala de espera debe ofrecer la demostración**, o si mezclar ambas
   cosas confunde más que ayuda.
