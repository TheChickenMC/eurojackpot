import Foundation
import WebKit

/// Liefert der Seite alles unter „eurojackpot://app/…“:
/// - die Dateien der Oberfläche aus der App (Ordner „Inhalt“, wie die Browser-Version auf GitHub Pages),
/// - /ziehungen.csv: die neueste Liste von GitHub (die Action dort holt nach jeder Ziehung die Zahlen von lotto.de);
///   ohne Netz die zuletzt geholte oder die eingebaute,
/// - /apps.json: die Versionsliste der iPhone-App (für den Update-Hinweis),
/// - /leitung?ziel=https://…: die Online-KI. Die App schickt die Anfrage selbst ab – so gibt es keine Browser-Sperren
///   (CORS) – und reicht die Antwort Stück für Stück weiter, damit sie beim Schreiben erscheint.
/// WebKit ruft alles auf dem Hauptthread auf; die Netz-Rückmeldungen kommen auch dorthin.
final class Inhalt: NSObject, WKURLSchemeHandler, URLSessionDataDelegate {
    static let schema = "eurojackpot"
    private static let netz = Selbsttest.netzBasis ?? URL(string: "https://thechickenmc.github.io/eurojackpot/")!

    private let ordner = Bundle.main.resourceURL!.appendingPathComponent("Inhalt", isDirectory: true).standardizedFileURL
    private lazy var leitungen: URLSession = {
        let k = URLSessionConfiguration.ephemeral
        k.timeoutIntervalForRequest = 120
        k.timeoutIntervalForResource = 900
        k.waitsForConnectivity = false
        return URLSession(configuration: k, delegate: self, delegateQueue: .main)
    }()
    private let abrufe: URLSession = {
        let k = URLSessionConfiguration.ephemeral
        k.timeoutIntervalForRequest = 12
        k.waitsForConnectivity = false
        return URLSession(configuration: k)
    }()

