"""Los plugins en el plan de los domingos: lo que se deriva, lo que se empareja
y hasta quién llega cada cosa.

Es el espejo de `pwa/test/plugins.test.js`: el plan y la aplicación leen el
mismo registro y tienen que contar la misma semana. Lo que se comprueba es lo
que no se ve mirando el texto: que una actividad de martes y jueves salga los
dos días; que el día en que se dijo «no hay» no salga; que el santo se derive
de la ficha; que una ausencia sea una banda y pase el turno a quien cubre; y
que a la abuela no se le cuente la hípica mientras el plugin no se abra.
"""

from __future__ import annotations

import unittest
from datetime import date

from comun import agenda_minima

from agenda.lio import turno_de
from agenda.mensaje import formatear_evento
from agenda.plugins import circulo_admite, plugin_de_evento, se_recibe
from agenda.semana import (
    Aparicion,
    Semana,
    dias_semanales_de,
    eventos_derivados,
    instancias_de_la_semana,
    ocurrencias,
    repartir_por_dia,
)

LUNES = date(2026, 9, 14)

CASA = [
    {"id": "p-ana", "nombre": "Ana", "tiene_cuenta": True, "rol": "administrador", "circulo": "familia", "santo": "07-26"},
    {"id": "p-oscar", "nombre": "Óscar", "tiene_cuenta": True, "rol": "administrador", "circulo": "familia"},
    {"id": "p-marta", "nombre": "Marta", "tiene_cuenta": True, "rol": "miembro", "circulo": "familia"},
    {"id": "p-lucia", "nombre": "Lucía", "tiene_cuenta": True, "rol": "miembro", "circulo": "familia"},
    {"id": "p-abuela", "nombre": "la abuela", "tiene_cuenta": False, "circulo": "extendida"},
]

HIPICA = {
    "id": "h",
    "titulo": "Hípica",
    "tipo_id": "entreno",
    "inicio": "2026-09-15T18:00:00",
    "fin": "2026-09-15T19:30:00",
    "repeticion": "semanal",
    "plugin_id": "extraescolar",
    "extra": {"dias": [1, 3], "reparto": {"1": {"lleva": "p-ana", "recoge": "p-oscar"}}},
    "participantes": [{"persona_id": "p-marta", "rol": "protagonista"}],
}


def _fechas(instancias, evento_id):
    return sorted(i.inicio.date().isoformat() for i in instancias if i.evento.id == evento_id)


class Actividades(unittest.TestCase):
    def test_martes_y_jueves_salen_los_dos_dias_de_cada_semana(self):
        agenda = agenda_minima(personas=CASA, eventos=[HIPICA])
        evento = agenda.eventos["h"]
        self.assertEqual(dias_semanales_de(evento), [1, 3])
        instancias = ocurrencias(evento, LUNES, date(2026, 9, 27))
        self.assertEqual(
            [i.inicio.date().isoformat() for i in instancias],
            ["2026-09-15", "2026-09-17", "2026-09-22", "2026-09-24"],
        )
        # La hora es la de la actividad, y la duración también.
        self.assertEqual(instancias[0].inicio.hour, 18)
        self.assertEqual((instancias[0].fin - instancias[0].inicio).seconds, 90 * 60)

    def test_el_extra_llega_como_texto_desde_la_base(self):
        bruto = dict(HIPICA, extra='{"dias": [0, 4]}')
        agenda = agenda_minima(personas=CASA, eventos=[bruto])
        self.assertEqual(dias_semanales_de(agenda.eventos["h"]), [0, 4])

    def test_el_dia_en_que_no_hay_no_sale(self):
        agenda = agenda_minima(
            personas=CASA,
            eventos=[HIPICA],
            dias_evento=[{"id": "dia:h:2026-09-17", "evento_id": "h", "fecha": "2026-09-17", "cancelado": True}],
        )
        semana = Semana(LUNES)
        self.assertEqual(_fechas(instancias_de_la_semana(agenda, semana), "h"), ["2026-09-15"])

    def test_la_linea_dice_quien_lleva_y_quien_recoge(self):
        agenda = agenda_minima(
            personas=CASA,
            eventos=[HIPICA],
            dias_evento=[{"id": "dia:h:2026-09-22", "evento_id": "h", "fecha": "2026-09-22", "lleva_id": "p-lucia"}],
        )
        instancias = instancias_de_la_semana(agenda, Semana(LUNES))
        martes = next(i for i in instancias if i.evento.id == "h" and i.inicio.date() == date(2026, 9, 15))
        self.assertIn("(lleva Ana, recoge", formatear_evento(agenda, Aparicion(martes, martes.inicio.date()), 0))
        # El jueves no tiene reparto escrito: no se inventa nadie.
        jueves = next(i for i in instancias if i.evento.id == "h" and i.inicio.date() == date(2026, 9, 17))
        self.assertNotIn("lleva", formatear_evento(agenda, Aparicion(jueves, jueves.inicio.date()), 0))
        # Y el día suelto manda sobre el cuadro de la actividad.
        siguiente = instancias_de_la_semana(agenda, Semana(date(2026, 9, 21)))
        martes_22 = next(i for i in siguiente if i.evento.id == "h" and i.inicio.date() == date(2026, 9, 22))
        self.assertIn("(lleva Lucía, recoge", formatear_evento(agenda, Aparicion(martes_22, martes_22.inicio.date()), 0))


