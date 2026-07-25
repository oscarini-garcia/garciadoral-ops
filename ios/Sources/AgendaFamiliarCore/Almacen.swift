import Foundation

/// Un cambio pendiente de subir. Es la mitad local del flujo de sincronización:
/// se aplica de inmediato sobre la instantánea y espera aquí a que haya red.
public struct Cambio: Codable, Identifiable, Sendable {
    public var id: String
    public var tipo: String
    public var campos: [String: ValorJSON]
    public var actualizadoEn: String

    public init(tipo: String, id: String, campos: [String: ValorJSON], actualizadoEn: String = Fechas.ahora()) {
        self.tipo = tipo
        self.id = id
        self.campos = campos
        self.actualizadoEn = actualizadoEn
    }
}

/// Los campos de un cambio son heterogéneos —texto, número, indicador, listas—,
/// de modo que se codifican con un valor abierto en lugar de un tipo por tabla.
public enum ValorJSON: Codable, Hashable, Sendable {
    case texto(String)
    case numero(Double)
    case indicador(Bool)
    case lista([ValorJSON])
    case objeto([String: ValorJSON])
    case nulo

    public init(from decoder: Decoder) throws {
        let contenedor = try decoder.singleValueContainer()
        if contenedor.decodeNil() { self = .nulo }
        else if let valor = try? contenedor.decode(Bool.self) { self = .indicador(valor) }
        else if let valor = try? contenedor.decode(Double.self) { self = .numero(valor) }
        else if let valor = try? contenedor.decode(String.self) { self = .texto(valor) }
        else if let valor = try? contenedor.decode([ValorJSON].self) { self = .lista(valor) }
        else if let valor = try? contenedor.decode([String: ValorJSON].self) { self = .objeto(valor) }
        else { self = .nulo }
    }

    public func encode(to encoder: Encoder) throws {
        var contenedor = encoder.singleValueContainer()
        switch self {
        case .texto(let valor): try contenedor.encode(valor)
        case .numero(let valor): try contenedor.encode(valor)
        case .indicador(let valor): try contenedor.encode(valor)
        case .lista(let valor): try contenedor.encode(valor)
        case .objeto(let valor): try contenedor.encode(valor)
        case .nulo: try contenedor.encodeNil()
        }
    }
}

public enum Fechas {
    public static func ahora() -> String {
        let formateador = ISO8601DateFormatter()
        formateador.formatOptions = [.withInternetDateTime]
        return formateador.string(from: Date())
    }
}

/// Almacén local: la instantánea y la cola de cambios, en dos ficheros del
/// contenedor de la aplicación.
///
/// La instantánea se **sustituye entera** en cada sincronización correcta. Es lo
/// que hace que la retirada retroactiva funcione sola: cuando alguien pasa a ser
/// destinatario de algo que ya tenía sincronizado, la siguiente respuesta no lo
/// trae y desaparece del dispositivo (specs/modelo-datos.md §7.3).
public actor Almacen {
    private let carpeta: URL
    private var instantaneaEnMemoria: Instantanea?
    private var colaEnMemoria: [Cambio] = []

    public init(carpeta: URL? = nil) {
        let destino = carpeta ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AgendaFamiliar", isDirectory: true)
        self.carpeta = destino
        try? FileManager.default.createDirectory(at: destino, withIntermediateDirectories: true)
    }

    private var ficheroInstantanea: URL { carpeta.appendingPathComponent("instantanea.json") }
    private var ficheroCola: URL { carpeta.appendingPathComponent("cola.json") }

    public func instantanea() -> Instantanea? {
        if let instantaneaEnMemoria { return instantaneaEnMemoria }
        guard let datos = try? Data(contentsOf: ficheroInstantanea),
              let leida = try? JSON.decodificador.decode(Instantanea.self, from: datos) else { return nil }
        instantaneaEnMemoria = leida
        return leida
    }

    public func guardar(_ instantanea: Instantanea) {
        instantaneaEnMemoria = instantanea
        guard let datos = try? JSON.codificador.encode(instantanea) else { return }
        try? datos.write(to: ficheroInstantanea, options: .atomic)
    }

    public func cola() -> [Cambio] {
        if !colaEnMemoria.isEmpty { return colaEnMemoria }
        guard let datos = try? Data(contentsOf: ficheroCola),
              let leida = try? JSON.decodificador.decode([Cambio].self, from: datos) else { return [] }
        colaEnMemoria = leida
        return leida
    }

    public func encolar(_ cambio: Cambio) {
        colaEnMemoria = cola() + [cambio]
        persistirCola()
    }

    public func vaciarCola() {
        colaEnMemoria = []
        persistirCola()
    }

    /// Se descarta todo al cambiar de titular: el almacén local pertenece a una
    /// persona concreta y no debe sobrevivir a un cambio de sesión.
    public func olvidarTodo() {
        instantaneaEnMemoria = nil
        colaEnMemoria = []
        try? FileManager.default.removeItem(at: ficheroInstantanea)
        try? FileManager.default.removeItem(at: ficheroCola)
    }

    private func persistirCola() {
        guard let datos = try? JSON.codificador.encode(colaEnMemoria) else { return }
        try? datos.write(to: ficheroCola, options: .atomic)
    }
}

// MARK: - Fusión de cambios sobre la instantánea local

public extension ValorJSON {
    /// Valor equivalente para `JSONSerialization`, que es como se fusiona un
    /// cambio con la fila que ya está en la instantánea.
    var crudo: Any {
        switch self {
        case .texto(let valor): return valor
        case .numero(let valor): return valor
        case .indicador(let valor): return valor
        case .lista(let valor): return valor.map(\.crudo)
        case .objeto(let valor): return valor.mapValues(\.crudo)
        case .nulo: return NSNull()
        }
    }

    static func desde(_ valor: Any?) -> ValorJSON {
        switch valor {
        case let texto as String: return .texto(texto)
        case let indicador as Bool: return .indicador(indicador)
        case let numero as Double: return .numero(numero)
        case let numero as Int: return .numero(Double(numero))
        case let lista as [Any]: return .lista(lista.map { ValorJSON.desde($0) })
        case let objeto as [String: Any]: return .objeto(objeto.mapValues { ValorJSON.desde($0) })
        default: return .nulo
        }
    }
}

public enum Fusion {
    /// Aplica `campos` sobre `existente` y devuelve la fila resultante.
    ///
    /// Se hace por diccionario y no campo a campo porque un cambio solo trae lo
    /// que cambia: reconstruir la estructura entera obligaría a que cada
    /// pantalla conociese todos los campos de la entidad que toca.
    public static func aplicar<T: Codable>(_ campos: [String: ValorJSON],
                                           sobre existente: T?,
                                           id: String,
                                           marca: String) -> T? {
        var base: [String: Any] = [:]

        if let existente,
           let datos = try? JSON.codificador.encode(existente),
           let diccionario = (try? JSONSerialization.jsonObject(with: datos)) as? [String: Any] {
            base = diccionario
        }

        base["id"] = id
        base["actualizado_en"] = marca
        for (clave, valor) in campos {
            if case .nulo = valor { base[clave] = NSNull() } else { base[clave] = valor.crudo }
        }

        guard let datos = try? JSONSerialization.data(withJSONObject: base) else { return nil }
        return try? JSON.decodificador.decode(T.self, from: datos)
    }
}
