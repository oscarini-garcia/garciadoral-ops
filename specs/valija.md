# Agenda Familiar — Valija

**Versión:** 0.1 (marcador)
**Fecha:** 25 de julio de 2026
**Documentos complementarios:** Agenda Familiar — Especificación Funcional · Agenda Familiar — Modelo de Datos y Flujos
**Alcance:** ninguno todavía. Este documento reserva el sitio de un módulo cuya idea está sobre la mesa y cuya definición se aborda más adelante.

---

> **Documento marcador.** No es una especificación. Recoge la intención del módulo
> para que no se pierda, y enumera lo que habría que decidir. Nada de lo que sigue
> está cerrado: ni las entidades, ni las reglas de visibilidad, ni la interfaz.
> **No debe construirse nada a partir de este documento.**

---

## 1. La idea

Una **valija virtual**: un sitio donde ir dejando lo que hay que tener en cuenta
para las vacaciones y para las salidas que se les parecen —un puente, un fin de
semana fuera, un viaje largo—.

El problema que atiende es el mismo que resuelve el módulo de Ideas en su terreno:
lo que conviene recordar aparece semanas antes del momento en que hace falta, y
en el instante en que aparece no hay dónde ponerlo. La toalla que se quedó sin
comprar, el adaptador de enchufe, la reserva que caduca, la medicación que hay
que pedir con antelación, el «esta vez llevamos la nevera pequeña». Todo eso hoy
vive en la cabeza de alguien, en una nota suelta o en un mensaje que se pierde
en el hilo del grupo.

El principio que la sostiene es el mismo del resto del sistema: **se anota una
vez y se reutiliza**. Una valija que hubiera que rehacer entera en cada viaje no
aportaría nada sobre una nota en blanco.

---

## 2. Lo que se intuye del módulo

Anotado como conversación inicial, no como decisión.

**Es acumulativo, no de un solo uso.** Su valor está en que lo aprendido en un
viaje esté disponible en el siguiente. Un contenido que se consumiese y
desapareciese al volver reduciría la valija a una lista de la compra.

**Conviven dos naturalezas distintas.** Lo que se lleva —objetos que se meten en
la maleta— y lo que hay que hacer antes de salir —encargos, reservas, avisos,
dejar la llave a alguien—. Puede que sean el mismo objeto con un atributo, o dos
cosas distintas. Está por ver.

**Es familiar, no individual.** Que cada cual tenga su lista es el estado actual
del asunto y precisamente lo que se quiere corregir; pero hay contenido que solo
incumbe a una persona y no debería ocupar espacio en la vista de los demás.

**Se apoya en el tiempo sin depender de él.** Buena parte del contenido tiene
sentido asociado a una salida concreta, con fecha; otra parte es permanente y
sobrevive a cualquier viaje.

---

## 3. Encaje con lo ya especificado

Los puntos de contacto con el sistema existente, que habrá que resolver antes de
escribir nada:

| Con qué | Qué habría que resolver |
|---|---|
| **Agenda** (`especificacion.md` §4) | Un viaje ya es un evento, y de varios días. ¿La valija cuelga de ese evento, o es un contenedor propio que se le vincula, como ocurre entre Evento y Ocasión (§6.4)? |
| **Modelo de visibilidad** (§3) | ¿Aplica la ocultación por destinatario? Casi todo el contenido es logístico y público, pero la valija puede delatar una sorpresa —un regalo que viaja en la maleta, un plan no anunciado—. Mientras no se decida, el módulo no es seguro. |
| **Funcionamiento sin conexión** (§9) | Es el módulo que más se consulta justamente donde no hay red: haciendo la maleta, en el aeropuerto, ya fuera de casa. |
| **Plan semanal** (`plan-semanal.md`) | ¿Debe la semana previa a un viaje arrastrar lo pendiente de la valija al mensaje del domingo? Sería su momento natural de mayor utilidad. |
| **Ideas** (§5) | Comparte forma —captura rápida, banco permanente, promoción a un contenedor con fecha— hasta el punto de que conviene comprobar si no es la misma mecánica aplicada a otro contenido. |

---

## 4. Cuestiones abiertas

1. Qué es exactamente el objeto que se guarda, y si «lo que se lleva» y «lo que
   hay que hacer antes» son uno o dos.
2. Si existen plantillas reutilizables —playa, montaña, viaje con las niñas— y
   cómo se relacionan con las listas de cada salida.
3. Qué ocurre al cerrar un viaje: qué se conserva, qué se archiva y qué alimenta
   la siguiente valija.
4. Si el contenido puede asignarse a una persona, y si esa asignación es
   responsabilidad, pertenencia o ambas.
5. Cuál es la regla de visibilidad del módulo, y si necesita alguna distinta de
   las tres ya existentes.
6. Si aparece en el plan semanal y con qué recorte.
7. Dónde vive en la interfaz. La opción D (`ux.md` §11) organiza la aplicación
   alrededor de la semana, y una valija es contenido que no cuelga de un día
   concreto.

---

## 5. Estado

No está modelado en `modelo-datos.md`, no tiene entidades en el esquema de D1 ni
representación en la aplicación, y ninguna pieza del repositorio lo contempla. La
correspondencia entre especificaciones e implementación del `README` no lo
incluye a propósito.
