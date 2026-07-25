import XCTest
@testable import AgendaFamiliarCore

/// Las mismas reglas que verifican `tests/` en Python y `api/test/` en
/// JavaScript. Que las tres suites comprueben lo mismo es deliberado: una
/// divergencia entre implementaciones significaría que la aplicación y el plan
/// semanal ocultan cosas distintas.
final class VisibilidadTests: XCTestCase {

    private let ana = Persona(id: "p-ana", nombre: "Ana", tieneCuenta: true, rol: "administrador", activa: true)
    private let marta = Persona(id: "p-marta", nombre: "Marta", tieneCuenta: true, rol: "miembro", activa: true)
    private let lucia = Persona(id: "p-lucia", nombre: "Lucía", tieneCuenta: true, rol: "miembro", activa: true)
    private let abuela = Persona(id: "p-abuela", nombre: "la abuela", tieneCuenta: false, activa: true)

    private func registro(ideas: [Idea] = [], regalos: [Regalo] = [], eventos: [Evento] = []) -> Instantanea {
        var instantanea = Instantanea.vacia
        instantanea.yo = Yo(id: ana.id, nombre: ana.nombre, rol: ana.rol)
        instantanea.personas = [ana, marta, lucia, abuela]
        instantanea.categorias = [
            Categoria(id: "general", nombre: "General", regla: "publica"),
            Categoria(id: "coordinacion", nombre: "Coordinación", regla: "privada"),
        ]
        instantanea.ideas = ideas
        instantanea.regalos = regalos
        instantanea.eventos = eventos
        return instantanea
    }

    private func idea(_ id: String, autor: String, tipo: String = "sugerencia",
                      categoria: String? = nil, orientadaA: [String] = []) -> Idea {
        Idea(id: id, tipo: tipo, titulo: "Algo", categoriaId: categoria, autorId: autor,
             orientaciones: orientadaA.map { OrientacionIdea(personaId: $0) })
    }

    func testQuienNoTieneCuentaNoVeNada() {
        let instantanea = registro(ideas: [idea("i1", autor: "p-ana")])
        XCTAssertFalse(Visibilidad.visible(instantanea.ideas[0], para: abuela, en: instantanea))
    }

    func testLaIdeaOrientadaAUnaPersonaQuedaOcultaParaElla() {
        let instantanea = registro(ideas: [idea("i1", autor: "p-ana", orientadaA: ["p-marta"])])
        XCTAssertFalse(Visibilidad.visible(instantanea.ideas[0], para: marta, en: instantanea))
        XCTAssertTrue(Visibilidad.visible(instantanea.ideas[0], para: lucia, en: instantanea))
    }

    func testLaOcultacionNoExceptuaALosAdministradores() {
        let instantanea = registro(ideas: [idea("i1", autor: "p-marta", orientadaA: ["p-ana"])])
        XCTAssertFalse(Visibilidad.visible(instantanea.ideas[0], para: ana, en: instantanea))
    }

    func testLaOcultacionAlcanzaALosCodestinatarios() {
        let regalo = Regalo(id: "rg", ocasionId: "oc", destinatarioPrincipalId: "p-marta",
                            compartido: true, codestinatarios: ["p-lucia"])
        let instantanea = registro(regalos: [regalo])
        XCTAssertFalse(Visibilidad.visible(regalo, para: marta, en: instantanea))
        XCTAssertFalse(Visibilidad.visible(regalo, para: lucia, en: instantanea))
        XCTAssertTrue(Visibilidad.visible(regalo, para: ana, en: instantanea))
    }

    func testUnDestinatarioSinCuentaNoActivaOcultacion() {
        let instantanea = registro(ideas: [idea("i1", autor: "p-ana", orientadaA: ["p-abuela"])])
        for observador in [ana, marta, lucia] {
            XCTAssertTrue(Visibilidad.visible(instantanea.ideas[0], para: observador, en: instantanea))
        }
    }

    func testElDeseoEsVisibleParaSuAutor() {
        let instantanea = registro(ideas: [idea("i1", autor: "p-marta", tipo: "deseo", orientadaA: ["p-marta"])])
        XCTAssertTrue(Visibilidad.visible(instantanea.ideas[0], para: marta, en: instantanea))
        XCTAssertTrue(Visibilidad.visible(instantanea.ideas[0], para: ana, en: instantanea))
    }

    func testLaCategoriaPrivadaEsSoloParaAdministradores() {
        let evento = Evento(id: "ev", titulo: "Preparar la fiesta", tipoId: "otro",
                            inicio: "2026-07-31T17:00:00", categoriaId: "coordinacion")
        let instantanea = registro(eventos: [evento])
        XCTAssertTrue(Visibilidad.visible(evento, para: ana, en: instantanea))
        XCTAssertFalse(Visibilidad.visible(evento, para: marta, en: instantanea))
    }

    func testElAvisoSeDerivaDeUnaCondicionEstatica() {
        var instantanea = registro()
        instantanea.yo = Yo(id: marta.id, nombre: marta.nombre, rol: marta.rol)
        let miCumple = Evento(id: "ev", titulo: "Cumpleaños de Marta", tipoId: "cumpleanos",
                              inicio: "2026-08-01", origen: "derivado", personaOrigenId: "p-marta")
        let otro = Evento(id: "ev2", titulo: "Comida", tipoId: "celebracion", inicio: "2026-08-02")
        XCTAssertTrue(instantanea.esMio(miCumple))
        XCTAssertFalse(instantanea.esMio(otro))
    }
}

final class SemanaTests: XCTestCase {

    private func fecha(_ texto: String) -> Date {
        Calendario.momento(texto)!
    }

