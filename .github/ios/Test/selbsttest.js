// Selbsttest der iPhone-App im Simulator – läuft nur, wenn die App mit „-selbsttest <lauf>“ gestartet wird
// (ios/Quellen/Selbsttest.swift). Jeder Schritt geht als Zeile an die App (Protokolldatei); ablauf.py liest mit:
// „FOTO name“ = Bildschirmfoto, „FOTO-NACH s name“ = Foto nach s Sekunden, „DUNKEL“/„HELL“ = Erscheinungsbild umschalten,
// „ENDE OK“ / „ENDE FEHLER n“ = fertig.
// Lauf 1: frisch installiert, Ziehungen und Versionsliste vom Testserver, Online-KI über die Attrappe.
// Lauf 2: ohne Testserver (offline) – Ziehungen aus dem Speicher, Schlüssel muss noch da sein.
(() => {
  const lauf = (window.EJ_APP && window.EJ_APP.test) || '1';
  let fehler = 0;

  const melden = (text) => {
    try {
      window.webkit.messageHandlers.protokoll.postMessage(String(text));
    } catch (e) {
      // ohne App nichts zu melden
    }
  };
  const pruefen = (ok, text) => {
    if (!ok) fehler++;
    melden((ok ? 'OK     ' : 'FEHLER ') + text);
    return ok;
  };
  const kurz = (x) => (x && x.message ? x.message : String(x));

  window.addEventListener('error', (e) => {
    fehler++;
    melden('FEHLER JS: ' + e.message + ' (' + (e.filename || '?') + ':' + e.lineno + ')');
  });
  window.addEventListener('unhandledrejection', (e) => {
    fehler++;
    melden('FEHLER Promise: ' + kurz(e.reason));
  });
  const konsole = console.error;
  console.error = (...teile) => {
    fehler++;
    melden('FEHLER Konsole: ' + teile.map(kurz).join(' '));
    konsole.apply(console, teile);
  };

  const $ = (id) => document.getElementById(id);
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

  async function warten(bedingung, sekunden) {
    const ende = Date.now() + sekunden * 1000;
    while (Date.now() < ende) {
      try {
        if (bedingung()) return true;
      } catch (e) {
        // Seite noch nicht so weit
      }
      await pause(150);
    }
    return false;
  }

  // wartet, bis ablauf.py das Foto gemacht hat (die ersten dauern im Simulator bis zu einer halben Minute)
  async function foto(name) {
    const t = Date.now();
    let ok = false;
    try {
      ok = await window.webkit.messageHandlers.foto.postMessage(name);
    } catch (e) {
      melden('FOTO ' + name);
      await pause(2500);
    }
    if (ok) melden('       Foto nach ' + ((Date.now() - t) / 1000).toFixed(1) + ' s');
    else melden('INFO   Foto ' + name + ' nicht bestätigt');
    await pause(200);
  }

  async function erscheinung(dunkel) {
    melden(dunkel ? 'DUNKEL' : 'HELL');
    const ok = await warten(() => matchMedia('(prefers-color-scheme: dark)').matches === dunkel, 30);
    pruefen(ok, 'Erscheinungsbild ' + (dunkel ? 'dunkel' : 'hell'));
    await pause(800);
  }

  function reiter(name) {
    document.querySelector('.reiter[data-seite="' + name + '"]').click();
  }

  const blasen = () => [...$('verlauf').querySelectorAll('.blase')];
  const antwortenAb = (n) => blasen().slice(n).filter((b) => !b.classList.contains('ich') && !b.classList.contains('tippt'))
    .map((b) => b.innerText).join('\n');
  const hinweis = () => ($('hinweis').hidden ? '' : $('hinweis').innerText);

  /** Stellt eine Frage und wartet, bis die Antwort fertig ist und `erwartet` enthält. */
  async function frage(text, erwartet, sekunden, beobachten) {
    const vorher = blasen().length;
    $('frageFeld').value = text;
    $('eingabeForm').requestSubmit();
    const t = Date.now();
    const ok = await warten(() => {
      const a = antwortenAb(vorher);
      if (beobachten) beobachten(a);
      return !$('sendenKnopf').disabled && a.includes(erwartet);
    }, sekunden);
    const antwort = antwortenAb(vorher);
    pruefen(ok, 'Frage „' + text + '“ → „' + erwartet + '“ nach ' + ((Date.now() - t) / 1000).toFixed(1) + ' s');
    melden('       Antwort: ' + antwort.replace(/\s+/g, ' ').slice(0, 300));
    return antwort;
  }

  async function geladen() {
    const t = Date.now();
    const ok = await warten(() => $('liste').querySelectorAll('.ziehung').length > 0 && !$('stand').textContent.startsWith('Lade'), 120);
    pruefen(ok, 'Ziehungen geladen nach ' + ((Date.now() - t) / 1000).toFixed(1) + ' s – ' + $('stand').textContent);
    const gruss = await warten(() => blasen().length > 0, 60);
    pruefen(gruss, 'Assistent bereit (Begrüßung da)');
    return ok;
  }

  async function schluessel(text) {
    $('schluesselFeld').value = text;
    $('pruefenKnopf').click();
    await warten(() => $('pruefenKnopf').disabled, 3);
    await warten(() => !$('pruefenKnopf').disabled && !$('kiMeldung').hidden && !$('kiMeldung').textContent.startsWith('Prüfe'), 60);
    return $('kiMeldung').textContent;
  }

  // ---------- Lauf 1: alles frisch
  async function lauf1() {
    pruefen(window.EJ_APP && window.EJ_APP.plattform === 'ios', 'Seite erkennt die App: ' + JSON.stringify(window.EJ_APP));
    await geladen();
    const anzahl = (($('stand').textContent.match(/^[\d.]+/) || ['0'])[0]).replace(/\./g, '');
    localStorage.setItem('ej.test.anzahl', anzahl);
    pruefen(!document.body.innerText.includes('Home-Bildschirm'), 'kein Hinweis mehr auf „Zum Home-Bildschirm“');
    pruefen($('versionText').textContent.includes('iPhone-App'), 'Versionszeile: ' + $('versionText').textContent);
    await foto('01-ziehungen');

    const update = await warten(() => hinweis().includes('ist da'), 30);
    pruefen(update, 'Update-Hinweis (Build 1 ist alt): ' + hinweis().replace(/\s+/g, ' '));
    await foto('02-update-hinweis');

    $('neuLadenKnopf').click();
    pruefen($('neuLadenKnopf').classList.contains('dreht'), 'Kreispfeil dreht');
    await warten(() => !$('neuLadenKnopf').classList.contains('dreht'), 60);
    await pause(300);
    pruefen(/neuesten Stand|Neue Ziehung/.test(hinweis()), 'Hinweis nach Kreispfeil: ' + hinweis());

    window.scrollTo(0, 0);
    reiter('assistent');
    await pause(1200);
    await foto('03-assistent');
    await frage('welche ziehung hat die meisten aufeinander folgenden zahlen', 'Nachbarzahl', 120);
    await frage('Was ist deine Vorhersage?', 'Vorhersage für', 300);
    await pause(800);
    await foto('04-vorhersage');

    reiter('einstellungen');
    await pause(1000);
    pruefen($('kiStatus').textContent.startsWith('Kein API-Schlüssel'), 'KI-Status: ' + $('kiStatus').textContent);
    await foto('05-einstellungen');
    const falsch = await schluessel('sk-ant-falsch-TEST-1');
    pruefen(!falsch.includes('ist an') && falsch.length > 0, 'falscher Schlüssel abgelehnt: ' + falsch);
    const richtig = await schluessel('sk-ant-test-TEST-12345678');
    pruefen(richtig.startsWith('Die Online-KI ist an'), 'richtiger Schlüssel: ' + richtig);
    await warten(() => $('kiStatus').textContent.startsWith('Eingetragen'), 10);
    pruefen($('kiStatus').textContent.startsWith('Eingetragen'), 'KI-Status: ' + $('kiStatus').textContent);
    pruefen(!$('kiStatus').textContent.includes('12345678'), 'Schlüssel wird verdeckt angezeigt');
    await foto('06-ki-an');

    reiter('assistent');
    await pause(1000);
    await warten(() => blasen().length > 0 && !$('sendenKnopf').disabled, 30);
    pruefen($('kiZeile').textContent.startsWith('Online-KI'), 'Assistent-Zeile: ' + $('kiZeile').textContent);
    // die Attrappe schickt die Antwort in vier Teilen mit Pausen – erscheint sie Stück für Stück?
    const t0 = Date.now();
    const stufen = [];
    const antwort = await frage('erzähl mir einen witz', 'Online-KI aus dem Test', 90, (a) => {
      const n = a.includes('Hallo') ? a.length : 0;
      if (n && (!stufen.length || stufen[stufen.length - 1][1] !== n)) stufen.push([((Date.now() - t0) / 1000).toFixed(1), n]);
    });
    pruefen(antwort.includes('Umlaute: äöü ß – „Zitat“.'), 'Umlaute und Anführungszeichen kommen richtig an');
    melden('INFO   Antwort erschien ' + (stufen.length > 1 ? 'Stück für Stück' : 'auf einmal') + ': '
      + stufen.map(([s, n]) => s + ' s ' + n + ' Zeichen').join(', '));
    await foto('07-online-ki');

    // mitten in einer Frage „Neu“ – danach muss die nächste Frage normal klappen
    $('frageFeld').value = 'erzähl noch einen witz';
    $('eingabeForm').requestSubmit();
    await pause(150);
    $('neuKnopf').click();
    await warten(() => blasen().length > 0 && !$('sendenKnopf').disabled, 30);
    await pause(1500);
    await frage('und noch einer', 'Online-KI aus dem Test', 90);

    await erscheinung(true);
    await foto('08-assistent-dunkel');
    reiter('einstellungen');
    await pause(1000);
    await foto('09-einstellungen-dunkel');
    reiter('ziehungen');
    await pause(1000);
    await foto('10-ziehungen-dunkel');
    await erscheinung(false);
  }

  // ---------- Lauf 2: neu gestartet, Testserver aus
  async function lauf2() {
    await geladen();
    const anzahl = (($('stand').textContent.match(/^[\d.]+/) || ['0'])[0]).replace(/\./g, '');
    pruefen(anzahl !== '0' && anzahl === localStorage.getItem('ej.test.anzahl'),
      'ohne Netz dieselben Ziehungen wie vorher: ' + anzahl + ' (vorher ' + localStorage.getItem('ej.test.anzahl') + ')');
    await pause(3000);
    pruefen(!hinweis().includes('ist da'), 'ohne Netz kein Update-Hinweis');
    await foto('11-offline');

    reiter('einstellungen');
    await pause(800);
    await warten(() => $('kiStatus').textContent.startsWith('Eingetragen'), 10);
    pruefen($('kiStatus').textContent.startsWith('Eingetragen'), 'Schlüssel nach Neustart noch da: ' + $('kiStatus').textContent);
    await foto('12-einstellungen-nach-neustart');
    $('entfernenKnopf').click();
    await pause(500);
    pruefen($('kiStatus').textContent.startsWith('Kein API-Schlüssel'), 'Schlüssel entfernt: ' + $('kiStatus').textContent);

    reiter('assistent');
    await pause(1000);
    await warten(() => blasen().length > 0 && !$('sendenKnopf').disabled, 30);
    pruefen($('kiZeile').textContent.startsWith('Eingebauter'), 'Assistent-Zeile: ' + $('kiZeile').textContent);
    await frage('wie oft kam die 7', '7', 60);
    await foto('13-eingebaut');

    // Update-Knopf: weder SideStore noch AltStore da – dann muss die Download-Seite in Safari aufgehen
    melden('FOTO-NACH 6 14-update-knopf-safari');
    window.webkit.messageHandlers.app.postMessage({ art: 'updaten' });
  }

  async function los() {
    melden('START Lauf ' + lauf + ' – ' + navigator.userAgent);
    try {
      if (lauf === '2') await lauf2();
      else await lauf1();
    } catch (e) {
      pruefen(false, 'Test abgebrochen: ' + kurz(e) + (e && e.stack ? ' ' + e.stack.replace(/\s+/g, ' ') : ''));
    }
    melden(fehler ? 'ENDE FEHLER ' + fehler : 'ENDE OK');
  }

  if (document.readyState === 'complete') los();
  else window.addEventListener('load', () => setTimeout(los, 500));
})();
