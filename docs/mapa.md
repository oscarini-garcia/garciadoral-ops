# Mapa del repositorio

Generado por `herramientas/mapa.py` a partir del código. **No se edita a mano:**
cualquier cambio se pierde en la siguiente ejecución, y `pruebas.yml` comprueba
que este fichero corresponde al código de su commit.

Es el mismo texto que se inyecta al abrir una sesión de Claude Code, para no
tener que recorrer la aplicación entera cada vez.

## Módulos

### `scripts/agenda/` · Reglas del modelo, compartidas por el plan semanal

- **__init__.py** — Agenda Familiar — implementación del modelo, la visibilidad y el plan semanal.
- **fuente.py** — Lectura del registro canónico de la agenda.
  FuenteNoDisponible · leer_agenda
- **mensaje.py** — Composición del texto del plan semanal para WhatsApp.
  formatear_dia · formatear_rango · formatear_evento · Plan · componer
- **modelo.py** — Entidades y reglas de integridad de la Agenda Familiar.
  ErrorDeIntegridad · Persona · AtributoPersona · Categoria · Etiqueta · OrientacionIdea
  Idea · TipoEvento · ParticipanteEvento · Evento · …y 9 más
- **semana.py** — Selección de los eventos de la semana entrante.
  Semana · semana_entrante · Instancia · Aparicion · eventos_derivados · ocurrencias
  instancias_de_la_semana · repartir_por_dia
- **visibilidad.py** — Función de visibilidad de la Agenda Familiar.
  destinatarios_de_idea · destinatarios_de_regalo · destinatarios_de_evento · visible
  visible_publicamente · comentarios_visibles

### `scripts/` · Los dos procesos programados y su transporte

- **callmebot.py** — Transporte compartido: envío de un WhatsApp a través de CallMeBot.
  cargar_destinatarios · enviar
- **despachar.py** — Despacha los mensajes vencidos de queue.json a través de CallMeBot.
  parsear · siguiente · procesar · main
- **plan_semanal.py** — Genera y envía el plan de la semana entrante, un mensaje por destinatario.
  DestinatarioInvalido · en_ventana · clave_de_semana · leer_estado · escribir_estado
  destinatarios_del_plan · instancias_visibles · componer_para · enviar_plan
  analizar_argumentos · …y 1 más

### `api/src/` · Worker de Cloudflare: filtra antes de transmitir

- **apple.js** — Verificación del token de identidad de Sign in with Apple.
  base64urlADatos · verificarTokenDeApple
- **derivar.js** — Estados que nadie mantiene a mano.
  derivarEstados
- **filtrado.js** — Composición del conjunto que se transmite a un dispositivo.
  componerInstantanea
- **index.js** — API de la Agenda Familiar sobre Cloudflare Workers y D1.
- **redaccion.js** — Redacción del mensaje de un día con la API de Anthropic.
  MODELOS_DE_RESERVA · MODELO_POR_DEFECTO · INSTRUCCION_POR_DEFECTO · leerConfiguracion
  configuracionPublica · guardarConfiguracion · cadenaDeModelos · modelosDisponibles
  componerMaterial · componerMaterialDePeriodo · …y 2 más
- **repositorio.js** — Lectura y escritura del registro canónico sobre D1.
  leerRegistro · personaPorApple · personaPorId · darDeBajaCuenta · administradoresRestantes
  aplicarCambio
- **revocacion.js** — Revocación del token de Sign in with Apple al darse de baja.
  hayRevocacionConfigurada · secretoDeCliente · revocarEnApple
- **sesion.js** — Sesión propia: un JWT HS256 corto que el cliente presenta en cada petición.
  TIPO_PLENA · TIPO_ESPERA · emitirSesion · emitirEspera · verificarSesion
  verificarSesionPlena · verificarSesionDeEspera · coincideEnTiempoConstante
- **solicitudes.js** — La sala de espera: quien ha entrado con Apple y todavía no es del hogar.
  Rechazo · TOPE_PENDIENTES · purgarCaducadas · solicitudPorApple · anotarLlegada
  contarPendientes · pendientes · registrarSolicitud · retirarSolicitud · rechazarSolicitud
  …y 1 más
- **visibilidad.js** — Función de visibilidad, aplicada en el servidor antes de transmitir.
  destinatariosDeIdea · destinatariosDeRegalo · destinatariosDeEvento · visible
  visiblePublicamente

### `pwa/publico/js/` · La aplicación

- **almacen.js** — Almacén local.
  guardarDocumento · leerDocumento · guardarInstantanea · leerInstantanea · encolarCambio
  leerCola · vaciarCola · olvidarTodo · guardarSesion · leerSesion · …y 1 más
- **app.js** — Arranque y navegación.
- **demo.js** — Modo demostración.
  cargarRegistroDemo · componerDemo
