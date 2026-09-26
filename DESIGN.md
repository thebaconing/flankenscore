# Flankenscore – Designdokument

**App:** Flankenscore  
**Zweck:** Web-App zum Tracking von Flankiball-Turnieren mit Gruppenphase, K.o.-Runden, Spielerstatistiken und fairer Seitenvergabe.

---

## 1. Turnierlogik

### 1.1 Aufbau nach Teamanzahl

Siehe Tabelle unten. Das System wählt automatisch den Modus basierend auf der Teamanzahl.

| Teams | Gruppen | Format nach Gruppen | K.o.-Runden | Spiele gesamt | Hinweise |
|---|---|---|---|---|---|
| 2 | 1 | Best of 5 | — | max. 5 | — |
| 3 | 1 | Hin- & Rückrunde | Finale | 7 | — |
| 4 | 1 | Hin- & Rückrunde | Finale | 13 | Spiel um Platz 3 |
| 5 | 1 | RR (alle gegen alle) | HF, Finale | 14 | Spiel um Platz 3 |
| 6 | 2 | Hin- & Rückrunde je Gruppe | HF, Finale | 16 | Spiel um Platz 3 |
| 7 | 1 | RR | HF, Finale | 25 | Spiel um Platz 3 |
| 8 | 2 | HF je Gruppe | HF, Finale | 16 | — |
| 9 | 3 | HF je Gruppe | VF, HF, Finale | 22 | Spiel um Platz 3, Lucky Loser |
| 10 | 2 | HF je Gruppe | HF, Finale | 24 | — |
| 11 | 3 | HF je Gruppe (4/4/3) | VF, HF, Finale | 23 | Spiel um Platz 3 optional, Lucky Loser |
| 12 | 3 | HF je Gruppe | VF, HF, Finale | 25 | Lucky Loser, kein Spiel um Platz 3 |

**Erklärungen:**
- **RR** = Round Robin (jedes Team gegen jedes)
- **HF** = Halbfinale, **VF** = Viertelfinale
- **Spiel um Platz 3** = optional, zeitlich abhängig
- **Lucky Loser** = beste Verlierer-Teams, die beim Einzug in die nächste K.o.-Runde nachrücken

### 1.2 Gruppenphase

- **Punkte:** 1 Punkt für einen Sieg, 0 für eine Niederlage
- **Tie-Breaker bei gleichen Punkten:**
  1. Trefferquote (Treffer ÷ Würfe), absteigend
  2. Bei völlig identischer Quote: Kopfball oder als Konfetti-Match (nicht im System tracked)

- **Aufstieg in K.o.:** Beste Teams der Gruppen (Anzahl abhängig vom Modus)
  - Bei mehreren Gruppen: Gruppensieger automatisch, dann beste Zweite (und ggf. beste Dritte)

### 1.3 K.o.-Phasen

- **Paarungen:** Automatisch nach Standard-K.o.-Baum (1. vs. 2., 3. vs. 4., etc.)
- **Lucky Loser (9, 11, 12 Teams):** Beste Verlierer der Vorrunde rücken ein, wenn nicht genug Plätze durch reguläre Aufstiegskriterien gefüllt sind

### 1.4 Umsetzungsdetails

- **Gruppenauslosung:** Teams werden zufällig auf die Gruppen verteilt.
- **Spielplan:** Round Robin nach Kreis-Methode; Spieltage werden gruppenübergreifend verschränkt, damit alle Gruppen parallel spielen. Bei Hin- & Rückrunde werden im Rückspiel die Seiten getauscht.
- **Setzliste für die K.o.-Phase:** Gruppenplatz, dann Punkte pro Spiel (vergleichbar bei ungleich großen Gruppen, z.B. 4/4/3), Quote, Name. Paarungen nach Standard-Setzbaum (1 und 2 treffen frühestens im Finale). Teams derselben Gruppe werden in Runde 1 nach Möglichkeit getrennt.
- **Spiel um Platz 3:** Beim Anlegen per Schalter wählbar (Standard je Modus). Bei 4 Teams ohne Halbfinale: Gruppendritter gegen -vierter.
- **Best of 5 (2 Teams):** Nach jedem Spiel wird automatisch das nächste mit getauschtem Heimrecht erzeugt, bis ein Team 3 Siege hat.
- **Fortschritt:** Nach jeder Ergebnisänderung erzeugt `advance()` automatisch die nächste Runde bzw. beendet das Turnier.

