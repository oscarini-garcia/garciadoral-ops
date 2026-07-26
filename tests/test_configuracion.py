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

    def test_la_url_de_retorno_es_la_misma_en_la_web_y_en_el_worker(self):
        """El canje del código de autorización la vuelve a exigir.

        Al darse de baja, el Worker presenta esta URL ante Apple para canjear el
        código y poder revocar el vínculo. Apple la compara entera con la que se
        usó al firmar; si las dos copias divergen, la baja funciona —el vínculo
        se deshace aquí— pero la revocación falla en silencio, que es justo la
        mitad de la directriz 5.1.1(v) que nadie ve fallar.
        """
        self.assertEqual(self.pwa["redireccion"], self.vars["REDIRECCION_WEB"])

    def test_no_quedan_marcadores_de_ejemplo(self):
        """Un bundle con marcadores dejaría los teléfonos apuntando a una API
        inexistente, y el OTA se aplica solo. El workflow `ota` también lo
        comprueba, pero allí ya es tarde: falla después de mergear.
        """
        self.assertNotIn("EJEMPLO", CONFIG_PWA.read_text(encoding="utf-8"))

    def test_los_identificadores_de_apple_son_admisibles(self):
        """Letras, dígitos, guiones y puntos; ni vacíos ni con espacios."""
        for clave in ("APPLE_AUD_WEB", "APPLE_AUD_IOS"):
            valor = self.vars[clave]
            self.assertTrue(valor, clave)
            self.assertRegex(valor, r"^[A-Za-z0-9][A-Za-z0-9.-]*$", clave)

    def test_el_identificador_del_paquete_lo_admite_capacitor(self):
        """Apple admite guiones en un Bundle ID; Capacitor no.

        Su CLI valida el `appId` con las reglas comunes a iOS y Android —forma de
        paquete Java, sin guiones— aunque el proyecto solo tenga iOS, y rechaza
        `cap add`, `cap sync` y `cap copy` por igual. Como el Bundle ID no se
        puede renombrar en Apple una vez creado, descubrirlo tarde obliga a
        registrar otro identificador.
        """
        self.assertRegex(
            self.capacitor["appId"],
            r"^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$",
            self.capacitor["appId"],
        )


class PaginasDeLaFicha(unittest.TestCase):
    """Las dos páginas que la ficha de la App Store enlaza.

    App Store Connect exige una URL de política de privacidad y una de soporte, y
    las comprueba: si alguna devuelve 404 el envío se rechaza sin llegar a
    revisarse. Son ficheros estáticos que nadie visita durante el desarrollo, de
    modo que renombrarlos o moverlos no rompe nada visible hasta el peor momento.
    """

    PAGINAS = ("privacidad.html", "soporte.html")

    def test_las_paginas_enlazadas_desde_la_ficha_existen(self):
        for nombre in self.PAGINAS:
            with self.subTest(nombre):
                self.assertTrue((RAIZ / "pwa" / "publico" / nombre).is_file(), nombre)

    def test_las_paginas_estan_en_utf8_y_lo_declaran(self):
        """Los acentos deben llegar al navegador como los escribimos."""
        for nombre in self.PAGINAS:
            with self.subTest(nombre):
                texto = (RAIZ / "pwa" / "publico" / nombre).read_text(encoding="utf-8")
                self.assertIn('<meta charset="utf-8">', texto)

    def test_la_privacidad_explica_como_eliminar_la_cuenta(self):
        """La directriz 5.1.1(v) exige que se pueda eliminar la cuenta desde la
        aplicación, y la revisión busca dónde se dice. Aquí solo se comprueba que
        el documento no se ha quedado sin esa parte.
        """
        texto = (RAIZ / "pwa" / "publico" / "privacidad.html").read_text(encoding="utf-8")
        self.assertIn("Eliminar mi cuenta", texto)

    def test_la_privacidad_explica_como_retirar_una_solicitud(self):
        """La misma directriz aplica antes de tener cuenta.

        Desde que se guarda el correo de quien pide entrar hay datos personales
        de por medio, aunque esa persona nunca llegue a ser del hogar, y tiene
        que poder borrarlos desde la propia aplicación.
        """
        texto = (RAIZ / "pwa" / "publico" / "privacidad.html").read_text(encoding="utf-8")
        self.assertIn("Retirar mi solicitud", texto)


if __name__ == "__main__":
    unittest.main()