- **modelo.js** — Consultas sobre la instantánea local.
  EMOJI_POR_DEFECTO · estaActivo · redaccionDisponible · nuevoId · ahora · crearVista
  ESTADOS_REGALO · REPETICIONES · formatearImporte
- **native.js** — Puente con la cáscara nativa de iOS.
  esNativo · toque · compartir · comprobarActualizacion · versionInstalada
  autorizacionDeAppleNativa · tokenDeAppleNativo · programarRecordatorios
  HORIZONTE_RECORDATORIOS_DIAS · iniciarNativo
- **semana.js** — La semana como marco fijo de siete días.
  INICIALES_DIA · NOMBRES_DIA · MESES_LARGOS · TECHO_EVENTOS_DIA · indiceDia · parsearMomento
  soloFecha · iso · isoConHora · sumarDias · …y 11 más
- **sesion.js** — Acceso mediante Sign in with Apple.
  cargarConfiguracion · entrarConApple · pedirEntrar · consultarSolicitud · retirarSolicitud
  codigoDeAutorizacion · eliminarLaCuenta
- **sincronizacion.js** — Motor de sincronización: interfaz optimista sobre una cola persistente.
  instantanea · estado · suscribir · iniciar · detener · guardar · retirar
  listarSolicitudes · resolverSolicitud · redactarDia · …y 5 más
- **ui.js** — Piezas de interfaz reutilizables: construcción de nodos, hoja modal y avisos.
  el · vaciar · colorDePersona · iniciales · avatar · icono · botonIcono · abrirHoja
  cerrarHoja · hayHojaAbierta · …y 8 más

### `pwa/publico/js/vistas/` · Las cuatro secciones de la aplicación

