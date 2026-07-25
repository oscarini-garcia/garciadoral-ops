#!/usr/bin/env python3
"""Prepara los recursos de la PWA que se derivan de otros ficheros.

Genera dos cosas, ambas reproducibles y sin dependencias externas:

1. `pwa/publico/demo/registro-demo.json`, a partir de `datos/catalogos.json` y
   `datos/agenda.ejemplo.json` más unos cuantos eventos añadidos aquí para que
   la demostración tenga una semana con contenido, un día con desbordamiento y
   un evento reservado que solo ven los administradores.
2. Los iconos de la aplicación, dibujados como el marco de siete días que abre
   la aplicación.

    python3 herramientas/preparar-pwa.py
"""

from __future__ import annotations

import json
import struct
import zlib
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "pwa" / "publico"

TINTA = (14, 110, 98)
PAPEL = (251, 249, 245)
GRANATE = (142, 59, 94)


# --------------------------------------------------------------------------- #
# Registro de demostración
# --------------------------------------------------------------------------- #

EVENTOS_EXTRA = [
    {
        "id": "ev-colegio",
        "titulo": "Reunión del colegio",
        "tipo_id": "fecha_escolar",
        "inicio": "2026-07-20T17:00:00",
        "participantes": [{"persona_id": "p-ana", "rol": "asistente"}],
    },
    {
        "id": "ev-sorpresa-julio",
        "titulo": "Ver el sitio para la fiesta",
        "tipo_id": "otro",
        "inicio": "2026-07-23T18:00:00",
        "categoria_id": "coordinacion",
        "participantes": [
            {"persona_id": "p-ana", "rol": "asistente"},
            {"persona_id": "p-oscar", "rol": "asistente"},
        ],
    },
    {"id": "ev-peluqueria", "titulo": "Peluquería", "tipo_id": "otro", "inicio": "2026-07-25T10:00:00"},
    {"id": "ev-compra", "titulo": "Compra grande de la semana", "tipo_id": "otro", "inicio": "2026-07-25T12:00:00"},
    {"id": "ev-cine", "titulo": "Cine", "tipo_id": "celebracion", "inicio": "2026-07-25T19:00:00"},
    {"id": "ev-cena", "titulo": "Cena con los vecinos", "tipo_id": "celebracion", "inicio": "2026-07-25T21:30:00"},
    {
        "id": "ev-comida-julio",
        "titulo": "Comida con los abuelos",
        "tipo_id": "celebracion",
        "emoji": "🍽️",
        "inicio": "2026-07-26T14:00:00",
        "lleva_regalos": False,
        "participantes": [
            {"persona_id": "p-abuela", "rol": "asistente"},
            {"persona_id": "p-abuelo", "rol": "asistente"},
        ],
    },
    {
        "id": "ev-viaje",
        "titulo": "Viaje a la sierra",
        "tipo_id": "viaje",
        "inicio": "2026-08-06",
        "fin": "2026-08-09",
        "jornada_completa": True,
        "participantes": [
            {"persona_id": "p-ana", "rol": "asistente"},
            {"persona_id": "p-oscar", "rol": "asistente"},
            {"persona_id": "p-marta", "rol": "asistente"},
            {"persona_id": "p-lucia", "rol": "asistente"},
        ],
    },
]


def registro_de_demostracion() -> dict:
    catalogos = json.loads((RAIZ / "datos" / "catalogos.json").read_text(encoding="utf-8"))
    agenda = json.loads((RAIZ / "datos" / "agenda.ejemplo.json").read_text(encoding="utf-8"))

    registro = {
        "_nota": (
            "Registro de demostración generado por herramientas/preparar-pwa.py. "
            "Personas y fechas inventadas."
        ),
        "personas": agenda["personas"],
        "atributos_persona": agenda.get("atributos_persona", []),
        "categorias": catalogos["categorias"],
        "acceso_categoria": [],
        "etiquetas": agenda.get("etiquetas", []),
        "tipos_evento": catalogos["tipos_evento"],
        "emojis_permitidos": catalogos["emojis_permitidos"],
        "eventos": agenda["eventos"] + EVENTOS_EXTRA,
        "ideas": agenda.get("ideas", []),
        "ocasiones": agenda.get("ocasiones", []),
        "regalos": agenda.get("regalos", []),
        "comentarios": agenda.get("comentarios", []),
        "conflictos": [],
    }

    # La API sirve siempre las filas completas, porque los valores por defecto
    # los pone la propia base. Aquí se rellenan a mano para que la demostración
    # reciba exactamente la misma forma y no necesite ningún caso especial.
    for ocasion in registro["ocasiones"]:
        ocasion.setdefault("presupuestos", [])
        ocasion.setdefault("estado", "abierta")
        ocasion.setdefault("participantes", [])
        ocasion.setdefault("activa", True)

    for idea in registro["ideas"]:
        idea.setdefault("tipo", "sugerencia")
        idea.setdefault("estado", "activa")
        idea.setdefault("orientaciones", [])
        idea.setdefault("activa", True)

    for evento in registro["eventos"]:
        evento.setdefault("participantes", [])
        evento.setdefault("jornada_completa", len(str(evento["inicio"])) == 10)
        evento.setdefault("repeticion", "ninguna")
        evento.setdefault("origen", "manual")
        evento.setdefault("activo", True)

    for regalo in registro["regalos"]:
        regalo.setdefault("estado", "pendiente")
        regalo.setdefault("compartido", False)
        regalo.setdefault("codestinatarios", [])
        regalo.setdefault("activo", True)

    return registro


