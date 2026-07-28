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
- **lio.py** — Los turnos de paseo de Lío, derivados del cuadro semanal.
  TurnoLio · id_paseo · cuadro_normalizado · inicio_de_ventana · versiones_normalizadas
  cuadro_en · turno_de · turnos_de · hay_lio
- **mensaje.py** — Composición del texto del plan semanal para WhatsApp.
  formatear_dia · formatear_rango · formatear_lio · formatear_evento · Plan · componer
- **modelo.py** — Entidades y reglas de integridad de la Agenda Familiar.
  ErrorDeIntegridad · Persona · AtributoPersona · Categoria · Etiqueta · OrientacionIdea
  Idea · TipoEvento · ParticipanteEvento · Evento · …y 10 más
- **semana.py** — Selección de los eventos de la semana entrante.
  Semana · semana_entrante · Instancia · Aparicion · eventos_derivados · ocurrencias
  instancias_de_la_semana · repartir_por_dia
- **visibilidad.py** — Función de visibilidad de la Agenda Familiar.
  destinatarios_de_idea · destinatarios_de_regalo · destinatarios_de_evento · visible
  visible_publicamente · comentarios_visibles · es_de_la_casa

### `scripts/` · Los dos procesos programados y su transporte

- **callmebot.py** — Transporte compartido: envío de un WhatsApp a través de CallMeBot.
  cargar_destinatarios · enviar
- **despachar.py** — Despacha los mensajes vencidos de queue.json a través de CallMeBot.
  parsear · siguiente · procesar · main
- **plan_semanal.py** — Genera y envía el plan de la semana entrante, un mensaje por destinatario.
  DestinatarioInvalido · en_ventana · clave_de_semana · leer_estado · escribir_estado
  destinatarios_del_plan · instancias_visibles · componer_para · turnos_de_la_semana
  enviar_plan · …y 2 más

### `api/src/` · Worker de Cloudflare: filtra antes de transmitir

- **apns.js** — El transporte hasta el teléfono: APNs con autenticación por token.
  hayApnsConfigurado · tokenDeProveedor · olvidarTokenDeProveedor · enviarAviso
- **apple.js** — Verificación del token de identidad de Sign in with Apple.
  base64urlADatos · verificarTokenDeApple
- **avisos.js** — Lo que hace sonar un teléfono ajeno, decidido en el servidor.
  CATEGORIA_CAMBIO · CATEGORIA_CORRECCION · avisosDe · empujar
- **comentables.js** — Qué cosas admiten comentario, en un solo sitio.
  COMENTABLES · esComentable · comentariosVisibles
- **derivar.js** — Estados que nadie mantiene a mano.
  derivarEstados
- **filtrado.js** — Composición del conjunto que se transmite a un dispositivo.
  componerInstantanea
- **index.js** — API de la Agenda Familiar sobre Cloudflare Workers y D1.
- **lio.js** — Lío: el cuadro semanal de paseos y las reglas que lo gobiernan en el servidor.
  CLAVE_CUADRO · TURNOS · IDS_TURNO · cuadroVacio · normalizarCuadro · normalizarVersiones
  cuadroEn · tramoLocal · inicioDeVentana · leerCuadro · …y 4 más
- **redaccion.js** — Lo que la agenda le pide a un modelo de Anthropic: contar un día, proponer un regalo y…
  MODELOS_DE_RESERVA · MODELO_POR_DEFECTO · INSTRUCCION_POR_DEFECTO
  INSTRUCCION_REGALO_POR_DEFECTO · INSTRUCCION_FELICITACION_POR_DEFECTO
  INSTRUCCION_APUNTE_POR_DEFECTO · leerConfiguracion · configuracionPublica
  guardarConfiguracion · cadenaDeModelos · …y 10 más
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
  leerCola · vaciarCola · olvidarTodo · guardarSesion · leerSesion · …y 3 más
- **app.js** — Arranque y navegación.
  TEXTO_SINCRONIZACION
- **avisos.js** — Lo que espera a quien mira, venga del módulo que venga.
  idVisto · marcarVisto · avisosDe · porContestar · novedades · hayAvisos
- **comentarios.js** — El hilo de comentarios de cualquier cosa.
  bloqueDeComentarios
- **demo.js** — Modo demostración.
  cargarRegistroDemo · componerDemo
- **gente.js** — El campo con el que se elige gente, en todas las pantallas que lo piden.
  campoDeGente
