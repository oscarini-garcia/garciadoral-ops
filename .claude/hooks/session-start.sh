#!/bin/bash
# Inyecta el mapa del repositorio al abrir una sesión, para no tener que
# recorrer la aplicación entera cada vez.
#
# Lo que se imprime aquí se añade al contexto de la sesión. Se genera en este
# momento a partir del código, no se lee de un resumen guardado: por eso no
# puede estar desfasado.
#
# El script no escribe nada en el árbol de trabajo, así que abrir una sesión
# nunca deja el repositorio sucio. `docs/mapa.md` se regenera aparte, con
# `python3 herramientas/mapa.py`, y `pruebas.yml` comprueba que corresponde al
# código de su commit.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# Un fallo aquí no debe impedir que la sesión arranque: sin mapa se trabaja
# igual, solo que leyendo más ficheros.
if ! python3 herramientas/mapa.py --contexto 2>/tmp/mapa-error; then
  echo "No se pudo generar el mapa del repositorio (herramientas/mapa.py):"
  sed 's/^/  /' /tmp/mapa-error
  echo
  echo "Oriéntese con README.md mientras tanto."
fi

exit 0
