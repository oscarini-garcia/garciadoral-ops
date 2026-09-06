#!/usr/bin/env python3
"""Los plugins de la agenda: de cuál es cada evento y hasta qué círculo llega.

Espejo de `api/src/plugins.js` y de `pwa/publico/js/plugins.js`. Al plan de los
domingos le hace falta la mitad que decide quién recibe qué: cada plugin está
abierto hasta un círculo —casa, familia extendida o amigos— y lo que sale de él
no se le cuenta a quien queda fuera. Los ajustes viven en `configuracion` bajo
`plugins.<id>` y llegan en el registro como `plugins`.

Está en `specs/propuesta-plugins-agenda.html` (A1 y D2).
"""

from __future__ import annotations

from typing import Any

IDS_PLUGIN = ("lio", "viajes", "cumples", "puntuales", "extraescolares", "finde")

#: Lo mismo que en el Worker: lo derivado de la ficha y lo puntual llegan a
#: todo el mundo; lo de casa —el perro, las actividades, las escapadas— se
#: queda en casa mientras nadie lo abra.
CIRCULO_POR_DEFECTO = {
    "lio": "familia",
    "viajes": "amigos",
    "cumples": "amigos",
    "puntuales": "amigos",
    "extraescolares": "familia",
    "finde": "familia",
}

ANCHURA = {"familia": 0, "extendida": 1, "amigos": 2}


def circulo_admite(circulo_plugin: str | None, circulo_persona: str | None) -> bool:
    """¿Recibe una persona de `circulo_persona` un plugin abierto hasta
    `circulo_plugin`? Quien no tiene círculo escrito cae en `extendida`."""
    tope = ANCHURA.get(circulo_plugin or "", ANCHURA["amigos"])
    suyo = ANCHURA.get(circulo_persona or "extendida", ANCHURA["extendida"])
    return suyo <= tope


def circulo_de(plugins: dict[str, Any] | None, plugin_id: str) -> str:
    """El círculo efectivo de un plugin: lo ajustado, y si no, lo de origen."""
    escrito = (plugins or {}).get(plugin_id, {}).get("circulo") if plugins else None
    if isinstance(escrito, str) and escrito in ANCHURA:
        return escrito
    return CIRCULO_POR_DEFECTO.get(plugin_id, "amigos")


def plugin_de_evento(evento: Any) -> str:
    """De qué plugin es un evento, derivados incluidos."""
    plugin_id = getattr(evento, "plugin_id", None)
    if plugin_id == "extraescolar":
        return "extraescolares"
    if plugin_id == "finde":
        return "finde"
    if getattr(evento, "origen", None) == "importado":
        return "viajes"
    identificador = str(getattr(evento, "id", "") or "")
    if identificador.startswith(("derivado:cumpleanos:", "derivado:santo:")):
        return "cumples"
    if identificador.startswith("derivado:fuera:"):
        return "viajes"
    if identificador.startswith("derivado:ausencia:"):
        return "lio"
    return "puntuales"


def se_recibe(plugins: dict[str, Any] | None, evento: Any, circulo_persona: str | None) -> bool:
    """¿Le llega este evento a alguien de ese círculo? Es la misma pregunta que
    el Worker contesta al componer la instantánea, y aquí se contesta al
    componer el plan: quien redacta no decide qué se puede contar."""
    return circulo_admite(circulo_de(plugins, plugin_de_evento(evento)), circulo_persona)


def santos_activos(plugins: dict[str, Any] | None) -> bool:
    """Los santos salen salvo que el plugin de cumpleaños los haya apagado."""
    valor = (plugins or {}).get("cumples", {}).get("santos") if plugins else None
    return valor is not False