- **lio.js** — Lío: los turnos de paseo, sus estados y el trato que los cambia de dueño.
  TURNOS · IDS_TURNO · turnoPorId · nombreDeTurno · rotuloDeTurno · idPaseo · cuadroVacio
  versionesDe · cuadroEn · cuadroDe · …y 17 más
- **modelo.js** — Consultas sobre la instantánea local.
  EMOJI_POR_DEFECTO · emojiVisible · CIRCULOS · TAMANO_FAMILIA · PARENTESCOS
  PARENTESCO_OTRO · nombreCompleto · deQuien · GENEROS · partirEmoji · …y 11 más
- **native.js** — Puente con la cáscara nativa de iOS.
  esNativo · toque · compartir · copiar · comprobarActualizacion · versionInstalada
  autorizacionDeAppleNativa · tokenDeAppleNativo · programarRecordatorios
  HORIZONTE_RECORDATORIOS_DIAS · …y 8 más
- **semana.js** — La semana como marco fijo de siete días.
  INICIALES_DIA · NOMBRES_DIA · MESES_LARGOS · TECHO_EVENTOS_DIA · indiceDia · parsearMomento
  soloFecha · iso · isoConHora · sumarDias · …y 15 más
- **sesion.js** — Acceso mediante Sign in with Apple.
  cargarConfiguracion · entrarConApple · pedirEntrar · consultarSolicitud · retirarSolicitud
  codigoDeAutorizacion · eliminarLaCuenta
- **sincronizacion.js** — Motor de sincronización: interfaz optimista sobre una cola persistente.
  instantanea · estado · suscribir · iniciar · detener · guardar · retirar
  listarSolicitudes · resolverSolicitud · redactarDia · …y 10 más
- **sitios.js** — Sitios: las clases de un apunte, el voto y el orden en que se leen.
  CLASES · esLista · CLASE_POR_DEFECTO · IDS_CLASE · clasePorId · idVoto · haySitios
  lugaresDe · nombreDeLugar · lugarPorId · …y 13 más
- **ui.js** — Piezas de interfaz reutilizables: construcción de nodos, hoja modal y avisos.
  el · vaciar · colorDePersona · iniciales · avatar · icono · botonIcono · abrirHoja
  cerrarHoja · hayHojaAbierta · …y 10 más
- **version.js** — La versión de la aplicación, escrita donde la web puede leerla.
  VERSION_APP

### `pwa/publico/js/vistas/` · Las cinco secciones de la aplicación

- **familia.js** — Gente: el registro de personas y la ficha de cada una.
  reiniciarFamilia · pintarFamilia · abrirFicha · abrirFormularioPersona
- **hoy.js** — Hoy: la pantalla con la que abre la aplicación.
  reiniciarHoy · tituloDeHoy · pintarHoy
- **regalos.js** — Regalos: las ideas, los regalos y las ocasiones.
  reiniciarRegalos · pintarRegalos · seccionActual · nuevoDesdeRegalos · marcaDeSeleccionada
  personaDelCumple · ocasionDeEvento · abrirOcasion · abrirCumple · abrirDetalleIdea
  …y 3 más
- **semana.js** — La agenda: semana, mes y lista sobre los mismos datos.
  reiniciarAgenda · tituloDeAgenda · pintarAgenda · abrirLioDelDia · filaDeTurno
  resumenDeTurno · abrirTurnoDeLio · bloqueDePropuesta · textoDePropuesta · abrirDia
  …y 3 más
- **sitios.js** — Sitios: lo que una casa sabe de un lugar y se le olvida cada año.
  reiniciarSitios · tituloDeSitios · nuevoDesdeSitios · pintarSitios · abrirApunte

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
- `POST /api/avisos` — este aparato quiere avisos, y este es su token
- `DELETE /api/avisos` — este aparato deja de querer avisos
- `GET  /api/conflictos` — coordinación pendiente de revisar (administradores)
- `GET  /api/solicitudes` — bandeja de quien espera (administradores)
- `POST /api/solicitudes/resolver` — aprueba o rechaza (administradores)
- `GET  /api/registro` — registro completo para el generador del plan semanal
- `POST /api/redactar` — un día o un tramo de días, contado por un modelo
- `POST /api/regalo/sugerir` — cinco propuestas de regalo para una persona
- `POST /api/sitio/apuntar` — cinco apuntes para un sitio y una clase
- `POST /api/cumple/felicitar` — cinco felicitaciones para quien cumple
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
  `api/src/comentables.js` §5.3 · `pwa/publico/js/native.js` §3.5
  `scripts/agenda/modelo.py` §7
