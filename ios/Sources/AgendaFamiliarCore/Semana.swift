import Foundation

/// La semana como marco fijo de siete días.
///
/// Espejo de `scripts/agenda/semana.py` y de `pwa/publico/js/semana.js`. Las
/// marcas del registro son locales e ingenuas —`2026-07-28` o
/// `2026-07-28T18:00:00`—, de modo que se interpretan siempre en el calendario
/// del dispositivo con la semana empezando en lunes.

public enum Calendario {
    public static var actual: Calendar {
        var calendario = Calendar(identifier: .gregorian)
        calendario.firstWeekday = 2 // lunes
        calendario.locale = Locale(identifier: "es_ES")
        return calendario
    }

    public static let inicialesDia = ["L", "M", "X", "J", "V", "S", "D"]
    public static let meses = ["ene", "feb", "mar", "abr", "may", "jun",
                               "jul", "ago", "sep", "oct", "nov", "dic"]
    public static let mesesLargos = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                                     "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    /// Techo de eventos por día en la vista de semana. A partir del cuarto
    /// aparece un enlace con el resto, y el marco de siete filas se conserva.
    public static let techoEventosDia = 3

    /// Índice con el lunes en 0, como en el resto del sistema.
    public static func indiceDia(_ fecha: Date) -> Int {
        (actual.component(.weekday, from: fecha) + 5) % 7
    }

    public static func soloFecha(_ fecha: Date) -> Date {
        actual.startOfDay(for: fecha)
    }

    public static func sumar(dias: Int, a fecha: Date) -> Date {
        actual.date(byAdding: .day, value: dias, to: fecha) ?? fecha
    }

    public static func lunes(de fecha: Date) -> Date {
        sumar(dias: -indiceDia(fecha), a: soloFecha(fecha))
    }

    public static func dias(desdeElLunes lunes: Date) -> [Date] {
        (0..<7).map { sumar(dias: $0, a: lunes) }
    }

    /// Interpreta una marca del registro. Devuelve `nil` si no es válida.
    public static func momento(_ texto: String?) -> Date? {
        guard let texto, !texto.isEmpty else { return nil }
        let partes = texto.split(separator: "T", maxSplits: 1, omittingEmptySubsequences: false)
        let fecha = partes[0].split(separator: "-").compactMap { Int($0) }
        guard fecha.count == 3 else { return nil }

        var componentes = DateComponents()
        componentes.year = fecha[0]
        componentes.month = fecha[1]
        componentes.day = fecha[2]

        if partes.count > 1 {
            let hora = partes[1].split(separator: ":").compactMap { Int($0) }
            componentes.hour = hora.count > 0 ? hora[0] : 0
            componentes.minute = hora.count > 1 ? hora[1] : 0
        }
        return actual.date(from: componentes)
    }

    public static func iso(_ fecha: Date) -> String {
        let c = actual.dateComponents([.year, .month, .day], from: fecha)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 1, c.day ?? 1)
    }

    public static func isoConHora(_ fecha: Date) -> String {
        let c = actual.dateComponents([.year, .month, .day, .hour, .minute], from: fecha)
        return String(format: "%04d-%02d-%02dT%02d:%02d:00",
                      c.year ?? 0, c.month ?? 1, c.day ?? 1, c.hour ?? 0, c.minute ?? 0)
    }

    public static func hora(_ fecha: Date) -> String {
        let c = actual.dateComponents([.hour, .minute], from: fecha)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    /// `27 jul – 2 ago`, u `1 – 7 sep` cuando la semana no cambia de mes.
    public static func rango(desdeElLunes lunes: Date) -> String {
        let domingo = sumar(dias: 6, a: lunes)
        let c1 = actual.dateComponents([.month, .day], from: lunes)
        let c2 = actual.dateComponents([.month, .day], from: domingo)
        let mes1 = meses[(c1.month ?? 1) - 1]
        let mes2 = meses[(c2.month ?? 1) - 1]
        if c1.month == c2.month {
            return "\(c1.day ?? 1) – \(c2.day ?? 1) \(mes2)"
        }
        return "\(c1.day ?? 1) \(mes1) – \(c2.day ?? 1) \(mes2)"
    }

    public static func fechaLarga(_ fecha: Date) -> String {
        let c = actual.dateComponents([.month, .day], from: fecha)
        let nombres = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
        return "\(nombres[indiceDia(fecha)]) \(c.day ?? 1) de \(mesesLargos[(c.month ?? 1) - 1])"
    }
}

