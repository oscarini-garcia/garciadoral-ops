#!/usr/bin/env python3
"""Selección de los eventos de la semana entrante.

Resuelve el apartado 4 de `specs/plan-semanal.md` —de dónde procede el
contenido— y la expansión de recurrencias descrita en `specs/modelo-datos.md`
§2.4 y §7.4.

Se incluyen los eventos de cualquier origen —manual, derivado o importado— sin
distinción, porque para el lector la procedencia es irrelevante.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Iterator

from .modelo import Agenda, Evento, ParticipanteEvento

DIAS_SEMANA = 7


@dataclass(frozen=True)
class Semana:
    """Marco fijo de siete días, de lunes a domingo."""

    lunes: date

    @property
    def domingo(self) -> date:
        return self.lunes + timedelta(days=6)

    def dias(self) -> list[date]:
        return [self.lunes + timedelta(days=i) for i in range(DIAS_SEMANA)]

    def __contains__(self, dia: object) -> bool:
        return isinstance(dia, date) and self.lunes <= dia <= self.domingo


def semana_entrante(referencia: date) -> Semana:
    """La semana que viene, de lunes a domingo (specs/plan-semanal.md §3).

    El domingo por la tarde el interés está por completo en lo que viene, de modo
    que la semana descrita nunca es la que termina esa misma noche. Desde
    cualquier otro día se devuelve igualmente el lunes siguiente.
    """
    dias_hasta_el_lunes = (7 - referencia.weekday()) % 7 or 7
    return Semana(referencia + timedelta(days=dias_hasta_el_lunes))


@dataclass(frozen=True)
class Instancia:
    """Una aparición concreta de un evento, ya resuelta su recurrencia."""

    evento: Evento
    inicio: datetime
    fin: datetime

    @property
    def dias(self) -> list[date]:
        primero, ultimo = self.inicio.date(), self.fin.date()
        return [
            primero + timedelta(days=i) for i in range((ultimo - primero).days + 1)
        ]

    @property
    def varios_dias(self) -> bool:
        return self.inicio.date() != self.fin.date()


@dataclass(frozen=True)
class Aparicion:
    """La instancia tal como se muestra en un día concreto de la semana."""

    instancia: Instancia
    dia: date

    @property
    def evento(self) -> Evento:
        return self.instancia.evento

    @property
    def continuacion(self) -> bool:
        """Jornada posterior a la primera de un evento de varios días.

        La vista de semana las señala como continuación en lugar de repetir el
        evento como si fuera nuevo (specs/ux.md §10.2).
        """
        return self.instancia.inicio.date() < self.dia

    @property
    def hora(self) -> time | None:
        if self.evento.jornada_completa or self.continuacion:
            return None
        return self.instancia.inicio.time()

    @property
    def orden(self) -> tuple[int, int, int, str]:
        hora = self.hora
        if hora is None:
            return (0, 0, 0, self.evento.titulo)
        return (1, hora.hour, hora.minute, self.evento.titulo)


# --------------------------------------------------------------------------- #
# Eventos derivados
# --------------------------------------------------------------------------- #


def eventos_derivados(agenda: Agenda) -> list[Evento]:
    """Cumpleaños generados a partir de las fechas de nacimiento (§7.4).

    Se generan para todas las personas del registro, tengan cuenta o no. No son
    editables: se corrigen en la ficha de la persona, de modo que el dato maestro
    y su reflejo en la agenda no puedan divergir.
    """
    tipo = "cumpleanos" if "cumpleanos" in agenda.tipos_evento else None
    if tipo is None:
        return []

    derivados: list[Evento] = []
    for persona in agenda.personas.values():
        if not persona.activa or persona.fecha_nacimiento is None:
            continue
        derivados.append(
            Evento(
                id=f"derivado:cumpleanos:{persona.id}",
                titulo=f"Cumpleaños de {persona.nombre}",
                tipo_id=tipo,
                inicio=datetime.combine(persona.fecha_nacimiento, time.min),
                jornada_completa=True,
                repeticion="anual",
                origen="derivado",
                persona_origen_id=persona.id,
                participantes=(ParticipanteEvento(persona.id, "protagonista"),),
            )
        )
    return derivados


# --------------------------------------------------------------------------- #
# Expansión de recurrencias
# --------------------------------------------------------------------------- #


def _ultimo_dia(anio: int, mes: int) -> int:
    return calendar.monthrange(anio, mes)[1]


def _mismo_dia_otro_anio(momento: datetime, anio: int) -> datetime:
    """29 de febrero en año no bisiesto: se traslada al 1 de marzo.

    Es la misma regla que aplica el despachador a las repeticiones anuales
    (`specs/despachador.md` §8), y conviene que no diverjan.
    """
    try:
        return momento.replace(year=anio)
    except ValueError:
        return momento.replace(year=anio, month=3, day=1)


def _meses(desde: date, hasta: date) -> Iterator[tuple[int, int]]:
    anio, mes = desde.year, desde.month
    while (anio, mes) <= (hasta.year, hasta.month):
        yield anio, mes
        anio, mes = (anio + 1, 1) if mes == 12 else (anio, mes + 1)


def ocurrencias(evento: Evento, desde: date, hasta: date) -> list[Instancia]:
    """Instancias del evento que se solapan con el intervalo [desde, hasta]."""
    duracion = (evento.fin - evento.inicio) if evento.fin else timedelta(0)
    if duracion < timedelta(0):
        duracion = timedelta(0)

    # Un evento que arrancó antes de la ventana puede seguir en curso dentro
    # de ella, así que el arranque más temprano admisible se retrasa su duración.
    limite_inf = datetime.combine(desde, time.min) - duracion
    limite_sup = datetime.combine(hasta, time.max)

    def admisible(arranque: datetime) -> bool:
        if arranque < evento.inicio or arranque < limite_inf or arranque > limite_sup:
            return False
        if evento.repeticion_hasta and arranque.date() > evento.repeticion_hasta:
            return False
        return True

    arranques: list[datetime] = []

    if evento.repeticion == "ninguna":
        if limite_inf <= evento.inicio <= limite_sup:
            arranques.append(evento.inicio)

    elif evento.repeticion == "semanal":
        salto = (limite_inf.date() - evento.inicio.date()).days
        semanas = max(0, -(-salto // 7))  # techo de la división
        actual = evento.inicio + timedelta(weeks=semanas)
        while actual <= limite_sup:
            if admisible(actual):
                arranques.append(actual)
            actual += timedelta(weeks=1)

    elif evento.repeticion == "mensual":
        for anio, mes in _meses(limite_inf.date(), limite_sup.date()):
            dia = min(evento.inicio.day, _ultimo_dia(anio, mes))
            candidato = evento.inicio.replace(year=anio, month=mes, day=dia)
            if admisible(candidato):
                arranques.append(candidato)

    elif evento.repeticion == "anual":
        for anio in {limite_inf.year, limite_sup.year}:
            candidato = _mismo_dia_otro_anio(evento.inicio, anio)
            if admisible(candidato):
                arranques.append(candidato)

    return [
        Instancia(evento=evento, inicio=arranque, fin=arranque + duracion)
        for arranque in sorted(set(arranques))
    ]


def instancias_de_la_semana(
    agenda: Agenda, semana: Semana, *, incluir_derivados: bool = True
) -> list[Instancia]:
    """Todas las instancias que aparecen en la semana, sin filtro de visibilidad."""
    fuentes = list(agenda.eventos_activos())
    if incluir_derivados:
        fuentes += eventos_derivados(agenda)

    resultado: list[Instancia] = []
    for evento in fuentes:
        resultado.extend(ocurrencias(evento, semana.lunes, semana.domingo))
    return resultado


def repartir_por_dia(
    instancias: list[Instancia], semana: Semana
) -> dict[date, list[Aparicion]]:
    """Coloca cada instancia en todos los días de la semana que ocupa.

    Un viaje de jueves a domingo aparece en las cuatro filas; las posteriores a
    la primera quedan marcadas como continuación.
    """
    reparto: dict[date, list[Aparicion]] = {dia: [] for dia in semana.dias()}
    for instancia in instancias:
        for dia in instancia.dias:
            if dia in reparto:
                reparto[dia].append(Aparicion(instancia, dia))
    for apariciones in reparto.values():
        apariciones.sort(key=lambda a: a.orden)
    return reparto
