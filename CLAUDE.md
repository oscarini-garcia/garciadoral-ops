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

## HTML autocontenido (inline)

Los archivos `.html` que se generen para specs, prototipos y documentos similares
deben ser **autocontenidos (inline)**: todo el CSS y el JavaScript van incrustados
en el propio archivo, sin dependencias externas.

- Incluye el CSS en una etiqueta `<style>` dentro del `<head>` (no uses `<link>` a
  hojas de estilo externas).
- Incluye el JavaScript en etiquetas `<script>` dentro del propio archivo (no uses
  `<script src="...">` a archivos externos).
- No enlaces a recursos externos (CDNs, fuentes, imágenes remotas, etc.); si hace
  falta un recurso, incrústalo (por ejemplo, imágenes como `data:` URI).
- El objetivo es que cada `.html` se pueda abrir y compartir como un único archivo
  independiente.