---

## 2. Datenmodelle

### 2.1 Tournament

```
{
  id: UUID
  name: string
  date: date
  mode: 'group' | 'knockout' | 'groups_with_knockout'
  teamCount: number
  status: 'setup' | 'in_progress' | 'completed'
  groups: Group[]
  knockoutStages: KnockoutStage[]
  teams: Team[]
  matches: Match[]
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Umsetzung:** Gespeichert wird flach als `{ tournament, teams, players, matches }`. Groups und KnockoutStages liegen im `tournament`, Matches verweisen per `groupId` / `knockoutStageId`. Zusätzliche Felder:

```
tournament.config:   { groups: number[], legs: 1|2, qualifiers, series, thirdPlace }
tournament.settings: { autoSwitch: boolean }
group.teamIds:       UUID[]            // statt eingebetteter Teams
knockoutStage:       { kind: 'main' | 'third' | 'series', size: number }
team.players:        UUID[]            // Spieler-IDs
team.seed:           number | null     // Setzplatz in der K.o.-Phase
```

### 2.2 Team

```
{
  id: UUID
  tournamentId: UUID
  name: string
  players: Player[]  // immer 2 Spieler
  createdAt: timestamp
}
```

### 2.3 Player

```
{
  id: UUID
  teamId: UUID
  name: string
  stats: PlayerStats  // wird während des Turniers aktualisiert
  createdAt: timestamp
}
```

### 2.4 PlayerStats

```
{
  playerId: UUID
  throwsTotal: number      // Würfe insgesamt über alle Spiele
  hitsTotal: number        // Treffer insgesamt
  throwsByMatch: {
    matchId: number        // Würfe in diesem Match
  }
  hitsByMatch: {
    matchId: number        // Treffer in diesem Match
  }
  hitQuote: number         // hitsTotal / throwsTotal (cached)
}
```

### 2.5 Group

```
{
  id: UUID
  tournamentId: UUID
  name: string  // z.B. "Gruppe A"
  teams: Team[]
  matches: Match[]
  standings: Standings[]
  createdAt: timestamp
}
```

### 2.6 Match

```
{
  id: UUID
  tournamentId: UUID
  groupId?: UUID          // null bei K.o.
  knockoutStageId?: UUID  // null bei Gruppe
  homeTeamId: UUID
  awayTeamId: UUID
  sideAssignment: {
    homeTeamSide: 'side_a' | 'side_b'
    awayTeamSide: 'side_a' | 'side_b'
  }
  result?: {
    winnerTeamId: UUID
    homeTeamHits: number
    homeTeamThrows: number
    awayTeamHits: number
    awayTeamThrows: number
    homeTeamQuote: number  // hits / throws
    awayTeamQuote: number
  }
  throwSequence: ThrowEntry[]  // wer hat wann geworfen?
  status: 'not_started' | 'in_progress' | 'completed'
  createdAt: timestamp
  updatedAt: timestamp
}
```

**Zusätzliche Match-Felder (umgesetzt):**

```
matchday?: number                       // Spieltag in der Gruppenphase
slot?: number                           // Position im K.o.-Baum / in der Serie
label?: string                          // z.B. "Spiel 3" (Best of 5)
playerOrder: { [teamId]: UUID[] }       // Wurfreihenfolge je Team
startingTeamId: UUID                    // Team mit dem ersten Wurf
penalties: Penalty[]                    // siehe 2.9
```

### 2.7 ThrowEntry

```
{
  id: UUID
  matchId: UUID
  playerId: UUID
  teamId: UUID
  throwNumber: number      // 1, 2, 3, ...
  isHit: boolean
  timestamp: timestamp
}
```

### 2.8 KnockoutStage

```
{
  id: UUID
  tournamentId: UUID
  stageName: string  // z.B. "Viertelfinale"
  matches: Match[]
  createdAt: timestamp
}
```


### 2.9 Penalty (Verwarnungen & Strafen)

```
{
  id: UUID
  matchId: UUID
  type: 'warning' | 'skip_player' | 'skip_team' | 'strafhalbe'
  teamId: UUID
  playerId: UUID | null   // null bei Team-Strafen (warning, skip_team)
  beforeThrow: number     // Anzahl Würfe zum Zeitpunkt der Strafe
  timestamp: timestamp
  causedBy?: UUID         // automatische Folgestrafe → auslösende Verwarnung
}
```

---

## 3. Ergebniserfassung & Spieler-Tracking

### 3.1 Live-Tracking während eines Spiels

**Workflow:**
1. Match-Details anzeigen (Teams, aktuelle Seite, Würfe/Treffer)
2. Beim Start des Spiels: **Spieler-Reihenfolge festlegen** (wer wirft als Erster?)
3. **Während des Spiels:** Nach jedem Wurf eingeben:
   - Welcher Spieler hat geworfen?
   - Hat er getroffen oder nicht?
   - System merkt sich die Reihenfolge automatisch
4. **Spielende:** Gewinner wird eingegeben → Ergebnis (Treffer/Würfe) wird berechnet

### 3.2 Automatisierung

**UI-Option:** Toggle "Wechsel automatisch" – wenn AN:
- Nach jedem Wurf wechselt das System automatisch zum nächsten Spieler der gleichen Mannschaft
- Spieler in Team-Reihenfolge: `players[0]` → `players[1]` → `players[0]` → ...

**UI-Option:** Toggle "Gewinner automatisch erkennen"
- Optional: System erkennt automatisch, wenn Bier leer (über beliebige externe Trigger, z.B. QR-Code oder manueller Button)

### 3.3 Datenerfassung

```
Ansicht während Match:

┌─────────────────────────┐
│ Match: Team A vs Team B  │
│ Seite: A-left / B-right │
├─────────────────────────┤
│ Team A Throws: 5 Hits: 3 │
│ Team B Throws: 4 Hits: 2 │
├─────────────────────────┤
│ Nächster Wurf:          │
│ [Team A - Player 1]     │
│ [✓ Treffer] [✗ Daneben] │
│                         │
│ [Auto-Wechsel: AN]      │
├─────────────────────────┤
│ [Spiel beenden]         │
│ Gewinner: [Team A / B]  │
└─────────────────────────┘
```

### 3.4 Umgesetzter Match-Ablauf

1. **Vorbereitung:** Seiten (Links/Rechts) werden vorgeschlagen, beginnendes Team und Spieler-Reihenfolge je Team werden gewählt.
2. **Live:** Teams werfen abwechselnd, innerhalb eines Teams wird rotiert („Wechsel automatisch“, Einstellung pro Turnier). Bei ausgeschaltetem Auto-Wechsel kann der Werfer frei gewählt werden.
3. **Korrekturen:**
   - „Letzte Eingabe zurücknehmen“ (Wurf oder Strafe, je nachdem was zuletzt kam)
   - Wurfliste: Spieler nachträglich ändern, Treffer/Daneben umschalten, Wurf löschen (Nummern und Strafen-Zeitpunkte rücken nach)
   - Laufendes Spiel abbrechen: zurück auf „offen“, Würfe und Strafen werden verworfen, Reihenfolge bleibt als Vorauswahl
4. **Spielende:** Gewinner per Button (mit Bestätigung), Ergebnis wird aus den Würfen berechnet.
5. **Ergebnis korrigieren:** Ein beendetes Spiel kann wieder geöffnet werden, solange kein davon abhängiges Spiel begonnen hat. Noch nicht begonnene Folgerunden werden dabei verworfen und neu ausgelost.

### 3.5 Verwarnungen & Strafen

| Typ | Ziel | Wirkung |
|---|---|---|
| ⚠ Verwarnung | Team | Zählt aufs Mahn-Konto des Teams |
| ⏸ Aussetzen | Spieler | Spieler darf beim nächsten Treffer seines Teams nicht trinken |
| ⏸⏸ Teamaussetzen | Team | Ganzes Team darf beim nächsten eigenen Treffer nicht trinken |
| 🍺 Strafhalbe | Spieler | Wird nur gezählt |

- **Mahn-Konto:** 4 Verwarnungen → automatisches Teamaussetzen; 8 Verwarnungen → Strafhalbe für jedes Teammitglied, danach steht das Konto wieder bei 0.
- Automatische Folgestrafen hängen an der auslösenden Verwarnung (`causedBy`) und verschwinden mit ihr; beim Löschen einer Verwarnung werden spätere Folgestrafen neu berechnet.
- Offene Trinkverbote werden an den Spielern als Badge angezeigt und gelten als abgegolten, sobald das Team das nächste Mal trifft.
- Strafen erscheinen in Team- und Spielerstatistik, der Gesamtstatistik und im CSV-Export.

---

## 4. Seitenvergabe & Fairness

### 4.1 Anforderung

Jedes Team soll über alle Spiele hinweg **ungefähr gleich oft** auf jeder Seite spielen (home/away-Balance).

### 4.2 Algorithmus

**Priorität 1: Gruppenphase**
- Bei der Turnierplanung: Seitenvergabe so auswählen, dass jedes Team in der Gruppe etwa 50:50 auf Seite A und B spielt
- Bei 2 Spielen: einmal Seite A, einmal Seite B
- Bei 3+ Spielen: möglichst abwechselnd oder ausbalanciert

**Priorität 2: K.o.-Phasen (dynamisch)**
- Beim Erstellen jedes K.o.-Spiels:
  1. Zähle bisherige Seitenvergaben für beide Teams
  2. Wer hat mehr auf Seite A gespielt? → Der spielt diesmal auf Seite B
  3. Bei Gleichstand: höhergesetztes Team oder alphabetisch

### 4.3 Tracking

Jedes Team hat einen Seitenzähler:

```
{
  teamId: UUID
  sideA_count: number
  sideB_count: number
  difference: number  // sideA_count - sideB_count
}
```

---

## 5. Statistiken & Tie-Breaker

### 5.1 Team-Statistiken (in Gruppe)

```
{
  teamId: UUID
  points: number          // Siege × 1
  matchesPlayed: number
  wins: number
  losses: number
  hitsTotal: number       // über alle Spiele
  throwsTotal: number
  hitQuote: number        // hitsTotal / throwsTotal
}
```

### 5.2 Spieler-Statistiken

```
{
  playerId: UUID
  name: string
  throwsTotal: number
  hitsTotal: number
  hitQuote: number
  matchesPlayed: number
  wins: number  // Spiele, in denen sein Team gewann
  losses: number
}
```

### 5.3 Ranking in Gruppe

**Sortierung:**
1. Punkte (descending)
2. Trefferquote (descending)
3. Alphabetisch (tiebreaker)

### 5.4 Spieler-Rangliste (über alle Spiele)

- Sortierung nach Quote (mit Mindest-Wurfanzahl, z.B. ≥ 5 Würfe)
- Sekundär: Treffer absolut

### 5.5 Gesamtstatistik (turnierübergreifend)

- Fasst alle gespeicherten Turniere zusammen; Spieler und Teams werden über den **Namen** (ohne Groß-/Kleinschreibung) zusammengeführt, da IDs pro Turnier neu vergeben werden.
- **Spieler:** Turniere, Titel, Würfe, Treffer, Quote, Spiele, Siege, Strafen; Sortierung wie 5.4 (Mindestwürfe einstellbar)
- **Teams:** Titel ↓, Siege ↓, Siegquote ↓, Name
- Titel = Platz 1, Podium = Platz 1–3 (aus Finale / Spiel um Platz 3 bzw. Best of 5)

---

## 6. UI/UX – Screens

### 6.1 Setup

**Screen: Turnier erstellen**
- [ ] Turniername
- [ ] Datum
- [ ] Teams hinzufügen (Name, 2 Spieler pro Team)
- [ ] Button: "Turnier starten" → Mode wird auto-erkannt → Gruppen & Matches erstellt

### 6.2 Überblick (Dashboard)

**Screen: Turnier-Dashboard**
- Aktueller Status (z.B. "Gruppenphase, Spieltag 2")
- Nächste Spiele (3-5 anzeigen)
- Gruppenstand (Tabellen)
- K.o.-Baum (wenn aktiv)
- Button: "Nächstes Spiel starten"

### 6.3 Gruppenphase

**Screen: Gruppentabelle**
- Gruppe A / B / C Tabs
- Tabelle mit Punkte, W/L, Quote
- Matches dieser Gruppe (Status)

**Screen: Match-Details während Spiel**
- Teams, Seite, Live-Zähler (Würfe/Treffer pro Team)
- Wurf-Eingabe (mit Auto-Wechsel-Option)
- Spieler-Namen hochlicht aktuell werfenden Spieler

### 6.4 K.o.-Phase

**Screen: K.o.-Baum**
- Visueller Baum oder Tabelle mit Spielen
- Paarungen, Ergebnisse, nächste Runde

### 6.5 Statistiken

**Screen: Team-Statistiken**
- Alle Teams mit Punkte, Quote, Spiele
- Sortiert nach Regel 5.3

**Screen: Spieler-Statistiken**
- Alle Spieler mit Würfe, Treffer, Quote
- Pro Spieler optional: Matches, Siege

### 6.6 Export & Druck

- Finale Tabellen als PDF/Print
- Spielerstatistiken exportierbar

### 6.7 Turniere (Verlauf) – umgesetzt

- Liste aller gespeicherten Turniere (neueste zuerst) mit Status, Datum, Teamanzahl und Sieger
- Aktionen: Öffnen, Export, Löschen (mit Bestätigung); Neues Turnier; Import

### 6.8 Navigation – umgesetzt

- Hauptleiste: Übersicht, Gruppen, K.o. (bzw. „Spiele“ bei Best of 5), Statistik, Turniere
- ⋯-Menü: Gesamtstatistik, JSON exportieren/importieren, Drucken/PDF (nicht in der Android-App), Spielerstatistik (CSV), Neues Turnier
- Während eines Spiels: kompakte Match-Ansicht (`body.in-match`)

---

## 7. Technische Umsetzung

### 7.1 Tech Stack (umgesetzt)

- **Frontend:** Vanilla JavaScript (ES5, kein Framework, kein Bundler), Hash-Routing (`#/`, `#/groups`, `#/ko`, `#/stats`, `#/match/<id>`, `#/setup`, `#/history`, `#/career`)
- **Module:**
  - `js/logic.js` – reine Turnierlogik ohne DOM (`window.Flanken`)
  - `js/store.js` – Persistierung, Import/Export (`window.FlankenStore`)
  - `js/app.js` – Views, Navigation, Event-Handling
