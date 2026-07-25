#!/usr/bin/env python3
"""Mapa del repositorio, derivado del propio código.

Existe para que quien llega —una sesión nueva, alguien que vuelve tras un mes—
sepa **dónde mirar** sin leerse la aplicación entera. Lo que hay aquí no es un
resumen escrito a mano: se extrae en cada ejecución de los ficheros reales, de
modo que no puede desfasarse. Un resumen a mano sí puede, y de hecho es lo que
ocurría: el `README` afirmaba «77 pruebas» cuando ya había más.

De cada sitio se toma lo que ese sitio ya declara:

- la primera frase del docstring de cada módulo, que sus autores ya escribieron;
- las funciones y clases públicas, leídas con `ast` en Python y por exportación
  en JavaScript;
- la tabla `RUTAS` del Worker, contrastada con la lista de rutas de su cabecera;
- el `cron` y los disparadores de cada workflow;
- las referencias a `specs/` que el código lleva en sus comentarios, que dan la
  correspondencia entre especificación e implementación sin mantener tabla;
- las variables de entorno que los scripts consultan de verdad;
- el recuento de pruebas.

Tres modos:

    python3 herramientas/mapa.py                # escribe docs/mapa.md
    python3 herramientas/mapa.py --contexto     # al arranque de sesión, a stdout
    python3 herramientas/mapa.py --verificar    # falla si docs/mapa.md no está al día

Solo biblioteca estándar, como el resto de scripts del repositorio: se ejecuta
en cada arranque de sesión y en cada empujón, y no puede depender de un
`pip install`.
"""

from __future__ import annotations

import argparse
import ast
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "docs" / "mapa.md"

# Los directorios de código, en el orden en que conviene conocerlos: primero las
# reglas compartidas, después quien las sirve, por último quien las presenta.
AREAS = [
    ("scripts/agenda", "Reglas del modelo, compartidas por el plan semanal"),
    ("scripts", "Los dos procesos programados y su transporte"),
    ("api/src", "Worker de Cloudflare: filtra antes de transmitir"),
    ("pwa/publico/js", "La aplicación"),
    ("pwa/publico/js/vistas", "Las cuatro secciones de la aplicación"),
    ("herramientas", "Utilidades de desarrollo"),
]

ANCHO_DESCRIPCION = 92
MAXIMO_SIMBOLOS = 10


# --------------------------------------------------------------------------
# Extracción


def primera_frase(texto: str, ancho: int = ANCHO_DESCRIPCION) -> str:
    """Primera oración de un docstring, en una línea y acotada a `ancho`."""
    parrafo = texto.strip().split("\n\n")[0]
    plano = " ".join(parrafo.split())
    corte = re.search(r"\.(\s|$)", plano)
    if corte:
        plano = plano[: corte.start() + 1]
    if len(plano) > ancho:
        plano = plano[:ancho].rsplit(" ", 1)[0] + "…"
    return plano


def docstring_js(fuente: str) -> str:
    """Bloque `/** … */` inicial de un módulo de JavaScript, sin los asteriscos."""
    bloque = re.match(r"\s*/\*\*(.*?)\*/", fuente, re.S)
    if not bloque:
        return ""
    lineas = [re.sub(r"^\s*\* ?", "", l).strip() for l in bloque.group(1).split("\n")]
    return "\n".join(l for l in lineas).strip()


