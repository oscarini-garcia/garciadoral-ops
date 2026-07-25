import SwiftUI
import AgendaFamiliarCore

/// Paleta y piezas compartidas. Continúa la identidad del prototipo
/// (`specs/prototipo-v6.html`): papel cálido, tinta verde para la agenda y
/// granate para los regalos.
extension Color {
    static let tinta = Color(red: 0.055, green: 0.431, blue: 0.384)
    static let regalo = Color(red: 0.557, green: 0.231, blue: 0.369)
    static let aviso = Color(red: 0.659, green: 0.392, blue: 0.106)
    static let papel = Color(red: 0.984, green: 0.976, blue: 0.961)
    static let papelHundido = Color(red: 0.949, green: 0.937, blue: 0.910)
    static let selloFondo = Color(red: 0.914, green: 0.933, blue: 0.953)
    static let selloTexto = Color(red: 0.357, green: 0.447, blue: 0.533)

    /// Color estable por persona: el mismo identificador da siempre el mismo
    /// tono, que es lo que sostiene el reconocimiento sin necesidad de fotos.
    static func dePersona(_ id: String) -> Color {
        var suma = 0
        for escalar in id.unicodeScalars { suma = (suma &* 31 &+ Int(escalar.value)) % 360 }
        return Color(hue: Double(suma) / 360, saturation: 0.42, brightness: 0.55)
    }
}

/// El aviso sobre el contenido propio.
///
/// **Se muestra siempre**, exista o no contenido asociado: si apareciera solo
/// cuando hay regalos, su ausencia a mediados de diciembre resultaría tan
/// informativa como su presencia. Y por eso no lleva recuento, ni fecha, ni
/// nada que pueda leerse (spec funcional §3.6).
struct SelloVista: View {
    var pie: String = "Vuelve otro día."

    var body: some View {
        VStack(spacing: 4) {
            Text("Por aquí no se mira")
                .font(.system(.title3, design: .serif))
            Text(pie)
                .font(.footnote)
                .opacity(0.85)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .foregroundStyle(Color.selloTexto)
        .background(Color.selloFondo, in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color.selloTexto.opacity(0.22), style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
        )
        .accessibilityElement(children: .combine)
    }
}

struct AvatarVista: View {
    var persona: Persona
    var lado: CGFloat = 40

    var body: some View {
        Circle()
            .fill(Color.dePersona(persona.id))
            .frame(width: lado, height: lado)
            .overlay(
                Text(persona.iniciales)
                    .font(.system(size: lado * 0.34, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white)
            )
            .accessibilityHidden(true)
    }
}

/// Una línea de evento: emoji, título recortado y hora si la tiene.
///
/// Cada evento ocupa **una sola línea**. La tarjeta amplia se reserva para la
/// vista de día y para el detalle: si cada fila creciera con su contenido, un
/// sábado cargado desplazaría el domingo fuera de la pantalla y se perdería
/// justo aquello que justifica la vista de semana (specs/ux.md §10.2).
struct LineaEventoVista: View {
    var aparicion: Aparicion
    var emoji: String

    var body: some View {
        HStack(spacing: 7) {
            if aparicion.instancia.variosDias {
                // Banda continua en el margen: la jornada forma parte de algo
                // que empezó antes o sigue después.
                Capsule()
                    .fill(Color.tinta.opacity(0.55))
                    .frame(width: 3)
            }
            Text(emoji)
            Text(aparicion.evento.titulo + (aparicion.continuacion ? " (cont.)" : ""))
                .lineLimit(1)
                .truncationMode(.tail)
                .foregroundStyle(aparicion.continuacion ? .secondary : .primary)
            Spacer(minLength: 4)
            if let hora = aparicion.hora {
                Text(hora)
                    .font(.system(.caption, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
        .font(.subheadline)
        .frame(minHeight: 26)
    }
}

struct EtiquetaVista: View {
    var texto: String
    var tono: Color = .secondary

    var body: some View {
        Text(texto)
            .font(.system(.caption2, design: .monospaced))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tono.opacity(0.14), in: Capsule())
            .foregroundStyle(tono)
    }
}

struct TituloGrupo: View {
    var texto: String

    var body: some View {
        Text(texto.uppercased())
            .font(.system(.caption2, design: .monospaced))
            .tracking(1.4)
            .foregroundStyle(.secondary)
    }
}

extension Double {
    var comoImporte: String {
        let formateador = NumberFormatter()
        formateador.numberStyle = .currency
        formateador.currencyCode = "EUR"
        formateador.maximumFractionDigits = 0
        formateador.locale = Locale(identifier: "es_ES")
        return formateador.string(from: NSNumber(value: self)) ?? "\(Int(self)) €"
    }
}
