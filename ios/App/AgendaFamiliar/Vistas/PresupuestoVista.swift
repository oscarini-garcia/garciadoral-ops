import SwiftUI
import AgendaFamiliarCore

/// El panel de presupuesto, reservado a los administradores.
///
/// Distingue el gasto **registrado** del total e indica cuántos regalos carecen
/// de importe. De no hacerlo mostraría una desviación favorable inexistente y el
/// panel dejaría de merecer confianza (spec funcional §6.3).
struct PresupuestoVista: View {
    @EnvironmentObject private var estado: Estado
    @State private var edicion: [String: String] = [:]

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        let abiertas = instantanea.ocasiones.filter(\.abierta)

        return List {
            if abiertas.isEmpty {
                Text("Ninguna campaña abierta que presupuestar.").foregroundStyle(.secondary)
            }

            ForEach(abiertas) { ocasion in
                Section(ocasion.nombre) {
                    ForEach(ocasion.participantes ?? [], id: \.self) { personaId in
                        fila(ocasion: ocasion, personaId: personaId)
                    }
                    resumen(de: ocasion)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func fila(ocasion: Ocasion, personaId: String) -> some View {
        let clave = "\(ocasion.id):\(personaId)"
        let previsto = (ocasion.presupuestos ?? []).first { $0.personaId == personaId }?.importe
        let gasto = instantanea.gasto(ocasion: ocasion.id, persona: personaId)

        return HStack {
            Text(instantanea.nombre(personaId))
            Spacer()
            TextField("—", text: Binding(
                get: { edicion[clave] ?? previsto.map { String(Int($0)) } ?? "" },
                set: { edicion[clave] = $0 }
            ))
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .frame(width: 70)
            .onSubmit { guardar(ocasion: ocasion, personaId: personaId, clave: clave) }

            Text(gasto.registrado.comoImporte)
                .font(.system(.subheadline, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 70, alignment: .trailing)

            if gasto.sinImporte > 0 {
                EtiquetaVista(texto: "\(gasto.sinImporte) sin anotar", tono: .aviso)
            }
        }
    }

    private func resumen(de ocasion: Ocasion) -> some View {
        let previsto = (ocasion.presupuestos ?? []).reduce(0.0) { $0 + $1.importe }
        var registrado = 0.0
        var sinImporte = 0
        for personaId in ocasion.participantes ?? [] {
            let gasto = instantanea.gasto(ocasion: ocasion.id, persona: personaId)
            registrado += gasto.registrado
            sinImporte += gasto.sinImporte
        }

        return VStack(alignment: .leading, spacing: 6) {
            ProgressView(value: previsto > 0 ? min(1, registrado / previsto) : 0)
                .tint(registrado > previsto && previsto > 0 ? Color.regalo : Color.tinta)
            Text("Previsto \(previsto.comoImporte) · registrado \(registrado.comoImporte)"
                 + (sinImporte > 0 ? " · \(sinImporte) sin importe anotado" : ""))
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
    }

    private func guardar(ocasion: Ocasion, personaId: String, clave: String) {
        let texto = (edicion[clave] ?? "").replacingOccurrences(of: ",", with: ".")
        estado.guardar("presupuesto", id: clave, campos: [
            "ocasion_id": .texto(ocasion.id),
            "persona_id": .texto(personaId),
            "importe": .numero(Double(texto) ?? 0),
        ])
    }
}

/// Captura en un gesto: un campo de título y un botón de guardar. La
/// clasificación se ofrece debajo pero no se reclama. Si registrar una idea
/// cuesta más de diez segundos, no se registra (specs/ux.md §2 y §3).
struct CapturaIdeaVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar

    var paraPersona: String?

    @State private var titulo = ""
    @State private var descripcion = ""
    @State private var categoriaId = ""
    @State private var precio = ""
    @State private var enlace = ""
    @State private var destinatarios: Set<String> = []
    @State private var etiquetas: Set<String> = []
    @State private var clasificando = false

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Botas de montar", text: $titulo)
                }

                if !clasificando {
                    Section {
                        Button("Clasificarla") { withAnimation { clasificando = true } }
                    }
                } else {
                    Section("Para quién") {
                        ForEach(instantanea.personas) { persona in
                            Button {
                                if destinatarios.contains(persona.id) { destinatarios.remove(persona.id) }
                                else { destinatarios.insert(persona.id) }
                            } label: {
                                HStack {
                                    Text(persona.nombre).foregroundStyle(.primary)
                                    Spacer()
                                    if destinatarios.contains(persona.id) {
                                        Image(systemName: "checkmark").foregroundStyle(Color.tinta)
                                    }
                                }
                            }
                        }
                        Text("Nombrar a una persona con cuenta oculta la idea para ella, de forma automática y permanente.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }

                    if let disponibles = instantanea.etiquetas, !disponibles.isEmpty {
                        Section("O un perfil") {
                            ForEach(disponibles) { etiqueta in
                                Button {
                                    if etiquetas.contains(etiqueta.id) { etiquetas.remove(etiqueta.id) }
                                    else { etiquetas.insert(etiqueta.id) }
                                } label: {
                                    HStack {
                                        Text(etiqueta.nombre).foregroundStyle(.primary)
                                        Spacer()
                                        if etiquetas.contains(etiqueta.id) {
                                            Image(systemName: "checkmark").foregroundStyle(Color.tinta)
                                        }
                                    }
                                }
                            }
                            if !etiquetas.isEmpty {
                                // La advertencia aparece en el momento en que se
                                // necesita, no en una pantalla de bienvenida.
                                Text("Las etiquetas clasifican pero no ocultan: una idea etiquetada como «adolescente» la ven también las hijas. Para reservarla, nombra a la persona.")
                                    .font(.footnote).foregroundStyle(Color.aviso)
                            }
                        }
                    }

                    Section {
                        TextField("Descripción", text: $descripcion, axis: .vertical).lineLimit(2...5)
                        Picker("Categoría", selection: $categoriaId) {
                            Text("Sin categoría").tag("")
                            ForEach(instantanea.categorias) { Text($0.nombre).tag($0.id) }
                        }
                        TextField("Precio aproximado", text: $precio).keyboardType(.decimalPad)
                        TextField("Enlace", text: $enlace).keyboardType(.URL).textInputAutocapitalization(.never)
                    }
                }
            }
            .navigationTitle("Apuntar una idea")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Guardar") { guardar() }
                        .disabled(titulo.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                if let paraPersona { destinatarios = [paraPersona] }
            }
        }
    }

    private func guardar() {
        // Una idea cuyo destinatario es su propio autor se trata como deseo: de
        // otro modo la ocultación la haría desaparecer al crearla (§3.4).
        let soloYo = destinatarios == [estado.yo.id] && etiquetas.isEmpty

        let orientaciones: [ValorJSON] =
            destinatarios.map { .objeto(["persona_id": .texto($0)]) }
            + etiquetas.map { .objeto(["etiqueta_id": .texto($0)]) }

        estado.guardar("idea", id: UUID().uuidString, campos: [
            "tipo": .texto(soloYo ? "deseo" : "sugerencia"),
            "titulo": .texto(titulo.trimmingCharacters(in: .whitespaces)),
            "descripcion": .texto(descripcion),
            "categoria_id": categoriaId.isEmpty ? .nulo : .texto(categoriaId),
            "precio_max": precio.isEmpty ? .nulo : .numero(Double(precio.replacingOccurrences(of: ",", with: ".")) ?? 0),
            "enlace": .texto(enlace),
            "estado": .texto("activa"),
            "autor_id": .texto(estado.yo.id),
            "activa": .indicador(true),
            "orientaciones": .lista(orientaciones),
        ])
        cerrar()
    }
}
