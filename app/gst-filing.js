/* GST Filing: monthly sales (B2B) and purchase (inward supply) invoice registers.
 * Enter invoices one by one, then download the month as PDF, Excel or portal-style CSV in the Spark Tech format. */
(function () {
  'use strict';
  var A = window.MBM_APP, K0 = window.MBM_REPORT && window.MBM_REPORT.kit;
  if (!A || !A.SCREENS || !K0) return;
  var S = A.S, SCREENS = A.SCREENS, ACTIONS = A.ACTIONS, AFTER = A.AFTER, esc = A.esc, toast = A.toast, plural = A.plural, shell = A.shell;
  var KEY = 'mbm:gst:', PKEY = 'mbm:gstp';
  var STATES = { '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory' };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var RATES = [0, 0.25, 3, 5, 12, 18, 28];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 ? d : null; }
  function dmy(s, sep) { var d = parseYmd(s); return d ? pad(d.getDate()) + (sep || '/') + pad(d.getMonth() + 1) + (sep || '/') + d.getFullYear() : ''; }
  function parseDateInput(t) {
    t = String(t || '').trim(); if (!t) return '';
    var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/.exec(t), y, mo, d;
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else { m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t); if (!m) return ''; y = +m[1]; mo = +m[2]; d = +m[3]; }
    var dt = new Date(y, mo - 1, d); if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || y < 2017 || y > 2100) return '';
    return ymd(dt);
  }
  function mkey(y, m) { return y + '-' + pad(m + 1); }
  function ymOf(dateStr) { return (dateStr || '').slice(0, 7); }
  function r2(n) { return Math.round((Number(n) + 1e-9) * 100) / 100; }
  function num(v) { var n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : NaN; }
  function money(n) { return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0); }
  function uid() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function changed() { try { window.dispatchEvent(new Event('mbm-data-changed')); } catch (e) { /* ignore */ } }

  /* ---------------------------------------------------------------- data */
  var G = { recs: [], prefs: { gstin: '27EFDPP0716L1Z9', company: 'Spark Tech Automation' } };
  function load() {
    G.recs = [];
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(KEY) === 0) { try { var v = JSON.parse(localStorage.getItem(k)); if (v && v.id && v.kind) G.recs.push(v); } catch (e) { /* skip */ } } }
    try { G.prefs = Object.assign(G.prefs, JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) { /* defaults */ }
  }
  function put(r) { try { localStorage.setItem(KEY + r.id, JSON.stringify(r)); } catch (e) { toast('Could not save: ' + (e && e.message || e), 'err'); return false; } changed(); return true; }
  function drop(id) { try { localStorage.removeItem(KEY + id); } catch (e) { /* ignore */ } changed(); }
  function savePrefs() { try { localStorage.setItem(PKEY, JSON.stringify(G.prefs)); } catch (e) { /* ignore */ } changed(); }
  load();
  function ownState() { return String(G.prefs.gstin || '').slice(0, 2); }
  function posLabel(code, withCode) { var n = STATES[code] || code || ''; return withCode ? code + '-' + n : n; }
  function isGstin(g) { return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g); }
  function taxSplit(kind, taxable, rate, gstin, pos) {
    var intra = kind === 'sale' ? (pos === ownState()) : (String(gstin).slice(0, 2) === pos);
    if (intra) { var h = r2(taxable * rate / 200); return { igst: 0, cgst: h, sgst: h }; }
    return { igst: r2(taxable * rate / 100), cgst: 0, sgst: 0 };
  }
  function monthRecs(kind, ym) {
    return G.recs.filter(function (r) { return r.kind === kind && (r.rm || ymOf(r.date)) === ym; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || String(a.no).localeCompare(String(b.no), undefined, { numeric: true }); });
  }
  function totals(list) { var t = { n: list.length, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 }; list.forEach(function (r) { t.taxable += r.taxable; t.igst += r.igst; t.cgst += r.cgst; t.sgst += r.sgst; t.cess += r.cess || 0; t.total += r.total; }); Object.keys(t).forEach(function (k) { if (k !== 'n') t[k] = r2(t[k]); }); return t; }

  /* ---------------------------------------------------------------- checks */
  function checks(kind, ym) {
    var list = monthRecs(kind, ym), out = [], seen = {};
    list.forEach(function (r) {
      var key = (r.gstin + '|' + r.no).toLowerCase();
      if (seen[key]) out.push('Duplicate invoice: ' + r.no + ' for ' + r.party + ' appears more than once.'); seen[key] = 1;
      if (!isGstin(r.gstin)) out.push('GSTIN of ' + r.party + ' (invoice ' + r.no + ') does not look valid: ' + r.gstin + '.');
      if (Math.abs(r.taxable + r.igst + r.cgst + r.sgst + (r.cess || 0) - r.total) > 1) out.push('Invoice ' + r.no + ': total ' + money(r.total) + ' differs from taxable value plus tax by more than ₹1.');
    });
    if (kind === 'sale') {   // missing numbers in a running invoice series
      var groups = {};
      list.forEach(function (r) { var m = /^(.*?)(\d+)$/.exec(String(r.no).trim()); if (m) { (groups[m[1]] = groups[m[1]] || []).push(+m[2]); } });
      Object.keys(groups).forEach(function (pre) {
        var all = {}; G.recs.forEach(function (r) { if (r.kind !== 'sale') return; var m = /^(.*?)(\d+)$/.exec(String(r.no).trim()); if (m && m[1] === pre) all[+m[2]] = 1; });
        var lo = Math.min.apply(null, groups[pre]), hi = Math.max.apply(null, groups[pre]), miss = [];
        for (var n = lo; n <= hi; n++) if (!all[n]) miss.push(pre + n);
        if (miss.length) out.push('Missing invoice number' + (miss.length > 1 ? 's' : '') + ' in the series: ' + miss.join(', ') + '.');
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- screen */
  var GS = { kind: 'sale', ym: mkey(new Date().getFullYear(), new Date().getMonth()), edit: null, totalManual: false };
  var TITLE = { sale: 'Sales Invoices (B2B)', purchase: 'Purchase Invoices (Inward)' };
  function nextInvoiceNo() {
    var list = G.recs.filter(function (r) { return r.kind === 'sale'; }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || String(b.no).localeCompare(String(a.no), undefined, { numeric: true }); });
    for (var i = 0; i < list.length; i++) { var m = /^(.*?)(\d+)$/.exec(String(list[i].no).trim()); if (m) { var nx = String(+m[2] + 1); while (nx.length < m[2].length) nx = '0' + nx; return m[1] + nx; } }
    return '';
  }
  function partyList(kind) { var seen = {}, out = []; G.recs.forEach(function (r) { if (r.kind === kind && r.party && !seen[r.gstin]) { seen[r.gstin] = 1; out.push({ name: r.party, gstin: r.gstin }); } }); return out.sort(function (a, b) { return a.name.localeCompare(b.name); }); }
  function stateOptions(sel) { return Object.keys(STATES).map(function (c) { return '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + c + '-' + esc(STATES[c]) + '</option>'; }).join(''); }
  function monthOptions(sel) {
    var out = '', d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
    for (var i = 0; i < 26; i++) { var k = mkey(d.getFullYear(), d.getMonth()); out += '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + '</option>'; d.setMonth(d.getMonth() - 1); }
    return out;
  }
  function formHtml() {
    var kind = GS.kind, e = GS.edit ? G.recs.filter(function (r) { return r.id === GS.edit; })[0] : null;
    var sale = kind === 'sale', v = e || { date: GS.lastDate || '', no: sale ? nextInvoiceNo() : '', party: '', gstin: '', pos: sale ? '27' : ownState(), hsn: '', taxable: '', rate: GS.lastRate !== undefined ? GS.lastRate : 18, total: '', igst: 0, cgst: 0, sgst: 0, cess: '', rm: GS.ym };
    var noun = sale ? 'Customer' : 'Supplier';
    return '<div class="fieldset" id="gst-form"><h2>' + (e ? 'Edit invoice' : 'Add ' + (sale ? 'sales' : 'purchase') + ' invoice') + '</h2>' +
      '<datalist id="dl-g-party">' + partyList(kind).map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('') + '</datalist>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="g-date">Invoice date *</label><input id="g-date" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" value="' + esc(v.date ? dmy(v.date) : '') + '" autocomplete="off"></div>' +
      '<div class="field"><label for="g-no">Invoice no *</label><input id="g-no" type="text" value="' + esc(v.no) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="g-party">' + noun + ' name</label><input id="g-party" type="text" list="dl-g-party" value="' + esc(v.party) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="g-gstin">' + noun + ' GSTIN *</label><input id="g-gstin" type="text" maxlength="15" value="' + esc(v.gstin) + '" autocomplete="off" style="text-transform:uppercase"></div>' +
      '<div class="field"><label for="g-pos">Place of supply *</label><select id="g-pos">' + stateOptions(v.pos) + '</select></div>' +
      (sale ? '<div class="field"><label for="g-hsn">HSN code</label><input id="g-hsn" type="text" inputmode="numeric" value="' + esc(v.hsn) + '" autocomplete="off"></div>' : '') +
      '<div class="field"><label for="g-taxable">Taxable value *</label><input id="g-taxable" type="text" inputmode="decimal" value="' + esc(v.taxable === '' ? '' : v.taxable) + '" autocomplete="off"></div>' +
      '<div class="field"><label for="g-rate">GST rate % *</label><select id="g-rate">' + RATES.map(function (x) { return '<option value="' + x + '"' + (+v.rate === x ? ' selected' : '') + '>' + x + '%</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="g-cgst">CGST</label><input id="g-cgst" type="text" readonly value="' + (v.cgst || 0).toFixed(2) + '"></div>' +
      '<div class="field"><label for="g-sgst">SGST / UT</label><input id="g-sgst" type="text" readonly value="' + (v.sgst || 0).toFixed(2) + '"></div>' +
      '<div class="field"><label for="g-igst">IGST</label><input id="g-igst" type="text" readonly value="' + (v.igst || 0).toFixed(2) + '"></div>' +
      '<div class="field"><label for="g-cess">Cess (optional)</label><input id="g-cess" type="text" inputmode="decimal" value="' + esc(v.cess === '' || !v.cess ? '' : v.cess) + '"></div>' +
      '<div class="field"><label for="g-total">Total invoice value *</label><input id="g-total" type="text" inputmode="decimal" value="' + esc(v.total === '' ? '' : v.total) + '" autocomplete="off"><span class="hint">Worked out for you. Type your own figure if the invoice is rounded.</span></div>' +
      '<div class="field"><label for="g-rm">Include in return of</label><select id="g-rm">' + monthOptions(v.rm || GS.ym) + '</select></div></div>' +
      '<div class="btn-row"><button type="button" class="btn" data-act="gstSave">' + (e ? 'Save changes' : 'Save invoice') + '</button>' +
      (e ? '<button type="button" class="btn btn-secondary" data-act="gstCancel">Cancel</button>' : '<button type="button" class="btn btn-secondary" data-act="gstClear">Clear form</button>') + '</div></div>';
  }
  function listHtml(list, t) {
    var sale = GS.kind === 'sale';
    if (!list.length) return '<div class="empty"><strong>No ' + (sale ? 'sales' : 'purchase') + ' invoices saved for ' + esc(monthName(GS.ym)) + '</strong><p>Fill the form above and press Save invoice. Each month has its own list.</p></div>';
    var rows = list.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(dmy(r.date)) + '</td><td class="l"><b>' + esc(r.no) + '</b></td><td class="l">' + esc(r.party) + '</td><td class="l mono">' + esc(r.gstin) + '</td><td class="l">' + esc(posLabel(r.pos, true)) + '</td>' + (sale ? '<td>' + esc(r.hsn) + '</td>' : '') +
        '<td>' + money(r.taxable) + '</td><td>' + r.rate + '%</td><td>' + money(r.cgst) + '</td><td>' + money(r.sgst) + '</td><td>' + money(r.igst) + '</td><td><b>' + money(r.total) + '</b></td>' +
        '<td class="act"><button type="button" class="btn btn-secondary btn-sm" data-act="gstEdit" data-id="' + esc(r.id) + '">Edit</button><button type="button" class="btn btn-secondary btn-sm" data-act="gstDelete" data-id="' + esc(r.id) + '" aria-label="Delete invoice ' + esc(r.no) + '">✕</button></td></tr>';
    }).join('');
    return '<div class="o-scroll"><table class="o-gst"><thead><tr><th>#</th><th>Date</th><th class="l">Invoice no</th><th class="l">' + (sale ? 'Customer' : 'Supplier') + '</th><th class="l">GSTIN</th><th class="l">Place of supply</th>' + (sale ? '<th>HSN</th>' : '') + '<th>Taxable value</th><th>Rate</th><th>CGST</th><th>SGST/UT</th><th>IGST</th><th>Total</th><th></th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td colspan="' + (sale ? 7 : 6) + '" class="l">TOTAL · ' + plural(t.n, 'invoice') + '</td><td>' + money(t.taxable) + '</td><td></td><td>' + money(t.cgst) + '</td><td>' + money(t.sgst) + '</td><td>' + money(t.igst) + '</td><td>' + money(t.total) + '</td><td></td></tr></tfoot></table></div>';
  }
  function monthName(ym) { var m = /^(\d{4})-(\d{2})$/.exec(ym); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : ym; }
  SCREENS.gst = function (p) {
    p = p || {}; if (p.kind) { GS.kind = p.kind; delete p.kind; } if (p.ym) { GS.ym = p.ym; delete p.ym; }   // read once, so month buttons keep working
    var kind = GS.kind, list = monthRecs(kind, GS.ym), t = totals(list), warn = checks(kind, GS.ym), mm = /^(\d{4})-(\d{2})$/.exec(GS.ym), y = +mm[1], m = +mm[2] - 1;
    var tabs = ['sale', 'purchase'].map(function (k) { var c = monthRecs(k, GS.ym).length; return '<button type="button" class="gst-tab' + (k === kind ? ' on' : '') + '" role="tab" aria-selected="' + (k === kind) + '" data-act="gstTab" data-kind="' + k + '">' + esc(TITLE[k]) + '<span>' + c + '</span></button>'; }).join('');
    var yearOpts = ''; for (var yy = y - 4; yy <= y + 1; yy++) yearOpts += '<option value="' + yy + '"' + (yy === y ? ' selected' : '') + '>' + yy + '</option>';
    var monthOpts = MONTHS.map(function (n, i) { return '<option value="' + i + '"' + (i === m ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    var kp = function (l, v2) { return '<div class="gst-k"><span>' + l + '</span><b>' + v2 + '</b></div>'; };
    var dl = function (fmt, label, cls) { return '<button type="button" class="btn ' + (cls || 'btn-secondary') + '" data-act="gstDl" data-fmt="' + fmt + '">' + label + '</button>'; };
    return shell('GST Filing',
      '<div class="gst-tabs" role="tablist">' + tabs + '</div>' +
      '<div class="o-day"><button type="button" class="btn btn-secondary" data-act="gstMonth" data-delta="-1">‹ Previous</button><select id="g-m" aria-label="Month" style="max-width:170px">' + monthOpts + '</select><select id="g-y" aria-label="Year" style="max-width:110px">' + yearOpts + '</select>' +
      '<button type="button" class="btn btn-secondary" data-act="gstMonth" data-delta="1">Next ›</button><button type="button" class="btn btn-secondary" data-act="gstMonth" data-delta="0">This month</button></div>' +
      '<div class="gst-kpis">' + kp('Invoices', t.n) + kp('Taxable value', '₹ ' + money(t.taxable)) + kp('CGST', '₹ ' + money(t.cgst)) + kp('SGST / UT', '₹ ' + money(t.sgst)) + kp('IGST', '₹ ' + money(t.igst)) + kp('Total invoice value', '₹ ' + money(t.total)) + '</div>' +
      formHtml() +
      '<div class="fieldset"><h2>' + esc(TITLE[kind]) + ' · ' + esc(monthName(GS.ym)) + '</h2>' + listHtml(list, t) +
      '<div class="btn-row">' + dl('pdf', 'Download PDF', 'btn') + dl('xlsx', 'Download Excel') + dl('csv', 'Download CSV (GST portal format)') + '</div></div>' +
      (warn.length ? '<div class="note warn" role="alert"><b>Please check before filing</b><ul class="gst-warn">' + warn.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : (list.length ? '<div class="note info">All checks passed for this month: no duplicates, no missing numbers, GSTINs look valid.</div>' : '')) +
      '<div class="fieldset"><h2>Your GST details</h2><div class="form-grid"><div class="field"><label for="g-own-name">Business name</label><input id="g-own-name" type="text" value="' + esc(G.prefs.company) + '"></div><div class="field"><label for="g-own-gstin">Your GSTIN</label><input id="g-own-gstin" type="text" maxlength="15" value="' + esc(G.prefs.gstin) + '" style="text-transform:uppercase"></div></div><p class="muted">The first two digits of your GSTIN decide whether tax is split into CGST and SGST (same state) or charged as IGST (other state).</p></div>',
      { sub: esc(G.prefs.company) + ' · GSTIN ' + esc(G.prefs.gstin) });
  };
  function widen() { var mn = document.querySelector('main.wrap'); if (mn) mn.style.maxWidth = '1360px'; }
  AFTER.gst = widen;
  A.TITLES.gst = 'GST Filing';

  /* ---------------------------------------------------------------- live form */
  function val(id) { var e = document.getElementById(id); return e ? e.value : ''; }
  function setv(id, v) { var e = document.getElementById(id); if (e) e.value = v; }
  function recalc(source) {
    var kind = GS.kind, rate = num(val('g-rate')), pos = val('g-pos'), gstin = val('g-gstin').toUpperCase();
    var taxable = num(val('g-taxable'));
    if (source === 'total') {
      var tot = num(val('g-total'));
      if (!(taxable >= 0) && tot >= 0) { taxable = r2(tot / (1 + rate / 100)); setv('g-taxable', taxable.toFixed(2)); }
      else { GS.totalManual = true; }
    }
    if (!(taxable >= 0)) { setv('g-cgst', '0.00'); setv('g-sgst', '0.00'); setv('g-igst', '0.00'); return; }
    var sp = taxSplit(kind, taxable, rate, gstin, pos), cess = num(val('g-cess')) || 0;
    setv('g-cgst', sp.cgst.toFixed(2)); setv('g-sgst', sp.sgst.toFixed(2)); setv('g-igst', sp.igst.toFixed(2));
    if (source !== 'total' || !GS.totalManual) { if (source !== 'total') GS.totalManual = false; if (!GS.totalManual) setv('g-total', r2(taxable + sp.cgst + sp.sgst + sp.igst + cess).toFixed(2)); }
  }
  document.addEventListener('input', function (e) {
    if (S.view.name !== 'gst') return; var id = e.target.id;
    if (id === 'g-taxable') { GS.totalManual = false; recalc('taxable'); }
    else if (id === 'g-total') recalc('total');
    else if (id === 'g-cess') { GS.totalManual = false; recalc('cess'); }
    else if (id === 'g-gstin') {
      var g = e.target.value.toUpperCase(); if (e.target.value !== g) e.target.value = g;
      if (GS.kind === 'sale' && g.length >= 2 && STATES[g.slice(0, 2)]) setv('g-pos', g.slice(0, 2));
      var known = partyList(GS.kind).filter(function (p) { return p.gstin === g; })[0]; if (known && !val('g-party').trim()) setv('g-party', known.name);
      recalc('gstin');
    }
  });
  document.addEventListener('change', function (e) {
    if (S.view.name !== 'gst') return; var id = e.target.id;
    if (id === 'g-rate' || id === 'g-pos') { GS.totalManual = false; recalc('rate'); }
    else if (id === 'g-party') { var nm = e.target.value.trim().toLowerCase(), k = partyList(GS.kind).filter(function (p) { return p.name.toLowerCase() === nm; })[0]; if (k && !val('g-gstin').trim()) { setv('g-gstin', k.gstin); if (GS.kind === 'sale') setv('g-pos', k.gstin.slice(0, 2)); recalc('gstin'); } }
    else if (id === 'g-date') { var iso = parseDateInput(e.target.value); if (iso) { e.target.value = dmy(iso); setv('g-rm', ymOf(iso)); } }
    else if (id === 'g-m' || id === 'g-y') { GS.ym = mkey(+val('g-y'), +val('g-m')); GS.edit = null; rerender(); }
    else if (id === 'g-own-name') { G.prefs.company = e.target.value.trim() || 'Spark Tech Automation'; savePrefs(); }
    else if (id === 'g-own-gstin') { var gg = e.target.value.trim().toUpperCase(); if (gg.length !== 15) { toast('A GSTIN has 15 characters.', 'err'); e.target.value = G.prefs.gstin; return; } G.prefs.gstin = gg; e.target.value = gg; savePrefs(); toast('Saved.'); }
  });
  function rerender() { var y = window.scrollY; A.render(); window.scrollTo(0, y); }

  /* ---------------------------------------------------------------- actions */
  ACTIONS.gstOpen = function () { GS.edit = null; A.go('gst', { kind: GS.kind, ym: GS.ym }); };
  ACTIONS.gstTab = function (el) { GS.kind = el.dataset.kind; GS.edit = null; GS.totalManual = false; rerender(); };
  ACTIONS.gstMonth = function (el) {
    var k = +el.dataset.delta, now = new Date(), mm = /^(\d{4})-(\d{2})$/.exec(GS.ym);
    var d = k === 0 ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(+mm[1], +mm[2] - 1 + k, 1);
    GS.ym = mkey(d.getFullYear(), d.getMonth()); GS.edit = null; rerender();
  };
  ACTIONS.gstClear = function () { GS.edit = null; GS.totalManual = false; rerender(); };
  ACTIONS.gstCancel = ACTIONS.gstClear;
  ACTIONS.gstEdit = function (el) { GS.edit = el.dataset.id; GS.totalManual = true; A.render(); var f = document.getElementById('gst-form'); if (f) f.scrollIntoView({ block: 'start' }); };
  ACTIONS.gstDelete = async function (el) {
    var r = G.recs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    var ok = await A.confirmDialog('Delete invoice ' + r.no + '?', '<p><b>' + esc(r.party) + '</b> · ₹ ' + money(r.total) + '</p><p>This cannot be undone.</p>', 'Delete invoice', true); if (!ok) return;
    drop(r.id); G.recs = G.recs.filter(function (x) { return x.id !== r.id; }); GS.edit = null; rerender(); toast('Invoice ' + r.no + ' deleted.');
  };
  ACTIONS.gstSave = function () {
    var kind = GS.kind, iso = parseDateInput(val('g-date')), no = val('g-no').trim(), gstin = val('g-gstin').trim().toUpperCase(), party = val('g-party').trim();
    var taxable = num(val('g-taxable')), total = num(val('g-total')), rate = num(val('g-rate')), pos = val('g-pos'), cess = num(val('g-cess')) || 0;
    var err = !iso ? 'Enter the invoice date as dd/mm/yyyy.' : !no ? 'Enter the invoice number.' : gstin.length !== 15 ? 'A GSTIN has 15 characters.' : !STATES[gstin.slice(0, 2)] ? 'The first two digits of the GSTIN are not a valid state code.' : !(taxable >= 0) ? 'Enter the taxable value.' : !(total >= 0) ? 'Enter the total invoice value.' : '';
    if (err) { toast(err, 'err'); return; }
    var dup = G.recs.filter(function (r) { return r.kind === kind && r.id !== GS.edit && r.gstin === gstin && String(r.no).toLowerCase() === no.toLowerCase(); })[0];
    if (dup) { toast('Invoice ' + no + ' for this GSTIN is already saved (' + dmy(dup.date) + ').', 'err'); return; }
    var sp = taxSplit(kind, taxable, rate, gstin, pos), now = new Date().toISOString(), old = GS.edit ? G.recs.filter(function (r) { return r.id === GS.edit; })[0] : null;
    var rec = { id: old ? old.id : uid(), kind: kind, date: iso, no: no, party: party, gstin: gstin, pos: pos, hsn: kind === 'sale' ? val('g-hsn').trim().replace(/^-+/, '') : '', taxable: r2(taxable), rate: rate, total: r2(total), igst: sp.igst, cgst: sp.cgst, sgst: sp.sgst, cess: r2(cess),
      itype: 'Regular', rcm: 'N', rm: val('g-rm') || ymOf(iso), createdAt: old ? old.createdAt : now, updatedAt: now };
    if (!put(rec)) return;
    if (old) G.recs = G.recs.map(function (r) { return r.id === rec.id ? rec : r; }); else G.recs.push(rec);
    GS.edit = null; GS.totalManual = false; GS.lastDate = dmy(iso); GS.lastRate = rate; GS.ym = rec.rm;
    A.render(); toast('Invoice ' + no + ' saved.'); var n = document.getElementById('g-no'); if (n) n.focus();
  };

  /* ---------------------------------------------------------------- downloads */
  function fileBase(kind, ym) { var m = /^(\d{4})-(\d{2})$/.exec(ym); return m[2] + (kind === 'sale' ? '_GSTR1_SALES_' : '_GSTR2_PURCHASE_') + MON3[+m[2] - 1] + '_' + m[1]; }
  function csvText(kind, list) {
    function c(v) { v = String(v === undefined || v === null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var sale = kind === 'sale', head, rows;
    if (sale) {
      head = ['Receiver Name (Optional)', 'Receiver GSTIN/UIN *', 'Place of Supply *', 'Invoice No *', 'Invoice Date *', 'HSN Code', 'Total Invoice Value *', 'Taxable Value *', 'Tax Rate *', 'IGST Amount', 'CGST Amount', 'SGST/UT Amount', 'Cess Amount', 'Invoice Type', 'Reverse Charge', 'Applicable % of Tax Rate', 'GSTIN of ECommerce Operator'];
      rows = list.map(function (r) { return [r.party, r.gstin, posLabel(r.pos, true), r.no, dmy(r.date, '-'), r.hsn, r.total.toFixed(2), r.taxable.toFixed(2), r.rate.toFixed(2), r.igst ? r.igst.toFixed(2) : '', r.cgst ? r.cgst.toFixed(2) : '', r.sgst ? r.sgst.toFixed(2) : '', r.cess ? r.cess.toFixed(2) : '', 'Regular', '', '', '']; });
    } else {
      head = ['Name of the Supplier (Optional)', 'Supplier GSTIN *', 'Place of Supply *', 'Invoice No *', 'Invoice Date *', 'Total Invoice Value *', 'Taxable Value *', 'GST Rate *', 'IGST Amount', 'CGST Amount', 'SGST/UT Amount', 'Cess Amount'];
      rows = list.map(function (r) { return [r.party, r.gstin, posLabel(r.pos, false), r.no, dmy(r.date, '-'), r.total.toFixed(2), r.taxable.toFixed(2), r.rate.toFixed(2), r.igst ? r.igst.toFixed(2) : '', r.cgst ? r.cgst.toFixed(2) : '', r.sgst ? r.sgst.toFixed(2) : '', r.cess ? r.cess.toFixed(2) : '']; });
    }
    return [head].concat(rows).map(function (r) { return r.map(c).join(','); }).join('\r\n');
  }
  /* PDF in the Spark Tech look */
  var OR = '#f3881e', BLK = '#121212', GREY = '#6b635a', LINE = '#e6dccd', TINT = '#fff1e0';
  async function pdfPages(kind, ym, list) {
    var K = K0, W = K.W, H = K.H, M = K.M, F = K.FONT, sale = kind === 'sale', t = totals(list), logo = await K.loadImg('./logo-dark.png'), pages = [];
    var cols = sale
      ? [['#', 20, 'c'], ['Date', 50, 'l'], ['Invoice No', 82, 'l'], ['Receiver', 128, 'l'], ['GSTIN', 92, 'l'], ['Place of Supply', 66, 'l'], ['HSN', 46, 'l'], ['Taxable Value', 62, 'r'], ['Rate', 28, 'r'], ['IGST', 46, 'r'], ['CGST', 52, 'r'], ['SGST/UT', 52, 'r'], ['Total Value', 62, 'r']]
      : [['#', 20, 'c'], ['Date', 50, 'l'], ['Invoice No', 88, 'l'], ['Supplier', 166, 'l'], ['GSTIN', 94, 'l'], ['Place of Supply', 56, 'l'], ['Taxable Value', 66, 'r'], ['Rate', 28, 'r'], ['IGST', 46, 'r'], ['CGST', 54, 'r'], ['SGST/UT', 54, 'r'], ['Total Value', 64, 'r']];
    var sum = cols.reduce(function (a, c) { return a + c[1]; }, 0), scale = (W - 2 * M) / sum; cols = cols.map(function (c) { return [c[0], c[1] * scale, c[2]]; });
    var pg = K.newPage(), ctx = pg.ctx, y; pages.push(pg);
    function head(first) {
      ctx.fillStyle = BLK; ctx.fillRect(0, 0, W, 8); ctx.fillStyle = OR; ctx.fillRect(0, 0, 150, 8);
      if (logo) { var lw = 112, lh = lw * logo.height / logo.width; ctx.drawImage(logo, W - M - lw, 18, lw, lh); }
      ctx.textAlign = 'left'; ctx.fillStyle = BLK; ctx.font = '800 19px ' + F; ctx.fillText(sale ? 'GSTR-1 · B2B INVOICES (SALES)' : 'GSTR-2 · INWARD SUPPLIES (PURCHASES)', M, 44);
      ctx.fillStyle = OR; ctx.fillRect(M, 52, 64, 4);
      if (!first) return 68;
      var items = [['Business:', G.prefs.company, M], ['GSTIN:', G.prefs.gstin, 300], ['Return period:', monthName(ym), 520]];
      items.forEach(function (it) { ctx.font = '700 9px ' + F; ctx.fillStyle = GREY; ctx.fillText(it[0], it[2], 78); var w = ctx.measureText(it[0]).width; ctx.font = '600 10.5px ' + F; ctx.fillStyle = BLK; ctx.fillText(it[1], it[2] + w + 6, 78); });
      return 88;
    }
    function thead(yy) {
      ctx.fillStyle = BLK; ctx.fillRect(M, yy, W - 2 * M, 20); ctx.fillStyle = OR; ctx.fillRect(M, yy + 20, W - 2 * M, 2);
      var x = M; ctx.font = '700 7.5px ' + F; ctx.fillStyle = '#fff';
      cols.forEach(function (c) { ctx.textAlign = c[2] === 'r' ? 'right' : c[2] === 'c' ? 'center' : 'left'; ctx.fillText(c[0], c[2] === 'r' ? x + c[1] - 4 : c[2] === 'c' ? x + c[1] / 2 : x + 4, yy + 13.5); x += c[1]; });
      ctx.textAlign = 'left'; return yy + 22;
    }
    y = head(true) + 4;
    var cards = [['INVOICES', String(t.n), TINT, BLK, BLK], ['TAXABLE VALUE', '₹ ' + money(t.taxable), BLK, '#fff', OR], ['CGST', '₹ ' + money(t.cgst), OR, '#1c0d00', BLK], ['SGST / UT', '₹ ' + money(t.sgst), OR, '#1c0d00', BLK], ['IGST', '₹ ' + money(t.igst), '#f3efe8', BLK, BLK], ['TOTAL INVOICE VALUE', '₹ ' + money(t.total), BLK, '#fff', OR]];
    var gap = 10, cw = (W - 2 * M - gap * 5) / 6;
    cards.forEach(function (c, i) { var x = M + i * (cw + gap); ctx.fillStyle = c[2]; K.rrect(ctx, x, y, cw, 50, 6); ctx.fill(); ctx.fillStyle = c[2] === BLK ? OR : c[2] === OR ? '#1c0d00' : GREY; ctx.font = '700 7.5px ' + F; ctx.textAlign = 'center'; ctx.fillText(c[0], x + cw / 2, y + 15); ctx.fillStyle = c[3]; K.fitFont(ctx, c[1], cw - 12, 15, '800'); ctx.fillText(c[1], x + cw / 2, y + 38); ctx.textAlign = 'left'; });
    y += 66; y = thead(y);
    var limit = H - 40;
    function ensure(h) { if (y + h <= limit) return; pg = K.newPage(); pages.push(pg); ctx = pg.ctx; y = head(false); y = thead(y + 4); }
    list.forEach(function (r, i) {
      ctx.font = '700 7.5px ' + F; var pw = cols[3][1] - 8, name = K.wrap(ctx, r.party || '—', pw, 2), h = Math.max(19, name.length * 9.5 + 8);
      ensure(h);
      if (i % 2 === 0) { ctx.fillStyle = '#fbf6ee'; ctx.fillRect(M, y, W - 2 * M, h); }
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(M, y + h); ctx.lineTo(W - M, y + h); ctx.stroke();
      var vals = sale ? [String(i + 1), dmy(r.date), r.no, null, r.gstin, posLabel(r.pos, true), r.hsn, money(r.taxable), r.rate + '%', r.igst ? money(r.igst) : '–', r.cgst ? money(r.cgst) : '–', r.sgst ? money(r.sgst) : '–', money(r.total)]
        : [String(i + 1), dmy(r.date), r.no, null, r.gstin, posLabel(r.pos, false), money(r.taxable), r.rate + '%', r.igst ? money(r.igst) : '–', r.cgst ? money(r.cgst) : '–', r.sgst ? money(r.sgst) : '–', money(r.total)];
      var x = M, base = y + 12.5;
      cols.forEach(function (c, k) {
        ctx.fillStyle = BLK; ctx.font = (k === 2 || k === cols.length - 1 ? '700 ' : '') + '7.5px ' + F;
        if (k === 3) { ctx.font = '700 7.5px ' + F; name.forEach(function (tx, j) { ctx.fillText(tx, x + 4, base + j * 9.5); }); }
        else { var tx = K.ell(ctx, vals[k], c[1] - 8); ctx.textAlign = c[2] === 'r' ? 'right' : c[2] === 'c' ? 'center' : 'left'; ctx.fillText(tx, c[2] === 'r' ? x + c[1] - 4 : c[2] === 'c' ? x + c[1] / 2 : x + 4, base); ctx.textAlign = 'left'; }
        x += c[1];
      });
      y += h;
    });
    if (!list.length) { ctx.fillStyle = GREY; ctx.font = '600 10px ' + F; ctx.fillText('No invoices saved for this return period.', M + 6, y + 18); y += 30; }
    ensure(24);
    ctx.fillStyle = BLK; ctx.fillRect(M, y, W - 2 * M, 21); ctx.fillStyle = '#fff'; ctx.font = '800 8px ' + F; ctx.fillText('TOTAL · ' + plural(t.n, 'invoice'), M + 6, y + 14);
    var tx2 = M, idx = { taxable: sale ? 7 : 6, igst: sale ? 9 : 8, cgst: sale ? 10 : 9, sgst: sale ? 11 : 10, total: sale ? 12 : 11 }, ox = [];
    cols.forEach(function (c) { ox.push(tx2); tx2 += c[1]; }); ctx.textAlign = 'right'; ctx.fillStyle = OR;
    Object.keys(idx).forEach(function (k) { ctx.fillText(money(t[k]), ox[idx[k]] + cols[idx[k]][1] - 4, y + 14); }); ctx.textAlign = 'left'; y += 21;
    var made = dmy(ymd(new Date()));
    pages.forEach(function (p, i) {
      var c = p.ctx; c.strokeStyle = OR; c.lineWidth = 1; c.beginPath(); c.moveTo(M, H - 26); c.lineTo(W - M, H - 26); c.stroke(); c.fillStyle = GREY; c.font = '8px ' + F; c.textAlign = 'left';
      c.fillText(G.prefs.company + ' · ' + (sale ? 'GSTR-1 B2B sales register' : 'GSTR-2 inward supplies register') + ' · ' + monthName(ym) + ' · created ' + made, M, H - 14); c.textAlign = 'right'; c.fillText('Page ' + (i + 1) + ' of ' + pages.length, W - M, H - 14); c.textAlign = 'left';
    });
    return pages;
  }
  /* Excel: branded sheet with live SUM formulas */
  function xlsxFor(kind, ym, list) {
    var K = K0, x = K.xml, sale = kind === 'sale', t = totals(list);
    var fonts = ['<font><sz val="10"/><name val="Calibri"/></font>', '<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><name val="Calibri"/></font>', '<font><sz val="9"/><color rgb="FF6B635A"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><color rgb="FFF3881E"/><name val="Calibri"/></font>'];
    var fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FF121212"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFF3881E"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1E0"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFBF6EE"/></patternFill></fill>'];
    var borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color rgb="FFE6DCCD"/></left><right style="thin"><color rgb="FFE6DCCD"/></right><top style="thin"><color rgb="FFE6DCCD"/></top><bottom style="thin"><color rgb="FFE6DCCD"/></bottom><diagonal/></border>'];
    var nf = '<numFmt numFmtId="164" formatCode="dd-mm-yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="0.00"/>';
    var xfs = [], M2 = {};
    function xf(k, font, fill, border, fmt, al) { M2[k] = xfs.length; xfs.push('<xf numFmtId="' + fmt + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + border + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"' + (al ? ' applyAlignment="1"><alignment ' + al + '/></xf>' : '/>')); }
    xf('def', 0, 0, 0, 0); xf('title', 1, 2, 0, 0, 'vertical="center"'); xf('head', 2, 2, 1, 0, 'horizontal="center" vertical="center" wrapText="1"'); xf('lbl', 3, 0, 0, 0); xf('lblv', 0, 0, 0, 0);
    xf('txt', 0, 0, 1, 0, 'vertical="top" wrapText="1"'); xf('txtZ', 0, 5, 1, 0, 'vertical="top" wrapText="1"'); xf('date', 0, 0, 1, 164, 'horizontal="center" vertical="top"'); xf('dateZ', 0, 5, 1, 164, 'horizontal="center" vertical="top"');
    xf('num', 0, 0, 1, 165, 'horizontal="right" vertical="top"'); xf('numZ', 0, 5, 1, 165, 'horizontal="right" vertical="top"'); xf('rate', 0, 0, 1, 166, 'horizontal="right" vertical="top"'); xf('rateZ', 0, 5, 1, 166, 'horizontal="right" vertical="top"');
    xf('tot', 5, 2, 1, 0, 'vertical="center"'); xf('totN', 5, 2, 1, 165, 'horizontal="right" vertical="center"'); xf('kl', 3, 4, 1, 0, 'vertical="center"'); xf('kv', 3, 4, 1, 165, 'horizontal="right" vertical="center"'); xf('ki', 3, 4, 1, 1, 'horizontal="right" vertical="center"'); xf('note', 4, 0, 0, 0, 'vertical="top" wrapText="1"'); xf('sec', 3, 3, 0, 0, 'vertical="center"');
    var rows = [], merges = [], ncol = sale ? 13 : 12, last = String.fromCharCode(64 + ncol);
    function C(ref, st, kind, v, f) { var s = ' s="' + M2[st] + '"'; if (kind === 's') return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>'; if (kind === 'n') return '<c r="' + ref + '"' + s + '>' + (f ? '<f>' + x(f) + '</f>' : '') + '<v>' + v + '</v></c>'; return '<c r="' + ref + '"' + s + '/>'; }
    function R(n, cells, ht) { rows.push('<row r="' + n + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + cells.join('') + '</row>'); }
    var hdr = sale ? ['Sr.', 'Invoice Date', 'Invoice No', 'Receiver Name', 'Receiver GSTIN/UIN', 'Place of Supply', 'HSN Code', 'Taxable Value', 'Tax Rate %', 'IGST Amount', 'CGST Amount', 'SGST/UT Amount', 'Total Invoice Value']
      : ['Sr.', 'Invoice Date', 'Invoice No', 'Name of the Supplier', 'Supplier GSTIN', 'Place of Supply', 'Taxable Value', 'GST Rate %', 'IGST Amount', 'CGST Amount', 'SGST/UT Amount', 'Total Invoice Value'];
    var colL = function (i) { return String.fromCharCode(65 + i); };
    var first = 9, lastRow = first + Math.max(list.length, 1) - 1, ci = sale ? { taxable: 7, igst: 9, cgst: 10, sgst: 11, total: 12 } : { taxable: 6, igst: 8, cgst: 9, sgst: 10, total: 11 };
    var rng = function (k) { return colL(ci[k]) + first + ':' + colL(ci[k]) + lastRow; };
    R(1, [C('A1', 'title', 's', sale ? 'GSTR-1 · B2B INVOICES (SALES)' : 'GSTR-2 · INWARD SUPPLIES (PURCHASES)')].concat(Array.from({ length: ncol - 1 }, function (_, i) { return C(colL(i + 1) + '1', 'title', 'e'); })), 30); merges.push('A1:' + last + '1');
    R(3, [C('A3', 'lbl', 's', 'Business:'), C('C3', 'lblv', 's', G.prefs.company), C('E3', 'lbl', 's', 'GSTIN:'), C('F3', 'lblv', 's', G.prefs.gstin), C('H3', 'lbl', 's', 'Return period:'), C('J3', 'lblv', 's', monthName(ym))]);
    R(5, [C('A5', 'kl', 's', 'Invoices'), C('B5', 'ki', 'n', t.n, 'COUNTA(C' + first + ':C' + lastRow + ')'), C('D5', 'kl', 's', 'Taxable value'), C('E5', 'kv', 'n', t.taxable, 'SUM(' + rng('taxable') + ')'), C('G5', 'kl', 's', 'CGST + SGST'), C('H5', 'kv', 'n', r2(t.cgst + t.sgst), 'SUM(' + rng('cgst') + ')+SUM(' + rng('sgst') + ')'), C('J5', 'kl', 's', 'IGST'), C('K5', 'kv', 'n', t.igst, 'SUM(' + rng('igst') + ')')], 22);
    R(8, hdr.map(function (h, i) { return C(colL(i) + '8', 'head', 's', h); }), 30);
    if (!list.length) R(first, [C('A' + first, 'txt', 's', 'No invoices saved for this return period.')]);
    list.forEach(function (r, i) {
      var n = first + i, z = i % 2 ? 'Z' : '';
      var cells = [C('A' + n, 'txt' + z, 'n', i + 1), C('B' + n, 'date' + z, 'n', Math.round((Date.UTC(parseYmd(r.date).getFullYear(), parseYmd(r.date).getMonth(), parseYmd(r.date).getDate()) - Date.UTC(1899, 11, 30)) / 86400000)), C('C' + n, 'txt' + z, 's', r.no), C('D' + n, 'txt' + z, 's', r.party), C('E' + n, 'txt' + z, 's', r.gstin), C('F' + n, 'txt' + z, 's', posLabel(r.pos, sale))];
      if (sale) cells.push(C('G' + n, 'txt' + z, 's', r.hsn));
      var o = sale ? 7 : 6;
      [r.taxable].forEach(function (v) { cells.push(C(colL(o) + n, 'num' + z, 'n', v)); }); cells.push(C(colL(o + 1) + n, 'rate' + z, 'n', r.rate)); cells.push(C(colL(o + 2) + n, 'num' + z, 'n', r.igst)); cells.push(C(colL(o + 3) + n, 'num' + z, 'n', r.cgst)); cells.push(C(colL(o + 4) + n, 'num' + z, 'n', r.sgst)); cells.push(C(colL(o + 5) + n, 'num' + z, 'n', r.total));
      R(n, cells);
    });
    var tr = lastRow + 1, tc = [C('A' + tr, 'tot', 's', 'TOTAL')]; for (var i = 1; i < ncol; i++) {
      var key = null; Object.keys(ci).forEach(function (k) { if (ci[k] === i) key = k; });
      tc.push(key ? C(colL(i) + tr, 'totN', 'n', t[key], 'SUM(' + rng(key) + ')') : C(colL(i) + tr, 'tot', 'e'));
    }
    R(tr, tc, 22);
    R(tr + 2, [C('A' + (tr + 2), 'note', 's', 'Prepared from the invoices saved in the Spark Tech Business Manager for return period ' + monthName(ym) + '. Check the figures against your books before filing.')], 28); merges.push('A' + (tr + 2) + ':' + last + (tr + 2));
    var widths = sale ? [5, 12, 18, 34, 20, 18, 11, 15, 9, 13, 13, 13, 17] : [5, 12, 20, 36, 20, 16, 15, 9, 13, 13, 13, 17];
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="8" topLeftCell="A9" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols><sheetData>' + rows.join('') + '</sheetData><mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3">' + nf + '</numFmts><fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    var hdrXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return K.zip([
      { name: '[Content_Types].xml', data: hdrXml + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: hdrXml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: hdrXml + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + (sale ? 'GSTR1 Sales ' : 'GSTR2 Purchases ') + ym + '" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: hdrXml + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: styles }, { name: 'xl/worksheets/sheet1.xml', data: sheet }]);
  }
  ACTIONS.gstDl = async function (el) {
    var kind = GS.kind, list = monthRecs(kind, GS.ym), fmt = el.dataset.fmt, base = fileBase(kind, GS.ym);
    if (!list.length) { toast('There are no ' + (kind === 'sale' ? 'sales' : 'purchase') + ' invoices saved for ' + monthName(GS.ym) + ' yet.', 'err'); return; }
    try {
      if (fmt === 'csv') { await A.saveFile(base + '.csv', csvText(kind, list)); return; }
      if (fmt === 'xlsx') { await A.saveBinary(base + '.xlsx', xlsxFor(kind, GS.ym, list)); return; }
      toast('Making the PDF…'); await A.saveBinary(base + '.pdf', window.MBM_REPORT.pdfBytes(await pdfPages(kind, GS.ym, list)));
    } catch (e) { toast('Could not make the file: ' + (e && e.message || e), 'err'); }
  };

  /* ---------------------------------------------------------------- backup / restore with the rest of the data */
  if (window.MBM && typeof window.MBM.makeBackup === 'function') {
    var prevBackup = window.MBM.makeBackup;
    window.MBM.makeBackup = function () { var b = prevBackup.apply(this, arguments); try { if (G.recs.length) { b.officeTools = b.officeTools || {}; b.officeTools.gst = { records: JSON.parse(JSON.stringify(G.recs)), prefs: G.prefs }; } } catch (e) { /* keep the normal backup */ } return b; };
  }
  if (window.MBM_OFFICE && typeof window.MBM_OFFICE.restore === 'function') {
    var prevRestore = window.MBM_OFFICE.restore;
    window.MBM_OFFICE.restore = function (o) {
      var note = prevRestore.apply(this, arguments) || '';
      if (o && o.gst && Array.isArray(o.gst.records)) {
        var n = 0; o.gst.records.forEach(function (r) { if (r && typeof r.id === 'string' && (r.kind === 'sale' || r.kind === 'purchase') && typeof r.no === 'string') { put(r); G.recs = G.recs.filter(function (x) { return x.id !== r.id; }); G.recs.push(r); n++; } });
        if (n) note += ' Also restored ' + plural(n, 'GST invoice') + '.';
      }
      return note;
    };
  }
  window.MBM_GST = { recs: function () { return G.recs; }, csv: csvText, pdfPages: pdfPages, xlsx: xlsxFor, monthRecs: monthRecs, checks: checks, state: GS };

  /* ---------------------------------------------------------------- styles */
  var st = document.createElement('style');
  st.textContent = [
    '.gst-tabs{display:flex;gap:12px;flex-wrap:wrap}',
    '.gst-tab{flex:1;min-width:240px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-radius:18px;border:1px solid var(--gl-bd);background:var(--gl-btn);color:var(--ink);font:inherit;font-family:var(--f-display);font-weight:700;font-size:22px;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}',
    '.gst-tab span{font-family:var(--f-mono);font-size:15px;min-width:34px;text-align:center;padding:3px 10px;border-radius:999px;background:var(--gl-in);border:1px solid var(--gl-bd)}',
    '.gst-tab:hover{border-color:var(--primary)}',
    '.gst-tab.on{background:linear-gradient(145deg,#ffae5c,#e8760a);color:#1c0d00;border-color:rgba(255,214,170,.6);box-shadow:0 18px 36px -16px rgba(243,136,30,.65)}',
    '.gst-tab.on span{background:rgba(0,0,0,.16);border-color:rgba(0,0,0,.12);color:#1c0d00}',
    '.gst-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}',
    '.gst-k{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:16px;background:var(--gl-bg);border:1px solid var(--gl-bd);box-shadow:var(--gl-sh)}',
    '.gst-k span{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--muted)}',
    '.gst-k b{font-family:var(--f-mono);font-size:19px;color:var(--ink)}',
    '.o-gst{width:100%;border-collapse:collapse;min-width:1100px}',
    '.o-gst th{background:transparent;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:9px 8px;text-align:right;border-bottom:1px solid var(--line-strong);white-space:nowrap}',
    '.o-gst td{padding:8px;text-align:right;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;font-size:14px}',
    '.o-gst th.l,.o-gst td.l{text-align:left}.o-gst td.mono{font-family:var(--f-mono);font-size:12.5px}',
    '.o-gst tfoot td{font-weight:800;background:transparent;border-top:2px solid var(--primary);border-bottom:0}',
    '.o-gst td.act{white-space:nowrap}.o-gst td.act .btn{margin-left:6px}',
    '.gst-warn{margin:8px 0 0;padding-left:20px}.gst-warn li{margin:4px 0}'
  ].join('\n');
  document.head.appendChild(st);
})();
