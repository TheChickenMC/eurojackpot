import UIKit
import WebKit

/// Zeigt die Oberfläche (Inhalt/index.html) im Vollbild. Alles kommt über das eigene Schema „eurojackpot://app/…“ aus der
/// App (``Inhalt``); die Seite merkt daran, dass sie in der App läuft (kein Service Worker, Online-KI über die App).
final class WebAnsicht: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private let inhalt = Inhalt()

    override func loadView() {
        let konfiguration = WKWebViewConfiguration()
        konfiguration.setURLSchemeHandler(inhalt, forURLScheme: Inhalt.schema)
        konfiguration.websiteDataStore = .default()
        let steuerung = WKUserContentController()
        let bote = Bote(self)
        steuerung.add(bote, name: "app")
        steuerung.addUserScript(WKUserScript(source: Self.appInfo(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        if Selbsttest.an {
            steuerung.add(bote, name: "protokoll")
            if let datei = Bundle.main.url(forResource: "selbsttest", withExtension: "js"),
               let skript = try? String(contentsOf: datei, encoding: .utf8) {
                // schon am Anfang, damit es auch Fehler beim Start der Seite mitbekommt – los geht es erst nach „load“
                steuerung.addUserScript(WKUserScript(source: skript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            }
        }
        konfiguration.userContentController = steuerung

        let web = WKWebView(frame: .zero, configuration: konfiguration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        web.scrollView.contentInsetAdjustmentBehavior = .never // die Seite rechnet selbst mit env(safe-area-inset-*)
        web.isOpaque = false
        web.backgroundColor = Farben.hintergrund
        web.scrollView.backgroundColor = Farben.hintergrund
        web.underPageBackgroundColor = Farben.kopf
        if #available(iOS 16.4, *) { web.isInspectable = Selbsttest.an }
        webView = web
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: URL(string: Inhalt.schema + "://app/index.html")!))
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    /// Version und Build der App für die Seite (Update-Hinweis, Anzeige in den Einstellungen).
    private static func appInfo() -> String {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "?"
        let build = Selbsttest.wert("-build") ?? (info["CFBundleVersion"] as? String ?? "0")
        var werte = ["plattform": "ios", "version": version, "build": build]
        if let lauf = Selbsttest.wert("-selbsttest") { werte["test"] = lauf }
        let daten = try? JSONSerialization.data(withJSONObject: werte)
        return "window.EJ_APP = " + String(data: daten ?? Data("{}".utf8), encoding: .utf8)! + ";"
    }

    // ---------- Nachrichten der Seite

    fileprivate func empfangen(_ nachricht: WKScriptMessage) {
        if nachricht.name == "protokoll" {
            Selbsttest.melden(String(describing: nachricht.body))
            return
        }
        guard let daten = nachricht.body as? [String: Any], let art = daten["art"] as? String else { return }
        switch art {
        case "updaten":
            // SideStore oder AltStore öffnen, dort wird aktualisiert – sonst die Download-Seite
            oeffnen(["sidestore://", "altstore://", "https://github.com/TheChickenMC/eurojackpot/releases/latest"])
        case "link":
            if let text = daten["adresse"] as? String, let url = URL(string: text) { oeffnen([url.absoluteString]) }
        default:
            break
        }
    }

    private func oeffnen(_ adressen: [String]) {
        guard let erste = adressen.first else { return }
        guard let url = URL(string: erste) else { oeffnen(Array(adressen.dropFirst())); return }
        UIApplication.shared.open(url, options: [:]) { [weak self] ok in
            if !ok { self?.oeffnen(Array(adressen.dropFirst())) }
        }
    }

    // ---------- Links nach draußen öffnen in Safari, die App selbst bleibt auf ihrer Seite

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let schema = url.scheme?.lowercased() else {
            decisionHandler(.cancel)
            return
        }
        if schema == Inhalt.schema || schema == "about" || schema == "blob" || schema == "data" {
            decisionHandler(.allow)
            return
        }
        if ["http", "https", "mailto", "tel"].contains(schema) { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            UIApplication.shared.open(url)
        }
        return nil
    }

    /// iOS hat den Inhalt beendet (z. B. Speicher knapp, App lange im Hintergrund): neu laden statt weißer Fläche.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Selbsttest.melden("INHALT BEENDET – lade neu")
        webView.reload()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Selbsttest.melden("LADEFEHLER " + error.localizedDescription)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Selbsttest.melden("LADEFEHLER " + error.localizedDescription)
    }
}

/// WKUserContentController hält seine Empfänger fest – über diesen Boten nur schwach, sonst bliebe die Ansicht ewig im Speicher.
private final class Bote: NSObject, WKScriptMessageHandler {
    private weak var ansicht: WebAnsicht?

    init(_ ansicht: WebAnsicht) { self.ansicht = ansicht }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        ansicht?.empfangen(message)
    }
}
