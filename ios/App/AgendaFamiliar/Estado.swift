import Foundation
import SwiftUI
import AgendaFamiliarCore

/// El estado de la aplicación: una instantánea local, una cola de cambios y un
/// indicador de sincronización.
///
/// La escritura es local e inmediata. No hay indicadores de espera en el camino
/// principal, porque una aplicación que hace esperar sin red se percibe como
/// averiada (specs/ux.md §1). Lo que se guarda va a la cola y sube cuando puede.
@MainActor
final class Estado: ObservableObject {

    enum Situacion: Equatable {
        case alDia(Date?)
        case sincronizando
        case sinConexion
        case error(String)

        var texto: String {
            switch self {
            case .alDia: return "al día"
            case .sincronizando: return "sincronizando"
            case .sinConexion: return "sin conexión"
            case .error: return "sin sincronizar"
            }
        }

        var color: Color {
            switch self {
            case .alDia: return .tinta
            case .sincronizando: return .aviso
            case .sinConexion: return .secondary
            case .error: return .regalo
            }
        }
    }

    struct SesionGuardada: Codable {
        var token: String
        var persona: Yo
    }

    @Published private(set) var instantanea: Instantanea?
    @Published private(set) var situacion: Situacion = .alDia(nil)
    @Published private(set) var sesion: SesionGuardada?
    @Published var mensaje: String?

    private let almacen = Almacen()
    private let configuracion = Configuracion.actual
    private var sincronizando = false

    private static let claveSesion = "agenda.sesion"

    var identificado: Bool { sesion != nil }
    var yo: Yo { instantanea?.yo ?? sesion?.persona ?? Yo(id: "", nombre: "", rol: nil) }
    var soyAdministrador: Bool { yo.esAdministrador }

    // MARK: - Ciclo de vida

    func arrancar() async {
        sesion = leerSesionGuardada()
        instantanea = await almacen.instantanea()
        guard sesion != nil else { return }
        await sincronizar()
    }