    /// laufende Online-KI-Anfragen: Netz-Aufgabe → Anfrage der Seite
    private var laufend: [Int: WKURLSchemeTask] = [:]
    /// zum Abbrechen: Anfrage der Seite → Netz-Aufgabe
    private var netzAufgaben: [ObjectIdentifier: URLSessionTask] = [:]
    /// von WebKit gestoppt (Seite hat abgebrochen) – an diese Anfragen darf nichts mehr gehen
    private var gestoppt = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start aufgabe: WKURLSchemeTask) {
        guard let url = aufgabe.request.url else { return }
        switch url.path {
        case "/ziehungen.csv":
            ziehungen(aufgabe)
        case "/apps.json":
            abrufen(aufgabe, Self.netz.appendingPathComponent("apps.json")) { daten in
                if let daten = daten {
                    self.antworten(aufgabe, 200, "application/json; charset=utf-8", daten)
                } else {
                    self.antworten(aufgabe, 404, "text/plain; charset=utf-8", Data("nicht erreichbar".utf8))
                }
            }
        case "/leitung":
            leitung(aufgabe, url)
        default:
            datei(aufgabe, url.path)
        }
    }

    func webView(_ webView: WKWebView, stop aufgabe: WKURLSchemeTask) {
        let id = ObjectIdentifier(aufgabe)
        guard let netzAufgabe = netzAufgaben.removeValue(forKey: id) else { return }
        gestoppt.insert(id) // die Netz-Aufgabe meldet sich gleich noch (abgebrochen) und räumt dann auf
        netzAufgabe.cancel()
    }

    // ---------- Dateien aus der App

    private func datei(_ aufgabe: WKURLSchemeTask, _ pfad: String) {
        let name = pfad.isEmpty || pfad == "/" ? "index.html" : String(pfad.dropFirst())
        let ziel = ordner.appendingPathComponent(name).standardizedFileURL
        guard ziel.path.hasPrefix(ordner.path + "/"), let daten = try? Data(contentsOf: ziel) else {
            antworten(aufgabe, 404, "text/plain; charset=utf-8", Data("nicht gefunden".utf8))
            return
        }
        antworten(aufgabe, 200, Self.typ(ziel.pathExtension), daten)
    }

    private static func typ(_ endung: String) -> String {
        switch endung.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "csv": return "text/csv; charset=utf-8"
        case "png": return "image/png"
        case "svg": return "image/svg+xml"
        default: return "application/octet-stream"
        }
    }

    private func antworten(_ aufgabe: WKURLSchemeTask, _ code: Int, _ typ: String, _ daten: Data) {
        let kopf = ["Content-Type": typ, "Content-Length": String(daten.count), "Cache-Control": "no-cache"]
        aufgabe.didReceive(HTTPURLResponse(url: aufgabe.request.url!, statusCode: code, httpVersion: "HTTP/1.1", headerFields: kopf)!)
        aufgabe.didReceive(daten)
        aufgabe.didFinish()
    }

    // ---------- Ziehungen und Versionsliste aus dem Netz

    private var gespeicherteZiehungen: URL {
        let ordner = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: ordner, withIntermediateDirectories: true)
        return ordner.appendingPathComponent("ziehungen.csv")
    }

    private func ziehungen(_ aufgabe: WKURLSchemeTask) {
        abrufen(aufgabe, Self.netz.appendingPathComponent("ziehungen.csv")) { daten in
            var liste: Data? = nil
            if let daten = daten, Self.zeilen(daten) > 100 {
                liste = daten
                try? daten.write(to: self.gespeicherteZiehungen, options: .atomic)
            } else {
                // ohne Netz: die längere von zuletzt geholter und eingebauter Liste (nach einem Update ist die eingebaute neuer)
                let gespeichert = try? Data(contentsOf: self.gespeicherteZiehungen)
                let eingebaut = try? Data(contentsOf: self.ordner.appendingPathComponent("ziehungen.csv"))
                liste = [gespeichert, eingebaut].compactMap { $0 }.max { Self.zeilen($0) < Self.zeilen($1) }
            }
            if let liste = liste {
                self.antworten(aufgabe, 200, "text/csv; charset=utf-8", liste)
            } else {
                self.antworten(aufgabe, 503, "text/plain; charset=utf-8", Data("keine Ziehungen".utf8))
            }
        }
    }

    private static func zeilen(_ daten: Data) -> Int { daten.reduce(0) { $1 == 10 ? $0 + 1 : $0 } }

    /// Holt eine Datei ganz (ohne Zwischenspeicher); `fertig` bekommt nil bei Fehlern – auf dem Hauptthread.
    private func abrufen(_ aufgabe: WKURLSchemeTask, _ url: URL, fertig: @escaping (Data?) -> Void) {
        var anfrage = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 12)
        anfrage.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        let id = ObjectIdentifier(aufgabe)
        let netzAufgabe = abrufe.dataTask(with: anfrage) { daten, antwort, _ in
            let ok = (antwort as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                self.netzAufgaben[id] = nil
                if self.gestoppt.remove(id) != nil { return }
                fertig(ok ? daten : nil)
            }
        }
        netzAufgaben[id] = netzAufgabe
        netzAufgabe.resume()
    }

    // ---------- Online-KI

    private func leitung(_ aufgabe: WKURLSchemeTask, _ url: URL) {
        let quelle = aufgabe.request
        guard let text = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "ziel" })?.value,
              let ziel = URL(string: text), ziel.scheme?.lowercased() == "https" else {
            antworten(aufgabe, 400, "text/plain; charset=utf-8", Data("ungültiges Ziel".utf8))
            return
        }
        var anfrage = URLRequest(url: Selbsttest.umleiten(ziel), cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 120)
        anfrage.httpMethod = quelle.httpMethod ?? "GET"
        let weglassen: Set<String> = ["origin", "referer", "host", "content-length", "accept-encoding", "user-agent", "connection", "cookie"]
        for (name, wert) in quelle.allHTTPHeaderFields ?? [:] where !weglassen.contains(name.lowercased()) {
            anfrage.setValue(wert, forHTTPHeaderField: name)
        }
        if anfrage.httpMethod != "GET" {
            let (koerper, woher) = Self.koerper(quelle)
            anfrage.httpBody = koerper
            Selbsttest.melden("LEITUNG \(anfrage.httpMethod ?? "") \(ziel.host ?? "") Inhalt \(koerper?.count ?? -1) Bytes aus \(woher)")
        }
        let netzAufgabe = leitungen.dataTask(with: anfrage)
        laufend[netzAufgabe.taskIdentifier] = aufgabe
        netzAufgaben[ObjectIdentifier(aufgabe)] = netzAufgabe
        netzAufgabe.resume()
    }

    private static func koerper(_ anfrage: URLRequest) -> (Data?, String) {
        if let daten = anfrage.httpBody { return (daten, "httpBody") }
        guard let strom = anfrage.httpBodyStream else { return (nil, "nichts") }
        strom.open()
        defer { strom.close() }
        var daten = Data()
        var puffer = [UInt8](repeating: 0, count: 65536)
        while true {
            let n = strom.read(&puffer, maxLength: puffer.count)
            if n <= 0 { break }
            daten.append(puffer, count: n)
        }
        return (daten, "httpBodyStream")
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let aufgabe = laufend[dataTask.taskIdentifier], !gestoppt.contains(ObjectIdentifier(aufgabe)) else {
            completionHandler(.cancel)
            return
        }
        let http = response as? HTTPURLResponse
        let kopf = ["Content-Type": http?.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream", "Cache-Control": "no-store"]
        aufgabe.didReceive(HTTPURLResponse(url: aufgabe.request.url!, statusCode: http?.statusCode ?? 502, httpVersion: "HTTP/1.1", headerFields: kopf)!)
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let aufgabe = laufend[dataTask.taskIdentifier], !gestoppt.contains(ObjectIdentifier(aufgabe)) else { return }
        aufgabe.didReceive(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let aufgabe = laufend.removeValue(forKey: task.taskIdentifier) else { return }
        let id = ObjectIdentifier(aufgabe)
        netzAufgaben[id] = nil
        if gestoppt.remove(id) != nil { return }
        if let fehler = error {
            aufgabe.didFailWithError(fehler)
        } else {
            aufgabe.didFinish()
        }
    }
}
