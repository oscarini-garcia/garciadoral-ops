"""Coherencia entre los ficheros de configuración del despliegue.

Los identificadores de Apple y el dominio están escritos en tres sitios que nadie
compila juntos: `api/wrangler.toml`, `pwa/publico/config.json` y
`pwa/capacitor.config.json`. Una discrepancia entre ellos no rompe ninguna
prueba funcional ni salta al desplegar; se manifiesta más tarde, en el
dispositivo, como un `invalid_client` de Apple o como un error de CORS que no
dice de dónde viene.

Estas comprobaciones son baratas y cierran esa clase entera de fallos. No miran
si los valores son *los correctos* —eso solo lo sabe Apple— sino si los tres
ficheros cuentan la misma historia.
"""

from __future__ import annotations

import json
import tomllib
import unittest

from comun import RAIZ

WRANGLER = RAIZ / "api" / "wrangler.toml"
CONFIG_PWA = RAIZ / "pwa" / "publico" / "config.json"
CONFIG_CAP = RAIZ / "pwa" / "capacitor.config.json"


def _cargar():
    with WRANGLER.open("rb") as fichero:
        variables = tomllib.load(fichero)["vars"]
    pwa = json.loads(CONFIG_PWA.read_text(encoding="utf-8"))
    capacitor = json.loads(CONFIG_CAP.read_text(encoding="utf-8"))
    return variables, pwa, capacitor


class Configuracion(unittest.TestCase):
    def setUp(self):
        self.vars, self.pwa, self.capacitor = _cargar()

    def test_el_services_id_es_el_mismo_en_la_web_y_en_el_worker(self):
        """`appleClienteWeb` es lo que la web declara como `clientId` ante Apple.

        Si el Worker no admite esa misma audiencia, todo token web se rechaza.
        """
        self.assertEqual(self.pwa["appleClienteWeb"], self.vars["APPLE_AUD_WEB"])

    def test_el_identificador_del_paquete_es_el_mismo_en_la_cascara_y_en_el_worker(self):
        """En iOS la audiencia del token es el identificador del paquete."""
        self.assertEqual(self.capacitor["appId"], self.vars["APPLE_AUD_IOS"])

    def test_el_services_id_no_coincide_con_el_app_id(self):
        """Apple no admite el mismo identificador para las dos cosas."""
        self.assertNotEqual(self.vars["APPLE_AUD_WEB"], self.vars["APPLE_AUD_IOS"])

    def test_el_origen_de_la_pwa_lo_admite_el_worker(self):
        """Sin coincidencia exacta no se emiten cabeceras CORS."""
        origenes = self.vars["ORIGENES_PERMITIDOS"].split(",")
        self.assertIn(self.pwa["redireccion"], origenes)

    def test_la_url_de_retorno_tiene_la_forma_que_apple_exige(self):
        """Debe poder copiarse tal cual al campo *Return URL* del Services ID.

        Apple compara la cadena entera: una barra final o una mayúscula sobran
        para que devuelva `invalid_client` sin más explicación.
        """
        redireccion = self.pwa["redireccion"]
        self.assertTrue(redireccion.startswith("https://"), redireccion)
        self.assertFalse(redireccion.endswith("/"), redireccion)
        self.assertEqual(redireccion, redireccion.lower(), redireccion)

    def test_los_identificadores_de_apple_son_admisibles(self):
        """Letras, dígitos, guiones y puntos; ni vacíos ni con espacios."""
        for clave in ("APPLE_AUD_WEB", "APPLE_AUD_IOS"):
            valor = self.vars[clave]
            self.assertTrue(valor, clave)
            self.assertRegex(valor, r"^[A-Za-z0-9][A-Za-z0-9.-]*$", clave)


if __name__ == "__main__":
    unittest.main()
