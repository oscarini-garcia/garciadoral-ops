#!/usr/bin/env python3
"""Despacha los mensajes vencidos de queue.json a través de CallMeBot.

Implementa el apartado 8 de `specs/despachador.md`. El envío y la carga del
mapa de destinatarios viven en `callmebot.py`, que comparte con el generador
del plan semanal; el comportamiento es el especificado.

Solo biblioteca estándar: sin `pip install`, sin dependencias que mantener y con
ejecuciones de pocos segundos.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import json

from callmebot import cargar_destinatarios, enviar

QUEUE = Path(os.environ.get("QUEUE_PATH", "queue.json"))
LOCAL = ZoneInfo("Europe/Madrid")
GRACIA = timedelta(hours=36)     # cubre un sondeo diario fallido sin caducar el mensaje
MAX_INTENTOS = 3


def parsear(marca: str) -> datetime:
    """Interpreta una marca temporal; si es naive, se asume hora local."""
    dt = datetime.fromisoformat(marca)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LOCAL)
    return dt.astimezone(timezone.utc)


def siguiente(momento: datetime, repeticion: str) -> datetime | None:
    if repeticion == "diaria":
        return momento + timedelta(days=1)
    if repeticion == "semanal":
        return momento + timedelta(weeks=1)
    if repeticion == "anual":
        try:
            return momento.replace(year=momento.year + 1)
        except ValueError:                       # 29 de febrero
            return momento.replace(year=momento.year + 1, month=3, day=1)
    return None


def procesar(cola: list[dict], destinatarios: dict, ahora: datetime) -> tuple[bool, int]:
    """Recorre la cola y despacha lo vencido. Devuelve (modificada, fallos)."""
    modificada = False
    fallos = 0

    for item in cola:
        if item.get("status") != "pendiente":
            continue

        cuando = parsear(item["send_at"])
        if cuando > ahora:
            continue

        if ahora - cuando > GRACIA:
            item["status"] = "caducado"
            modificada = True
            print(f"[caducado] {item['id']}")
            continue

        destino = item["to"]
        claves = destino if isinstance(destino, list) else [destino]

        desconocidos = [c for c in claves if c not in destinatarios]
        if desconocidos:
            item["status"] = "error"
            item["error"] = f"destinatarios desconocidos: {', '.join(desconocidos)}"
            modificada = True
            fallos += 1
            continue

        entregados = set(item.get("entregados", []))
        incidencias = []

        for clave in claves:
            if clave in entregados:
                continue
            try:
                enviar(destinatarios[clave], item["text"])
            except Exception as exc:
                incidencias.append(f"{clave}: {exc}")
                print(f"[fallo] {item['id']} -> {clave}: {exc}")
                continue
            entregados.add(clave)
            print(f"[enviado] {item['id']} -> {clave}")

        if incidencias:
            # El reparto es idempotente por destinatario: el reintento del día
            # siguiente solo cubre a quienes quedaron pendientes.
            item["entregados"] = sorted(entregados)
            item["intentos"] = item.get("intentos", 0) + 1
            if item["intentos"] >= MAX_INTENTOS:
                item["status"] = "error"
                item["error"] = "; ".join(incidencias)
            modificada = True
            fallos += 1
            continue

        item.pop("entregados", None)
        item.pop("intentos", None)
        proximo = siguiente(cuando, item.get("repeat", "ninguna"))
        if proximo:
            # Los recurrentes se reprograman en hora local, de modo que una
            # notificación a las 08:00 sigue llegando a las 08:00 tras el
            # cambio de horario.
            item["send_at"] = proximo.astimezone(LOCAL).replace(tzinfo=None).isoformat()
            item["intentos"] = 0
        else:
            item["status"] = "enviado"
            item["sent_at"] = ahora.isoformat()
        modificada = True

    return modificada, fallos


def main() -> int:
    if not QUEUE.exists():
        print("No hay cola que procesar.")
        return 0

    cola = json.loads(QUEUE.read_text(encoding="utf-8"))
    destinatarios = cargar_destinatarios()
    ahora = datetime.now(timezone.utc)

    modificada, fallos = procesar(cola, destinatarios, ahora)

    if modificada:
        QUEUE.write_text(
            json.dumps(cola, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
