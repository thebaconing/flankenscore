/* Flankenscore – reine Turnierlogik (keine DOM-Zugriffe) */
(function (global) {
  'use strict';

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function now() { return new Date().toISOString(); }

  /* ---------- 1.1 Modi nach Teamanzahl ----------
   * groups: Gruppengrößen, legs: 1 = Hinrunde, 2 = Hin- & Rückrunde
   * qualifiers: Teams in der K.o.-Phase, thirdPlace: Standard für Spiel um Platz 3
   * series: Best-of-N (nur bei 2 Teams)
   */
  var MODES = {
    2:  { groups: [2], series: 5 },
    3:  { groups: [3], legs: 2, qualifiers: 2, thirdPlace: false },
    4:  { groups: [4], legs: 2, qualifiers: 2, thirdPlace: true },
    5:  { groups: [5], legs: 1, qualifiers: 4, thirdPlace: true },
    6:  { groups: [3, 3], legs: 2, qualifiers: 4, thirdPlace: true },
    7:  { groups: [7], legs: 1, qualifiers: 4, thirdPlace: true },
    8:  { groups: [4, 4], legs: 1, qualifiers: 4, thirdPlace: false },
    9:  { groups: [3, 3, 3], legs: 1, qualifiers: 8, thirdPlace: true },
    10: { groups: [5, 5], legs: 1, qualifiers: 4, thirdPlace: false },
    11: { groups: [4, 4, 3], legs: 1, qualifiers: 8, thirdPlace: true },
    12: { groups: [4, 4, 4], legs: 1, qualifiers: 8, thirdPlace: false }
  };
  var MIN_TEAMS = 2, MAX_TEAMS = 12;
  var STAGE_NAMES = { 8: 'Viertelfinale', 4: 'Halbfinale', 2: 'Finale' };

  function getMode(teamCount) { return MODES[teamCount] || null; }

  function describeMode(teamCount) {
    var m = getMode(teamCount);
    if (!m) return 'Nicht unterstützt (2–12 Teams)';
    if (m.series) return 'Best of ' + m.series;
    var g = m.groups.length === 1 ? '1 Gruppe' : m.groups.length + ' Gruppen (' + m.groups.join('/') + ')';
    var fmt = m.legs === 2 ? 'Hin- & Rückrunde' : 'jeder gegen jeden';
    var ko = [];
    for (var n = m.qualifiers; n >= 2; n /= 2) ko.push(STAGE_NAMES[n]);
    var perGroup = Math.floor(m.qualifiers / m.groups.length);
    var ll = m.qualifiers - perGroup * m.groups.length;
    return g + ', ' + fmt + ' → ' + ko.join(', ') + (ll ? ' (+' + ll + ' Lucky Loser)' : '');
  }

  /* ---------- Round-Robin (Kreis-Methode) ---------- */
  function roundRobin(ids) {
    var list = ids.slice();
    if (list.length % 2) list.push(null);
    var n = list.length, rounds = [];
    for (var r = 0; r < n - 1; r++) {
      var pairs = [];
      for (var i = 0; i < n / 2; i++) {
        var a = list[i], b = list[n - 1 - i];
        if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    return rounds;
  }

  /* ---------- 4. Seitenvergabe ---------- */
  function sideCounts(state, teamId) {
    var a = 0, b = 0;
    state.matches.forEach(function (m) {
      var side = m.homeTeamId === teamId ? m.sideAssignment.homeTeamSide
        : m.awayTeamId === teamId ? m.sideAssignment.awayTeamSide : null;
      if (side === 'side_a') a++; else if (side === 'side_b') b++;
    });
    return { teamId: teamId, sideA_count: a, sideB_count: b, difference: a - b };
  }

  // 4.2: Wer öfter auf A war, spielt auf B. Gleichstand: höher gesetztes Team
  // (niedrigerer seed) bzw. alphabetisch bekommt A.
  function assignSides(state, homeId, awayId, tiebreakHomeA) {
    var h = sideCounts(state, homeId).difference, w = sideCounts(state, awayId).difference;
    var homeA;
    if (h !== w) homeA = h < w;
    else if (typeof tiebreakHomeA === 'boolean') homeA = tiebreakHomeA;
    else {
      var ht = teamById(state, homeId), at = teamById(state, awayId);
      var hs = ht.seed == null ? Infinity : ht.seed, as = at.seed == null ? Infinity : at.seed;
      homeA = hs !== as ? hs < as : ht.name.localeCompare(at.name, 'de') <= 0;
    }
    return homeA ? { homeTeamSide: 'side_a', awayTeamSide: 'side_b' }
                 : { homeTeamSide: 'side_b', awayTeamSide: 'side_a' };
  }

  /* ---------- Hilfsfunktionen ---------- */
  function teamById(state, id) { return state.teams.find(function (t) { return t.id === id; }); }
  function playerById(state, id) { return state.players.find(function (p) { return p.id === id; }); }
  function matchById(state, id) { return state.matches.find(function (m) { return m.id === id; }); }
  function quote(hits, throws) { return throws ? hits / throws : 0; }

  function newMatch(state, opts) {
    var m = {
      id: uuid(),
      tournamentId: state.tournament.id,
      groupId: opts.groupId || null,
      knockoutStageId: opts.knockoutStageId || null,
      slot: opts.slot != null ? opts.slot : null,
      label: opts.label || null,
      homeTeamId: opts.homeTeamId,
      awayTeamId: opts.awayTeamId,
      sideAssignment: null,
      result: null,
      throwSequence: [],
      playerOrder: null,
      startingTeamId: null,
      status: 'not_started',
      createdAt: now(),
      updatedAt: now()
    };
    m.sideAssignment = assignSides(state, m.homeTeamId, m.awayTeamId, opts.tiebreakHomeA);
    state.matches.push(m);
    return m;
  }

  /* ---------- Turnier erstellen ---------- */
  // input: { name, date, thirdPlace, teams: [{ name, players: [name, name] }] }
  function createTournament(input) {
    var count = input.teams.length;
    var mode = getMode(count);
    if (!mode) throw new Error('Es werden 2 bis 12 Teams unterstützt.');
    var t = {
      id: uuid(),
      name: input.name,
      date: input.date,
      mode: mode.series ? 'knockout' : mode.groups.length ? 'groups_with_knockout' : 'group',
      teamCount: count,
      status: 'in_progress',
      config: {
        groups: mode.groups.slice(),
        legs: mode.legs || 0,
        qualifiers: mode.qualifiers || 0,
        series: mode.series || 0,
        thirdPlace: input.thirdPlace != null ? !!input.thirdPlace : !!mode.thirdPlace
      },
      settings: { autoSwitch: true },
      groups: [],
      knockoutStages: [],
      createdAt: now(),
      updatedAt: now()
    };
    var state = { tournament: t, teams: [], players: [], matches: [] };

    input.teams.forEach(function (ti) {
      var team = { id: uuid(), tournamentId: t.id, name: ti.name, players: [], seed: null, createdAt: now() };
      ti.players.forEach(function (pn) {
        var p = { id: uuid(), teamId: team.id, name: pn, createdAt: now() };
        state.players.push(p);
        team.players.push(p.id);
      });
      state.teams.push(team);
    });

    if (mode.series) {
      var st = { id: uuid(), tournamentId: t.id, stageName: 'Best of ' + mode.series, kind: 'series', size: 2, createdAt: now() };
      t.knockoutStages.push(st);
      newMatch(state, { knockoutStageId: st.id, homeTeamId: state.teams[0].id, awayTeamId: state.teams[1].id, label: 'Spiel 1', slot: 0 });
      return state;
    }

    // Teams zufällig auf Gruppen verteilen
    var shuffled = state.teams.map(function (x) { return x.id; });
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    var idx = 0;
    mode.groups.forEach(function (size, gi) {
      t.groups.push({
        id: uuid(), tournamentId: t.id,
        name: 'Gruppe ' + String.fromCharCode(65 + gi),
        teamIds: shuffled.slice(idx, idx + size),
        createdAt: now()
      });
      idx += size;
    });

    // Spielplan: Runden gruppenübergreifend verschränken, damit alle Gruppen parallel laufen
    var legs = [];
    t.groups.forEach(function (g) {
      var rounds = roundRobin(g.teamIds);
      var all = rounds.slice();
      if (mode.legs === 2) all = all.concat(rounds.map(function (r) { return r.map(function (p) { return [p[1], p[0]]; }); }));
      legs.push({ g: g, rounds: all, first: rounds.length });
    });
    var maxRounds = Math.max.apply(null, legs.map(function (l) { return l.rounds.length; }));
    var matchday = 1;
    for (var r = 0; r < maxRounds; r++) {
      legs.forEach(function (l) {
        (l.rounds[r] || []).forEach(function (pair) {
          var tiebreak;
          if (r >= l.first) {
            // Rückspiel: Seiten gegenüber dem Hinspiel tauschen
            var first = state.matches.find(function (m) {
              return m.groupId === l.g.id && m.homeTeamId === pair[1] && m.awayTeamId === pair[0];
            });
            if (first) tiebreak = first.sideAssignment.awayTeamSide === 'side_a';
          }
          var m = newMatch(state, { groupId: l.g.id, homeTeamId: pair[0], awayTeamId: pair[1], tiebreakHomeA: tiebreak });
          m.matchday = matchday + r;
        });
      });
    }
    return state;
  }

  /* ---------- Ergebnis & Statistik ---------- */
  function matchTotals(match) {
    var tot = {};
    tot[match.homeTeamId] = { hits: 0, throws: 0 };
    tot[match.awayTeamId] = { hits: 0, throws: 0 };
    match.throwSequence.forEach(function (e) {
      var x = tot[e.teamId];
      if (!x) return;
      x.throws++;
      if (e.isHit) x.hits++;
    });
    return tot;
  }

  function buildResult(match, winnerTeamId) {
    var tot = matchTotals(match), h = tot[match.homeTeamId], a = tot[match.awayTeamId];
    return {
      winnerTeamId: winnerTeamId,
      homeTeamHits: h.hits, homeTeamThrows: h.throws,
      awayTeamHits: a.hits, awayTeamThrows: a.throws,
      homeTeamQuote: quote(h.hits, h.throws),
      awayTeamQuote: quote(a.hits, a.throws)
    };
  }

  function emptyTeamStats(teamId) {
    return { teamId: teamId, points: 0, matchesPlayed: 0, wins: 0, losses: 0, hitsTotal: 0, throwsTotal: 0, hitQuote: 0 };
  }
  function addMatchToTeamStats(s, m) {
    if (m.status !== 'completed' || !m.result) return;
    var home = m.homeTeamId === s.teamId;
    if (!home && m.awayTeamId !== s.teamId) return;
    s.matchesPlayed++;
    if (m.result.winnerTeamId === s.teamId) { s.wins++; s.points++; } else s.losses++;
    s.hitsTotal += home ? m.result.homeTeamHits : m.result.awayTeamHits;
    s.throwsTotal += home ? m.result.homeTeamThrows : m.result.awayTeamThrows;
    s.hitQuote = quote(s.hitsTotal, s.throwsTotal);
  }

  // 5.3: Punkte ↓, Quote ↓, alphabetisch
  function compareStandings(state) {
    return function (a, b) {
      return (b.points - a.points) || (b.hitQuote - a.hitQuote) ||
        teamById(state, a.teamId).name.localeCompare(teamById(state, b.teamId).name, 'de');
    };
  }

  function groupStandings(state, group) {
    var rows = group.teamIds.map(emptyTeamStats);
    state.matches.forEach(function (m) {
      if (m.groupId !== group.id) return;
      rows.forEach(function (r) { addMatchToTeamStats(r, m); });
    });
    rows.sort(compareStandings(state));
    rows.forEach(function (r, i) { r.rank = i + 1; r.groupId = group.id; });
    return rows;
  }

  function teamStats(state) {
    var rows = state.teams.map(function (t) { var r = emptyTeamStats(t.id); r.penalties = emptyPenaltyCounts(); return r; });
    state.matches.forEach(function (m) {
      rows.forEach(function (r) { addMatchToTeamStats(r, m); });
      (m.penalties || []).forEach(function (p) {
        var r = rows.find(function (x) { return x.teamId === p.teamId; });
        if (r) r.penalties[p.type]++;
      });
    });
    return rows.sort(compareStandings(state));
  }

  function playerStats(state) {
    var map = {};
    state.players.forEach(function (p) {
      map[p.id] = { playerId: p.id, name: p.name, teamId: p.teamId, throwsTotal: 0, hitsTotal: 0, hitQuote: 0,
        matchesPlayed: 0, wins: 0, losses: 0, throwsByMatch: {}, hitsByMatch: {}, penalties: emptyPenaltyCounts() };
    });
    state.matches.forEach(function (m) {
      m.throwSequence.forEach(function (e) {
        var s = map[e.playerId];
        if (!s) return;
        s.throwsTotal++;
        s.throwsByMatch[m.id] = (s.throwsByMatch[m.id] || 0) + 1;
        if (e.isHit) { s.hitsTotal++; s.hitsByMatch[m.id] = (s.hitsByMatch[m.id] || 0) + 1; }
      });
      (m.penalties || []).forEach(function (p) { if (p.playerId && map[p.playerId]) map[p.playerId].penalties[p.type]++; });
      if (m.status !== 'completed' || !m.result) return;
      [m.homeTeamId, m.awayTeamId].forEach(function (tid) {
        teamById(state, tid).players.forEach(function (pid) {
          var s = map[pid];
          s.matchesPlayed++;
          if (m.result.winnerTeamId === tid) s.wins++; else s.losses++;
        });
      });
    });
    return Object.keys(map).map(function (k) {
      var s = map[k];
      s.hitQuote = quote(s.hitsTotal, s.throwsTotal);
      return s;
    });
  }

  // 5.4: Quote (mit Mindestwürfen) ↓, Treffer ↓
  function playerRanking(state, minThrows) {
    minThrows = minThrows == null ? 5 : minThrows;
    return playerStats(state).sort(function (a, b) {
      var qa = a.throwsTotal >= minThrows, qb = b.throwsTotal >= minThrows;
      if (qa !== qb) return qa ? -1 : 1;
      return (b.hitQuote - a.hitQuote) || (b.hitsTotal - a.hitsTotal) || a.name.localeCompare(b.name, 'de');
    });
  }

  /* ---------- Phasen & K.o. ---------- */
  function groupMatches(state) { return state.matches.filter(function (m) { return m.groupId; }); }
  function stageMatches(state, stageId) {
    return state.matches.filter(function (m) { return m.knockoutStageId === stageId; })
      .sort(function (a, b) { return a.slot - b.slot; });
  }
  function allDone(ms) { return ms.length > 0 && ms.every(function (m) { return m.status === 'completed'; }); }
  function winnerOf(m) { return m.result && m.result.winnerTeamId; }
  function loserOf(m) { return m.result && (m.result.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId); }

  // 1.2/1.3: Gruppensieger, dann beste Zweite/Dritte (Lucky Loser)
  function qualifiers(state) {
    var t = state.tournament, Q = t.config.qualifiers, G = t.groups.length;
    var perGroup = Math.floor(Q / G);
    var tables = t.groups.map(function (g) { return groupStandings(state, g); });
    var chosen = [];
    tables.forEach(function (rows) { chosen = chosen.concat(rows.slice(0, perGroup)); });
    var rest = Q - chosen.length;
    var luckyLosers = [];
    if (rest > 0) {
      var pool = [];
      tables.forEach(function (rows) { if (rows[perGroup]) pool.push(rows[perGroup]); });
      pool.sort(crossGroupCompare(state));
      luckyLosers = pool.slice(0, rest);
      luckyLosers.forEach(function (r) { r.luckyLoser = true; });
      chosen = chosen.concat(luckyLosers);
    }
    // Setzliste: Platzierung in der Gruppe, dann Punkte/Spiel, Quote, Name
    chosen.sort(function (a, b) { return (a.rank - b.rank) || crossGroupCompare(state)(a, b); });
    return chosen;
  }
  // Gruppen können unterschiedlich groß sein (11 Teams) → Punkte pro Spiel vergleichen
  function crossGroupCompare(state) {
    return function (a, b) {
      var pa = a.matchesPlayed ? a.points / a.matchesPlayed : 0, pb = b.matchesPlayed ? b.points / b.matchesPlayed : 0;
      return (pb - pa) || (b.hitQuote - a.hitQuote) ||
        teamById(state, a.teamId).name.localeCompare(teamById(state, b.teamId).name, 'de');
    };
  }

  // Standard-Setzbaum: 1 und 2 treffen frühestens im Finale aufeinander
  function bracketOrder(n) {
    var order = [1];
    while (order.length < n) {
      var size = order.length * 2, next = [];
      order.forEach(function (s) { next.push(s, size + 1 - s); });
      order = next;
    }
    return order;
  }

  function firstRoundPairs(seeded) {
    var n = seeded.length, order = bracketOrder(n), pairs = [];
    for (var i = 0; i < n; i += 2) pairs.push([seeded[order[i] - 1], seeded[order[i + 1] - 1]]);
    // Gleiche Gruppe in Runde 1 vermeiden, indem die schwächer gesetzten Teams getauscht werden
    if (pairs.length > 1) {
      pairs.forEach(function (p, i) {
        if (p[0].groupId !== p[1].groupId) return;
        for (var j = pairs.length - 1; j >= 0; j--) {
          if (j === i) continue;
          var q = pairs[j];
          if (q[1].groupId !== p[0].groupId && p[1].groupId !== q[0].groupId) {
            var tmp = p[1]; p[1] = q[1]; q[1] = tmp;
            return;
          }
        }
      });
    }
    return pairs;
  }

  function addStage(state, size, kind) {
    var st = { id: uuid(), tournamentId: state.tournament.id, stageName: kind === 'third' ? 'Spiel um Platz 3' : STAGE_NAMES[size],
      kind: kind || 'main', size: size, createdAt: now() };
    state.tournament.knockoutStages.push(st);
    return st;
  }

  function mainStages(state) {
    return state.tournament.knockoutStages.filter(function (s) { return s.kind === 'main'; });
  }

  // Nach jeder Ergebnis-Änderung aufrufen: erzeugt ggf. nächste Runde / beendet Turnier
  function advance(state) {
    var t = state.tournament, changed = false;
    if (t.status === 'completed') return false;

    if (t.config.series) {
      var st = t.knockoutStages[0], ms = stageMatches(state, st.id);
      var need = Math.ceil(t.config.series / 2), wins = {};
      ms.forEach(function (m) { if (winnerOf(m)) wins[winnerOf(m)] = (wins[winnerOf(m)] || 0) + 1; });
      var champion = Object.keys(wins).find(function (k) { return wins[k] >= need; });
      if (champion) { t.status = 'completed'; return true; }
      if (allDone(ms)) {
        var last = ms[ms.length - 1];
        newMatch(state, { knockoutStageId: st.id, homeTeamId: last.awayTeamId, awayTeamId: last.homeTeamId,
          slot: ms.length, label: 'Spiel ' + (ms.length + 1) });
        return true;
      }
      return false;
    }

    var stages = mainStages(state);
    if (!stages.length) {
      if (!allDone(groupMatches(state))) return false;
      var seeded = qualifiers(state);
      seeded.forEach(function (row, i) { teamById(state, row.teamId).seed = i + 1; });
      var first = addStage(state, seeded.length);
      firstRoundPairs(seeded).forEach(function (p, i) {
        newMatch(state, { knockoutStageId: first.id, homeTeamId: p[0].teamId, awayTeamId: p[1].teamId, slot: i });
      });
      // Spiel um Platz 3 ohne Halbfinale (4 Teams): Gruppendritter gegen -vierter
      if (seeded.length === 2 && t.config.thirdPlace && t.groups.length === 1) {
        var table = groupStandings(state, t.groups[0]);
        if (table.length >= 4) {
          var third = addStage(state, 2, 'third');
          newMatch(state, { knockoutStageId: third.id, homeTeamId: table[2].teamId, awayTeamId: table[3].teamId, slot: 0 });
        }
      }
      return true;
    }

    var cur = stages[stages.length - 1], cms = stageMatches(state, cur.id);
    if (!allDone(cms)) return false;
    if (cur.size === 2) {
      var thirdStage = t.knockoutStages.find(function (s) { return s.kind === 'third'; });
      if (!thirdStage || allDone(stageMatches(state, thirdStage.id))) { t.status = 'completed'; changed = true; }
      return changed;
    }
    var next = addStage(state, cur.size / 2);
    for (var i = 0; i < cms.length; i += 2) {
      newMatch(state, { knockoutStageId: next.id, homeTeamId: winnerOf(cms[i]), awayTeamId: winnerOf(cms[i + 1]), slot: i / 2 });
    }
    if (cur.size === 4 && t.config.thirdPlace) {
      var ts = addStage(state, 2, 'third');
      newMatch(state, { knockoutStageId: ts.id, homeTeamId: loserOf(cms[0]), awayTeamId: loserOf(cms[1]), slot: 0 });
    }
    return true;
  }

  // Endplatzierung (1–3), sofern schon ermittelt
  function podium(state) {
    var t = state.tournament, res = [];
    if (t.config.series) {
      var st = t.knockoutStages[0], wins = {};
      stageMatches(state, st.id).forEach(function (m) { if (winnerOf(m)) wins[winnerOf(m)] = (wins[winnerOf(m)] || 0) + 1; });
      if (t.status !== 'completed') return res;
      var ids = state.teams.map(function (x) { return x.id; }).sort(function (a, b) { return (wins[b] || 0) - (wins[a] || 0); });
      return [{ place: 1, teamId: ids[0] }, { place: 2, teamId: ids[1] }];
    }
    var final = mainStages(state).find(function (s) { return s.size === 2; });
    var fm = final && stageMatches(state, final.id)[0];
    if (fm && fm.status === 'completed') res.push({ place: 1, teamId: winnerOf(fm) }, { place: 2, teamId: loserOf(fm) });
    var third = t.knockoutStages.find(function (s) { return s.kind === 'third'; });
    var tm = third && stageMatches(state, third.id)[0];
    if (tm && tm.status === 'completed') res.push({ place: 3, teamId: winnerOf(tm) });
    return res;
  }

  function phaseLabel(state) {
    var t = state.tournament;
    if (t.status === 'completed') return 'Turnier beendet';
    if (t.config.series) {
      var n = stageMatches(state, t.knockoutStages[0].id).length;
      return 'Best of ' + t.config.series + ', Spiel ' + n;
    }
    var stages = mainStages(state);
    if (!stages.length) {
      var open = groupMatches(state).filter(function (m) { return m.status !== 'completed'; });
      var day = open.length ? Math.min.apply(null, open.map(function (m) { return m.matchday; })) : '';
      return 'Gruppenphase' + (day ? ', Spieltag ' + day : '');
    }
    return stages[stages.length - 1].stageName;
  }

  var PENALTY_TYPES = {
    warning: 'Verwarnung',
    skip_player: 'Aussetzen',
    skip_team: 'Teamaussetzen',
    strafhalbe: 'Strafhalbe'
  };
  // Diese Strafen gelten für das ganze Team, die übrigen für einen Spieler
  var TEAM_PENALTIES = { warning: true, skip_team: true };

  // Wurfreihenfolge: Teams werfen abwechselnd, innerhalb des Teams wird rotiert (3.2)
  function nextThrower(match) {
    if (!match.playerOrder || !match.startingTeamId) return null;
    var seq = match.throwSequence, last = seq[seq.length - 1];
    var teamId = last ? (last.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId) : match.startingTeamId;
    var n = seq.filter(function (e) { return e.teamId === teamId; }).length;
    var order = match.playerOrder[teamId];
    return { teamId: teamId, playerId: order[n % order.length] };
  }

  // Aussetzen/Teamaussetzen: Spieler bzw. Team darf beim nächsten Treffer der eigenen
  // Mannschaft nicht trinken. Liefert den Wurf, bei dem die Strafe abgegolten wurde, sonst null.
  function drinkBanServedAt(match, penalty) {
    if (penalty.type !== 'skip_player' && penalty.type !== 'skip_team') return null;
    var seq = match.throwSequence;
    for (var i = penalty.beforeThrow; i < seq.length; i++) {
      if (seq[i].teamId === penalty.teamId && seq[i].isHit) return seq[i];
    }
    return null;
  }

  // Spieler, die beim nächsten Treffer ihres Teams nicht trinken dürfen
  function pendingDrinkBans(match, state) {
    var banned = {};
    (match.penalties || []).forEach(function (p) {
      if ((p.type !== 'skip_player' && p.type !== 'skip_team') || drinkBanServedAt(match, p)) return;
      var ids = p.type === 'skip_team' ? match.playerOrder[p.teamId] || teamById(state, p.teamId).players : [p.playerId];
      ids.forEach(function (id) { banned[id] = true; });
    });
    return banned;
  }

  function recordThrow(match, playerId, teamId, isHit) {
    match.throwSequence.push({ id: uuid(), matchId: match.id, playerId: playerId, teamId: teamId,
      throwNumber: match.throwSequence.length + 1, isHit: !!isHit, timestamp: now() });
    match.updatedAt = now();
  }

  function addPenalty(match, type, teamId, playerId) {
    if (!PENALTY_TYPES[type]) throw new Error('Unbekannte Strafe: ' + type);
    if (!match.penalties) match.penalties = [];
    match.penalties.push({ id: uuid(), matchId: match.id, type: type, teamId: teamId,
      playerId: TEAM_PENALTIES[type] ? null : playerId, beforeThrow: match.throwSequence.length, timestamp: now() });
    match.updatedAt = now();
  }

  // Wurf nachträglich ändern (Spieler/Team, Treffer)
  function editThrow(match, throwId, changes) {
    var e = match.throwSequence.find(function (x) { return x.id === throwId; });
    if (!e) return;
    if (changes.playerId) { e.playerId = changes.playerId; e.teamId = changes.teamId; }
    if (typeof changes.isHit === 'boolean') e.isHit = changes.isHit;
    match.updatedAt = now();
  }

  // Wurf löschen; Nummern und Strafen-Zeitpunkte rücken nach
  function deleteThrow(match, throwId) {
    var i = match.throwSequence.findIndex(function (x) { return x.id === throwId; });
    if (i < 0) return;
    match.throwSequence.splice(i, 1);
    match.throwSequence.forEach(function (e, k) { e.throwNumber = k + 1; });
    (match.penalties || []).forEach(function (p) { if (p.beforeThrow > i) p.beforeThrow--; });
    match.updatedAt = now();
  }

  function removePenalty(match, penaltyId) {
    match.penalties = (match.penalties || []).filter(function (p) { return p.id !== penaltyId; });
    match.updatedAt = now();
  }

  // Letzte Eingabe (Wurf oder Strafe) zurücknehmen
  function undoLast(match) {
    var pens = match.penalties || [], lastPen = pens[pens.length - 1];
    var lastThrow = match.throwSequence[match.throwSequence.length - 1];
    if (lastPen && (!lastThrow || lastPen.timestamp >= lastThrow.timestamp)) pens.pop();
    else match.throwSequence.pop();
    match.updatedAt = now();
  }

  function emptyPenaltyCounts() { return { warning: 0, skip_player: 0, skip_team: 0, strafhalbe: 0 }; }

  // Stages, die von diesem Spiel abhängen (später erzeugt)
  function dependentStages(state, match) {
    var t = state.tournament;
    if (match.groupId) return t.knockoutStages.slice();
    var st = t.knockoutStages.find(function (s) { return s.id === match.knockoutStageId; });
    if (st.kind !== 'main') return [];
    return t.knockoutStages.filter(function (s) {
      return s.kind === 'main' ? s.size < st.size : st.size === 4 && s.kind === 'third';
    });
  }

  // Korrektur erlaubt, solange kein abhängiges Spiel begonnen wurde
  function canReopen(state, match) {
    if (match.status !== 'completed') return false;
    var st = state.tournament.knockoutStages.find(function (s) { return s.id === match.knockoutStageId; });
    if (st && st.kind === 'series') {
      var later = stageMatches(state, st.id).filter(function (m) { return m.slot > match.slot; });
      return later.every(function (m) { return m.status === 'not_started'; });
    }
    var ids = dependentStages(state, match).map(function (s) { return s.id; });
    return !state.matches.some(function (m) { return ids.indexOf(m.knockoutStageId) >= 0 && m.status !== 'not_started'; });
  }

  // Laufendes Spiel abbrechen: zurück auf "offen", Würfe und Strafen verwerfen.
  // Spieler-Reihenfolge und beginnendes Team bleiben als Vorauswahl erhalten.
  function abortMatch(match) {
    if (match.status !== 'in_progress') return;
    match.status = 'not_started';
    match.throwSequence = [];
    match.penalties = [];
    match.result = null;
    match.updatedAt = now();
  }

  function reopen(state, match) {
    var t = state.tournament;
    var st = t.knockoutStages.find(function (s) { return s.id === match.knockoutStageId; });
    if (st && st.kind === 'series') {
      state.matches = state.matches.filter(function (m) { return !(m.knockoutStageId === st.id && m.slot > match.slot); });
    } else {
      var ids = dependentStages(state, match).map(function (s) { return s.id; });
      state.matches = state.matches.filter(function (m) { return ids.indexOf(m.knockoutStageId) < 0; });
      t.knockoutStages = t.knockoutStages.filter(function (s) { return ids.indexOf(s.id) < 0; });
      if (match.groupId) state.teams.forEach(function (x) { x.seed = null; });
    }
    match.status = 'in_progress';
    match.result = null;
    match.updatedAt = now();
    t.status = 'in_progress';
  }

  global.Flanken = {
    MODES: MODES, MIN_TEAMS: MIN_TEAMS, MAX_TEAMS: MAX_TEAMS,
    uuid: uuid, now: now, getMode: getMode, describeMode: describeMode,
    createTournament: createTournament, advance: advance,
    sideCounts: sideCounts, matchTotals: matchTotals, buildResult: buildResult,
    groupStandings: groupStandings, teamStats: teamStats, playerStats: playerStats, playerRanking: playerRanking,
    qualifiers: qualifiers, groupMatches: groupMatches, stageMatches: stageMatches, mainStages: mainStages,
    podium: podium, phaseLabel: phaseLabel, nextThrower: nextThrower, recordThrow: recordThrow,
    canReopen: canReopen, reopen: reopen, abortMatch: abortMatch, editThrow: editThrow, deleteThrow: deleteThrow,
    PENALTY_TYPES: PENALTY_TYPES, TEAM_PENALTIES: TEAM_PENALTIES, drinkBanServedAt: drinkBanServedAt, pendingDrinkBans: pendingDrinkBans, addPenalty: addPenalty, removePenalty: removePenalty, undoLast: undoLast,
    teamById: teamById, playerById: playerById, matchById: matchById, quote: quote,
    bracketOrder: bracketOrder
  };
})(typeof window !== 'undefined' ? window : globalThis);
