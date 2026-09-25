/* Flankenscore – Persistierung in localStorage (7.2)
 * Jedes Turnier liegt unter einem eigenen Schlüssel, damit der Verlauf erhalten bleibt
 * und beim Speichern nur das aktive Turnier neu geschrieben wird. */
(function (global) {
  'use strict';
  var LEGACY_KEY = 'flankenscore_tournament';
  var INDEX_KEY = 'flankenscore_index';     // [tournamentId, ...]
  var ACTIVE_KEY = 'flankenscore_active';   // tournamentId oder leer
  var PREFIX = 'flankenscore_t_';

  /* In der Android-App (Capacitor) wird jede Änderung zusätzlich in den nativen Preferences
   * gesichert. Android darf den WebView-Speicher leeren – dann wird beim Start daraus wiederhergestellt. */
  var Cap = global.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  // Ohne Bundler: native Plugins direkt über die Capacitor-Bridge registrieren
  function plugin(name) { return Cap.Plugins[name] || Cap.registerPlugin(name); }
  var Prefs = isNative && plugin('Preferences');

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, val) {
    localStorage.setItem(key, val);
    if (Prefs) Prefs.set({ key: key, value: val }).catch(function (e) { console.warn('Native Sicherung fehlgeschlagen', e); });
  }
  function del(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignorieren */ }
    if (Prefs) Prefs.remove({ key: key }).catch(function () { /* ignorieren */ });
  }

  // Vor dem ersten load() aufrufen: stellt fehlende Einträge aus der nativen Sicherung wieder her
  function ready() {
    if (!Prefs) return Promise.resolve();
    return Prefs.keys().then(function (res) {
      var missing = res.keys.filter(function (k) { return isStorageKey(k) && get(k) == null; });
      return Promise.all(missing.map(function (k) {
        return Prefs.get({ key: k }).then(function (r) { if (r.value != null) localStorage.setItem(k, r.value); });
      }));
    }).catch(function (e) { console.warn('Native Sicherung konnte nicht gelesen werden', e); });
  }

  function index() {
    try { var ids = JSON.parse(get(INDEX_KEY) || '[]'); return Array.isArray(ids) ? ids : []; }
    catch (e) { return []; }
  }

  function write(state) {
    var id = state.tournament.id, ids = index();
    set(PREFIX + id, JSON.stringify(state));
    if (ids.indexOf(id) < 0) { ids.push(id); set(INDEX_KEY, JSON.stringify(ids)); }
  }

  // Alten Einzel-Speicherstand in den Verlauf übernehmen
  function migrate() {
    var raw = get(LEGACY_KEY);
    if (!raw) return;
    try {
      var state = validate(JSON.parse(raw));
      write(state);
      set(ACTIVE_KEY, state.tournament.id);
    } catch (e) { console.warn('Alter Speicherstand konnte nicht übernommen werden', e); return; }
    del(LEGACY_KEY);
  }

  function read(id) {
    try {
      var raw = get(PREFIX + id);
      return raw ? validate(JSON.parse(raw)) : null;
    } catch (e) {
      console.warn('Turnier ' + id + ' konnte nicht geladen werden', e);
      return null;
    }
  }

  function load() {
    migrate();
    var id = get(ACTIVE_KEY);
    return id ? read(id) : null;
  }

  // Speichert das Turnier und macht es zum aktiven; null schließt das aktive Turnier (bleibt im Verlauf)
  function save(state) {
    if (!state) { del(ACTIVE_KEY); return; }
    state.tournament.updatedAt = Flanken.now();
    try { write(state); set(ACTIVE_KEY, state.tournament.id); }
    catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
  }

  // Alle gespeicherten Turniere, neueste zuerst
  function list() {
    return index().map(read).filter(Boolean).sort(function (a, b) {
      return String(b.tournament.date || '').localeCompare(String(a.tournament.date || '')) ||
        String(b.tournament.createdAt || '').localeCompare(String(a.tournament.createdAt || ''));
    });
  }

  function remove(id) {
    del(PREFIX + id);
    set(INDEX_KEY, JSON.stringify(index().filter(function (x) { return x !== id; })));
    if (get(ACTIVE_KEY) === id) del(ACTIVE_KEY);
  }

  function isStorageKey(key) { return key === ACTIVE_KEY || key === INDEX_KEY || (key || '').indexOf(PREFIX) === 0; }

  function validate(data) {
    if (!data || !data.tournament || !Array.isArray(data.teams) || !Array.isArray(data.matches) || !Array.isArray(data.players)) {
      throw new Error('Ungültige Turnierdatei');
    }
    return data;
  }

  // Android: Datei in den Cache schreiben und über das Teilen-Menü anbieten (Speichern, Drive, Messenger …)
  function share(name, blob) {
    return blob.text().then(function (text) {
      return plugin('Filesystem').writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    }).then(function (res) {
      return plugin('Share').share({ title: name, url: res.uri, dialogTitle: name });
    }).catch(function (e) {
      if (!/cancel/i.test(e && e.message)) alert('Export fehlgeschlagen: ' + (e && e.message));
    });
  }

  function download(name, blob) {
    if (isNative) { share(name, blob); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function exportJson(state) {
    var safe = (state.tournament.name || 'turnier').replace(/[^\w\-äöüÄÖÜß]+/g, '_');
    download('flankenscore_' + safe + '_' + (state.tournament.date || '') + '.json',
      new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  }

  function importJson(file) {
    return file.text().then(function (txt) { return validate(JSON.parse(txt)); });
  }

  global.FlankenStore = { isNative: isNative, ready: ready, load: load, save: save, list: list, remove: remove, isStorageKey: isStorageKey,
    download: download, exportJson: exportJson, importJson: importJson };
})(window);
