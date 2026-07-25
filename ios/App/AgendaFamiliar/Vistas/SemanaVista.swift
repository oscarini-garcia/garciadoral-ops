import SwiftUI
import AgendaFamiliarCore

/// La agenda, con sus tres vistas sobre los mismos datos.
///
/// La semana abre la aplicación: es la unidad real de la vida familiar y, al ser
/// un marco fijo de siete filas, se aprende dónde cae cada día y la lectura se
/// vuelve casi automática (specs/ux.md §8).
struct SemanaVista: View {
    @EnvironmentObject private var estado: Estado

    enum Modo: String, CaseIterable, Identifiable {
        case semana = "Semana", mes = "Mes", lista = "Lista"
        var id: String { rawValue }
    }

    @State private var modo: Modo = .semana
    @State private var ancla = Date()
    @State private var eventoAbierto: Evento?
    @State private var diaAbierto: Date?
    @State private var creando = false

    private var instantanea: Instantanea { estado.instantanea ?? .vacia }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                encabezado
                Divider()
                contenido
            }
            .navigationTitle("Semana")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { IndicadorSincronizacion() }
            }
            .overlay(alignment: .bottomTrailing) { botonCrear }
            .sheet(item: $eventoAbierto) { evento in
                DetalleEventoVista(evento: evento)
            }
            .sheet(item: Binding(
                get: { diaAbierto.map { DiaSeleccionado(fecha: $0) } },
                set: { diaAbierto = $0?.fecha }
            )) { seleccion in
                DiaVista(fecha: seleccion.fecha, alAbrirEvento: { eventoAbierto = $0 })
            }
            .sheet(isPresented: $creando) {
                FormularioEventoVista(evento: nil, fechaPropuesta: ancla)
            }
        }
    }

    private struct DiaSeleccionado: Identifiable {
        var fecha: Date
        var id: String { Calendario.iso(fecha) }
    }

    // MARK: - Encabezado

    private var encabezado: some View {
        VStack(spacing: 10) {
            Picker("Vista", selection: $modo) {
                ForEach(Modo.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            if modo != .lista {
                HStack {
                    Button { mover(-1) } label: { Image(systemName: "chevron.left") }
                        .accessibilityLabel("Anterior")
                    Spacer()
                    Text(rotulo)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button { mover(1) } label: { Image(systemName: "chevron.right") }
                        .accessibilityLabel("Siguiente")
                }
            }
        }
        .padding(.horizontal)
        .padding(.bottom, 10)
    }

    private var rotulo: String {
        if modo == .semana { return Calendario.rango(desdeElLunes: Calendario.lunes(de: ancla)) }
        let componentes = Calendario.actual.dateComponents([.year, .month], from: ancla)
        return "\(Calendario.mesesLargos[(componentes.month ?? 1) - 1]) \(componentes.year ?? 0)"
    }

    private func mover(_ pasos: Int) {
        if modo == .semana {
            ancla = Calendario.sumar(dias: 7 * pasos, a: ancla)
        } else {
            ancla = Calendario.actual.date(byAdding: .month, value: pasos, to: ancla) ?? ancla
        }
    }

    // MARK: - Contenido

    @ViewBuilder
    private var contenido: some View {
        switch modo {
        case .semana: vistaSemana
        case .mes: MesVista(ancla: $ancla, instantanea: instantanea, alAbrirEvento: { eventoAbierto = $0 })
        case .lista: ListaVista(instantanea: instantanea, alAbrirEvento: { eventoAbierto = $0 })
        }
    }

    private var vistaSemana: some View {
        let dias = Calendario.dias(desdeElLunes: Calendario.lunes(de: ancla))
        let reparto = Agenda.repartir(
            Agenda.instancias(instantanea, desde: dias[0], hasta: dias[6]),
            en: dias
        )
        let hoy = Calendario.iso(Date())

        return ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(dias, id: \.self) { dia in
                    let apariciones = reparto[Calendario.iso(dia)] ?? []
                    HStack(alignment: .top, spacing: 10) {
                        Button { diaAbierto = dia } label: {
                            VStack(alignment: .leading, spacing: 0) {
                                Text(Calendario.inicialesDia[Calendario.indiceDia(dia)])
                                    .font(.system(.caption2, design: .monospaced))
                                    .tracking(1.2)
                                    .foregroundStyle(.secondary)
                                Text("\(Calendario.actual.component(.day, from: dia))")
                                    .font(.system(.title3, design: .serif))
                                    .monospacedDigit()
                                    .foregroundStyle(Calendario.iso(dia) == hoy ? Color.tinta : .primary)
                            }
                            .frame(width: 34, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Ver el \(Calendario.fechaLarga(dia))")

                        VStack(alignment: .leading, spacing: 3) {
                            if apariciones.isEmpty {
                                // Los días vacíos son información: enseñan la
                                // forma de la semana, que es lo que se quiere
                                // ver al planificar.
                                Text("—").foregroundStyle(.secondary)
                            } else {
                                ForEach(apariciones.prefix(Calendario.techoEventosDia)) { aparicion in
                                    Button { eventoAbierto = aparicion.evento } label: {
                                        LineaEventoVista(aparicion: aparicion,
                                                         emoji: instantanea.emoji(de: aparicion.evento))
                                    }
                                    .buttonStyle(.plain)
                                }
                                // El recuento se calcula sobre lo visible para
                                // quien mira: un enlace que anunciara dos
                                // eventos más y mostrase uno al abrirlo
                                // revelaría lo que se pretendía ocultar.
                                if apariciones.count > Calendario.techoEventosDia {
                                    Button("y \(apariciones.count - Calendario.techoEventosDia) más") {
                                        diaAbierto = dia
                                    }
                                    .font(.caption)
                                    .foregroundStyle(Color.tinta)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 9)
                    .padding(.horizontal)
                    .background(Calendario.iso(dia) == hoy ? Color.tinta.opacity(0.08) : .clear)

                    Divider()
                }
            }
            .padding(.bottom, 90)
        }
    }

    /// El botón de crear pertenece a la pantalla, no a la aplicación: aquí crea
    /// un evento y en Regalos apunta una idea.
    private var botonCrear: some View {
        Button { creando = true } label: {
            Image(systemName: "plus")
                .font(.title2.weight(.medium))
                .frame(width: 52, height: 52)
                .background(Color.tinta, in: Circle())
                .foregroundStyle(.white)
        }
        .padding(20)
        .accessibilityLabel("Nuevo evento")
    }
}

// MARK: - Mes

struct MesVista: View {
    @Binding var ancla: Date
    var instantanea: Instantanea
    var alAbrirEvento: (Evento) -> Void

    var body: some View {
        let primero = Calendario.actual.date(
            from: Calendario.actual.dateComponents([.year, .month], from: ancla)
        ) ?? ancla
        let arranque = Calendario.lunes(de: primero)
        let celdas = (0..<42).map { Calendario.sumar(dias: $0, a: arranque) }
        let reparto = Agenda.repartir(
            Agenda.instancias(instantanea, desde: celdas[0], hasta: celdas[41]),
            en: celdas
        )
        let mesActual = Calendario.actual.component(.month, from: ancla)

        return ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 2) {
                ForEach(Calendario.inicialesDia, id: \.self) { inicial in
                    Text(inicial)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                ForEach(celdas, id: \.self) { dia in
                    let tiene = !(reparto[Calendario.iso(dia)] ?? []).isEmpty
                    let seleccionado = Calendario.iso(dia) == Calendario.iso(ancla)
                    Button { ancla = dia } label: {
                        VStack(spacing: 3) {
                            Text("\(Calendario.actual.component(.day, from: dia))")
                                .monospacedDigit()
                            Circle()
                                .fill(tiene ? (seleccionado ? Color.white : Color.tinta) : .clear)
                                .frame(width: 4, height: 4)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(seleccionado ? Color.tinta : .clear, in: RoundedRectangle(cornerRadius: 8))
                        .foregroundStyle(seleccionado ? .white
                                         : (Calendario.actual.component(.month, from: dia) == mesActual ? .primary : .secondary))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)

            VStack(alignment: .leading, spacing: 10) {
                TituloGrupo(texto: Calendario.fechaLarga(ancla))
                let delDia = reparto[Calendario.iso(ancla)] ?? []
                if delDia.isEmpty {
                    Text("Nada este día.").foregroundStyle(.secondary)
                }
                ForEach(delDia) { aparicion in
                    Button { alAbrirEvento(aparicion.evento) } label: {
                        TarjetaEventoVista(aparicion: aparicion, instantanea: instantanea)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
        }
    }
}

// MARK: - Lista

struct ListaVista: View {
    var instantanea: Instantanea
    var alAbrirEvento: (Evento) -> Void

    var body: some View {
        let desde = Calendario.soloFecha(Date())
        let hasta = Calendario.sumar(dias: 180, a: desde)
        let instancias = Agenda.instancias(instantanea, desde: desde, hasta: hasta)
            .sorted { $0.inicio < $1.inicio }

        return ScrollView {
            if instancias.isEmpty {
                Text("No hay nada en los próximos seis meses.")
                    .foregroundStyle(.secondary)
                    .padding(.top, 40)
            }
            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(instancias) { instancia in
                    Button {
                        alAbrirEvento(instancia.evento)
                    } label: {
                        TarjetaEventoVista(
                            aparicion: Aparicion(instancia: instancia, dia: Calendario.soloFecha(instancia.inicio)),
                            instantanea: instantanea
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }
}

// MARK: - Día

struct DiaVista: View {
    @Environment(\.dismiss) private var cerrar
    @EnvironmentObject private var estado: Estado
    var fecha: Date
    var alAbrirEvento: (Evento) -> Void

    var body: some View {
        let instantanea = estado.instantanea ?? .vacia
        let reparto = Agenda.repartir(
            Agenda.instancias(instantanea, desde: fecha, hasta: fecha),
            en: [fecha]
        )
        let apariciones = reparto[Calendario.iso(fecha)] ?? []

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if apariciones.isEmpty {
                        Text("Nada este día.").foregroundStyle(.secondary)
                    }
                    ForEach(apariciones) { aparicion in
                        Button {
                            cerrar()
                            alAbrirEvento(aparicion.evento)
                        } label: {
                            TarjetaEventoVista(aparicion: aparicion, instantanea: instantanea)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }
            .navigationTitle(Calendario.fechaLarga(fecha))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Listo") { cerrar() }
                }
            }
        }
    }
}

struct TarjetaEventoVista: View {
    var aparicion: Aparicion
    var instantanea: Instantanea

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(instantanea.emoji(de: aparicion.evento))
                Text(aparicion.evento.titulo).font(.headline)
                Spacer()
                if let hora = aparicion.hora {
                    Text(hora)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            Text(descripcion)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.papelHundido.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
    }

    private var descripcion: String {
        let gente = aparicion.evento.todosLosParticipantes.map { instantanea.nombre($0) }
        return [
            Calendario.fechaLarga(aparicion.dia),
            aparicion.evento.ubicacion?.isEmpty == false ? aparicion.evento.ubicacion : nil,
            gente.isEmpty ? nil : gente.joined(separator: ", "),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }
}

struct IndicadorSincronizacion: View {
    @EnvironmentObject private var estado: Estado

    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(estado.situacion.color).frame(width: 7, height: 7)
            Text(estado.situacion.texto)
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .accessibilityLabel("Sincronización: \(estado.situacion.texto)")
    }
}
