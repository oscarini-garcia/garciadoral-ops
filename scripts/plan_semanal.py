#!/usr/bin/env python3
"""Genera y envía el plan de la semana entrante, un mensaje por destinatario.

Implementa `specs/plan-semanal.md`. La forma es la del apartado 9:

1. **Lee** el registro canónico de la agenda desde su fuente.
2. **Selecciona** los eventos cuya fecha cae en la semana entrante.
3. Para **cada destinatario**, aplica la función de visibilidad con esa persona
   como observador y compone su texto.
4. **Envía** un mensaje individual por CallMeBot, reutilizando el mapa
   `RECIPIENTS_JSON` del despachador.

El plan no pasa por `queue.json`: no es un mensaje que un humano componga y
programe, sino un derivado que se recalcula por persona cada domingo a partir
del estado vivo de la agenda.

**La regla que la implementación debe blindar** es la correspondencia entre
observador y texto. Cada plan se compone y se entrega dentro de la misma
iteración, y `enviar_plan` rechaza cualquier texto cuyo destinatario no sea
aquel para el que se compuso. Un mensaje correcto para Ana, remitido por error a
una hija, es una filtración consumada e irreversible: ya se ha entregado.

Uso:

    python3 scripts/plan_semanal.py               # domingo por la tarde
    python3 scripts/plan_semanal.py --simulacro   # compone e imprime, no envía
    python3 scripts/plan_semanal.py --forzar      # ignora la ventana de envío
    python3 scripts/plan_semanal.py --fecha 2026-07-26 --simulacro
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

from agenda.fuente import FuenteNoDisponible, leer_agenda
from agenda.lio import TurnoLio, hay_lio, turnos_de
from agenda.mensaje import Plan, componer
from agenda.modelo import Agenda
from agenda.semana import (
    Aparicion,
    Instancia,
    Semana,
    instancias_de_la_semana,
    repartir_por_dia,
    semana_entrante,
)
from agenda.visibilidad import es_de_la_casa, visible, visible_publicamente
from callmebot import cargar_destinatarios, enviar

LOCAL = ZoneInfo("Europe/Madrid")
RAIZ = Path(__file__).resolve().parents[1]
ESTADO = Path(os.environ.get("ESTADO_PLAN_PATH", RAIZ / "estado" / "plan-semanal.json"))

# Ventana del domingo por la tarde. No se busca precisión al minuto: un mensaje
# que llega a las 18:00 o a las 18:40 cumple idéntica función. La amplitud cubre
# un sondeo perdido sin que el plan llegue el lunes, cuando ya sobra (§10).
INICIO_VENTANA = time(17, 0)
FIN_VENTANA = time(23, 0)
DIA_DE_ENVIO = 6  # domingo


class DestinatarioInvalido(RuntimeError):
    """El texto compuesto no corresponde al destinatario al que se iba a enviar."""


# --------------------------------------------------------------------------- #
# Ventana de envío
# --------------------------------------------------------------------------- #


def en_ventana(momento: datetime) -> bool:
    """¿Estamos en la tarde del domingo, dentro de la ventana de gracia?"""
    local = momento.astimezone(LOCAL)
    return local.weekday() == DIA_DE_ENVIO and INICIO_VENTANA <= local.time() <= FIN_VENTANA


def clave_de_semana(semana: Semana) -> str:
    """`2026-W31`: identifica la semana descrita, no la del envío."""
    anio, numero, _ = semana.lunes.isocalendar()
    return f"{anio}-W{numero:02d}"


# --------------------------------------------------------------------------- #
# Estado
# --------------------------------------------------------------------------- #


def leer_estado() -> dict:
    if not ESTADO.exists():
        return {}
    try:
        return json.loads(ESTADO.read_text(encoding="utf-8"))
    except ValueError:
        return {}


def escribir_estado(estado: dict) -> None:
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text(
        json.dumps(estado, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


# --------------------------------------------------------------------------- #
# Composición por destinatario
# --------------------------------------------------------------------------- #


def destinatarios_del_plan(mapa: dict) -> list[tuple[str, dict]]:
    """Destinatarios a los que se dirige el plan, en orden estable.

    El mapa es el del despachador. Dos claves opcionales lo adaptan:

    - `persona_id`: la persona del registro que actúa como observador. Sin ella,
      o si esa persona no tiene cuenta, se compone la vista pública.
    - `plan`: `false` excluye al destinatario del plan semanal sin sacarlo del
      despachador.
    """
    return [
        (clave, datos)
        for clave, datos in sorted(mapa.items())
        if datos.get("plan", True)
    ]


def instancias_visibles(
    agenda: Agenda, instancias: list[Instancia], observador_id: str | None
) -> list[Instancia]:
    """Aplica la función de visibilidad con `observador_id` como observador.

    Un destinatario sin cuenta —un abuelo que recibe el plan por WhatsApp— no es
    observador del modelo: se le compone la vista pública, que excluye todo
    evento reservado, ya que podría ser una sorpresa que le concierne a él mismo.
    """
    observador = agenda.persona(observador_id)
    if observador is None or not observador.tiene_cuenta:
        return [i for i in instancias if visible_publicamente(agenda, i.evento)]
    return [i for i in instancias if visible(agenda, i.evento, observador)]


def componer_para(
    agenda: Agenda,
    semana: Semana,
    instancias: list[Instancia],
    clave: str,
    datos: dict,
) -> Plan:
    """Compone el plan de un destinatario. El filtrado ocurre aquí, no después."""
    observador_id = datos.get("persona_id")
    persona = agenda.persona(observador_id)
    if persona is None or not persona.tiene_cuenta:
        observador_id = None

    reparto: dict[date, list[Aparicion]] = repartir_por_dia(
        instancias_visibles(agenda, instancias, observador_id), semana
    )
    return componer(
        agenda,
        semana,
        reparto,
        destinatario=clave,
        observador_id=observador_id,
        lio=turnos_de_la_semana(agenda, semana, persona),
    )


def turnos_de_la_semana(
    agenda: Agenda, semana: Semana, persona
) -> dict[date, list[TurnoLio]] | None:
    """Los turnos de Lio, y solo para quien vive en casa.

    Se resuelve aquí y no en `mensaje.py` por la misma razón que el resto del
    filtrado: quien compone el texto no decide qué se puede contar. A quien no
    es de casa se le devuelve `None` y su plan sale exactamente como salía antes
    de que Lio existiera.
    """
    if not es_de_la_casa(persona) or not hay_lio(agenda):
        return None
    return {dia: turnos_de(agenda, dia) for dia in semana.dias()}


def enviar_plan(plan: Plan, clave: str, datos: dict) -> None:
    """Entrega el plan, comprobando antes que el texto es el de su destinatario."""
    if plan.destinatario != clave:
        raise DestinatarioInvalido(
            f"el plan se compuso para «{plan.destinatario}» y se iba a enviar "
            f"a «{clave}»: envío abortado"
        )
    enviar(datos, plan.texto)


# --------------------------------------------------------------------------- #
# Programa
# --------------------------------------------------------------------------- #


def analizar_argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--simulacro",
        action="store_true",
        help="compone e imprime los planes sin enviarlos ni tocar el estado",
    )
    parser.add_argument(
        "--forzar",
        action="store_true",
        help="ignora la ventana del domingo y el registro de la semana ya enviada",
    )
    parser.add_argument(
        "--fecha",
        help="fecha de referencia en formato ISO, para pruebas (por defecto, hoy)",
    )
    parser.add_argument(
        "--solo",
        action="append",
        default=[],
        metavar="CLAVE",
        help="restringe el envío a los destinatarios indicados",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    opciones = analizar_argumentos(argv)

    ahora = datetime.now(LOCAL)
    if opciones.fecha:
        referencia = date.fromisoformat(opciones.fecha)
    else:
        referencia = ahora.date()

    if not opciones.forzar and not opciones.simulacro and not en_ventana(ahora):
        print(
            f"[omitido] fuera de la ventana de envío "
            f"({ahora.strftime('%A %H:%M')} en {LOCAL.key})."
        )
        return 0

    semana = semana_entrante(referencia)
    clave_semana = clave_de_semana(semana)

    try:
        agenda = leer_agenda()
    except FuenteNoDisponible as exc:
        # No se envía un mensaje vacío ni erróneo: un mensaje incorrecto es peor
        # que un mensaje ausente (§10).
        print(f"[error] registro canónico no disponible: {exc}")
        return 1

    if opciones.simulacro:
        mapa = _mapa_de_simulacro(agenda)
    else:
        mapa = cargar_destinatarios()

    destinatarios = destinatarios_del_plan(mapa)
    if opciones.solo:
        destinatarios = [(c, d) for c, d in destinatarios if c in set(opciones.solo)]

    estado = leer_estado()
    registro = estado.get(clave_semana, {}) if not opciones.forzar else {}
    entregados = set(registro.get("entregados", []))

    instancias = instancias_de_la_semana(agenda, semana)
    print(
        f"[plan] semana {clave_semana} ({semana.lunes} – {semana.domingo}), "
        f"{len(instancias)} instancias en el registro, "
        f"{len(destinatarios)} destinatarios"
    )

    fallos = 0
    nuevos: list[str] = []

    for clave, datos in destinatarios:
        if clave in entregados:
            print(f"[ya entregado] {clave}")
            continue

        plan = componer_para(agenda, semana, instancias, clave, datos)

        if opciones.simulacro:
            print(f"\n--- {clave} ({plan.eventos} eventos visibles) ---")
            print(plan.texto)
            print("---")
            continue

        try:
            enviar_plan(plan, clave, datos)
        except Exception as exc:
            print(f"[fallo] {clave}: {exc}")
            fallos += 1
            continue

        print(f"[enviado] {clave} · {plan.eventos} eventos visibles")
        nuevos.append(clave)

    if opciones.simulacro:
        return 0

    if nuevos:
        estado[clave_semana] = {
            "entregados": sorted(entregados | set(nuevos)),
            "generado_en": ahora.replace(microsecond=0).isoformat(),
            "lunes": semana.lunes.isoformat(),
            "domingo": semana.domingo.isoformat(),
        }
        escribir_estado(estado)

    return 1 if fallos else 0


def _mapa_de_simulacro(agenda: Agenda) -> dict:
    """Destinatarios ficticios para `--simulacro`: una entrada por persona con
    cuenta más una vista pública, de modo que se vea qué recibe cada quien."""
    mapa = {
        persona.id: {"phone": "", "apikey": "", "persona_id": persona.id}
        for persona in agenda.personas_con_cuenta()
    }
    mapa["(sin cuenta)"] = {"phone": "", "apikey": ""}
    return mapa


if __name__ == "__main__":
    raise SystemExit(main())
