# Despachador de mensajes de WhatsApp con GitHub Actions

Guía de implementación para el envío programado y desatendido de mensajes de WhatsApp a un grupo familiar, con una aplicación iOS propia como interfaz de composición.

---

## 1. Arquitectura

Tres piezas, con una separación de responsabilidades deliberada:

| Pieza | Responsabilidad |
|---|---|
| Aplicación iOS | Componer, programar y consultar. Nunca envía. |
| `queue.json` en un repositorio privado | Estado único y versionado de la cola |
| Workflow programado de GitHub Actions | Despachar los mensajes vencidos vía CallMeBot |

El teléfono queda fuera del camino crítico. Los envíos se producen con el móvil bloqueado, apagado o sin cobertura.

El flujo es deliberadamente simple: la app escribe una entrada en `queue.json` mediante la API de contenidos de GitHub; el workflow se despierta cada media hora, recorre la cola, envía lo que corresponde y devuelve el estado actualizado al repositorio con un commit.

---

## 2. Restricciones de la plataforma que condicionan el diseño

Conviene conocerlas antes de escribir nada, porque tres de ellas son causas habituales de fallo silencioso.

**Puntualidad.** No existe acuerdo de nivel de servicio sobre el momento de ejecución. Los retrasos de entre cinco y treinta minutos son habituales en periodos de carga alta. El diseño debe tolerarlo: por eso el workflow no se programa a la hora exacta del mensaje, sino que sondea periódicamente y despacha lo vencido.

**Intervalo mínimo.** Cinco minutos. Cualquier expresión más frecuente se rechaza de forma silenciosa, sin error.

**Congestión en horas redondas.** Conviene desplazar los minutos respecto de `:00` y `:30`, que concentran la mayor parte de la carga de la plataforma.

**Rama por defecto.** El disparador programado solo se evalúa desde la rama por defecto. Un workflow en una rama secundaria no se ejecuta jamás.

**Activación inicial.** En repositorios nuevos la programación puede no activarse hasta la primera ejecución manual. De ahí que el workflow incluya `workflow_dispatch`: conviene lanzarlo una vez a mano tras el alta.

**Desactivación por inactividad.** GitHub deshabilita los workflows programados tras sesenta días sin commits en la rama por defecto, y solo los commits reinician el contador. En este diseño el problema se resuelve por sí solo: cada despacho escribe el estado de vuelta al repositorio. Si prevé periodos largos sin ningún envío, añada la tarea de mantenimiento de la sección 9.

---

## 3. Consumo y elección de cadencia

El plan gratuito incluye 2.000 minutos de Actions al mes para repositorios privados, y **cada ejecución factura un mínimo de un minuto**. Para un volumen de un mensaje semanal el consumo es irrelevante, de modo que la cadencia se elige por diseño y no por coste:

| Cadencia | Ejecuciones/mes | Minutos aprox. | Veredicto |
|---|---|---|---|
| Cada 30 min | 1.440 | 1.440 | Innecesario a este volumen |
| **Diaria** | **~30** | **~30** | **Recomendada** |
| Semanal fija | ~4 | ~4 | Ata el envío a un día concreto |

Un repositorio público dispone de minutos ilimitados, pero expondría `queue.json` públicamente. No procede, y a este volumen tampoco hace falta.

**Por qué diaria y no semanal.** Un `cron` semanal obligaría a que todos los mensajes salieran el mismo día de la semana. Un sondeo diario desacopla el calendario del disparador: usted programa el mensaje para el día que quiera y sale esa mañana, sin tocar el workflow. El coste de esa flexibilidad es de unos treinta minutos mensuales sobre una cuota de dos mil.

La precisión resultante es «la mañana del día correcto», suficiente para una comunicación familiar semanal.

---

## 4. Estructura del repositorio

```
family-notify/
├── .github/
│   └── workflows/
│       └── despachador.yml
├── scripts/
│   └── despachar.py
└── queue.json
```

---

## 5. Formato de la cola

`queue.json` es un array. Las marcas temporales se escriben en hora local sin desplazamiento; el script las interpreta en `Europe/Madrid` y resuelve el horario de verano automáticamente.

El campo `to` acepta una lista, de modo que un mismo texto se reparte entre los cuatro destinatarios en una única entrada.

