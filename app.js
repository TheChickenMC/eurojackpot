// Eurojackpot im Browser und in der iPhone-App – Oberfläche. Rechnen tut der Rechen-Assistent im Web Worker (rechner.js → rechner-kern.js,
// von TeaVM aus demselben Java-Code übersetzt wie am PC und am Handy).
const VERSION = '2.12';
// In der iPhone-App setzt die App das vorher (ios/Quellen/WebAnsicht.swift): {plattform, version, build}
const APP = window.EJ_APP || null;
const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WOCHENTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const SEITEN_TITEL = { ziehungen: 'Ziehungen', assistent: 'Assistent', einstellungen: 'Einstellungen' };
const PRO_SEITE = 60;

const $ = (id) => document.getElementById(id);

// ---------- Speicher (kann fehlen, z. B. im privaten Modus)
const speicher = {
  holen(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  },
  setzen(k, v) {
    try {
      if (v == null || v === '') localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {
      // dann eben nur bis zum Schließen
    }
  },
};
const KI = { schluessel: 'ej.ki.schluessel', modell: 'ej.ki.modell', gewaehlt: 'ej.ki.gewaehlt', name: 'ej.ki.name', aus: 'ej.ki.aus' };

// ---------- Rechner (Web Worker)
let rechner = null;
let naechsteId = 1;
const offen = new Map();
const zwischenZuhoerer = new Map();
let rechnerBereit;
const rechnerStart = new Promise((ok) => (rechnerBereit = ok));

function rechnerStarten() {
  try {
    rechner = new Worker('rechner.js', { type: 'module' });
  } catch (e) {
    zeigeHinweis('Dein Browser ist zu alt für diese Seite – bitte Safari/iOS aktualisieren.');
    return;
  }
  rechner.onmessage = (e) => {
    const { art, id, wert } = e.data;
    if (art === 'bereit') {
      rechnerBereit();
    } else if (art === 'zwischen') {
      const z = zwischenZuhoerer.get(id);
      if (z) z(wert);
    } else if (art === 'vorbereitet') {
      // Vorhersage ist gerechnet
    } else {
      const ok = offen.get(id);
      offen.delete(id);
      zwischenZuhoerer.delete(id);
      if (ok) ok(art === 'fehler' ? { fehler: wert } : wert);
    }
  };
  rechner.onerror = (e) => {
    console.error(e);
    zeigeHinweis('Der Rechner ließ sich nicht starten. Lade die Seite bitte neu.');
  };
}

async function rufen(art, daten = {}, zwischen = null) {
  await rechnerStart;
  const id = naechsteId++;
  return new Promise((ok) => {
    offen.set(id, ok);
    if (zwischen) zwischenZuhoerer.set(id, zwischen);
    rechner.postMessage({ art, id, ...daten });
  });
}

function senden(art, daten = {}) {
  rechnerStart.then(() => rechner.postMessage({ art, id: 0, ...daten }));
}

// ---------- Ziehungen
let ziehungen = []; // neueste zuerst: {datum: 'YYYY-MM-DD', z: [5], e: [2]}
let geladenUm = 0;
let gezeigt = PRO_SEITE;

function csvLesen(text) {
  const liste = [];
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (!zeile || zeile.startsWith('#') || zeile.startsWith('Datum')) continue;
    const t = zeile.split(';');
    if (t.length < 8 || !/^\d{4}-\d{2}-\d{2}$/.test(t[0])) continue;
    const status = (t[8] || '').trim().toLowerCase();
    if (status.startsWith('gel')) continue;
    liste.push({ datum: t[0], z: t.slice(1, 6).map(Number), e: t.slice(6, 8).map(Number) });
  }
  liste.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  return liste;
}

