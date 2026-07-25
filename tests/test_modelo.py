"""Reglas de integridad del modelo (specs/modelo-datos.md §4)."""

from __future__ import annotations

import json
import unittest

from comun import CATALOGOS, RAIZ, agenda_minima

from agenda.modelo import ErrorDeIntegridad, cargar_agenda


class Integridad(unittest.TestCase):
    def _falla(self, mensaje: str, **cambios):
        with self.assertRaises(ErrorDeIntegridad) as contexto:
            agenda_minima(**cambios)
        self.assertIn(mensaje, str(contexto.exception))

    def test_la_orientacion_referencia_persona_o_etiqueta_pero_no_ambas(self):
        self._falla(
            "exactamente una persona",
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Libro",
                    "autor_id": "p-ana",
                    "orientaciones": [
                        {"persona_id": "p-marta", "etiqueta_id": "e-adolescente"}
                    ],
                }
            ],
        )

    def test_la_orientacion_no_puede_quedar_vacia(self):
        self._falla(
            "exactamente una persona",
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Libro",
                    "autor_id": "p-ana",
                    "orientaciones": [{}],
                }
            ],
        )

    def test_el_deseo_solo_se_orienta_a_su_autor(self):
        self._falla(
            "un deseo solo se orienta a su propio autor",
            ideas=[
                {
                    "id": "i1",
                    "titulo": "Libro",
                    "autor_id": "p-marta",
                    "tipo": "deseo",
                    "orientaciones": [{"persona_id": "p-lucia"}],
                }
            ],
        )

    def test_una_persona_sin_cuenta_no_es_autora(self):
        self._falla(
            "el autor no tiene cuenta",
            ideas=[{"id": "i1", "titulo": "Libro", "autor_id": "p-abuela"}],
        )

    def test_los_codestinatarios_exigen_marca_de_compartido(self):
        self._falla(
            "sin marca de compartido",
            ocasiones=[
                {
                    "id": "oc",
                    "nombre": "Navidad",
                    "fecha": "2026-12-25",
                    "participantes": ["p-marta"],
                }
            ],
            regalos=[
                {
                    "id": "rg",
                    "ocasion_id": "oc",
                    "destinatario_principal_id": "p-marta",
                    "codestinatarios": ["p-lucia"],
                }
            ],
        )

    def test_el_principal_no_puede_ser_codestinatario(self):
        self._falla(
            "figura como co-destinatario",
            ocasiones=[
                {
                    "id": "oc",
                    "nombre": "Navidad",
                    "fecha": "2026-12-25",
                    "participantes": ["p-marta"],
                }
            ],
            regalos=[
                {
                    "id": "rg",
                    "ocasion_id": "oc",
                    "destinatario_principal_id": "p-marta",
                    "compartido": True,
                    "codestinatarios": ["p-marta"],
                }
            ],
        )

    def test_el_responsable_de_compra_tiene_cuenta(self):
        self._falla(
            "el responsable no tiene cuenta",
            ocasiones=[
                {
                    "id": "oc",
                    "nombre": "Navidad",
                    "fecha": "2026-12-25",
                    "participantes": ["p-marta"],
                }
            ],
            regalos=[
                {
                    "id": "rg",
                    "ocasion_id": "oc",
                    "destinatario_principal_id": "p-marta",
                    "responsable_id": "p-abuela",
                }
            ],
        )

    def test_el_presupuesto_exige_participacion_en_la_ocasion(self):
        self._falla(
            "no participa en la ocasión",
            ocasiones=[
                {
                    "id": "oc",
                    "nombre": "Navidad",
                    "fecha": "2026-12-25",
                    "participantes": ["p-marta"],
                    "presupuestos": [{"persona_id": "p-lucia", "importe": 50}],
                }
            ],
        )

    def test_un_evento_se_vincula_como_maximo_a_una_ocasion(self):
        self._falla(
            "ya está vinculado",
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Cumpleaños",
                    "tipo_id": "celebracion",
                    "inicio": "2026-08-01",
                }
            ],
            ocasiones=[
                {
                    "id": "oc1",
                    "nombre": "Primera",
                    "fecha": "2026-08-01",
                    "evento_id": "ev",
                },
                {
                    "id": "oc2",
                    "nombre": "Segunda",
                    "fecha": "2026-08-01",
                    "evento_id": "ev",
                },
            ],
        )

    def test_una_persona_sin_cuenta_no_accede_a_categorias_restringidas(self):
        self._falla(
            "no tiene cuenta",
            categorias=[{"id": "c-res", "nombre": "Reservada", "regla": "restringida"}],
            acceso_categoria=[{"categoria_id": "c-res", "persona_id": "p-abuela"}],
        )

    def test_el_emoji_debe_pertenecer_al_catalogo_acotado(self):
        """La variedad ilimitada convierte la semana en un mosaico ruidoso (§4.3)."""
        self._falla(
            "fuera del catálogo",
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Algo",
                    "tipo_id": "otro",
                    "inicio": "2026-08-01",
                    "emoji": "🦑",
                }
            ],
        )

    def test_el_evento_derivado_referencia_su_persona_de_origen(self):
        self._falla(
            "derivado sin persona de origen",
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Cumpleaños",
                    "tipo_id": "cumpleanos",
                    "inicio": "2026-08-01",
                    "origen": "derivado",
                }
            ],
        )

    def test_el_comentario_solo_referencia_idea_regalo_o_evento(self):
        self._falla(
            "tipo de objeto inválido",
            comentarios=[
                {
                    "id": "c1",
                    "objeto_tipo": "persona",
                    "objeto_id": "p-ana",
                    "autor_id": "p-ana",
                    "texto": "Hola",
                }
            ],
        )


