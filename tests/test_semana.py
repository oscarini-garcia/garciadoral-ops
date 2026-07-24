"""Semana entrante, recurrencias y eventos de varios días."""

from __future__ import annotations

import unittest
from datetime import date

from comun import agenda_minima

from agenda.semana import (
    Semana,
    eventos_derivados,
    instancias_de_la_semana,
    ocurrencias,
    repartir_por_dia,
    semana_entrante,
)


class SemanaEntrante(unittest.TestCase):
    def test_el_domingo_describe_la_semana_que_viene(self):
        """El domingo por la tarde el interés está en lo que viene, no en la
        semana que termina esa misma noche (specs/plan-semanal.md §3)."""
        semana = semana_entrante(date(2026, 7, 26))  # domingo
        self.assertEqual(semana.lunes, date(2026, 7, 27))
        self.assertEqual(semana.domingo, date(2026, 8, 2))

    def test_desde_cualquier_dia_se_obtiene_el_lunes_siguiente(self):
        for referencia, lunes in [
            (date(2026, 7, 24), date(2026, 7, 27)),  # viernes
            (date(2026, 7, 27), date(2026, 8, 3)),   # lunes
            (date(2026, 7, 31), date(2026, 8, 3)),   # viernes
        ]:
            with self.subTest(referencia=referencia):
                self.assertEqual(semana_entrante(referencia).lunes, lunes)

    def test_la_semana_tiene_siete_dias_consecutivos(self):
        dias = semana_entrante(date(2026, 7, 26)).dias()
        self.assertEqual(len(dias), 7)
        self.assertEqual(dias[0].weekday(), 0)
        self.assertEqual(dias[-1].weekday(), 6)


class Recurrencias(unittest.TestCase):
    def _evento(self, agenda, id_evento):
        return agenda.eventos[id_evento]

    def test_semanal(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Entreno",
                    "tipo_id": "entreno",
                    "inicio": "2026-01-12T18:00:00",
                    "repeticion": "semanal",
                }
            ]
        )
        instancias = ocurrencias(
            self._evento(agenda, "ev"), date(2026, 7, 27), date(2026, 8, 2)
        )
        self.assertEqual(len(instancias), 1)
        self.assertEqual(instancias[0].inicio.date(), date(2026, 7, 27))

    def test_semanal_con_fecha_de_fin(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Entreno",
                    "tipo_id": "entreno",
                    "inicio": "2026-01-12T18:00:00",
                    "repeticion": "semanal",
                    "repeticion_hasta": "2026-06-30",
                }
            ]
        )
        self.assertEqual(
            ocurrencias(self._evento(agenda, "ev"), date(2026, 7, 27), date(2026, 8, 2)),
            [],
        )

    def test_no_hay_ocurrencias_antes_del_arranque(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Entreno",
                    "tipo_id": "entreno",
                    "inicio": "2027-01-11T18:00:00",
                    "repeticion": "semanal",
                }
            ]
        )
        self.assertEqual(
            ocurrencias(self._evento(agenda, "ev"), date(2026, 7, 27), date(2026, 8, 2)),
            [],
        )

    def test_mensual_ajusta_al_ultimo_dia_del_mes(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Revisión",
                    "tipo_id": "otro",
                    "inicio": "2026-01-31T09:00:00",
                    "repeticion": "mensual",
                }
            ]
        )
        instancias = ocurrencias(
            self._evento(agenda, "ev"), date(2026, 2, 23), date(2026, 3, 1)
        )
        self.assertEqual([i.inicio.date() for i in instancias], [date(2026, 2, 28)])

    def test_anual_traslada_el_29_de_febrero_al_1_de_marzo(self):
        """Misma regla que el despachador para las repeticiones anuales."""
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Aniversario",
                    "tipo_id": "aniversario",
                    "inicio": "2024-02-29",
                    "repeticion": "anual",
                }
            ]
        )
        instancias = ocurrencias(
            self._evento(agenda, "ev"), date(2026, 2, 23), date(2026, 3, 1)
        )
        self.assertEqual([i.inicio.date() for i in instancias], [date(2026, 3, 1)])