async function ziehungenLaden(ruhig) {
  let text = null;
  try {
    const r = await fetch('ziehungen.csv', { cache: 'no-cache' });
    if (r.ok) text = await r.text();
  } catch (e) {
    // offline – der Service Worker hat sie meist trotzdem
  }
  if (text == null) {
    if (!ziehungen.length) $('stand').textContent = 'Keine Verbindung – Ziehungen konnten nicht geladen werden';
    else if (!ruhig) zeigeHinweis('Keine Verbindung – es bleiben die bisherigen Ziehungen.');
    return false;
  }
  const neu = csvLesen(text);
  const vorher = ziehungen.length ? ziehungen[0].datum : null;
  ziehungen = neu;
  geladenUm = Date.now();
  await rufen('laden', { csv: text });
  senden('vorbereiten');
  standZeigen();
  listeZeigen();
  naechsteZeigen();
  if (!ruhig && vorher && neu.length && neu[0].datum !== vorher) zeigeHinweis('Neue Ziehung geladen: ' + datumLang(neu[0].datum));
  else if (!ruhig) zeigeHinweis('Die Ziehungen sind auf dem neuesten Stand.');
  return true;
}

function datumTeile(iso) {
  const [j, m, t] = iso.split('-').map(Number);
  return { j, m, t, wt: new Date(Date.UTC(j, m - 1, t)).getUTCDay() };
}
const zwei = (n) => String(n).padStart(2, '0');
function datumLang(iso) {
  const d = datumTeile(iso);
  return WOCHENTAGE_LANG[d.wt] + ', ' + zwei(d.t) + '.' + zwei(d.m) + '.' + d.j;
}

function standZeigen() {
  if (!ziehungen.length) {
    $('stand').textContent = 'Noch keine Ziehungen geladen';
    $('datenStand').textContent = 'Noch keine Ziehungen geladen.';
    return;
  }
  const d = datumTeile(ziehungen[0].datum);
  const text = ziehungen.length.toLocaleString('de-DE') + ' Ziehungen · Stand ' + WOCHENTAGE[d.wt] + ' ' + zwei(d.t) + '.' + zwei(d.m) + '.' + d.j;
  if (aktiveSeite === 'ziehungen' || aktiveSeite === 'einstellungen') $('stand').textContent = text;
  $('datenStand').textContent = text + '.';
}

function kugelHtml(n, euro, knopf, treffer) {
  const klasse = 'kugel' + (n % 2 === 0 ? ' gerade' : '') + (euro ? ' euro' : '') + (treffer ? ' treffer' : '');
  const name = (euro ? 'Eurozahl ' : '') + n;
  return knopf
    ? `<button class="${klasse}" data-zahl="${n}" data-euro="${euro ? 1 : 0}" aria-label="${name}">${n}</button>`
    : `<span class="${klasse}" aria-label="${name}">${n}</span>`;
}

function suchZahlen() {
  const roh = $('suchFeld').value;
  const zahlen = (roh.match(/\d+/g) || []).map(Number).filter((n) => n >= 1 && n <= 50);
  return [...new Set(zahlen)];
}

function listeZeigen() {
  const such = suchZahlen();
  const passend = such.length ? ziehungen.filter((z) => such.every((n) => z.z.includes(n))) : ziehungen;
  const teil = passend.slice(0, gezeigt);
  const html = teil.map((z) => {
    const d = datumTeile(z.datum);
    const kugeln = z.z.map((n) => kugelHtml(n, false, true, such.includes(n))).join('') + '<span class="trenner"></span>'
      + z.e.map((n) => kugelHtml(n, true, true, false)).join('');
    return `<div class="ziehung"><div class="datum"><b>${WOCHENTAGE[d.wt]} ${zwei(d.t)}.${zwei(d.m)}.</b><span>${d.j}</span></div>`
      + `<div class="kugeln">${kugeln}</div></div>`;
  }).join('');
  $('liste').innerHTML = html || `<div class="leer">${ziehungen.length ? 'Keine Ziehung mit ' + such.join(' und ') + '.' : 'Noch keine Ziehungen.'}</div>`;
  $('mehrKnopf').hidden = passend.length <= gezeigt;
}

