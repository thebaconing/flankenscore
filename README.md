# Flankenscore – Build-Anleitung

Flankenscore besteht aus einer Web-App ohne Framework (`index.html`, `css/`, `js/`, `assets/`), die in drei Varianten ausgeliefert wird:

| Komponente | Ergebnis | Werkzeug |
|---|---|---|
| Web-App / PWA (iPad, Browser) | Repo-Root, z.B. auf GitHub Pages | keins, nur statische Dateien |
| Einzeldatei | `dist/flankenscore.html` | Python (`build.py`) |
| Android-App | APK / AAB | Python, Node.js, Capacitor, Android SDK, JDK |

Mehr zur Architektur steht in [DESIGN.md](DESIGN.md).

## Aktuelle Version

| Feld | Wert | Datei |
|---|---|---|
| App-Version (`versionName`) | **1.1** | `android/app/build.gradle` |
| Android `versionCode` | **2** | `android/app/build.gradle` |
| npm-Version | 1.1.0 | `package.json` |
| Service-Worker-Cache | `flankenscore-v2` | `sw.js` |


---

## Voraussetzungen

| Werkzeug | Version | Wofür |
|---|---|---|
| Python | 3.x | `build.py` (alle Builds außer der reinen Web-App) |
| Node.js + npm | aktuelle LTS | Capacitor-CLI und -Plugins (Android) |
| JDK | 21 | Gradle-Build (Android) |
| Android SDK | API 36 (compileSdk/targetSdk), minSdk 24 | Android-Build, z.B. über Android Studio |

Für Android außerdem `ANDROID_HOME` bzw. `android/local.properties` mit `sdk.dir=...` setzen. Android Studio erledigt das beim ersten Öffnen des Projekts.

---

## 1. Web-App lokal starten

Ohne Build direkt aus dem Repo-Root:

```bash
python -m http.server 8000
```

Dann <http://localhost:8000> öffnen. Der Service Worker wird nur über HTTPS registriert, lokal läuft die App also ohne Offline-Cache.

## 2. Web-App / PWA veröffentlichen (GitHub Pages)

Der Repo-Root ist die Web-App. Für GitHub Pages unter *Settings → Pages* als Quelle den Branch `main` mit Ordner `/ (root)` wählen.

Auf iPad/iPhone die Seite in Safari öffnen und mit *Teilen → Zum Home-Bildschirm* installieren. Danach läuft sie offline.

**Wichtig bei Änderungen:** Die `VERSION` in [sw.js](sw.js) wird von `build.py` automatisch erhöht. Ohne neuen Build bleibt bei Nutzern die alte Version im Cache. Neue Dateien zusätzlich in `APP_FILES` eintragen.

## 3. Einzeldatei bauen

```bash
python build.py
# oder
npm run build
```

Das erzeugt:

- `dist/flankenscore.html`: eine Datei mit eingebettetem CSS, JavaScript, Logo und Icons, ohne Manifest und Service Worker. Sie läuft offline und lässt sich per Mail, USB-Stick usw. weitergeben.
- `www/index.html`: dasselbe als Web-Verzeichnis für Capacitor (nicht im Repo, siehe `.gitignore`)

`dist/flankenscore.html` ist eingecheckt. Nach Änderungen an `index.html`, `css/` oder `js/` neu bauen und mit committen.

## 4. Android-App bauen

Einmalig die Abhängigkeiten installieren:

```bash
npm install
```

### Debug-APK

```bash
npm run android:apk
```

Das führt `build.py` aus, synchronisiert `www/` nach `android/` (`npx cap sync android`) und baut mit Gradle.
Ergebnis: `android/app/build/outputs/apk/debug/app-debug.apk`

> Die npm-Skripte rufen `.\gradlew.bat` auf und laufen deshalb nur unter Windows. Unter Linux/macOS:
> ```bash
> python build.py && npx cap sync android && cd android && ./gradlew assembleDebug
> ```

### In Android Studio öffnen / auf Gerät starten

```bash
npm run android:sync   # Web-Build + Sync
npm run android:open   # öffnet android/ in Android Studio
```

### Release (signiert)