class Derivaciones(unittest.TestCase):
    def test_el_historico_se_deriva_de_las_ocasiones_cerradas(self):
        """No existe entidad de histórico: se deriva por consulta (§2.1)."""
        agenda = agenda_minima(
            ocasiones=[
                {
                    "id": "oc-2025",
                    "nombre": "Navidad 2025",
                    "fecha": "2025-12-25",
                    "estado": "cerrada",
                    "participantes": ["p-marta"],
                },
                {
                    "id": "oc-2026",
                    "nombre": "Navidad 2026",
                    "fecha": "2026-12-25",
                    "participantes": ["p-marta"],
                },
            ],
            regalos=[
                {
                    "id": "rg-viejo",
                    "ocasion_id": "oc-2025",
                    "destinatario_principal_id": "p-marta",
                    "estado": "entregado",
                },
                {
                    "id": "rg-nuevo",
                    "ocasion_id": "oc-2026",
                    "destinatario_principal_id": "p-marta",
                },
            ],
        )
        historico = agenda.historico_de("p-marta")
        self.assertEqual([r.id for r in historico], ["rg-viejo"])

    def test_el_tipo_propone_si_el_evento_lleva_regalos(self):
        """Un entreno no debe mostrar campos que nunca se van a rellenar (§4.4)."""
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev-entreno",
                    "titulo": "Entreno",
                    "tipo_id": "entreno",
                    "inicio": "2026-08-01T18:00:00",
                },
                {
                    "id": "ev-cumple",
                    "titulo": "Cumpleaños",
                    "tipo_id": "cumpleanos",
                    "inicio": "2026-08-01",
                },
                {
                    "id": "ev-correccion",
                    "titulo": "Cumpleaños sin regalos",
                    "tipo_id": "cumpleanos",
                    "inicio": "2026-08-01",
                    "lleva_regalos": False,
                },
            ]
        )
        self.assertFalse(agenda.lleva_regalos(agenda.eventos["ev-entreno"]))
        self.assertTrue(agenda.lleva_regalos(agenda.eventos["ev-cumple"]))
        self.assertFalse(agenda.lleva_regalos(agenda.eventos["ev-correccion"]))

    def test_solo_el_origen_manual_admite_edicion_completa(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev-manual",
                    "titulo": "Comida",
                    "tipo_id": "celebracion",
                    "inicio": "2026-08-02T14:00:00",
                },
                {
                    "id": "ev-derivado",
                    "titulo": "Cumpleaños de Marta",
                    "tipo_id": "cumpleanos",
                    "inicio": "2026-08-01",
                    "origen": "derivado",
                    "persona_origen_id": "p-marta",
                },
            ]
        )
        self.assertTrue(agenda.eventos["ev-manual"].editable)
        self.assertFalse(agenda.eventos["ev-derivado"].editable)

    def test_el_emoji_del_evento_sustituye_al_del_tipo(self):
        agenda = agenda_minima(
            eventos=[
                {
                    "id": "ev",
                    "titulo": "Entreno de hípica",
                    "tipo_id": "entreno",
                    "inicio": "2026-08-01T18:00:00",
                    "emoji": "🏇",
                }
            ]
        )
        self.assertEqual(agenda.emoji_de(agenda.eventos["ev"]), "🏇")


class RegistroDeEjemplo(unittest.TestCase):
    def test_el_registro_de_ejemplo_carga_y_valida(self):
        datos = json.loads(
            (RAIZ / "datos" / "agenda.ejemplo.json").read_text(encoding="utf-8")
        )
        agenda = cargar_agenda(datos, CATALOGOS)
        self.assertIn("p-ana", agenda.personas)
        self.assertIn("ev-comida-abuelos", agenda.eventos)


if __name__ == "__main__":
    unittest.main()
