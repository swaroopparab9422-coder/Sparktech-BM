/* Windows look and feel: left menu, a clearer dashboard, and hidden amounts on the dashboard.
 * Colours and fonts are unchanged; this only re-arranges and refines how things are shown. */
(function () {
  'use strict';
  var A = window.MBM_APP, L = window.MBM;
  if (!A || !A.SCREENS || !L) return;
  var S = A.S, esc = A.esc, plural = A.plural, SCREENS = A.SCREENS;

  /* ---------- icons (simple outline icons) ---------- */
  var IC = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    po: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    truck: '<path d="M2 7h11v9H2zM13 10h5l3 3v3h-8"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 010 6M18 14c2 .8 3 2.7 3 6"/>',
    bell: '<path d="M6 17v-6a6 6 0 0112 0v6l2 2H4zM10 21h4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
    done: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M9 8h6M9 12h6M11 8c3 0 4 2 3 4l-3 4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.7 9.7 0 0112 6c6.4 0 10 6 10 6a17 17 0 01-3.2 3.9M6.6 7.6A16.6 16.6 0 002 12s3.6 6 10 6a9.7 9.7 0 004-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    gst: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'
  };
  function icon(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>'; }

  /* ---------- left menu ---------- */
  var MENU = [
    { id: 'dashboard', label: 'Dashboard', ic: 'home', act: 'home' },
    { group: 'Sales' },
    { id: 'quoteForm', label: 'Add Quotation', ic: 'plus', act: 'go', to: 'quoteForm' },
    { id: 'quoteList', label: 'Saved Quotations', ic: 'quote', act: 'go', to: 'quoteList' },
    { id: 'poForm', label: 'Add Purchase Order', ic: 'plus', act: 'go', to: 'poForm' },
    { id: 'poList', label: 'Purchase Orders', ic: 'po', act: 'openPOList', preset: '' },
    { group: 'Delivery' },
    { id: 'challanForm', label: 'New Challan', ic: 'truck', act: 'chlNew' },
    { id: 'challanList', label: 'Saved Challans', ic: 'quote', act: 'chlList' },
    { group: 'GST' },
    { id: 'gst', label: 'GST Filing', ic: 'gst', act: 'gstOpen' },
    { group: 'Attendance' },
    { id: 'attToday', label: 'Mark Attendance', ic: 'cal', act: 'offGoToday' },
    { id: 'attSheet', label: 'Employee Sheets', ic: 'grid', act: 'offGoSheet' },
    { id: 'attPayroll', label: 'Monthly Salary', ic: 'cash', act: 'offGoPay' },
    { id: 'empList', label: 'Employees', ic: 'users', act: 'offGoEmp' },
    { spacer: true },
    { id: 'reminders', label: 'Reminders', ic: 'bell', act: 'go', to: 'reminders' },
    { id: 'settings', label: 'Settings and Backup', ic: 'gear', act: 'go', to: 'settings' }
  ];
  var ALIAS = { empForm: 'empList', poPayment: 'poList', poStatus: 'poList', poDetail: 'poList' };
  var nav = document.createElement('nav');
  nav.className = 'side'; nav.id = 'side-menu'; nav.setAttribute('aria-label', 'Main menu');
  nav.innerHTML = '<div class="side-head"><div class="side-title">Spark Tech Business Manager</div><button type="button" class="side-close" data-close="1" aria-label="Close menu">' + icon('close') + '</button></div>' +
    MENU.map(function (m) {
      if (m.group) return '<div class="side-group">' + esc(m.group) + '</div>';
      if (m.spacer) return '<div class="side-spacer"></div>';
      return '<button type="button" class="side-item" data-id="' + m.id + '" data-act="' + m.act + '"' + (m.to ? ' data-to="' + m.to + '"' : '') + (m.preset !== undefined ? ' data-preset="' + m.preset + '"' : '') + '>' + icon(m.ic) + '<span>' + esc(m.label) + '</span></button>';
    }).join('');
  var scrim = document.createElement('div'); scrim.className = 'side-scrim';
  var top = document.createElement('header'); top.className = 'topbar';
  top.innerHTML = '<div class="tb-left">' +
    '<button type="button" class="menu-btn" aria-label="Open menu" aria-controls="side-menu" aria-expanded="false">' + icon('menu') + '</button>' +
    '<button type="button" class="switch" role="switch" aria-checked="false" aria-label="Dark mode">' + '<svg class="ic sw-ic sw-sun" viewBox="0 0 24 24" aria-hidden="true">' + IC.sun + '</svg><svg class="ic sw-ic sw-moon" viewBox="0 0 24 24" aria-hidden="true">' + IC.moon + '</svg>' +
    '<span class="knob"><svg class="ic k-sun" viewBox="0 0 24 24" aria-hidden="true">' + IC.sun + '</svg><svg class="ic k-moon" viewBox="0 0 24 24" aria-hidden="true">' + IC.moon + '</svg></span></button>' +
    '<button type="button" class="back-btn" aria-label="Back to dashboard" title="Back to dashboard">' + icon('back') + '</button></div>' +
    '<img class="tb-logo logo-on-dark" src="./logo.png" alt="Spark Tech Automation"><img class="tb-logo logo-on-light" src="./logo-dark.png" alt="Spark Tech Automation">';
  document.body.appendChild(top); document.body.appendChild(scrim); document.body.appendChild(nav);
  var menuBtn = top.querySelector('.menu-btn'), sw = top.querySelector('.switch');
  function openMenu() { nav.classList.add('open'); scrim.classList.add('open'); menuBtn.setAttribute('aria-expanded', 'true'); var f = nav.querySelector('.side-item[aria-current="page"]') || nav.querySelector('.side-item'); if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 60); }
  function closeMenu(refocus) { nav.classList.remove('open'); scrim.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); if (refocus) menuBtn.focus(); }
  menuBtn.addEventListener('click', function () { if (nav.classList.contains('open')) closeMenu(); else openMenu(); });
  scrim.addEventListener('click', function () { closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { e.preventDefault(); closeMenu(true); } });
  top.querySelector('.back-btn').addEventListener('click', function () { closeMenu(); A.ACTIONS.home(); });
  function syncSwitch() { sw.setAttribute('aria-checked', document.documentElement.getAttribute('data-theme') === 'dark' ? 'true' : 'false'); }
  sw.addEventListener('click', function () { A.ACTIONS.toggleTheme(); syncSwitch(); });
  new MutationObserver(syncSwitch).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncSwitch();
  nav.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { closeMenu(true); return; }
    var el = e.target.closest('[data-act]'); if (!el) return;
    var h = A.ACTIONS[el.dataset.act];
    if (h) { e.preventDefault(); closeMenu(); h(el, e); }
  });
  function setActive() {
    var name = S.view && S.view.name, id = ALIAS[name] || name;
    top.classList.toggle('on-dash', name === 'dashboard');
    nav.querySelectorAll('.side-item').forEach(function (b) { if (b.dataset.id === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  var host = document.getElementById('app');
  new MutationObserver(setActive).observe(host, { childList: true });
  setActive();

  /* ---------- amounts on the dashboard are hidden: first digit, then XX ---------- */
  function mask(text) {
    var m = /\d/.exec(String(text)); if (!m) return text;
    return String(text).slice(0, m.index) + m[0] + 'XX';
  }
  function moneyLine(amount, cur) {
    var full = A.money(amount, cur), m = mask(full);
    return '<div class="v-money"><button type="button" class="eye" data-eye="1" aria-pressed="false" aria-label="Show amount" title="Show amount">' + icon('eyeoff') + '</button><span class="mv" data-full="' + esc(full) + '" data-mask="' + esc(m) + '">' + esc(m) + '</span></div>';
  }
  function maskedLines(by) {
    var keys = Object.keys(by);
    if (!keys.length) return moneyLine(0);
    return keys.sort().map(function (c) { return moneyLine(by[c], c); }).join('') + (keys.length > 1 ? '<div class="s">Currencies are kept separate.</div>' : '');
  }
  // eye button: press to show the amount, press again (or wait 30 seconds) to hide it
  function setEye(btn, show) {
    var mv = btn.parentNode.querySelector('.mv'); if (!mv) return;
    mv.textContent = show ? mv.dataset.full : mv.dataset.mask;
    btn.setAttribute('aria-pressed', show ? 'true' : 'false'); btn.setAttribute('aria-label', show ? 'Hide amount' : 'Show amount'); btn.title = show ? 'Hide amount' : 'Show amount';
    btn.innerHTML = icon(show ? 'eye' : 'eyeoff'); clearTimeout(btn._t);
    if (show) btn._t = setTimeout(function () { setEye(btn, false); }, 30000);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-eye]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); setEye(b, b.getAttribute('aria-pressed') !== 'true');
  });

  /* ---------- dashboard ---------- */
  function act(label, desc, ic, a, extra, primary) {
    return '<button type="button" class="act-card' + (primary ? ' act-primary' : '') + '" data-act="' + a + '"' + (extra || '') + '><span class="act-ic">' + icon(ic) + '</span><span class="act-tx"><strong>' + esc(label) + '</strong><span>' + esc(desc) + '</span></span></button>';
  }
  function kpi(label, value, ic, a, extra) {
    return '<button type="button" class="kpi" data-act="' + a + '"' + (extra || '') + '><span class="kpi-ic">' + icon(ic) + '</span><span class="kpi-v">' + value + '</span><span class="kpi-k">' + esc(label) + '</span></button>';
  }
  function today() { return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

  function bt(area, cls, inner, a, extra) {
    var at = ' data-a="' + area + '"';
    return a ? '<button type="button" class="bt ' + cls + '"' + at + ' data-act="' + a + '"' + (extra || '') + '>' + inner + '</button>' : '<div class="bt ' + cls + '"' + at + '>' + inner + '</div>';
  }
  function tileAct(area, cls, label, desc, ic, a, extra, badge) {
    return bt(area, cls, '<span class="bt-ic">' + icon(ic) + '</span><span><span class="bt-t">' + esc(label) + (badge || '') + '</span><span class="bt-s">' + esc(desc) + '</span></span>', a, extra);
  }
  function tileNum(area, label, value, ic, a, extra, tail) {
    return bt(area, 'bt-kpi', '<span class="bt-row"><span class="bt-k">' + esc(label) + '</span><span class="bt-ic">' + icon(ic) + '</span></span><span class="bt-v">' + value + '</span>' + (tail || ''), a, extra);
  }
  function ring(pct) {
    var r = 15, c = 2 * Math.PI * r, o = c * (1 - Math.max(0, Math.min(1, pct)));
    return '<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="' + r + '" class="ring-bg"/><circle cx="20" cy="20" r="' + r + '" class="ring-fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + o.toFixed(1) + '" transform="rotate(-90 20 20)"/></svg>';
  }
  function monthsChart() {
    var now = new Date(), cols = [], max = 1;
    for (var i = 5; i >= 0; i--) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1); cols.push({ y: d.getFullYear(), m: d.getMonth(), n: 0, label: d.toLocaleDateString('en-IN', { month: 'short' }) }); }
    (S.pos || []).forEach(function (p) {
      var d = new Date(p.poDate || p.createdAt); if (isNaN(d)) return;
      cols.forEach(function (c) { if (c.y === d.getFullYear() && c.m === d.getMonth()) c.n++; });
    });
    cols.forEach(function (c) { if (c.n > max) max = c.n; });
    return '<div class="bars">' + cols.map(function (c, i) {
      return '<div class="bar-col"><span class="bar-n">' + c.n + '</span><span class="bar-fill' + (i === 5 ? ' now' : '') + '" style="height:' + Math.max(6, Math.round(c.n / max * 100)) + '%"></span><span class="bar-l">' + esc(c.label) + '</span></div>';
    }).join('') + '</div>';
  }
  function attToday() {
    var o = window.MBM_OFFICE ? window.MBM_OFFICE.collect() : { employees: [], attendance: {} }, now = new Date(), key = mk(now), c = { P: 0, H: 0, A: 0 }, n = 0;
    o.employees.forEach(function (e) {
      var j = e.joinDate ? new Date(e.joinDate + 'T00:00:00') : null, l = e.leftDate ? new Date(e.leftDate + 'T00:00:00') : null;
      if ((j && j > now) || (l && l < new Date(now.getFullYear(), now.getMonth(), now.getDate()))) return;
      n++; var r = o.attendance[e.id + ':' + key], st = r && r.days[now.getDate()]; if (st) c[st]++;
    });
    return { n: n, c: c, marked: c.P + c.H + c.A };
  }
  function mk(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function greet() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

  SCREENS.dashboard = function () {
    var st = A.stats(), due = A.dueReminders(), at = attToday();
    var dueActive = due.filter(function (p) { return L.reminderOf(p, S.settings).kind === 'active'; }).length, duePay = due.length - dueActive;
    var badge = function (n) { return n ? '<span class="count-pill">' + n + ' due</span>' : ''; };
    var warn = S.loadError ? '<div class="note warn" role="alert"><b>Saved records could not be loaded.</b> ' + esc(S.loadError) + ' <button type="button" class="btn btn-secondary btn-sm" data-act="retryLoad">Try again</button></div>' : '';
    var rem = due.length
      ? '<div class="bt-rem"><div class="bt-t">' + plural(due.length, 'reminder') + ' due</div>' + due.slice(0, 1).map(function (p) {
          var r = L.reminderOf(p, S.settings);
          return '<div class="bt-rem-row"><span>' + esc(p.customer) + ' · PO ' + esc(p.poNumber) + ' · ' + (r.kind === 'payment' ? 'payment' : 'status') + '</span><button type="button" class="btn btn-sm" data-act="reminderOpen" data-id="' + esc(p.id) + '">' + (r.kind === 'payment' ? 'Update payment' : 'Update status') + '</button></div>';
        }).join('') + (due.length > 1 ? '<button type="button" class="btn btn-secondary btn-sm" data-act="go" data-to="reminders">See all ' + due.length + ' reminders</button>' : '') + '</div>'
      : '<div class="bt-rem"><div class="bt-ok">' + icon('done') + '<span class="bt-s">Nothing is due right now. You are all caught up.</span></div></div>';
    var hero = bt('hero', 'bt-hero', '<div><p class="hero-hi">' + greet() + '</p><h1 class="page-title">Dashboard</h1><p class="page-sub">' + esc(today()) + '</p></div>' + rem +
      '');
    var outstanding = Object.keys(st.outBy).length ? '<span class="bt-s">Outstanding</span>' + maskedLines(st.outBy).replace(/v-money/g, 'bt-money') : '';
    var moneyCard = function (area, label, ic, by) { return bt(area, 'bt-val', '<span class="bt-row"><span class="bt-k">' + esc(label) + '</span><span class="bt-ic">' + icon(ic) + '</span></span>' + maskedLines(by).replace(/v-money/g, 'bt-money')); };
    var pct = st.np ? st.nc / st.np : 0;
    var attTile = bt('att', 'bt-att', '<span class="bt-row"><span class="bt-k">Attendance today</span><span class="bt-ic">' + icon('cal') + '</span></span>' +
      (at.n ? '<span class="bt-v">' + at.marked + '<small> / ' + at.n + '</small></span><span class="meter"><span style="width:' + Math.round(at.marked / at.n * 100) + '%"></span></span><span class="bt-s">' + at.c.P + ' present · ' + at.c.H + ' half day · ' + at.c.A + ' absent</span>'
        : '<span class="bt-s">No employees added yet.</span>'), 'offGoToday');
    return '<main class="wrap dash">' + warn + '<div class="bento-grid">' +
      hero +
      tileAct('qa1', 'bt-primary', 'Add Quotation', 'Cost the job, set the price', 'quote', 'go', ' data-to="quoteForm"') +
      tileAct('qa2', 'bt-primary', 'Add PO', 'Record a customer PO', 'po', 'go', ' data-to="poForm"') +
      tileAct('qa3', 'bt-primary', 'New Challan', 'Number is picked for you', 'truck', 'chlNew') +
      tileAct('qa4', 'bt-primary', 'Mark Attendance', 'Today, one tap each', 'cal', 'offGoToday') +
      tileAct('qa5', 'bt-primary', 'GST Filing', 'Sales and purchase invoices', 'gst', 'gstOpen') +
      tileNum('k1', 'Quotations', st.nq, 'quote', 'go', ' data-to="quoteList"') +
      tileNum('k2', 'Purchase orders', st.np, 'po', 'openPOList', ' data-preset=""') +
      tileNum('k3', 'Active projects', st.na, 'clock', 'openPOList', ' data-preset="active"') +
      tileNum('k4', 'Completed', st.nc, 'done', 'openPOList', ' data-preset="completed"', '<span class="bt-ringrow">' + ring(pct) + '<span class="bt-s">' + Math.round(pct * 100) + '% of all POs</span></span>') +
      bt('pend', 'bt-val', '<span class="bt-row"><span class="bt-k">Payments pending</span><span class="bt-ic">' + icon('coin') + '</span></span><span class="bt-v">' + st.npend + '</span>' + outstanding) +
      moneyCard('qv', 'Total quoted value', 'quote', st.quotedBy) + moneyCard('pv', 'Total PO value', 'po', st.poBy) +
      bt('chart', 'bt-chart', '<span class="bt-row"><span class="bt-k">Purchase orders, last 6 months</span><span class="bt-ic">' + icon('po') + '</span></span>' + monthsChart()) +
      attTile +
      tileAct('f1', '', 'Active Projects', 'Status reminders', 'clock', 'openPOList', ' data-preset="active"', badge(dueActive)) +
      tileAct('f2', '', 'Payment Follow-up', 'Unpaid and part-paid', 'coin', 'openPOList', ' data-preset="followup"', badge(duePay)) +
      tileAct('f3', '', 'Saved Challans', plural(window.MBM_OFFICE ? window.MBM_OFFICE.collect().challans.length : 0, 'challan') + ' made', 'truck', 'chlList') +
      tileAct('f4', '', 'Monthly Salary', 'Worked out automatically', 'cash', 'offGoPay') +
      '</div></main>';
  };

  document.title = 'Spark Tech Business Manager';
  A.render();
})();
