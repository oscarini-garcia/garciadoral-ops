"""Formato del mensaje de WhatsApp (specs/plan-semanal.md §6 y §7)."""

from __future__ import annotations

import unittest
from datetime import date

from comun import agenda_minima

from agenda.mensaje import (
    ANCHO_LINEA,
    SIN_EVENTOS,
    componer,
    formatear_dia,
    formatear_rango,
)
from agenda.semana import Semana, instancias_de_la_semana, repartir_por_dia


def _plan(agenda, lunes=date(2026, 7, 27), destinatario="ana", observador=None):
    semana = Semana(lunes)
    reparto = repartir_por_dia(instancias_de_la_semana(agenda, semana), semana)
    return componer(
        agenda,
        semana,
        reparto,
        destinatario=destinatario,
        observador_id=observador,
    )


class Encabezado(unittest.TestCase):
    def test_rango_entre_meses(self):
        self.assertEqual(formatear_rango(Semana(date(2026, 7, 27))), "27 jul – 2 ago")

    def test_rango_dentro_del_mismo_mes(self):
        self.assertEqual(formatear_rango(Semana(date(2026, 8, 3))), "3 – 9 ago")

    def test_inicial_del_dia_y_numero_alineado(self):
        self.assertEqual(formatear_dia(date(2026, 7, 27)), "L 27")
        self.assertEqual(formatear_dia(date(2026, 8, 1)), "S  1")
        self.assertEqual(formatear_dia(date(2026, 8, 2)), "D  2")


class MarcoDeSieteDias(unittest.TestCase):
    def test_la_semana_completa_reproduce_el_esquema_de_la_especificacion(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev-hipica",
                    "titulo": "Entreno de hípica",
                    "tipo_id": "entreno",
                    "emoji": "🏇",
                    "inicio": "2026-07-27T18:00:00",
                },
                {
                    "id": "ev-dentista",
                    "titulo": "Dentista",
                    "tipo_id": "cita_medica",
                    "inicio": "2026-07-30T10:00:00",
                    "participantes": [{"persona_id": "p-ana", "rol": "protagonista"}],
                },
                {
                    "id": "ev-comida",
                    "titulo": "Comida con los abuelos",
                    "tipo_id": "celebracion",
                    "emoji": "🍽️",
                    "inicio": "2026-08-02T14:00:00",
                },
            ]
        )
        texto = _plan(agenda).texto
        self.assertEqual(
            texto,
            "\n".join(
                [
                    "*Plan de la semana*",
                    "27 jul – 2 ago",
                    "",
                    "L 27  🏇 Entreno de hípica · 18:00",
                    "M 28  —",
                    "X 29  —",
                    "J 30  🎂 Cumpleaños de la abuela",
                    "      🩺 Dentista (Ana) · 10:00",
                    "V 31  —",
                    "S  1  🎂 Cumpleaños de Marta",
                    "D  2  🍽️ Comida con los abuelos · 14:00",
                ]
            ),
        )

    def test_los_dias_vacios_se_marcan_y_nunca_se_omiten(self):
        agenda = agenda_minima(
            personas=[],
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Cine",
                    "tipo_id": "otro",
                    "inicio": "2026-07-29T19:00:00",
                }
            ],
        )
        cuerpo = _plan(agenda).texto.splitlines()[3:]
        self.assertEqual(len(cuerpo), 7)
        self.assertEqual(sum(linea.endswith("—") for linea in cuerpo), 6)

    def test_la_semana_sin_eventos_se_envia_igualmente(self):
        """La regularidad construye el hábito, y su ausencia sería ambigua (§7)."""
        plan = _plan(agenda_minima(personas=[]), lunes=date(2026, 9, 7))
        self.assertEqual(plan.eventos, 0)
        self.assertIn(SIN_EVENTOS, plan.texto)
        self.assertNotIn("—", plan.texto)


class TechoDeEventos(unittest.TestCase):
    def test_a_partir_del_cuarto_evento_aparece_el_resumen(self):
        agenda = agenda_minima(
            personas=[],
            eventos=[
                {
                    "id": f"ev-{n}",
                    "titulo": f"Cosa {n}",
                    "tipo_id": "otro",
                    "inicio": f"2026-07-27T{8 + n:02d}:00:00",
                }
                for n in range(5)
            ],
        )
        lineas = _plan(agenda).texto.splitlines()
        self.assertIn("L 27  📌 Cosa 0 · 08:00", lineas)
        self.assertIn("      📌 Cosa 2 · 10:00", lineas)
        self.assertNotIn("      📌 Cosa 3 · 11:00", lineas)
        self.assertIn("      y 2 más", lineas)

    def test_el_recuento_solo_cubre_lo_que_se_le_pasa(self):
        """El resumen nunca debe delatar un evento reservado que se excluyó (§6).

        El módulo de composición recibe el reparto ya filtrado, de modo que un
        evento oculto no llega siquiera a contarse.
        """
        agenda = agenda_minima(
            personas=[],
            eventos=[
                {
                    "id": f"ev-{n}",
                    "titulo": f"Cosa {n}",
                    "tipo_id": "otro",
                    "inicio": f"2026-07-27T{8 + n:02d}:00:00",
                }
                for n in range(5)
            ],
        )
        semana = Semana(date(2026, 7, 27))
        reparto = repartir_por_dia(instancias_de_la_semana(agenda, semana), semana)
        reparto[date(2026, 7, 27)] = reparto[date(2026, 7, 27)][:4]
        plan = componer(
            agenda, semana, reparto, destinatario="ana", observador_id="p-ana"
        )
        self.assertIn("      y 1 más", plan.texto.splitlines())


class RecorteDeTitulos(unittest.TestCase):
    def test_el_titulo_largo_se_recorta_para_no_partir_la_linea(self):
        agenda = agenda_minima(
            personas=[],
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Reunión de coordinación del comité de fiestas del barrio",
                    "tipo_id": "otro",
                    "inicio": "2026-07-27T19:00:00",
                }
            ],
        )
        linea = next(
            l for l in _plan(agenda).texto.splitlines() if l.startswith("L 27")
        )
        self.assertIn("…", linea)
        self.assertTrue(linea.endswith("· 19:00"))
        self.assertLessEqual(len(linea), ANCHO_LINEA + 2)

    def test_el_titulo_corto_no_se_toca(self):
        agenda = agenda_minima(
            personas=[],
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Cine",
                    "tipo_id": "otro",
                    "inicio": "2026-07-27T19:00:00",
                }
            ],
        )
        self.assertIn("L 27  📌 Cine · 19:00", _plan(agenda).texto.splitlines())


class Acompanantes(unittest.TestCase):
    def test_no_se_repite_el_nombre_que_ya_esta_en_el_titulo(self):
        agenda = agenda_minima()
        texto = _plan(agenda).texto
        self.assertIn("🎂 Cumpleaños de Marta", texto)
        self.assertNotIn("Cumpleaños de Marta (Marta)", texto)


class Continuacion(unittest.TestCase):
    def test_las_jornadas_posteriores_se_marcan_como_continuacion(self):
        agenda = agenda_minima(
            personas=[],
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Torneo de hípica",
                    "tipo_id": "competicion",
                    "inicio": "2026-08-01",
                    "fin": "2026-08-02",
                    "jornada_completa": True,
                }
            ],
        )
        lineas = _plan(agenda).texto.splitlines()
        self.assertIn("S  1  🏆 Torneo de hípica", lineas)
        self.assertIn("D  2  🏆 Torneo de hípica (cont.)", lineas)


if __name__ == "__main__":
    unittest.main()
