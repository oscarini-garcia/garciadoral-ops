#!/usr/bin/env python3
"""Los turnos de paseo de Lio, derivados del cuadro semanal.

Espejo de `pwa/publico/js/lio.js` y de `api/src/lio.js`. Aquí solo hace falta la
mitad de lo que hay allí: el plan semanal cuenta lo que viene, de modo que no
tiene que saber nada de propuestas ni de marcas —lo que viene no está hecho
todavía— y le basta con resolver de quién es cada turno.

La regla es la misma que en los otros dos sitios: **el cuadro dice quién saca al
perro, y una fila de `paseo` dice quién lo saca ese día concreto**. Existe fila
cuando alguien marcó el turno o cuando se acordó un cambio, y entonces manda
sobre el cuadro. Así cambiar el reparto cambia el futuro sin reescribir el
pasado.

Las entidades están en `specs/modelo-datos.md` §2.6 y la pantalla, en
`specs/ux.md` §10.3.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

TURNOS = (
    ("manana", "Mañana", "☀️", 6, 10),
    ("noche", "Noche", "🌙", 20, 24),
)

IDS_TURNO = tuple(turno[0] for turno in TURNOS)
EMOJI_TURNO = {turno[0]: turno[2] for turno in TURNOS}
EMOJI_LIO = "🐾"


@dataclass(frozen=True)
class TurnoLio:
    """De quién es un turno concreto, y quién lo sacó si consta."""

    fecha: date
    turno: str
    asignado_id: str | None = None
    hecho_por_id: str | None = None

    @property
    def emoji(self) -> str:
        return EMOJI_TURNO.get(self.turno, EMOJI_LIO)

    @property
    def responsable_id(self) -> str | None:
        """Quien cuenta: el que lo sacó si consta, y si no, el que lo tiene."""
        return self.hecho_por_id or self.asignado_id


def id_paseo(fecha: date, turno: str) -> str:
    """`lio:2026-07-27:manana`. Se compone, no se inventa: es el mismo que
    escribe el dispositivo al marcar sin haber visto la fila."""
    return f"lio:{fecha.isoformat()}:{turno}"


def cuadro_normalizado(bruto: object) -> dict[str, list[str | None]]:
    """Catorce casillas siempre, con el lunes en 0.

    Se sanea al leer porque la fila de `configuracion` es texto libre para la
    base: un cuadro a medias no puede tumbar el plan de los domingos.
    """
    cuadro: dict[str, list[str | None]] = {turno: [None] * 7 for turno in IDS_TURNO}
    if not isinstance(bruto, dict):
        return cuadro
    for turno in IDS_TURNO:
        fila = bruto.get(turno)
        if not isinstance(fila, list):
            continue
        for dia in range(7):
            valor = fila[dia] if dia < len(fila) else None
            cuadro[turno][dia] = valor if isinstance(valor, str) and valor else None
    return cuadro


def turno_de(agenda, fecha: date, turno: str) -> TurnoLio:
    paseo = agenda.paseos.get(id_paseo(fecha, turno))
    if paseo is not None:
        return TurnoLio(fecha, turno, paseo.asignado_id, paseo.hecho_por_id)
    return TurnoLio(fecha, turno, agenda.cuadro_lio[turno][fecha.weekday()], None)


def turnos_de(agenda, fecha: date) -> list[TurnoLio]:
    return [turno_de(agenda, fecha, turno) for turno in IDS_TURNO]


def hay_lio(agenda) -> bool:
    """¿Está puesto el cuadro? Mientras no lo esté, Lio no sale por ninguna
    parte: ni en la aplicación ni en el mensaje de los domingos."""
    if any(any(fila) for fila in agenda.cuadro_lio.values()):
        return True
    return bool(agenda.paseos)
