import Foundation

/// Entidades de la Agenda Familiar, tal como llegan en la instantánea que
/// compone el servidor (`specs/modelo-datos.md` §2).
///
/// Lo que hay aquí es un reflejo exacto de `scripts/agenda/modelo.py` y de las
/// tablas de `api/migraciones/0001_esquema.sql`. Las claves del JSON van en
/// `snake_case` y se traducen con `convertFromSnakeCase`, de modo que no hace
/// falta escribir `CodingKeys` para cada tipo.

// MARK: - Sobre los indicadores
//
// Los campos booleanos llegan siempre como `true`/`false`: el Worker los
// normaliza al leer de SQLite, precisamente para que aquí baste con `Bool?` y
// no haga falta un decodificador tolerante. Se declaran opcionales porque un
// registro antiguo puede no traerlos, y cada uno expone su valor por defecto.

// MARK: - Personas

public struct Persona: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var nombre: String
    public var apellidos: String? = nil
    public var fechaNacimiento: String? = nil
    public var parentesco: String? = nil
    public var tieneCuenta: Bool? = nil
    public var identificadorApple: String? = nil
    public var rol: String? = nil
    public var activa: Bool? = nil

    public var conCuenta: Bool { tieneCuenta ?? false }
    public var estaActiva: Bool { activa ?? true }
    public var esAdministrador: Bool { conCuenta && rol == "administrador" }

    /// Sin imágenes en la primera versión: el avatar se genera con las iniciales.
    public var iniciales: String {
        let partes = "\(nombre) \(apellidos ?? "")"
            .split(separator: " ")
            .prefix(2)
        return partes.compactMap { $0.first }.map(String.init).joined().uppercased()
    }
}

public struct AtributoPersona: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var personaId: String
    public var clave: String
    public var valor: String
}

// MARK: - Clasificación

public struct Categoria: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var nombre: String
    /// `publica`, `restringida` o `privada`.
    public var regla: String
    public var orden: Int? = nil

    public var esPublica: Bool { regla == "publica" }
}

public struct Etiqueta: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var nombre: String
}

// MARK: - Agenda

public struct TipoEvento: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var nombre: String
    public var emoji: String
    public var llevaRegalos: Bool? = nil
    public var orden: Int? = nil

    public var proponeRegalos: Bool { llevaRegalos ?? false }
}

public struct ParticipanteEvento: Codable, Hashable, Sendable {
    public var personaId: String
    public var rol: String? = nil

    public var esProtagonista: Bool { rol == "protagonista" }
}

public struct Evento: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var titulo: String
    public var tipoId: String
    public var emoji: String? = nil
    /// Marca local e ingenua: `2026-07-28` o `2026-07-28T18:00:00`.
    public var inicio: String
    public var fin: String? = nil
    public var jornadaCompleta: Bool? = nil
    public var ubicacion: String? = nil
    public var notas: String? = nil
    public var repeticion: String? = nil
    public var repeticionHasta: String? = nil
    public var llevaRegalos: Bool? = nil
    public var categoriaId: String? = nil
    public var origen: String? = nil
    public var personaOrigenId: String? = nil
    public var calendarioId: String? = nil
    public var participantes: [ParticipanteEvento]? = nil

    /// Una marca de diez caracteres es una fecha suelta, sin hora.
    public var todoElDia: Bool { jornadaCompleta ?? (inicio.count == 10) }

    /// De los tres orígenes solo el manual admite edición completa; en los otros
    /// dos son editables el emoji, la asociación de regalos y los avisos.
    public var editable: Bool { (origen ?? "manual") == "manual" }

    public var protagonistas: [String] {
        (participantes ?? []).filter(\.esProtagonista).map(\.personaId)
    }

    public var todosLosParticipantes: [String] {
        (participantes ?? []).map(\.personaId)
    }
}

// MARK: - Ideas

public struct OrientacionIdea: Codable, Hashable, Sendable {
    public var personaId: String? = nil
    public var etiquetaId: String? = nil
}

public struct Idea: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    /// `sugerencia` o `deseo`. El deseo no es una entidad aparte: es un valor.
    public var tipo: String? = nil
    public var titulo: String
    public var descripcion: String? = nil
    public var categoriaId: String? = nil
    public var precioMin: Double? = nil
    public var precioMax: Double? = nil
    public var enlace: String? = nil
    public var establecimiento: String? = nil
    public var estado: String? = nil
    public var autorId: String
    public var creadoEn: String? = nil
    public var orientaciones: [OrientacionIdea]? = nil

    public var esDeseo: Bool { tipo == "deseo" }
}

// MARK: - Ocasiones y regalos

public struct PresupuestoPersona: Codable, Hashable, Sendable {
    public var personaId: String
    public var importe: Double
}

public struct Ocasion: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var nombre: String
    public var fecha: String
    public var estado: String? = nil
    public var eventoId: String? = nil
    public var participantes: [String]? = nil
    public var presupuestos: [PresupuestoPersona]? = nil

    public var abierta: Bool { (estado ?? "abierta") == "abierta" }
}

public struct Regalo: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var ocasionId: String
    public var ideaId: String? = nil
    public var destinatarioPrincipalId: String
    public var compartido: Bool? = nil
    public var codestinatarios: [String]? = nil
    public var responsableId: String? = nil
    public var costeReal: Double? = nil
    public var estado: String? = nil
    public var categoriaId: String? = nil

    /// La ocultación alcanza al destinatario principal y a todos los
    /// co-destinatarios: un regalo conjunto para dos hermanas figura en la
    /// lista de una y queda oculto para ambas.
    public var destinatarios: Set<String> {
        Set([destinatarioPrincipalId] + (codestinatarios ?? []))
    }
}