/** Datum und Stunde in Berlin (dort wird die Ziehungszeit gerechnet). */
function berlinJetzt() {
  const teile = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date())) teile[p.type] = p.value;
  return { datum: new Date(Date.UTC(+teile.year, +teile.month - 1, +teile.day)), stunde: +teile.hour % 24 };
}

function naechsteZeigen() {
  const jetzt = berlinJetzt();
  const d = new Date(jetzt.datum);
  const heuteZiehung = (d.getUTCDay() === 2 || d.getUTCDay() === 5) && jetzt.stunde < 21;
  if (!heuteZiehung) {
    do d.setUTCDate(d.getUTCDate() + 1);
    while (d.getUTCDay() !== 2 && d.getUTCDay() !== 5);
  }
  const iso = d.toISOString().slice(0, 10);
  const tage = Math.round((d - jetzt.datum) / 86400000);
  const wann = tage === 0 ? 'heute, gegen 21 Uhr' : tage === 1 ? 'morgen' : 'in ' + tage + ' Tagen';
  $('naechste').innerHTML = `<div class="text"><div class="klein">Nächste Ziehung · ${wann}</div><div class="gross">${datumLang(iso)}</div></div>`
    + '<button class="knopf haupt" id="tippKnopf">Tipp dafür</button>';
  $('tippKnopf').onclick = () => {
    seiteZeigen('assistent');
    fragen('Welche Zahlen soll ich tippen?');
  };
}

// ---------- Assistent
let wartet = false;
let gespraechNr = 0;
let aktuelleVorschlaege = [];

function inhaltHtml(text) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const zeilen = text.split('\n');
  while (zeilen.length && !zeilen[0].trim()) zeilen.shift();
  while (zeilen.length && !zeilen[zeilen.length - 1].trim()) zeilen.pop();
  return zeilen.map((zeile) => {
    const z = zeile.trim();
    if (z.startsWith('§K')) {
      const [haupt, euro = ''] = z.slice(2).split('|');
      const h = (haupt.match(/\d+/g) || []).map(Number);
      const e = (euro.match(/\d+/g) || []).map(Number);
      return '<div class="kugeln">' + h.map((n) => kugelHtml(n, false, false)).join('')
        + (h.length && e.length ? '<span class="trenner"></span>' : '') + e.map((n) => kugelHtml(n, true, false)).join('') + '</div>';
    }
    if (!z) return '<p>&nbsp;</p>';
    const stuecke = esc(zeile).split('**');
    return '<p>' + stuecke.map((s, i) => (i % 2 ? '<b>' + s + '</b>' : s)).join('') + '</p>';
  }).join('');
}

function blase(art, text) {
  const b = document.createElement('div');
  b.className = 'blase' + (art === 'ich' ? ' ich' : art === 'tippt' ? ' tippt' : art === 'fehler' ? ' fehler' : '');
  if (art === 'ich' || art === 'tippt') b.textContent = text;
  else b.innerHTML = inhaltHtml(text);
  $('verlauf').appendChild(b);
  nachUnten();
  return b;
}

function nachUnten() {
  if (aktiveSeite !== 'assistent') return;
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
}

function vorschlaegeZeigen(liste) {
  aktuelleVorschlaege = (liste || []).slice(0, 4);
  const v = $('vorschlaege');
  v.innerHTML = '';
  for (const text of aktuelleVorschlaege) {
    const k = document.createElement('button');
    k.className = 'vorschlag';
    k.textContent = text;
    k.onclick = () => fragen(text);
    v.appendChild(k);
  }
  v.hidden = !aktuelleVorschlaege.length;
  eingabeHoeheMerken();
}

async function neuesGespraech() {
  gespraechNr++;
  wartet = false;
  $('sendenKnopf').disabled = false;
  $('verlauf').innerHTML = '';
  const a = await rufen('neu');
  if (a && a.text) {
    blase('antwort', a.text);
    vorschlaegeZeigen(a.vorschlaege);
  }
}

