import UIKit

/// Eurojackpot fürs iPhone und iPad: Oberfläche und Rechnung sind dieselben wie in der Browser-Version (web/seite und der
/// von TeaVM übersetzte Java-Code) – sie liegen fertig in der App (Ordner „Inhalt“) und laufen ohne Internet.
/// Gebaut wird auf einem Mac bei GitHub (.github/workflows/ios.yml), weil es hier keinen Mac gibt.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let konfiguration = UISceneConfiguration(name: "Standard", sessionRole: connectingSceneSession.role)
        konfiguration.delegateClass = SzenenDelegate.self
        return konfiguration
    }
}

final class SzenenDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let szene = scene as? UIWindowScene else { return }
        let fenster = UIWindow(windowScene: szene)
        fenster.backgroundColor = Farben.kopf
        fenster.rootViewController = WebAnsicht()
        fenster.makeKeyAndVisible()
        window = fenster
    }
}

/// Farben wie in web/seite/app.css (hell und dunkel).
enum Farben {
    static let kopf = UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: 0x0C1322) : UIColor(rgb: 0x14213D) }
    static let hintergrund = UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: 0x10151D) : UIColor(rgb: 0xF2F4F8) }
}

extension UIColor {
    convenience init(rgb: Int) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255,
                  blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}