- **buscar.js** — Búsqueda global sobre Ideas y Ocasiones, que es el alcance de la primera versión (spec…
  reiniciarBusqueda · pintarBuscar
- **familia.js** — Familia: el registro de personas y la ficha de cada una.
  pintarFamilia · abrirFicha
- **regalos.js** — Regalos: el banco de ideas y las campañas.
  reiniciarRegalos · pintarRegalos · seccionActual · abrirOcasion · abrirDetalleIdea
  abrirDetalleRegalo · abrirSelectorDeRegalo · abrirCapturaDeIdea
- **semana.js** — La agenda: semana, mes y lista sobre los mismos datos.
  reiniciarAgenda · tituloDeAgenda · pintarAgenda · abrirDia · abrirDetalleEvento
  bloqueDeComentarios · abrirFormularioEvento · anclaActual

### `herramientas/` · Utilidades de desarrollo

- **mapa.py** — Mapa del repositorio, derivado del propio código.
  primera_frase · docstring_js · simbolos_python · simbolos_js · modulos · rutas_del_worker
  workflows · referencias_a_specs · variables_de_entorno · pruebas · …y 7 más
- **preparar-pwa.py** — Prepara los recursos de la PWA que se derivan de otros ficheros.
  registro_de_demostracion · png · dibujar_icono · main

## Rutas de la API

- `GET  /api/salud` — comprobación sin autenticar
- `POST /api/sesion` — canjea un token de Apple por la sesión que corresponda
- `POST /api/solicitud` — pide entrar (sala de espera)
- `GET  /api/solicitud` — en qué ha quedado la solicitud propia
- `DELETE /api/solicitud` — retira la solicitud propia (App Store 5.1.1)
- `POST /api/cuenta/baja` — elimina la cuenta de quien la pide (App Store 5.1.1)
- `GET  /api/sync` — instantánea filtrada para el lector autenticado
- `POST /api/cambios` — aplica la cola de cambios del dispositivo
- `GET  /api/conflictos` — coordinación pendiente de revisar (administradores)
- `GET  /api/solicitudes` — bandeja de quien espera (administradores)
- `POST /api/solicitudes/resolver` — aprueba o rechaza (administradores)
- `GET  /api/registro` — registro completo para el generador del plan semanal
- `POST /api/redactar` — un día o un tramo de días, contado por un modelo
- `GET  /api/ia` — configuración de la redacción (administradores)
- `POST /api/ia` — guarda clave, modelo e instrucción (administradores)
- `POST /api/ia/probar` — redacta y devuelve la traza entera (administradores)

## Workflows

- **despachador** (`7 7 * * *`, workflow_dispatch) — Sondeo diario que despacha lo vencido, en lugar de dispararse a la hora exacta del mensaje:…
- **desplegar la API** (push, workflow_dispatch) — Sube el Worker a Cloudflare cuando cambia `api/`.
- **mantenimiento** (`13 4 1 * *`, workflow_dispatch) — GitHub deshabilita los workflows programados tras sesenta días sin commits en la rama por…
- **bundle OTA** (push, workflow_dispatch) — Publica el bundle web que las apps iOS se descargan solas.
- **plan-semanal** (`11 15 * * 0`, `11 17 * * 0`, `11 19 * * 0`, `11 21 * * 0`, workflow_dispatch) — El plan de la semana entrante, compuesto por destinatario y entregado por CallMeBot…
- **pruebas** (push, pull_request, workflow_dispatch)

## Especificación → código

Leído de las citas a `specs/` que el código lleva en sus comentarios.

- **`specs/autenticacion.md`**
  `api/src/index.js` §7 · `api/src/solicitudes.js` §2, §9 · `pwa/publico/js/native.js` §8
  `pwa/publico/js/sesion.js` §8
- **`specs/despachador.md`**
  `scripts/agenda/__init__.py` §8 · `scripts/agenda/modelo.py` §5
  `scripts/agenda/semana.py` §8 · `scripts/callmebot.py` §6 · `scripts/despachar.py`
  `tests/test_despachar.py` §5, §8
- **`specs/especificacion.md`**
  `pwa/publico/js/native.js` §3.5 · `scripts/agenda/modelo.py` §7
- **`specs/modelo-datos.md`**
  `api/src/filtrado.js` §7.3 · `api/src/repositorio.js` §4 · `api/src/visibilidad.js`
  `pwa/publico/js/modelo.js` · `pwa/publico/js/semana.js` §7.4
  `pwa/publico/js/sincronizacion.js` §1 · `scripts/agenda/__init__.py` §2, §4, §6
  `scripts/agenda/modelo.py` §4 · `scripts/agenda/semana.py` §2.4, §7.4
  `scripts/agenda/visibilidad.py` · `tests/test_modelo.py` §4
  `tests/test_visibilidad.py` §6
- **`specs/plan-semanal.md`**
  `api/src/index.js` §9 · `api/src/visibilidad.js` §5
  `scripts/agenda/__init__.py` §3, §4, §6 · `scripts/agenda/fuente.py` §12.1
  `scripts/agenda/mensaje.py` §5, §11 · `scripts/agenda/semana.py` §3
  `scripts/agenda/visibilidad.py` §5 · `scripts/callmebot.py` §9 · `scripts/plan_semanal.py`
  `tests/test_mensaje.py` §6, §7 · `tests/test_plan_semanal.py` · `tests/test_semana.py` §3
  `tests/test_visibilidad.py` §5
- **`specs/ux.md`**
  `pwa/publico/js/almacen.js` §1 · `pwa/publico/js/app.js`
  `pwa/publico/js/semana.js` §8, §10.2 · `pwa/publico/js/sincronizacion.js` §1
  `pwa/publico/js/ui.js` §1, §3 · `pwa/publico/js/vistas/familia.js` §3, §7, §11
  `pwa/publico/js/vistas/regalos.js` §2, §3, §6
  `pwa/publico/js/vistas/semana.js` §10, §10.1, §10.2 · `scripts/agenda/semana.py` §10.2

## Variables de entorno

Scripts, y quién las lee:

- `AGENDA_PATH` — `scripts/agenda/fuente.py`
- `AGENDA_TOKEN` — `scripts/agenda/fuente.py`
- `AGENDA_URL` — `scripts/agenda/fuente.py`
- `CATALOGOS_PATH` — `scripts/agenda/fuente.py`
- `ESTADO_PLAN_PATH` — `scripts/plan_semanal.py`
- `QUEUE_PATH` — `scripts/despachar.py`
- `RECIPIENTS_JSON` — `scripts/callmebot.py`

Worker (`api/wrangler.toml`, `[vars]` y secretos):

`APPLE_AUD_IOS` · `APPLE_AUD_WEB` · `APPLE_CLAVE_ID` · `APPLE_CLAVE_P8` · `APPLE_EQUIPO`
`DB` · `ORIGENES_PERMITIDOS` · `REDIRECCION_WEB` · `SESION_SECRETO` · `TOKEN_SERVICIO`

## Pruebas

**148** en total.

- `tests/test_configuracion.py` — 13
- `tests/test_despachar.py` — 10
- `tests/test_mensaje.py` — 12
- `tests/test_modelo.py` — 18
- `tests/test_plan_semanal.py` — 11
- `tests/test_semana.py` — 13
- `tests/test_visibilidad.py` — 13
- `api/test/cuenta.test.js` — 6
- `api/test/redaccion.test.js` — 27
- `api/test/solicitudes.test.js` — 14
- `api/test/visibilidad.test.js` — 11

Lo que ejecuta la integración continua:

```bash
python3 -m unittest discover -s tests -v
python3 herramientas/mapa.py --verificar
python3 scripts/plan_semanal.py --simulacro --fecha 2026-07-26
node --test 'test/*.test.js'
```