class Derivados(unittest.TestCase):
    def test_los_cumpleanos_se_generan_para_todo_el_registro(self):
        """Incluidas las personas sin cuenta (spec funcional §4.1)."""
        agenda = agenda_minima()
        derivados = {e.persona_origen_id: e for e in eventos_derivados(agenda)}
        self.assertIn("p-abuela", derivados)
        self.assertEqual(derivados["p-abuela"].titulo, "Cumpleaños de la abuela")
        self.assertEqual(derivados["p-abuela"].repeticion, "anual")
        self.assertFalse(derivados["p-abuela"].editable)

    def test_el_cumpleanos_aparece_en_su_semana(self):
        agenda = agenda_minima()
        semana = Semana(date(2026, 7, 27))
        titulos = {i.evento.titulo for i in instancias_de_la_semana(agenda, semana)}
        self.assertIn("Cumpleaños de la abuela", titulos)   # 30 de julio
        self.assertIn("Cumpleaños de Marta", titulos)       # 1 de agosto
        self.assertNotIn("Cumpleaños de Ana", titulos)      # 12 de mayo


class VariosDias(unittest.TestCase):
    def test_el_evento_ocupa_todas_sus_jornadas_y_marca_la_continuacion(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Torneo de hípica",
                    "tipo_id": "competicion",
                    "inicio": "2026-08-01",
                    "fin": "2026-08-02",
                    "jornada_completa": True,
                }
            ]
        )
        semana = Semana(date(2026, 7, 27))
        instancias = [
            i for i in instancias_de_la_semana(agenda, semana) if i.evento.id == "ev"
        ]
        reparto = repartir_por_dia(instancias, semana)

        sabado = [a for a in reparto[date(2026, 8, 1)] if a.evento.id == "ev"]
        domingo = [a for a in reparto[date(2026, 8, 2)] if a.evento.id == "ev"]
        self.assertEqual(len(sabado), 1)
        self.assertEqual(len(domingo), 1)
        self.assertFalse(sabado[0].continuacion)
        self.assertTrue(domingo[0].continuacion)

    def test_el_evento_que_arranco_antes_de_la_semana_sigue_apareciendo(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Viaje",
                    "tipo_id": "viaje",
                    "inicio": "2026-07-25",
                    "fin": "2026-07-28",
                    "jornada_completa": True,
                }
            ]
        )
        semana = Semana(date(2026, 7, 27))
        reparto = repartir_por_dia(
            [i for i in instancias_de_la_semana(agenda, semana) if i.evento.id == "ev"],
            semana,
        )
        self.assertEqual(len(reparto[date(2026, 7, 27)]), 1)
        self.assertTrue(reparto[date(2026, 7, 27)][0].continuacion)
        self.assertEqual(len(reparto[date(2026, 7, 29)]), 0)


class Orden(unittest.TestCase):
    def test_la_jornada_completa_precede_a_los_eventos_con_hora(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev-tarde",
                    "titulo": "Comida",
                    "tipo_id": "celebracion",
                    "inicio": "2026-07-27T14:00:00",
                },
                {
                    "id": "ev-manana",
                    "titulo": "Dentista",
                    "tipo_id": "cita_medica",
                    "inicio": "2026-07-27T10:00:00",
                },
                {
                    "id": "ev-dia",
                    "titulo": "Fiesta del pueblo",
                    "tipo_id": "celebracion",
                    "inicio": "2026-07-27",
                    "jornada_completa": True,
                },
            ]
        )
        semana = Semana(date(2026, 7, 27))
        reparto = repartir_por_dia(instancias_de_la_semana(agenda, semana), semana)
        lunes = [a.evento.id for a in reparto[date(2026, 7, 27)]]
        self.assertEqual(lunes, ["ev-dia", "ev-manana", "ev-tarde"])


if __name__ == "__main__":
    unittest.main()