async function fragen(text) {
  const f = (text || '').trim();
  if (!f || wartet) return;
  if (aktiveSeite !== 'assistent') seiteZeigen('assistent');
  $('frageFeld').value = '';
  blase('ich', f);
  vorschlaegeZeigen([]);
  wartet = true;
  $('sendenKnopf').disabled = true;
  const nr = gespraechNr;
  const tippt = blase('tippt', 'Denke nach …');
  let punkte = 0;
  const uhr = setInterval(() => {
    punkte = (punkte + 1) % 4;
    tippt.textContent = 'Denke nach' + ' .'.repeat(punkte);
  }, 400);
  let strom = null;
  const a = await rufen('fragen', { text: f }, (zwischen) => {
    if (nr !== gespraechNr || !zwischen) return;
    if (!strom) {
      clearInterval(uhr);
      tippt.remove();
      strom = blase('antwort', zwischen);
    } else {
      strom.innerHTML = inhaltHtml(zwischen);
      nachUnten();
    }
  });
  clearInterval(uhr);
  if (nr !== gespraechNr) return; // inzwischen „Neu“ angetippt
  tippt.remove();
  wartet = false;
  $('sendenKnopf').disabled = false;
  if (!a) {
    if (strom) strom.remove();
    return;
  }
  if (a.fehler) {
    if (strom) strom.remove();
    blase('fehler', 'Da ist etwas schiefgegangen: ' + a.fehler);
    vorschlaegeZeigen(['Was kannst du?']);
    return;
  }
  if (strom) {
    strom.innerHTML = inhaltHtml(a.text);
    nachUnten();
  } else {
    blase('antwort', a.text);
  }
  vorschlaegeZeigen(a.vorschlaege);
}

// ---------- Online-KI
function kiDaten() {
  return {
    schluessel: speicher.holen(KI.schluessel),
    modell: speicher.holen(KI.modell) || speicher.holen(KI.gewaehlt),
    name: speicher.holen(KI.name),
    aus: speicher.holen(KI.aus) === '1',
  };
}

function kiAnwenden() {
  const k = kiDaten();
  const an = k.schluessel && !k.aus;
  senden('ki', { schluessel: an ? k.schluessel : null, modell: an ? k.modell : null });
  kiZeigen();
}

function kiZeigen() {
  const k = kiDaten();
  const an = k.schluessel && !k.aus;
  $('kiZeile').textContent = an ? 'Online-KI: ' + (k.name || 'an') + ' · alle Zahlen rechnet die App exakt aus den Ziehungen'
    : 'Eingebauter Assistent · rechnet alles exakt aus den Ziehungen';
  $('kiAnZeile').hidden = !k.schluessel;
  $('kiAn').checked = !!an;
  $('entfernenKnopf').hidden = !k.schluessel;
  $('schluesselFeld').placeholder = k.schluessel ? 'neuen Schlüssel eintragen' : 'sk-ant-…, sk-… oder AIza…';
  if (!k.schluessel) {
    $('kiStatus').textContent = 'Kein API-Schlüssel eingetragen – es antwortet der eingebaute Assistent.';
  } else {
    rufen('anbieter', { schluessel: k.schluessel }).then((r) => {
      $('kiStatus').textContent = 'Eingetragen: ' + (r && r.verdeckt ? r.verdeckt : '…') + ' – ' + (k.name || '')
        + (k.modell ? ' (' + k.modell + ')' : '') + (an ? '' : ' · ausgeschaltet');
    });
  }
}

function kiMeldung(text, gut) {
  const m = $('kiMeldung');
  m.hidden = !text;
  m.textContent = text || '';
  m.classList.toggle('gut', !!gut);
}

