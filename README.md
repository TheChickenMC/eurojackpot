# Eurojackpot

Alle Eurojackpot-Ziehungen, Statistik, Diagramme, Vorhersage und ein Assistent, der Fragen zu den Zahlen beantwortet.

| Gerät | So geht's |
|---|---|
| **Windows** | [EuroJackpot.exe](https://github.com/TheChickenMC/eurojackpot/releases/latest/download/EuroJackpot.exe) herunterladen und starten – keine Installation nötig |
| **Android** | [EuroJackpot.apk](https://github.com/TheChickenMC/eurojackpot/releases/latest/download/EuroJackpot.apk) herunterladen und installieren |
| **Mac mit Apple-Chip** (M1 bis M5) | [EuroJackpot-Mac.dmg](https://github.com/TheChickenMC/eurojackpot/releases/latest/download/EuroJackpot-Mac.dmg) öffnen und EuroJackpot auf „Programme“ ziehen – Anleitung unten |
| **Mac mit Intel** | [EuroJackpot-Mac-Intel.dmg](https://github.com/TheChickenMC/eurojackpot/releases/latest/download/EuroJackpot-Mac-Intel.dmg) – sonst genauso |
| **iPhone / iPad** | [EuroJackpot.ipa](https://github.com/TheChickenMC/eurojackpot/releases/latest/download/EuroJackpot.ipa) mit SideStore oder AltStore installieren – Anleitung unten |

Updates kommen von selbst. Die Ziehungen stammen von lotto.de.

## Mac

Läuft ab macOS 13.3 Ventura, auch auf macOS 15 Sequoia und macOS 26. Welcher Chip? Apple-Menü → **Über diesen Mac** → „Chip: Apple M…“
oder „Prozessor: … Intel …“.

1. Das passende DMG herunterladen und öffnen, **EuroJackpot** auf den Ordner **Programme** ziehen.
2. EuroJackpot in **Programme** öffnen. Beim ersten Mal meldet macOS, dass es die App nicht prüfen kann (sie kommt nicht
   aus dem App Store) – auf **Fertig** klicken.
3. Apple-Menü → **Systemeinstellungen** → **Datenschutz & Sicherheit** → ganz unten bei „EuroJackpot“ auf **Dennoch öffnen**
   klicken und mit dem Mac-Passwort bestätigen. Das ist nur einmal nötig.

   Oder im Terminal: `xattr -dr com.apple.quarantine /Applications/EuroJackpot.app`

Updates installiert die App danach selbst. Die lokale KI rechnet auf Macs mit Apple-Chip über die Grafik und ist dort
sehr schnell; unter **KI-Modell → Suchen** gibt es weitere Modelle von Hugging Face.

## iPhone und iPad

Apps außerhalb des App Stores lässt Apple nur über einen Umweg zu: Die App wird mit deiner eigenen (kostenlosen)
Apple-ID signiert. Das erledigt **SideStore** (empfohlen) oder **AltStore** – beide sind kostenlos.

1. SideStore einmalig einrichten (dafür braucht man einmal einen PC oder Mac): [docs.sidestore.io](https://docs.sidestore.io).
   Alternativ AltStore: [altstore.io](https://altstore.io).
2. In SideStore unter **Quellen** diese Quelle hinzufügen und dort **Eurojackpot** installieren:
   ```
   https://thechickenmc.github.io/eurojackpot/apps.json
   ```
   Oder [EuroJackpot.ipa](https://github.com/TheChickenMC/eurojackpot/releases/latest/download/EuroJackpot.ipa) herunterladen
   und über **Teilen → SideStore** öffnen.
3. Ab iOS 16 einmal den **Entwicklermodus** einschalten: Einstellungen → Datenschutz & Sicherheit → Entwicklermodus.

Gut zu wissen:

- Mit einer kostenlosen Apple-ID gilt die Signatur 7 Tage. SideStore erneuert sie von selbst, wenn du es ab und zu öffnest
  (oder tippe auf **Refresh**). Es gehen höchstens 3 solcher Apps gleichzeitig.
- Neue Versionen zeigt SideStore bzw. AltStore als Update an – die App weist auch selbst darauf hin.

Glücksspiel kann süchtig machen. Hilfe: [check-dein-spiel.de](https://www.check-dein-spiel.de) · 0800 1 37 27 00 (kostenlos)
