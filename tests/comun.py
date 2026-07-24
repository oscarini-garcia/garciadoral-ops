"""Utilidades compartidas por las pruebas: rutas y registro de ejemplo."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

RAIZ = Path(__file__).resolve().parents[1]
if str(RAIZ / "scripts") not in sys.path:
    sys.path.insert(0, str(RAIZ / "scripts"))

from agenda.modelo import cargar_agenda, cargar_catalogos  # noqa: E402

CATALOGOS = cargar_catalogos(RAIZ / "datos" / "catalogos.json")


def agenda_minima(**cambios: Any):
    """Registro pequeño y completo, base de la mayoría de las pruebas.

    Dos administradores con cuenta (Ana y Óscar), dos miembros (Marta y Lucía) y
    una persona sin cuenta (la abuela).
    """
    datos: dict[str, Any] = {
        "personas": [
            {
                "id": "p-ana",
                "nombre": "Ana",
                "fecha_nacimiento": "1980-05-12",
                "tiene_cuenta": True,
                "rol": "administrador",
            },
            {
                "id": "p-oscar",
                "nombre": "Óscar",
                "tiene_cuenta": True,
                "rol": "administrador",
            },
            {
                "id": "p-marta",
                "nombre": "Marta",
                "fecha_nacimiento": "2010-08-01",
                "tiene_cuenta": True,
                "rol": "miembro",
            },
            {
                "id": "p-lucia",
                "nombre": "Lucía",
                "tiene_cuenta": True,
                "rol": "miembro",
            },
            {
                "id": "p-abuela",
                "nombre": "la abuela",
                "fecha_nacimiento": "1949-07-30",
                "tiene_cuenta": False,
            },
        ],
        "etiquetas": [{"id": "e-adolescente", "nombre": "adolescente"}],
        "eventos": [],
        "ideas": [],
        "ocasiones": [],
        "regalos": [],
    }
    datos.update(cambios)
    return cargar_agenda(datos, CATALOGOS)
