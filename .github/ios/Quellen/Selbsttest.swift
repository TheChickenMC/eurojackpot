import Foundation

/// Nur für den automatischen Test im iPhone-Simulator (.github/ios/Test/ablauf.py), sonst ohne Wirkung.
/// Start mit „-selbsttest 1“: Die App führt selbsttest.js aus und schreibt jeden Schritt nach stderr.
/// „-netzbasis http://127.0.0.1:…/“ holt Ziehungen und Versionsliste von dort, „-kibasis http://127.0.0.1:…/“ leitet die
/// Online-KI auf eine Attrappe um, „-build 1“ gibt eine alte Build-Nummer vor (dann muss der Update-Hinweis kommen).
enum Selbsttest {
    private static let argumente = ProcessInfo.processInfo.arguments

    static let an = argumente.contains("-selbsttest")

    static func wert(_ name: String) -> String? {
        guard an, let i = argumente.firstIndex(of: name), i + 1 < argumente.count else { return nil }
        return argumente[i + 1]
    }

    static var netzBasis: URL? { wert("-netzbasis").flatMap { URL(string: $0) } }

    static func umleiten(_ url: URL) -> URL {
        guard let basis = wert("-kibasis") else { return url }
        let text = url.absoluteString
        for (anbieter, pfad) in [("https://api.anthropic.com/", "claude/"), ("https://api.openai.com/", "openai/"),
                                 ("https://generativelanguage.googleapis.com/", "gemini/")] where text.hasPrefix(anbieter) {
            return URL(string: basis + pfad + text.dropFirst(anbieter.count)) ?? url
        }
        return url
    }

    /// „-protokoll <datei>“: direkt in diese Datei schreiben – über stderr kamen die Zeilen nur schubweise an.
    private static let datei: FileHandle? = {
        guard let pfad = wert("-protokoll"), FileManager.default.createFile(atPath: pfad, contents: nil) else { return nil }
        return FileHandle(forWritingAtPath: pfad)
    }()

    static func melden(_ text: String) {
        guard an else { return }
        let daten = Data((text + "\n").utf8)
        if let datei = datei {
            datei.write(daten)
        } else {
            FileHandle.standardError.write(daten)
        }
    }
}