- **`specs/modelo-datos.md`**
  `api/src/avisos.js` §2.9 · `api/src/comentables.js` §2.3 · `api/src/filtrado.js` §7.3
  `api/src/lio.js` §2.6 · `api/src/repositorio.js` §4 · `api/src/visibilidad.js`
  `pwa/publico/js/avisos.js` §2.8 · `pwa/publico/js/lio.js` §2.6
  `pwa/publico/js/modelo.js` §4 · `pwa/publico/js/semana.js` §7.4
  `pwa/publico/js/sincronizacion.js` §1 · `pwa/publico/js/sitios.js` §2.7
  `pwa/publico/js/vistas/regalos.js` §5.2, §7.4 · `scripts/agenda/__init__.py` §2, §4, §6
  `scripts/agenda/lio.py` §2.6 · `scripts/agenda/modelo.py` §4
  `scripts/agenda/semana.py` §2.4, §7.4 · `scripts/agenda/visibilidad.py`
  `tests/test_modelo.py` §4 · `tests/test_visibilidad.py` §6
- **`specs/plan-semanal.md`**
  `api/src/index.js` §9 · `api/src/visibilidad.js` §5
  `scripts/agenda/__init__.py` §3, §4, §6 · `scripts/agenda/fuente.py` §12.1
  `scripts/agenda/mensaje.py` §5, §11 · `scripts/agenda/semana.py` §3
  `scripts/agenda/visibilidad.py` §5 · `scripts/callmebot.py` §9 · `scripts/plan_semanal.py`
  `tests/test_mensaje.py` §6, §7 · `tests/test_plan_semanal.py` · `tests/test_semana.py` §3
  `tests/test_visibilidad.py` §5
- **`specs/ux.md`**
  `api/src/avisos.js` §12.4 · `pwa/publico/js/almacen.js` §1 · `pwa/publico/js/app.js` §7.1
  `pwa/publico/js/avisos.js` §12.2 · `pwa/publico/js/lio.js` §10.3
  `pwa/publico/js/modelo.js` §6.2, §7.1 · `pwa/publico/js/native.js` §12.4
  `pwa/publico/js/semana.js` §8, §10.2 · `pwa/publico/js/sincronizacion.js` §1
  `pwa/publico/js/sitios.js` §12.1 · `pwa/publico/js/ui.js` §1, §3
  `pwa/publico/js/vistas/familia.js` §3, §7, §7.1, §11
  `pwa/publico/js/vistas/hoy.js` §6.5, §10.3, §11
  `pwa/publico/js/vistas/regalos.js` §2, §3, §6, §6.1, §6.2, §6.3
  `pwa/publico/js/vistas/semana.js` §10, §10.1, §10.2, §10.3
  `pwa/publico/js/vistas/sitios.js` §12.1 · `scripts/agenda/lio.py` §10.3
  `scripts/agenda/modelo.py` §7.1 · `scripts/agenda/semana.py` §10.2

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

`APNS_CLAVE_ID` · `APNS_CLAVE_P8` · `APNS_ENTORNO` · `APNS_TOPICO` · `APPLE_AUD_IOS`
`APPLE_AUD_WEB` · `APPLE_CLAVE_ID` · `APPLE_CLAVE_P8` · `APPLE_EQUIPO` · `DB`
`ORIGENES_PERMITIDOS` · `REDIRECCION_WEB` · `SESION_SECRETO` · `TOKEN_SERVICIO`

## Pruebas

**269** en total.

- `tests/test_configuracion.py` — 13
- `tests/test_despachar.py` — 10
- `tests/test_lio.py` — 22
- `tests/test_mensaje.py` — 12
- `tests/test_modelo.py` — 25
- `tests/test_plan_semanal.py` — 11
- `tests/test_semana.py` — 13
- `tests/test_service_worker.py` — 2
- `tests/test_version.py` — 1
- `tests/test_visibilidad.py` — 13
- `api/test/apns.test.js` — 11
- `api/test/avisos.test.js` — 23
- `api/test/cuenta.test.js` — 6
- `api/test/lio.test.js` — 23
- `api/test/redaccion.test.js` — 54
- `api/test/sitios.test.js` — 5
- `api/test/solicitudes.test.js` — 14
- `api/test/visibilidad.test.js` — 11

Lo que ejecuta la integración continua:

```bash
python3 -m unittest discover -s tests -v
git fetch --no-tags --force origin main:refs/remotes/origin/main
python3 herramientas/mapa.py --verificar
python3 scripts/plan_semanal.py --simulacro --fecha 2026-07-26
node --test 'test/*.test.js'
```
