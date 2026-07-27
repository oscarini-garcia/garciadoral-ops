#!/usr/bin/env python3
"""Entidades y reglas de integridad de la Agenda Familiar.

Corresponde a los apartados 2 y 4 de `specs/modelo-datos.md`. El módulo
Anecdotario no se modela: su especificación funcional está diferida
(`specs/especificacion.md` §7).

Convenciones que impone la especificación y que aquí se respetan:

- Los identificadores se generan en el dispositivo, de modo que el modelo los
  acepta tal cual y nunca los reasigna (§1).
- No hay borrado físico: las entidades llevan un indicador de actividad (§1).
- Las marcas temporales de los eventos son locales e ingenuas (sin desplazamiento
  horario). La zona `Europe/Madrid` se aplica al despachar, igual que en
  `specs/despachador.md` §5.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, replace
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator

from .lio import IDS_TURNO, cuadro_normalizado

REGLAS_VISIBILIDAD = ("publica", "restringida", "privada")
ROLES = ("administrador", "miembro")
CIRCULOS = ("familia", "extendida", "amigos")
#: Solo existe para nombrar bien: elegir entre «mamá» y «papá» cuando el
#: parentesco escrito no lo dice. Admite ausencia.
GENEROS = ("f", "m")
#: Cuántos caben en el círculo «familia». Es el hogar, no un grupo que crece.
TAMANO_FAMILIA = 4
TIPOS_IDEA = ("sugerencia", "deseo")
ESTADOS_IDEA = ("activa", "en_curso", "cerrada", "descartada")
#: Tres, desde que se retiró «envuelto»: nadie lo marcaba, y su única
#: consecuencia era una opción más en un desplegable que pregunta si algo está
#: comprado o no. Lo que estuviera envuelto se convirtió en comprado
#: (api/migraciones/0007_estado_regalo.sql).
ESTADOS_REGALO = ("pendiente", "comprado", "entregado")
ESTADOS_OCASION = ("abierta", "cerrada")
ORIGENES_EVENTO = ("manual", "derivado", "importado")
REPETICIONES = ("ninguna", "semanal", "mensual", "anual")
TIPOS_COMENTARIO = ("idea", "regalo", "evento")

EMOJI_POR_DEFECTO = "📌"


class ErrorDeIntegridad(ValueError):
    """Se ha violado alguna de las reglas del apartado 4 del modelo de datos."""


# --------------------------------------------------------------------------- #
# Entidades
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Persona:
    """Registro único de quien participa en un evento o recibe un regalo (§2.1)."""

    id: str
    nombre: str
    apellidos: str = ""
    fecha_nacimiento: date | None = None
    parentesco: str = ""
    tiene_cuenta: bool = False
    identificador_apple: str | None = None
    rol: str | None = None
    #: Vínculo, que es lo que ordena la pantalla de personas. Tener cuenta es
    #: otra cosa y va por su lado: la abuela no tiene y es de la familia.
    circulo: str = "extendida"
    #: Solo para nombrar bien; puede no estar (specs/ux.md §7.1).
    genero: str | None = None
    activa: bool = True

    @property
    def es_administrador(self) -> bool:
        return self.tiene_cuenta and self.rol == "administrador"

    @property
    def iniciales(self) -> str:
        partes = [p for p in (self.nombre, self.apellidos) if p]
        return "".join(p[0].upper() for p in " ".join(partes).split()[:2])


@dataclass(frozen=True)
class AtributoPersona:
    """Par de clave y valor de creación libre sobre una persona (§2.1)."""

    persona_id: str
    clave: str
    valor: str


@dataclass(frozen=True)
class Categoria:
    """Clasificación con regla de visibilidad (§2.2)."""

    id: str
    nombre: str
    regla: str = "publica"
    orden: int = 0


@dataclass(frozen=True)
class Etiqueta:
    """Descriptor libre del «para quién». No identifica a nadie (§2.2)."""

    id: str
    nombre: str
    activa: bool = True


@dataclass(frozen=True)
class OrientacionIdea:
    """Fila del «para quién»: o una persona o una etiqueta, nunca ambas (§2.3)."""

    idea_id: str
    persona_id: str | None = None
    etiqueta_id: str | None = None


@dataclass(frozen=True)
class Idea:
    """Unidad del banco permanente. El deseo es un valor de `tipo` (§2.3)."""

    id: str
    titulo: str
    autor_id: str
    tipo: str = "sugerencia"
    descripcion: str = ""
    categoria_id: str | None = None
    precio_min: float | None = None
    precio_max: float | None = None
    enlace: str = ""
    establecimiento: str = ""
    estado: str = "activa"
    fecha_creacion: datetime | None = None
    fecha_modificacion: datetime | None = None
    activa: bool = True


@dataclass(frozen=True)
class TipoEvento:
    """Catálogo configurable de tipos, con emoji y propuesta de regalos (§2.4)."""

    id: str
    nombre: str
    emoji: str = EMOJI_POR_DEFECTO
    lleva_regalos: bool = False


@dataclass(frozen=True)
class ParticipanteEvento:
    """Relación evento–persona. El protagonista fija el filtro del selector (§2.4)."""

    persona_id: str
    rol: str = "asistente"  # protagonista | asistente


@dataclass(frozen=True)
class Evento:
    """Evento de la agenda (§2.4).

    `inicio` y `fin` son marcas locales ingenuas. En los eventos de jornada
    completa la hora carece de significado y no se imprime.
    """

    id: str
    titulo: str
    tipo_id: str
    inicio: datetime
    fin: datetime | None = None
    jornada_completa: bool = False
    emoji: str | None = None
    ubicacion: str = ""
    notas: str = ""
    repeticion: str = "ninguna"
    repeticion_hasta: date | None = None
    lleva_regalos: bool | None = None
    categoria_id: str | None = None
    origen: str = "manual"
    persona_origen_id: str | None = None
    calendario_id: str | None = None
    participantes: tuple[ParticipanteEvento, ...] = ()
    activo: bool = True

    @property
    def editable(self) -> bool:
        """Solo el origen manual admite edición completa (spec funcional §4.2)."""
        return self.origen == "manual"

    @property
    def protagonistas(self) -> tuple[str, ...]:
        return tuple(p.persona_id for p in self.participantes if p.rol == "protagonista")


@dataclass(frozen=True)
class CalendarioExterno:
    """Fuente importada, con el tipo de evento que se asigna a lo que llegue (§2.4)."""

    id: str
    nombre: str
    identificador_fuente: str
    tipo_evento_id: str
    ultima_sincronizacion: datetime | None = None


@dataclass(frozen=True)
class Ocasion:
    """Campaña de regalos con fecha. El vínculo con el evento reside aquí (§2.5)."""

    id: str
    nombre: str
    fecha: date
    estado: str = "abierta"
    evento_id: str | None = None
    participantes: tuple[str, ...] = ()
    activa: bool = True


@dataclass(frozen=True)
class PresupuestoPersona:
    """Importe previsto por persona dentro de una ocasión (§2.5)."""

    ocasion_id: str
    persona_id: str
    importe: float


@dataclass(frozen=True)
class Regalo:
    """Decisión de compra dentro de una ocasión (§2.5)."""

    id: str
    ocasion_id: str
    destinatario_principal_id: str
    idea_id: str | None = None
    compartido: bool = False
    codestinatarios: tuple[str, ...] = ()
    responsable_id: str | None = None
    coste_real: float | None = None
    estado: str = "pendiente"
    categoria_id: str | None = None
    activo: bool = True


@dataclass(frozen=True)
class Paseo:
    """Un turno de Lio que ya no se deriva del cuadro.

    Existe cuando alguien marcó que lo sacó o cuando se acordó un cambio para
    ese día. Desde entonces manda sobre el cuadro semanal, que es lo que hace
    que cambiar el reparto no reescriba el pasado.
    """

    id: str
    fecha: date
    turno: str
    asignado_id: str | None = None
    hecho_por_id: str | None = None
    hecho_en: datetime | None = None
    activo: bool = True


@dataclass(frozen=True)
class Comentario:
    """Lista plana sobre idea, regalo o evento (§2.3)."""

    id: str
    objeto_tipo: str
    objeto_id: str
    autor_id: str
    texto: str
    fecha: datetime | None = None
    activo: bool = True


# --------------------------------------------------------------------------- #
# Contenedor
# --------------------------------------------------------------------------- #


@dataclass
class Agenda:
    """Registro canónico completo, indexado por identificador."""

    personas: dict[str, Persona] = field(default_factory=dict)
    atributos: list[AtributoPersona] = field(default_factory=list)
    categorias: dict[str, Categoria] = field(default_factory=dict)
    acceso_categoria: dict[str, set[str]] = field(default_factory=dict)
    etiquetas: dict[str, Etiqueta] = field(default_factory=dict)
    tipos_evento: dict[str, TipoEvento] = field(default_factory=dict)
    eventos: dict[str, Evento] = field(default_factory=dict)
    calendarios: dict[str, CalendarioExterno] = field(default_factory=dict)
    ideas: dict[str, Idea] = field(default_factory=dict)
    orientaciones: list[OrientacionIdea] = field(default_factory=list)
    ocasiones: dict[str, Ocasion] = field(default_factory=dict)
    presupuestos: list[PresupuestoPersona] = field(default_factory=list)
    regalos: dict[str, Regalo] = field(default_factory=dict)
    comentarios: list[Comentario] = field(default_factory=list)
    emojis_permitidos: tuple[str, ...] = ()
    #: Lio: el cuadro semanal —catorce casillas, el lunes en 0— y las
    #: excepciones ya escritas, indexadas por su identificador compuesto.
    cuadro_lio: dict[str, list[str | None]] = field(
        default_factory=lambda: {turno: [None] * 7 for turno in IDS_TURNO}
    )
    paseos: dict[str, Paseo] = field(default_factory=dict)

    # -- consultas ---------------------------------------------------------- #

    def persona(self, persona_id: str | None) -> Persona | None:
        return self.personas.get(persona_id) if persona_id else None

    def categoria(self, categoria_id: str | None) -> Categoria | None:
        return self.categorias.get(categoria_id) if categoria_id else None

    def tiene_acceso(self, categoria_id: str, persona_id: str) -> bool:
        return persona_id in self.acceso_categoria.get(categoria_id, set())

    def orientaciones_de(self, idea_id: str) -> list[OrientacionIdea]:
        return [o for o in self.orientaciones if o.idea_id == idea_id]

    def emoji_de(self, evento: Evento) -> str:
        if evento.emoji:
            return evento.emoji
        tipo = self.tipos_evento.get(evento.tipo_id)
        return tipo.emoji if tipo else EMOJI_POR_DEFECTO

    def lleva_regalos(self, evento: Evento) -> bool:
        """Valor propuesto por el tipo, salvo que el evento lo haya fijado (§4.4)."""
        if evento.lleva_regalos is not None:
            return evento.lleva_regalos
        tipo = self.tipos_evento.get(evento.tipo_id)
        return bool(tipo and tipo.lleva_regalos)

    def eventos_activos(self) -> Iterator[Evento]:
        return (e for e in self.eventos.values() if e.activo)

    def personas_con_cuenta(self) -> Iterator[Persona]:
        return (p for p in self.personas.values() if p.tiene_cuenta and p.activa)

    def historico_de(self, persona_id: str) -> list[Regalo]:
        """Histórico derivado por consulta, nunca almacenado (spec funcional §6.5)."""
        cerradas = {o.id for o in self.ocasiones.values() if o.estado == "cerrada"}
        return [
            r
            for r in self.regalos.values()
            if r.activo
            and r.ocasion_id in cerradas
            and (
                r.destinatario_principal_id == persona_id
                or persona_id in r.codestinatarios
            )
        ]


# --------------------------------------------------------------------------- #
# Carga
# --------------------------------------------------------------------------- #


def _fecha(valor: Any) -> date | None:
    if valor in (None, ""):
        return None
    if isinstance(valor, date) and not isinstance(valor, datetime):
        return valor
    return date.fromisoformat(str(valor)[:10])


def _momento(valor: Any) -> datetime | None:
    if valor in (None, ""):
        return None
    if isinstance(valor, datetime):
        return valor
    texto = str(valor)
    if len(texto) == 10:  # solo fecha: jornada completa
        return datetime.combine(date.fromisoformat(texto), datetime.min.time())
    return datetime.fromisoformat(texto)


def cargar_catalogos(ruta: str | Path) -> dict[str, Any]:
    """Lee `datos/catalogos.json`: tipos de evento, categorías y emojis acotados."""
    return json.loads(Path(ruta).read_text(encoding="utf-8"))


def cargar_agenda(datos: dict[str, Any], catalogos: dict[str, Any] | None = None) -> Agenda:
    """Construye una `Agenda` validada a partir de su representación JSON.

    Los catálogos —tipos de evento, categorías y emojis permitidos— pueden venir
    en el propio documento o en `catalogos.json`; lo segundo es lo habitual,
    porque son contenido versionado y sin datos personales.
    """
    catalogos = catalogos or {}
    agenda = Agenda()

    for bruto in catalogos.get("tipos_evento", []) + datos.get("tipos_evento", []):
        agenda.tipos_evento[bruto["id"]] = TipoEvento(
            id=bruto["id"],
            nombre=bruto["nombre"],
            emoji=bruto.get("emoji", EMOJI_POR_DEFECTO),
            lleva_regalos=bool(bruto.get("lleva_regalos", False)),
        )

    for bruto in catalogos.get("categorias", []) + datos.get("categorias", []):
        agenda.categorias[bruto["id"]] = Categoria(
            id=bruto["id"],
            nombre=bruto["nombre"],
            regla=bruto.get("regla", "publica"),
            orden=int(bruto.get("orden", 0)),
        )

    agenda.emojis_permitidos = tuple(
        catalogos.get("emojis_permitidos", []) or datos.get("emojis_permitidos", [])
    )

    for bruto in datos.get("personas", []):
        agenda.personas[bruto["id"]] = Persona(
            id=bruto["id"],
            nombre=bruto["nombre"],
            apellidos=bruto.get("apellidos", ""),
            fecha_nacimiento=_fecha(bruto.get("fecha_nacimiento")),
            parentesco=bruto.get("parentesco", ""),
            tiene_cuenta=bool(bruto.get("tiene_cuenta", False)),
            identificador_apple=bruto.get("identificador_apple"),
            rol=bruto.get("rol"),
            circulo=bruto.get("circulo", "extendida"),
            genero=bruto.get("genero"),
            activa=bool(bruto.get("activa", True)),
        )

    for bruto in datos.get("atributos_persona", []):
        agenda.atributos.append(
            AtributoPersona(bruto["persona_id"], bruto["clave"], bruto["valor"])
        )

    for bruto in datos.get("acceso_categoria", []):
        agenda.acceso_categoria.setdefault(bruto["categoria_id"], set()).add(
            bruto["persona_id"]
        )

    for bruto in datos.get("etiquetas", []):
        agenda.etiquetas[bruto["id"]] = Etiqueta(
            id=bruto["id"],
            nombre=bruto["nombre"],
            activa=bool(bruto.get("activa", True)),
        )

    for bruto in datos.get("calendarios_externos", []):
        agenda.calendarios[bruto["id"]] = CalendarioExterno(
            id=bruto["id"],
            nombre=bruto["nombre"],
            identificador_fuente=bruto.get("identificador_fuente", ""),
            tipo_evento_id=bruto["tipo_evento_id"],
            ultima_sincronizacion=_momento(bruto.get("ultima_sincronizacion")),
        )

    for bruto in datos.get("eventos", []):
        inicio = _momento(bruto["inicio"])
        assert inicio is not None
        agenda.eventos[bruto["id"]] = Evento(
            id=bruto["id"],
            titulo=bruto["titulo"],
            tipo_id=bruto["tipo_id"],
            inicio=inicio,
            fin=_momento(bruto.get("fin")),
            jornada_completa=bool(bruto.get("jornada_completa", len(str(bruto["inicio"])) == 10)),
            emoji=bruto.get("emoji"),
            ubicacion=bruto.get("ubicacion", ""),
            notas=bruto.get("notas", ""),
            repeticion=bruto.get("repeticion", "ninguna"),
            repeticion_hasta=_fecha(bruto.get("repeticion_hasta")),
            lleva_regalos=bruto.get("lleva_regalos"),
            categoria_id=bruto.get("categoria_id"),
            origen=bruto.get("origen", "manual"),
            persona_origen_id=bruto.get("persona_origen_id"),
            calendario_id=bruto.get("calendario_id"),
            participantes=tuple(
                ParticipanteEvento(p["persona_id"], p.get("rol", "asistente"))
                for p in bruto.get("participantes", [])
            ),
            activo=bool(bruto.get("activo", True)),
        )

    for bruto in datos.get("ideas", []):
        agenda.ideas[bruto["id"]] = Idea(
            id=bruto["id"],
            titulo=bruto["titulo"],
            autor_id=bruto["autor_id"],
            tipo=bruto.get("tipo", "sugerencia"),
            descripcion=bruto.get("descripcion", ""),
            categoria_id=bruto.get("categoria_id"),
            precio_min=bruto.get("precio_min"),
            precio_max=bruto.get("precio_max"),
            enlace=bruto.get("enlace", ""),
            establecimiento=bruto.get("establecimiento", ""),
            estado=bruto.get("estado", "activa"),
            fecha_creacion=_momento(bruto.get("fecha_creacion")),
            fecha_modificacion=_momento(bruto.get("fecha_modificacion")),
            activa=bool(bruto.get("activa", True)),
        )
        for orientacion in bruto.get("orientaciones", []):
            agenda.orientaciones.append(
                OrientacionIdea(
                    idea_id=bruto["id"],
                    persona_id=orientacion.get("persona_id"),
                    etiqueta_id=orientacion.get("etiqueta_id"),
                )
            )

    for bruto in datos.get("orientaciones_idea", []):
        agenda.orientaciones.append(
            OrientacionIdea(
                idea_id=bruto["idea_id"],
                persona_id=bruto.get("persona_id"),
                etiqueta_id=bruto.get("etiqueta_id"),
            )
        )

    for bruto in datos.get("ocasiones", []):
        agenda.ocasiones[bruto["id"]] = Ocasion(
            id=bruto["id"],
            nombre=bruto["nombre"],
            fecha=_fecha(bruto["fecha"]),  # type: ignore[arg-type]
            estado=bruto.get("estado", "abierta"),
            evento_id=bruto.get("evento_id"),
            participantes=tuple(bruto.get("participantes", [])),
            activa=bool(bruto.get("activa", True)),
        )
        for presupuesto in bruto.get("presupuestos", []):
            agenda.presupuestos.append(
                PresupuestoPersona(
                    ocasion_id=bruto["id"],
                    persona_id=presupuesto["persona_id"],
                    importe=float(presupuesto["importe"]),
                )
            )

    for bruto in datos.get("regalos", []):
        agenda.regalos[bruto["id"]] = Regalo(
            id=bruto["id"],
            ocasion_id=bruto["ocasion_id"],
            destinatario_principal_id=bruto["destinatario_principal_id"],
            idea_id=bruto.get("idea_id"),
            compartido=bool(bruto.get("compartido", False)),
            codestinatarios=tuple(bruto.get("codestinatarios", [])),
            responsable_id=bruto.get("responsable_id"),
            coste_real=bruto.get("coste_real"),
            estado=bruto.get("estado", "pendiente"),
            categoria_id=bruto.get("categoria_id"),
            activo=bool(bruto.get("activo", True)),
        )

    for bruto in datos.get("comentarios", []):
        agenda.comentarios.append(
            Comentario(
                id=bruto["id"],
                objeto_tipo=bruto["objeto_tipo"],
                objeto_id=bruto["objeto_id"],
                autor_id=bruto["autor_id"],
                texto=bruto["texto"],
                fecha=_momento(bruto.get("fecha")),
                activo=bool(bruto.get("activo", True)),
            )
        )

    agenda.cuadro_lio = cuadro_normalizado(datos.get("lio_cuadro"))
    for bruto in datos.get("paseos", []):
        if not bool(bruto.get("activo", True)):
            continue
        fecha = _fecha(bruto["fecha"])
        assert fecha is not None
        agenda.paseos[bruto["id"]] = Paseo(
            id=bruto["id"],
            fecha=fecha,
            turno=bruto["turno"],
            asignado_id=bruto.get("asignado_id"),
            hecho_por_id=bruto.get("hecho_por_id"),
            hecho_en=_momento(bruto.get("hecho_en")),
            activo=True,
        )

    _normalizar(agenda)
    problemas = validar(agenda)
    if problemas:
        raise ErrorDeIntegridad("\n".join(problemas))
    return agenda


def _normalizar(agenda: Agenda) -> None:
    """Reclasifica como deseo la idea orientada únicamente a su autor (§4).

    «Si un usuario introduce una idea orientada solo a sí mismo, el sistema la
    reclasifica como deseo al guardarla». Sin esta regla la ocultación por
    destinatario haría desaparecer la idea en el instante de crearla
    (spec funcional §3.4).
    """
    for idea in list(agenda.ideas.values()):
        if idea.tipo == "deseo":
            continue
        orientaciones = agenda.orientaciones_de(idea.id)
        if not orientaciones:
            continue
        personas = {o.persona_id for o in orientaciones if o.persona_id}
        etiquetas = {o.etiqueta_id for o in orientaciones if o.etiqueta_id}
        if not etiquetas and personas == {idea.autor_id}:
            agenda.ideas[idea.id] = replace(idea, tipo="deseo")


# --------------------------------------------------------------------------- #
# Reglas de integridad (specs/modelo-datos.md §4)
# --------------------------------------------------------------------------- #


def validar(agenda: Agenda) -> list[str]:
    """Devuelve la lista de infracciones. Vacía si el registro es consistente."""
    problemas: list[str] = []

    for persona in agenda.personas.values():
        if persona.tiene_cuenta and persona.rol not in ROLES:
            problemas.append(f"persona {persona.id}: rol inválido «{persona.rol}»")
        if not persona.tiene_cuenta and persona.rol is not None:
            problemas.append(f"persona {persona.id}: sin cuenta pero con rol asignado")
        if persona.circulo not in CIRCULOS:
            problemas.append(f"persona {persona.id}: círculo inválido «{persona.circulo}»")
        if persona.genero is not None and persona.genero not in GENEROS:
            problemas.append(f"persona {persona.id}: género inválido «{persona.genero}»")

    # «Familia» es el hogar y son cuatro. La pantalla lo sostiene no ofreciendo
    # por dónde añadir; esto es la red debajo, para lo que entre por la API o
    # por una edición a mano del registro (specs/ux.md §7.1).
    de_casa = [p for p in agenda.personas.values() if p.circulo == "familia" and p.activa]
    if len(de_casa) > TAMANO_FAMILIA:
        nombres = ", ".join(sorted(p.nombre for p in de_casa))
        problemas.append(
            f"círculo familia: {len(de_casa)} personas y caben {TAMANO_FAMILIA} ({nombres})"
        )

    for categoria in agenda.categorias.values():
        if categoria.regla not in REGLAS_VISIBILIDAD:
            problemas.append(f"categoría {categoria.id}: regla inválida «{categoria.regla}»")

    # Una persona sin cuenta no figura en las listas de acceso a categorías.
    for categoria_id, personas in agenda.acceso_categoria.items():
        if categoria_id not in agenda.categorias:
            problemas.append(f"acceso a categoría inexistente {categoria_id}")
        for persona_id in personas:
            persona = agenda.persona(persona_id)
            if persona is None:
                problemas.append(f"acceso de persona inexistente {persona_id}")
            elif not persona.tiene_cuenta:
                problemas.append(
                    f"acceso a {categoria_id}: {persona_id} no tiene cuenta"
                )

    for evento in agenda.eventos.values():
        if evento.tipo_id not in agenda.tipos_evento:
            problemas.append(f"evento {evento.id}: tipo desconocido «{evento.tipo_id}»")
        if evento.repeticion not in REPETICIONES:
            problemas.append(f"evento {evento.id}: repetición inválida «{evento.repeticion}»")
        if evento.origen not in ORIGENES_EVENTO:
            problemas.append(f"evento {evento.id}: origen inválido «{evento.origen}»")
        if evento.origen == "derivado" and not evento.persona_origen_id:
            problemas.append(f"evento {evento.id}: derivado sin persona de origen")
        if evento.origen == "importado" and not evento.calendario_id:
            problemas.append(f"evento {evento.id}: importado sin calendario de origen")
        if evento.categoria_id and evento.categoria_id not in agenda.categorias:
            problemas.append(f"evento {evento.id}: categoría desconocida")
        if evento.fin and evento.fin < evento.inicio:
            problemas.append(f"evento {evento.id}: fin anterior al inicio")
        if (
            evento.emoji
            and agenda.emojis_permitidos
            and evento.emoji not in agenda.emojis_permitidos
        ):
            # La selección de emojis es acotada a propósito (spec funcional §4.3).
            problemas.append(f"evento {evento.id}: emoji «{evento.emoji}» fuera del catálogo")
        for participante in evento.participantes:
            if participante.persona_id not in agenda.personas:
                problemas.append(
                    f"evento {evento.id}: participante inexistente {participante.persona_id}"
                )

    for idea in agenda.ideas.values():
        if idea.tipo not in TIPOS_IDEA:
            problemas.append(f"idea {idea.id}: tipo inválido «{idea.tipo}»")
        if idea.estado not in ESTADOS_IDEA:
            problemas.append(f"idea {idea.id}: estado inválido «{idea.estado}»")
        autor = agenda.persona(idea.autor_id)
        if autor is None:
            problemas.append(f"idea {idea.id}: autor inexistente")
        elif not autor.tiene_cuenta:
            problemas.append(f"idea {idea.id}: el autor no tiene cuenta")
        if idea.tipo == "deseo":
            personas = {
                o.persona_id for o in agenda.orientaciones_de(idea.id) if o.persona_id
            }
            etiquetas = [o for o in agenda.orientaciones_de(idea.id) if o.etiqueta_id]
            if etiquetas or personas - {idea.autor_id}:
                problemas.append(
                    f"idea {idea.id}: un deseo solo se orienta a su propio autor"
                )

    for orientacion in agenda.orientaciones:
        tiene_persona = orientacion.persona_id is not None
        tiene_etiqueta = orientacion.etiqueta_id is not None
        if tiene_persona == tiene_etiqueta:
            problemas.append(
                f"orientación de {orientacion.idea_id}: debe referenciar "
                "exactamente una persona o exactamente una etiqueta"
            )
        if tiene_persona and orientacion.persona_id not in agenda.personas:
            problemas.append(f"orientación de {orientacion.idea_id}: persona inexistente")
        if tiene_etiqueta and orientacion.etiqueta_id not in agenda.etiquetas:
            problemas.append(f"orientación de {orientacion.idea_id}: etiqueta inexistente")

    eventos_vinculados: dict[str, str] = {}
    for ocasion in agenda.ocasiones.values():
        if ocasion.estado not in ESTADOS_OCASION:
            problemas.append(f"ocasión {ocasion.id}: estado inválido «{ocasion.estado}»")
        if ocasion.evento_id:
            if ocasion.evento_id not in agenda.eventos:
                problemas.append(f"ocasión {ocasion.id}: evento vinculado inexistente")
            if ocasion.evento_id in eventos_vinculados:
                problemas.append(
                    f"ocasión {ocasion.id}: el evento {ocasion.evento_id} ya está "
                    f"vinculado a {eventos_vinculados[ocasion.evento_id]}"
                )
            eventos_vinculados[ocasion.evento_id] = ocasion.id
        for persona_id in ocasion.participantes:
            if persona_id not in agenda.personas:
                problemas.append(f"ocasión {ocasion.id}: participante inexistente")

    for presupuesto in agenda.presupuestos:
        ocasion = agenda.ocasiones.get(presupuesto.ocasion_id)
        if ocasion is None:
            problemas.append("presupuesto sobre ocasión inexistente")
        elif presupuesto.persona_id not in ocasion.participantes:
            problemas.append(
                f"presupuesto de {presupuesto.persona_id}: no participa en "
                f"la ocasión {presupuesto.ocasion_id}"
            )

    for regalo in agenda.regalos.values():
        if regalo.estado not in ESTADOS_REGALO:
            problemas.append(f"regalo {regalo.id}: estado inválido «{regalo.estado}»")
        if regalo.ocasion_id not in agenda.ocasiones:
            problemas.append(f"regalo {regalo.id}: ocasión inexistente")
        if regalo.destinatario_principal_id not in agenda.personas:
            problemas.append(f"regalo {regalo.id}: destinatario principal inexistente")
        if regalo.codestinatarios and not regalo.compartido:
            problemas.append(
                f"regalo {regalo.id}: hay co-destinatarios sin marca de compartido"
            )
        if regalo.destinatario_principal_id in regalo.codestinatarios:
            problemas.append(
                f"regalo {regalo.id}: el destinatario principal figura como co-destinatario"
            )
        responsable = agenda.persona(regalo.responsable_id)
        if regalo.responsable_id and responsable is None:
            problemas.append(f"regalo {regalo.id}: responsable inexistente")
        elif responsable is not None and not responsable.tiene_cuenta:
            problemas.append(f"regalo {regalo.id}: el responsable no tiene cuenta")
        if regalo.idea_id and regalo.idea_id not in agenda.ideas:
            problemas.append(f"regalo {regalo.id}: idea de origen inexistente")

    for comentario in agenda.comentarios:
        if comentario.objeto_tipo not in TIPOS_COMENTARIO:
            problemas.append(
                f"comentario {comentario.id}: tipo de objeto inválido "
                f"«{comentario.objeto_tipo}»"
            )
        else:
            indice = {
                "idea": agenda.ideas,
                "regalo": agenda.regalos,
                "evento": agenda.eventos,
            }[comentario.objeto_tipo]
            if comentario.objeto_id not in indice:
                problemas.append(f"comentario {comentario.id}: objeto inexistente")
        autor = agenda.persona(comentario.autor_id)
        if autor is None or not autor.tiene_cuenta:
            problemas.append(f"comentario {comentario.id}: autor sin cuenta o inexistente")

    # A Lio lo saca quien vive en casa, tanto en el cuadro como en las filas ya
    # escritas. La pantalla no ofrece a nadie más; esto es la red de debajo,
    # igual que con el tamaño del círculo.
    def _de_casa(persona_id: str | None, donde: str) -> None:
        if persona_id is None:
            return
        persona = agenda.persona(persona_id)
        if persona is None:
            problemas.append(f"{donde}: persona inexistente «{persona_id}»")
        elif persona.circulo != "familia":
            problemas.append(f"{donde}: {persona.nombre} no está en el círculo de casa")

    for turno, fila in agenda.cuadro_lio.items():
        if turno not in IDS_TURNO:
            problemas.append(f"cuadro de Lio: turno inválido «{turno}»")
        for dia, persona_id in enumerate(fila):
            _de_casa(persona_id, f"cuadro de Lio ({turno}, día {dia})")

    for paseo in agenda.paseos.values():
        if paseo.turno not in IDS_TURNO:
            problemas.append(f"paseo {paseo.id}: turno inválido «{paseo.turno}»")
        _de_casa(paseo.asignado_id, f"paseo {paseo.id}")
        _de_casa(paseo.hecho_por_id, f"paseo {paseo.id}")

    return problemas
