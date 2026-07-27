#!/usr/bin/env python3
"""Composición del texto del plan semanal para WhatsApp.

Transcribe el apartado 6 de `specs/plan-semanal.md`, cuyo formato se validó
enviando el ejemplo por CallMeBot a un cliente real:

    *Plan de la semana*
    28 jul – 3 ago

    L 28  🏇 Entreno de hípica · 18:00
    M 29  —
    X 30  —
    J 31  🩺 Dentista (Ana) · 10:00
    V  1  —
    S  2  🎂 Cumpleaños de la abuela
    D  3  🍽️ Comida con los abuelos · 14:00

Reglas que el módulo hace cumplir:

- Marco fijo de siete días. Los días vacíos se marcan con `—`, nunca se omiten.
- Una línea por evento, con el título recortado para que no se parta en la
  pantalla del móvil. El recorte no es cosmético: una línea partida cae al
  margen izquierdo sin sangría y rompe la lectura de la semana.
- Techo de tres eventos por día; a partir del cuarto, «y N más».
- Texto plano con marcado ligero. Ni tablas, ni bloques monoespaciados, ni
  enlaces: el mensaje es de lectura, no de navegación.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time

from .lio import EMOJI_LIO, TurnoLio
from .modelo import Agenda
from .semana import Aparicion, Semana

INICIALES_DIA = ("L", "M", "X", "J", "V", "S", "D")
MESES = (
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
)

CABECERA = "*Plan de la semana*"
DIA_VACIO = "—"
SIN_EVENTOS = "Sin nada en el calendario esta semana."
MARCA_CONTINUACION = "(cont.)"

TECHO_EVENTOS_DIA = 3
ANCHO_LINEA = 42          # columnas aproximadas antes de que el cliente parta la línea
RECORTE = "…"


# --------------------------------------------------------------------------- #
# Medida del texto
# --------------------------------------------------------------------------- #


def _ancho(texto: str) -> int:
    """Columnas aproximadas que ocupa el texto.

    Los emojis ocupan el doble que una letra en prácticamente cualquier cliente,
    y los selectores de variación y los uniones de ancho cero no ocupan nada.
    Una medida exacta exigiría la tabla de anchos de Unicode; esta aproximación
    basta para decidir un recorte.
    """
    columnas = 0
    for caracter in texto:
        punto = ord(caracter)
        if punto in (0xFE0E, 0xFE0F, 0x200D):
            continue
        columnas += 2 if punto >= 0x2190 else 1
    return columnas


def _recortar(texto: str, columnas: int) -> str:
    if columnas <= 0:
        return ""
    if _ancho(texto) <= columnas:
        return texto
    recortado = ""
    for caracter in texto:
        if _ancho(recortado + caracter) > columnas - 1:
            break
        recortado += caracter
    return recortado.rstrip() + RECORTE


# --------------------------------------------------------------------------- #
# Piezas del mensaje
# --------------------------------------------------------------------------- #


def formatear_dia(dia: date) -> str:
    """`L 28`, con el número alineado a la derecha para que las filas cuadren."""
    return f"{INICIALES_DIA[dia.weekday()]} {dia.day:>2}"


def formatear_rango(semana: Semana) -> str:
    """`28 jul – 3 ago`, u `1 – 7 sep` cuando la semana no cambia de mes."""
    lunes, domingo = semana.lunes, semana.domingo
    if lunes.month == domingo.month:
        return f"{lunes.day} – {domingo.day} {MESES[domingo.month - 1]}"
    return (
        f"{lunes.day} {MESES[lunes.month - 1]} – "
        f"{domingo.day} {MESES[domingo.month - 1]}"
    )


def _hora(momento: time) -> str:
    return f"{momento.hour:02d}:{momento.minute:02d}"


def _acompanantes(agenda: Agenda, aparicion: Aparicion) -> str:
    """Personas implicadas, solo cuando aportan.

    Si el título ya nombra al protagonista —«Cumpleaños de la abuela»— añadirlo
    entre paréntesis sería ruido.
    """
    nombres = []
    for persona_id in aparicion.evento.protagonistas:
        persona = agenda.persona(persona_id)
        if persona is None:
            continue
        if persona.nombre.lower() in aparicion.evento.titulo.lower():
            continue
        nombres.append(persona.nombre)
    if not nombres:
        return ""
    if len(nombres) > 2:
        nombres = nombres[:2] + ["…"]
    return f" ({', '.join(nombres)})"


def formatear_lio(agenda: Agenda, turnos: list[TurnoLio]) -> str:
    """`🐾 ☀️ Óscar · 🌙 Marta`, o cadena vacía si ese día no lo saca nadie.

    Va en su propio renglón, detrás de los eventos del día y fuera del techo de
    tres: un turno de perro no es un evento y no puede desplazar a uno. Se
    escribe solo el nombre de pila, que es el que se usa en casa, y el turno que
    no tiene dueño se calla en lugar de escribir un guion.
    """
    partes = []
    for turno in turnos:
        persona = agenda.persona(turno.responsable_id)
        if persona is None:
            continue
        partes.append(f"{turno.emoji} {persona.nombre}")
    return f"{EMOJI_LIO} {' · '.join(partes)}" if partes else ""


def formatear_evento(agenda: Agenda, aparicion: Aparicion, sangria: int) -> str:
    """Una línea: emoji, título recortado y hora si la tiene."""
    emoji = agenda.emoji_de(aparicion.evento)
    hora = aparicion.hora
    sufijo = f" · {_hora(hora)}" if hora is not None else ""
    if aparicion.continuacion:
        sufijo = f" {MARCA_CONTINUACION}"

    titulo = aparicion.evento.titulo + _acompanantes(agenda, aparicion)
    disponible = ANCHO_LINEA - sangria - _ancho(emoji) - 1 - _ancho(sufijo)
    return f"{emoji} {_recortar(titulo, disponible)}{sufijo}"


# --------------------------------------------------------------------------- #
# Mensaje completo
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Plan:
    """Texto compuesto para un observador concreto.

    La clase existe para que el texto no viaje suelto: el generador comprueba
    que el destinatario al que se envía es el mismo para el que se compuso. Un
    mensaje correcto para Ana, remitido por error a una hija, es una filtración
    consumada e irreversible (specs/plan-semanal.md §5 y §11).
    """

    destinatario: str
    observador_id: str | None
    texto: str
    eventos: int


def componer(
    agenda: Agenda,
    semana: Semana,
    reparto: dict[date, list[Aparicion]],
    *,
    destinatario: str,
    observador_id: str | None,
    lio: dict[date, list[TurnoLio]] | None = None,
) -> Plan:
    """Construye el mensaje a partir de un reparto **ya filtrado**.

    El filtrado se produce en la generación, nunca aquí: este módulo se limita a
    dar forma a lo que recibe. Si llegara un evento que el destinatario no debe
    ver, lo escribiría sin oponer resistencia. Lo mismo vale para `lio`, que solo
    llega cuando el destinatario vive en casa.
    """
    lineas = [CABECERA, formatear_rango(semana), ""]
    total = sum(len(reparto.get(dia, [])) for dia in semana.dias())
    turnos_por_dia = lio or {}

    # Una semana sin eventos pero con turnos de perro sí tiene algo que contar.
    if total == 0 and not any(turnos_por_dia.values()):
        lineas.append(SIN_EVENTOS)
        return Plan(destinatario, observador_id, "\n".join(lineas), 0)

    for dia in semana.dias():
        prefijo = formatear_dia(dia)
        sangria = len(prefijo) + 2
        apariciones = reparto.get(dia, [])
        renglon_de_lio = formatear_lio(agenda, turnos_por_dia.get(dia, []))

        if not apariciones:
            # El día sin eventos pero con turno no está vacío: se escribe el
            # turno en su sitio en lugar del guion.
            lineas.append(f"{prefijo}  {renglon_de_lio or DIA_VACIO}")
            continue

        visibles = apariciones[:TECHO_EVENTOS_DIA]
        for indice, aparicion in enumerate(visibles):
            cuerpo = formatear_evento(agenda, aparicion, sangria)
            cabeza = prefijo if indice == 0 else " " * len(prefijo)
            lineas.append(f"{cabeza}  {cuerpo}")

        # El recuento se calcula solo sobre lo visible: nunca debe delatar la
        # existencia de un evento reservado que se excluyó (§6).
        restantes = len(apariciones) - len(visibles)
        if restantes > 0:
            lineas.append(f"{' ' * len(prefijo)}  y {restantes} más")

        # Lío va el último y fuera del techo: no compite por las tres líneas.
        if renglon_de_lio:
            lineas.append(f"{' ' * len(prefijo)}  {renglon_de_lio}")

    return Plan(destinatario, observador_id, "\n".join(lineas), total)
