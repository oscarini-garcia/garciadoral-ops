# CLAUDE.md

Guía para trabajar en este repositorio.

## Codificación de archivos generados

Todos los archivos `.md` y `.html` que se generen para especificaciones (specs) y
documentos similares deben crearse **siempre con codificación UTF-8**, para que los
caracteres acentuados y especiales se muestren correctamente como artefactos UTF-8.

- Guarda siempre en UTF-8 (sin BOM).
- En los `.html`, incluye `<meta charset="utf-8">` en el `<head>`.
- No sustituyas caracteres acentuados (á, é, í, ó, ú, ñ, ¿, ¡, …) por entidades ni
  por versiones sin acento; deben conservarse tal cual en UTF-8.

## Mostrar los ficheros como artefactos

Los archivos `.md` y `.html` que se generen para specs, prototipos y documentos
similares deben **mostrarse como artefactos** en la conversación de Claude, además
de guardarse en el repositorio. No basta con escribirlos en disco: el usuario debe
poder verlos renderizados directamente en el chat.

- Cuando generes o actualices uno de estos ficheros, publícalo como artefacto para
  que se pueda revisar renderizado sin abrir el archivo aparte.
- Al actualizar un fichero ya publicado, vuelve a publicar el artefacto en la misma
  URL en lugar de crear uno nuevo.
- Mantén el artefacto y el archivo guardado en el repositorio con el mismo contenido.