    func entrar(tokenDeApple: String) async {
        guard let base = configuracion.api else {
            mensaje = ClienteAPI.Fallo.sinConfigurar.errorDescription
            return
        }
        do {
            let cliente = ClienteAPI(base: base)
            let abierta = try await cliente.abrirSesion(tokenDeApple: tokenDeApple)
            // El almacén local pertenece a un titular concreto y no debe
            // sobrevivir a un cambio de persona.
            await almacen.olvidarTodo()
            instantanea = nil
            guardarSesion(SesionGuardada(token: abierta.token, persona: abierta.persona))
            await sincronizar()
        } catch {
            mensaje = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func salir() async {
        await almacen.olvidarTodo()
        instantanea = nil
        sesion = nil
        UserDefaults.standard.removeObject(forKey: Self.claveSesion)
    }

    // MARK: - Escritura

    /// Registra un cambio: se aplica al instante sobre la instantánea local y se
    /// apila para subirlo. Quien llama no espera a nada.
    func guardar(_ tipo: String, id: String, campos: [String: ValorJSON]) {
        let cambio = Cambio(tipo: tipo, id: id, campos: campos)
        aplicarEnLocal(cambio)
        derivarEnLocal()

        let copia = instantanea
        Task {
            if let copia { await almacen.guardar(copia) }
            await almacen.encolar(cambio)
            await sincronizar()
        }
    }

    /// El borrado nunca es físico: se marca como inactivo.
    func retirar(_ tipo: String, id: String) {
        let campo = ["persona", "idea", "ocasion", "categoria", "etiqueta"].contains(tipo) ? "activa" : "activo"
        guardar(tipo, id: id, campos: [campo: .indicador(false)])
    }

    private func aplicarEnLocal(_ cambio: Cambio) {
        guard var actual = instantanea else { return }
        let marca = cambio.actualizadoEn

        func fusionar<T: Codable & Identifiable>(_ lista: inout [T], _ id: String) where T.ID == String {
            let indice = lista.firstIndex { $0.id == id }
            let anterior = indice.map { lista[$0] }
            guard let nueva: T = Fusion.aplicar(cambio.campos, sobre: anterior, id: id, marca: marca) else { return }
            if let indice { lista[indice] = nueva } else { lista.append(nueva) }
        }

        switch cambio.tipo {
        case "evento": fusionar(&actual.eventos, cambio.id)
        case "idea": fusionar(&actual.ideas, cambio.id)
        case "ocasion": fusionar(&actual.ocasiones, cambio.id)
        case "regalo": fusionar(&actual.regalos, cambio.id)
        case "persona": fusionar(&actual.personas, cambio.id)
        case "comentario":
            var comentarios = actual.comentarios ?? []
            fusionar(&comentarios, cambio.id)
            actual.comentarios = comentarios
        case "atributo_persona":
            var atributos = actual.atributosPersona ?? []
            fusionar(&atributos, cambio.id)
            actual.atributosPersona = atributos
        case "presupuesto":
            if case .texto(let ocasionId)? = cambio.campos["ocasion_id"],
               case .texto(let personaId)? = cambio.campos["persona_id"],
               case .numero(let importe)? = cambio.campos["importe"],
               let indice = actual.ocasiones.firstIndex(where: { $0.id == ocasionId }) {
                var presupuestos = (actual.ocasiones[indice].presupuestos ?? [])
                    .filter { $0.personaId != personaId }
                presupuestos.append(PresupuestoPersona(personaId: personaId, importe: importe))
                actual.ocasiones[indice].presupuestos = presupuestos
            }
        default:
            break
        }

        instantanea = actual
    }

    /// Los estados que nadie mantiene a mano, replicados aquí para que la
    /// interfaz no enseñe una idea «activa» un segundo después de promoverla. El
    /// servidor los recalcula y su versión es la que manda.
    private func derivarEnLocal() {
        guard var actual = instantanea else { return }

        for indice in actual.ideas.indices {
            let suyos = actual.regalos.filter { $0.ideaId == actual.ideas[indice].id }
            if suyos.contains(where: { $0.estado == "entregado" }) {
                actual.ideas[indice].estado = "cerrada"
            } else if !suyos.isEmpty, actual.ideas[indice].estado == "activa" {
                actual.ideas[indice].estado = "en_curso"
            } else if suyos.isEmpty, actual.ideas[indice].estado == "en_curso" {
                actual.ideas[indice].estado = "activa"
            }
        }

        for indice in actual.ocasiones.indices {
            let suyos = actual.regalos.filter { $0.ocasionId == actual.ocasiones[indice].id }
            if !suyos.isEmpty, suyos.allSatisfy({ $0.estado == "entregado" }) {
                actual.ocasiones[indice].estado = "cerrada"
            }
        }

        instantanea = actual
    }

    // MARK: - Sincronización

    func sincronizar() async {
        guard let sesion, let base = configuracion.api, !sincronizando else { return }
        sincronizando = true
        situacion = .sincronizando
        defer { sincronizando = false }

        let cliente = ClienteAPI(base: base, token: sesion.token)

        do {
            let pendientes = await almacen.cola()
            let nueva: Instantanea

            if pendientes.isEmpty {
                nueva = try await cliente.descargar()
            } else {
                let respuesta = try await cliente.subir(pendientes)
                await almacen.vaciarCola()
                nueva = respuesta.instantanea
                let rechazados = respuesta.resultados.filter { !$0.aplicado }
                if !rechazados.isEmpty {
                    mensaje = "El servidor no aceptó \(rechazados.count) cambio(s): \(rechazados.compactMap(\.motivo).joined(separator: "; "))"
                }
            }

            instantanea = nueva
            await almacen.guardar(nueva)
            situacion = .alDia(Date())
        } catch ClienteAPI.Fallo.sesionCaducada {
            await salir()
            mensaje = "La sesión ha caducado. Vuelve a entrar."
        } catch {
            let esRed = (error as? URLError) != nil
            situacion = esRed ? .sinConexion : .error(error.localizedDescription)
        }
    }

    // MARK: - Sesión persistida

    private func guardarSesion(_ nueva: SesionGuardada) {
        sesion = nueva
        if let datos = try? JSONEncoder().encode(nueva) {
            UserDefaults.standard.set(datos, forKey: Self.claveSesion)
        }
    }

    private func leerSesionGuardada() -> SesionGuardada? {
        guard let datos = UserDefaults.standard.data(forKey: Self.claveSesion) else { return nil }
        return try? JSONDecoder().decode(SesionGuardada.self, from: datos)
    }
}

/// Configuración del despliegue, en el `Info.plist` para poder cambiarla sin
/// tocar código.
struct Configuracion {
    var api: URL?

    static var actual: Configuracion {
        let texto = Bundle.main.object(forInfoDictionaryKey: "AgendaAPI") as? String ?? ""
        return Configuracion(api: texto.isEmpty ? nil : URL(string: texto))
    }
}
