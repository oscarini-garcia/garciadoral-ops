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
from .plugins import santos_activos

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
    """Lo que sale de las fichas y no de la tabla de eventos (§7.4).

    Cumpleaños y santos se generan de la fecha y el santo de cada persona del
    registro, tenga cuenta o no; no son editables: se corrigen en la ficha, de
    modo que el dato maestro y su reflejo en la agenda no puedan divergir. Los
    santos se apagan desde el plugin de cumpleaños. Y una ausencia de alguien
    de casa es una banda —«Marta fuera»— de sus días, como la dibuja la
    aplicación (specs/propuesta-plugins-hojas.html, A3 y E1).
    """
    derivados: list[Evento] = []

    if "cumpleanos" in agenda.tipos_evento:
        for persona in agenda.personas.values():
            if not persona.activa or persona.fecha_nacimiento is None:
                continue
            derivados.append(
                Evento(
                    id=f"derivado:cumpleanos:{persona.id}",
                    titulo=f"Cumpleaños de {persona.nombre}",
                    tipo_id="cumpleanos",
                    inicio=datetime.combine(persona.fecha_nacimiento, time.min),
                    jornada_completa=True,
                    repeticion="anual",
                    origen="derivado",
                    persona_origen_id=persona.id,
                    participantes=(ParticipanteEvento(persona.id, "protagonista"),),
                )
            )

    if "santo" in agenda.tipos_evento and santos_activos(agenda.plugins):
        for persona in agenda.personas.values():
            fecha = _fecha_de_santo(persona.santo)
            if not persona.activa or fecha is None:
                continue
            derivados.append(
                Evento(
                    id=f"derivado:santo:{persona.id}",
                    titulo=f"Santo de {persona.nombre}",
                    tipo_id="santo",
                    inicio=datetime.combine(fecha, time.min),
                    jornada_completa=True,
                    repeticion="anual",
                    origen="derivado",
                    persona_origen_id=persona.id,
                    participantes=(ParticipanteEvento(persona.id, "protagonista"),),
                )
            )

    tipo_banda = "viaje" if "viaje" in agenda.tipos_evento else next(iter(agenda.tipos_evento), None)
    if tipo_banda is not None:
        for ausencia in agenda.ausencias:
            persona = agenda.persona(ausencia.persona_id)
            if persona is None or not ausencia.activo:
                continue
            derivados.append(
                Evento(
                    id=f"derivado:ausencia:{ausencia.id}",
                    titulo=f"{persona.nombre} fuera",
                    tipo_id=tipo_banda,
                    inicio=datetime.combine(ausencia.desde, time.min),
                    fin=datetime.combine(ausencia.hasta, time.min),
                    jornada_completa=True,
                    emoji="🧳",
                    notas=ausencia.motivo,
                    origen="derivado",
                    persona_origen_id=persona.id,
                    participantes=(ParticipanteEvento(persona.id, "protagonista"),),
                )
            )

    return derivados


def _fecha_de_santo(santo: str | None) -> date | None:
    """«MM-DD» a una fecha del año 1900, que es el que usa la aplicación para
    lo que se repite cada año sin haber empezado en ninguno."""
    if not santo or len(santo) != 5 or santo[2] != "-":
        return None
    try:
        return date(1900, int(santo[:2]), int(santo[3:]))
    except ValueError:
        return None


def dias_semanales_de(evento: Evento) -> list[int] | None:
    """Los días de la semana de una actividad —lunes en 0—, si lleva varios.

    Una actividad de martes y jueves es una sola fila `semanal` con
    `extra.dias = [1, 3]`, y no dos filas: el plan y la aplicación la leen
    igual (`pwa/publico/js/semana.js`).
    """
    if evento.repeticion != "semanal":
        return None
    dias = evento.extra.get("dias") if isinstance(evento.extra, dict) else None
    if not isinstance(dias, list):
        return None
    limpios = sorted({int(d) for d in dias if isinstance(d, (int, float)) and 0 <= int(d) <= 6})
    return limpios or None


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
        # Por fecha frente al inicio, no por instante: una actividad cuyo
        # martes empieza antes que la hora escrita en el evento sigue
        # arrancando el mismo día.
        if arranque.date() < evento.inicio.date() or arranque < limite_inf or arranque > limite_sup:
            return False
        if evento.repeticion_hasta and arranque.date() > evento.repeticion_hasta:
            return False
        return True

    arranques: list[datetime] = []
    duraciones: dict[datetime, timedelta] = {}

    if evento.repeticion == "ninguna":
        if limite_inf <= evento.inicio <= limite_sup:
            arranques.append(evento.inicio)

    elif evento.repeticion == "semanal":
        # Una actividad puede ir varios días a la semana: cada uno arranca el
        # primer día de ese nombre desde el inicio y sigue de siete en siete.
        dias = dias_semanales_de(evento) or [evento.inicio.weekday()]
        for dia_semana in dias:
            primero = evento.inicio + timedelta(days=(dia_semana - evento.inicio.weekday()) % 7)
            # Cada día a su hora (B1): el horario del día si lo lleva, y la
            # duración con él.
            horario = horario_del_dia(evento, dia_semana)
            if horario is not None:
                primero = primero.replace(hour=horario[0].hour, minute=horario[0].minute)
            salto = (limite_inf.date() - primero.date()).days
            semanas = max(0, -(-salto // 7))  # techo de la división
            actual = primero + timedelta(weeks=semanas)
            while actual <= limite_sup:
                if admisible(actual):
                    arranques.append(actual)
                    if horario is not None:
                        duraciones[actual] = horario[1]
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
        Instancia(evento=evento, inicio=arranque, fin=arranque + duraciones.get(arranque, duracion))
        for arranque in sorted(set(arranques))
    ]


def horario_del_dia(evento: Evento, dia: int) -> tuple[time, timedelta] | None:
    """La hora de inicio y la duración de un día de la semana de una actividad
    con horario propio —`extra.horario[dia] = {desde, hasta}`—, o `None`."""
    horario = evento.extra.get("horario") if isinstance(evento.extra, dict) else None
    fila = (horario or {}).get(str(dia)) or (horario or {}).get(dia)
    if not isinstance(fila, dict):
        return None
    try:
        desde = time.fromisoformat(str(fila.get("desde", "")))
    except ValueError:
        return None
    try:
        hasta = time.fromisoformat(str(fila.get("hasta", "")))
    except ValueError:
        hasta = None
    minutos = 0
    if hasta is not None:
        minutos = max(0, (hasta.hour * 60 + hasta.minute) - (desde.hour * 60 + desde.minute))
    return desde, timedelta(minutes=minutos)


def instancias_de_la_semana(
    agenda: Agenda, semana: Semana, *, incluir_derivados: bool = True
) -> list[Instancia]:
    """Todas las instancias que aparecen en la semana, sin filtro de visibilidad."""
    fuentes = list(agenda.eventos_activos())
    if incluir_derivados:
        fuentes += eventos_derivados(agenda)

    resultado: list[Instancia] = []
    for evento in fuentes:
        for instancia in ocurrencias(evento, semana.lunes, semana.domingo):
            # El día en que se dijo «no hay hípica» no sale: es una fila de
            # `evento_dia` con `cancelado`, y manda sobre la regla semanal.
            dia = agenda.dia_de_evento(evento.id, instancia.inicio.date())
            if dia is not None and dia.cancelado:
                continue
            resultado.append(instancia)
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
