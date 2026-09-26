# Flankenscore – Build-Anleitung

Flankenscore besteht aus einer Web-App ohne Framework (`index.html`, `css/`, `js/`, `assets/`), die in drei Varianten ausgeliefert wird:

| Komponente | Ergebnis | Werkzeug |
|---|---|---|
| Web-App / PWA (iPad, Browser) | Repo-Root, z.B. auf GitHub Pages | keins, nur statische Dateien |
| Einzeldatei | `dist/flankenscore.html` | Python (`build.py`) |
| Android-App | APK / AAB | Python, Node.js, Capacitor, Android SDK, JDK |

Mehr zur Architektur steht in [DESIGN.md](DESIGN.md).

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

**Wichtig bei Änderungen:** In [sw.js](sw.js) die `VERSION` erhöhen (z.B. `flankenscore-v2`), sonst bleibt bei Nutzern die alte Version im Cache. Neue Dateien zusätzlich in `APP_FILES` eintragen.

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

Vor einem neuen Release in [android/app/build.gradle](android/app/build.gradle) `versionCode` (+1) und `versionName` erhöhen.

---

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
- [ ] `VERSION` in `sw.js` erhöhen (Web-App)
- [ ] Bei neuen Dateien: `APP_FILES` in `sw.js` ergänzen
- [ ] Für ein Android-Release: `versionCode`/`versionName` erhöhen, `npm run android:release`
