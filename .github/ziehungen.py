"""Holt neue Eurojackpot-Ziehungen von lotto.de und haengt sie an ziehungen.csv an (fuer die Browser-Version).

Laeuft als GitHub Action nach jeder Ziehung (Dienstag und Freitag abends). Dasselbe Verfahren wie LottoDe.java in den
Programmen: pro Jahr die Liste der Ziehungstage ("history"), pro fehlendem Tag die Zahlen ("draw").
Aufruf: python3 ziehungen.py pfad/zu/ziehungen.csv
"""
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo
    BERLIN = ZoneInfo("Europe/Berlin")
except Exception:  # Python unter Windows hat keine Zeitzonen-Daten: dann die EU-Sommerzeitregel von Hand
    BERLIN = None
BASIS = "https://www.lotto.de/api/stats/entities.eurojackpot/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EuroJackpot-Tabelle/2.0"
TAG = re.compile(r'"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"')
ZIEHUNGSDATUM = re.compile(r'"drawDate"\s*:\s*(\d+)')
ZAHL = re.compile(r'"drawNumber"\s*:\s*(\d+)')
TYP = re.compile(r'"drawNumberType"\s*:\s*(\d+)')
ZEILE = re.compile(r"^\d{4}-\d{2}-\d{2};")


def holen(adresse):
    fehler = None
    for versuch in range(3):
        try:
            anfrage = urllib.request.Request(adresse, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urllib.request.urlopen(anfrage, timeout=30) as antwort:
                return antwort.read().decode("utf-8")
        except Exception as e:  # Netz oder Server: kurz warten, noch einmal
            fehler = e
            time.sleep(5 * (versuch + 1))
    raise fehler


def versatz(utc):
    """Abstand der deutschen Zeit zu UTC (ohne Zeitzonen-Daten): Sommerzeit vom letzten Maerz- bis zum letzten
    Oktobersonntag, jeweils 1 Uhr UTC."""
    def letzter_sonntag(monat):
        tag = date(utc.year, monat, 31)
        tag -= timedelta(days=(tag.weekday() + 1) % 7)
        return datetime(tag.year, tag.month, tag.day, 1)
    return timedelta(hours=2 if letzter_sonntag(3) <= utc < letzter_sonntag(10) else 1)


def millis(jahr, monat, tag, stunde=0, minute=0):
    """Millisekunden seit 1970 fuer eine deutsche Uhrzeit."""
    if BERLIN is not None:
        return int(datetime(jahr, monat, tag, stunde, minute, tzinfo=BERLIN).timestamp() * 1000)
    ortszeit = datetime(jahr, monat, tag, stunde, minute)
    utc = ortszeit - versatz(ortszeit - timedelta(hours=1))
    return int(utc.replace(tzinfo=timezone.utc).timestamp() * 1000)


def ortsdatum(ms):
    """Deutsches Datum zu Millisekunden seit 1970."""
    utc = datetime.fromtimestamp(ms / 1000, timezone.utc)
    if BERLIN is not None:
        return utc.astimezone(BERLIN).date()
    return (utc.replace(tzinfo=None) + versatz(utc.replace(tzinfo=None))).date()


def ziehungstage(jahr, jetzt):
    json = holen(BASIS + "history/" + str(min(millis(jahr, 12, 31, 23, 59), jetzt)))
    return [date.fromisoformat(t) for t in TAG.findall(json) if int(t[:4]) == jahr]


def ziehung(tag):
    """Die Zahlen eines Ziehungstags; None, solange sie (noch) nicht vollstaendig sind."""
    json = holen(BASIS + "draw/" + str(millis(tag.year, tag.month, tag.day)))
    dd = ZIEHUNGSDATUM.search(json)
    if not dd or ortsdatum(int(dd.group(1))) != tag:
        return None
    start = json.find('"drawNumbersCollection"')
    auf = json.find("[", start) if start >= 0 else -1
    zu = json.find("]", auf) if auf >= 0 else -1
    if zu < 0:
        return None
    zahlen, euro = [], []
    for eintrag in json[auf + 1:zu].split("}"):
        z, t = ZAHL.search(eintrag), TYP.search(eintrag)
        if not z or not t:
            continue
        (zahlen if t.group(1) == "0" else euro if t.group(1) == "1" else []).append(int(z.group(1)))
    if len(zahlen) != 5 or len(euro) != 2:
        return None
    return sorted(zahlen), sorted(euro)


def main(pfad):
    with open(pfad, encoding="utf-8", newline="") as f:
        zeilen = f.read().splitlines()
    kopf = [z for z in zeilen if not ZEILE.match(z)]
    daten = {z[:10]: z for z in zeilen if ZEILE.match(z)}

    jetzt = int(time.time() * 1000)
    heute = ortsdatum(jetzt)
    jahre = [heute.year - 1, heute.year] if heute.month == 1 else [heute.year]
    neu = 0
    for jahr in jahre:
        for tag in ziehungstage(jahr, jetzt):
            if tag > heute or tag.isoformat() in daten:
                continue
            gezogen = ziehung(tag)
            if gezogen is None:
                print(tag, "noch keine vollstaendigen Zahlen")
                continue
            zahlen, euro = gezogen
            daten[tag.isoformat()] = ";".join([tag.isoformat()] + [str(x) for x in zahlen + euro]) + ";"
            print(tag, "neu:", zahlen, euro)
            neu += 1
    if neu == 0:
        print("Keine neue Ziehung.")
        return
    with open(pfad, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(kopf + [daten[d] for d in sorted(daten)]) + "\n")
    print(neu, "neue Ziehung(en) gespeichert.")


if __name__ == "__main__":
    main(sys.argv[1])
