"""El armazón que cachea el service worker, y su versión.

Dos maneras de que un cambio en la aplicación no llegue nunca al teléfono, y
las dos son silenciosas: nadie ve un error, simplemente se sigue usando lo
viejo. Esta prueba cierra la primera; la segunda —olvidar subir `VERSION` al
tocar un módulo cacheado— la comprueba `pruebas.yml`, que sí puede mirar el
commit anterior.
"""

from __future__ import annotations

import re
import unittest

from comun import RAIZ

SW = RAIZ / "pwa" / "publico" / "sw.js"


def armazon() -> list[str]:
    texto = SW.read_text(encoding="utf-8")
    bloque = re.search(r"const ARMAZON = \[(.*?)\];", texto, re.S)
    assert bloque, "no se encuentra ARMAZON en sw.js"
    return re.findall(r"'([^']+)'", bloque.group(1))


class Armazon(unittest.TestCase):
    def test_todo_lo_que_se_cachea_existe(self):
        """`cache.addAll` es todo o nada.

        Una sola ruta que devuelva 404 —un módulo renombrado, una errata—
        rechaza la promesa entera, el service worker no llega a instalarse y
        quien ya tuviera la aplicación abierta se queda con el armazón anterior
        para siempre, sin que nada lo diga.
        """
        faltan = [
            ruta for ruta in armazon()
            if ruta != "/" and not (RAIZ / "pwa" / "publico" / ruta.lstrip("/")).exists()
        ]
        self.assertEqual(faltan, [], f"sw.js cachea rutas que no existen: {faltan}")

    def test_los_modulos_de_la_aplicacion_estan_en_el_armazon(self):
        """Lo que no se cachea no abre sin red, que es la promesa de la PWA."""
        cacheados = set(armazon())
        publico = RAIZ / "pwa" / "publico"
        sueltos = [
            f"/{modulo.relative_to(publico).as_posix()}"
            for modulo in sorted((publico / "js").rglob("*.js"))
        ]
        self.assertEqual(
            [m for m in sueltos if m not in cacheados], [],
            "hay módulos fuera de ARMAZON en sw.js",
        )


if __name__ == "__main__":
    unittest.main()
