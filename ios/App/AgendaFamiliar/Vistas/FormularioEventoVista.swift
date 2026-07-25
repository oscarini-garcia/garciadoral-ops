import SwiftUI
import AgendaFamiliarCore

/// El formulario de evento.
///
/// Tres decisiones de `specs/ux.md` §10.1 se materializan aquí:
///
/// - **El tipo va después de la fecha.** Quien crea un evento tiene en la cabeza
///   el qué y el cuándo, no la taxonomía.
/// - **«De quién es» y «quién va» son campos distintos**, y la diferencia se
///   explica debajo en lenguaje llano, porque sus consecuencias importan.
/// - **La reserva se expresa como acción, no como categoría**: el control dice
///   «ocultarlo a alguien» y al activarse explica qué implica.
struct FormularioEventoVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar

    var evento: Evento?
    var fechaPropuesta: Date?

    @State private var titulo = ""
    @State private var dia = Date()
    @State private var conHora = false
    @State private var hora = Date()
    @State private var tipoId = "otro"
    @State private var ubicacion = ""
    @State private var notas = ""
    @State private var repeticion = "ninguna"
    @State private var protagonistas: Set<String> = []
    @State private var asistentes: Set<String> = []
    @State private var reservado = false
    @State private var mostrarAvanzado = false

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }
    private var categoriaReservada: Categoria? {
        instantanea.categorias.first { !$0.esPublica }
    }

    var body: some View {
        NavigationStack {
            Form {
                // La hoja rápida pide título y día, y con eso guarda. El resto
                // aparece solo si se pide.
                Section {
                    TextField("Comida con los abuelos", text: $titulo)
                    DatePicker("Cuándo", selection: $dia, displayedComponents: .date)
                }

                if evento == nil && !mostrarAvanzado {
                    Section {
                        Button("Más opciones") { withAnimation { mostrarAvanzado = true } }
                    }
                }

                if evento != nil || mostrarAvanzado {
                    Section {
                        Toggle("A una hora concreta", isOn: $conHora)
                        if conHora {
                            DatePicker("Hora", selection: $hora, displayedComponents: .hourAndMinute)
                        }
                    }

                    Section("Qué es") {
                        Picker("Tipo", selection: $tipoId) {
                            ForEach(instantanea.tiposEvento) { tipo in
                                Text("\(tipo.emoji)  \(tipo.nombre)").tag(tipo.id)
                            }
                        }
                        Text("El tipo elige el emoji y propone si el evento lleva regalos.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }

                    Section("De quién es") {
                        ForEach(instantanea.personas) { persona in
                            conmutador(persona, seleccion: $protagonistas)
                        }
                        Text("Determina a quién se le ocultan los regalos de este evento y qué ideas se proponen al asociarlos.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }

                    Section("Quién más va") {
                        ForEach(instantanea.personas) { persona in
                            conmutador(persona, seleccion: $asistentes)
                        }
                        Text("Solo informativo.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }

                    Section {
                        TextField("Dónde", text: $ubicacion)
                        Picker("Se repite", selection: $repeticion) {
                            Text("No se repite").tag("ninguna")
                            Text("Cada semana").tag("semanal")
                            Text("Cada mes").tag("mensual")
                            Text("Cada año").tag("anual")
                        }
                        TextField("Notas", text: $notas, axis: .vertical).lineLimit(2...6)
                    }

                    if categoriaReservada != nil {
                        Section("Reserva") {
                            Toggle("Ocultarlo a alguien", isOn: $reservado)
                            if reservado {
                                Text("El evento desaparece por completo de la agenda de quien no sea administrador: sin hueco, sin marcador y sin llegar a su dispositivo.")
                                    .font(.footnote).foregroundStyle(Color.aviso)
                            }
                        }
                    }
                }
            }
            .navigationTitle(evento == nil ? "Nuevo evento" : "Editar evento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(evento == nil ? "Crear" : "Guardar") { guardar() }
                        .disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear(perform: cargar)
        }
    }

    private func conmutador(_ persona: Persona, seleccion: Binding<Set<String>>) -> some View {
        Button {
            if seleccion.wrappedValue.contains(persona.id) {
                seleccion.wrappedValue.remove(persona.id)
            } else {
                seleccion.wrappedValue.insert(persona.id)
            }
        } label: {
            HStack {
                AvatarVista(persona: persona, lado: 26)
                Text(persona.nombre).foregroundStyle(.primary)
                Spacer()
                if seleccion.wrappedValue.contains(persona.id) {
                    Image(systemName: "checkmark").foregroundStyle(Color.tinta)
                }
            }
        }
    }

    private func cargar() {
        guard let evento else {
            dia = fechaPropuesta ?? Date()
            return
        }
        titulo = evento.titulo
        tipoId = evento.tipoId
        ubicacion = evento.ubicacion ?? ""
        notas = evento.notas ?? ""
        repeticion = evento.repeticion ?? "ninguna"
        reservado = evento.categoriaId != nil
        protagonistas = Set(evento.protagonistas)
        asistentes = Set(evento.todosLosParticipantes).subtracting(protagonistas)

        if let inicio = Calendario.momento(evento.inicio) {
            dia = inicio
            conHora = !evento.todoElDia
            hora = inicio
        }
    }

    private func guardar() {
        let calendario = Calendario.actual
        var componentes = calendario.dateComponents([.year, .month, .day], from: dia)
        if conHora {
            let h = calendario.dateComponents([.hour, .minute], from: hora)
            componentes.hour = h.hour
            componentes.minute = h.minute
        }
        let momento = calendario.date(from: componentes) ?? dia

        let participantes: [ValorJSON] =
            protagonistas.map { .objeto(["persona_id": .texto($0), "rol": .texto("protagonista")]) }
            + asistentes.subtracting(protagonistas).map {
                .objeto(["persona_id": .texto($0), "rol": .texto("asistente")])
            }

        var campos: [String: ValorJSON] = [
            "titulo": .texto(titulo.trimmingCharacters(in: .whitespaces)),
            "tipo_id": .texto(tipoId),
            "inicio": .texto(conHora ? Calendario.isoConHora(momento) : Calendario.iso(momento)),
            "jornada_completa": .indicador(!conHora),
            "ubicacion": .texto(ubicacion),
            "notas": .texto(notas),
            "repeticion": .texto(repeticion),
            "origen": .texto("manual"),
            "autor_id": .texto(estado.yo.id),
            "activo": .indicador(true),
            "participantes": .lista(participantes),
        ]
        campos["categoria_id"] = reservado ? .texto(categoriaReservada?.id ?? "") : .nulo

        estado.guardar("evento", id: evento?.id ?? UUID().uuidString, campos: campos)
        cerrar()
    }
}
