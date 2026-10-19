package eurojackpot;

import java.awt.Component;
import java.awt.Container;
import java.awt.Frame;
import java.awt.Graphics2D;
import java.awt.Window;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.KeyFactory;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.SplittableRandom;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Predicate;
import java.util.function.Supplier;
import javax.imageio.ImageIO;
import javax.swing.AbstractButton;
import javax.swing.JComponent;
import javax.swing.JDialog;
import javax.swing.JFrame;
import javax.swing.JPopupMenu;
import javax.swing.RootPaneContainer;
import javax.swing.SwingUtilities;
import javax.swing.UIManager;

/**
 * Selbsttest der Mac-App auf GitHub (.github/workflows/mac.yml) – nicht Teil des Programms. Läuft mit dem Java aus der
 * fertigen App gegen EuroJackpot.jar:
 *
 *   fotos <ordner> <hell|dunkel>          Programm starten, durch alle Seiten und den Dialog „KI-Modelle“ klicken, Bilder
 *   ki <ordner>                            lokale KI: Laufzeit aus der App, kleinstes Modell laden, ein paar Fragen
 *   modell <ordner> <nr> <llama-server> <arbeitsordner> [kurz]
 *                                          ein empfohlenes Modell (Nummer in KiKatalog.EMPFOHLEN) mit Fragen prüfen
 *   schluessel <ordner>                    Test-Schlüssel und update.properties (eurojackpot/) für den Update-Test
 *   update <ordner> <dmg> <schluessel>     signierte Test-update.txt schreiben, dann das Update holen und austauschen
 */
public final class MacProbe {
    private static final LocalDate HEUTE = LocalDate.now();

    public static void main(String[] a) {
        try {
            Path aus = Path.of(a[1]);
            Files.createDirectories(aus);
            wachhund(switch (a[0]) {
                case "fotos" -> 300;
                case "update" -> 480;
                case "modell" -> 10000; // große Modelle auf kleinen Testrechnern
                default -> 3000;
            });
            switch (a[0]) {
                case "fotos" -> fotos(aus, a[2]);
                case "ki" -> ki(aus);
                case "modell" -> modell(aus, Integer.parseInt(a[2]), new File(a[3]), new File(a[4]), a.length > 5 && a[5].equals("kurz"));
                case "schluessel" -> schluessel(aus);
                case "update" -> update(aus, Path.of(a[2]), Path.of(a[3]));
                default -> throw new IllegalArgumentException("Unbekannt: " + a[0]);
            }
        } catch (Throwable t) {
            // sofort beenden – sonst hält der Swing-Thread das Programm bis zum Zeitlimit am Leben
            t.printStackTrace();
            Runtime.getRuntime().halt(1);
        }
    }

    /** Hängt etwas zu lange: alle Threads mit Stapel ausgeben (zeigt, wo es hängt) und beenden. */
    private static void wachhund(int sekunden) {
        Thread t = new Thread(() -> {
            try {
                Thread.sleep(sekunden * 1000L);
            } catch (InterruptedException e) {
                return;
            }
            System.err.println("ZEITLIMIT nach " + sekunden + " s – Threads:");
            for (var e : Thread.getAllStackTraces().entrySet()) {
                System.err.println("\n" + e.getKey());
                for (StackTraceElement s : e.getValue()) System.err.println("    at " + s);
            }
            for (Window w : Window.getWindows()) System.err.println("Fenster: " + w.getClass().getName() + " sichtbar=" + w.isShowing());
            Runtime.getRuntime().halt(2);
        }, "Wachhund");
        t.setDaemon(true);
        t.start();
    }

    /* ---------- Bilder */

