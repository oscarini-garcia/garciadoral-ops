#!/usr/bin/env python3
"""Función de visibilidad de la Agenda Familiar.

Transcribe el apartado 6 de `specs/modelo-datos.md`. Es la pieza central del
modelo: toda consulta del sistema la atraviesa, incluidos los contadores, los
sumatorios y la generación del plan semanal.

    visible(elemento, observador):
        si observador.tiene_cuenta = falso        -> falso
        si elemento.tipo = deseo y autor = obs.   -> verdadero
        si categoría privada y obs. no admin.     -> falso
        si categoría restringida y obs. sin acceso-> falso
        si obs. ∈ destinatarios(elemento)          -> falso
        verdadero

El orden importa: la cláusula del deseo precede a la del destinatario, porque de
lo contrario una persona dejaría de ver su propia lista de deseos en el instante
de crearla.
"""

from __future__ import annotations

from .modelo import Agenda, Evento, Idea, Persona, Regalo


def destinatarios_de_idea(agenda: Agenda, idea: Idea) -> set[str]:
    """Personas **con cuenta** que figuran en la orientación. Las etiquetas se ignoran.

    Es la limitación conocida de la especificación funcional §5.4: una etiqueta
    clasifica, no protege.
    """
    destinatarios = set()
    for orientacion in agenda.orientaciones_de(idea.id):
        persona = agenda.persona(orientacion.persona_id)
        if persona is not None and persona.tiene_cuenta:
            destinatarios.add(persona.id)
    return destinatarios


def destinatarios_de_regalo(agenda: Agenda, regalo: Regalo) -> set[str]:
    """Destinatario principal más todos los co-destinatarios (§6).

    La ocultación alcanza a todos ellos: un regalo conjunto para dos hermanas
    figura en la lista de una y queda oculto para ambas.
    """
    del agenda  # la relación es local al propio regalo
    return {regalo.destinatario_principal_id, *regalo.codestinatarios}


def destinatarios_de_evento(agenda: Agenda, evento: Evento) -> set[str]:
    """Un evento no se oculta por destinatario.

    Los eventos son públicos por defecto (spec funcional §4.1) y la reserva se
    expresa asignándoles una categoría restringida o privada, no marcando a una
    persona. Un cumpleaños no es un secreto: lo que se oculta es la dimensión de
    regalos, que reside en la ocasión vinculada.
    """
    del agenda, evento
    return set()


def _destinatarios(agenda: Agenda, elemento: object) -> set[str]:
    if isinstance(elemento, Idea):
        return destinatarios_de_idea(agenda, elemento)
    if isinstance(elemento, Regalo):
        return destinatarios_de_regalo(agenda, elemento)
    if isinstance(elemento, Evento):
        return destinatarios_de_evento(agenda, elemento)
    raise TypeError(f"elemento no soportado por la función de visibilidad: {type(elemento)!r}")


def visible(agenda: Agenda, elemento: object, observador: Persona | str | None) -> bool:
    """¿Es `elemento` visible para `observador`?

    `observador` admite la persona o su identificador. Un identificador
    desconocido o nulo equivale a un observador sin cuenta: no ve nada.
    """
    if isinstance(observador, str):
        observador = agenda.persona(observador)
    if observador is None or not observador.tiene_cuenta:
        return False

    if isinstance(elemento, Idea) and elemento.tipo == "deseo":
        if elemento.autor_id == observador.id:
            return True

    categoria = agenda.categoria(getattr(elemento, "categoria_id", None))
    if categoria is not None:
        if categoria.regla == "privada" and not observador.es_administrador:
            return False
        if categoria.regla == "restringida" and not agenda.tiene_acceso(
            categoria.id, observador.id
        ):
            return False

    if observador.id in _destinatarios(agenda, elemento):
        return False

    return True


def visible_publicamente(agenda: Agenda, elemento: object) -> bool:
    """Vista más conservadora, para quien no es observador del modelo.

    La emplea el plan semanal con los destinatarios sin cuenta —un abuelo que
    recibe el mensaje por WhatsApp—: solo contenido de categoría pública, nunca
    un elemento reservado, que podría ser una sorpresa que le concierne a él
    mismo (specs/plan-semanal.md §5).
    """
    categoria = agenda.categoria(getattr(elemento, "categoria_id", None))
    if categoria is not None and categoria.regla != "publica":
        return False
    if isinstance(elemento, (Idea, Regalo)):
        # La dimensión de regalos no entra jamás en un canal externo.
        return False
    return True


def comentarios_visibles(agenda: Agenda, elemento: object, observador: Persona | str | None):
    """Los comentarios heredan la visibilidad del objeto al que pertenecen (§6)."""
    if not visible(agenda, elemento, observador):
        return []
    tipo = {Idea: "idea", Regalo: "regalo", Evento: "evento"}[type(elemento)]
    objeto_id = getattr(elemento, "id")
    return [
        c
        for c in agenda.comentarios
        if c.activo and c.objeto_tipo == tipo and c.objeto_id == objeto_id
    ]
