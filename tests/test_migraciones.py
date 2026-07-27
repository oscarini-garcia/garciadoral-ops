"""El paquete de migraciones pendientes dice lo mismo que las numeradas.

`api/migraciones/todas-las-pendientes.unavez.sql` es una copia literal de las que
quedan por aplicar, pegadas en su orden, para poder desplegar escribiendo un
nombre en lugar de marcar dos casillas y pasar cinco ficheros.

Una copia sin nadie que la vigile se separa del original en cuanto alguien
corrige una de las dos, y aquí separarse significa aplicar en la base algo
distinto de lo que dice el repositorio. De ahí esta prueba: el paquete se parte
por sus rótulos y cada trozo tiene que ser, palabra por palabra, el fichero que
dice ser.

El día que el paquete se aplique, se borra y esta prueba se va con él.
"""

import re
import sqlite3
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MIGRACIONES = RAIZ / "api" / "migraciones"
PAQUETE = MIGRACIONES / "todas-las-pendientes.unavez.sql"

#: El rótulo con el que el paquete separa un fichero del siguiente.
ROTULO = re.compile(r"^-- ═+ (\S+\.sql) ═+$", re.M)

#: Lo que ya está aplicado en la base del hogar, en su orden. Es el suelo sobre
#: el que el paquete tiene que caer bien.
YA_APLICADAS = [
    "0001_esquema.sql",
    "0002_catalogos.sql",
    "0003_solicitudes.sql",
    "0004_redaccion.sql",
    "0005_circulos.unavez.sql",
    "0006_genero.unavez.sql",
]


def _base_de_hoy():
    """Una base como la que hay en producción, con algo escrito dentro.

    D1 es SQLite, así que esto no es una imitación: es el mismo motor leyendo
    los mismos ficheros.
    """
    con = sqlite3.connect(":memory:")
    for nombre in YA_APLICADAS:
        con.executescript((MIGRACIONES / nombre).read_text(encoding="utf-8"))

    con.executescript(
        """
        INSERT INTO persona (id, nombre, tiene_cuenta, rol, circulo)
             VALUES ('p-oscar', 'Óscar', 1, 'administrador', 'familia');
        INSERT INTO idea (id, tipo, titulo, autor_id)
             VALUES ('i1', 'sugerencia', 'Botas', 'p-oscar');
        INSERT INTO comentario (id, objeto_tipo, objeto_id, autor_id, texto)
             VALUES ('c1', 'idea', 'i1', 'p-oscar', 'Talla 39');
        INSERT INTO ocasion (id, nombre, fecha, autor_id)
             VALUES ('oc1', 'Navidad', '2026-12-25', 'p-oscar');
        INSERT INTO regalo (id, ocasion_id, destinatario_principal_id, estado, autor_id)
             VALUES ('r1', 'oc1', 'p-oscar', 'envuelto', 'p-oscar');
        """
    )
    return con


@unittest.skipUnless(PAQUETE.exists(), "el paquete ya se aplicó y se borró")
class PaqueteDeMigraciones(unittest.TestCase):
    def setUp(self):
        self.texto = PAQUETE.read_text(encoding="utf-8")

    def _trozos(self):
        """Cada fichero anunciado, con el cuerpo que le sigue."""
        marcas = list(ROTULO.finditer(self.texto))
        for indice, marca in enumerate(marcas):
            desde = marca.end()
            hasta = marcas[indice + 1].start() if indice + 1 < len(marcas) else len(self.texto)
            yield marca.group(1), self.texto[desde:hasta].strip("\n")

    def test_cada_trozo_es_su_fichero_palabra_por_palabra(self):
        trozos = list(self._trozos())
        self.assertTrue(trozos, "el paquete no anuncia ninguna migración")

        for nombre, cuerpo in trozos:
            original = MIGRACIONES / nombre
            with self.subTest(migracion=nombre):
                self.assertTrue(original.exists(), f"{nombre} no existe")
                self.assertEqual(
                    cuerpo,
                    original.read_text(encoding="utf-8").strip("\n"),
                    f"{nombre} y su copia en el paquete ya no dicen lo mismo",
                )

    def test_van_en_el_orden_en_que_se_aplican(self):
        nombres = [nombre for nombre, _ in self._trozos()]
        self.assertEqual(nombres, sorted(nombres), "el paquete no va en orden de número")

    def test_termina_en_una_sentencia_y_no_en_comentarios(self):
        """Lo que quede detrás del último `;` se lo lleva `wrangler` a un aviso
        —«leftover buffer from sql.ingest»— que no avisa de nada. Lo dejó escrito
        la `0007`, y un paquete que termina explicando algo lo provocaría igual."""
        ultima = self.texto.rstrip().splitlines()[-1].strip()
        self.assertTrue(
            ultima.endswith(";"),
            f"el paquete termina en «{ultima}» y tiene que terminar en una sentencia",
        )

    def test_lo_salta_el_bucle_del_despliegue(self):
        """El bucle de `desplegar-api.yml` pasa todas las `*.sql` menos las de un
        solo uso. Sin el `.unavez` en el nombre, marcar la casilla de siempre
        reharía la tabla `comentario` en cada despliegue."""
        self.assertTrue(PAQUETE.name.endswith(".unavez.sql"))


