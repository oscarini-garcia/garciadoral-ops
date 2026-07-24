"""Agenda Familiar — implementación del modelo, la visibilidad y el plan semanal.

Traduce a código los documentos de `specs/`:

- `modelo.py`      · entidades y reglas de integridad (specs/modelo-datos.md §2 y §4)
- `visibilidad.py` · función de visibilidad (specs/modelo-datos.md §6)
- `semana.py`      · selección de la semana entrante (specs/plan-semanal.md §3 y §4)
- `mensaje.py`     · composición del texto de WhatsApp (specs/plan-semanal.md §6)
- `fuente.py`      · lectura del registro canónico de la agenda

Solo biblioteca estándar, en coherencia con specs/despachador.md §8.
"""

from .modelo import Agenda, cargar_agenda, cargar_catalogos  # noqa: F401
from .visibilidad import (  # noqa: F401
    destinatarios_de_idea,
    destinatarios_de_regalo,
    visible,
    visible_publicamente,
)

__all__ = [
    "Agenda",
    "cargar_agenda",
    "cargar_catalogos",
    "destinatarios_de_idea",
    "destinatarios_de_regalo",
    "visible",
    "visible_publicamente",
]