    private static void fotos(Path aus, String design) throws Exception {
        Speicher.einstellungSpeichern("design", design);
        Speicher.einstellungSpeichern("tutorial.gesehen.3", "ja");
        Speicher.einstellungSpeichern("updates.automatisch", "nein");
        EuroJackpot.main(new String[0]);
        JFrame f = (JFrame) warten(() -> {
            for (Frame x : Frame.getFrames()) if (x instanceof JFrame j && j.isShowing()) return j;
            return null;
        }, 60);
        Thread.sleep(6000);
        try (PrintStream b = new PrintStream(Files.newOutputStream(aus.resolve("bericht-" + design + ".txt")), true, StandardCharsets.UTF_8)) {
            b.println("Mac: " + Plattform.MAC + " · Architektur " + System.getProperty("os.arch") + " · Apple-Chip " + MacUpdate.appleChip());
            b.println("macOS " + System.getProperty("os.version") + " · Java " + System.getProperty("java.version"));
            b.println("Look and Feel: " + UIManager.getLookAndFeel().getClass().getName());
            b.println("Schrift: " + Stil.TABELLE.getFamily() + " / " + Stil.TABELLE.getFontName());
            b.println("dunkel: " + Stil.dunkel() + " · Erscheinung: " + System.getProperty("apple.awt.application.appearance"));
            b.println("Daten: " + Speicher.ordner());
            b.println("KI-Laufzeit: " + KiPc.laufzeitOrdner() + " da=" + KiPc.laufzeitDa() + " · Arbeitsspeicher " + KiModell.gb(KiPc.arbeitsspeicher()));
            b.println("App: " + MacUpdate.eigeneApp() + " · austauschbar " + MacUpdate.austauschbar());
            b.println("Version " + UpdateDienst.EIGENE.version() + " (Build " + UpdateDienst.EIGENE.build() + ")");
            b.println("Fenster: " + f.getWidth() + " x " + f.getHeight());
        }
        String[] reiter = {"Ziehungen", "Kombinationen", "Diagramm", "Vorhersage", "KI-Assistent"};
        for (int i = 0; i < reiter.length; i++) {
            String r = reiter[i];
            AbstractButton k = finde(f, AbstractButton.class, t -> t.equals(r));
            auf(k::doClick);
            Thread.sleep(i == 1 || i == 3 ? 9000 : 3000); // Kombinationen und Vorhersage rechnen erst
            foto(f, aus.resolve(design + "-" + (i + 1) + "-" + r + ".png"));
            if (i == 0) bildschirm(aus.resolve(design + "-bildschirm.png"));
        }
        // KI-Menü und Dialog „KI-Modelle“
        AbstractButton ki = finde(f, AbstractButton.class, t -> t.equals("KI einrichten") || t.equals("KI-Modell") || t.equals("Online-KI"));
        auf(ki::doClick);
        Thread.sleep(1500);
        JPopupMenu menue = (JPopupMenu) warten(() -> sichtbar(JPopupMenu.class), 10);
        foto(menue, aus.resolve(design + "-6-ki-menue.png"));
        JComponent punkt = finde(menue, JComponent.class, t -> t.startsWith("KI-Modell"));
        SwingUtilities.invokeLater(() -> punkt.dispatchEvent(new java.awt.event.MouseEvent(punkt, java.awt.event.MouseEvent.MOUSE_RELEASED,
                System.currentTimeMillis(), 0, punkt.getWidth() / 2, punkt.getHeight() / 2, 1, false, java.awt.event.MouseEvent.BUTTON1)));
        // (der Dialog ist modal – darum nicht darauf warten)
        JDialog d = (JDialog) warten(() -> {
            for (Window w : Window.getWindows()) if (w instanceof JDialog j && j.isShowing()) return j;
            return null;
        }, 20);
        Thread.sleep(2500);
        foto(d, aus.resolve(design + "-7-ki-empfohlen.png"));
        bildschirm(aus.resolve(design + "-ki-bildschirm.png"));
        auf(finde(d, AbstractButton.class, t -> t.equals("Suchen"))::doClick);
        Thread.sleep(12000); // die Suche fragt Hugging Face
        foto(d, aus.resolve(design + "-8-ki-suchen.png"));
        auf(finde(d, AbstractButton.class, t -> t.equals("Geladen"))::doClick);
        Thread.sleep(1500);
        foto(d, aus.resolve(design + "-9-ki-geladen.png"));
        auf(d::dispose);
        System.out.println("Bilder fertig: " + design);
        System.exit(0);
    }

    private static Object warten(Supplier<Object> s, int sekunden) throws Exception {
        for (int i = 0; i < sekunden * 4; i++) {
            AtomicReference<Object> r = new AtomicReference<>();
            SwingUtilities.invokeAndWait(() -> r.set(s.get()));
            if (r.get() != null) return r.get();
            Thread.sleep(250);
        }
        throw new IllegalStateException("nicht erschienen");
    }