@unittest.skipUnless(PAQUETE.exists(), "el paquete ya se aplicó y se borró")
class ElPaqueteAplicado(unittest.TestCase):
    """Lo que de verdad importa: pasarlo por una base y mirar cómo queda.

    Comprobar que el texto coincide con los originales dice que la copia es
    fiel; no dice que los originales, juntos y en ese orden, hagan lo que se
    espera. Eso solo lo contesta ejecutarlos.
    """

    def setUp(self):
        self.con = _base_de_hoy()
        self.con.executescript(PAQUETE.read_text(encoding="utf-8"))

    def tearDown(self):
        self.con.close()

    def _tablas(self):
        return {f[0] for f in self.con.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    def test_deja_puestas_las_seis_tablas_que_faltaban(self):
        self.assertLessEqual(
            {"paseo", "trato_paseo", "lugar", "apunte", "voto", "visto"},
            self._tablas(),
        )

    def test_el_comentario_pierde_su_CHECK_y_admite_un_apunte(self):
        esquema = self.con.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'comentario'"
        ).fetchone()[0]
        self.assertNotIn("CHECK", esquema)

        # Que es para lo que se rehizo la tabla: sin esto, un comentario sobre un
        # apunte lo rechaza la base y el hilo de Sitios no existe.
        self.con.executescript(
            """
            INSERT INTO lugar (id, nombre, autor_id) VALUES ('lu1', 'Bolonia', 'p-oscar');
            INSERT INTO apunte (id, lugar_id, clase, titulo, autor_id)
                 VALUES ('ap1', 'lu1', 'llevar', 'Sombrilla', 'p-oscar');
            INSERT INTO comentario (id, objeto_tipo, objeto_id, autor_id, texto)
                 VALUES ('c2', 'apunte', 'ap1', 'p-oscar', 'Allí no hay sombra');
            """
        )

    def test_no_se_lleva_por_delante_lo_que_ya_estaba(self):
        """Rehacer una tabla es copiar y tirar: lo que había tiene que seguir."""
        self.assertEqual(
            self.con.execute("SELECT texto FROM comentario WHERE id = 'c1'").fetchone()[0],
            "Talla 39",
        )

    def test_el_regalo_envuelto_pasa_a_comprado(self):
        self.assertEqual(
            self.con.execute("SELECT estado FROM regalo WHERE id = 'r1'").fetchone()[0],
            "comprado",
        )

    def test_pasarlo_dos_veces_termina_en_el_mismo_sitio(self):
        """No es una invitación a hacerlo —por eso lleva `.unavez`—, sino la red
        de debajo: si alguien lo repite por si acaso, no debe perder nada."""
        antes = self.con.execute("SELECT COUNT(*) FROM comentario").fetchone()[0]
        self.con.executescript(PAQUETE.read_text(encoding="utf-8"))
        self.assertEqual(
            self.con.execute("SELECT COUNT(*) FROM comentario").fetchone()[0], antes
        )


if __name__ == "__main__":
    unittest.main()
