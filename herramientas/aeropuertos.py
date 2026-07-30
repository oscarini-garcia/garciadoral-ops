#!/usr/bin/env python3
"""Genera la tabla de códigos de aeropuerto que la aplicación usa para nombrar un vuelo.

Un vuelo importado llega titulado por sus códigos —«CDG→BCN · AF 1248»—, y un
código no dice a dónde vas. Esta tabla los traduce a la ciudad, que es lo que se
lee en la lista de la semana.

**El fichero que escribe es generado: no se edita a mano.** Lo que sí se edita
es este script, que es donde viven las dos cosas que los datos no traen bien:
los exónimos castellanos —los datos dicen «London», y en casa se dice
«Londres»— y las correcciones de los aeropuertos cuyo municipio real no es la
ciudad que anuncian, como Malpensa, que está en Ferno y todo el mundo llama
Milán.

    python3 herramientas/aeropuertos.py            # descarga y regenera
    python3 herramientas/aeropuertos.py --csv X    # desde un CSV ya bajado
    python3 herramientas/aeropuertos.py --verificar # ¿está al día?

Fuente: OurAirports (https://ourairports.com/data/), de dominio público. Se
toman los aeropuertos con código IATA y vuelo regular, grandes y medianos: los
pequeños añaden setecientas entradas de aeródromos a los que no se vuela con
billete.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "pwa" / "publico" / "js" / "aeropuertos.js"
ORIGEN = "https://davidmegginson.github.io/ourairports-data/airports.csv"

TIPOS = {"large_airport", "medium_airport"}

#: Lo que en castellano no se dice como en los datos. Solo van las ciudades en
#: las que difiere: «Madrid» o «Berlin» no necesitan línea —la segunda porque
#: los datos ya la escriben como se escribe aquí—.
EXONIMOS = {
    "Paris": "París", "London": "Londres", "New York": "Nueva York",
    "Rome": "Roma", "Milan": "Milán", "Florence": "Florencia",
    "Venice": "Venecia", "Naples": "Nápoles", "Turin": "Turín",
    "Genoa": "Génova", "Bologna": "Bolonia", "Padua": "Padua",
    "Munich": "Múnich", "Cologne": "Colonia", "Frankfurt": "Fráncfort",
    "Nuremberg": "Núremberg", "Hanover": "Hannover",
    "Zurich": "Zúrich", "Geneva": "Ginebra", "Basel": "Basilea", "Bern": "Berna",
    "Vienna": "Viena", "Salzburg": "Salzburgo", "Graz": "Graz",
    "Copenhagen": "Copenhague", "Stockholm": "Estocolmo",
    "Gothenburg": "Gotemburgo", "Malmo": "Malmö",
    "Moscow": "Moscú", "Saint Petersburg": "San Petersburgo",
    "Warsaw": "Varsovia", "Krakow": "Cracovia", "Kraków": "Cracovia",
    "Prague": "Praga", "Bucharest": "Bucarest", "Belgrade": "Belgrado",
    "Athens": "Atenas", "Thessaloniki": "Salónica", "Istanbul": "Estambul",
    "Lisbon": "Lisboa", "Porto": "Oporto",
    "Brussels": "Bruselas", "Antwerp": "Amberes", "The Hague": "La Haya",
    "Bordeaux": "Burdeos", "Marseille": "Marsella", "Nice": "Niza",
    "Strasbourg": "Estrasburgo", "Lille": "Lille",
    "Seville": "Sevilla", "Corunna": "A Coruña",
    "Dublin": "Dublín", "Edinburgh": "Edimburgo",
    "Cairo": "El Cairo", "Algiers": "Argel", "Tunis": "Túnez",
    "Tangier": "Tánger", "Marrakesh": "Marrakech", "Fez": "Fez",
    "Jerusalem": "Jerusalén", "Damascus": "Damasco", "Baghdad": "Bagdad",
    "Tehran": "Teherán", "Riyadh": "Riad", "Dubai": "Dubái",
    "Abu Dhabi": "Abu Dabi", "Kuwait City": "Ciudad de Kuwait",
    "Mumbai": "Bombay", "New Delhi": "Nueva Delhi", "Delhi": "Nueva Delhi",
    "Kolkata": "Calcuta", "Calcutta": "Calcuta",
    "Beijing": "Pekín", "Shanghai": "Shanghái", "Nanjing": "Nankín",
    "Tokyo": "Tokio", "Kyoto": "Kioto", "Seoul": "Seúl",
    "Singapore": "Singapur", "Sydney": "Sídney",
    "Mexico City": "Ciudad de México", "Havana": "La Habana",
    "Rio de Janeiro": "Río de Janeiro", "Bogota": "Bogotá",
    "Panama City": "Ciudad de Panamá", "Guatemala City": "Ciudad de Guatemala",
    "Philadelphia": "Filadelfia", "New Orleans": "Nueva Orleans",
}

#: Aeropuertos cuyo municipio no es la ciudad que anuncian. Malpensa está en
#: Ferno y nadie compra un billete a Ferno.
CORRECCIONES = {
    # Europa
    "MXP": "Milán",      # Malpensa, municipio de Ferno
    "BGY": "Bérgamo",    # Orio al Serio
    "CIA": "Roma",       # Ciampino
    "LYS": "Lyon",       # Saint-Exupéry, municipio de Colombier-Saugnieu
    "BVA": "Beauvais",   # se anuncia como París y no lo es
    "CRL": "Charleroi",  # se anuncia como Bruselas y no lo es
    "HHN": "Fráncfort-Hahn",
    "NYO": "Estocolmo",  # Skavsta
    # España, donde el municipio no es la ciudad que se vuela
    "ACE": "Lanzarote",  # San Bartolomé
    "EAS": "San Sebastián",  # Hondarribia
    "FUE": "Fuerteventura",  # El Matorral
    "LCG": "A Coruña",   # Culleredo
    "LEN": "León",       # La Virgen del Camino
    "LEU": "La Seu d'Urgell",
    "LPA": "Gran Canaria",
    "OVD": "Asturias",   # Ranón
    "RMU": "Murcia",     # Corvera
    "SPC": "Santa Cruz de La Palma",
    "VDE": "El Hierro",
    "VIT": "Vitoria",    # Álava
    # Resto del mundo
    "NRT": "Tokio",      # Narita
    "KIX": "Osaka",      # Kansai, en una isla artificial
    "ICN": "Seúl",       # Incheon
    "PVG": "Shanghái",   # Pudong
    "EZE": "Buenos Aires",  # Ezeiza
    "GRU": "São Paulo",  # Guarulhos
}


def limpiar(municipio: str) -> str:
    """Deja el nombre de la ciudad a secas.

    Los datos traen la comarca detrás —«London, Essex»—, la provincia entre
    paréntesis —«Paris (Roissy-en-France, Val-d'Oise)»— y a veces la palabra
    «Island» pegada al final. Nada de eso se dice al nombrar un vuelo.
    """
    sin_parentesis = re.sub(r"\s*\([^)]*\)", "", municipio)
    sin_comarca = sin_parentesis.split(",")[0]
    sin_isla = re.sub(r"\s+Island$", "", sin_comarca.strip())
    return re.sub(r"\s+", " ", sin_isla).strip()


def leer_csv(texto: str) -> dict[str, str]:
    tabla: dict[str, str] = {}
    for fila in csv.DictReader(io.StringIO(texto)):
        iata = fila.get("iata_code", "").strip().upper()
        if len(iata) != 3 or not iata.isalpha():
            continue
        if fila.get("scheduled_service") != "yes" or fila["type"] not in TIPOS:
            continue
        ciudad = limpiar(fila.get("municipality", ""))
        if not ciudad:
            continue
        tabla.setdefault(iata, EXONIMOS.get(ciudad, ciudad))

    tabla.update(CORRECCIONES)
    return dict(sorted(tabla.items()))


def componer(tabla: dict[str, str]) -> str:
    """El módulo, con la tabla dentro y su procedencia escrita arriba."""
    pares = json.dumps(tabla, ensure_ascii=False, separators=(",", ": "))
    # Una entrada por línea sería un fichero de tres mil renglones; en bloques
    # se lee igual de mal y ocupa mucho menos sitio en un diff.
    cuerpo = pares[1:-1].replace('", "', '",\n  "')
    return f'''/**
 * De código de aeropuerto a ciudad. **Generado: no se edita a mano.**
 *
 * Se regenera con `python3 herramientas/aeropuertos.py`, que es también donde
 * se corrigen los nombres: los exónimos —«London» es «Londres»— y los
 * aeropuertos cuyo municipio no es la ciudad que anuncian, como Malpensa, que
 * está en Ferno y todo el mundo llama Milán.
 *
 * Son los {len(tabla)} aeropuertos con código IATA y vuelo regular, grandes y
 * medianos, de OurAirports (dominio público). Sirve para nombrar un vuelo
 * importado por sus ciudades en lugar de por sus códigos.
 */

export const AEROPUERTOS = {{
  {cuerpo}
}};

/** La ciudad de un código de aeropuerto, o `null` si no está en la tabla. */
export const ciudadDeAeropuerto = (codigo) =>
  AEROPUERTOS[String(codigo || '').trim().toUpperCase()] || null;
'''


def main() -> int:
    partes = argparse.ArgumentParser(description=__doc__)
    partes.add_argument("--csv", help="CSV de OurAirports ya descargado")
    partes.add_argument("--verificar", action="store_true",
                        help="no escribe; falla si el fichero no corresponde")
    args = partes.parse_args()

    if args.csv:
        texto = Path(args.csv).read_text(encoding="utf-8")
    else:
        with urllib.request.urlopen(ORIGEN, timeout=120) as respuesta:
            texto = respuesta.read().decode("utf-8")

    modulo = componer(leer_csv(texto))

    if args.verificar:
        if not DESTINO.exists() or DESTINO.read_text(encoding="utf-8") != modulo:
            print(f"{DESTINO.relative_to(RAIZ)} no corresponde a los datos de origen.")
            return 1
        print(f"{DESTINO.relative_to(RAIZ)} está al día.")
        return 0

    DESTINO.write_text(modulo, encoding="utf-8")
    print(f"Escrito {DESTINO.relative_to(RAIZ)} ({len(modulo) / 1024:.1f} KB).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
