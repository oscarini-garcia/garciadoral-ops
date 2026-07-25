import SwiftUI
import AgendaFamiliarCore

/// Búsqueda global sobre Ideas y Ocasiones, que es el alcance de la primera
/// versión (spec funcional §3.5).
///
/// No hace falta volver a evaluar la visibilidad: lo que hay en el dispositivo
/// ya pasó por ella en el servidor. Buscar sobre lo que se tiene es, por
/// construcción, buscar solo sobre lo visible, y los recuentos salen de ese
/// mismo conjunto.
struct BuscarVista: View {
    @EnvironmentObject private var estado: Estado
    @State private var consulta = ""

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        NavigationStack {
            List {
                if aguja.count < 2 {
                    Text("Escribe al menos dos letras.").foregroundStyle(.secondary)
                } else if ideas.isEmpty && ocasiones.isEmpty && regalos.isEmpty {
                    Text("Nada con ese nombre.").foregroundStyle(.secondary)
                } else {
                    if !ideas.isEmpty {
                        Section("Ideas (\(ideas.count))") {
                            ForEach(ideas) { idea in
                                NavigationLink { DetalleIdeaVista(idea: idea) } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(idea.titulo)
                                        Text([idea.esDeseo ? "deseo" : "idea",
                                              instantanea.categoria(idea.categoriaId)?.nombre,
                                              idea.estado]
                                            .compactMap { $0 }.joined(separator: " · "))
                                        .font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                    if !ocasiones.isEmpty {
                        Section("Campañas (\(ocasiones.count))") {
                            ForEach(ocasiones) { ocasion in
                                NavigationLink { DetalleOcasionVista(ocasion: ocasion) } label: {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(ocasion.nombre)
                                        Text("\(ocasion.fecha) · \(ocasion.estado ?? "abierta")")
                                            .font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                    if !regalos.isEmpty {
                        Section("Regalos (\(regalos.count))") {
                            ForEach(regalos) { regalo in
                                NavigationLink { DetalleRegaloVista(regalo: regalo) } label: {
                                    FilaRegaloVista(regalo: regalo, instantanea: instantanea)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Buscar")
            .searchable(text: $consulta, prompt: "Buscar entre ideas y campañas")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { IndicadorSincronizacion() } }
        }
    }

    private var aguja: String { normalizar(consulta).trimmingCharacters(in: .whitespaces) }

    private func normalizar(_ texto: String) -> String {
        texto.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_ES"))
    }

    private func coincide(_ partes: String?...) -> Bool {
        partes.compactMap { $0 }.contains { normalizar($0).contains(aguja) }
    }

    private var ideas: [Idea] {
        guard aguja.count >= 2 else { return [] }
        return instantanea.ideas.filter { coincide($0.titulo, $0.descripcion, $0.establecimiento) }
    }

    private var ocasiones: [Ocasion] {
        guard aguja.count >= 2 else { return [] }
        return instantanea.ocasiones.filter { coincide($0.nombre) }
    }

    private var regalos: [Regalo] {
        guard aguja.count >= 2 else { return [] }
        return instantanea.regalos.filter { regalo in
            let idea = regalo.ideaId.flatMap { id in instantanea.ideas.first { $0.id == id } }
            return coincide(idea?.titulo, instantanea.nombre(regalo.destinatarioPrincipalId))
        }
    }
}