def simbolos_python(arbol: ast.Module) -> list[str]:
    return [
        nodo.name
        for nodo in arbol.body
        if isinstance(nodo, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        and not nodo.name.startswith("_")
    ]


def simbolos_js(fuente: str) -> list[str]:
    return re.findall(
        r"^export\s+(?:async\s+)?(?:function|const|class|let)\s+([A-Za-z_$][\w$]*)",
        fuente,
        re.M,
    )


def modulos(directorio: str) -> list[tuple[str, str, list[str]]]:
    """`(nombre, descripción, símbolos)` de cada módulo del directorio, sin recursión."""
    carpeta = RAIZ / directorio
    if not carpeta.is_dir():
        return []

    salida = []
    for ruta in sorted(carpeta.iterdir()):
        if ruta.suffix not in {".py", ".js", ".mjs"} or not ruta.is_file():
            continue
        fuente = ruta.read_text(encoding="utf-8")
        if ruta.suffix == ".py":
            try:
                arbol = ast.parse(fuente)
            except SyntaxError:
                continue
            descripcion = primera_frase(ast.get_docstring(arbol) or "")
            simbolos = simbolos_python(arbol)
        else:
            descripcion = primera_frase(docstring_js(fuente))
            simbolos = simbolos_js(fuente)
        salida.append((ruta.name, descripcion, simbolos))
    return salida


def rutas_del_worker() -> tuple[list[tuple[str, str, str]], list[str]]:
    """Rutas servidas y avisos por discrepancia entre la tabla y la cabecera."""
    fuente = (RAIZ / "api" / "src" / "index.js").read_text(encoding="utf-8")

    tabla = re.search(r"const RUTAS = \[(.*?)\n\];", fuente, re.S)
    servidas = re.findall(r"\['(\w+)',\s*'([^']+)'", tabla.group(1) if tabla else "")

    documentadas = {
        camino: glosa.strip()
        for _, camino, glosa in re.findall(
            r"\*\s+(GET|POST|PUT|DELETE)\s+(\S+)\s+·\s*(.+)", fuente
        )
    }

    rutas = [(metodo, camino, documentadas.get(camino, "")) for metodo, camino in servidas]
    caminos = {camino for _, camino in servidas}
    avisos = [f"`{c}` está documentada en la cabecera pero no en `RUTAS`" for c in documentadas if c not in caminos]
    avisos += [f"`{c}` se sirve pero no está en la lista de la cabecera" for c in caminos if c not in documentadas]
    return rutas, sorted(avisos)


def workflows() -> list[tuple[str, str, list[str], list[str]]]:
    """`(nombre, propósito, crons, disparadores)` de cada workflow.

    Se analiza con expresiones regulares y no con un analizador de YAML porque
    este script corre en el arranque de cada sesión y en cada empujón, donde no
    hay más que la biblioteca estándar.
    """
    salida = []
    for ruta in sorted((RAIZ / ".github" / "workflows").glob("*.yml")):
        texto = ruta.read_text(encoding="utf-8")
        nombre = re.search(r"^name:\s*(.+)$", texto, re.M)

        comentario = re.search(r"^#(.*(?:\n#.*)*)", texto, re.M)
        proposito = ""
        if comentario:
            proposito = primera_frase(
                " ".join(l.lstrip("#").strip() for l in comentario.group(0).split("\n"))
            )

        crons = re.findall(r"cron:\s*'([^']+)'", texto)
        disparadores = [d for d in ("push", "pull_request", "workflow_dispatch") if re.search(rf"^\s+{d}:", texto, re.M)]
        salida.append((nombre.group(1).strip() if nombre else ruta.stem, proposito, crons, disparadores))
    return salida


def referencias_a_specs() -> tuple[dict[str, dict[str, set[str]]], list[str]]:
    """Qué fichero de código cita cada especificación, y con qué apartados.

    La correspondencia entre especificación e implementación no se mantiene a
    mano en ninguna tabla: se lee de las citas que el propio código lleva en sus
    comentarios. Si un módulo deja de citar su especificación, desaparece de
    aquí, que es exactamente la señal que interesa.
    """
    referencias: dict[str, dict[str, set[str]]] = {}
    patron = re.compile(r"specs/([a-z0-9-]+)\.md`?\s*((?:§[\d.]+(?:\s*[,y]\s*§?[\d.]+)*)?)")

    for base in ("scripts", "api/src", "pwa/publico/js", "herramientas", "api/test", "tests"):
        for ruta in sorted((RAIZ / base).rglob("*")):
            if ruta.suffix not in {".py", ".js", ".mjs"} or not ruta.is_file():
                continue
            relativa = str(ruta.relative_to(RAIZ))
            for documento, apartados in patron.findall(ruta.read_text(encoding="utf-8")):
                secciones = referencias.setdefault(documento, {}).setdefault(relativa, set())
                for apartado in re.findall(r"[\d.]+", apartados):
                    secciones.add(apartado.rstrip("."))

    huerfanas = sorted(
        ruta.stem
        for ruta in (RAIZ / "specs").glob("*.md")
        if ruta.stem not in referencias
    )
    return referencias, huerfanas


def variables_de_entorno() -> tuple[list[tuple[str, str]], list[str]]:
    """Las que consultan los scripts, con quién las lee, y las del Worker.

    Se da el módulo que la consulta y no su valor por defecto: los valores por
    defecto de este repositorio se encadenan (`os.environ.get(…) or CONSTANTE`)
    y extraerlos con una expresión regular daba respuestas equivocadas. Un mapa
    que miente sobre un valor por defecto es peor que uno que no lo menciona.
    """
    scripts: dict[str, str] = {}
    for base in ("scripts", "herramientas"):
        for ruta in sorted((RAIZ / base).rglob("*.py")):
            for nombre in re.findall(
                r'os\.environ\.get\(\s*"([A-Z_]+)"', ruta.read_text(encoding="utf-8")
            ):
                scripts.setdefault(nombre, str(ruta.relative_to(RAIZ)))

    worker: set[str] = set()
    for ruta in sorted((RAIZ / "api" / "src").glob("*.js")):
        worker.update(re.findall(r"env\.([A-Z_][A-Z0-9_]*)", ruta.read_text(encoding="utf-8")))

    return sorted(scripts.items()), sorted(worker)


def pruebas() -> tuple[list[tuple[str, int]], int]:
    """Recuento por fichero y total."""
    conteo = []
    for ruta in sorted((RAIZ / "tests").glob("test_*.py")):
        conteo.append((str(ruta.relative_to(RAIZ)), len(re.findall(r"^\s*def test_", ruta.read_text(encoding="utf-8"), re.M))))
    for ruta in sorted((RAIZ / "api" / "test").glob("*.test.js")):
        conteo.append((str(ruta.relative_to(RAIZ)), len(re.findall(r"^\s*test\(", ruta.read_text(encoding="utf-8"), re.M))))
    return conteo, sum(n for _, n in conteo)


def comandos() -> list[str]:
    """Lo que ejecuta la integración continua, que es la lista fiable de comandos."""
    texto = (RAIZ / ".github" / "workflows" / "pruebas.yml").read_text(encoding="utf-8")
    sueltos = re.findall(r"^\s+run:\s+(?!\|)(.+)$", texto, re.M)
    return [c.strip() for c in sueltos]


def en_curso() -> list[str]:
    """La sección «En curso» de CLAUDE.md, lo único de todo esto que se escribe a mano."""
    texto = (RAIZ / "CLAUDE.md").read_text(encoding="utf-8")
    seccion = re.search(r"^## En curso\s*\n(.*?)(?=\n## |\Z)", texto, re.S | re.M)
    return [l for l in seccion.group(1).strip().split("\n")] if seccion else []


def git(*argumentos: str) -> str:
    try:
        return subprocess.run(
            ["git", *argumentos], cwd=RAIZ, capture_output=True, text=True, timeout=10
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


# --------------------------------------------------------------------------
# Composición


def envolver(prefijo: str, palabras: list[str], ancho: int = 96) -> list[str]:
    """Reparte `palabras` en líneas, sangrando las siguientes bajo la primera."""
    if not palabras:
        return []
    lineas, actual = [], prefijo
    sangria = " " * len(prefijo)
    for palabra in palabras:
        candidata = f"{actual}{palabra} · "
        if len(candidata) > ancho and actual not in (prefijo, sangria):
            lineas.append(actual.rstrip(" ·"))
            actual = sangria
        actual += f"{palabra} · "
    lineas.append(actual.rstrip(" ·"))
    return lineas


def componer_mapa() -> str:
    lineas = [
        "# Mapa del repositorio",
        "",
        "Generado por `herramientas/mapa.py` a partir del código. **No se edita a mano:**",
        "cualquier cambio se pierde en la siguiente ejecución, y `pruebas.yml` comprueba",
        "que este fichero corresponde al código de su commit.",
        "",
        "Es el mismo texto que se inyecta al abrir una sesión de Claude Code, para no",
        "tener que recorrer la aplicación entera cada vez.",
        "",
        "## Módulos",
        "",
    ]

    vistos: set[str] = set()
    for directorio, glosa in AREAS:
        encontrados = [m for m in modulos(directorio) if f"{directorio}/{m[0]}" not in vistos]
        if not encontrados:
            continue
        lineas.append(f"### `{directorio}/` · {glosa}")
        lineas.append("")
        for nombre, descripcion, simbolos in encontrados:
            vistos.add(f"{directorio}/{nombre}")
            lineas.append(f"- **{nombre}** — {descripcion or '(sin docstring)'}")
            if simbolos:
                mostrados = simbolos[:MAXIMO_SIMBOLOS]
                sufijo = [f"…y {len(simbolos) - MAXIMO_SIMBOLOS} más"] if len(simbolos) > MAXIMO_SIMBOLOS else []
                lineas.extend(envolver("  ", mostrados + sufijo))
        lineas.append("")

    rutas, avisos = rutas_del_worker()
    lineas += ["## Rutas de la API", ""]
    for metodo, camino, glosa in rutas:
        lineas.append(f"- `{metodo:4} {camino}` — {glosa or '(sin describir en la cabecera)'}")
    for aviso in avisos:
        lineas.append(f"- ⚠️ {aviso}")
    lineas.append("")

    lineas += ["## Workflows", ""]
    for nombre, proposito, crons, disparadores in workflows():
        detalle = ", ".join([f"`{c}`" for c in crons] + disparadores)
        lineas.append(f"- **{nombre}** ({detalle})" + (f" — {proposito}" if proposito else ""))
    lineas.append("")

    referencias, huerfanas = referencias_a_specs()
    lineas += [
        "## Especificación → código",
        "",
        "Leído de las citas a `specs/` que el código lleva en sus comentarios.",
        "",
    ]
    for documento in sorted(referencias):
        lineas.append(f"- **`specs/{documento}.md`**")
        citas = []
        for fichero in sorted(referencias[documento]):
            secciones = sorted(referencias[documento][fichero], key=lambda s: [int(p) for p in s.split(".")])
            apartados = f" §{', §'.join(secciones)}" if secciones else ""
            citas.append(f"`{fichero}`{apartados}")
        lineas.extend(envolver("  ", citas))
    for documento in huerfanas:
        lineas.append(f"- ⚠️ **`specs/{documento}.md`** no lo cita ningún módulo")
    lineas.append("")

    de_scripts, de_worker = variables_de_entorno()
    lineas += ["## Variables de entorno", "", "Scripts, y quién las lee:", ""]
    for nombre, modulo in de_scripts:
        lineas.append(f"- `{nombre}` — `{modulo}`")
    lineas += ["", "Worker (`api/wrangler.toml`, `[vars]` y secretos):", ""]
    lineas.extend(envolver("", [f"`{v}`" for v in de_worker]))
    lineas.append("")

    conteo, total = pruebas()
    lineas += ["## Pruebas", "", f"**{total}** en total."]
    lineas.append("")
    for fichero, n in conteo:
        lineas.append(f"- `{fichero}` — {n}")
    lineas += ["", "Lo que ejecuta la integración continua:", "", "```bash"]
    lineas.extend(comandos())
    lineas += ["```", ""]

    return "\n".join(lineas).rstrip() + "\n"


def componer_contexto() -> str:
    """El mapa más el estado vivo del repositorio, para el arranque de sesión."""
    partes = [componer_mapa().rstrip(), "", "## Estado del repositorio", ""]

    rama = git("rev-parse", "--abbrev-ref", "HEAD")
    partes.append(f"Rama actual: `{rama or 'desconocida'}`")
    partes.append("")

    registro = git("log", "-8", "--format=- %h %s")
    if registro:
        partes += ["Últimos commits:", "", registro, ""]

    sucio = git("status", "--porcelain")
    if sucio:
        partes += ["Sin commitear:", "", "```", sucio, "```", ""]

    pendiente = en_curso()
    if pendiente:
        partes += ["## En curso", "", *pendiente, ""]

    return "\n".join(partes).rstrip() + "\n"


def main() -> int:
    analizador = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    analizador.add_argument("--contexto", action="store_true", help="imprime el mapa y el estado del repositorio")
    analizador.add_argument("--verificar", action="store_true", help="falla si docs/mapa.md no está al día")
    opciones = analizador.parse_args()

    if opciones.contexto:
        sys.stdout.write(componer_contexto())
        return 0

    mapa = componer_mapa()

    if opciones.verificar:
        actual = DESTINO.read_text(encoding="utf-8") if DESTINO.exists() else ""
        if actual == mapa:
            print("docs/mapa.md está al día.")
            return 0
        print(
            "docs/mapa.md no corresponde al código.\n"
            "Regenérelo con:  python3 herramientas/mapa.py",
            file=sys.stderr,
        )
        return 1

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_text(mapa, encoding="utf-8")
    print(f"Escrito {DESTINO.relative_to(RAIZ)} ({len(mapa.splitlines())} líneas).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