    private static <T extends Component> T sichtbar(Class<T> art) {
        for (Window w : Window.getWindows()) {
            T t = suche(w, art, x -> true);
            if (t != null && t.isShowing()) return t;
        }
        return null;
    }

    private static <T extends Component> T finde(Container c, Class<T> art, Predicate<String> text) throws Exception {
        AtomicReference<T> r = new AtomicReference<>();
        SwingUtilities.invokeAndWait(() -> r.set(suche(c, art, x -> text(x) != null && text.test(text(x)))));
        if (r.get() == null) throw new IllegalStateException("Nicht gefunden in " + c.getClass().getSimpleName());
        return r.get();
    }

    private static <T extends Component> T suche(Component c, Class<T> art, Predicate<Component> passt) {
        if (art.isInstance(c) && c.isShowing() && passt.test(c)) return art.cast(c);
        if (c instanceof JComponent j && j.getComponentPopupMenu() != null) {
            T t = suche(j.getComponentPopupMenu(), art, passt);
            if (t != null) return t;
        }
        if (c instanceof Container k) {
            for (Component x : k.getComponents()) {
                T t = suche(x, art, passt);
                if (t != null) return t;
            }
        }
        return null;
    }

    /** Beschriftung eines Knopfs oder Menüpunkts (der hat sie als Namen für Bildschirmleser). */
    private static String text(Component c) {
        if (c instanceof AbstractButton b) return b.getText() != null ? b.getText().trim() : null;
        if (c instanceof JComponent j && !(c instanceof JPopupMenu)) {
            // eigene Bausteine haben oft gar keinen AccessibleContext
            javax.accessibility.AccessibleContext a = j.getAccessibleContext();
            if (a != null && a.getAccessibleName() != null) return a.getAccessibleName().trim();
        }
        return null;
    }

    private static void auf(Runnable r) throws Exception {
        SwingUtilities.invokeAndWait(r);
    }

