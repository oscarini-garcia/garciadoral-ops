"""Despachador de la cola (specs/despachador.md §5 y §8)."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

import comun  # noqa: F401  (fija el sys.path)

import despachar

DESTINATARIOS = {
    "maria": {"phone": "+34600111222", "apikey": "111"},
    "papa": {"phone": "+34600333444", "apikey": "222"},
    "carlos": {"phone": "+34600555666", "apikey": "333"},
}

AHORA = datetime(2026, 7, 27, 8, 0, tzinfo=timezone.utc)


class EnvioFalso:
    """Sustituye a `enviar`, registrando las entregas y fallando a voluntad."""

    def __init__(self, fallan: set[str] | None = None):
        self.entregas: list[tuple[str, str]] = []
        self.fallan = fallan or set()

    def __call__(self, destinatario: dict, texto: str) -> None:
        telefono = destinatario["phone"]
        if telefono in self.fallan:
            raise RuntimeError("CallMeBot no responde")
        self.entregas.append((telefono, texto))


class Despacho(unittest.TestCase):
    def setUp(self):
        self.original = despachar.enviar

    def tearDown(self):
        despachar.enviar = self.original

    def _procesar(self, cola, envio=None, ahora=AHORA):
        despachar.enviar = envio or EnvioFalso()
        modificada, fallos = despachar.procesar(cola, DESTINATARIOS, ahora)
        return despachar.enviar, modificada, fallos

    def test_lo_vencido_se_envia_a_todos_los_destinatarios(self):
        cola = [
            {
                "id": "A",
                "to": ["maria", "papa"],
                "text": "Resumen de la semana",
                "send_at": "2026-07-27T09:00:00",  # 09:00 local = 07:00 UTC
                "repeat": "ninguna",
                "status": "pendiente",
            }
        ]
        envio, modificada, fallos = self._procesar(cola)
        self.assertTrue(modificada)
        self.assertEqual(fallos, 0)
        self.assertEqual(len(envio.entregas), 2)
        self.assertEqual(cola[0]["status"], "enviado")
        self.assertIn("sent_at", cola[0])

    def test_lo_no_vencido_se_deja_estar(self):
        cola = [
            {
                "id": "A",
                "to": "maria",
                "text": "Luego",
                "send_at": "2026-07-30T09:00:00",
                "status": "pendiente",
            }
        ]
        envio, modificada, _ = self._procesar(cola)
        self.assertFalse(modificada)
        self.assertEqual(envio.entregas, [])
        self.assertEqual(cola[0]["status"], "pendiente")

    def test_lo_muy_atrasado_caduca_en_lugar_de_llegar_fuera_de_contexto(self):
        cola = [
            {
                "id": "A",
                "to": "maria",
                "text": "La semana pasada",
                "send_at": "2026-07-20T09:00:00",
                "status": "pendiente",
            }
        ]
        envio, _, fallos = self._procesar(cola)
        self.assertEqual(envio.entregas, [])
        self.assertEqual(cola[0]["status"], "caducado")
        self.assertEqual(fallos, 0)

    def test_la_ventana_de_gracia_cubre_un_sondeo_perdido(self):
        cola = [
            {
                "id": "A",
                "to": "maria",
                "text": "Ayer",
                "send_at": "2026-07-26T09:00:00",  # 23 horas antes
                "status": "pendiente",
            }
        ]
        envio, _, _ = self._procesar(cola)
        self.assertEqual(len(envio.entregas), 1)
        self.assertEqual(cola[0]["status"], "enviado")

    def test_el_reparto_es_idempotente_por_destinatario(self):
        """Si el tercero de los envíos falla, al día siguiente solo se reintenta
        con quienes quedaron pendientes: nadie recibe el mensaje por duplicado."""
        cola = [
            {
                "id": "A",
                "to": ["maria", "papa", "carlos"],
                "text": "Hola",
                "send_at": "2026-07-27T09:00:00",
                "status": "pendiente",
            }
        ]
        primero, _, fallos = self._procesar(cola, EnvioFalso(fallan={"+34600555666"}))
        self.assertEqual(len(primero.entregas), 2)
        self.assertEqual(fallos, 1)
        self.assertEqual(cola[0]["entregados"], ["maria", "papa"])
        self.assertEqual(cola[0]["intentos"], 1)
        self.assertEqual(cola[0]["status"], "pendiente")

        segundo, _, fallos = self._procesar(
            cola, EnvioFalso(), ahora=AHORA + timedelta(days=1)
        )
        self.assertEqual([t for t, _ in segundo.entregas], ["+34600555666"])
        self.assertEqual(fallos, 0)
        self.assertEqual(cola[0]["status"], "enviado")
        self.assertNotIn("entregados", cola[0])

    def test_los_reintentos_se_agotan_a_los_tres_fallos(self):
        cola = [
            {
                "id": "A",
                "to": "maria",
                "text": "Hola",
                "send_at": "2026-07-27T09:00:00",
                "status": "pendiente",
                "intentos": 2,
            }
        ]
        _, _, fallos = self._procesar(cola, EnvioFalso(fallan={"+34600111222"}))
        self.assertEqual(fallos, 1)
        self.assertEqual(cola[0]["status"], "error")
        self.assertIn("CallMeBot no responde", cola[0]["error"])

    def test_un_destinatario_desconocido_es_error_y_no_se_envia_nada(self):
        cola = [
            {
                "id": "A",
                "to": ["maria", "tio"],
                "text": "Hola",
                "send_at": "2026-07-27T09:00:00",
                "status": "pendiente",
            }
        ]
        envio, _, fallos = self._procesar(cola)
        self.assertEqual(envio.entregas, [])
        self.assertEqual(fallos, 1)
        self.assertEqual(cola[0]["status"], "error")
        self.assertIn("tio", cola[0]["error"])

    def test_el_recurrente_se_reprograma_en_hora_local(self):
        """Una notificación a las 08:00 sigue llegando a las 08:00 tras el
        cambio de horario."""
        cola = [
            {
                "id": "A",
                "to": "maria",
                "text": "Cada semana",
                "send_at": "2026-07-27T09:00:00",
                "repeat": "semanal",
                "status": "pendiente",
            }
        ]
        envio, _, _ = self._procesar(cola)
        self.assertEqual(len(envio.entregas), 1)
        self.assertEqual(cola[0]["status"], "pendiente")
        self.assertEqual(cola[0]["send_at"], "2026-08-03T09:00:00")

    def test_el_recurrente_anual_del_29_de_febrero_pasa_al_1_de_marzo(self):
        momento = despachar.parsear("2024-02-29T08:30:00")
        siguiente = despachar.siguiente(momento, "anual")
        self.assertEqual(siguiente.astimezone(despachar.LOCAL).date().isoformat(), "2025-03-01")

    def test_el_cambio_de_horario_se_resuelve_al_interpretar_la_marca(self):
        invierno = despachar.parsear("2026-01-15T09:00:00")
        verano = despachar.parsear("2026-07-15T09:00:00")
        self.assertEqual(invierno.hour, 8)   # CET, UTC+1
        self.assertEqual(verano.hour, 7)     # CEST, UTC+2


if __name__ == "__main__":
    unittest.main()