- **Styling:** `css/style.css` mit CSS-Variablen, Dark Mode über `prefers-color-scheme`, Druck-Styles
- **Auslieferungsformen:** siehe 7.5 und `README.md`

### 7.2 Persistierung (mehrere Turniere)

Jedes Turnier liegt unter einem eigenen `localStorage`-Schlüssel, der Verlauf bleibt erhalten:

| Schlüssel | Inhalt |
|---|---|
| `flankenscore_index` | Array aller Turnier-IDs |
| `flankenscore_active` | ID des aktuell geöffneten Turniers (leer = keins) |
| `flankenscore_t_<id>` | Kompletter Turnierstand `{ tournament, teams, players, matches }` |
| `flankenscore_tournament` | Altes Einzel-Format; wird beim Start automatisch migriert und gelöscht |

**Features:**
- Auto-Save nach jeder Änderung (nur das aktive Turnier wird geschrieben)
- Turnierverwaltung („Turniere“): öffnen, exportieren, löschen; „Neues Turnier“ lässt das alte im Verlauf
- Export: JSON-Download (Browser) bzw. Teilen-Menü (Android, über Filesystem + Share-Plugin)
- Import: JSON-Datei; vorhandenes Turnier mit gleicher ID wird nach Rückfrage ersetzt
- CSV-Export der Spielerstatistik (Turnier) und der Gesamtstatistik
- **Android:** Jede Änderung wird zusätzlich in den nativen `Preferences` gespiegelt. Leert Android den WebView-Speicher, stellt `FlankenStore.ready()` die Daten beim Start wieder her.