    private static void foto(Component c, Path datei) throws Exception {
        AtomicReference<BufferedImage> r = new AtomicReference<>();
        auf(() -> {
            Component z = c instanceof RootPaneContainer w ? w.getRootPane() : c;
            BufferedImage b = new BufferedImage(Math.max(1, z.getWidth()), Math.max(1, z.getHeight()), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = b.createGraphics();
            z.paint(g);
            g.dispose();
            r.set(b);
        });
        ImageIO.write(r.get(), "png", datei.toFile());
    }

    /** Ganzer Bildschirm mit Titelleiste – mit dem Bildschirmfoto-Programm von macOS. */
    private static void bildschirm(Path datei) {
        try {
            Process p = new ProcessBuilder("screencapture", "-x", datei.toString()).inheritIO().start();
            if (!p.waitFor(20, java.util.concurrent.TimeUnit.SECONDS)) {
                p.destroyForcibly();
                System.out.println("screencapture hängt – übersprungen");
            }
        } catch (Exception e) {
            System.out.println("screencapture: " + e);
        }
    }

    /* ---------- KI */

    private static List<Ziehung> ziehungen() {
        List<Ziehung> l = new ArrayList<>();
        for (Ziehung z : Speicher.startdaten()) if (!z.geloescht) l.add(z);
        l.sort(Comparator.comparing(z -> z.datum));
        return l;
    }

    private static void ki(Path aus) throws Exception {
        try (PrintStream out = new PrintStream(Files.newOutputStream(aus.resolve("ki.txt")), true, StandardCharsets.UTF_8)) {
            out.println("Laufzeit: " + KiPc.laufzeitOrdner() + " · da=" + KiPc.laufzeitDa());
            if (!KiPc.laufzeitDa()) throw new IllegalStateException("KI-Laufzeit fehlt in der App");
            File programm = KiPc.programm();
            out.println("Programm (Kopie): " + programm);
            if (!programm.getPath().contains("EuroJackpot-KI")) throw new IllegalStateException("Laufzeit wurde nicht kopiert");
            KiModell m = KiPc.modelle().neu(KiKatalog.EMPFOHLEN.get(0));
            laden(m, out);
            KiPc.modelle().aktivSetzen(m);
            gespraeche(KiPc.dienst(), out, new String[][] {{"hallo", "wie oft kam die 7?", "und die 8?", "erzähl einen witz",
                "welche zahlen soll ich tippen"}}, 300_000);
        }
        System.exit(0);
    }

    private static void modell(Path aus, int nr, File programm, File arbeit, boolean kurz) throws Exception {
        KiKatalog.Eintrag e = KiKatalog.EMPFOHLEN.get(nr);
        try (PrintStream out = new PrintStream(Files.newOutputStream(aus.resolve("modell-" + nr + ".txt")), true, StandardCharsets.UTF_8)) {
            out.println(e.name() + " · " + e.quelle() + " · " + e.pfad() + " · " + KiModell.gb(e.groesse()));
            KiModell m = new KiModelle(arbeit).neu(e);
            laden(m, out);
            int threads = Runtime.getRuntime().availableProcessors();
            KiDienst d = new KiDienst(programm, m.datei(), arbeit, null, threads,
                    Arrays.asList("--ctx-checkpoints", "4", "--checkpoint-min-step", "64", "--cache-ram", "0"));
            String[][] fragen = kurz ? new String[][] {{"hallo", "wie oft kam die 7?"}}
                    : new String[][] {{"hallo", "wie oft kam die 7?", "und die 8?", "warum?"},
                        {"erzähl einen witz", "was ist die hauptstadt von frankreich", "lohnt sich das spielen überhaupt",
                            "mach mir einen tipp für freitag", "warum diese zahlen?"}};
            gespraeche(d, out, fragen, 3_600_000);
        }
        System.exit(0);
    }

    private static void laden(KiModell m, PrintStream out) throws Exception {
        long t0 = System.nanoTime();
        int[] zehntel = {-1};
        m.laden((g, gesamt, pruefen) -> {
            int z = (int) (10 * g / Math.max(1, gesamt));
            if (z != zehntel[0] || pruefen) {
                zehntel[0] = z;
                System.out.println("  " + m.name + ": " + (pruefen ? "prüfen" : z * 10 + " %"));
            }
        }, new AtomicBoolean());
        if (!m.vorhanden()) throw new IllegalStateException("Modell nicht vollständig");
        out.printf("Geladen: %s (%s) in %.0f s%n", m.name, m.groesseText(), (System.nanoTime() - t0) / 1e9);
    }

    private static void gespraeche(KiDienst d, PrintStream out, String[][] gespraeche, long startMs) throws Exception {
        List<Ziehung> l = ziehungen();
        Vorhersager.Ergebnis[] cache = new Vorhersager.Ergebnis[1];
        Supplier<Vorhersager.Ergebnis> v = () -> {
            if (cache[0] == null) cache[0] = Vorhersager.berechnen(l, 1, 1, 5);
            return cache[0];
        };
        long t0 = System.nanoTime();
        d.starten(startMs);
        out.printf("Start: %.1f s%n", (System.nanoTime() - t0) / 1e9);
        t0 = System.nanoTime();
        KiAssistent.vorbereiten(d, HEUTE);
        out.printf("Vorbereiten: %.1f s%n%n", (System.nanoTime() - t0) / 1e9);
        int leer = 0, app = 0, n = 0;
        try {
            for (String[] gespraech : gespraeche) {
                if (n > 0) KiAssistent.neuesGespraech(d, HEUTE);
                Assistent.Gespraech g = new Assistent.Gespraech();
                KiAssistent ki = new KiAssistent(new Assistent(l, v, HEUTE, new SplittableRandom(42)), HEUTE, d);
                for (String f : gespraech) {
                    long s = System.nanoTime();
                    Assistent.Antwort a = ki.antworten(f, g, x -> {}, new AtomicBoolean());
                    String[] letzt = g.ki.get(g.ki.size() - 1);
                    boolean daten = letzt[1].startsWith(KiAssistent.MARKE);
                    if (daten) app++;
                    if (a.text().isBlank()) leer++;
                    n++;
                    out.printf("» %s%n  [%s · %.1f s]%n  %s%n%n", f, daten ? "App: " + letzt[1] : "KI-Text", (System.nanoTime() - s) / 1e9,
                            a.text().replace("\n", "\n  "));
                }
                out.println("==========");
            }
        } finally {
            d.stoppen();
        }
        out.printf("Fragen: %d · mit App-Daten: %d · leer: %d%n", n, app, leer);
        if (leer > 0) throw new IllegalStateException(leer + " leere Antworten");
    }

    /* ---------- Update */

    private static void schluessel(Path ordner) throws Exception {
        KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
        g.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair kp = g.generateKeyPair();
        Files.writeString(ordner.resolve("privat.key"), Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded()));
        Path paket = ordner.resolve("klassen").resolve("eurojackpot");
        Files.createDirectories(paket);
        Files.writeString(paket.resolve(UpdateInfo.EIGENSCHAFTEN), "version=1.0\nbuild=1000000\nquelle=test/test\nschluessel="
                + Base64.getEncoder().encodeToString(kp.getPublic().getEncoded()) + "\n", StandardCharsets.UTF_8);
        System.out.println("Test-Schlüssel angelegt");
    }

