#!/usr/bin/env bash
#
# Aprueba una solicitud de acceso desde la línea de órdenes.
#
# Lo normal es aprobar desde la aplicación —Gente, «Hay N personas esperando»—,
# que además deja elegir el rol y vincular a una ficha que ya exista. Esto es
# para el caso que la aplicación no puede resolver: **quien se ha quedado fuera
# y no tiene a nadie por encima**. Le pasa a la primera persona del hogar, y le
# vuelve a pasar a cualquier administrador que se desvincule.
#
# Hace lo mismo que hace la aplicación al aprobar: escribe el identificador de
# Apple en la ficha y **borra la fila de la solicitud**. Ese borrado no es
# limpieza: quien está dentro vive en `persona`, y una solicitud resuelta a favor
# que se quedara ahí sería el correo de alguien del hogar guardado para nada y
# para siempre, además de un fantasma en la bandeja.
#
#   herramientas/aprobar-solicitud.sh                      · lista lo pendiente
#   herramientas/aprobar-solicitud.sh p-oscar              · aprueba la única
#   herramientas/aprobar-solicitud.sh p-oscar 000674.a1b2  · aprueba esa
#   herramientas/aprobar-solicitud.sh p-oscar --simulacro  · enseña el SQL
#
# Necesita `wrangler` con la sesión abierta, y se ejecuta desde cualquier sitio
# del repositorio.

set -euo pipefail

BASE=agenda-familiar
PERSONA="${1:-}"
IDENTIFICADOR=""
SIMULACRO=0

for argumento in "${@:2}"; do
  case "$argumento" in
    --simulacro) SIMULACRO=1 ;;
    *) IDENTIFICADOR="$argumento" ;;
  esac
done

cd "$(dirname "$0")/../api"

# `--json` para poder leerlo sin adivinar el formato de la tabla que pinta
# wrangler, que cambia entre versiones.
consultar() {
  wrangler d1 execute "$BASE" --remote --json --command "$1"
}

leer() {
  python3 -c '
import json, sys
salida = json.load(sys.stdin)
bloques = salida if isinstance(salida, list) else [salida]
filas = [f for b in bloques for f in (b.get("results") or [])]
json.dump(filas, sys.stdout)
'
}

PENDIENTES=$(consultar "SELECT id, identificador_apple, nombre_declarado, correo, correo_privado, creado_en FROM solicitud_acceso WHERE estado = 'pendiente' ORDER BY creado_en" | leer)

CUANTAS=$(printf '%s' "$PENDIENTES" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')

if [[ "$CUANTAS" == "0" ]]; then
  echo "No hay ninguna solicitud pendiente."
  exit 0
fi

printf '%s' "$PENDIENTES" | python3 -c '
import json, sys
for f in json.load(sys.stdin):
    correo = f.get("correo") or "sin correo"
    if f.get("correo_privado"):
        correo += " (buzón de reenvío de Apple)"
    print("  %s  ·  %s" % (f["nombre_declarado"], correo))
    print("    %s  ·  desde %s" % (f["identificador_apple"], f["creado_en"]))
'

if [[ -z "$PERSONA" ]]; then
  echo
  echo "Para aprobar:  $(basename "$0") <id-de-persona> [identificador-de-apple]"
  exit 0
fi

# Con más de una esperando hay que decir cuál: aprobar «la pendiente» cuando hay
# dos es dejar que el orden de llegada decida a quién le abres la puerta.
if [[ -z "$IDENTIFICADOR" ]]; then
  if [[ "$CUANTAS" != "1" ]]; then
    echo
    echo "Hay $CUANTAS esperando: dime cuál, con su identificador de Apple." >&2
    exit 1
  fi
  IDENTIFICADOR=$(printf '%s' "$PENDIENTES" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["identificador_apple"])')
fi

FICHA=$(consultar "SELECT id, nombre, rol, identificador_apple FROM persona WHERE id = '$PERSONA'" | leer)

if [[ "$(printf '%s' "$FICHA" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')" == "0" ]]; then
  echo "No hay ninguna persona con id '$PERSONA'." >&2
  exit 1
fi

printf '%s' "$FICHA" | python3 -c '
import json, sys
p = json.load(sys.stdin)[0]
print()
print("Se vinculará a: %s (%s, %s)" % (p["nombre"], p["id"], p["rol"]))
if p.get("identificador_apple"):
    print("  ⚠ Ya tenía otro identificador puesto: %s" % p["identificador_apple"])
    print("    Se sustituye. Si no es lo que quiere, pare aquí.")
'

VINCULAR="UPDATE persona SET identificador_apple = '$IDENTIFICADOR' WHERE id = '$PERSONA'"
BORRAR="DELETE FROM solicitud_acceso WHERE identificador_apple = '$IDENTIFICADOR'"

if [[ "$SIMULACRO" == "1" ]]; then
  echo
  echo "$VINCULAR;"
  echo "$BORRAR;"
  echo
  echo "Simulacro: no se ha ejecutado nada."
  exit 0
fi

echo
read -r -p "¿Aprobar? [s/N] " respuesta
[[ "$respuesta" == "s" || "$respuesta" == "S" ]] || { echo "Nada hecho."; exit 0; }

consultar "$VINCULAR" > /dev/null
consultar "$BORRAR" > /dev/null

echo "Aprobado. Que vuelva a entrar con Apple, o pulse «Comprobar si ya está»."