### 7.3 Offline-Readiness

- Einzeldatei `dist/flankenscore.html` läuft komplett offline (CSS, JS, Logo, Icons eingebettet)
- Web-App (GitHub Pages): Service Worker `sw.js` cached alle App-Dateien (stale-while-revalidate). Bei neuen Dateien `APP_FILES` ergänzen und `VERSION` erhöhen.
- Android-App: alle Dateien liegen in der APK

### 7.4 Mobile-Freundlichkeit

- Responsive Design (Breakpoints 600 px / 380 px), kompakte Navigation mit ⋯-Menü
- Landscape-Layout für Match-Tracking auf niedrigen Displays
- Touch-freundliche Buttons, Safe-Area-Unterstützung (`viewport-fit=cover`)
- **iPad/iPhone:** Installierbar als Web-App („Zum Home-Bildschirm“) über `manifest.webmanifest`, Apple-Touch-Icon und Standalone-Meta-Tags
- Startfehler-Anzeige: Läuft kein JavaScript (z.B. Datei-Vorschau in Mail/Dateien-App), erscheint ein Hinweis; Fehler beim Start werden sichtbar gemeldet, spätere (fremde) Fehler nicht

### 7.5 Auslieferung

| Variante | Quelle | Besonderheiten |
|---|---|---|
| Web-App / PWA | Repo-Root (`index.html` + `css/`, `js/`, `assets/`) | Manifest + Service Worker (nur über HTTPS) |
| Einzeldatei | `dist/flankenscore.html` (via `build.py`) | Alles inline, ohne PWA-Teile (`data-pwa` wird entfernt) |
| Android-App | Capacitor, `www/index.html` (via `build.py`) | App-ID `de.flankenscore.app`, Plugins: Preferences, Filesystem, Share |

