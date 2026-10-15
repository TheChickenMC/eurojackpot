"""Sucht den iPhone-Simulator fuer den Test: neuestes iOS, am liebsten ein aktuelles iPhone. Gibt die UDID aus.
Nur fuer .github/workflows/ios.yml."""
import json
import re
import subprocess
import sys

liste = json.loads(subprocess.run(["xcrun", "simctl", "list", "-j", "devices", "available"],
                                  check=True, capture_output=True, text=True).stdout)


def version(laufzeit):
    m = re.search(r"iOS-(\d+)-(\d+)", laufzeit)
    return (int(m.group(1)), int(m.group(2))) if m else (0, 0)


WUNSCH = ["iPhone 17 Pro", "iPhone 17", "iPhone 16 Pro", "iPhone 16", "iPhone Air"]
kandidaten = []
for laufzeit, geraete in liste["devices"].items():
    if "iOS" not in laufzeit:
        continue
    for g in geraete:
        if g.get("isAvailable") and g["name"].startswith("iPhone"):
            rang = WUNSCH.index(g["name"]) if g["name"] in WUNSCH else len(WUNSCH)
            kandidaten.append((version(laufzeit), -rang, g["name"], g["udid"], laufzeit))
if not kandidaten:
    sys.exit("Kein iPhone-Simulator gefunden")
kandidaten.sort(reverse=True)
v, _, name, udid, laufzeit = kandidaten[0]
print("Simulator: %s mit iOS %d.%d" % (name, v[0], v[1]), file=sys.stderr)
print(udid)
