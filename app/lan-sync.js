/* Phone-to-phone sync over Wi-Fi / hotspot. No internet, no server.
 * - Records are merged one by one (newest edit wins, deletions are remembered).
 * - Everything sent between phones is AES-GCM encrypted with a key made from the pairing code.
 * - Needs the native "LanSync" plugin (Android). In a normal browser it stays switched off.
 */
(function () {
  'use strict';
  var PORT = 48765;
  var CFG_KEY = 'mbm:sync';          // {enabled, code, peer}
  var LAST_KEY = 'mbm:syncLast';
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike characters
  var TOMB_MAX_AGE_DAYS = 400;

  /* ------------------------------------------------------------ pure merge logic */
  function maxStr(a, b) { return (a || '') >= (b || '') ? (a || '') : (b || ''); }

  function mergeKind(localList, remoteList, localDel, remoteDel, norm) {
    var byId = {}, i, id;
    function consider(rec) {
      if (!rec || !rec.id) return;
      var n = norm ? norm(rec) : rec;
      if (!n) return;
      var cur = byId[n.id];
      if (!cur || (n.updatedAt || '') > (cur.updatedAt || '')) byId[n.id] = n;
    }
    // local first, so a tie keeps the local copy
    for (i = 0; i < localList.length; i++) consider(localList[i]);
    for (i = 0; i < remoteList.length; i++) consider(remoteList[i]);
    var tombs = {};
    Object.keys(localDel || {}).forEach(function (k) { tombs[k] = maxStr(tombs[k], localDel[k]); });
    Object.keys(remoteDel || {}).forEach(function (k) { tombs[k] = maxStr(tombs[k], remoteDel[k]); });
    var out = [];
    Object.keys(byId).forEach(function (k) {
      var rec = byId[k];
      if (tombs[k] && tombs[k] >= (rec.updatedAt || '')) return; // deleted after its last edit
      delete tombs[k];                                           // edited after delete: record wins
      out.push(rec);
    });
    var cutoff = new Date(Date.now() - TOMB_MAX_AGE_DAYS * 864e5).toISOString();
    Object.keys(tombs).forEach(function (k) { if (tombs[k] < cutoff) delete tombs[k]; });
    return { list: out, tombs: tombs };
  }

  function numPart(n) { var m = /(\d+)\s*$/.exec(String(n || '')); return m ? parseInt(m[1], 10) : 0; }

  // Two phones may both have created the same quotation number while apart.
  // The older record keeps its number; the newer one gets the next free number.
  function dedupeQuoteNumbers(quotes, formatNumber) {
    var seen = {}, renumbered = [];
    var sorted = quotes.slice().sort(function (a, b) {
      return (a.createdAt || '') < (b.createdAt || '') ? -1 : (a.createdAt || '') > (b.createdAt || '') ? 1 : (a.id < b.id ? -1 : 1);
    });
    var max = 0;
    sorted.forEach(function (q) { max = Math.max(max, numPart(q.number)); });
    sorted.forEach(function (q) {
      if (!seen[q.number]) { seen[q.number] = true; return; }
      max += 1;
      var to = formatNumber(max), from = q.number;
      q.number = to; q.updatedAt = new Date().toISOString();
      seen[to] = true;
      renumbered.push({ id: q.id, from: from, to: to });
    });
    return renumbered;
  }

  function merge(local, remote, L) {
    remote = remote || {};
    var rq = mergeKind(local.quotations, remote.quotations || [], (local.deleted || {}).q, (remote.deleted || {}).q, L.normQuote);
    var rp = mergeKind(local.pos, remote.pos || [], (local.deleted || {}).p, (remote.deleted || {}).p, L.normPO);
    var renumbered = dedupeQuoteNumbers(rq.list, L.formatQuoteNumber);
    var settings = local.settings, settingsAt = local.settingsAt || '';
    var rs = remote.settings ? L.normSettings(remote.settings) : null;
    if (rs && (remote.settingsAt || '') > settingsAt) { settings = rs; settingsAt = remote.settingsAt; }
    settings = Object.assign({}, settings);
    settings.quoteCounter = Math.max(
      Number(local.settings.quoteCounter) || 0, rs ? Number(rs.quoteCounter) || 0 : 0,
      rq.list.reduce(function (m, q) { return Math.max(m, numPart(q.number)); }, 0));
    return { quotations: rq.list, pos: rp.list, deleted: { q: rq.tombs, p: rp.tombs }, settings: settings, settingsAt: settingsAt, renumbered: renumbered };
  }
  window.MBM_SYNC_MERGE = merge; // exposed for testing

  /* ------------------------------------------------------------ crypto */
  var keyCache = { code: null, aes: null, tag: null };
  function b64(bytes) { var s = '', i; for (i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(str) { var s = atob(str), a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function hex(bytes) { return Array.prototype.map.call(bytes, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  async function keysFor(code) {
    if (keyCache.code === code) return keyCache;
    var enc = new TextEncoder();
    var base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
    var bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('mbm-sync-v1'), iterations: 100000, hash: 'SHA-256' }, base, 512));
    var aes = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    var tag = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(32))).slice(0, 8));
    keyCache = { code: code, aes: aes, tag: tag };
    return keyCache;
  }
  async function encrypt(code, obj) {
    var k = await keysFor(code), iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k.aes, new TextEncoder().encode(JSON.stringify(obj))));
    var all = new Uint8Array(12 + ct.length); all.set(iv, 0); all.set(ct, 12);
    return b64(all);
  }
  async function decrypt(code, text) {
    var k = await keysFor(code), all = unb64(text);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, k.aes, all.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  function newCode() {
    var a = crypto.getRandomValues(new Uint8Array(8)), s = '', i;
    for (i = 0; i < 8; i++) { s += ALPHABET[a[i] % ALPHABET.length]; if (i === 3) s += '-'; }
    return s;
  }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.*)$/, '$1-$2'); }

  /* ------------------------------------------------------------ app glue */
  var plugin = window.__MBM_LANSYNC_OVERRIDE || null;
  try { if (!plugin && window.Capacitor && window.Capacitor.registerPlugin) plugin = window.Capacitor.registerPlugin('LanSync'); } catch (e) { plugin = null; }
  var isNative = !!plugin && (window.__MBM_LANSYNC_OVERRIDE || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));

  var state = { status: 'off', detail: '', peer: '', last: '', ips: [], busy: false, applying: false };
  var timers = { debounce: null, poll: null };

  function cfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } }
  function saveCfg(c) { try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) {} }
  function app() { return window.MBM_APP; }
  function L() { return window.MBM; }
  function nowTime() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

  function readTombs() {
    var q = {}, p = {}, i, k;
    for (i = 0; i < localStorage.length; i++) {
      k = localStorage.key(i);
      if (k.indexOf('mbm:del:q:') === 0) q[k.slice(10)] = localStorage.getItem(k);
      else if (k.indexOf('mbm:del:p:') === 0) p[k.slice(10)] = localStorage.getItem(k);
    }
    return { q: q, p: p };
  }
  function buildSnapshot() {
    var A = app();
    return { v: 1, at: new Date().toISOString(), quotations: A.S.quotes, pos: A.S.pos, settings: A.S.settings,
      settingsAt: localStorage.getItem('mbm:settingsAt') || '', deleted: readTombs() };
  }

  function setStatus(s, detail) { state.status = s; state.detail = detail || ''; paint(); }

  async function pushStateToNative() {
    var c = cfg(); if (!c.code || !isNative) return;
    var k = await keysFor(c.code);
    await plugin.setState({ tag: k.tag, snapshot: await encrypt(c.code, buildSnapshot()) });
  }

  var VIEWS_SAFE_TO_REDRAW = { dashboard: 1, quoteList: 1, poList: 1, reminders: 1, quoteDetail: 1, poDetail: 1 };

  async function applyMerged(remote) {
    var A = app(), lib = L(), S = A.S, Store = A.Store;
    var local = { quotations: S.quotes, pos: S.pos, settings: S.settings, settingsAt: localStorage.getItem('mbm:settingsAt') || '', deleted: readTombs() };
    var m = merge(local, remote, lib), changed = 0, i;
    var localQ = {}, localP = {};
    S.quotes.forEach(function (x) { localQ[x.id] = x; });
    S.pos.forEach(function (x) { localP[x.id] = x; });
    state.applying = true;
    try {
      for (i = 0; i < m.quotations.length; i++) {
        var q = m.quotations[i], lq = localQ[q.id];
        if (!lq || JSON.stringify(lq) !== JSON.stringify(q)) { await Store.save('quotations', q); changed++; }
      }
      for (i = 0; i < m.pos.length; i++) {
        var p = m.pos[i], lp = localP[p.id];
        if (!lp || JSON.stringify(lp) !== JSON.stringify(p)) { await Store.save('pos', p); changed++; }
      }
      var keepQ = {}, keepP = {};
      m.quotations.forEach(function (x) { keepQ[x.id] = 1; });
      m.pos.forEach(function (x) { keepP[x.id] = 1; });
      for (var id in localQ) if (!keepQ[id]) { await Store.remove('quotations', id, (m.deleted.q[id] || new Date().toISOString())); changed++; }
      for (var id2 in localP) if (!keepP[id2]) { await Store.remove('pos', id2, (m.deleted.p[id2] || new Date().toISOString())); changed++; }
      ['q', 'p'].forEach(function (kind) {   // remember deletions we never had a record for, so they travel onward
        Object.keys(m.deleted[kind]).forEach(function (k) { try { localStorage.setItem('mbm:del:' + kind + ':' + k, m.deleted[kind][k]); } catch (e) {} });
      });
      if (JSON.stringify(m.settings) !== JSON.stringify(S.settings)) {
        await Store.saveSettings(m.settings, m.settingsAt || undefined); changed++;
      }
      S.quotes = m.quotations.slice(); S.pos = m.pos.slice(); S.settings = m.settings;
    } finally { state.applying = false; }
    if (m.renumbered.length && A.toast) A.toast('Quotation number clash fixed: ' + m.renumbered.map(function (r) { return r.from + ' → ' + r.to; }).join(', ') + '.');
    if (changed && A.render && VIEWS_SAFE_TO_REDRAW[S.view.name]) A.render();
    return { changed: changed, renumbered: m.renumbered.length };
  }

  async function findPeer(c) {
    var k = await keysFor(c.code), hosts, i;
    var candidates = [];
    if (c.manualPeer) candidates.push(c.manualPeer);
    if (c.peer && candidates.indexOf(c.peer) < 0) candidates.push(c.peer);
    for (i = 0; i < candidates.length; i++) {
      try {
        var r = await plugin.request({ host: candidates[i], port: PORT, cmd: 'HELLO', timeoutMs: 1500 });
        if (r.status === 200 && r.body === k.tag) return candidates[i];
      } catch (e) {}
    }
    setStatus('searching', 'Looking for the other device on this network…');
    try { hosts = (await plugin.scan({ port: PORT, tag: k.tag })).hosts || []; } catch (e) { hosts = []; }
    return hosts[0] || '';
  }

  async function syncNow(manual) {
    var c = cfg();
    if (!isNative || !c.enabled || !c.code || state.busy || !app() || !L()) return;
    if (document.hidden && !manual && !window.MBM_DESKTOP) return;   // the Windows app keeps syncing from the system tray
    state.busy = true;
    try {
      await ensureListener(c);
      var peer = await findPeer(c);
      if (!peer) {
        setStatus('searching', state.ips && state.ips.length
          ? 'Other device not found yet. Open the app on both devices, on the same Wi-Fi or hotspot (this computer: ' + state.ips.join(', ') + ').'
          : 'This computer is not on a Wi-Fi or office network. Connect both devices to the same Wi-Fi, or turn on the hotspot on a phone and connect this computer to it.');
        state.misses = (state.misses || 0) + 1;                       // look again soon, then less often
        schedule(Math.min(60000, 8000 + state.misses * 6000));
        return;
      }
      state.misses = 0;
      if (peer !== c.peer) { c.peer = peer; saveCfg(c); }
      state.peer = peer;
      var got = await plugin.request({ host: peer, port: PORT, cmd: 'GET', timeoutMs: 8000 });
      var res = { changed: 0 };
      if (got.status === 200 && got.body) res = await applyMerged(await decrypt(c.code, got.body));
      var snap = await encrypt(c.code, buildSnapshot());
      await plugin.setState({ tag: (await keysFor(c.code)).tag, snapshot: snap });
      await plugin.request({ host: peer, port: PORT, cmd: 'PUSH', body: snap, timeoutMs: 10000 });
      state.last = nowTime(); try { localStorage.setItem(LAST_KEY, state.last); } catch (e) {}
      setStatus('ok', res.changed ? 'Synced ' + res.changed + ' change' + (res.changed === 1 ? '' : 's') + ' from the other device.' : 'Both devices are up to date.');
    } catch (e) {
      var msg = String((e && e.message) || e);
      setStatus('error', /decrypt|operation/i.test(msg) ? 'The pairing code does not match the other device.' : 'Sync stopped: ' + msg);
    } finally { state.busy = false; }
  }

  var listening = false;
  async function ensureListener(c) {
    var k = await keysFor(c.code);
    var r = await plugin.start({ port: PORT, tag: k.tag });
    state.ips = r.ips || [];
    if (!listening) {
      listening = true;
      plugin.addListener('peerPush', async function (ev) {
        try {
          var cc = cfg(); if (!cc.enabled || !cc.code) return;
          var res = await applyMerged(await decrypt(cc.code, ev.body));
          if (ev.from && ev.from !== cc.peer) { cc.peer = ev.from; saveCfg(cc); }
          state.last = nowTime(); try { localStorage.setItem(LAST_KEY, state.last); } catch (e) {}
          setStatus('ok', res.changed ? 'Received ' + res.changed + ' change' + (res.changed === 1 ? '' : 's') + ' from the other device.' : 'Both devices are up to date.');
          pushStateToNative();
        } catch (e) { /* wrong code or damaged message: ignore */ }
      });
    }
  }

  function schedule(ms) { clearTimeout(timers.debounce); timers.debounce = setTimeout(function () { syncNow(false); }, ms); }

  window.addEventListener('mbm-data-changed', function () {
    if (state.applying) return;
    var c = cfg(); if (!c.enabled) return;
    setTimeout(function () { pushStateToNative().catch(function () {}); }, 400); // after the app has updated its own lists
    schedule(1500);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(800); });

  function startEngine() {
    var c = cfg();
    clearInterval(timers.poll);
    if (!isNative || !c.enabled || !c.code) { setStatus('off'); return; }
    setStatus('searching', 'Starting…');
    schedule(2500);
    timers.poll = setInterval(function () { syncNow(false); }, 60000);
  }

  /* ------------------------------------------------------------ interface */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function panelHtml() {
    var c = cfg(), h = '<div class="fieldset sync-box"><h2>Sync with another phone or computer</h2>';
    if (!isNative) return h + '<p class="muted">Sync works in the installed app only.</p></div>';
    h += '<p class="muted">Keep this computer and your phones in step over Wi-Fi. No internet needed: all devices just have to be on the same Wi-Fi, or a phone can share its hotspot with this computer. Keep the app running on both and changes copy across by themselves.</p>';
    if (c.enabled && c.code) {
      var cls = state.status === 'ok' ? 'ok' : state.status === 'error' ? 'bad' : 'wait';
      h += '<div class="sync-status ' + cls + '"><b>' + (state.status === 'ok' ? 'Connected' : state.status === 'error' ? 'Problem' : 'Searching') + '</b><span>' + esc(state.detail || '') + '</span>' +
        (state.last ? '<small>Last sync ' + esc(state.last) + (state.peer ? ' · other device ' + esc(state.peer) : '') + '</small>' : '') + '</div>';
      h += '<div class="field"><span class="lbl">Pairing code</span><div class="sync-code mono">' + esc(c.code) + '</div><span class="hint">Type this same code on the other device.</span></div>';
      h += '<div class="field"><label for="sync-manual">Other device’s address (only if it is not found by itself)</label><input id="sync-manual" type="text" inputmode="decimal" placeholder="e.g. 192.168.1.23" value="' + esc(c.manualPeer || '') + '"><span class="hint">This computer: ' + esc((state.ips || []).join(', ') || 'not on Wi-Fi') + '</span></div>';
      h += '<div class="btn-row"><button type="button" class="btn" data-sync="now">Sync now</button><button type="button" class="btn btn-secondary" data-sync="saveaddr">Save address</button><button type="button" class="btn btn-danger" data-sync="off">Turn off sync</button></div>';
    } else {
      h += '<div class="field"><label for="sync-code">Pairing code</label><input id="sync-code" type="text" autocapitalize="characters" autocomplete="off" placeholder="XXXX-XXXX" value="' + esc(c.code || '') + '"><span class="hint">First device: click “Make a code”. Second device: type the code shown on the first one.</span></div>';
      h += '<div class="btn-row"><button type="button" class="btn btn-secondary" data-sync="make">Make a code</button><button type="button" class="btn" data-sync="on">Turn on sync</button></div>';
    }
    return h + '</div>';
  }
  function paint() {
    var host = document.getElementById('sync-panel');
    // Redraw the panel unless the person is typing in one of its text boxes. A tapped button keeps focus,
    // so it must not block the redraw (that left the panel stuck on the setup form after "Turn on sync").
    var ae = document.activeElement, typing = ae && host && host.contains(ae) && /^(INPUT|TEXTAREA)$/.test(ae.tagName);
    if (host && !typing) host.innerHTML = panelHtml();
    var chip = document.getElementById('sync-chip');
    var m = document.querySelector('.masthead');
    var c = cfg();
    if (m && c.enabled && isNative) {
      if (!chip) { chip = document.createElement('div'); chip.id = 'sync-chip'; chip.className = 'sync-chip'; m.appendChild(chip); }
      chip.className = 'sync-chip ' + (state.status === 'ok' ? 'ok' : state.status === 'error' ? 'bad' : 'wait');
      chip.textContent = state.status === 'ok' ? 'Devices in sync · ' + state.last : state.status === 'error' ? 'Sync problem · open Settings' : 'Looking for the other device…';
    } else if (chip) chip.remove();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-sync]'); if (!b) return;
    var act = b.getAttribute('data-sync'), c = cfg(), input = document.getElementById('sync-code');
    if (act === 'make') { if (input) input.value = newCode(); return; }
    if (act === 'on') {
      var code = cleanCode(input && input.value);
      if (code.replace('-', '').length < 8) { var A = app(); if (A && A.toast) A.toast('Enter the 8-character pairing code.', 'err'); return; }
      saveCfg({ enabled: true, code: code, peer: '', manualPeer: '' }); keyCache = { code: null }; startEngine(); paint(); return;
    }
    if (act === 'off') { saveCfg({ enabled: false, code: '', peer: '', manualPeer: '' }); clearInterval(timers.poll); try { plugin.stop(); } catch (e2) {} listening = false; setStatus('off'); return; }
    if (act === 'saveaddr') { var m = document.getElementById('sync-manual'); c.manualPeer = (m && m.value || '').trim(); saveCfg(c); syncNow(true); return; }
    if (act === 'now') { setStatus('searching', 'Syncing…'); syncNow(true); }
  });

  new MutationObserver(function () {
    if (document.getElementById('sync-panel') && !document.getElementById('sync-panel').firstChild) paint();
    else if (document.querySelector('.masthead') && !document.getElementById('sync-chip')) paint();
  }).observe(document.documentElement, { childList: true, subtree: true });

  state.last = (function () { try { return localStorage.getItem(LAST_KEY) || ''; } catch (e) { return ''; } })();
  var boot = setInterval(function () { if (window.MBM_APP && window.MBM) { clearInterval(boot); startEngine(); } }, 300);
  window.MBM_SYNC = { syncNow: syncNow, state: state };
})();
