#!/usr/bin/env python3
"""Transporte compartido: envío de un WhatsApp a través de CallMeBot.

Lo usan el despachador (`despachar.py`) y el generador del plan semanal
(`plan_semanal.py`). El plan reutiliza el **transporte** del despachador —el
mapa de destinatarios y el envío—, no su cola (`specs/plan-semanal.md` §9).

Solo biblioteca estándar: sin `pip install`, sin dependencias que mantener.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from typing import Any

ENDPOINT = "https://api.callmebot.com/whatsapp.php"
TIEMPO_MAXIMO = 30
AGENTE = "family-notify/1.0"


def cargar_destinatarios() -> dict[str, dict[str, Any]]:
    """Lee el secreto `RECIPIENTS_JSON` (specs/despachador.md §6).

    Los números de teléfono nunca residen en el repositorio.
    """
    crudo = os.environ.get("RECIPIENTS_JSON", "").strip()
    if not crudo:
        sys.exit("Falta el secreto RECIPIENTS_JSON")
    return json.loads(crudo)


def enviar(destinatario: dict[str, Any], texto: str) -> None:
    """Entrega `texto` a un destinatario. Lanza excepción si no lo consigue."""
    params = urllib.parse.urlencode(
        {
            "phone": destinatario["phone"],
            "text": texto,
            "apikey": destinatario["apikey"],
        }
    )
    peticion = urllib.request.Request(
        f"{ENDPOINT}?{params}",
        headers={"User-Agent": AGENTE},
    )
    with urllib.request.urlopen(peticion, timeout=TIEMPO_MAXIMO) as respuesta:
        if respuesta.status != 200:
            raise RuntimeError(f"CallMeBot respondió {respuesta.status}")