Build-Anleitung: siehe [`README.md`](README.md).

## 8. User Flow – Beispiel

**Scenario: 6 Teams, Flankiball-Turnier**

1. **Setup:** 6 Teams anlegen (2 Spieler je Team)
2. **Auto-Mode:** System erkennt 6 Teams → 2 Gruppen à 3 Teams
3. **Gruppenphase:**
   - Gruppe A: Team 1 vs 2, 2 vs 3, 3 vs 1 (HF, also 3 Spiele pro Team)
   - Gruppe B: Team 4 vs 5, 5 vs 6, 6 vs 4
4. **Match starten:** Team 1 vs 2
   - Seite vergeben (auto oder manuell)
   - Spieler-Reihenfolge: Team 1: [Player A, Player B], Team 2: [Player X, Player Y]
   - Wurf um Wurf eingeben
   - Spielende: Team 1 gewinnt 5:3 Treffer → 1 Punkt
5. **Nach Gruppe:** Alle Punkte & Quotes berechnet → Ranking
6. **K.o.-Halbfinale:** Gruppensieger (T1, T4) vs beste Zweite
7. **Finale & Statistiken:** Gewinner ermittelt, Spielerrangliste anzeigen

---

## 9. Open Items / Optionen

- [ ] Foto/Profilbild pro Spieler?
- [ ] Live-Link (QR-Code) zum Anschauen für Zuschauer?
- [ ] Musikintegration (Spotify während Match)?
- [x] Dark Mode (automatisch über Systemeinstellung)
- [x] Turniere speichern/archivieren (Verlauf, JSON-Export/-Import)
- [x] Android-App (Capacitor)
- [x] iPad/iPhone als installierbare Web-App
- [ ] Veröffentlichung im Play Store

---

## 10. Branding & Logo

- **Logo-Datei:** `assets/flankenscore-logo.svg` (wird beim Build als data:-URI eingebettet)
- **App-Icons:** `assets/icons/` (192/512 px, maskable, Apple-Touch-Icon); Android-Icons und Splash unter `android/app/src/main/res/`
- **Motiv:** Frankenstein wirft im Profil in geduckter Boule-Haltung ein in Zewa gewickeltes, mit Panzertape umwickeltes Wurfgeschoss (Grabkerze). Im Hintergrund steht eine 1,5-l-PET-Wasserflasche mit wenig Wasser.
- **Einsatz:** Header der Startseite / Dashboard, nicht als Favicon gedacht. Für ein Favicon bei Bedarf einen vereinfachten Ausschnitt nutzen.
- **Schriftzug:** "FLANKEN" in Grün, "SCORE" in Rot, fette, schwere Sans-Serif (z.B. Arial Black oder eine Google-Font wie "Archivo Black").

### Farbpalette

| Rolle | Hex |
|---|---|
| Grün (Frankenstein, Primärfarbe) | `#6f9a4a` |
| Grün dunkel (Schrift, Schatten) | `#557a36` |
| Rot (Akzent, Sieger, Highlights) | `#d8392f` |
| Anthrazit (Anzug, Flächen) | `#3a3842` |
| Tinte (Konturen, Text) | `#1c1c1c` |
| Wasserblau (Info, Statistik) | `#6fc6dd` |
| Papier (Hintergrund) | `#f4f2ea` |

Diese Farben bitte als CSS-Variablen / Tailwind-Theme übernehmen.

---

**Version:** 1.1  
**Erstellt:** 2026-09-25  
**Aktualisiert:** 2026-09-26 – Strafen, Korrekturen, mehrere Turniere, Gesamtstatistik, Android-App, iPad-Web-App  
**Status:** Umgesetzt
