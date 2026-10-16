// Web Worker: hier läuft der Rechen-Assistent (von TeaVM aus Java übersetzt, rechner-kern.js) – lange Rechnungen wie die
// Vorhersage halten so die Seite nicht an. Nachrichten von app.js: {art, id, ...}; Antworten: {art, id, wert}.
import * as kern from './rechner-kern.js';

self.ejMelden = (art, id, json) => self.postMessage({ art, id, wert: JSON.parse(json) });

// ---------- Leitung zur Online-KI (fetch) – Java wartet darauf (FetchLeitung.java)
// In der iPhone-App schickt die App die Anfrage selbst ab (ios/Quellen/Inhalt.swift, /leitung) – ohne Browser-Sperren.
const IN_APP = self.location.protocol === 'eurojackpot:';
const leitungen = new Map();
let naechsteLeitung = 1;

function zeitAb(eintrag, ms) {
  clearTimeout(eintrag.uhr);
  eintrag.uhr = setTimeout(() => {
    eintrag.zeitUm = true;
    eintrag.ab.abort();
  }, ms);
}

function fehlerText(e, eintrag, adresse) {
  if (eintrag && eintrag.zeitUm) return 'Keine Antwort von ' + new URL(adresse).host + ' (Zeit abgelaufen).';
  if (e && e.name === 'AbortError') return 'abgebrochen';
  return 'Keine Verbindung zu ' + new URL(adresse).host + ' – bist du online?';
}

self.ejLeitung = {
  async oeffnen(adresse, kopf, inhalt, lesezeit) {
    const eintrag = { ab: new AbortController(), antwort: null, leser: null, rest: '', dekoder: new TextDecoder(), lesezeit, uhr: 0, zeitUm: false };
    const id = naechsteLeitung++;
    leitungen.set(id, eintrag);
    zeitAb(eintrag, 15000 + lesezeit);
    try {
      eintrag.antwort = await fetch(IN_APP ? '/leitung?ziel=' + encodeURIComponent(adresse) : adresse, {
        method: inhalt == null ? 'GET' : 'POST',
        headers: JSON.parse(kopf),
        body: inhalt == null ? undefined : inhalt,
        signal: eintrag.ab.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      clearTimeout(eintrag.uhr);
      leitungen.delete(id);
      throw new Error(fehlerText(e, eintrag, adresse));
    }
    clearTimeout(eintrag.uhr);
    eintrag.adresse = adresse;
    return id;
  },
  code(id) {
    const e = leitungen.get(id);
    return e && e.antwort ? e.antwort.status : 0;
  },
  async text(id, max) {
    const e = leitungen.get(id);
    if (!e) return '';
    try {
      zeitAb(e, e.lesezeit);
      const t = await e.antwort.text();
      return t.slice(0, max).trim();
    } catch (x) {
      return '';
    } finally {
      clearTimeout(e.uhr);
    }
  },
  async zeile(id) {
    const e = leitungen.get(id);
    if (!e) throw new Error('abgebrochen');
    if (!e.leser) e.leser = e.antwort.body.getReader();
    for (;;) {
      const n = e.rest.indexOf('\n');
      if (n >= 0) {
        const z = e.rest.slice(0, n);
        e.rest = e.rest.slice(n + 1);
        return z.endsWith('\r') ? z.slice(0, -1) : z;
      }
      if (e.fertig) {
        if (!e.rest) return null;
        const z = e.rest;
        e.rest = '';
        return z;
      }
      let stueck;
      try {
        zeitAb(e, e.lesezeit);
        stueck = await e.leser.read();
      } catch (x) {
        throw new Error(fehlerText(x, e, e.adresse));
      } finally {
        clearTimeout(e.uhr);
      }
      if (stueck.done) {
        e.fertig = true;
        e.rest += e.dekoder.decode();
      } else {
        e.rest += e.dekoder.decode(stueck.value, { stream: true });
      }
    }
  },
  schliessen(id) {
    const e = leitungen.get(id);
    if (!e) return;
    leitungen.delete(id);
    clearTimeout(e.uhr);
    try {
      e.ab.abort();
    } catch (x) {
      // schon zu
    }
  },
};

// ---------- Nachrichten von der Seite
const ergebnis = (id, wert) => self.postMessage({ art: 'ergebnis', id, wert });

self.onmessage = (ereignis) => {
  const d = ereignis.data;
  try {
    switch (d.art) {
      case 'laden':
        ergebnis(d.id, kern.laden(d.csv));
        break;
      case 'vorbereiten':
        kern.vorbereiten();
        break;
      case 'neu':
        ergebnis(d.id, JSON.parse(kern.neuesGespraech()));
        break;
      case 'fragen':
        kern.fragen(d.id, d.text);
        break;
      case 'abbrechen':
        kern.abbrechen();
        break;
      case 'anbieter':
        ergebnis(d.id, { anbieter: kern.kiAnbieter(d.schluessel), verdeckt: kern.kiVerdeckt(d.schluessel) });
        break;
      case 'ki':
        kern.kiSetzen(d.schluessel || null, d.modell || null);
        ergebnis(d.id, true);
        break;
      case 'pruefen':
        kern.kiPruefen(d.id, d.schluessel, d.modell || null);
        break;
      case 'vergleich':
        ergebnis(d.id, kern.vergleich(d.fragen, d.heute));
        break;
      default:
        ergebnis(d.id, null);
    }
  } catch (e) {
    self.postMessage({ art: 'fehler', id: d.id, wert: String(e && e.message ? e.message : e) });
  }
};

self.postMessage({ art: 'bereit', id: 0, wert: null });
