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

- **Al tocar un módulo o el CSS, sube `VERSION` en `pwa/publico/sw.js`.** El
  service worker los sirve de la caché antes que de la red, así que sin ese
  cambio lo nuevo no llega a quien ya tenga la aplicación abierta: no falla
  nada, simplemente se sigue viendo lo de antes. Desde fuera parece que el
  cambio no se hizo. `pruebas.yml` lo comprueba ahora en cada PR.
- **Hay ocho temas de diseño propuestos y ninguno decidido.** Están en
  `specs/propuesta-temas-de-diseno.html`: ocho identidades más —cada una con sus
  dos modos y sus dieciséis fichas de color escritas con los nombres que ya usa
  `estilos.css`— con lo que gana y lo que cuesta cada una. Nada de esto está
  implementado: hoy sigue habiendo una sola identidad y el selector de Ajustes
  elige únicamente el modo. Ponerlas pide un segundo eje —un `data-identidad` en
  la raíz, con su preferencia guardada— y que las etiquetas `theme-color` de
  `index.html`, que hoy llevan el verde a mano, se escriban desde el código.
  Queda por decidir **cuáles se construyen** —la propuesta recomienda empezar por
  Azulete y Nocturno de cocina— y **si la identidad es de cada dispositivo, como
  el modo, o de la casa entera** y se guarda en `configuracion`.
- **Queda una migración por aplicar: `0007_estado_regalo.sql`**, que convierte a
  «comprado» lo que estuviera «envuelto». Es corriente y no `.unavez` —se puede
  repetir sin consecuencias—, así que basta con marcar la casilla de las
  migraciones al desplegar la API. Las dos `.unavez` —los círculos (`0005`) y el
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
- **La pestaña de Regalos tiene tres secciones**: Ideas, Regalos y Ocasiones, en
  el orden del ciclo. La de en medio es nueva y está en `specs/ux.md` §6.2: lo
  que hay cogido para alguien, por estado —Por comprar y Listos—, con los filtros
  de «los que llevo yo» y «sin nadie», y lo que ya pasó de fecha en un apartado
  plegado al final. **Nada se archiva solo al pasar la fecha**: lo que archiva es
  dar la ocasión por cerrada a mano, que es un verbo nuevo del detalle de la
  ocasión y que además cierra las ideas que salieron de allí. Los estados del
  regalo son ahora tres —se retiró «envuelto»—. El análisis del ciclo y las
  opciones que se descartaron están en `specs/propuesta-ciclo-del-regalo.html`;
  queda abierto **cómo partir los dos grupos cuando un diciembre acumule treinta
  regalos**, que es cuando los rótulos dejarán de bastar.
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