```json
[
  {
    "id": "3F2A9C1E",
    "to": ["maria", "papa", "carlos", "ana"],
    "text": "Resumen de la semana y planes del fin de semana",
    "send_at": "2026-07-27T09:00:00",
    "repeat": "ninguna",
    "status": "pendiente"
  },
  {
    "id": "B41D77A0",
    "to": ["papa"],
    "text": "Felicidades",
    "send_at": "2026-09-14T08:30:00",
    "repeat": "anual",
    "status": "pendiente"
  }
]
```

Campos: `repeat` admite `ninguna`, `diaria`, `semanal` o `anual`. `status` evoluciona entre `pendiente`, `enviado`, `caducado` y `error`, y lo gestiona exclusivamente el script.

El script registra en `entregados` los destinatarios ya atendidos. Si un envío falla a mitad del reparto, el reintento del día siguiente solo cubre a quienes quedaron pendientes: nadie recibe el mensaje por duplicado.

---

## 6. Secretos

Un único secreto de repositorio, `RECIPIENTS_JSON`, con el mapa de destinatarios. Se configura en Settings → Secrets and variables → Actions.

```json
{
  "maria":  { "phone": "+34600111222", "apikey": "123456" },
  "papa":   { "phone": "+34600333444", "apikey": "789012" },
  "carlos": { "phone": "+34600555666", "apikey": "345678" }
}
```

Cada `apikey` es la que CallMeBot devuelve a ese destinatario tras enviar el mensaje de autorización al bot. Los números de teléfono nunca residen en el repositorio.

---

## 7. El workflow

`.github/workflows/despachador.yml`

```yaml
name: despachador

on:
  schedule:
    - cron: '7 7 * * *'   # 07:07 UTC a diario; minuto desplazado de :00 a propósito
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: despachador
  cancel-in-progress: false

jobs:
  despachar:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - name: Despachar mensajes vencidos
        env:
          RECIPIENTS_JSON: ${{ secrets.RECIPIENTS_JSON }}
        run: python3 scripts/despachar.py

      - name: Persistir el estado de la cola
        if: always()
        run: |
          if [[ -n "$(git status --porcelain queue.json)" ]]; then
            git config user.name  "despachador"
            git config user.email "actions@users.noreply.github.com"
            git add queue.json
            git commit -m "chore: actualiza el estado de la cola"
            git pull --rebase --autostash
            git push
          fi
```

El bloque `concurrency` evita que dos ejecuciones solapadas envíen el mismo mensaje por duplicado. El `git pull --rebase` previo al push resuelve la colisión cuando la aplicación iOS ha escrito en la cola entre medias.

---

## 8. El script

`scripts/despachar.py`. Solo biblioteca estándar: sin `pip install`, sin dependencias que mantener y con ejecuciones de pocos segundos.

