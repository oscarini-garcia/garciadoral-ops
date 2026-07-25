#!/usr/bin/env python3
"""Lectura del registro canónico de la agenda.

El almacenamiento del registro es una decisión abierta
(`specs/plan-semanal.md` §12.1), y la forma de la integración no cambia con
ella: el generador del domingo lee la fuente, compone por destinatario y envía.
Este módulo aísla justamente esa pieza, de modo que fijar el almacenamiento más
adelante no toque nada más.

Se admiten dos orígenes, por orden de precedencia:

1. `AGENDA_URL` — un documento JSON accesible por HTTPS, con `AGENDA_TOKEN`
   opcional como credencial de lectura (cabecera `Authorization: Bearer`).
2. `AGENDA_PATH` — un fichero local, por defecto `datos/agenda.json`.

Si no hay ninguno disponible se lanza `FuenteNoDisponible` y **no se envía
nada**: un mensaje incorrecto es peor que un mensaje ausente, sobre todo si el
error consistiera en incluir algo que debía excluirse (§10).
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .modelo import Agenda, cargar_agenda, cargar_catalogos

RAIZ = Path(__file__).resolve().parents[2]
CATALOGOS_POR_DEFECTO = RAIZ / "datos" / "catalogos.json"
AGENDA_POR_DEFECTO = RAIZ / "datos" / "agenda.json"

TIEMPO_MAXIMO = 30


class FuenteNoDisponible(RuntimeError):
    """No se ha podido leer el registro canónico en el momento de generar."""


def _leer_url(url: str, token: str | None) -> dict[str, Any]:
    cabeceras = {"User-Agent": "garciadoral-ops/1.0", "Accept": "application/json"}
    if token:
        cabeceras["Authorization"] = f"Bearer {token}"
    peticion = urllib.request.Request(url, headers=cabeceras)
    try:
        with urllib.request.urlopen(peticion, timeout=TIEMPO_MAXIMO) as respuesta:
            if respuesta.status != 200:
                raise FuenteNoDisponible(f"la fuente respondió {respuesta.status}")
            return json.loads(respuesta.read().decode("utf-8"))
    except FuenteNoDisponible:
        raise
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise FuenteNoDisponible(f"no se pudo leer {url}: {exc}") from exc


def _leer_fichero(ruta: Path) -> dict[str, Any]:
    if not ruta.exists():
        raise FuenteNoDisponible(f"no existe el registro canónico en {ruta}")
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise FuenteNoDisponible(f"{ruta} no contiene JSON válido: {exc}") from exc


def leer_agenda(
    *,
    ruta: str | Path | None = None,
    url: str | None = None,
    token: str | None = None,
    catalogos: str | Path | None = None,
) -> Agenda:
    """Devuelve la agenda ya validada, o lanza `FuenteNoDisponible`."""
    url = url or os.environ.get("AGENDA_URL", "").strip() or None
    token = token or os.environ.get("AGENDA_TOKEN", "").strip() or None
    ruta = ruta or os.environ.get("AGENDA_PATH", "").strip() or AGENDA_POR_DEFECTO
    catalogos = (
        catalogos or os.environ.get("CATALOGOS_PATH", "").strip() or CATALOGOS_POR_DEFECTO
    )

    datos = _leer_url(url, token) if url else _leer_fichero(Path(ruta))

    ruta_catalogos = Path(catalogos)
    if not ruta_catalogos.exists():
        raise FuenteNoDisponible(f"no existe el catálogo en {ruta_catalogos}")

    try:
        return cargar_agenda(datos, cargar_catalogos(ruta_catalogos))
    except ValueError as exc:
        raise FuenteNoDisponible(f"el registro canónico no es consistente: {exc}") from exc
