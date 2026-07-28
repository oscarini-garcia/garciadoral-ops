#!/usr/bin/env python3
"""Los turnos de paseo de Lío, derivados del cuadro semanal.

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
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

TURNOS = (
    ("manana", "Mañana", "☀️", 6, 10),
    ("noche", "Noche", "🌙", 20, 24),
)

IDS_TURNO = tuple(turno[0] for turno in TURNOS)
EMOJI_TURNO = {turno[0]: turno[2] for turno in TURNOS}
HORA_TURNO = {turno[0]: turno[3] for turno in TURNOS}
EMOJI_LIO = "🐾"

#: La casa está en Madrid y las ventanas de los turnos son horas locales. Hace
#: falta para saber qué cuadro gobernaba cuando se abrió la de un turno.
LOCAL = ZoneInfo("Europe/Madrid")


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


def inicio_de_ventana(fecha: date, turno: str) -> datetime:
    """Cuándo abre la ventana de un turno, en hora local. Es el instante que
    decide qué cuadro lo gobierna."""
    return datetime.combine(fecha, time(HORA_TURNO.get(turno, 0)), tzinfo=LOCAL)


def versiones_normalizadas(bruto: object) -> list[tuple[str | None, dict[str, list[str | None]]]]:
    """El cuadro no es uno: es la lista de los que ha habido, con el instante
    desde el que valió cada uno.

    **Porque cambiar el reparto no puede reescribir el pasado.** Un turno sin
    fila de `paseo` se deriva del cuadro, y con un solo cuadro se derivaba del de
    ahora. El formato viejo —un cuadro suelto— se lee como una versión sin
    `desde`, que vale desde siempre, y por eso esto no necesita migración.
    """
    if isinstance(bruto, dict):
        return [(None, cuadro_normalizado(bruto))]
    if not isinstance(bruto, list):
        return []
    versiones = [
        (
            version.get("desde") if isinstance(version.get("desde"), str) and version.get("desde") else None,
            cuadro_normalizado(version.get("cuadro")),
        )
        for version in bruto
        if isinstance(version, dict)
    ]
    return sorted(versiones, key=lambda version: version[0] or "")


def cuadro_en(versiones, cuando: datetime) -> dict[str, list[str | None]]:
    """Qué cuadro gobernaba en un instante: el último que empezó antes.

    Antes del primero vale el primero, que es lo más antiguo que se sabe del
    reparto.
    """
    if not versiones:
        return cuadro_normalizado(None)
    momento = cuando.astimezone(tz=None).isoformat() if cuando.tzinfo is None else cuando.isoformat()
    elegido = versiones[0][1]
    for desde, cuadro in versiones:
        if desde is None or _antes(desde, cuando):
            elegido = cuadro
        else:
            break
    return elegido


def _antes(desde: str, cuando: datetime) -> bool:
    """¿Empezó esta versión antes del instante dado? Compara momentos y no
    textos: el `desde` lo escribe el Worker en UTC y la ventana está en hora de
    Madrid."""
    try:
        inicio = datetime.fromisoformat(desde.replace("Z", "+00:00"))
    except ValueError:
        return True
    if inicio.tzinfo is None:
        inicio = inicio.replace(tzinfo=LOCAL)
    return inicio <= cuando


def turno_de(agenda, fecha: date, turno: str) -> TurnoLio:
    paseo = agenda.paseos.get(id_paseo(fecha, turno))
    if paseo is not None:
        return TurnoLio(fecha, turno, paseo.asignado_id, paseo.hecho_por_id)
    # El cuadro que gobierna es el de cuando se abrió la ventana, no el de ahora.
    cuadro = cuadro_en(agenda.cuadro_lio, inicio_de_ventana(fecha, turno))
    return TurnoLio(fecha, turno, cuadro[turno][fecha.weekday()], None)


def turnos_de(agenda, fecha: date) -> list[TurnoLio]:
    return [turno_de(agenda, fecha, turno) for turno in IDS_TURNO]


def hay_lio(agenda) -> bool:
    """¿Está puesto el cuadro? Mientras no lo esté, Lío no sale por ninguna
    parte: ni en la aplicación ni en el mensaje de los domingos."""
    for _desde, cuadro in agenda.cuadro_lio:
        if any(any(fila) for fila in cuadro.values()):
            return True
    return bool(agenda.paseos)