async function kiPruefen() {
  const alt = kiDaten();
  const schluessel = $('schluesselFeld').value.trim() || alt.schluessel;
  const modell = $('modellFeld').value.trim();
  if (!schluessel) {
    kiMeldung('Trag zuerst deinen API-Schlüssel ein.');
    return;
  }
  const r = await rufen('anbieter', { schluessel });
  if (!r || !r.anbieter) {
    kiMeldung('Den Schlüssel kenne ich nicht. Er beginnt bei Claude mit „sk-ant-“, bei ChatGPT mit „sk-“ und bei Gemini mit „AIza“.');
    return;
  }
  const [name, firma] = r.anbieter.split('|');
  kiMeldung('Prüfe den Schlüssel bei ' + firma + ' …', true);
  $('pruefenKnopf').disabled = true;
  const p = await rufen('pruefen', { schluessel, modell });
  $('pruefenKnopf').disabled = false;
  if (!p || !p.ok) {
    kiMeldung((p && p.fehler) || 'Die Prüfung hat nicht geklappt.');
    return;
  }
  speicher.setzen(KI.schluessel, schluessel);
  speicher.setzen(KI.modell, modell);
  speicher.setzen(KI.gewaehlt, p.modell);
  speicher.setzen(KI.name, p.name || name);
  speicher.setzen(KI.aus, null);
  $('schluesselFeld').value = '';
  kiMeldung('Die Online-KI ist an: ' + (p.name || name) + ' (' + p.modell + ').', true);
  kiAnwenden();
  neuesGespraech();
}

function kiEntfernen() {
  for (const k of Object.values(KI)) speicher.setzen(k, null);
  $('schluesselFeld').value = '';
  $('modellFeld').value = '';
  kiMeldung('Der Schlüssel ist gelöscht. Es antwortet wieder der eingebaute Assistent.', true);
  kiAnwenden();
  neuesGespraech();
}

// ---------- Seiten und Leiste
let aktiveSeite = 'ziehungen';
const scrollStand = {};

function seiteZeigen(name) {
  if (name === aktiveSeite) {
    if (name === 'ziehungen') window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  scrollStand[aktiveSeite] = window.scrollY;
  aktiveSeite = name;
  for (const s of ['ziehungen', 'assistent', 'einstellungen']) $('seite-' + s).hidden = s !== name;
  for (const r of document.querySelectorAll('.reiter')) r.classList.toggle('aktiv', r.dataset.seite === name);
  $('seitenTitel').textContent = SEITEN_TITEL[name];
  $('neuKnopf').hidden = name !== 'assistent';
  $('eingabeBereich').hidden = name !== 'assistent';
  document.body.classList.toggle('mit-eingabe', name === 'assistent');
  if (name === 'assistent') {
    $('stand').textContent = 'Fragen zu Zahlen, Ziehungen und Chancen';
    eingabeHoeheMerken();
    nachUnten();
  } else {
    standZeigen();
    window.scrollTo(0, scrollStand[name] || 0);
  }
  if (name === 'einstellungen') kiZeigen();
}

function eingabeHoeheMerken() {
  requestAnimationFrame(() => {
    const h = $('eingabeBereich').offsetHeight;
    if (h) document.documentElement.style.setProperty('--eingabe-hoehe', h + 'px');
  });
}

// iPhone-Tastatur: die Eingabe über die Tastatur schieben, die Leiste ausblenden
function tastaturBeachten() {
  const vv = window.visualViewport;
  if (!vv) return;
  const anpassen = () => {
    const verdeckt = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const offen = verdeckt > 80;
    document.body.classList.toggle('tastatur', offen);
    $('eingabeBereich').style.bottom = offen ? verdeckt + 'px' : '';
  };
  vv.addEventListener('resize', anpassen);
  vv.addEventListener('scroll', anpassen);
}

// ---------- kurze Hinweise
let hinweisUhr = 0;
function zeigeHinweis(text, knopfText, aktion) {
  const h = $('hinweis');
  h.innerHTML = '';
  const t = document.createElement('span');
  t.textContent = text;
  h.appendChild(t);
  if (knopfText) {
    const k = document.createElement('button');
    k.textContent = knopfText;
    k.onclick = aktion;
    h.appendChild(k);
  }
  h.hidden = false;
  clearTimeout(hinweisUhr);
  if (!knopfText) hinweisUhr = setTimeout(() => (h.hidden = true), 3500);
}

// ---------- iPhone-App: die App selbst aktualisiert SideStore bzw. AltStore – hier nur der Hinweis darauf
let updateGeprueftUm = 0;

async function appUpdatePruefen() {
  updateGeprueftUm = Date.now();
  try {
    const r = await fetch('apps.json', { cache: 'no-store' });
    if (!r.ok) return;
    const quelle = await r.json();
    const apps = quelle.apps || [];
    const app = apps.find((a) => a.bundleIdentifier === 'lotto.eurojackpot.tabelle') || apps[0];
    const neu = app && app.versions && app.versions[0];
    if (!neu || !(Number(neu.buildVersion) > Number(APP.build))) return;
    zeigeHinweis('Version ' + neu.version + ' ist da – in SideStore oder AltStore aktualisieren.', 'Öffnen',
      () => window.webkit.messageHandlers.app.postMessage({ art: 'updaten' }));
  } catch (e) {
    // ohne Netz: beim nächsten Mal
  }
}

// ---------- Service Worker (offline und Updates)
function updatesBeachten() {
  if (APP) {
    appUpdatePruefen();
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const melden = (w) => {
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          zeigeHinweis('Neue Version da.', 'Neu laden', () => w.postMessage('jetzt'));
        }
      });
    };
    if (reg.installing) melden(reg.installing);
    reg.addEventListener('updatefound', () => melden(reg.installing));
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });
}

