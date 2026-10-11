"""Los festivos en el plan de los domingos (specs/propuesta-festivos.html).

Los oficiales llegan hechos en el registro, como los compone el Worker; aquí se
prueba que salen en la semana y que dejan sin día a una recurrente, con las
mismas excepciones que la aplicación: en festivos sí hay, «Sí hay» ese día, y
un festivo de alguien que solo anula lo suyo.
"""

from __future__ import annotations

import unittest
from datetime import date

from comun import agenda_minima

from agenda.festivos import festivo_que_anula
from agenda.semana import Semana, instancias_de_la_semana

LUNES = date(2026, 10, 12)

FESTIVOS = {"lugar": "barcelona", "dias": [{"fecha": "2026-10-12", "nombre": "Fiesta Nacional", "ambito": "cataluna", "de": "tabla"}]}


def recurrente(identificador: str, de: str, **extra) -> dict:
    return {
        "id": identificador, "titulo": "Academia", "tipo_id": "recurrente", "plugin_id": "extraescolar",
        "inicio": "2026-09-07T17:00:00", "repeticion": "semanal",
        "extra": {"dias": [0], **extra},
        "participantes": [{"persona_id": de, "rol": "protagonista"}],
    }


class Festivos(unittest.TestCase):
    def test_el_oficial_sale_en_la_semana_y_anula_la_recurrente(self):
        agenda = agenda_minima(festivos=FESTIVOS, eventos=[recurrente("e-academia", "p-marta")])
        ids = [i.evento.id for i in instancias_de_la_semana(agenda, Semana(LUNES))]
        self.assertIn("derivado:festivo:2026-10-12", ids)
        self.assertNotIn("e-academia", ids)
        evento = agenda.eventos["e-academia"]
        self.assertEqual(festivo_que_anula(agenda, evento, LUNES), "Fiesta Nacional")
        self.assertIsNone(festivo_que_anula(agenda, evento, date(2026, 10, 19)))

    def test_en_festivos_si_hay_y_si_hay_ese_dia(self):
        agenda = agenda_minima(
            festivos=FESTIVOS,
            eventos=[recurrente("e-hipica", "p-marta", en_festivos="si"), recurrente("e-academia", "p-marta")],
            dias_evento=[{"id": "dia:e-academia:2026-10-12", "evento_id": "e-academia", "fecha": "2026-10-12", "hay_en_festivo": True}],
        )
        ids = [i.evento.id for i in instancias_de_la_semana(agenda, Semana(LUNES))]
        self.assertIn("e-hipica", ids)
        self.assertIn("e-academia", ids)

    def test_un_festivo_de_alguien_solo_anula_lo_suyo(self):
        sin_cole = {
            "id": "e-sin-cole", "titulo": "Libre disposición", "tipo_id": "festivo", "plugin_id": "festivo",
            "inicio": "2026-10-16", "jornada_completa": True,
            "participantes": [{"persona_id": "p-marta", "rol": "protagonista"}],
        }
        de_marta = recurrente("e-marta", "p-marta", dias=[4])
        de_lucia = recurrente("e-lucia", "p-lucia", dias=[4])
        agenda = agenda_minima(eventos=[sin_cole, de_marta, de_lucia])
        viernes = date(2026, 10, 16)
        self.assertEqual(festivo_que_anula(agenda, agenda.eventos["e-marta"], viernes), "Libre disposición")
        self.assertIsNone(festivo_que_anula(agenda, agenda.eventos["e-lucia"], viernes))


if __name__ == "__main__":
    unittest.main()
