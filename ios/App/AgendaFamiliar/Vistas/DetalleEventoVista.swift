import SwiftUI
import AgendaFamiliarCore

struct DetalleEventoVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar

    var evento: Evento
    @State private var editando = false
    @State private var eligiendoEmoji = false
    @State private var asociando = false
    @State private var comentario = ""

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 12) {
                        Text(instantanea.emoji(de: evento)).font(.largeTitle)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cuando)
                            Text(detalle).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }

                if !evento.todosLosParticipantes.isEmpty {
                    Section("Quién va") {
                        ForEach(evento.todosLosParticipantes, id: \.self) { id in
                            if let persona = instantanea.persona(id) {
                                HStack {
                                    AvatarVista(persona: persona, lado: 28)
                                    Text(persona.nombre)
                                    if evento.protagonistas.contains(id) {
                                        Spacer()
                                        EtiquetaVista(texto: "de quien es", tono: .tinta)
                                    }
                                }
                            }
                        }
                    }
                }

                if let notas = evento.notas, !notas.isEmpty {
                    Section("Notas") { Text(notas) }
                }

                if !evento.editable {
                    Section {
                        Text(evento.origen == "derivado"
                             ? "Este cumpleaños sale de la ficha de la persona. Para corregirlo, cambia allí su fecha de nacimiento."
                             : "Este evento llega de un calendario externo y se corrige en su origen.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    }
                }

                if let categoria = instantanea.categoria(evento.categoriaId), !categoria.esPublica {
                    Section {
                        Label("Reservado: este evento no existe en la agenda de quien no tiene acceso.",
                              systemImage: "eye.slash")
                        .font(.footnote)
                        .foregroundStyle(Color.aviso)
                    }
                }

                bloqueDeRegalos
                bloqueDeComentarios
            }
            .navigationTitle(evento.titulo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cerrar") { cerrar() } }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    // El emoji es editable en cualquier origen: es un dato
                    // propio de esta aplicación y no del sistema de origen.
                    Button { eligiendoEmoji = true } label: { Image(systemName: "face.smiling") }
                        .accessibilityLabel("Cambiar el emoji")
                    if evento.editable {
                        Button("Editar") { editando = true }
                    }
                }
            }
            .sheet(isPresented: $editando) {
                FormularioEventoVista(evento: evento, fechaPropuesta: nil)
            }
            .sheet(isPresented: $eligiendoEmoji) { selectorDeEmoji }
            .sheet(isPresented: $asociando) {
                SelectorDeRegaloVista(evento: evento, ocasion: nil, destinatarioPropuesto: nil)
            }
        }
    }

    private var cuando: String {
        guard let inicio = Calendario.momento(evento.inicio) else { return evento.inicio }
        return Calendario.fechaLarga(inicio)
    }

    private var detalle: String {
        let inicio = Calendario.momento(evento.inicio)
        return [
            evento.todoElDia ? "Todo el día" : inicio.map { Calendario.hora($0) },
            instantanea.tipoEvento(evento.tipoId)?.nombre,
            evento.ubicacion?.isEmpty == false ? evento.ubicacion : nil,
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    /// El bloque de regalos no es contenido único: se compone para cada
    /// observador. Sobre el evento propio se muestra el aviso, **siempre**.
    @ViewBuilder
    private var bloqueDeRegalos: some View {
        if instantanea.llevaRegalos(evento) {
            if instantanea.esMio(evento) {
                Section { SelloVista().listRowBackground(Color.clear) }
            } else {
                Section("Regalos") {
                    let ocasion = instantanea.ocasion(deEvento: evento.id)
                    let regalos = ocasion.map { instantanea.regalos(deOcasion: $0.id) } ?? []
                    if regalos.isEmpty {
                        Text("Todavía no hay ninguno.").foregroundStyle(.secondary)
                    }
                    ForEach(regalos) { regalo in
                        NavigationLink { DetalleRegaloVista(regalo: regalo) } label: {
                            FilaRegaloVista(regalo: regalo, instantanea: instantanea)
                        }
                    }
                    Button("Asociar un regalo") { asociando = true }
                }
            }
        }
    }

    private var bloqueDeComentarios: some View {
        Section("Comentarios") {
            let comentarios = instantanea.comentarios(de: "evento", id: evento.id)
            if comentarios.isEmpty {
                Text("Nadie ha dicho nada todavía.").foregroundStyle(.secondary)
            }
            ForEach(comentarios) { entrada in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(instantanea.nombre(entrada.autorId)) · \(String((entrada.creadoEn ?? "").prefix(10)))")
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Text(entrada.texto)
                }
            }
            HStack {
                TextField("Escribe un comentario", text: $comentario)
                Button("Enviar") { enviarComentario() }
                    .disabled(comentario.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func enviarComentario() {
        let texto = comentario.trimmingCharacters(in: .whitespaces)
        guard !texto.isEmpty else { return }
        comentario = ""
        estado.guardar("comentario", id: UUID().uuidString, campos: [
            "objeto_tipo": .texto("evento"),
            "objeto_id": .texto(evento.id),
            "autor_id": .texto(estado.yo.id),
            "texto": .texto(texto),
            "activo": .indicador(true),
        ])
    }

    /// Selección acotada de unas veinte opciones: no se abre el teclado completo
    /// de emojis, porque la variedad ilimitada convierte la semana en un mosaico
    /// ruidoso y destruye el reconocimiento que se buscaba (spec funcional §4.3).
    private var selectorDeEmoji: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 5), spacing: 8) {
                    ForEach(instantanea.emojisPermitidos ?? [], id: \.self) { emoji in
                        Button {
                            estado.guardar("evento", id: evento.id, campos: ["emoji": .texto(emoji)])
                            eligiendoEmoji = false
                        } label: {
                            Text(emoji)
                                .font(.title)
                                .frame(width: 52, height: 52)
                                .background(instantanea.emoji(de: evento) == emoji ? Color.tinta.opacity(0.15) : .clear,
                                            in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Elegir emoji")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}
