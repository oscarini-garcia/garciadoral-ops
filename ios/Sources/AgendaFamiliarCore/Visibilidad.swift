import Foundation

/// La función de visibilidad del apartado 6 de `specs/modelo-datos.md`.
///
/// **La protección no vive aquí.** El filtrado que cuenta lo hace el servidor
/// antes de transmitir, de modo que este dispositivo nunca llega a almacenar lo
/// que su titular no puede ver. Esta implementación existe por dos motivos:
/// para poder verificar la regla con pruebas del lado del cliente, y para
/// componer vistas previas y datos de ejemplo sin levantar el Worker.
///
/// Aplicarla sobre una instantánea recibida es siempre una operación nula: lo
/// que llega ya la ha atravesado.
public enum Visibilidad {
    public enum Clase: String, Sendable {
        case idea, regalo, evento
    }

    /// Personas **con cuenta** que figuran en la orientación de una idea. Las
    /// etiquetas se ignoran: clasifican, no protegen.
    public static func destinatarios(deIdea idea: Idea, en registro: Instantanea) -> Set<String> {
        let conCuenta = Set(registro.personas.filter(\.conCuenta).map(\.id))
        return Set((idea.orientaciones ?? []).compactMap(\.personaId).filter(conCuenta.contains))
    }

    public static func visible(_ idea: Idea, para observador: Persona, en registro: Instantanea) -> Bool {
        guard observador.conCuenta else { return false }

        // La cláusula del deseo precede a la del destinatario: de lo contrario
        // una persona dejaría de ver su lista en el instante de crearla.
        if idea.esDeseo, idea.autorId == observador.id { return true }

        guard categoriaPermite(idea.categoriaId, observador, registro) else { return false }
        return !destinatarios(deIdea: idea, en: registro).contains(observador.id)
    }

    public static func visible(_ regalo: Regalo, para observador: Persona, en registro: Instantanea) -> Bool {
        guard observador.conCuenta else { return false }
        guard categoriaPermite(regalo.categoriaId, observador, registro) else { return false }
        // La regla no admite excepciones: alcanza también a los administradores.
        return !regalo.destinatarios.contains(observador.id)
    }

    /// Un evento no se oculta por destinatario: es público por defecto y la
    /// reserva se expresa con una categoría. Un cumpleaños no es un secreto.
    public static func visible(_ evento: Evento, para observador: Persona, en registro: Instantanea) -> Bool {
        guard observador.conCuenta else { return false }
        return categoriaPermite(evento.categoriaId, observador, registro)
    }

    private static func categoriaPermite(_ categoriaId: String?,
                                         _ observador: Persona,
                                         _ registro: Instantanea) -> Bool {
        guard let categoria = registro.categoria(categoriaId) else { return true }
        switch categoria.regla {
        case "privada":
            return observador.esAdministrador
        case "restringida":
            // La lista de acceso no viaja al dispositivo: si la categoría llegó,
            // es que el servidor ya concedió el acceso.
            return true
        default:
            return true
        }
    }
}