// MARK: - Instancias

/// Una aparición concreta de un evento, ya resuelta su recurrencia.
public struct Instancia: Identifiable, Hashable, Sendable {
    public var evento: Evento
    public var inicio: Date
    public var fin: Date

    public var id: String { "\(evento.id)@\(inicio.timeIntervalSince1970)" }
    public var variosDias: Bool {
        Calendario.soloFecha(inicio) != Calendario.soloFecha(fin)
    }
}

/// La instancia tal como se muestra en un día concreto de la semana.
public struct Aparicion: Identifiable, Hashable, Sendable {
    public var instancia: Instancia
    public var dia: Date

    public var id: String { "\(instancia.id)#\(Calendario.iso(dia))" }
    public var evento: Evento { instancia.evento }

    /// Jornada posterior a la primera de un evento de varios días. Se señala
    /// como continuación en lugar de repetir el evento como si fuera nuevo.
    public var continuacion: Bool {
        Calendario.soloFecha(instancia.inicio) < Calendario.soloFecha(dia)
    }

    public var hora: String? {
        if evento.todoElDia || continuacion { return nil }
        return Calendario.hora(instancia.inicio)
    }

    var clave: Int {
        if evento.todoElDia || continuacion { return -1 }
        let c = Calendario.actual.dateComponents([.hour, .minute], from: instancia.inicio)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
}

// MARK: - Recurrencia y derivados

public enum Agenda {
    /// Cumpleaños generados a partir de las fechas de nacimiento, para todas las
    /// personas del registro, tengan cuenta o no. No se editan directamente: se
    /// corrigen en la ficha, de modo que el dato maestro y su reflejo en la
    /// agenda no puedan divergir (specs/modelo-datos.md §7.4).
    public static func eventosDerivados(_ instantanea: Instantanea) -> [Evento] {
        guard instantanea.tiposEvento.contains(where: { $0.id == "cumpleanos" }) else { return [] }
        return instantanea.personas.compactMap { persona in
            guard persona.estaActiva, let nacimiento = persona.fechaNacimiento, !nacimiento.isEmpty else { return nil }
            return Evento(
                id: "derivado:cumpleanos:\(persona.id)",
                titulo: "Cumpleaños de \(persona.nombre)",
                tipoId: "cumpleanos",
                emoji: nil,
                inicio: String(nacimiento.prefix(10)),
                fin: nil,
                jornadaCompleta: true,
                ubicacion: nil,
                notas: nil,
                repeticion: "anual",
                repeticionHasta: nil,
                llevaRegalos: nil,
                categoriaId: nil,
                origen: "derivado",
                personaOrigenId: persona.id,
                calendarioId: nil,
                participantes: [ParticipanteEvento(personaId: persona.id, rol: "protagonista")]
            )
        }
    }

    /// 29 de febrero en año no bisiesto: al 1 de marzo, igual que el despachador.
    private static func mismoDia(_ momento: Date, enAnio anio: Int) -> Date {
        let calendario = Calendario.actual
        var c = calendario.dateComponents([.month, .day, .hour, .minute], from: momento)
        c.year = anio
        if let candidato = calendario.date(from: c),
           calendario.component(.month, from: candidato) == (c.month ?? 1) {
            return candidato
        }
        var alternativa = c
        alternativa.month = 3
        alternativa.day = 1
        return calendario.date(from: alternativa) ?? momento
    }

