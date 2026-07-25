import Foundation

/// Cliente de la API de la Agenda Familiar.
///
/// Habla con el Worker de Cloudflare: canjea el token de Apple por una sesión,
/// descarga la instantánea que le corresponde a su titular y sube la cola de
/// cambios. No decide nada sobre visibilidad, porque no puede: recibe lo que le
/// mandan y eso es todo lo que hay.
public struct ClienteAPI: Sendable {
    public struct Sesion: Codable, Sendable {
        public var token: String
        public var persona: Yo
    }

    public struct ResultadoCambio: Codable, Sendable {
        public var id: String?
        public var tipo: String?
        public var aplicado: Bool
        public var motivo: String?
    }

    public struct RespuestaCambios: Codable, Sendable {
        public var resultados: [ResultadoCambio]
        public var instantanea: Instantanea
    }

    public enum Fallo: LocalizedError {
        case sinConfigurar
        case sesionCaducada
        case sinVincular(identificador: String?, mensaje: String)
        case respuesta(Int, String)

        public var errorDescription: String? {
            switch self {
            case .sinConfigurar:
                return "Esta instalación todavía no tiene configurada la API."
            case .sesionCaducada:
                return "La sesión ha caducado. Vuelve a entrar."
            case .sinVincular(let identificador, let mensaje):
                guard let identificador else { return mensaje }
                return "\(mensaje) El identificador que hay que vincular es \(identificador)."
            case .respuesta(let codigo, let cuerpo):
                return "La API respondió \(codigo). \(cuerpo)"
            }
        }
    }

    public var base: URL
    public var token: String?

    public init(base: URL, token: String? = nil) {
        self.base = base
        self.token = token
    }

    private func construir(_ camino: String, metodo: String = "GET", cuerpo: Data? = nil) -> URLRequest {
        var peticion = URLRequest(url: base.appendingPathComponent(camino))
        peticion.httpMethod = metodo
        peticion.setValue("application/json", forHTTPHeaderField: "Content-Type")
        peticion.setValue("ios", forHTTPHeaderField: "X-Plataforma")
        if let token { peticion.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let identificador = UIDispositivo.identificador {
            peticion.setValue(identificador, forHTTPHeaderField: "X-Dispositivo")
        }
        peticion.httpBody = cuerpo
        peticion.timeoutInterval = 30
        return peticion
    }

    private func ejecutar<T: Decodable>(_ peticion: URLRequest, _ tipo: T.Type) async throws -> T {
        let (datos, respuesta) = try await URLSession.shared.data(for: peticion)
        let codigo = (respuesta as? HTTPURLResponse)?.statusCode ?? 0

        if codigo == 401 { throw Fallo.sesionCaducada }
        guard (200..<300).contains(codigo) else {
            let cuerpo = String(data: datos, encoding: .utf8) ?? ""
            throw Fallo.respuesta(codigo, cuerpo)
        }
        return try JSON.decodificador.decode(tipo, from: datos)
    }

    /// Canjea el token de identidad de Apple por una sesión propia.
    public func abrirSesion(tokenDeApple: String) async throws -> Sesion {
        struct Cuerpo: Encodable {
            let idToken: String
            let plataforma: String
        }
        struct Rechazo: Decodable {
            let error: String?
            let mensaje: String?
            let identificador: String?
        }

        let cuerpo = try JSON.codificador.encode(Cuerpo(idToken: tokenDeApple, plataforma: "ios"))
        let peticion = construir("api/sesion", metodo: "POST", cuerpo: cuerpo)

        let (datos, respuesta) = try await URLSession.shared.data(for: peticion)
        let codigo = (respuesta as? HTTPURLResponse)?.statusCode ?? 0

        if codigo == 403, let rechazo = try? JSONDecoder().decode(Rechazo.self, from: datos) {
            // La incorporación se produce por invitación de un administrador,
            // que vincula el identificador a la persona correspondiente.
            throw Fallo.sinVincular(
                identificador: rechazo.identificador,
                mensaje: rechazo.mensaje ?? "Este identificador de Apple no está vinculado a ninguna persona del hogar."
            )
        }
        guard (200..<300).contains(codigo) else {
            throw Fallo.respuesta(codigo, String(data: datos, encoding: .utf8) ?? "")
        }
        return try JSON.decodificador.decode(Sesion.self, from: datos)
    }

    public func descargar() async throws -> Instantanea {
        try await ejecutar(construir("api/sync"), Instantanea.self)
    }

    public func subir(_ cambios: [Cambio]) async throws -> RespuestaCambios {
        struct Cuerpo: Encodable { let cambios: [Cambio] }
        let cuerpo = try JSON.codificador.encode(Cuerpo(cambios: cambios))
        return try await ejecutar(construir("api/cambios", metodo: "POST", cuerpo: cuerpo), RespuestaCambios.self)
    }
}

/// Identificador estable del dispositivo, para que el servidor sepa a quién le
/// ha transmitido qué. No se usa para nada más.
enum UIDispositivo {
    static var identificador: String? {
        let clave = "agenda.dispositivo"
        if let existente = UserDefaults.standard.string(forKey: clave) { return existente }
        let nuevo = UUID().uuidString
        UserDefaults.standard.set(nuevo, forKey: clave)
        return nuevo
    }
}