    func testElLunesEsElPrimerDiaDeLaSemana() {
        let domingo = fecha("2026-07-26")
        XCTAssertEqual(Calendario.iso(Calendario.lunes(de: domingo)), "2026-07-20")
        XCTAssertEqual(Calendario.indiceDia(domingo), 6)
    }

    func testElRangoOmiteElMesRepetido() {
        XCTAssertEqual(Calendario.rango(desdeElLunes: fecha("2026-07-27")), "27 jul – 2 ago")
        XCTAssertEqual(Calendario.rango(desdeElLunes: fecha("2026-08-03")), "3 – 9 ago")
    }

    func testLaRepeticionSemanalCaeEnSuDia() {
        let evento = Evento(id: "ev", titulo: "Entreno", tipoId: "entreno",
                            inicio: "2026-01-12T18:00:00", repeticion: "semanal")
        let instancias = Agenda.ocurrencias(de: evento, desde: fecha("2026-07-27"), hasta: fecha("2026-08-02"))
        XCTAssertEqual(instancias.count, 1)
        XCTAssertEqual(Calendario.iso(instancias[0].inicio), "2026-07-27")
    }

    func testLaRepeticionSeDetieneEnSuFechaDeFin() {
        let evento = Evento(id: "ev", titulo: "Entreno", tipoId: "entreno",
                            inicio: "2026-01-12T18:00:00", repeticion: "semanal",
                            repeticionHasta: "2026-06-30")
        XCTAssertTrue(Agenda.ocurrencias(de: evento, desde: fecha("2026-07-27"), hasta: fecha("2026-08-02")).isEmpty)
    }

    func testElCumpleanosSeDerivaDeLaFechaDeNacimiento() {
        var instantanea = Instantanea.vacia
        instantanea.tiposEvento = [TipoEvento(id: "cumpleanos", nombre: "Cumpleaños", emoji: "🎂", llevaRegalos: true)]
        instantanea.personas = [Persona(id: "p-abuela", nombre: "la abuela",
                                        fechaNacimiento: "1949-07-30", tieneCuenta: false, activa: true)]

        let derivados = Agenda.eventosDerivados(instantanea)
        XCTAssertEqual(derivados.count, 1)
        XCTAssertEqual(derivados[0].titulo, "Cumpleaños de la abuela")
        XCTAssertFalse(derivados[0].editable)

        let instancias = Agenda.instancias(instantanea, desde: fecha("2026-07-27"), hasta: fecha("2026-08-02"))
        XCTAssertEqual(instancias.count, 1)
        XCTAssertEqual(Calendario.iso(instancias[0].inicio), "2026-07-30")
    }

    func testLasJornadasPosterioresSeMarcanComoContinuacion() {
        let evento = Evento(id: "ev", titulo: "Torneo", tipoId: "competicion",
                            inicio: "2026-08-01", fin: "2026-08-02", jornadaCompleta: true)
        var instantanea = Instantanea.vacia
        instantanea.eventos = [evento]

        let dias = Calendario.dias(desdeElLunes: fecha("2026-07-27"))
        let reparto = Agenda.repartir(Agenda.instancias(instantanea, desde: dias[0], hasta: dias[6]), en: dias)

        XCTAssertEqual(reparto["2026-08-01"]?.count, 1)
        XCTAssertEqual(reparto["2026-08-02"]?.count, 1)
        XCTAssertEqual(reparto["2026-08-01"]?.first?.continuacion, false)
        XCTAssertEqual(reparto["2026-08-02"]?.first?.continuacion, true)
    }

    func testLaJornadaCompletaPrecedeALosEventosConHora() {
        var instantanea = Instantanea.vacia
        instantanea.eventos = [
            Evento(id: "tarde", titulo: "Comida", tipoId: "celebracion", inicio: "2026-07-27T14:00:00"),
            Evento(id: "manana", titulo: "Dentista", tipoId: "cita_medica", inicio: "2026-07-27T10:00:00"),
            Evento(id: "dia", titulo: "Fiesta", tipoId: "celebracion", inicio: "2026-07-27", jornadaCompleta: true),
        ]
        let dias = Calendario.dias(desdeElLunes: fecha("2026-07-27"))
        let reparto = Agenda.repartir(Agenda.instancias(instantanea, desde: dias[0], hasta: dias[6]), en: dias)
        XCTAssertEqual(reparto["2026-07-27"]?.map(\.evento.id), ["dia", "manana", "tarde"])
    }
}

final class FusionTests: XCTestCase {
    func testUnCambioSoloTocaLosCamposQueTrae() {
        let original = Evento(id: "ev", titulo: "Comida", tipoId: "celebracion",
                              inicio: "2026-08-02T14:00:00", ubicacion: "Casa")
        let fusionado: Evento? = Fusion.aplicar(
            ["titulo": .texto("Comida con los abuelos")],
            sobre: original, id: "ev", marca: "2026-07-25T10:00:00Z"
        )
        XCTAssertEqual(fusionado?.titulo, "Comida con los abuelos")
        XCTAssertEqual(fusionado?.ubicacion, "Casa", "lo que no viene en el cambio se conserva")
        XCTAssertEqual(fusionado?.inicio, "2026-08-02T14:00:00")
    }

    func testUnCampoNuloSeBorra() {
        let original = Evento(id: "ev", titulo: "Reservado", tipoId: "otro",
                              inicio: "2026-08-02", categoriaId: "coordinacion")
        let fusionado: Evento? = Fusion.aplicar(
            ["categoria_id": .nulo], sobre: original, id: "ev", marca: "2026-07-25T10:00:00Z"
        )
        XCTAssertNil(fusionado?.categoriaId)
    }
}
