"""Lio: de dónde sale cada turno y cómo se cuenta en el plan de los domingos.

Lo que se comprueba aquí es la regla que sostiene todo el módulo —**el cuadro
dice quién saca al perro, y la fila escrita dice quién lo sacó ese día**— y su
consecuencia: cambiar el reparto cambia el futuro y no reescribe el pasado. Si
eso se rompiera, el histórico de quién lo saca de verdad se reescribiría solo
cada vez que alguien toca Ajustes, y nadie se enteraría.
"""

from __future__ import annotations

import unittest
from datetime import date

from comun import agenda_minima

from agenda.lio import (
    IDS_TURNO,
    TurnoLio,
    cuadro_normalizado,
    hay_lio,
    id_paseo,
    turno_de,
    turnos_de,
)
from agenda.mensaje import componer, formatear_lio
from agenda.modelo import ErrorDeIntegridad
from agenda.semana import Semana, instancias_de_la_semana, repartir_por_dia
from agenda.visibilidad import es_de_la_casa

LUNES = date(2026, 7, 27)

#: El lunes por la mañana lo saca Óscar y por la noche Marta; el resto de la
#: semana, al revés. Los cuatro nombres del registro mínimo pasan a ser de casa,
#: que es el único círculo desde el que se saca al perro.
CUADRO = {
    "manana": ["p-oscar", "p-marta", "p-oscar", "p-marta", "p-oscar", None, None],
    "noche": ["p-marta", "p-oscar", "p-marta", "p-oscar", "p-marta", "p-oscar", "p-marta"],
}


def _casa(**cambios):
    """El registro mínimo con los cuatro con cuenta metidos en casa."""
    agenda = agenda_minima(
        personas=[
            {"id": "p-ana", "nombre": "Ana", "tiene_cuenta": True, "rol": "administrador", "circulo": "familia"},
            {"id": "p-oscar", "nombre": "Óscar", "tiene_cuenta": True, "rol": "administrador", "circulo": "familia"},
            {"id": "p-marta", "nombre": "Marta", "tiene_cuenta": True, "rol": "miembro", "circulo": "familia"},
            {"id": "p-lucia", "nombre": "Lucía", "tiene_cuenta": True, "rol": "miembro", "circulo": "familia"},
            # Sin fecha de nacimiento a propósito: aquí se mira una semana en la
            # que lo único apuntado son los turnos, y un cumpleaños derivado la
            # llenaría sin que la prueba lo dijera.
            {"id": "p-abuela", "nombre": "la abuela", "tiene_cuenta": False},
        ],
        **cambios,
    )
    return agenda


class Cuadro(unittest.TestCase):
    def test_el_cuadro_llega_saneado_aunque_venga_a_medias(self):
        cuadro = cuadro_normalizado({"manana": ["p-oscar", 42], "sobra": ["x"]})
        self.assertEqual(cuadro["manana"], ["p-oscar", None, None, None, None, None, None])
        self.assertEqual(cuadro["noche"], [None] * 7)
        self.assertNotIn("sobra", cuadro)

    def test_un_cuadro_ilegible_no_tumba_nada(self):
        self.assertEqual(cuadro_normalizado(None), {t: [None] * 7 for t in IDS_TURNO})
        self.assertEqual(cuadro_normalizado("{roto"), {t: [None] * 7 for t in IDS_TURNO})

    def test_sin_cuadro_y_sin_filas_no_hay_lio(self):
        self.assertFalse(hay_lio(_casa()))
        self.assertTrue(hay_lio(_casa(lio_cuadro=CUADRO)))


class DeDondeSaleElTurno(unittest.TestCase):
    def test_el_turno_se_deriva_del_cuadro_por_el_dia_de_la_semana(self):
        agenda = _casa(lio_cuadro=CUADRO)
        self.assertEqual(turno_de(agenda, LUNES, "manana").asignado_id, "p-oscar")
        self.assertEqual(turno_de(agenda, LUNES, "noche").asignado_id, "p-marta")
        # El martes, al revés; y el sábado por la mañana no le toca a nadie.
        self.assertEqual(turno_de(agenda, date(2026, 7, 28), "manana").asignado_id, "p-marta")
        self.assertIsNone(turno_de(agenda, date(2026, 8, 1), "manana").asignado_id)

    def test_los_dos_turnos_del_dia_salen_en_orden(self):
        turnos = turnos_de(_casa(lio_cuadro=CUADRO), LUNES)
        self.assertEqual([t.turno for t in turnos], ["manana", "noche"])

    def test_la_fila_escrita_manda_sobre_el_cuadro(self):
        """Lo que ya pasó no lo reescribe un reparto nuevo.

        Es la razón de ser de la tabla: el lunes por la mañana le tocaba a Óscar
        y lo sacó Marta. Aunque el cuadro siga diciendo Óscar —y aunque mañana se
        cambie entero—, ese lunes lo sacó Marta para siempre.
        """
        agenda = _casa(
            lio_cuadro=CUADRO,
            paseos=[
                {
                    "id": id_paseo(LUNES, "manana"),
                    "fecha": LUNES.isoformat(),
                    "turno": "manana",
                    "asignado_id": "p-oscar",
                    "hecho_por_id": "p-marta",
                    "hecho_en": "2026-07-27T08:10:00",
                }
            ],
        )
        turno = turno_de(agenda, LUNES, "manana")
        self.assertEqual(turno.asignado_id, "p-oscar")
        self.assertEqual(turno.hecho_por_id, "p-marta")
        self.assertEqual(turno.responsable_id, "p-marta")

    def test_una_fila_inactiva_no_cuenta(self):
        agenda = _casa(
            lio_cuadro=CUADRO,
            paseos=[
                {
                    "id": id_paseo(LUNES, "manana"),
                    "fecha": LUNES.isoformat(),
                    "turno": "manana",
                    "hecho_por_id": "p-marta",
                    "activo": False,
                }
            ],
        )
        self.assertEqual(turno_de(agenda, LUNES, "manana").asignado_id, "p-oscar")


