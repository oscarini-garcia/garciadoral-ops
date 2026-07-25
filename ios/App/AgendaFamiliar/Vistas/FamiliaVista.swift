import SwiftUI
import AgendaFamiliarCore

/// Familia: el registro de personas y, detrás, la ficha.
///
/// La ficha es la pantalla de detalle más valiosa del producto: reúne el
/// histórico derivado, los atributos acumulados y lo que se le puede regalar,
/// justo donde se consultan de verdad —cuando alguien se pregunta qué regalar a
/// esa persona concreta— (specs/ux.md §7 y §11).
struct FamiliaVista: View {
    @EnvironmentObject private var estado: Estado
    @State private var capturando = false

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    private let columnas = [GridItem(.adaptive(minimum: 92), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    grupo("En casa", personas: instantanea.personas.filter(\.conCuenta))
                    let resto = instantanea.personas.filter { !$0.conCuenta }
                    if !resto.isEmpty { grupo("El resto de la familia", personas: resto) }

                    if estado.soyAdministrador {
                        NavigationLink("Añadir una persona") {
                            FichaEditableVista(persona: nil)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding()
            }
            .navigationTitle("Familia")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { IndicadorSincronizacion() } }
            .overlay(alignment: .bottomTrailing) {
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
            .sheet(isPresented: $capturando) { CapturaIdeaVista(paraPersona: nil) }
        }
    }

    private func grupo(_ titulo: String, personas: [Persona]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            TituloGrupo(texto: titulo)
            LazyVGrid(columns: columnas, spacing: 12) {
                ForEach(personas) { persona in
                    NavigationLink { FichaPersonaVista(persona: persona) } label: {
                        VStack(spacing: 7) {
                            AvatarVista(persona: persona, lado: 52)
                            Text(persona.nombre).font(.caption).foregroundStyle(.primary)
                            Text(proximoCumple(persona))
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func proximoCumple(_ persona: Persona) -> String {
        guard let nacimiento = Calendario.momento(persona.fechaNacimiento) else { return " " }
        let calendario = Calendario.actual
        let hoy = Calendario.soloFecha(Date())
        var componentes = calendario.dateComponents([.month, .day], from: nacimiento)
        componentes.year = calendario.component(.year, from: hoy)
        var proximo = calendario.date(from: componentes) ?? hoy
        if proximo < hoy {
            componentes.year = (componentes.year ?? 0) + 1
            proximo = calendario.date(from: componentes) ?? hoy
        }
        let dias = calendario.dateComponents([.day], from: hoy, to: proximo).day ?? 0
        if dias == 0 { return "hoy 🎂" }
        if dias <= 30 { return "en \(dias) d" }
        let c = calendario.dateComponents([.month, .day], from: proximo)
        return "\(c.day ?? 1) \(Calendario.meses[(c.month ?? 1) - 1])"
    }
}

struct FichaPersonaVista: View {
    @EnvironmentObject private var estado: Estado
    var persona: Persona
    @State private var anadiendoAtributo = false
    @State private var capturando = false

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }
    private var esMia: Bool { persona.id == estado.yo.id }

    var body: some View {
        List {
            Section {
                HStack(spacing: 12) {
                    AvatarVista(persona: persona, lado: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text([persona.parentesco, persona.conCuenta ? persona.rol : "sin cuenta"]
                            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        if let nacimiento = Calendario.momento(persona.fechaNacimiento) {
                            let c = Calendario.actual.dateComponents([.month, .day], from: nacimiento)
                            Text("Cumple el \(c.day ?? 1) de \(Calendario.mesesLargos[(c.month ?? 1) - 1])")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Lo que conviene recordar") {
                let atributos = instantanea.atributos(de: persona.id)
                if atributos.isEmpty { Text("Nada apuntado todavía.").foregroundStyle(.secondary) }
                ForEach(atributos) { atributo in
                    HStack {
                        Text(atributo.clave).foregroundStyle(.secondary)
                        Spacer()
                        Text(atributo.valor)
                    }
                }
                Button("Añadir un dato") { anadiendoAtributo = true }
            }

            Section(esMia ? "Lo que pides" : "Lo que pide \(persona.nombre)") {
                let deseos = instantanea.deseos(de: persona.id)
                if deseos.isEmpty { Text("Nada por ahora.").foregroundStyle(.secondary) }
                ForEach(deseos) { idea in
                    NavigationLink(idea.titulo) { DetalleIdeaVista(idea: idea) }
                }
                if esMia { Button("Añadir un deseo") { capturando = true } }
            }

            if esMia {
                // Sobre el contenido propio, un panel siempre presente. Al ser
                // constante, no informa de nada: ni su aparición ni su
                // desaparición pueden interpretarse.
                Section {
                    SelloVista(pie: "Lo que otros hayan pensado para ti no se enseña aquí.")
                        .listRowBackground(Color.clear)
                }
            } else {
                Section("Ideas para regalarle") {
                    let ideas = instantanea.ideas(para: persona.id)
                    if ideas.isEmpty { Text("Ninguna todavía.").foregroundStyle(.secondary) }
                    ForEach(ideas) { idea in
                        NavigationLink { DetalleIdeaVista(idea: idea) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(idea.titulo)
                                Text("de \(instantanea.nombre(idea.autorId))"
                                     + (idea.estado == "en_curso" ? " · en curso" : ""))
                                .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                    Button("Apuntar una idea para \(persona.nombre)") { capturando = true }
                }

                Section("Lo que ya recibió") {
                    let historico = instantanea.historico(de: persona.id)
                    if historico.isEmpty { Text("Sin campañas cerradas todavía.").foregroundStyle(.secondary) }
                    ForEach(historico) { regalo in
                        NavigationLink { DetalleRegaloVista(regalo: regalo) } label: {
                            FilaRegaloVista(regalo: regalo, instantanea: instantanea)
                        }
                    }
                }
            }

            if estado.soyAdministrador {
                Section {
                    NavigationLink("Editar la ficha") { FichaEditableVista(persona: persona) }
                }
            }
        }
        .navigationTitle(persona.nombre)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $anadiendoAtributo) { AtributoVista(personaId: persona.id) }
        .sheet(isPresented: $capturando) { CapturaIdeaVista(paraPersona: persona.id) }
    }
}

struct AtributoVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar
    var personaId: String

    @State private var clave = ""
    @State private var valor = ""

    var body: some View {
        NavigationStack {
            Form {
                // Las claves son de creación libre y se sugieren las ya usadas:
                // un catálogo cerrado envejecería mal, porque lo que conviene
                // recordar de un sobrino no se parece a lo de un padre.
                TextField("talla de calzado", text: $clave)
                TextField("39", text: $valor)
                if !usadas.isEmpty {
                    Section("Ya se usan en casa") {
                        ForEach(usadas, id: \.self) { sugerencia in
                            Button(sugerencia) { clave = sugerencia }
                        }
                    }
                }
            }
            .navigationTitle("Añadir un dato")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancelar") { cerrar() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Guardar") {
                        estado.guardar("atributo_persona", id: UUID().uuidString, campos: [
                            "persona_id": .texto(personaId),
                            "clave": .texto(clave.trimmingCharacters(in: .whitespaces)),
                            "valor": .texto(valor.trimmingCharacters(in: .whitespaces)),
                            "activo": .indicador(true),
                        ])
                        cerrar()
                    }
                    .disabled(clave.isEmpty || valor.isEmpty)
                }
            }
        }
    }

    private var usadas: [String] {
        let todas = (estado.instantanea?.atributosPersona ?? []).map(\.clave)
        return Array(Set(todas)).sorted()
    }
}

/// Alta y edición de personas, reservada a los administradores. La carga inicial
/// del registro es manual a propósito: una importación desde los contactos del
/// teléfono arrastraría duplicados y datos irrelevantes (spec funcional §2).
struct FichaEditableVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.dismiss) private var cerrar
    var persona: Persona?

    @State private var nombre = ""
    @State private var apellidos = ""
    @State private var conNacimiento = false
    @State private var nacimiento = Date()
    @State private var parentesco = ""
    @State private var rol = ""
    @State private var apple = ""

    var body: some View {
        Form {
            Section {
                TextField("Nombre", text: $nombre)
                TextField("Apellidos", text: $apellidos)
                TextField("Parentesco", text: $parentesco)
            }
            Section {
                Toggle("Conozco su fecha de nacimiento", isOn: $conNacimiento)
                if conNacimiento {
                    DatePicker("Nació el", selection: $nacimiento, displayedComponents: .date)
                }
                Text("De aquí sale su cumpleaños en la agenda, todos los años y sin tocar nada.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Acceso") {
                Picker("Rol", selection: $rol) {
                    Text("Sin cuenta").tag("")
                    Text("Miembro").tag("miembro")
                    Text("Administrador").tag("administrador")
                }
                TextField("Identificador de Apple", text: $apple)
                    .textInputAutocapitalization(.never)
                Text("Se obtiene del error que muestra la pantalla de acceso la primera vez que esa persona intenta entrar.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(persona == nil ? "Nueva persona" : "Editar ficha")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Guardar") { guardar() }.disabled(nombre.isEmpty)
            }
        }
        .onAppear(perform: cargar)
    }

    private func cargar() {
        guard let persona else { return }
        nombre = persona.nombre
        apellidos = persona.apellidos ?? ""
        parentesco = persona.parentesco ?? ""
        rol = persona.conCuenta ? (persona.rol ?? "miembro") : ""
        apple = persona.identificadorApple ?? ""
        if let fecha = Calendario.momento(persona.fechaNacimiento) {
            conNacimiento = true
            nacimiento = fecha
        }
    }

    private func guardar() {
        estado.guardar("persona", id: persona?.id ?? UUID().uuidString, campos: [
            "nombre": .texto(nombre.trimmingCharacters(in: .whitespaces)),
            "apellidos": .texto(apellidos),
            "fecha_nacimiento": conNacimiento ? .texto(Calendario.iso(nacimiento)) : .nulo,
            "parentesco": .texto(parentesco),
            "tiene_cuenta": .indicador(!rol.isEmpty),
            "rol": rol.isEmpty ? .nulo : .texto(rol),
            "identificador_apple": apple.isEmpty ? .nulo : .texto(apple),
            "activa": .indicador(true),
        ])
        cerrar()
    }
}