public struct Comentario: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var objetoTipo: String
    public var objetoId: String
    public var autorId: String
    public var texto: String
    public var creadoEn: String? = nil
}

// MARK: - Instantánea

public struct Yo: Codable, Hashable, Sendable {
    public var id: String
    public var nombre: String
    public var rol: String? = nil

    public var esAdministrador: Bool { rol == "administrador" }
}

/// Lo que el servidor transmite a un dispositivo: **solo** lo que su titular
/// puede ver. El cliente no vuelve a evaluar la visibilidad porque nunca recibe
/// nada que debiera ocultar.
public struct Instantanea: Codable, Sendable {
    public var generadoEn: String? = nil
    public var yo: Yo
    public var personas: [Persona]
    public var atributosPersona: [AtributoPersona]? = nil
    public var categorias: [Categoria]
    public var etiquetas: [Etiqueta]? = nil
    public var tiposEvento: [TipoEvento]
    public var emojisPermitidos: [String]? = nil
    public var eventos: [Evento]
    public var ideas: [Idea]
    public var ocasiones: [Ocasion]
    public var regalos: [Regalo]
    public var comentarios: [Comentario]? = nil

    public static var vacia: Instantanea {
        Instantanea(
            generadoEn: nil,
            yo: Yo(id: "", nombre: "", rol: nil),
            personas: [], atributosPersona: [], categorias: [], etiquetas: [],
            tiposEvento: [], emojisPermitidos: [], eventos: [], ideas: [],
            ocasiones: [], regalos: [], comentarios: []
        )
    }
}

// MARK: - Consultas

public extension Instantanea {
    func persona(_ id: String?) -> Persona? {
        guard let id else { return nil }
        return personas.first { $0.id == id }
    }

    func nombre(_ id: String?) -> String { persona(id)?.nombre ?? "—" }

    func categoria(_ id: String?) -> Categoria? {
        guard let id else { return nil }
        return categorias.first { $0.id == id }
    }

    func tipoEvento(_ id: String) -> TipoEvento? {
        tiposEvento.first { $0.id == id }
    }

    /// El emoji propio del evento sustituye al de su tipo. No es decoración: en
    /// una fila de una sola línea es lo que permite reconocer un evento sin
    /// leerlo (spec funcional §4.3).
    func emoji(de evento: Evento) -> String {
        if let propio = evento.emoji, !propio.isEmpty { return propio }
        return tipoEvento(evento.tipoId)?.emoji ?? "📌"
    }

    /// Valor propuesto por el tipo salvo corrección expresa del evento.
    func llevaRegalos(_ evento: Evento) -> Bool {
        if let propio = evento.llevaRegalos { return propio }
        return tipoEvento(evento.tipoId)?.proponeRegalos ?? false
    }

    /// La condición estática que enciende el aviso «Por aquí no se mira».
    /// Nunca un recuento recibido del servidor.
    func esMio(_ evento: Evento) -> Bool {
        guard !yo.id.isEmpty else { return false }
        if evento.personaOrigenId == yo.id { return true }
        return evento.protagonistas.contains(yo.id)
    }

    func ocasion(deEvento eventoId: String) -> Ocasion? {
        ocasiones.first { $0.eventoId == eventoId }
    }

    func regalos(deOcasion ocasionId: String) -> [Regalo] {
        regalos.filter { $0.ocasionId == ocasionId }
    }

    func regalos(deOcasion ocasionId: String, para personaId: String) -> [Regalo] {
        regalos(deOcasion: ocasionId).filter { $0.destinatarios.contains(personaId) }
    }

    func comentarios(de tipo: String, id: String) -> [Comentario] {
        (comentarios ?? []).filter { $0.objetoTipo == tipo && $0.objetoId == id }
    }

    /// Banco: lo activo y lo que está en curso, que permanece a la vista
    /// señalado con su ocasión para que nadie lo registre por su cuenta.
    var banco: [Idea] {
        ideas.filter { !$0.esDeseo && ["activa", "en_curso"].contains($0.estado ?? "activa") }
    }

    func deseos(de personaId: String) -> [Idea] {
        ideas.filter { $0.esDeseo && $0.autorId == personaId && $0.estado != "descartada" }
    }

    func ideas(para personaId: String) -> [Idea] {
        ideas.filter { idea in
            !idea.esDeseo && (idea.orientaciones ?? []).contains { $0.personaId == personaId }
        }
    }

    func atributos(de personaId: String) -> [AtributoPersona] {
        (atributosPersona ?? []).filter { $0.personaId == personaId }
    }

    /// Histórico derivado por consulta sobre las ocasiones cerradas. No existe
    /// entidad de histórico, de modo que no puede divergir del dato de origen.
    func historico(de personaId: String) -> [Regalo] {
        let cerradas = Set(ocasiones.filter { !$0.abierta }.map(\.id))
        return regalos.filter { cerradas.contains($0.ocasionId) && $0.destinatarios.contains(personaId) }
    }

    /// Gasto registrado y regalos sin importe, separados a propósito: mezclarlos
    /// mostraría una desviación favorable inexistente (spec funcional §6.3).
    func gasto(ocasion ocasionId: String, persona personaId: String) -> (registrado: Double, sinImporte: Int) {
        let suyos = regalos(deOcasion: ocasionId, para: personaId)
        let conImporte = suyos.compactMap(\.costeReal)
        return (conImporte.reduce(0, +), suyos.count - conImporte.count)
    }
}

// MARK: - Codificadores

public enum JSON {
    public static var decodificador: JSONDecoder {
        let decodificador = JSONDecoder()
        decodificador.keyDecodingStrategy = .convertFromSnakeCase
        return decodificador
    }

    public static var codificador: JSONEncoder {
        let codificador = JSONEncoder()
        codificador.keyEncodingStrategy = .convertToSnakeCase
        return codificador
    }
}