class QuienLoVe(unittest.TestCase):
    def test_a_lio_lo_saca_quien_vive_en_casa(self):
        agenda = _casa()
        self.assertTrue(es_de_la_casa(agenda.persona("p-oscar")))
        self.assertFalse(es_de_la_casa(agenda.persona("p-abuela")))
        self.assertFalse(es_de_la_casa(None))

    def test_alguien_de_fuera_en_el_cuadro_es_una_infraccion(self):
        with self.assertRaises(ErrorDeIntegridad) as fallo:
            agenda_minima(lio_cuadro={"manana": ["p-abuela"] + [None] * 6})
        self.assertIn("círculo de casa", str(fallo.exception))

    def test_un_paseo_a_nombre_de_alguien_de_fuera_tambien(self):
        with self.assertRaises(ErrorDeIntegridad):
            _casa(
                paseos=[
                    {
                        "id": id_paseo(LUNES, "noche"),
                        "fecha": LUNES.isoformat(),
                        "turno": "noche",
                        "hecho_por_id": "p-abuela",
                    }
                ]
            )


class EnElMensaje(unittest.TestCase):
    def _plan(self, agenda, con_lio=True):
        semana = Semana(LUNES)
        reparto = repartir_por_dia(instancias_de_la_semana(agenda, semana), semana)
        lio = {dia: turnos_de(agenda, dia) for dia in semana.dias()} if con_lio else None
        return componer(
            agenda,
            semana,
            reparto,
            destinatario="oscar",
            observador_id="p-oscar",
            lio=lio,
        )

    def test_el_renglon_lleva_los_dos_turnos_con_su_emoji(self):
        agenda = _casa(lio_cuadro=CUADRO)
        renglon = formatear_lio(agenda, turnos_de(agenda, LUNES))
        self.assertEqual(renglon, "🐾 ☀️ Óscar · 🌙 Marta")

    def test_el_turno_sin_nadie_se_calla(self):
        agenda = _casa(lio_cuadro=CUADRO)
        # El sábado solo hay turno de noche.
        self.assertEqual(formatear_lio(agenda, turnos_de(agenda, date(2026, 8, 1))), "🐾 🌙 Óscar")

    def test_el_dia_sin_nada_apuntado_escribe_el_turno_en_lugar_del_guion(self):
        texto = self._plan(_casa(lio_cuadro=CUADRO)).texto
        self.assertIn("L 27  🐾 ☀️ Óscar · 🌙 Marta", texto)
        self.assertNotIn("L 27  —", texto)

    def test_lio_va_detras_de_los_eventos_y_fuera_del_techo_de_tres(self):
        agenda = _casa(
            lio_cuadro=CUADRO,
            eventos=[
                {
                    "id": f"ev-{i}",
                    "titulo": f"Cosa {i}",
                    "tipo_id": "otro",
                    "inicio": f"2026-07-27T{9 + i:02d}:00:00",
                }
                for i in range(4)
            ],
        )
        lineas = self._plan(agenda).texto.splitlines()
        arranque = next(i for i, l in enumerate(lineas) if l.startswith("L 27"))
        siguiente = next(i for i, l in enumerate(lineas) if l.startswith("M 28"))
        del_lunes = lineas[arranque:siguiente]

        # Tres eventos, el recuento de lo que no cabe, y Lio el último: el turno
        # no gasta ninguna de las tres líneas ni entra en el «y N más».
        self.assertEqual(len(del_lunes), 5)
        self.assertIn("y 1 más", del_lunes[3])
        self.assertIn("🐾 ☀️ Óscar · 🌙 Marta", del_lunes[4])

    def test_una_semana_con_solo_turnos_no_dice_que_no_hay_nada(self):
        plan = self._plan(_casa(lio_cuadro=CUADRO))
        self.assertNotIn("Sin nada en el calendario", plan.texto)
        # Los turnos no son eventos y no engordan el recuento.
        self.assertEqual(plan.eventos, 0)

    def test_para_quien_no_es_de_casa_el_plan_sale_como_antes(self):
        """Sin Lio, una semana con solo turnos vuelve a ser una semana vacía."""
        texto = self._plan(_casa(lio_cuadro=CUADRO), con_lio=False).texto
        self.assertNotIn("🐾", texto)
        self.assertIn("Sin nada en el calendario", texto)

    def test_sin_lio_el_dia_vacio_sigue_llevando_su_guion(self):
        agenda = _casa(
            lio_cuadro=CUADRO,
            eventos=[{"id": "ev-1", "titulo": "Cita", "tipo_id": "otro", "inicio": "2026-07-28T10:00:00"}],
        )
        self.assertIn("L 27  —", self._plan(agenda, con_lio=False).texto)


class ElTurnoSuelto(unittest.TestCase):
    def test_el_responsable_es_quien_lo_saco_si_consta(self):
        self.assertEqual(TurnoLio(LUNES, "noche", "p-oscar", "p-marta").responsable_id, "p-marta")
        self.assertEqual(TurnoLio(LUNES, "noche", "p-oscar").responsable_id, "p-oscar")
        self.assertIsNone(TurnoLio(LUNES, "noche").responsable_id)


if __name__ == "__main__":
    unittest.main()