1. Keystore anlegen (einmalig, danach sicher aufbewahren, er ist nicht ersetzbar):
   ```bash
   keytool -genkey -v -keystore flankenscore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias flankenscore
   ```
2. `android/keystore.properties.example` nach `android/keystore.properties` kopieren und Pfad und Passwörter eintragen. Diese Datei **nicht committen**.
3. Bauen:
   ```bash
   npm run android:release
   ```
   Ergebnis: `android/app/build/outputs/apk/release/app-release.apk`

   Für den Play Store stattdessen ein App Bundle bauen:
   ```bash
   cd android && .\gradlew.bat bundleRelease
   ```
   Ergebnis: `android/app/build/outputs/bundle/release/app-release.aab`

Ohne `keystore.properties` wird die Release-Variante unsigniert gebaut.

Die Version wird bei jedem Build automatisch erhöht (siehe „Automatische Versionierung“).

---

## Automatische Versionierung

Jeder Aufruf von `build.py` (also auch `npm run build` und alle `android:*`-Skripte außer `android:open`) erhöht die Version:

| Wert | Änderung | Beispiel |
|---|---|---|
| `versionName` | +0.1 | 1.0 → 1.1 |
| `versionCode` | +1 | 1 → 2 |
| Service-Worker-Cache | +1 | `flankenscore-v1` → `flankenscore-v2` |
| `package.json` | folgt `versionName` | 1.1.0 |

Die neuen Werte werden automatisch in diese README und in DESIGN.md eingetragen. Ohne Erhöhung bauen:

```bash
python build.py --no-bump
```

Die Historie (Tabelle unten) wird **nicht** automatisch ergänzt, dort bitte eine Zeile zur neuen Version eintragen.

## Übersicht der npm-Skripte

| Skript | Aktion |
|---|---|
| `npm run build` | Einzeldatei + `www/` bauen |
| `npm run android:sync` | Build + Capacitor-Sync |
| `npm run android:open` | Android Studio öffnen |
| `npm run android:apk` | Build + Sync + Debug-APK |
| `npm run android:release` | Build + Sync + Release-APK |

## Checkliste nach Code-Änderungen

- [ ] `python build.py` ausführen und `dist/flankenscore.html` committen
- [ ] Web-App ohne Build geändert? Dann `VERSION` in `sw.js` von Hand erhöhen
- [ ] Bei neuen Dateien: `APP_FILES` in `sw.js` ergänzen
- [ ] Für ein Android-Release: `npm run android:release`
- [ ] Versionstabelle und Historie in README.md und DESIGN.md aktualisieren

---

## Versionshistorie

Aktuell: **1.1 (versionCode 2)**. Die Version wird bei jedem Build automatisch erhöht.

| Datum | Änderungen |
|---|---|
| 2026-09-26 | Beendetes Turnier zum Bearbeiten öffnen (Würfe und Strafen korrigieren) und wieder abschließen |
| 2026-09-26 | Regelwerk jederzeit als Overlay aufrufbar, das laufende Spiel bleibt unverändert |
| 2026-09-26 | Build: Version wird bei jedem Build automatisch erhöht (+0.1 / versionCode +1) |
| 2026-09-26 | Dokumentation: Designdokument aktualisiert, README mit Build-Anleitung |
| 2026-09-26 | Startfehler-Anzeige: nur Fehler beim Start melden, keine späteren (fremden) Fehler |
| 2026-09-26 | iPad/iPhone: installierbare Web-App (Manifest, Service Worker, App-Icons) |
| 2026-09-26 | Android: Release-Signierung über `keystore.properties` |
| 2026-09-26 | Mehrere Turniere mit Verlauf, Gesamtstatistik, native Sicherung, Android-App (Capacitor) |
| 2026-09-25 | Verwarnungen & Strafen mit Mahn-Konto, Anpassungen für die mobile Ansicht |
| 2026-09-25 | Laufendes Spiel abbrechen, Würfe nachträglich bearbeiten |
| 2026-09-25 | Logo eingebunden und im Build eingebettet |
| 2026-09-25 | Erste Version: Turnierlogik, Live-Tracking, Statistiken, Einzeldatei-Build |
