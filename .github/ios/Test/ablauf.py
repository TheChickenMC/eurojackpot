"""Startet die iPhone-App im Simulator im Selbsttest (Test/selbsttest.js) und liest ihr Protokoll mit: macht die
Bildschirmfotos, schaltet hell/dunkel um und wartet auf "ENDE". Nur fuer .github/workflows/ios.yml.
Aufruf: python3 ablauf.py <udid> <lauf> <ergebnisordner> [weitere Startargumente der App ...]
Rueckgabe: 0 = alles ok, 1 = Fehler im Test, 2 = Zeit abgelaufen oder App abgestuerzt."""
import os
import subprocess
import sys
import time

BUNDLE = "lotto.eurojackpot.tabelle"
udid, lauf, ordner = sys.argv[1], sys.argv[2], sys.argv[3]
extra = sys.argv[4:]
os.makedirs(os.path.join(ordner, "fotos"), exist_ok=True)
protokoll = os.path.abspath(os.path.join(ordner, "lauf-%s.txt" % lauf))
if os.path.exists(protokoll):
    os.remove(protokoll)


def simctl(*args, pruefen=True):
    return subprocess.run(["xcrun", "simctl", *args], check=pruefen, capture_output=True, text=True, timeout=120)


def foto(name):
    ziel = os.path.join(ordner, "fotos", "%s-%s.png" % (lauf, name))
    r = simctl("io", udid, "screenshot", ziel, pruefen=False)
    print("   [Foto %s: %s]" % (name, "ok" if r.returncode == 0 else r.stderr.strip()), flush=True)


simctl("terminate", udid, BUNDLE, pruefen=False)
simctl("ui", udid, "appearance", "light", pruefen=False)
start = simctl("launch", "--terminate-running-process", "--stderr=" + protokoll, "--stdout=" + protokoll + ".out",
               udid, BUNDLE, "-selbsttest", lauf, *extra)
print("Lauf %s gestartet: %s" % (lauf, start.stdout.strip()), flush=True)
pid = start.stdout.strip().split(":")[-1].strip()

ergebnis = 2
spaeter = []  # (Zeitpunkt, Name) fuer "FOTO-NACH"
ende = time.time() + 900
gelesen = 0
rest = ""
fertig = False
while time.time() < ende and not fertig:
    time.sleep(0.2)
    for zeitpunkt, name in [s for s in spaeter if s[0] <= time.time()]:
        foto(name)
        spaeter.remove((zeitpunkt, name))
    if not os.path.exists(protokoll):
        continue
    with open(protokoll, "rb") as f:
        f.seek(gelesen)
        neu = f.read()
    gelesen += len(neu)
    rest += neu.decode("utf-8", "replace")
    *zeilen, rest = rest.split("\n")
    for zeile in zeilen:
        print(zeile, flush=True)
        if zeile.startswith("FOTO-NACH "):
            _, sekunden, name = zeile.split(" ", 2)
            spaeter.append((time.time() + float(sekunden), name.strip()))
        elif zeile.startswith("FOTO "):
            foto(zeile[5:].strip())
        elif zeile.strip() == "DUNKEL":
            simctl("ui", udid, "appearance", "dark", pruefen=False)
        elif zeile.strip() == "HELL":
            simctl("ui", udid, "appearance", "light", pruefen=False)
        elif zeile.startswith("ENDE "):
            ergebnis = 0 if zeile.strip() == "ENDE OK" else 1
            fertig = True
    # abgestuerzt? (laeuft der Prozess noch)
    if not fertig and pid.isdigit() and subprocess.run(["kill", "-0", pid], capture_output=True).returncode != 0:
        print("!! Die App laeuft nicht mehr (abgestuerzt?)", flush=True)
        break

for zeitpunkt, name in sorted(spaeter):
    time.sleep(max(0.0, zeitpunkt - time.time()))
    foto(name)
if not fertig:
    print("!! Lauf %s: kein ENDE (Zeit abgelaufen oder abgestuerzt)" % lauf, flush=True)
    foto("zuletzt")
simctl("terminate", udid, BUNDLE, pruefen=False)
print("Lauf %s: %s" % (lauf, ["OK", "FEHLER", "ABGEBROCHEN"][ergebnis]), flush=True)
sys.exit(ergebnis)
