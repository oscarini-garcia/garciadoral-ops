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

- **Pendiente de decidir: cómo se dibuja la pantalla de personas.** Está sobre la
  mesa `specs/propuesta-familia-circulos.html`, con cuatro opciones para partir el
  registro en tres círculos —Familia (los cuatro de casa, cerrado), Familia
  Extendida y Amigos—, cada uno con su `+`, más un buscador y la marca de a quién
  le falta la fecha de nacimiento. La recomendación es la opción A. Al elegir, se
  recogen sus decisiones en `specs/ux.md` y se lleva a
  `pwa/publico/js/vistas/familia.js`; en el modelo, el campo se propone llamar
  `circulo` y no «categoría», que ya está tomado por la tabla de los eventos.
- Lo pendiente de construir está en el apartado 7 del `README`: los calendarios
  externos, la copia periódica de salvaguarda y la parte configurable del
  recordatorio previo.

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
