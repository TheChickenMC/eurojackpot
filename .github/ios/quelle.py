"""Traegt eine neue Version der iPhone-App in die Quelle fuer SideStore und AltStore ein (apps.json auf GitHub Pages).
Dort fuegt man https://thechickenmc.github.io/eurojackpot/apps.json einmal als Quelle hinzu - danach zeigen beide
Updates von selbst an. Format: https://faq.altstore.io/developers/make-a-source
Aufruf: python3 quelle.py <apps.json> <version> <build> <EuroJackpot.ipa> <owner/repo> [notizen.txt]"""
import datetime
import json
import os
import sys

datei, version, build, ipa, repo = sys.argv[1:6]
notizen = ""
if len(sys.argv) > 6 and os.path.exists(sys.argv[6]):
    with open(sys.argv[6], encoding="utf-8") as f:
        notizen = f.read().strip()[:2000]
if not notizen:
    notizen = "Verbesserungen und Fehlerbehebungen."

besitzer, name = repo.split("/")
seiten = "https://%s.github.io/%s/" % (besitzer.lower(), name)
BUNDLE = "lotto.eurojackpot.tabelle"

quelle = {}
if os.path.exists(datei):
    with open(datei, encoding="utf-8") as f:
        quelle = json.load(f)
quelle.update({
    "name": "Eurojackpot",
    "identifier": "lotto.eurojackpot.quelle",
    "sourceURL": seiten + "apps.json",
    "subtitle": "Ziehungen, Statistik und Assistent",
    "description": "Die Eurojackpot-App fürs iPhone und iPad.",
    "iconURL": seiten + "symbol-512.png",
    "website": "https://github.com/%s" % repo,
    "tintColor": "1E9B4F",
})
quelle.setdefault("news", [])
apps = quelle.setdefault("apps", [])
app = next((a for a in apps if a.get("bundleIdentifier") == BUNDLE), None)
if app is None:
    app = {"bundleIdentifier": BUNDLE}
    apps.insert(0, app)
app.update({
    "name": "Eurojackpot",
    "developerName": "Eurojackpot",
    "subtitle": "Ziehungen, Statistik und Assistent",
    "localizedDescription": "Alle Eurojackpot-Ziehungen, Statistik, Vorhersage und ein Assistent, der Fragen zu den Zahlen "
                            "beantwortet – auf Wunsch mit einer Online-KI über deinen eigenen API-Schlüssel. Dieselbe Rechnung "
                            "wie am PC und am Handy. Neue Ziehungen kommen von selbst (Zahlen von lotto.de).\n\n"
                            "Lotto ist Zufall – keine App kann Zahlen vorhersagen. Teilnahme ab 18. Hilfe bei Glücksspielsucht: "
                            "check-dein-spiel.de · 0800 1 37 27 00",
    "iconURL": seiten + "symbol-512.png",
    "tintColor": "1E9B4F",
    "category": "utilities",
    "appPermissions": {"entitlements": [], "privacy": {}},
})
neu = {
    "version": version,
    "buildVersion": build,
    "date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "localizedDescription": notizen,
    "downloadURL": "https://github.com/%s/releases/download/v%s/EuroJackpot.ipa" % (repo, version),
    "size": os.path.getsize(ipa),
    "minOSVersion": "15.0",
}
versionen = [v for v in app.get("versions", []) if v.get("version") != version]
app["versions"] = [neu] + versionen[:4]
# aeltere SideStore-/AltStore-Versionen lesen noch die Felder ohne "versions"
app.update({"version": version, "versionDate": neu["date"], "versionDescription": notizen,
            "downloadURL": neu["downloadURL"], "size": neu["size"]})

with open(datei, "w", encoding="utf-8", newline="\n") as f:
    json.dump(quelle, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("apps.json: Version %s (Build %s), %d Bytes" % (version, build, neu["size"]))
