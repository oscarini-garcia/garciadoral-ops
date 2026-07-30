"""La tabla de aeropuertos, que nombra un vuelo por sus ciudades.

No se comprueba contra el origen: OurAirports actualiza sus datos a diario, y
una prueba que los volviera a bajar fallaría el día que alguien dé de alta un
aeródromo en Alaska, sin que nadie hubiera tocado nada aquí.

Lo que sí se comprueba es que el fichero generado siga siendo coherente: que las
correcciones escritas a mano en `herramientas/aeropuertos.py` estén dentro —son
la razón de que el generador exista— y que no haya vuelto a colarse la comarca
ni la palabra «Island», que es lo que traen los datos crudos y no se dice al
nombrar un vuelo.
"""

from __future__ import annotations

import re
import unittest

from comun import RAIZ

TABLA = RAIZ / "pwa" / "publico" / "js" / "aeropuertos.js"


def tabla() -> dict[str, str]:
    texto = TABLA.read_text(encoding="utf-8")
    return dict(re.findall(r'"([A-Z]{3})": "([^"]+)"', texto))


class Aeropuertos(unittest.TestCase):
    def test_estan_los_de_casa_y_los_de_siempre(self):
        """Si estos fallan, el título de un vuelo deja de decir a dónde vas."""
        esperado = {
            "BCN": "Barcelona", "MAD": "Madrid", "CDG": "París",
            "LHR": "Londres", "JFK": "Nueva York", "FCO": "Roma",
        }
        actual = tabla()
        for codigo, ciudad in esperado.items():
            self.assertEqual(actual.get(codigo), ciudad, f"{codigo} debería ser {ciudad}")

    def test_las_correcciones_a_mano_siguen_puestas(self):
        """Los aeropuertos que no están en la ciudad que anuncian.

        Malpensa está en Ferno y el de Asturias en Ranón; nadie compra un
        billete a Ferno. Son la razón de que el generador tenga una tabla de
        correcciones, y se pierden en cuanto alguien regenera sin ella.
        """
        correcciones = {
            "MXP": "Milán", "CIA": "Roma", "LYS": "Lyon",
            "LCG": "A Coruña", "OVD": "Asturias", "ACE": "Lanzarote",
            "EAS": "San Sebastián", "VIT": "Vitoria", "LPA": "Gran Canaria",
        }
        actual = tabla()
        for codigo, ciudad in correcciones.items():
            self.assertEqual(actual.get(codigo), ciudad, f"{codigo} debería ser {ciudad}")

    def test_ninguna_ciudad_arrastra_la_comarca_ni_la_isla(self):
        """«London, Essex» y «Gran Canaria Island» son de los datos, no del habla."""
        sucias = [
            f"{codigo} → {ciudad}"
            for codigo, ciudad in tabla().items()
            if "," in ciudad or ciudad.endswith(" Island") or "(" in ciudad
        ]
        self.assertEqual(sucias, [], f"ciudades sin limpiar: {sucias[:5]}")

    def test_el_fichero_declara_que_es_generado(self):
        """Editarlo a mano se pierde en la siguiente ejecución del generador."""
        cabecera = TABLA.read_text(encoding="utf-8")[:600]
        self.assertIn("no se edita a mano", cabecera)
        self.assertIn("herramientas/aeropuertos.py", cabecera)


if __name__ == "__main__":
    unittest.main()