```python
#!/usr/bin/env python3
"""Despacha los mensajes vencidos de queue.json a través de CallMeBot."""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

QUEUE = Path("queue.json")
LOCAL = ZoneInfo("Europe/Madrid")
ENDPOINT = "https://api.callmebot.com/whatsapp.php"
GRACIA = timedelta(hours=36)     # cubre un sondeo diario fallido sin caducar el mensaje
MAX_INTENTOS = 3


def parsear(marca: str) -> datetime:
    """Interpreta una marca temporal; si es naive, se asume hora local."""
    dt = datetime.fromisoformat(marca)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LOCAL)
    return dt.astimezone(timezone.utc)


def cargar_destinatarios() -> dict:
    crudo = os.environ.get("RECIPIENTS_JSON", "").strip()
    if not crudo:
        sys.exit("Falta el secreto RECIPIENTS_JSON")
    return json.loads(crudo)


def enviar(destinatario: dict, texto: str) -> None:
    params = urllib.parse.urlencode({
        "phone": destinatario["phone"],
        "text": texto,
        "apikey": destinatario["apikey"],
    })
    peticion = urllib.request.Request(
        f"{ENDPOINT}?{params}",
        headers={"User-Agent": "family-notify/1.0"},
    )
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        if respuesta.status != 200:
            raise RuntimeError(f"CallMeBot respondió {respuesta.status}")


def siguiente(momento: datetime, repeticion: str) -> datetime | None:
    if repeticion == "diaria":
        return momento + timedelta(days=1)
    if repeticion == "semanal":
        return momento + timedelta(weeks=1)
    if repeticion == "anual":
        try:
            return momento.replace(year=momento.year + 1)
        except ValueError:                       # 29 de febrero
            return momento.replace(year=momento.year + 1, month=3, day=1)
    return None


def main() -> int:
    if not QUEUE.exists():
        print("No hay cola que procesar.")
        return 0

    cola = json.loads(QUEUE.read_text(encoding="utf-8"))
    destinatarios = cargar_destinatarios()
    ahora = datetime.now(timezone.utc)
    modificada = False
    fallos = 0

    for item in cola:
        if item.get("status") != "pendiente":
            continue

        cuando = parsear(item["send_at"])
        if cuando > ahora:
            continue

        if ahora - cuando > GRACIA:
            item["status"] = "caducado"
            modificada = True
            print(f"[caducado] {item['id']}")
            continue

        destino = item["to"]
        claves = destino if isinstance(destino, list) else [destino]

        desconocidos = [c for c in claves if c not in destinatarios]
        if desconocidos:
            item["status"] = "error"
            item["error"] = f"destinatarios desconocidos: {', '.join(desconocidos)}"
            modificada = True
            fallos += 1
            continue

        entregados = set(item.get("entregados", []))
        incidencias = []

        for clave in claves:
            if clave in entregados:
                continue
            try:
                enviar(destinatarios[clave], item["text"])
            except Exception as exc:
                incidencias.append(f"{clave}: {exc}")
                print(f"[fallo] {item['id']} -> {clave}: {exc}")
                continue
            entregados.add(clave)
            print(f"[enviado] {item['id']} -> {clave}")

        if incidencias:
            item["entregados"] = sorted(entregados)
            item["intentos"] = item.get("intentos", 0) + 1
            if item["intentos"] >= MAX_INTENTOS:
                item["status"] = "error"
                item["error"] = "; ".join(incidencias)
            modificada = True
            fallos += 1
            continue

        item.pop("entregados", None)
        item.pop("intentos", None)
        proximo = siguiente(cuando, item.get("repeat", "ninguna"))
        if proximo:
            item["send_at"] = proximo.astimezone(LOCAL).replace(tzinfo=None).isoformat()
            item["intentos"] = 0
        else:
            item["status"] = "enviado"
            item["sent_at"] = ahora.isoformat()
        modificada = True

    if modificada:
        QUEUE.write_text(
            json.dumps(cola, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Notas de diseño relevantes:

- La ventana de gracia de treinta y seis horas está dimensionada para el sondeo diario: cubre una ejecución perdida sin que un mensaje de la semana pasada acabe llegando fuera de contexto.
- El reparto es idempotente por destinatario. Si el tercero de los cuatro envíos falla, al día siguiente solo se reintenta con ese y con el cuarto.
- Los reintentos se agotan a los tres fallos consecutivos, tras lo cual la entrada pasa a `error` con la causa registrada. El commit posterior deja constancia en el historial.
- Los mensajes recurrentes se reprograman en hora local, de modo que una notificación diaria a las 08:00 sigue llegando a las 08:00 tras el cambio de horario.

---

## 9. Mantenimiento contra la desactivación por inactividad

Solo es necesario si prevé más de sesenta días sin ningún envío. Añada un segundo workflow mensual que produzca un commit trivial en la rama por defecto:

```yaml
name: mantenimiento

on:
  schedule:
    - cron: '13 4 1 * *'   # el día 1 de cada mes
  workflow_dispatch:

permissions:
  contents: write

jobs:
  latido:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          date -u +%FT%TZ > .github/latido
          git config user.name  "mantenimiento"
          git config user.email "actions@users.noreply.github.com"
          git add .github/latido
          git commit -m "chore: latido de actividad"
          git push
