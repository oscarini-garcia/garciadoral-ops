import SwiftUI
import AuthenticationServices
import AgendaFamiliarCore

@main
struct AgendaFamiliarApp: App {
    @StateObject private var estado = Estado()

    var body: some Scene {
        WindowGroup {
            Group {
                if estado.identificado {
                    RaizVista()
                } else {
                    AccesoVista()
                }
            }
            .environmentObject(estado)
            .task { await estado.arrancar() }
            .tint(.tinta)
            .alert("Aviso", isPresented: Binding(
                get: { estado.mensaje != nil },
                set: { if !$0 { estado.mensaje = nil } }
            )) {
                Button("Entendido") { estado.mensaje = nil }
            } message: {
                Text(estado.mensaje ?? "")
            }
        }
    }
}

/// Barra de pestañas para las secciones de primer nivel y nunca para acciones,
/// entre tres y cinco destinos, según la convención de la plataforma.
/// La arquitectura es la opción D de `specs/ux.md`: la semana abre la
/// aplicación y la coordinación de regalos vive en su propia pestaña, que es
/// donde debe estar —se visita con intención, no de paso—.
struct RaizVista: View {
    @EnvironmentObject private var estado: Estado
    @Environment(\.scenePhase) private var fase

    var body: some View {
        TabView {
            SemanaVista()
                .tabItem { Label("Semana", systemImage: "calendar") }
            RegalosVista()
                .tabItem { Label("Regalos", systemImage: "gift") }
            FamiliaVista()
                .tabItem { Label("Familia", systemImage: "person.2") }
            BuscarVista()
                .tabItem { Label("Buscar", systemImage: "magnifyingglass") }
        }
        .onChange(of: fase) { _, nueva in
            if nueva == .active { Task { await estado.sincronizar() } }
        }
    }
}

/// El acceso se realiza exclusivamente mediante Sign in with Apple: no existen
/// credenciales propias ni recuperación de contraseña, lo que elimina toda una
/// categoría de incidencias de soporte (spec funcional §8).
struct AccesoVista: View {
    @EnvironmentObject private var estado: Estado

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Text("AGENDA FAMILIAR")
                .font(.system(.caption2, design: .monospaced))
                .tracking(2)
                .foregroundStyle(.secondary)
            Text("La semana, los regalos\ny la gente.")
                .font(.system(size: 34, weight: .regular, design: .serif))
            Text("Entra con tu identificador de Apple. Un administrador del hogar tiene que haberlo vinculado antes a tu ficha.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            SignInWithAppleButton(.signIn) { peticion in
                peticion.requestedScopes = [.fullName]
            } onCompletion: { resultado in
                switch resultado {
                case .success(let autorizacion):
                    guard
                        let credencial = autorizacion.credential as? ASAuthorizationAppleIDCredential,
                        let datos = credencial.identityToken,
                        let token = String(data: datos, encoding: .utf8)
                    else {
                        estado.mensaje = "Apple no devolvió un token de identidad."
                        return
                    }
                    Task { await estado.entrar(tokenDeApple: token) }
                case .failure(let error):
                    estado.mensaje = error.localizedDescription
                }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)

            Spacer()
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.papel.ignoresSafeArea())
    }
}
