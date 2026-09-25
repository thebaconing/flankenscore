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

---

## 7. Technische Anforderungen

### 7.1 Tech Stack

- **Frontend:** React (oder Vue.js)
- **Storage:** localStorage (lokal im Browser, keine Server)
- **State Management:** Context API oder Zustand
- **Styling:** CSS oder Tailwind

### 7.2 Persistierung

Alle Daten in `localStorage` unter Schlüssel `flankenscore_tournament`:
```json
{
  "tournament": { ... },
  "teams": [ ... ],
  "matches": [ ... ],
  "players": [ ... ]
}
```

**Features:**
- Auto-Save nach jeder Änderung
- Export-Button: JSON-Download
- Import-Button: JSON hochladen (Dateiupload)

### 7.3 Offline-Readiness

App muss komplett offline funktionieren (kein Backend nötig).

### 7.4 Mobile-Freundlichkeit

- Responsive Design (Tablet & Smartphone)
- Touch-freundliche Buttons
- Landscape-Mode für Match-Tracking

---

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
- [ ] Dark Mode?
- [ ] Turniere speichern/archivieren (LocalStorage-Export)?

---

## 10. Branding & Logo

- **Logo-Datei:** `assets/flankenscore-logo.svg` (liegt neben dieser DESIGN.md, beim Setup nach `public/` bzw. `src/assets/` kopieren)
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

**Version:** 1.0 Draft  
**Erstellt:** 2026-09-25  
**Status:** Ready für Claude Code