```

---

## 10. Escritura desde la aplicación iOS

La aplicación escribe `queue.json` mediante la API de contenidos de GitHub.

**Credencial.** Un token de acceso personal de alcance restringido (*fine-grained*), limitado exclusivamente a este repositorio y con permiso de *Contents: Read and write*. Consérvelo en el Llavero, nunca en `UserDefaults` ni en el binario.

**Operación.** Es una lectura seguida de una escritura condicionada:

1. `GET /repos/{owner}/{repo}/contents/queue.json` devuelve el contenido en base64 y, lo importante, el `sha` del blob.
2. Decodifique, modifique el array y vuelva a codificar.
3. `PUT` sobre el mismo endpoint con el nuevo contenido, el `message` del commit y el `sha` obtenido en el paso 1.

**Punto crítico de concurrencia.** El workflow también escribe en `queue.json`. El `sha` debe releerse inmediatamente antes de cada escritura: si está obsoleto, GitHub responde `409 Conflict`. Trate esa respuesta releyendo y reintentando, no como un error terminal. Es el mismo patrón de bloqueo optimista de cualquier control de versiones.

Esbozo de la escritura:

```swift
struct ContenidoGitHub: Decodable {
    let content: String
    let sha: String
}

func actualizarCola(_ mutacion: ([Mensaje]) -> [Mensaje]) async throws {
    let url = URL(string: "https://api.github.com/repos/\(owner)/\(repo)/contents/queue.json")!

    var peticion = URLRequest(url: url)
    peticion.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    peticion.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")

    let (datos, _) = try await URLSession.shared.data(for: peticion)
    let actual = try JSONDecoder().decode(ContenidoGitHub.self, from: datos)

    let limpio = actual.content.replacingOccurrences(of: "\n", with: "")
    let cola = try JSONDecoder().decode([Mensaje].self, from: Data(base64Encoded: limpio)!)

    let nueva = try JSONEncoder().encode(mutacion(cola))

    var escritura = peticion
    escritura.httpMethod = "PUT"
    escritura.setValue("application/json", forHTTPHeaderField: "Content-Type")
    escritura.httpBody = try JSONSerialization.data(withJSONObject: [
        "message": "feat: actualiza la cola desde iOS",
        "content": nueva.base64EncodedString(),
        "sha": actual.sha,
    ])

    let (_, respuesta) = try await URLSession.shared.data(for: escritura)
    if (respuesta as? HTTPURLResponse)?.statusCode == 409 {
        throw ErrorCola.conflicto      // releer y reintentar
    }
}
```

---

## 11. Puesta en marcha

1. Cree el repositorio privado con la estructura de la sección 4 y `queue.json` inicializado a `[]`.
2. Cada destinatario activa su clave de CallMeBot enviando al bot el mensaje de autorización.
3. Registre el secreto `RECIPIENTS_JSON`.
4. Confirme que el workflow está en la rama por defecto.
5. **Lance el workflow manualmente una vez** desde la pestaña Actions. Sin este paso la programación puede no activarse.
6. Encole un mensaje de prueba con `send_at` a diez minutos vista y verifique la ejecución.
7. Genere el token restringido y configure la aplicación iOS.

---

## 12. Operación y diagnóstico

| Síntoma | Causa habitual |
|---|---|
| Nada se ejecuta jamás | El workflow no está en la rama por defecto, o falta la primera ejecución manual |
| Dejó de ejecutarse sin cambios | Desactivación por sesenta días de inactividad. Reactive desde Actions y añada el mantenimiento |
| Se ejecuta con retraso | Congestión de la plataforma. Es el comportamiento esperado |
| El push falla | Escritura concurrente desde la app. El `git pull --rebase` lo cubre |
| El mensaje no llega | Revise la traza de la ejecución. CallMeBot no garantiza nivel de servicio |

El historial de commits de `queue.json` constituye la auditoría completa: qué se envió, cuándo y con qué resultado, sin necesidad de instrumentación adicional.

---

## Limitaciones asumidas

- Precisión de «la mañana del día programado», no al minuto. Adecuada para una comunicación semanal; insuficiente si algún mensaje llegara a ser sensible a la hora.
- CallMeBot es un servicio gratuito de un tercero, sin compromiso de disponibilidad y de uso estrictamente personal.
- Los mensajes llegan desde el número del bot, no desde el suyo.
- Si en algún momento necesita entrega puntual y garantizada, el sustituto natural es un Cron Trigger de Cloudflare Workers, que conserva íntegramente este diseño y solo reemplaza el disparador.
