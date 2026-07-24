"""Función de visibilidad (specs/modelo-datos.md §6).

Es el elemento estructural más delicado del diseño, porque un fallo aquí no
produce un error visible: arruina una sorpresa.
"""

from __future__ import annotations

import unittest

from comun import agenda_minima

from agenda.visibilidad import (
    comentarios_visibles,
    destinatarios_de_idea,
    destinatarios_de_regalo,
    visible,
    visible_publicamente,
)


class Visibilidad(unittest.TestCase):
    def test_sin_cuenta_no_ve_nada(self):
        agenda = agenda_minima(
            ideas=[{"id": "i1", "titulo": "Libro", "autor_id": "p-ana"}]
        )
        self.assertFalse(visible(agenda, agenda.ideas["i1"], "p-abuela"))
        self.assertFalse(visible(agenda, agenda.ideas["i1"], None))
        self.assertFalse(visible(agenda, agenda.ideas["i1"], "p-inexistente"))

    def test_ocultacion_por_destinatario(self):
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Botas de montar",
                    "autor_id": "p-ana",
                    "orientaciones": [{"persona_id": "p-marta"}],
                }
            ]
        )
        idea = agenda.ideas["i1"]
        self.assertTrue(visible(agenda, idea, "p-ana"))
        self.assertTrue(visible(agenda, idea, "p-lucia"))
        self.assertFalse(visible(agenda, idea, "p-marta"))

    def test_la_ocultacion_no_exceptua_a_los_administradores(self):
        """Un regalo que Óscar registra para Ana queda oculto para ella aunque
        Ana administre la aplicación (spec funcional §3.2)."""
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Reloj",
                    "autor_id": "p-oscar",
                    "orientaciones": [{"persona_id": "p-ana"}],
                }
            ]
        )
        self.assertFalse(visible(agenda, agenda.ideas["i1"], "p-ana"))
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-oscar"))

    def test_la_ocultacion_alcanza_a_los_codestinatarios(self):
        agenda = agenda_minima(
            ocasiones=[
                {
                    "id": "oc",
                    "nombre": "Navidad",
                    "fecha": "2026-12-25",
                    "participantes": ["p-marta", "p-lucia"],
                }
            ],
            regalos=[
                {
                    "id": "rg",
                    "ocasion_id": "oc",
                    "destinatario_principal_id": "p-marta",
                    "compartido": True,
                    "codestinatarios": ["p-lucia"],
                }
            ],
        )
        regalo = agenda.regalos["rg"]
        self.assertEqual(
            destinatarios_de_regalo(agenda, regalo), {"p-marta", "p-lucia"}
        )
        self.assertFalse(visible(agenda, regalo, "p-marta"))
        self.assertFalse(visible(agenda, regalo, "p-lucia"))
        self.assertTrue(visible(agenda, regalo, "p-ana"))

    def test_destinatario_sin_cuenta_no_activa_ocultacion(self):
        """La lista de los abuelos debe poder consultarse sin restricción (§3.2)."""
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Manta",
                    "autor_id": "p-ana",
                    "orientaciones": [{"persona_id": "p-abuela"}],
                }
            ]
        )
        self.assertEqual(destinatarios_de_idea(agenda, agenda.ideas["i1"]), set())
        for observador in ("p-ana", "p-oscar", "p-marta", "p-lucia"):
            self.assertTrue(visible(agenda, agenda.ideas["i1"], observador))

    def test_las_etiquetas_no_ocultan(self):
        """Limitación conocida: la etiqueta clasifica, no protege (§5.4)."""
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Altavoz",
                    "autor_id": "p-ana",
                    "orientaciones": [{"etiqueta_id": "e-adolescente"}],
                }
            ]
        )
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-marta"))

    def test_categoria_privada_solo_para_administradores(self):
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Escapada",
                    "autor_id": "p-ana",
                    "categoria_id": "coordinacion",
                }
            ]
        )
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-ana"))
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-oscar"))
        self.assertFalse(visible(agenda, agenda.ideas["i1"], "p-marta"))

    def test_categoria_restringida_exige_acceso_explicito(self):
        agenda = agenda_minima(
            categorias=[{"id": "c-res", "nombre": "Reservada", "regla": "restringida"}],
            acceso_categoria=[{"categoria_id": "c-res", "persona_id": "p-marta"}],
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Sorpresa",
                    "autor_id": "p-ana",
                    "categoria_id": "c-res",
                }
            ],
        )
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-marta"))
        self.assertFalse(visible(agenda, agenda.ideas["i1"], "p-lucia"))
        # Ni siquiera un administrador entra sin figurar en la lista de acceso.
        self.assertFalse(visible(agenda, agenda.ideas["i1"], "p-ana"))

    def test_el_deseo_es_visible_para_su_autor(self):
        """La cláusula del deseo precede a la del destinatario: de lo contrario
        una persona dejaría de ver su lista en el instante de crearla (§6)."""
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Auriculares",
                    "autor_id": "p-marta",
                    "tipo": "deseo",
                    "orientaciones": [{"persona_id": "p-marta"}],
                }
            ]
        )
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-marta"))
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-ana"))

    def test_la_idea_orientada_a_uno_mismo_se_reclasifica_como_deseo(self):
        """De no hacerlo, la ocultación la haría desaparecer al crearla (§3.4)."""
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Auriculares",
                    "autor_id": "p-marta",
                    "orientaciones": [{"persona_id": "p-marta"}],
                }
            ]
        )
        self.assertEqual(agenda.ideas["i1"].tipo, "deseo")
        self.assertTrue(visible(agenda, agenda.ideas["i1"], "p-marta"))

    def test_los_comentarios_heredan_la_visibilidad(self):
        agenda = agenda_minima(
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Botas",
                    "autor_id": "p-ana",
                    "orientaciones": [{"persona_id": "p-marta"}],
                }
            ],
            comentarios=[
                {
                    "id": "c1",
                    "objeto_tipo": "idea",
                    "objeto_id": "i1",
                    "autor_id": "p-oscar",
                    "texto": "Talla 39",
                }
            ],
        )
        idea = agenda.ideas["i1"]
        self.assertEqual(len(comentarios_visibles(agenda, idea, "p-ana")), 1)
        self.assertEqual(comentarios_visibles(agenda, idea, "p-marta"), [])


class VistaPublica(unittest.TestCase):
    """La vista de quien no es observador del modelo (specs/plan-semanal.md §5)."""

    def test_solo_eventos_de_categoria_publica(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev-publico",
                    "titulo": "Comida con los abuelos",
                    "tipo_id": "celebracion",
                    "inicio": "2026-08-02T14:00:00",
                },
                {
                    "id": "ev-reservado",
                    "titulo": "Preparar la fiesta",
                    "tipo_id": "otro",
                    "inicio": "2026-07-31T17:00:00",
                    "categoria_id": "coordinacion",
                },
            ]
        )
        self.assertTrue(visible_publicamente(agenda, agenda.eventos["ev-publico"]))
        self.assertFalse(visible_publicamente(agenda, agenda.eventos["ev-reservado"]))

    def test_la_dimension_de_regalos_nunca_sale_al_canal(self):
        agenda = agenda_minima(
            ideas=[{"id": "i1", "titulo": "Libro", "autor_id": "p-ana"}]
        )
        self.assertFalse(visible_publicamente(agenda, agenda.ideas["i1"]))


if __name__ == "__main__":
    unittest.main()