    /// Instancias del evento que se solapan con `[desde, hasta]`.
    public static func ocurrencias(de evento: Evento, desde: Date, hasta: Date) -> [Instancia] {
        guard let inicio = Calendario.momento(evento.inicio) else { return [] }
        let calendario = Calendario.actual
        let fin = Calendario.momento(evento.fin)
        let duracion = max(0, (fin ?? inicio).timeIntervalSince(inicio))

        let limiteInf = Calendario.soloFecha(desde).addingTimeInterval(-duracion)
        let limiteSup = Calendario.soloFecha(hasta).addingTimeInterval(86_399)
        let tope = Calendario.momento(evento.repeticionHasta)

        func admisible(_ momento: Date) -> Bool {
            if momento < inicio || momento < limiteInf || momento > limiteSup { return false }
            if let tope, Calendario.soloFecha(momento) > Calendario.soloFecha(tope) { return false }
            return true
        }

        var arranques: [Date] = []

        switch evento.repeticion ?? "ninguna" {
        case "semanal":
            let salto = calendario.dateComponents([.day], from: Calendario.soloFecha(inicio),
                                                  to: Calendario.soloFecha(limiteInf)).day ?? 0
            let semanas = max(0, Int(ceil(Double(salto) / 7.0)))
            var actual = Calendario.sumar(dias: semanas * 7, a: inicio)
            while actual <= limiteSup {
                if admisible(actual) { arranques.append(actual) }
                actual = Calendario.sumar(dias: 7, a: actual)
            }

        case "mensual":
            var cursor = calendario.date(from: calendario.dateComponents([.year, .month], from: limiteInf)) ?? limiteInf
            while cursor <= limiteSup {
                var c = calendario.dateComponents([.year, .month], from: cursor)
                let diasDelMes = calendario.range(of: .day, in: .month, for: cursor)?.count ?? 28
                let original = calendario.dateComponents([.day, .hour, .minute], from: inicio)
                c.day = min(original.day ?? 1, diasDelMes)
                c.hour = original.hour
                c.minute = original.minute
                if let candidato = calendario.date(from: c), admisible(candidato) { arranques.append(candidato) }
                cursor = calendario.date(byAdding: .month, value: 1, to: cursor) ?? limiteSup.addingTimeInterval(1)
            }

        case "anual":
            let anios = Set([calendario.component(.year, from: limiteInf),
                             calendario.component(.year, from: limiteSup)])
            for anio in anios {
                let candidato = mismoDia(inicio, enAnio: anio)
                if admisible(candidato) { arranques.append(candidato) }
            }

        default:
            if admisible(inicio) { arranques.append(inicio) }
        }

        return arranques.sorted().map {
            Instancia(evento: evento, inicio: $0, fin: $0.addingTimeInterval(duracion))
        }
    }

    public static func instancias(_ instantanea: Instantanea, desde: Date, hasta: Date) -> [Instancia] {
        let fuentes = instantanea.eventos + eventosDerivados(instantanea)
        return fuentes.flatMap { ocurrencias(de: $0, desde: desde, hasta: hasta) }
    }

    /// Coloca cada instancia en todos los días que ocupa, ordenadas con la
    /// jornada completa primero y el resto por hora.
    public static func repartir(_ instancias: [Instancia], en dias: [Date]) -> [String: [Aparicion]] {
        var reparto: [String: [Aparicion]] = [:]
        for dia in dias { reparto[Calendario.iso(dia)] = [] }

        for instancia in instancias {
            var cursor = Calendario.soloFecha(instancia.inicio)
            let ultimo = Calendario.soloFecha(instancia.fin)
            while cursor <= ultimo {
                let clave = Calendario.iso(cursor)
                if reparto[clave] != nil {
                    reparto[clave]?.append(Aparicion(instancia: instancia, dia: cursor))
                }
                cursor = Calendario.sumar(dias: 1, a: cursor)
            }
        }

        for clave in reparto.keys {
            reparto[clave]?.sort {
                $0.clave == $1.clave
                    ? $0.evento.titulo.localizedCompare($1.evento.titulo) == .orderedAscending
                    : $0.clave < $1.clave
            }
        }
        return reparto
    }
}