    private static void update(Path ordner, Path dmg, Path schluessel) throws Exception {
        String name = dmg.getFileName().toString();
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(Files.readAllBytes(dmg));
        String sha = UpdateInfo.hex(md);
        long groesse = Files.size(dmg);
        StringBuilder sb = new StringBuilder("# Test\nversion=99.0\nbuild=99999999\n");
        for (String art : new String[] {"mac", "macintel"}) {
            sb.append(art).append(".name=").append(name).append('\n').append(art).append(".sha256=").append(sha).append('\n')
                    .append(art).append(".groesse=").append(groesse).append('\n');
        }
        sb.append("hinweis=Test-Update\n");
        PrivateKey k = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(
                Base64.getDecoder().decode(Files.readString(schluessel.resolve("privat.key")).strip())));
        Signature s = Signature.getInstance("SHA256withECDSA");
        s.initSign(k);
        s.update(sb.toString().getBytes(StandardCharsets.UTF_8));
        Files.writeString(ordner.resolve(UpdateInfo.MANIFEST), sb + "signatur=" + Base64.getEncoder().encodeToString(s.sign()) + "\n",
                StandardCharsets.UTF_8);

        UpdateDienst dienst = new UpdateDienst();
        UpdateDienst.Pruefung p = dienst.pruefen();
        System.out.println("Prüfung: " + p.meldung());
        if (p.neu() == null) {
            // genauer nachsehen, woran es liegt
            String basis = System.getenv("EUROJACKPOT_UPDATE_TEST");
            System.out.println("Testserver: " + basis);
            try {
                java.net.http.HttpResponse<String> r = java.net.http.HttpClient.newHttpClient().send(
                        java.net.http.HttpRequest.newBuilder(java.net.URI.create(basis + UpdateInfo.MANIFEST)).build(),
                        java.net.http.HttpResponse.BodyHandlers.ofString());
                System.out.println("direkt: HTTP " + r.statusCode() + " " + r.version() + " · " + r.body().length() + " Zeichen");
            } catch (Exception e) {
                e.printStackTrace(System.out);
            }
            throw new IllegalStateException("kein Update gefunden");
        }
        Path app = MacUpdate.austauschbar();
        System.out.println("App: " + app);
        if (app == null) throw new IllegalStateException("App nicht austauschbar");
        Path ziel = MacUpdate.ziel(p.neu().version, true);
        Files.createDirectories(ziel.getParent());
        long t0 = System.nanoTime();
        dienst.herunterladen(p.neu(), ziel, n -> {});
        System.out.printf("geladen in %.1f s%n", (System.nanoTime() - t0) / 1e9);
        t0 = System.nanoTime();
        MacUpdate.neustartVorbereiten(app);
        MacUpdate.installieren(ziel, app);
        System.out.printf("installiert in %.1f s%n", (System.nanoTime() - t0) / 1e9);
        Path alt = app.resolveSibling(app.getFileName() + ".alt");
        if (Files.exists(app.resolve("Contents/alt.txt"))) throw new IllegalStateException("alte Version noch da");
        if (!Files.exists(alt.resolve("Contents/alt.txt"))) throw new IllegalStateException("alte Version nicht beiseitegelegt");
        if (Files.exists(ziel)) throw new IllegalStateException("DMG nicht aufgeräumt");
        System.out.println("Update ok – die neue Version startet, sobald dieser Test endet");
        System.exit(0);
    }
}