class Derivados(unittest.TestCase):
    def test_el_santo_sale_de_la_ficha_como_el_cumpleanos(self):
        agenda = agenda_minima(personas=CASA)
        santo = next(e for e in eventos_derivados(agenda) if e.id == "derivado:santo:p-ana")
        self.assertEqual(santo.titulo, "Santo de Ana")
        self.assertEqual(
            [i.inicio.date() for i in ocurrencias(santo, date(2026, 7, 20), date(2026, 7, 31))],
            [date(2026, 7, 26)],
        )

    def test_el_plugin_apaga_los_santos(self):
        agenda = agenda_minima(personas=CASA, plugins={"cumples": {"santos": False}})
        self.assertFalse(any(e.id.startswith("derivado:santo:") for e in eventos_derivados(agenda)))

    def test_una_ausencia_es_una_banda_y_pasa_el_turno(self):
        agenda = agenda_minima(
            personas=CASA,
            ausencias=[{"id": "au1", "persona_id": "p-marta", "desde": "2026-09-15", "hasta": "2026-09-17", "cubre_id": "p-oscar"}],
            lio_cuadro={"manana": ["p-marta"] * 7, "noche": [None] * 7},
        )
        banda = next(e for e in eventos_derivados(agenda) if e.id == "derivado:ausencia:au1")
        self.assertEqual(banda.titulo, "Marta fuera")
        reparto = repartir_por_dia(instancias_de_la_semana(agenda, Semana(LUNES)), Semana(LUNES))
        self.assertEqual([a.evento.titulo for a in reparto[date(2026, 9, 16)]], ["Marta fuera"])
        self.assertTrue(reparto[date(2026, 9, 16)][0].continuacion)
        self.assertEqual(reparto[date(2026, 9, 18)], [])

        self.assertEqual(turno_de(agenda, date(2026, 9, 16), "manana").asignado_id, "p-oscar")
        self.assertEqual(turno_de(agenda, date(2026, 9, 18), "manana").asignado_id, "p-marta")


class Circulos(unittest.TestCase):
    def test_cada_evento_sabe_de_que_plugin_es(self):
        agenda = agenda_minima(personas=CASA, eventos=[HIPICA])
        self.assertEqual(plugin_de_evento(agenda.eventos["h"]), "extraescolares")
        santo = next(e for e in eventos_derivados(agenda) if e.id.startswith("derivado:santo:"))
        self.assertEqual(plugin_de_evento(santo), "cumples")

    def test_el_circulo_del_plugin_corta_a_quien_no_llega(self):
        self.assertTrue(circulo_admite("familia", "familia"))
        self.assertFalse(circulo_admite("familia", "extendida"))
        self.assertTrue(circulo_admite("amigos", "amigos"))
        agenda = agenda_minima(personas=CASA, eventos=[HIPICA])
        hipica = agenda.eventos["h"]
        self.assertTrue(se_recibe(agenda.plugins, hipica, "familia"))
        self.assertFalse(se_recibe(agenda.plugins, hipica, "extendida"))
        abierto = {"extraescolares": {"circulo": "amigos"}}
        self.assertTrue(se_recibe(abierto, hipica, "extendida"))


if __name__ == "__main__":
    unittest.main()


class HorarioYOtro(unittest.TestCase):
    def test_cada_dia_a_su_hora(self):
        con_horario = dict(HIPICA, extra={"dias": [1, 3], "horario": {"1": {"desde": "17:00", "hasta": "18:30"}, "3": {"desde": "18:00", "hasta": "19:30"}}})
        agenda = agenda_minima(personas=CASA, eventos=[con_horario])
        instancias = ocurrencias(agenda.eventos["h"], LUNES, date(2026, 9, 20))
        self.assertEqual([(i.inicio.hour, (i.fin - i.inicio).seconds // 60) for i in instancias], [(17, 90), (18, 90)])

    def test_otro_lleva_y_se_escribe_con_su_nombre(self):
        agenda = agenda_minima(
            personas=CASA,
            eventos=[HIPICA],
            dias_evento=[{"id": "dia:h:2026-09-15", "evento_id": "h", "fecha": "2026-09-15", "lleva_otro": "la abuela"}],
        )
        instancias = instancias_de_la_semana(agenda, Semana(LUNES))
        martes = next(i for i in instancias if i.evento.id == "h" and i.inicio.date() == date(2026, 9, 15))
        self.assertIn("(lleva la abuela", formatear_evento(agenda, Aparicion(martes, martes.inicio.date()), 0))
        self.assertEqual(agenda.dia_de_evento("h", date(2026, 9, 15)).quien("lleva"), "otro:la abuela")
