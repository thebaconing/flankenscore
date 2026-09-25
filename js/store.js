/* Flankenscore – Persistierung in localStorage (7.2) */
(function (global) {
  'use strict';
  var KEY = 'flankenscore_tournament';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return validate(JSON.parse(raw));
    } catch (e) {
      console.warn('Gespeicherter Stand konnte nicht geladen werden', e);
      return null;
    }
  }

  function save(state) {
    if (!state) { try { localStorage.removeItem(KEY); } catch (e) { /* ignorieren */ } return; }
    state.tournament.updatedAt = Flanken.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
  }

  function validate(data) {
    if (!data || !data.tournament || !Array.isArray(data.teams) || !Array.isArray(data.matches) || !Array.isArray(data.players)) {
      throw new Error('Ungültige Turnierdatei');
    }
    return data;
  }

  function exportJson(state) {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var safe = (state.tournament.name || 'turnier').replace(/[^\w\-äöüÄÖÜß]+/g, '_');
    a.href = URL.createObjectURL(blob);
    a.download = 'flankenscore_' + safe + '_' + (state.tournament.date || '') + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importJson(file) {
    return file.text().then(function (txt) { return validate(JSON.parse(txt)); });
  }

  global.FlankenStore = { load: load, save: save, exportJson: exportJson, importJson: importJson };
})(window);
