/* Flankenscore – Oberfläche */
(function () {
  'use strict';
  var F = window.Flanken, Store = window.FlankenStore;
  var app = document.getElementById('app'), nav = document.getElementById('nav');
  var state = null;           // wird nach Store.ready() geladen
  var draft = null;          // Setup-Formular
  var ui = { group: 0, selectedThrower: null, minThrows: 5 };

  /* ---------- Helfer ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(q) { return (q * 100).toFixed(1).replace('.', ',') + ' %'; }
  function team(id) { return F.teamById(state, id); }
  function tname(id) { var t = id && team(id); return t ? esc(t.name) : '–'; }
  function pname(id) { var p = F.playerById(state, id); return p ? esc(p.name) : '–'; }
  function sideLabel(s) { return s === 'side_a' ? 'Links' : 'Rechts'; }
  function commit() { F.advance(state); Store.save(state); render(); }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function today() { return new Date().toISOString().slice(0, 10); }

  function newDraft() {
    return { name: '', date: today(), thirdPlace: null,
      teams: [0, 1, 2, 3].map(function () { return { name: '', players: ['', ''] }; }) };
  }

  function matchContext(m) {
    if (m.groupId) {
      var g = state.tournament.groups.find(function (x) { return x.id === m.groupId; });
      return g.name + ' · Spieltag ' + m.matchday;
    }
    var st = state.tournament.knockoutStages.find(function (s) { return s.id === m.knockoutStageId; });
    return st.stageName + (m.label ? ' · ' + m.label : '');
  }

  function statusBadge(m) {
    return { not_started: '<span class="badge">offen</span>', in_progress: '<span class="badge live">läuft</span>',
      completed: '<span class="badge done">fertig</span>' }[m.status];
  }

  function matchRow(m) {
    var r = m.result, w = r && r.winnerTeamId;
    var score = r ? '<span class="score">' + r.homeTeamHits + ':' + r.awayTeamHits + '</span>' : statusBadge(m);
    return '<a class="match-row" href="#/match/' + m.id + '">' +
      '<span class="ctx">' + esc(matchContext(m)) + '</span>' +
      '<span class="teams"><span class="' + (w === m.homeTeamId ? 'win' : '') + '">' + tname(m.homeTeamId) + '</span>' +
      '<span class="vs">vs</span><span class="' + (w === m.awayTeamId ? 'win' : '') + '">' + tname(m.awayTeamId) + '</span></span>' +
      score + '</a>';
  }

  function openMatches() {
    var ms = state.matches.filter(function (m) { return m.status !== 'completed'; });
    return ms.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
      return (a.matchday || 0) - (b.matchday || 0);
    });
  }

  /* ---------- Navigation ---------- */
  function renderNav(route) {
    var links = [];
    if (state) {
      var hasGroups = state.tournament.groups.length > 0;
      links.push(['', 'Übersicht']);
      if (hasGroups) links.push(['groups', 'Gruppen']);
      links.push(['ko', hasGroups ? 'K.o.' : 'Spiele'], ['stats', 'Statistik']);
    } else links.push(['setup', 'Neu']);
    links.push(['history', 'Turniere']);
    nav.innerHTML = links.map(function (l) {
      return '<a href="#/' + l[0] + '" class="' + (route === l[0] ? 'active' : '') + '">' + l[1] + '</a>';
    }).join('') +
      '<details class="menu"><summary aria-label="Menü">⋯</summary><div>' +
      '<button data-action="go" data-to="#/career">Gesamtstatistik</button>' +
      (state ? '<button data-action="export">JSON exportieren</button>' : '') +
      '<button data-action="import">JSON importieren</button>' +
      (state && !Store.isNative ? '<button data-action="print">Drucken / PDF</button>' : '') +
      (state ? '' +
        '<button data-action="export-players">Spielerstatistik (CSV)</button>' +
        '<button data-action="new">Neues Turnier</button>' : '') +
      '</div></details>';
  }

  var PEN_ICONS = { warning: '⚠', skip_player: '⏸', skip_team: '⏸⏸', strafhalbe: '🍺' };

  function penaltyTarget(p) { return p.playerId ? pname(p.playerId) + ' (' + tname(p.teamId) + ')' : tname(p.teamId); }

  function penaltyList(m, removable) {
    var pens = m.penalties || [];
    if (!pens.length) return '<p class="muted small">Keine Verwarnungen oder Strafen.</p>';
    return '<ul class="penalty-list">' + pens.slice().reverse().map(function (p) {
      return '<li class="pen-' + p.type + '"><span class="pen-icon">' + PEN_ICONS[p.type] + '</span><strong>' + F.PENALTY_TYPES[p.type] +
        '</strong> ' + penaltyTarget(p) + ' <small>vor Wurf ' + (p.beforeThrow + 1) + (p.causedBy ? ' · durch Verwarnungen' : '') + '</small>' + drinkBanState(m, p) +
        (removable ? '<button class="icon-inline" data-action="pen-del" data-id="' + m.id + '" data-pen="' + p.id + '" aria-label="Eintrag löschen">✕</button>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function drinkBanState(m, p) {
    if (p.type !== 'skip_player' && p.type !== 'skip_team') return '';
    var served = F.drinkBanServedAt(m, p);
    return served ? ' <span class="ban-state done">✓ nicht getrunken bei Treffer #' + served.throwNumber + '</span>'
      : ' <span class="ban-state open">🚫 beim nächsten Treffer nicht trinken</span>';
  }

  function banBadge(m, pid) {
    return m.status === 'in_progress' && F.pendingDrinkBans(m, state)[pid]
      ? ' <span class="ban-badge" title="Darf beim nächsten Treffer nicht trinken">🚫</span>' : '';
  }

  function warnBadge(m, tid) {
    var n = F.warningAccount(m, tid);
    return n ? ' <span class="warn-badge" title="Mahn-Konto: ' + n + ' von 8 Verwarnungen">⚠' + n + '/8</span>' : '';
  }

  // Ein Button pro Strafe und Ziel: Verwarnung/Teamaussetzen pro Team, Aussetzen/Strafhalbe pro Spieler
  function penaltyBox(m) {
    function btn(type, tid, pid) {
      return '<button class="pen-btn pen-' + type + '" data-action="pen-add" data-type="' + type + '" data-id="' + m.id +
        '" data-team="' + tid + '"' + (pid ? ' data-player="' + pid + '"' : '') + '>' + PEN_ICONS[type] + ' ' + (type === 'skip_team' ? 'Aussetzen' : F.PENALTY_TYPES[type]) + '</button>';
    }
    return '<div class="penalty-box"><h2>Verwarnungen &amp; Strafen</h2><div class="grid2 pen-teams">' +
      [m.homeTeamId, m.awayTeamId].map(function (tid) {
        return '<div class="pen-team"><h3>' + tname(tid) + warnBadge(m, tid) + '</h3>' +
          '<div class="pen-row"><span class="pen-who">Team</span>' + btn('warning', tid) + btn('skip_team', tid) + '</div>' +
          m.playerOrder[tid].map(function (pid) {
            return '<div class="pen-row"><span class="pen-who">' + pname(pid) + banBadge(m, pid) + '</span>' +
              btn('skip_player', tid, pid) + btn('strafhalbe', tid, pid) + '</div>';
          }).join('') + '</div>';
      }).join('') + '</div>' + penaltyList(m, true) + '</div>';
  }

  /* ---------- 6.1 Setup ---------- */
  function viewSetup() {
    if (!draft) draft = newDraft();
    var n = draft.teams.length, mode = F.getMode(n);
    var third = draft.thirdPlace != null ? draft.thirdPlace : !!(mode && mode.thirdPlace);
    var canThird = mode && !mode.series && (mode.qualifiers >= 4 || n >= 4);
    return '<section class="card"><h1>Turnier erstellen</h1>' +
      '<div class="grid2">' +
      '<label>Turniername<input data-bind="name" value="' + esc(draft.name) + '" placeholder="z.B. Sommer-Flanki 2026"></label>' +
      '<label>Datum<input type="date" data-bind="date" value="' + esc(draft.date) + '"></label>' +
      '</div>' +
      '<h2>Teams <small>(' + n + ')</small></h2>' +
      '<div class="team-inputs">' + draft.teams.map(function (t, i) {
        return '<fieldset class="team-input"><legend>Team ' + (i + 1) + '</legend>' +
          '<input data-bind="team" data-i="' + i + '" value="' + esc(t.name) + '" placeholder="Teamname">' +
          '<input data-bind="player" data-i="' + i + '" data-p="0" value="' + esc(t.players[0]) + '" placeholder="Spieler 1">' +
          '<input data-bind="player" data-i="' + i + '" data-p="1" value="' + esc(t.players[1]) + '" placeholder="Spieler 2">' +
          (n > F.MIN_TEAMS ? '<button class="icon" data-action="remove-team" data-i="' + i + '" aria-label="Team entfernen">✕</button>' : '') +
          '</fieldset>';
      }).join('') + '</div>' +
      (n < F.MAX_TEAMS ? '<button data-action="add-team" class="secondary">+ Team hinzufügen</button>' : '') +
      '<div class="mode-info"><strong>Modus:</strong> ' + esc(F.describeMode(n)) + '</div>' +
      (canThird ? '<label class="toggle"><input type="checkbox" data-bind="thirdPlace"' + (third ? ' checked' : '') + '> Spiel um Platz 3</label>' : '') +
      '<p id="setup-error" class="error" hidden></p>' +
      '<div class="actions"><button data-action="start" class="primary big">Turnier starten</button>' +
      '<button data-action="import" class="secondary">Turnier importieren</button></div>' +
      '</section>';
  }

  function startTournament() {
    var err = document.getElementById('setup-error');
    var teams = draft.teams.map(function (t, i) {
      return { name: t.name.trim() || 'Team ' + (i + 1),
        players: t.players.map(function (p, j) { return p.trim() || 'Spieler ' + (i + 1) + (j ? 'b' : 'a'); }) };
    });
    var names = teams.map(function (t) { return t.name.toLowerCase(); });
    var dup = names.find(function (x, i) { return names.indexOf(x) !== i; });
    if (dup) { err.textContent = 'Teamnamen müssen eindeutig sein („' + dup + '“).'; err.hidden = false; return; }
    var mode = F.getMode(teams.length);
    state = F.createTournament({ name: draft.name.trim() || 'Flankiball-Turnier', date: draft.date,
      thirdPlace: draft.thirdPlace != null ? draft.thirdPlace : mode.thirdPlace, teams: teams });
    draft = null;
    Store.save(state);
    go('#/');
  }

  /* ---------- 6.2 Dashboard ---------- */
  function viewDashboard() {
    var t = state.tournament, open = openMatches(), pod = F.podium(state);
    var html = '<section class="card hero"><div><h1>' + esc(t.name) + '</h1>' +
      '<p class="muted">' + esc(t.date) + ' · ' + t.teamCount + ' Teams · ' + esc(F.describeMode(t.teamCount)) + '</p></div>' +
      '<div class="phase">' + esc(F.phaseLabel(state)) + '</div>';
    if (open.length) html += '<button data-action="next-match" class="primary big">' +
      (open[0].status === 'in_progress' ? 'Laufendes Spiel fortsetzen' : 'Nächstes Spiel starten') + '</button>';
    html += '</section>';

    if (pod.length) {
      html += '<section class="card podium"><h2>🏆 Siegerehrung</h2><ol>' + pod.map(function (p) {
        return '<li class="place' + p.place + '"><span>' + p.place + '.</span> ' + tname(p.teamId) + '</li>';
      }).join('') + '</ol></section>';
    }
    if (open.length) {
      html += '<section class="card"><h2>Nächste Spiele</h2><div class="match-list">' +
        open.slice(0, 5).map(matchRow).join('') + '</div></section>';
    }
    if (t.groups.length) {
      html += '<section class="card"><h2>Gruppenstand</h2><div class="groups-grid">' +
        t.groups.map(function (g) { return '<div><h3>' + esc(g.name) + '</h3>' + standingsTable(g, true) + '</div>'; }).join('') +
        '</div></section>';
    }
    if (F.mainStages(state).length || t.config.series) {
      html += '<section class="card"><h2>' + (t.config.series ? 'Serie' : 'K.o.-Baum') + '</h2>' + bracket() + '</section>';
    }
    return html;
  }

  /* ---------- 6.3 Gruppen ---------- */
  function standingsTable(g, compact) {
    var rows = F.groupStandings(state, g);
    var t = state.tournament, perGroup = Math.floor(t.config.qualifiers / t.groups.length);
    return '<table class="standings"><thead><tr><th>#</th><th>Team</th><th title="Spiele">Sp</th><th>S</th><th>N</th>' +
      (compact ? '' : '<th>Treffer</th><th>Würfe</th>') + '<th>Quote</th><th>Pkt</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr class="' + (r.rank <= perGroup ? 'qualified' : '') + '"><td>' + r.rank + '</td><td>' + tname(r.teamId) +
          '</td><td>' + r.matchesPlayed + '</td><td>' + r.wins + '</td><td>' + r.losses + '</td>' +
          (compact ? '' : '<td>' + r.hitsTotal + '</td><td>' + r.throwsTotal + '</td>') +
          '<td>' + pct(r.hitQuote) + '</td><td><strong>' + r.points + '</strong></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function viewGroups() {
    var groups = state.tournament.groups;
    if (!groups.length) return '<section class="card"><p>Dieses Turnier hat keine Gruppenphase.</p></section>';
    var gi = Math.min(ui.group, groups.length - 1), g = groups[gi];
    var ms = state.matches.filter(function (m) { return m.groupId === g.id; });
    var ll = '';
    if (!F.mainStages(state).length && state.tournament.config.qualifiers % groups.length) {
      ll = '<p class="muted small">Zusätzlich ziehen die besten Gruppen-' +
        (Math.floor(state.tournament.config.qualifiers / groups.length) + 1) + 'ten als Lucky Loser in die K.o.-Runde ein (Punkte pro Spiel, dann Quote).</p>';
    }
    return '<section class="card">' +
      (groups.length > 1 ? '<div class="tabs">' + groups.map(function (x, i) {
        return '<button data-action="tab" data-i="' + i + '" class="' + (i === gi ? 'active' : '') + '">' + esc(x.name) + '</button>';
      }).join('') + '</div>' : '<h1>' + esc(g.name) + '</h1>') +
      standingsTable(g, false) + ll +
      '<p class="muted small">Sortierung: Punkte, Trefferquote, alphabetisch. Bei identischer Quote entscheidet ein Kopfball- oder Konfetti-Match (nicht im System).</p>' +
      '</section><section class="card"><h2>Spiele</h2><div class="match-list">' + ms.map(matchRow).join('') + '</div></section>';
  }

  /* ---------- 6.4 K.o. ---------- */
  function bracketMatch(m) {
    var r = m.result, w = r && r.winnerTeamId;
    function line(id, hits) {
      return '<div class="bteam ' + (w === id ? 'win' : w ? 'lose' : '') + '"><span>' + tname(id) +
        (team(id) && team(id).seed ? ' <small>(' + team(id).seed + ')</small>' : '') + '</span><b>' + (r ? hits : '') + '</b></div>';
    }
    return '<a class="bmatch" href="#/match/' + m.id + '">' + line(m.homeTeamId, r && r.homeTeamHits) +
      line(m.awayTeamId, r && r.awayTeamHits) + (r ? '' : '<div class="bstatus">' + statusBadge(m) + '</div>') + '</a>';
  }

  function bracket() {
    var t = state.tournament;
    if (t.config.series) {
      var st = t.knockoutStages[0], wins = {};
      var ms = F.stageMatches(state, st.id);
      ms.forEach(function (m) { if (m.result) wins[m.result.winnerTeamId] = (wins[m.result.winnerTeamId] || 0) + 1; });
      return '<div class="series-score">' + state.teams.map(function (x) {
        return '<div><span>' + esc(x.name) + '</span><b>' + (wins[x.id] || 0) + '</b></div>';
      }).join('') + '</div><div class="match-list">' + ms.map(matchRow).join('') + '</div>';
    }
    var stages = F.mainStages(state);
    if (!stages.length) return '<p class="muted">Die K.o.-Runde wird automatisch erstellt, sobald alle Gruppenspiele beendet sind.</p>';
    // Noch nicht erzeugte Runden als Platzhalter zeigen
    var cols = stages.map(function (s) { return { name: s.stageName, matches: F.stageMatches(state, s.id) }; });
    for (var size = stages[stages.length - 1].size / 2; size >= 2; size /= 2) {
      cols.push({ name: size === 2 ? 'Finale' : size === 4 ? 'Halbfinale' : 'Viertelfinale', placeholder: size / 2 });
    }
    var third = t.knockoutStages.find(function (s) { return s.kind === 'third'; });
    return '<div class="bracket">' + cols.map(function (c) {
      var body = c.matches ? c.matches.map(bracketMatch).join('')
        : new Array(c.placeholder + 1).join('<div class="bmatch placeholder"><div class="bteam">offen</div><div class="bteam">offen</div></div>');
      return '<div class="bcol"><h3>' + esc(c.name) + '</h3><div class="bcol-body">' + body + '</div></div>';
    }).join('') + '</div>' +
      (third ? '<h3>Spiel um Platz 3</h3><div class="bthird">' + F.stageMatches(state, third.id).map(bracketMatch).join('') + '</div>' : '');
  }

  function viewKo() {
    var t = state.tournament, html = '<section class="card"><h1>' + (t.config.series ? 'Serie' : 'K.o.-Phase') + '</h1>' + bracket() + '</section>';
    if (!t.config.series && F.mainStages(state).length) {
      var q = state.teams.filter(function (x) { return x.seed; }).sort(function (a, b) { return a.seed - b.seed; });
      html += '<section class="card"><h2>Setzliste</h2><ol class="seeds">' + q.map(function (x) {
        return '<li>' + esc(x.name) + '</li>';
      }).join('') + '</ol></section>';
    }
    return html;
  }

  /* ---------- 3. Match ---------- */
  function viewMatch(id) {
    var m = F.matchById(state, id);
    if (!m) return '<section class="card"><p>Spiel nicht gefunden.</p><a href="#/">Zur Übersicht</a></section>';
    var home = team(m.homeTeamId), away = team(m.awayTeamId), sa = m.sideAssignment;
    var head = '<section class="card match-head"><div class="ctx">' + esc(matchContext(m)) + ' ' + statusBadge(m) + '</div>' +
      '<h1>' + esc(home.name) + ' <span class="vs">vs</span> ' + esc(away.name) + '</h1>' +
      '<div class="sides"><span class="side side-a">' + sideLabel('side_a') + ': ' +
      esc(sa.homeTeamSide === 'side_a' ? home.name : away.name) + '</span><span class="side side-b">' + sideLabel('side_b') + ': ' +
      esc(sa.homeTeamSide === 'side_b' ? home.name : away.name) + '</span>' +
      (m.status !== 'completed' ? '<button class="small secondary" data-action="swap-sides" data-id="' + m.id + '">Seiten tauschen</button>' : '') +
      '</div></section>';

    if (m.status === 'not_started') return head + matchSetup(m);
    if (m.status === 'in_progress') return head + matchLive(m);
    return head + matchSummary(m);
  }

  function matchSetup(m) {
    if (!m.playerOrder) {
      m.playerOrder = {};
      m.playerOrder[m.homeTeamId] = team(m.homeTeamId).players.slice();
      m.playerOrder[m.awayTeamId] = team(m.awayTeamId).players.slice();
      m.startingTeamId = m.homeTeamId;
    }
    function orderBox(tid) {
      return '<div class="order-box"><h3>' + tname(tid) + '</h3><ol>' + m.playerOrder[tid].map(function (pid) {
        return '<li>' + pname(pid) + '</li>';
      }).join('') + '</ol><button class="secondary small" data-action="swap-order" data-id="' + m.id + '" data-team="' + tid + '">Reihenfolge tauschen</button></div>';
    }
    return '<section class="card"><h2>Spieler-Reihenfolge</h2><div class="grid2">' +
      orderBox(m.homeTeamId) + orderBox(m.awayTeamId) + '</div>' +
      '<h2>Wer wirft zuerst?</h2><div class="segmented">' + [m.homeTeamId, m.awayTeamId].map(function (tid) {
        return '<button data-action="starting" data-id="' + m.id + '" data-team="' + tid + '" class="' +
          (m.startingTeamId === tid ? 'active' : '') + '">' + tname(tid) + '</button>';
      }).join('') + '</div>' +
      '<div class="actions"><button class="primary big" data-action="begin" data-id="' + m.id + '">Spiel starten</button></div></section>';
  }

  function matchLive(m) {
    var tot = F.matchTotals(m), auto = state.tournament.settings.autoSwitch;
    var next = F.nextThrower(m);
    var sel = auto ? next : (ui.selectedThrower && ui.selectedThrower.matchId === m.id ? ui.selectedThrower : next);
    function teamPanel(tid) {
      var x = tot[tid], active = sel && sel.teamId === tid;
      return '<div class="team-panel ' + (active ? 'active' : '') + '"><h3>' + tname(tid) + warnBadge(m, tid) + '</h3>' +
        '<div class="counters"><div><b>' + x.throws + '</b><span>Würfe</span></div><div><b>' + x.hits + '</b><span>Treffer</span></div>' +
        '<div><b>' + pct(F.quote(x.hits, x.throws)) + '</b><span>Quote</span></div></div>' +
        '<div class="players">' + m.playerOrder[tid].map(function (pid) {
          var isSel = sel && sel.playerId === pid;
          return auto ? '<span class="player ' + (isSel ? 'current' : '') + '">' + pname(pid) + banBadge(m, pid) + '</span>'
            : '<button class="player ' + (isSel ? 'current' : '') + '" data-action="pick" data-id="' + m.id + '" data-team="' + tid + '" data-player="' + pid + '">' + pname(pid) + banBadge(m, pid) + '</button>';
        }).join('') + '</div>' +
        '<button class="secondary small order-swap" data-action="swap-order" data-id="' + m.id + '" data-team="' + tid + '">⇄ Reihenfolge tauschen</button></div>';
    }
    return '<section class="card live"><div class="grid2 panels">' + teamPanel(m.homeTeamId) + teamPanel(m.awayTeamId) + '</div>' +
      '<div class="throw-box"><div class="next-label">Nächster Wurf: <strong>' + (sel ? tname(sel.teamId) + ' – ' + pname(sel.playerId) : '–') + '</strong></div>' +
      '<div class="throw-buttons"><button class="hit" data-action="throw" data-hit="1" data-id="' + m.id + '">✓ Treffer</button>' +
      '<button class="miss" data-action="throw" data-hit="0" data-id="' + m.id + '">✗ Daneben</button></div>' +
      '<div class="throw-tools"><label class="toggle"><input type="checkbox" data-action="auto-switch"' + (auto ? ' checked' : '') + '> Wechsel automatisch</label>' +
      '<button class="secondary small" data-action="undo" data-id="' + m.id + '"' + (m.throwSequence.length || (m.penalties || []).length ? '' : ' disabled') + '>↶ Letzte Eingabe zurücknehmen</button></div></div>' + penaltyBox(m) +
      '<div class="end-box"><h2>Spiel beenden – Bier leer bei:</h2><div class="segmented">' + [m.homeTeamId, m.awayTeamId].map(function (tid) {
        return '<button class="primary" data-action="finish" data-id="' + m.id + '" data-team="' + tid + '">' + tname(tid) + ' gewinnt</button>';
      }).join('') + '</div>' +
      '<button class="secondary small abort" data-action="abort" data-id="' + m.id + '">Spiel abbrechen</button></div></section>' +
      throwTable(m);
  }

  // Alle Würfe des laufenden Spiels, neueste oben; Spieler, Ergebnis und Löschen sind bearbeitbar
  // Teamname aus mehreren Wörtern → Anfangsbuchstaben ("Die Flanken" → "DF").
  // Einwortige Namen bleiben; sind beide Kürzel gleich, werden die vollen Namen genutzt.
  function initials(name) {
    var words = name.trim().split(/[\s\-_]+/).filter(Boolean);
    return words.length > 1 ? words.map(function (w) { return w.charAt(0).toUpperCase(); }).join('') : name;
  }

  function throwTable(m) {
    var seq = m.throwSequence, short = {};
    var h = initials(team(m.homeTeamId).name), a = initials(team(m.awayTeamId).name);
    if (h.toLowerCase() === a.toLowerCase()) { h = team(m.homeTeamId).name; a = team(m.awayTeamId).name; }
    short[m.homeTeamId] = esc(h); short[m.awayTeamId] = esc(a);
    var html = '<section class="card"><h2>Würfe <small>(' + seq.length + ')</small></h2>';
    if (!seq.length) return html + '<p class="muted small">Noch keine Würfe.</p></section>';
    function playerSelect(e) {
      return '<select data-action="throw-player" data-id="' + m.id + '" data-throw="' + e.id + '" aria-label="Spieler">' +
        [m.homeTeamId, m.awayTeamId].map(function (tid) {
          return '<optgroup label="' + tname(tid) + '">' + m.playerOrder[tid].map(function (pid) {
            return '<option value="' + pid + '"' + (pid === e.playerId ? ' selected' : '') + '>' + pname(pid) + '</option>';
          }).join('') + '</optgroup>';
        }).join('') + '</select>';
    }
    return html + '<div class="table-wrap"><table class="throw-table"><thead><tr><th>#</th><th>Spieler</th><th>Team</th><th>Ergebnis</th><th></th></tr></thead><tbody>' +
      seq.slice().reverse().map(function (e) {
        return '<tr><td>' + e.throwNumber + '</td><td>' + playerSelect(e) + '</td><td class="team-short" title="' + tname(e.teamId) + '">' + short[e.teamId] + '</td>' +
          '<td><button class="small result-toggle ' + (e.isHit ? 'hit' : 'miss') + '" data-action="throw-hit" data-id="' + m.id + '" data-throw="' + e.id + '" title="Umschalten">' +
          (e.isHit ? '✓ Treffer' : '✗ Daneben') + '</button></td>' +
          '<td><button class="icon-inline" data-action="throw-del" data-id="' + m.id + '" data-throw="' + e.id + '" aria-label="Wurf löschen">✕</button></td></tr>';
      }).join('') + '</tbody></table></div><p class="muted small">Tipp auf das Ergebnis schaltet zwischen Treffer und Daneben um.</p></section>';
  }

  function matchSummary(m) {
    var r = m.result, stats = F.playerStats(state);
    function playerLine(pid) {
      var s = stats.find(function (x) { return x.playerId === pid; });
      var th = s.throwsByMatch[m.id] || 0, h = s.hitsByMatch[m.id] || 0;
      return '<tr><td>' + pname(pid) + '</td><td>' + th + '</td><td>' + h + '</td><td>' + pct(F.quote(h, th)) + '</td></tr>';
    }
    function block(tid, hits, throws, q) {
      return '<div class="team-panel ' + (r.winnerTeamId === tid ? 'winner' : '') + '"><h3>' + tname(tid) + warnBadge(m, tid) + (r.winnerTeamId === tid ? ' 🏆' : '') + '</h3>' +
        '<div class="counters"><div><b>' + throws + '</b><span>Würfe</span></div><div><b>' + hits + '</b><span>Treffer</span></div><div><b>' + pct(q) + '</b><span>Quote</span></div></div>' +
        '<table><thead><tr><th>Spieler</th><th>W</th><th>T</th><th>Quote</th></tr></thead><tbody>' +
        team(tid).players.map(playerLine).join('') + '</tbody></table></div>';
    }
    return '<section class="card"><div class="grid2 panels">' + block(m.homeTeamId, r.homeTeamHits, r.homeTeamThrows, r.homeTeamQuote) +
      block(m.awayTeamId, r.awayTeamHits, r.awayTeamThrows, r.awayTeamQuote) + '</div>' +
      '<h2>Verwarnungen &amp; Strafen</h2>' + penaltyList(m, false) +
      '<div class="actions"><button class="secondary" data-action="next-match">Nächstes Spiel</button>' +
      (F.canReopen(state, m) ? '<button class="secondary" data-action="reopen" data-id="' + m.id + '">Ergebnis korrigieren</button>' : '') +
      '</div></section>';
  }

  /* ---------- 6.5 Statistik ---------- */
  function viewStats() {
    var ts = F.teamStats(state), ps = F.playerRanking(state, ui.minThrows);
    return '<section class="card"><h1>Team-Statistik</h1><div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th>Sp</th><th>S</th><th>N</th><th>Treffer</th><th>Würfe</th><th>Quote</th><th>Pkt</th>' + penHead() + '</tr></thead><tbody>' +
      ts.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + tname(r.teamId) + '</td><td>' + r.matchesPlayed + '</td><td>' + r.wins + '</td><td>' + r.losses +
          '</td><td>' + r.hitsTotal + '</td><td>' + r.throwsTotal + '</td><td>' + pct(r.hitQuote) + '</td><td><strong>' + r.points + '</strong></td>' + penCells(r.penalties) + '</tr>';
      }).join('') + '</tbody></table></div><p class="muted small">Team-Werte enthalten auch die Strafen der einzelnen Spieler.</p></section>' +
      '<section class="card"><h1>Spieler-Rangliste</h1><label class="inline">Mindestwürfe <input type="number" min="0" max="99" data-bind="minThrows" value="' + ui.minThrows + '"></label>' +
      '<div class="table-wrap"><table><thead><tr><th>#</th><th>Spieler</th><th>Team</th><th>Würfe</th><th>Treffer</th><th>Quote</th><th>Sp</th><th>S</th>' + penHead(true) + '</tr></thead><tbody>' +
      ps.map(function (s, i) {
        var ok = s.throwsTotal >= ui.minThrows;
        return '<tr class="' + (ok ? '' : 'dim') + '"><td>' + (ok ? i + 1 : '–') + '</td><td>' + esc(s.name) + '</td><td>' + tname(s.teamId) +
          '</td><td>' + s.throwsTotal + '</td><td>' + s.hitsTotal + '</td><td>' + pct(s.hitQuote) + '</td><td>' + s.matchesPlayed + '</td><td>' + s.wins + '</td>' + penCells(s.penalties, true) + '</tr>';
      }).join('') + '</tbody></table></div><p class="muted small">Sortiert nach Quote (nur Spieler mit genug Würfen), dann Treffern.</p></section>';
  }

  // Spieler haben nur Aussetzen und Strafhalbe; Verwarnung und Teamaussetzen gehen ans Team
  function penKeys(forPlayers) {
    return Object.keys(F.PENALTY_TYPES).filter(function (k) { return !(forPlayers && F.TEAM_PENALTIES[k]); });
  }
  function penHead(forPlayers) {
    return penKeys(forPlayers).map(function (k) { return '<th title="' + F.PENALTY_TYPES[k] + '">' + PEN_ICONS[k] + '</th>'; }).join('');
  }
  function penCells(c, forPlayers) {
    return penKeys(forPlayers).map(function (k) { return '<td>' + (c[k] || '') + '</td>'; }).join('');
  }

  function downloadCsv(name, rows) {
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    Store.download(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  }
  function csvPct(q) { return (q * 100).toFixed(1).replace('.', ','); }

  function exportPlayersCsv() {
    var rows = [['Spieler', 'Team', 'Würfe', 'Treffer', 'Quote', 'Spiele', 'Siege', 'Niederlagen', 'Aussetzen', 'Strafhalben']];
    F.playerRanking(state, ui.minThrows).forEach(function (s) {
      rows.push([s.name, team(s.teamId).name, s.throwsTotal, s.hitsTotal, csvPct(s.hitQuote), s.matchesPlayed, s.wins, s.losses, s.penalties.skip_player, s.penalties.strafhalbe]);
    });
    downloadCsv('flankenscore_spieler.csv', rows);
  }

  function exportCareerCsv() {
    var rows = [['Spieler', 'Teams', 'Turniere', 'Titel', 'Podest', 'Würfe', 'Treffer', 'Quote', 'Spiele', 'Siege', 'Niederlagen', 'Aussetzen', 'Strafhalben']];
    F.careerStats(Store.list(), ui.minThrows).players.forEach(function (s) {
      rows.push([s.name, s.teamNames.join(', '), s.tournaments, s.titles, s.podiums, s.throwsTotal, s.hitsTotal, csvPct(s.hitQuote),
        s.matchesPlayed, s.wins, s.losses, s.penalties.skip_player, s.penalties.strafhalbe]);
    });
    downloadCsv('flankenscore_gesamtstatistik.csv', rows);
  }

  /* ---------- Turnier-Verlauf ---------- */
  function viewHistory() {
    var all = Store.list();
    var html = '<section class="card"><h1>Turniere <small>(' + all.length + ')</small></h1>' +
      '<div class="actions"><button class="primary" data-action="new">+ Neues Turnier</button>' +
      '<button class="secondary" data-action="go" data-to="#/career">Gesamtstatistik</button>' +
      '<button class="secondary" data-action="import">Turnier importieren</button></div>';
    if (!all.length) return html + '<p class="muted">Noch keine Turniere gespeichert.</p></section>';
    return html + '<ul class="history-list">' + all.map(function (st) {
      var t = st.tournament, active = state && state.tournament.id === t.id;
      var champ = F.podium(st).find(function (p) { return p.place === 1; });
      var status = t.status === 'completed' ? '<span class="badge done">beendet</span>' : '<span class="badge live">läuft</span>';
      return '<li class="history-item' + (active ? ' active' : '') + '"><div class="history-info"><strong>' + esc(t.name) + '</strong> ' + status +
        (active ? ' <span class="badge">geöffnet</span>' : '') +
        '<span class="muted small">' + esc(t.date) + ' · ' + t.teamCount + ' Teams' +
        (champ ? ' · 🏆 ' + esc(F.teamById(st, champ.teamId).name) : '') + '</span></div>' +
        '<div class="history-actions">' +
        (active ? '' : '<button class="small" data-action="open-t" data-id="' + t.id + '">Öffnen</button>') +
        '<button class="small secondary" data-action="export-t" data-id="' + t.id + '">Export</button>' +
        '<button class="small danger" data-action="del-t" data-id="' + t.id + '">Löschen</button></div></li>';
    }).join('') + '</ul></section>';
  }

  function viewCareer() {
    var all = Store.list(), c = F.careerStats(all, ui.minThrows);
    if (!all.length) return '<section class="card"><h1>Gesamtstatistik</h1><p class="muted">Noch keine Turniere gespeichert.</p></section>';
    return '<section class="card"><h1>Spieler – alle Turniere</h1><p class="muted small">' + all.length + ' Turniere · Spieler werden über ihren Namen zusammengeführt.</p>' +
      '<label class="inline">Mindestwürfe <input type="number" min="0" max="999" data-bind="minThrows" value="' + ui.minThrows + '"></label>' +
      '<div class="table-wrap"><table><thead><tr><th>#</th><th>Spieler</th><th title="Turniere">Tur</th><th title="Turniersiege">🏆</th><th>Würfe</th><th>Treffer</th><th>Quote</th><th>Sp</th><th>S</th>' + penHead(true) + '</tr></thead><tbody>' +
      c.players.map(function (s, i) {
        var ok = s.throwsTotal >= ui.minThrows;
        return '<tr class="' + (ok ? '' : 'dim') + '"><td>' + (ok ? i + 1 : '–') + '</td><td title="' + esc(s.teamNames.join(', ')) + '">' + esc(s.name) + '</td><td>' + s.tournaments +
          '</td><td>' + (s.titles || '') + '</td><td>' + s.throwsTotal + '</td><td>' + s.hitsTotal + '</td><td>' + pct(s.hitQuote) + '</td><td>' + s.matchesPlayed + '</td><td>' + s.wins + '</td>' + penCells(s.penalties, true) + '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="actions"><button class="secondary" data-action="export-career">Als CSV exportieren</button></div></section>' +
      '<section class="card"><h1>Teams – alle Turniere</h1><div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th title="Turniere">Tur</th><th title="Turniersiege">🏆</th><th>Podest</th><th>Sp</th><th>S</th><th>N</th><th>Sieg-%</th><th>Quote</th>' + penHead() + '</tr></thead><tbody>' +
      c.teams.map(function (s, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(s.name) + '</td><td>' + s.tournaments + '</td><td>' + (s.titles || '') + '</td><td>' + (s.podiums || '') +
          '</td><td>' + s.matchesPlayed + '</td><td>' + s.wins + '</td><td>' + s.losses + '</td><td>' + pct(s.winQuote) + '</td><td>' + pct(s.hitQuote) + '</td>' + penCells(s.penalties) + '</tr>';
      }).join('') + '</tbody></table></div><p class="muted small">Sortiert nach Turniersiegen, dann Spielsiegen.</p></section>';
  }

  function findStored(id) { return Store.list().find(function (st) { return st.tournament.id === id; }); }

  /* ---------- Router ---------- */
  function render() {
    var route = location.hash.replace(/^#\/?/, '');
    if (!state && ['setup', 'history', 'career'].indexOf(route) < 0) route = 'setup';
    var html;
    if (route === 'setup') html = viewSetup();
    else if (route === 'history') html = viewHistory();
    else if (route === 'career') html = viewCareer();
    else if (route === 'groups') html = viewGroups();
    else if (route === 'ko') html = viewKo();
    else if (route === 'stats') html = viewStats();
    else if (route.indexOf('match/') === 0) html = viewMatch(route.slice(6));
    else { route = ''; html = viewDashboard(); }
    renderNav(route.split('/')[0]);
    app.innerHTML = html;
    document.body.classList.toggle('in-match', route.indexOf('match/') === 0);
  }

  /* ---------- Aktionen ---------- */
  var actions = {
    'add-team': function () { draft.teams.push({ name: '', players: ['', ''] }); render(); },
    'remove-team': function (d) { draft.teams.splice(+d.i, 1); draft.thirdPlace = null; render(); },
    'start': startTournament,
    'tab': function (d) { ui.group = +d.i; render(); },
    'next-match': function () {
      var open = openMatches();
      go(open.length ? '#/match/' + open[0].id : '#/');
    },
    'swap-sides': function (d) {
      var m = F.matchById(state, d.id), s = m.sideAssignment;
      m.sideAssignment = { homeTeamSide: s.awayTeamSide, awayTeamSide: s.homeTeamSide };
      Store.save(state); render();
    },
    'swap-order': function (d) {
      F.matchById(state, d.id).playerOrder[d.team].reverse();
      ui.selectedThrower = null;
      Store.save(state); render();
    },
    'throw-hit': function (d) {
      var m = F.matchById(state, d.id), e = m.throwSequence.find(function (x) { return x.id === d.throw; });
      F.editThrow(m, d.throw, { isHit: !e.isHit });
      Store.save(state); render();
    },
    'throw-del': function (d) {
      var m = F.matchById(state, d.id), e = m.throwSequence.find(function (x) { return x.id === d.throw; });
      if (!confirm('Wurf #' + e.throwNumber + ' von ' + F.playerById(state, e.playerId).name + ' löschen?')) return;
      F.deleteThrow(m, d.throw);
      ui.selectedThrower = null;
      Store.save(state); render();
    },
    'starting': function (d) { F.matchById(state, d.id).startingTeamId = d.team; render(); },
    'begin': function (d) {
      var m = F.matchById(state, d.id);
      m.status = 'in_progress'; m.updatedAt = F.now();
      ui.selectedThrower = null;
      Store.save(state); render();
    },
    'pick': function (d) { ui.selectedThrower = { matchId: d.id, teamId: d.team, playerId: d.player }; render(); },
    'throw': function (d) {
      var m = F.matchById(state, d.id), auto = state.tournament.settings.autoSwitch;
      var sel = !auto && ui.selectedThrower && ui.selectedThrower.matchId === m.id ? ui.selectedThrower : F.nextThrower(m);
      F.recordThrow(m, sel.playerId, sel.teamId, d.hit === '1');
      ui.selectedThrower = null;
      Store.save(state); render();
    },
    'undo': function (d) {
      var m = F.matchById(state, d.id);
      F.undoLast(m);
      ui.selectedThrower = null;
      Store.save(state); render();
    },
    'pen-add': function (d) {
      F.addPenalty(F.matchById(state, d.id), d.type, d.team, d.player);
      ui.selectedThrower = null;
      Store.save(state); render();
    },
    'pen-del': function (d) {
      if (!confirm('Eintrag löschen?')) return;
      F.removePenalty(F.matchById(state, d.id), d.pen);
      Store.save(state); render();
    },
    'abort': function (d) {
      var m = F.matchById(state, d.id);
      var n = m.throwSequence.length, p = (m.penalties || []).length;
      if (!confirm('Spiel abbrechen und auf „offen“ zurücksetzen?\n\n' + n + ' Würfe und ' + p +
        ' Strafen/Verwarnungen dieses Spiels werden gelöscht. Seiten und Reihenfolge kannst du danach neu festlegen.')) return;
      F.abortMatch(m);
      ui.selectedThrower = null;
      Store.save(state); render();
    },
    'finish': function (d) {
      var m = F.matchById(state, d.id);
      if (!confirm(team(d.team).name + ' gewinnt das Spiel?')) return;
      m.result = F.buildResult(m, d.team);
      m.status = 'completed'; m.updatedAt = F.now();
      commit();
    },
    'reopen': function (d) {
      if (!confirm('Ergebnis zurücksetzen und Spiel wieder öffnen? Die Würfe bleiben erhalten, noch nicht begonnene Folgespiele werden neu ausgelost.')) return;
      var m = F.matchById(state, d.id);
      F.reopen(state, m);
      Store.save(state); render();
    },
    'export': function () { Store.exportJson(state); },
    'import': function () { document.getElementById('importFile').click(); },
    'print': function () { window.print(); },
    'export-players': exportPlayersCsv,
    'export-career': exportCareerCsv,
    'go': function (d) { go(d.to); },
    'new': function () {
      if (state && !confirm('Neues Turnier anlegen? Das aktuelle Turnier bleibt unter „Turniere“ gespeichert.')) return;
      state = null; draft = newDraft(); Store.save(null); go('#/setup');
    },
    'open-t': function (d) {
      var st = findStored(d.id);
      if (!st) return;
      state = st; draft = null; ui.group = 0; ui.selectedThrower = null;
      Store.save(state); go('#/');
    },
    'export-t': function (d) { var st = findStored(d.id); if (st) Store.exportJson(st); },
    'del-t': function (d) {
      var st = findStored(d.id);
      if (!st || !confirm('Turnier „' + st.tournament.name + '“ (' + st.tournament.date + ') endgültig löschen?\n\nEs fließt dann auch nicht mehr in die Gesamtstatistik ein.')) return;
      Store.remove(d.id);
      if (state && state.tournament.id === d.id) state = null;
      render();
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'INPUT') return;
    var fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    var menu = el.closest('details.menu');
    if (menu) menu.open = false;
    fn(el.dataset);
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.action === 'auto-switch') {
      state.tournament.settings.autoSwitch = el.checked;
      ui.selectedThrower = null;
      Store.save(state); render();
    } else if (el.dataset.action === 'throw-player') {
      var m = F.matchById(state, el.dataset.id), p = F.playerById(state, el.value);
      F.editThrow(m, el.dataset.throw, { playerId: p.id, teamId: p.teamId });
      ui.selectedThrower = null;
      Store.save(state); render();
    } else if (el.dataset.bind === 'thirdPlace') {
      draft.thirdPlace = el.checked;
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target, b = el.dataset.bind;
    if (!b) return;
    if (b === 'minThrows') { ui.minThrows = Math.max(0, +el.value || 0); var pos = el.selectionStart; render(); var n = app.querySelector('[data-bind=minThrows]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* number input */ } return; }
    if (!draft) return;
    if (b === 'name') draft.name = el.value;
    else if (b === 'date') draft.date = el.value;
    else if (b === 'team') draft.teams[+el.dataset.i].name = el.value;
    else if (b === 'player') draft.teams[+el.dataset.i].players[+el.dataset.p] = el.value;
  });

  document.getElementById('importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    Store.importJson(file).then(function (data) {
      var t = data.tournament, old = findStored(t.id);
      if (old && (old.tournament.name !== t.name || old.tournament.date !== t.date)) {
        // Gleiche ID, aber anderes Turnier (z.B. von Hand erstellte Datei): als neues Turnier übernehmen
        t.id = F.uuid();
        [].concat(data.teams, t.groups || [], t.knockoutStages || [], data.matches).forEach(function (x) { if (x.tournamentId) x.tournamentId = t.id; });
      } else if (old && !confirm('Dieses Turnier ist schon gespeichert und wird durch die Datei ersetzt. Fortfahren?')) return;
      state = data; draft = null; Store.save(state); go('#/');
    }).catch(function (err) { alert('Import fehlgeschlagen: ' + err.message); });
  });

  // Tastatur-Kürzel im Spiel: T = Treffer, D/Leertaste = daneben, Z = zurück
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('in-match') || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    var map = { t: '[data-action=throw][data-hit="1"]', d: '[data-action=throw][data-hit="0"]', z: '[data-action=undo]' };
    var sel = map[e.key.toLowerCase()];
    var btn = sel && app.querySelector(sel);
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('storage', function (e) { if (Store.isStorageKey(e.key)) { state = Store.load(); render(); } });
  // Android-WebView: Dateiauswahl zeigt JSON-Dateien oft nicht als application/json an
  if (Store.isNative) document.getElementById('importFile').removeAttribute('accept');
  Store.ready().then(function () { state = Store.load(); render(); });
})();
