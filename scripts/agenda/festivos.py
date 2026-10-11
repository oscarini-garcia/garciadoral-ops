#!/usr/bin/env python3
"""Los festivos en el plan de los domingos: los días oficiales y qué recurrentes dejan sin día.

Espejo de `api/src/festivos.js` y de `pwa/publico/js/festivos.js` en la mitad
que hace falta aquí (specs/propuesta-festivos.html, A1 · C1 · E1). Los
oficiales no se calculan en este lado: el Worker los compone de la tabla por
año —o de la regla, donde la tabla no llega— y llegan en el registro como
`festivos`. Los que se apuntan a mano son eventos con `plugin_id = 'festivo'`,
y a quién afectan son sus protagonistas; ninguno es toda la casa.

Una recurrente no tiene día en festivo salvo que diga `extra.en_festivos =
'si'` o que ese día se dijera «Sí hay»; y un festivo de alguien solo anula lo
que es de esa persona.
"""

from __future__ import annotations

from datetime import date, datetime, time

from .modelo import Agenda, Evento


def es_festivo_manual(evento: Evento) -> bool:
    return evento.plugin_id == "festivo"


def festivos_del_dia(agenda: Agenda, dia: date) -> list[tuple[str, tuple[str, ...]]]:
    """Los festivos de un día: nombre y a quién afectan (vacío, toda la casa)."""
    salida: list[tuple[str, tuple[str, ...]]] = []
    if dia in agenda.festivos:
        salida.append((agenda.festivos[dia], ()))
    for evento in agenda.eventos_activos():
        if es_festivo_manual(evento) and evento.inicio.date() == dia:
            salida.append((evento.titulo, evento.protagonistas))
    return salida


def festivo_que_anula(agenda: Agenda, evento: Evento, dia: date) -> str | None:
    """El nombre del festivo que deja a una recurrente sin ese día, o `None`."""
    if evento.plugin_id != "extraescolar":
        return None
    if (evento.extra or {}).get("en_festivos") == "si":
        return None
    suelto = agenda.dia_de_evento(evento.id, dia)
    if suelto is not None and suelto.hay_en_festivo:
        return None
    suyos = set(evento.protagonistas)
    for nombre, afecta in festivos_del_dia(agenda, dia):
        if not afecta or suyos.intersection(afecta):
            return nombre
    return None


def eventos_de_festivos(agenda: Agenda) -> list[Evento]:
    """Los oficiales como eventos de un día, con el identificador del aparato."""
    tipo = "festivo" if "festivo" in agenda.tipos_evento else next(iter(agenda.tipos_evento), "otro")
    return [
        Evento(
            id=f"derivado:festivo:{dia.isoformat()}",
            titulo=nombre,
            tipo_id=tipo,
            inicio=datetime.combine(dia, time.min),
            jornada_completa=True,
            origen="derivado",
        )
        for dia, nombre in sorted(agenda.festivos.items())
    ]
