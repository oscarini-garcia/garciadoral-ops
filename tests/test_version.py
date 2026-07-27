"""La versión que la aplicación enseña y la que se empaqueta, la misma.

`pwa/package.json` es la cifra de verdad: es la que `ota.yml` mira para decidir
si corta un bundle nuevo. La pantalla de Hoy la escribe abajo a la derecha, y
como aquí no hay empaquetador que la inyecte, la web lleva su copia en
`pwa/publico/js/version.js`.

Si las dos se separan, nadie ve un error: simplemente la pantalla dice una
versión que no es la instalada, que es la única pregunta que ese texto contesta.
"""

from __future__ import annotations

import json
import re
import unittest

from comun import RAIZ

PAQUETE = RAIZ / "pwa" / "package.json"
MODULO = RAIZ / "pwa" / "publico" / "js" / "version.js"


class Version(unittest.TestCase):
    def test_la_web_dice_la_version_que_se_empaqueta(self):
        empaquetada = json.loads(PAQUETE.read_text(encoding="utf-8"))["version"]

        hallado = re.search(
            r"export const VERSION_APP = '([^']+)'", MODULO.read_text(encoding="utf-8")
        )
        self.assertIsNotNone(hallado, "no se encuentra VERSION_APP en js/version.js")

        self.assertEqual(
            hallado.group(1),
            empaquetada,
            "js/version.js y pwa/package.json dicen versiones distintas: "
            "la pantalla de Hoy enseñaría una que no es la instalada.",
        )


if __name__ == "__main__":
    unittest.main()