// ---------- Start
function start() {
  $('versionText').textContent = 'Version ' + VERSION + (APP ? ' · iPhone-App' : '') + ' · dieselbe Rechnung wie am PC und am Handy';
  for (const r of document.querySelectorAll('.reiter')) r.onclick = () => seiteZeigen(r.dataset.seite);
  $('neuKnopf').onclick = neuesGespraech;
  $('eingabeForm').onsubmit = (e) => {
    e.preventDefault();
    fragen($('frageFeld').value);
  };
  $('liste').onclick = (e) => {
    const k = e.target.closest('button.kugel');
    if (!k) return;
    fragen(k.dataset.euro === '1' ? 'Wie oft kam die Eurozahl ' + k.dataset.zahl + '?' : 'Wie oft kam die ' + k.dataset.zahl + '?');
  };
  $('suchFeld').oninput = () => {
    gezeigt = PRO_SEITE;
    listeZeigen();
  };
  $('mehrKnopf').onclick = () => {
    gezeigt += PRO_SEITE * 2;
    listeZeigen();
  };
  $('pruefenKnopf').onclick = kiPruefen;
  $('entfernenKnopf').onclick = kiEntfernen;
  $('kiAn').onchange = () => {
    speicher.setzen(KI.aus, $('kiAn').checked ? null : '1');
    kiAnwenden();
    neuesGespraech();
  };
  $('aktualisierenKnopf').onclick = () => ziehungenLaden(false);
  // Kreispfeil neben der Suche – wie am Handy (der Assistent verweist darauf)
  $('neuLadenKnopf').onclick = async () => {
    const k = $('neuLadenKnopf');
    if (k.classList.contains('dreht')) return;
    k.classList.add('dreht');
    try {
      await ziehungenLaden(false);
    } finally {
      k.classList.remove('dreht');
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - geladenUm > 30 * 60 * 1000) ziehungenLaden(true);
    if (APP && Date.now() - updateGeprueftUm > 12 * 60 * 60 * 1000) appUpdatePruefen();
  });
  tastaturBeachten();
  rechnerStarten();
  kiAnwenden();
  naechsteZeigen();
  ziehungenLaden(true).then(() => neuesGespraech());
  updatesBeachten();
}

start();
