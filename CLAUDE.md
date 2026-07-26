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

- **Al desplegar, aplicar la migración `0006_genero.unavez.sql`** con el campo
  de al lado de la casilla en Actions. La de los círculos
  (`0005_circulos.unavez.sql`) ya está aplicada: no se vuelve a pedir, porque
  las `.unavez` no se pueden repetir —el `ALTER TABLE` falla si la columna ya
  está—. La pantalla de Gente está decidida y construida: tres círculos
  —Familia (los cuatro de casa, cerrado), Familia Extendida y Amigos—, con
  conmutador y sin avatares, el parentesco relativo a quien mira y el género
  para afinarlo. Está en `specs/ux.md` §7.1 y §7.2; el porqué de la elección se
  conserva en `specs/propuesta-familia-circulos.html`.
- **La pestaña de Ocasiones ya está construida** en dos apartados plegables:
  Fechas señaladas —Navidad y compañía, con sus verbos detrás de la pastilla— y
  Cumpleaños, derivados de las fichas y ordenados por el que viene antes. Está en
  `specs/ux.md` §6.1. No hay nada que migrar para desplegarla: la felicitación
  guarda su encargo en la tabla `configuracion`, que ya existe, y se apaga sola si
  no hay clave de Anthropic puesta. Queda abierto **si los cumpleaños deben
  arrancar desplegados** —hoy van plegados, con el próximo escrito en el rótulo— y
  qué hacer con las fechas señaladas cerradas cuando se acumulen una por año.
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
