"""Generador del plan semanal: composición por destinatario y ventana de envío.

Cubre el apartado 5 de `specs/plan-semanal.md`, que es el que justifica que el
resumen merezca documento propio: un error aquí no produce un fallo visible,
arruina una sorpresa.
"""

from __future__ import annotations

import unittest
from datetime import date, datetime
from zoneinfo import ZoneInfo

from comun import agenda_minima

import plan_semanal
from agenda.semana import Semana, instancias_de_la_semana

MADRID = ZoneInfo("Europe/Madrid")
LUNES = date(2026, 7, 27)


def _agenda_con_sorpresa():
    return agenda_minima(
        eventos=[
            {
                "id": "ev-comida",
                "titulo": "Comida con los abuelos",
                "tipo_id": "celebracion",
                "emoji": "🍽️",
                "inicio": "2026-08-02T14:00:00",
            },
            {
                "id": "ev-sorpresa",
                "titulo": "Preparar la fiesta",
                "tipo_id": "otro",
                "inicio": "2026-07-31T17:00:00",
                "categoria_id": "coordinacion",
            },
        ]
    )


def _componer(agenda, clave, datos):
    semana = Semana(LUNES)
    return plan_semanal.componer_para(
        agenda, semana, instancias_de_la_semana(agenda, semana), clave, datos
    )


class ComposicionPorDestinatario(unittest.TestCase):
    def test_cada_destinatario_recibe_su_propia_semana(self):
        agenda = _agenda_con_sorpresa()
        madre = _componer(agenda, "ana", {"persona_id": "p-ana"})
        hija = _componer(agenda, "marta", {"persona_id": "p-marta"})

        self.assertIn("Preparar la fiesta", madre.texto)
        self.assertNotIn("Preparar la fiesta", hija.texto)
        # No se sustituye por un hueco ni por una línea genérica: desaparece.
        self.assertIn("V 31  —", hija.texto)
        self.assertIn("Comida con los abuelos", hija.texto)

    def test_el_cumpleanos_llega_tambien_a_quien_cumple_anos(self):
        """Un cumpleaños no es un secreto; lo que no entra en el canal es la
        dimensión de regalos (§5)."""
        agenda = agenda_minima()
        plan = _componer(agenda, "marta", {"persona_id": "p-marta"})
        self.assertIn("Cumpleaños de Marta", plan.texto)

    def test_al_destinatario_sin_cuenta_se_le_compone_la_vista_publica(self):
        agenda = _agenda_con_sorpresa()
        abuela = _componer(agenda, "abuela", {"persona_id": "p-abuela"})
        anonimo = _componer(agenda, "vecino", {})

        for plan in (abuela, anonimo):
            self.assertNotIn("Preparar la fiesta", plan.texto)
            self.assertIn("Comida con los abuelos", plan.texto)
            self.assertIsNone(plan.observador_id)

    def test_el_plan_registra_para_quien_se_compuso(self):
        agenda = agenda_minima()
        plan = _componer(agenda, "ana", {"persona_id": "p-ana"})
        self.assertEqual(plan.destinatario, "ana")
        self.assertEqual(plan.observador_id, "p-ana")

    def test_la_semana_vacia_de_una_hija_se_envia_igualmente(self):
        """Saltarse el envío delataría que lo único que contenía su semana era
        un evento reservado que se le ocultó (§7)."""
        agenda = agenda_minima(
            personas=[
                {
                    "id": "p-ana",
                    "nombre": "Ana",
                    "tiene_cuenta": True,
                    "rol": "administrador",
                },
                {
                    "id": "p-marta",
                    "nombre": "Marta",
                    "tiene_cuenta": True,
                    "rol": "miembro",
                },
            ],
            eventos=[
                {
                    "id": "ev-sorpresa",
                    "titulo": "Preparar la fiesta",
                    "tipo_id": "otro",
                    "inicio": "2026-07-31T17:00:00",
                    "categoria_id": "coordinacion",
                }
            ],
        )
        hija = _componer(agenda, "marta", {"persona_id": "p-marta"})
        self.assertEqual(hija.eventos, 0)
        self.assertIn("Sin nada en el calendario esta semana.", hija.texto)


class CorrespondenciaEntreObservadorYTexto(unittest.TestCase):
    """El punto que la implementación debe blindar (§5 y §11)."""

    def test_no_se_entrega_un_texto_compuesto_para_otra_persona(self):
        agenda = _agenda_con_sorpresa()
        plan_de_ana = _componer(agenda, "ana", {"persona_id": "p-ana"})

        enviados = []
        original = plan_semanal.enviar
        plan_semanal.enviar = lambda datos, texto: enviados.append((datos, texto))
        try:
            with self.assertRaises(plan_semanal.DestinatarioInvalido):
                plan_semanal.enviar_plan(plan_de_ana, "marta", {"phone": "", "apikey": ""})
        finally:
            plan_semanal.enviar = original

        self.assertEqual(enviados, [])

    def test_el_texto_propio_si_se_entrega(self):
        agenda = _agenda_con_sorpresa()
        plan = _componer(agenda, "ana", {"persona_id": "p-ana"})

        enviados = []
        original = plan_semanal.enviar
        plan_semanal.enviar = lambda datos, texto: enviados.append((datos, texto))
        try:
            plan_semanal.enviar_plan(plan, "ana", {"phone": "+34", "apikey": "k"})
        finally:
            plan_semanal.enviar = original

        self.assertEqual(len(enviados), 1)
        self.assertEqual(enviados[0][1], plan.texto)


class VentanaDeEnvio(unittest.TestCase):
    def test_la_tarde_del_domingo_esta_dentro(self):
        for hora in (17, 18, 20, 22):
            with self.subTest(hora=hora):
                self.assertTrue(
                    plan_semanal.en_ventana(
                        datetime(2026, 7, 26, hora, 11, tzinfo=MADRID)
                    )
                )

    def test_fuera_del_domingo_o_de_la_franja_no_se_envia(self):
        casos = [
            datetime(2026, 7, 26, 9, 0, tzinfo=MADRID),    # domingo por la mañana
            datetime(2026, 7, 26, 23, 30, tzinfo=MADRID),  # domingo, ya de noche
            datetime(2026, 7, 27, 18, 0, tzinfo=MADRID),   # lunes
        ]
        for momento in casos:
            with self.subTest(momento=momento):
                self.assertFalse(plan_semanal.en_ventana(momento))


class ClaveDeSemana(unittest.TestCase):
    def test_identifica_la_semana_descrita(self):
        self.assertEqual(plan_semanal.clave_de_semana(Semana(LUNES)), "2026-W31")


class Destinatarios(unittest.TestCase):
    def test_se_puede_excluir_a_alguien_del_plan_sin_sacarlo_del_despachador(self):
        mapa = {
            "ana": {"phone": "1", "apikey": "a"},
            "trabajo": {"phone": "2", "apikey": "b", "plan": False},
        }
        self.assertEqual(
            [clave for clave, _ in plan_semanal.destinatarios_del_plan(mapa)], ["ana"]
        )


if __name__ == "__main__":
    unittest.main()
