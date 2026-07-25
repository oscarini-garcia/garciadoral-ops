import SwiftUI
import AgendaFamiliarCore

/// Regalos: el banco de ideas y las campañas, unificados en una sección porque
/// son el mismo objeto en dos momentos de su vida (specs/ux.md §6).
struct RegalosVista: View {
    @EnvironmentObject private var estado: Estado

    enum Seccion: String, CaseIterable, Identifiable {
        case banco = "Banco", campanas = "Campañas", presupuesto = "Presupuesto"
        var id: String { rawValue }
    }

    @State private var seccion: Seccion = .banco
    @State private var capturando = false
    @State private var filtro: String?

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Sección", selection: $seccion) {
                    ForEach(secciones) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.bottom, 8)

                switch seccion {
                case .banco: banco
                case .campanas: campanas
                case .presupuesto: PresupuestoVista()
                }
            }
            .navigationTitle("Regalos")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { IndicadorSincronizacion() } }
            .overlay(alignment: .bottomTrailing) {
                if seccion != .presupuesto {
                    Button { capturando = true } label: {
                        Image(systemName: "plus")
                            .font(.title2.weight(.medium))
                            .frame(width: 52, height: 52)
                            .background(Color.tinta, in: Circle())
                            .foregroundStyle(.white)
                    }
                    .padding(20)
                    .accessibilityLabel("Apuntar una idea")
                }
            }
            .sheet(isPresented: $capturando) { CapturaIdeaVista(paraPersona: filtro) }
        }
    }

    private var secciones: [Seccion] {
        // El panel de presupuesto queda reservado a los administradores.
        estado.soyAdministrador ? Seccion.allCases : [.banco, .campanas]
    }

    // MARK: - Banco

    private var banco: some View {
        let ideas = instantanea.banco.filter { idea in
            guard let filtro else { return true }
            return (idea.orientaciones ?? []).contains { $0.personaId == filtro }
        }

        return List {
            Section("Para quién") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 7) {
                        chip("Todo", activo: filtro == nil) { filtro = nil }
                        ForEach(instantanea.personas) { persona in
                            chip(persona.nombre, activo: filtro == persona.id) {
                                filtro = filtro == persona.id ? nil : persona.id
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("\(ideas.count) \(ideas.count == 1 ? "idea" : "ideas")") {
                if ideas.isEmpty {
                    Text("Nada por aquí todavía. El botón de abajo apunta una idea en diez segundos.")
                        .foregroundStyle(.secondary)
                }
                ForEach(ideas) { idea in
                    NavigationLink { DetalleIdeaVista(idea: idea) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(idea.titulo).font(.headline)
                                if idea.estado == "en_curso" {
                                    Spacer()
                                    // En curso permanece a la vista, señalada
                                    // con su ocasión: retirarla invitaría a que
                                    // otra persona la registrase de nuevo.
                                    EtiquetaVista(texto: "en curso", tono: .regalo)
                                }
                            }
                            Text(descripcion(de: idea))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func descripcion(de idea: Idea) -> String {
        let destinos = (idea.orientaciones ?? []).compactMap { orientacion -> String? in
            if let personaId = orientacion.personaId { return instantanea.nombre(personaId) }
            if let etiquetaId = orientacion.etiquetaId {
                return (instantanea.etiquetas ?? []).first { $0.id == etiquetaId }?.nombre
            }
            return nil
        }
        return [
            destinos.isEmpty ? "Sin destinatario" : "Para \(destinos.joined(separator: ", "))",
            instantanea.categoria(idea.categoriaId)?.nombre,
            "de \(instantanea.nombre(idea.autorId))",
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    private func chip(_ texto: String, activo: Bool, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            Text(texto)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(activo ? Color.tinta : Color.papelHundido, in: Capsule())
                .foregroundStyle(activo ? .white : .primary)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Campañas

    private var campanas: some View {
        let ocasiones = instantanea.ocasiones.sorted {
            $0.abierta == $1.abierta ? $0.fecha < $1.fecha : $0.abierta
        }

        return List {
            if ocasiones.isEmpty {
                Text("Ninguna campaña todavía.").foregroundStyle(.secondary)
            }
            ForEach(ocasiones) { ocasion in
                NavigationLink { DetalleOcasionVista(ocasion: ocasion) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(ocasion.nombre).font(.headline)
                            Spacer()
                            EtiquetaVista(texto: ocasion.fecha)
                        }
                        Text(resumen(de: ocasion))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func resumen(de ocasion: Ocasion) -> String {
        let regalos = instantanea.regalos(deOcasion: ocasion.id)
        let pendientes = regalos.filter { $0.estado == "pendiente" }.count
        let mios = regalos.filter { $0.responsableId == estado.yo.id && $0.estado == "pendiente" }.count
        return [
            "\(ocasion.participantes?.count ?? 0) personas",
            "\(regalos.count) regalos",
            pendientes > 0 ? "\(pendientes) por comprar" : "todo comprado",
            mios > 0 ? "tú tienes \(mios)" : nil,
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }
}

// MARK: - Ocasión

struct DetalleOcasionVista: View {
    @EnvironmentObject private var estado: Estado
    var ocasion: Ocasion
    @State private var anadiendoPara: String?

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        List {
            ForEach(ocasion.participantes ?? [], id: \.self) { personaId in
                Section(instantanea.nombre(personaId)) {
                    // Un miembro ve todas las listas salvo la suya propia, en
                    // cuyo lugar aparece el aviso (spec funcional §6.1).
                    if personaId == estado.yo.id {
                        SelloVista().listRowBackground(Color.clear)
                    } else {
                        let regalos = instantanea.regalos(deOcasion: ocasion.id, para: personaId)
                        if regalos.isEmpty {
                            Text("Sin nada asignado.").foregroundStyle(.secondary)
                        }
                        ForEach(regalos) { regalo in
                            NavigationLink { DetalleRegaloVista(regalo: regalo) } label: {
                                FilaRegaloVista(regalo: regalo, instantanea: instantanea)
                            }
                        }
                        Button("Añadir un regalo para \(instantanea.nombre(personaId))") {
                            anadiendoPara = personaId
                        }
                        .font(.subheadline)
                    }
                }
            }
        }
        .navigationTitle(ocasion.nombre)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: Binding(
            get: { anadiendoPara.map { Destinatario(id: $0) } },
            set: { anadiendoPara = $0?.id }
        )) { destinatario in
            SelectorDeRegaloVista(evento: nil, ocasion: ocasion, destinatarioPropuesto: destinatario.id)
        }
    }

    private struct Destinatario: Identifiable { var id: String }
}

struct FilaRegaloVista: View {
    var regalo: Regalo
    var instantanea: Instantanea

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(titulo).font(.headline)
                Spacer()
                EtiquetaVista(texto: regalo.estado ?? "pendiente", tono: .regalo)
            }
            Text(detalle).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private var titulo: String {
        guard let ideaId = regalo.ideaId,
              let idea = instantanea.ideas.first(where: { $0.id == ideaId }) else { return "Regalo" }
        return idea.titulo
    }

    private var detalle: String {
        [
            regalo.responsableId.map { "lo lleva \(instantanea.nombre($0))" } ?? "sin responsable",
            regalo.costeReal?.comoImporte,
            (regalo.compartido ?? false) ? "compartido" : nil,
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }
}

// MARK: - Regalo

struct DetalleRegaloVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar
    var regalo: Regalo

    @State private var estadoRegalo = "pendiente"
    @State private var responsable = ""
    @State private var coste = ""

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        Form {
            Section {
                Text("Para \(instantanea.nombre(regalo.destinatarioPrincipalId))")
            }

            Section("Cómo va") {
                Picker("Estado", selection: $estadoRegalo) {
                    Text("Pendiente").tag("pendiente")
                    Text("Comprado").tag("comprado")
                    Text("Envuelto").tag("envuelto")
                    Text("Entregado").tag("entregado")
                }
                .onChange(of: estadoRegalo) { _, nuevo in
                    estado.guardar("regalo", id: regalo.id, campos: ["estado": .texto(nuevo)])
                }
            }

            Section("Quién lo lleva") {
                Picker("Responsable", selection: $responsable) {
                    Text("Sin responsable").tag("")
                    ForEach(instantanea.personas.filter(\.conCuenta)) { persona in
                        Text(persona.nombre).tag(persona.id)
                    }
                }
                .onChange(of: responsable) { _, nuevo in
                    estado.guardar("regalo", id: regalo.id,
                                   campos: ["responsable_id": nuevo.isEmpty ? .nulo : .texto(nuevo)])
                }
                Text("Marcarlo evita que otra persona lo compre por segunda vez.")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section("Lo que costó") {
                TextField("Opcional", text: $coste)
                    .keyboardType(.decimalPad)
                    .onSubmit(guardarCoste)
                Text("Sin él, el panel de presupuesto lo dice en lugar de fingir un ahorro.")
                    .font(.footnote).foregroundStyle(.secondary)
            }

            Section {
                Button("Quitar de la campaña", role: .destructive) {
                    estado.retirar("regalo", id: regalo.id)
                    cerrar()
                }
            }
        }
        .navigationTitle("Regalo")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            estadoRegalo = regalo.estado ?? "pendiente"
            responsable = regalo.responsableId ?? ""
            coste = regalo.costeReal.map { String($0) } ?? ""
        }
        .onDisappear(perform: guardarCoste)
    }

    private func guardarCoste() {
        let limpio = coste.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        let valor: ValorJSON = limpio.isEmpty ? .nulo : .numero(Double(limpio) ?? 0)
        estado.guardar("regalo", id: regalo.id, campos: ["coste_real": valor])
    }
}

// MARK: - Idea

struct DetalleIdeaVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar
    var idea: Idea
    @State private var promoviendo = false

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        Form {
            if let descripcion = idea.descripcion, !descripcion.isEmpty {
                Section { Text(descripcion) }
            }
            Section {
                Text([instantanea.categoria(idea.categoriaId)?.nombre,
                      idea.establecimiento?.isEmpty == false ? idea.establecimiento : nil,
                      "apuntada por \(instantanea.nombre(idea.autorId))"]
                    .compactMap { $0 }.joined(separator: " · "))
                .font(.footnote).foregroundStyle(.secondary)
                if let enlace = idea.enlace, let url = URL(string: enlace), !enlace.isEmpty {
                    Link("Abrir el enlace", destination: url)
                }
            }
            Section {
                if idea.estado == "descartada" {
                    Button("Reactivar") {
                        estado.guardar("idea", id: idea.id, campos: ["estado": .texto("activa")])
                        cerrar()
                    }
                } else {
                    Button("Llevar a una campaña") { promoviendo = true }
                    Button("Descartar", role: .destructive) {
                        estado.guardar("idea", id: idea.id, campos: ["estado": .texto("descartada")])
                        cerrar()
                    }
                }
            }
        }
        .navigationTitle(idea.titulo)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $promoviendo) {
            PromoverIdeaVista(idea: idea)
        }
    }
}

struct PromoverIdeaVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar
    var idea: Idea

    @State private var ocasionId = ""
    @State private var personaId = ""

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }
    private var abiertas: [Ocasion] { instantanea.ocasiones.filter(\.abierta) }

    var body: some View {
        NavigationStack {
            Form {
                if abiertas.isEmpty {
                    Text("No hay ninguna campaña abierta.").foregroundStyle(.secondary)
                } else {
                    Picker("Campaña", selection: $ocasionId) {
                        ForEach(abiertas) { Text("\($0.nombre) · \($0.fecha)").tag($0.id) }
                    }
                    Picker("Para quién", selection: $personaId) {
                        ForEach(instantanea.personas) { Text($0.nombre).tag($0.id) }
                    }
                }
            }
            .navigationTitle("Llevar a una campaña")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Añadir") { anadir() }.disabled(ocasionId.isEmpty || personaId.isEmpty)
                }
            }
            .onAppear {
                ocasionId = abiertas.first?.id ?? ""
                personaId = (idea.orientaciones ?? []).compactMap(\.personaId).first
                    ?? instantanea.personas.first?.id ?? ""
            }
        }
    }

    private func anadir() {
        Regalos.crear(estado: estado, ocasionId: ocasionId, destinatario: personaId, idea: idea)
        cerrar()
    }
}

// MARK: - Selector de regalo

/// Propone las ideas orientadas a los participantes, lo que acota la búsqueda
/// sin impedir la selección de cualquier otra. Es una comodidad de uso y no un
/// control de acceso: la protección está en el filtrado del servidor.
struct SelectorDeRegaloVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar

    var evento: Evento?
    var ocasion: Ocasion?
    var destinatarioPropuesto: String?

    @State private var destinatario = ""

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        NavigationStack {
            List {
                Section("Para quién") {
                    Picker("Destinatario", selection: $destinatario) {
                        ForEach(instantanea.personas.filter { $0.id != estado.yo.id }) {
                            Text($0.nombre).tag($0.id)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                }

                let relevantes = Set((evento?.todosLosParticipantes ?? ocasion?.participantes ?? [])
                    .filter { $0 != estado.yo.id })
                let banco = instantanea.banco
                let propuestas = banco.filter { idea in
                    (idea.orientaciones ?? []).contains { orientacion in
                        orientacion.personaId.map(relevantes.contains) ?? false
                    }
                }
                let resto = banco.filter { idea in !propuestas.contains(where: { $0.id == idea.id }) }

                if !propuestas.isEmpty {
                    Section("Del banco, para quien participa") {
                        ForEach(propuestas) { idea in
                            Button(idea.titulo) { elegir(idea) }
                        }
                    }
                }
                if !resto.isEmpty {
                    Section("El resto del banco") {
                        ForEach(resto) { idea in
                            Button(idea.titulo) { elegir(idea) }
                        }
                    }
                }
                Section {
                    Button("Crear un regalo suelto, sin idea previa") { elegir(nil) }
                }
            }
            .navigationTitle("Asociar un regalo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { cerrar() } } }
            .onAppear {
                destinatario = destinatarioPropuesto
                    ?? (evento?.protagonistas.first { $0 != estado.yo.id })
                    ?? instantanea.personas.first { $0.id != estado.yo.id }?.id
                    ?? ""
            }
        }
    }

    private func elegir(_ idea: Idea?) {
        var destino = ocasion
        if destino == nil, let evento {
            destino = Regalos.asegurarOcasion(estado: estado, evento: evento)
        }
        guard let destino else { return }
        Regalos.crear(estado: estado, ocasionId: destino.id, destinatario: destinatario, idea: idea)
        cerrar()
    }
}

enum Regalos {
    /// Cuando se asocia un regalo desde un evento que todavía no tiene ocasión
    /// vinculada, esta se crea de forma automática (spec funcional §6.4).
    @MainActor
    static func asegurarOcasion(estado: Estado, evento: Evento) -> Ocasion {
        let instantanea = estado.instantanea ?? .vacia
        if let existente = instantanea.ocasion(deEvento: evento.id) { return existente }

        let id = UUID().uuidString
        let participantes = Array(Set(evento.todosLosParticipantes))
        estado.guardar("ocasion", id: id, campos: [
            "nombre": .texto(evento.titulo),
            "fecha": .texto(String(evento.inicio.prefix(10))),
            "estado": .texto("abierta"),
            "evento_id": .texto(evento.id),
            "autor_id": .texto(estado.yo.id),
            "activa": .indicador(true),
            "participantes": .lista(participantes.map { .texto($0) }),
        ])
        return estado.instantanea?.ocasiones.first { $0.id == id }
            ?? Ocasion(id: id, nombre: evento.titulo, fecha: String(evento.inicio.prefix(10)),
                       estado: "abierta", eventoId: evento.id, participantes: participantes, presupuestos: [])
    }

    @MainActor
    static func crear(estado: Estado, ocasionId: String, destinatario: String, idea: Idea?) {
        estado.guardar("regalo", id: UUID().uuidString, campos: [
            "ocasion_id": .texto(ocasionId),
            "idea_id": idea.map { ValorJSON.texto($0.id) } ?? .nulo,
            "destinatario_principal_id": .texto(destinatario),
            "compartido": .indicador(false),
            "estado": .texto("pendiente"),
            "categoria_id": idea?.categoriaId.map { ValorJSON.texto($0) } ?? .nulo,
            "autor_id": .texto(estado.yo.id),
            "activo": .indicador(true),
        ])

        if let ocasion = estado.instantanea?.ocasiones.first(where: { $0.id == ocasionId }),
           !(ocasion.participantes ?? []).contains(destinatario) {
            let nuevos = (ocasion.participantes ?? []) + [destinatario]
            estado.guardar("ocasion", id: ocasionId,
                           campos: ["participantes": .lista(nuevos.map { .texto($0) })])
        }
    }
}