# --------------------------------------------------------------------------- #
# Iconos
# --------------------------------------------------------------------------- #


def png(ancho: int, alto: int, pixeles: bytearray) -> bytes:
    """Codifica un PNG RGB de 8 bits sin dependencias."""

    def trozo(tipo: bytes, datos: bytes) -> bytes:
        return (
            struct.pack(">I", len(datos))
            + tipo
            + datos
            + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
        )

    crudo = bytearray()
    for y in range(alto):
        crudo.append(0)  # filtro «none»
        crudo += pixeles[y * ancho * 3 : (y + 1) * ancho * 3]

    return (
        b"\x89PNG\r\n\x1a\n"
        + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
        + trozo(b"IDAT", zlib.compress(bytes(crudo), 9))
        + trozo(b"IEND", b"")
    )


def dibujar_icono(lado: int, margen: float) -> bytes:
    """El marco de siete días: siete barras, la de hoy en granate.

    `margen` es la fracción del lado que se reserva alrededor del dibujo. En el
    icono enmascarable se amplía, para que el recorte circular de Android no se
    coma las barras de los extremos.
    """
    pixeles = bytearray()
    for _ in range(lado * lado):
        pixeles += bytes(TINTA)

    def pintar(x0, y0, x1, y1, color):
        for y in range(max(0, int(y0)), min(lado, int(y1))):
            fila = y * lado * 3
            for x in range(max(0, int(x0)), min(lado, int(x1))):
                pixeles[fila + x * 3 : fila + x * 3 + 3] = bytes(color)

    interior = lado * (1 - 2 * margen)
    izquierda = lado * margen
    alto_barra = interior / 13          # siete barras y seis huecos del mismo alto
    for indice in range(7):
        arriba = lado * margen + indice * alto_barra * 2
        largo = interior if indice in (2, 5) else interior * 0.62
        pintar(izquierda, arriba, izquierda + largo, arriba + alto_barra,
               GRANATE if indice == 3 else PAPEL)

    return png(lado, lado, pixeles)


ICONO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Agenda Familiar">
  <rect width="512" height="512" rx="112" fill="#0E6E62"/>
  <g fill="#FBF9F5">
    <rect x="96" y="112" width="198" height="24" rx="12"/>
    <rect x="96" y="161" width="198" height="24" rx="12"/>
    <rect x="96" y="210" width="320" height="24" rx="12"/>
    <rect x="96" y="308" width="198" height="24" rx="12"/>
    <rect x="96" y="357" width="320" height="24" rx="12"/>
    <rect x="96" y="406" width="198" height="24" rx="12"/>
  </g>
  <rect x="96" y="259" width="320" height="24" rx="12" fill="#E48FAE"/>
</svg>
"""


# --------------------------------------------------------------------------- #


def main() -> int:
    (DESTINO / "demo").mkdir(parents=True, exist_ok=True)
    (DESTINO / "iconos").mkdir(parents=True, exist_ok=True)

    (DESTINO / "demo" / "registro-demo.json").write_text(
        json.dumps(registro_de_demostracion(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    (DESTINO / "iconos" / "icono-192.png").write_bytes(dibujar_icono(192, 0.16))
    (DESTINO / "iconos" / "icono-512.png").write_bytes(dibujar_icono(512, 0.16))
    (DESTINO / "iconos" / "icono-maskable.png").write_bytes(dibujar_icono(512, 0.26))
    (DESTINO / "iconos" / "icono.svg").write_text(ICONO_SVG, encoding="utf-8")

    print("Recursos de la PWA preparados en", DESTINO)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
