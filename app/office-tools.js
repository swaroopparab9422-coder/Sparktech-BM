/* Office tools for the Windows app: Delivery Challan + Attendance and Salary.
 * Plugs into the existing app (screens, storage, PIN, backup). Data is kept in this computer's app storage
 * under its own keys (mbm:chl:, mbm:emp:, mbm:att:, mbm:ofs) and travels inside the JSON backup as "officeTools". */
(function () {
  'use strict';
  var A = window.MBM_APP;
  if (!A || !A.SCREENS) return;
  var S = A.S, SCREENS = A.SCREENS, AFTER = A.AFTER, ACTIONS = A.ACTIONS, esc = A.esc, shell = A.shell, toast = A.toast, plural = A.plural;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var appEl = document.getElementById('app');

  /* ============================== data ============================== */
  var K = { chl: 'mbm:chl:', emp: 'mbm:emp:', att: 'mbm:att:', set: 'mbm:ofs' };
  var DEFAULTS = { series: 'fy', startPrefix: '26', startSerial: 32, workDays: 26, weeklyOff: 1, sundayWork: 'extra' };
  var D = { challans: [], employees: [], att: {}, set: Object.assign({}, DEFAULTS) };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : d; }
  function dmy(s) { var d = parseYmd(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function today() { return ymd(new Date()); }
  function dim(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function mkey(y, m) { return y + '-' + pad(m + 1); }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
  function WOFF() { var v = parseInt(D.set.weeklyOff, 10); return (v >= 0 && v <= 6) ? v : 1; }   // weekly holiday: 1 = Monday
  function OFFNAME() { return DOW[WOFF()]; }
  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DOW1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function changed() { try { window.dispatchEvent(new Event('mbm-data-changed')); } catch (e) { /* ignore */ } }
  function put(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { toast('Could not save: ' + (e && e.message || e), 'err'); return false; } changed(); return true; }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } changed(); }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function upsert(arr, rec) { var i = arr.findIndex(function (x) { return x.id === rec.id; }); if (i >= 0) arr[i] = rec; else arr.push(rec); }
  function num(v) { var n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[₹,\s]/g, '')); return isFinite(n) ? n : NaN; }

  function load() {
    D.challans = []; D.employees = []; D.att = {}; D.set = Object.assign({}, DEFAULTS);
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i), v;
      try {
        if (k.indexOf(K.chl) === 0) { v = JSON.parse(localStorage.getItem(k)); if (v && v.id) D.challans.push(v); }
        else if (k.indexOf(K.emp) === 0) { v = JSON.parse(localStorage.getItem(k)); if (v && v.id) D.employees.push(v); }
        else if (k.indexOf(K.att) === 0) { v = JSON.parse(localStorage.getItem(k)); if (v && v.days) D.att[k.slice(K.att.length)] = v; }
        else if (k === K.set) D.set = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(k)) || {});
      } catch (e) { /* skip a damaged record */ }
    }
  }
  function saveSet() { put(K.set, D.set); }
  load();

  /* ============================== styles ============================== */
  var css = document.createElement('style');
  css.textContent = [
    '.o-items{width:100%;border-collapse:separate;border-spacing:0}',
    '.o-items th{background:var(--surface-2);text-align:left;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line-strong)}',
    '.o-items td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}',
    '.o-items td.n{width:44px;color:var(--muted);font-family:var(--f-mono);padding-top:16px}',
    '.o-items td.q{width:150px}.o-items td.x{width:64px}',
    '.o-items textarea{min-height:60px}',
    '.o-day{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
    '.o-day .o-date{min-width:220px;text-align:center;font-weight:700}',
    '.o-sum{display:flex;gap:10px;flex-wrap:wrap}',
    '.o-pill{border:1px solid var(--line-strong);border-radius:999px;padding:6px 12px;font-weight:700;font-size:14px;background:var(--surface)}',
    '.o-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:space-between;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}',
    '.o-row .nm{font-weight:700;font-size:19px;color:var(--ink)}.o-row .sub{font-size:13px;color:var(--muted)}',
    '.o-3{display:flex;gap:8px}',
    '.o-rowwrap{display:flex;align-items:stretch;gap:14px}',
    '.o-rowwrap .o-row{flex:1;min-width:0}',
    '.o-sheetbtn{flex:none;min-width:160px;min-height:0;padding:0 18px;font-size:16px;font-weight:800;border-radius:18px}',
    '.o-3 button{min-width:112px;min-height:52px;font-size:17px;font-weight:700;border-radius:8px;border:2px solid var(--line-strong);background:var(--surface);color:var(--ink);cursor:pointer}',
    '.o-3 button:hover{border-color:var(--ink)}',
    '.o-3 button[data-st="P"][aria-pressed="true"]{background:#1f8a47;border-color:#1f8a47;color:#fff}',
    '.o-3 button[data-st="H"][aria-pressed="true"]{background:#e0a100;border-color:#e0a100;color:#1a1200}',
    '.o-3 button[data-st="A"][aria-pressed="true"]{background:#d6443a;border-color:#d6443a;color:#fff}',
    '.o-scroll{overflow:auto;max-width:100%;border:1px solid var(--line);border-radius:8px}',
    '.o-sheet{border-collapse:collapse;width:100%;min-width:960px;table-layout:fixed}',
    '.o-sheet th,.o-sheet td{border:1px solid var(--line);padding:0;text-align:center}',
    '.o-sheet th{background:var(--surface-2);font-size:13px;height:34px;color:var(--ink)}',
    '.o-sheet td.dw{width:44px;font-weight:700;font-size:13px;color:var(--muted);background:var(--surface-2)}',
    '.o-sheet td.dw.su{background:#5d5d5d;color:#fff}',
    '.o-sheet td.ac{height:30px;cursor:pointer;position:relative;user-select:none}',
    '.o-sheet td.ac:hover{outline:2px solid var(--primary);outline-offset:-2px}',
    '.o-sheet td.ac i{position:absolute;left:4px;top:2px;font-style:normal;font-size:10px;color:var(--muted)}',
    '.o-sheet td.ac b{font-size:15px}',
    '.o-sheet td.off{background:var(--surface-2);cursor:default}.o-sheet td.off:hover{outline:none}',
    '.o-sheet td.sun{background:rgba(120,120,120,.18)}',
    '.o-sheet td.sP{background:#1f8a47;color:#fff}.o-sheet td.sP i{color:#d8f5e2}',
    '.o-sheet td.sH{background:#e0a100;color:#1a1200}.o-sheet td.sH i{color:#4a3500}',
    '.o-sheet td.sA{background:#d6443a;color:#fff}.o-sheet td.sA i{color:#ffd9d6}',
    '.o-sheet tfoot td{height:32px;font-weight:700;font-size:13px;background:var(--surface-2)}',
    '.o-sheet tfoot td.lb{text-align:left;padding-left:6px;font-size:12px;color:var(--muted)}',
    '.o-pay{width:100%;border-collapse:collapse;min-width:1000px}',
    '.o-pay th{background:var(--surface-2);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:9px 8px;text-align:right;border-bottom:1px solid var(--line-strong)}',
    '.o-pay th:first-child,.o-pay td:first-child{text-align:left}',
    '.o-pay td{padding:8px;text-align:right;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}',
    '.o-pay td input{width:88px;text-align:right;min-height:38px;padding:4px 8px}',
    '.o-pay tfoot td{font-weight:800;background:var(--surface-2)}',
    '.o-pay td.net{font-weight:800;color:var(--ink)}',
    '.o-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;color:var(--muted)}',
    '.o-legend b{display:inline-block;min-width:22px;text-align:center;border-radius:4px;padding:1px 6px;color:#fff;margin-right:4px}'
  ].join('\n');
  document.head.appendChild(css);

  /* ============================== delivery challan: numbering ============================== */
  function seriesPrefix(dateStr) {
    var d = parseYmd(dateStr) || new Date(), y = d.getFullYear();
    if (D.set.series === 'fy' && d.getMonth() < 3) y -= 1;        // April to March financial year
    return pad(y % 100);
  }
  function nextChallanNo(dateStr, ignoreId) {
    var pre = seriesPrefix(dateStr), max = 0;
    D.challans.forEach(function (c) { if (c.id !== ignoreId && c.prefix === pre && c.seq > max) max = c.seq; });
    var floor = pre === D.set.startPrefix ? (parseInt(D.set.startSerial, 10) || 1) : 1;
    var seq = Math.max(max + 1, floor);
    return { prefix: pre, seq: seq, no: pre + '/' + seq };
  }

  /* ============================== delivery challan: PDF ============================== */
  var CO = {
    lines: ['ADD: B67, MIDC, Gokul Shirgaon, Maharashtra,Kolhapur- 416234',
      'M-+91 8999942894, Email- sparktechautomation@gmail.com, GST- 27EFDPP0716L1Z9',
      'Web- www.sparktechautomation.com'],
    sign: 'For SPARK TECH AUTOMATION'
  };
  var PWP = 595, PHP = 842, SCP = 3, MX = 36, FONTF = '"Roboto","Helvetica Neue",Arial,"Noto Sans",sans-serif';
  var COLX = { sr: MX, part: MX + 50, qty: MX + 50 + 383, end: PWP - MX };
  var BODY_H = 150;

  function wrapLines(ctx, text, width) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (para) {
      var words = para.split(/\s+/), line = '';
      words.forEach(function (w) {
        while (ctx.measureText(w).width > width && w.length > 1) {
          var k = w.length - 1; while (k > 1 && ctx.measureText(w.slice(0, k)).width > width) k--;
          if (line) { out.push(line); line = ''; } out.push(w.slice(0, k)); w = w.slice(k);
        }
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width <= width) line = t; else { if (line) out.push(line); line = w; }
      });
      out.push(line);
    });
    return out;
  }
  function fitText(ctx, text, width) {
    text = String(text || '');
    if (ctx.measureText(text).width <= width) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > width) text = text.slice(0, -1);
    return text + '…';
  }
  function layoutItems(ctx, c) {
    var size, partW = COLX.qty - COLX.part - 14;
    for (size = 10; size >= 7.5; size -= 0.5) {
      var gap = Math.max(4, Math.round(size * 0.9)), y = 8, rows = [];
      ctx.font = size + 'px ' + FONTF;
      c.items.forEach(function (it, i) {
        var lines = wrapLines(ctx, it.particulars, partW), h = lines.length * (size + 3);
        rows.push({ n: i + 1, lines: lines, qty: it.qty, y: y }); y += h + gap;
      });
      var noteLines = [];
      if (c.note) { ctx.font = '700 ' + size + 'px ' + FONTF; noteLines = wrapLines(ctx, c.note, partW); y += 6; }
      var total = y + noteLines.length * (size + 3);
      if (total <= BODY_H - 4) return { size: size, rows: rows, noteLines: noteLines, noteY: y };
    }
    throw new Error('Too many or too long items to fit one challan page. Shorten the particulars or split into a second challan.');
  }
  function drawCopy(ctx, c, y0, withAddress, logo) {
    var L = MX, R = PWP - MX, y;
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.8; ctx.textBaseline = 'alphabetic';
    if (logo) { var lw = 104, lh = lw * logo.height / logo.width; ctx.drawImage(logo, L, y0, lw, lh); }
    ctx.font = '700 14px ' + FONTF; ctx.textAlign = 'right'; ctx.fillText('DELIVERY CHALLAN', R, y0 + 30);
    ctx.textAlign = 'left';
    y = y0 + 52; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
    if (withAddress) {
      ctx.font = '7px ' + FONTF; ctx.textAlign = 'center';
      CO.lines.forEach(function (t, i) { ctx.fillText(t, PWP / 2, y + 11 + i * 8.5); });
      ctx.textAlign = 'left'; y += 30;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      ctx.font = '700 9px ' + FONTF; ctx.fillText('To', L + 12, y + 11); y += 10;
    }
    // customer and number block
    var ry = y + 14;
    ctx.font = '700 8.5px ' + FONTF; ctx.fillText('NAME :', L + 14, ry);
    ctx.font = '9.5px ' + FONTF; ctx.fillText(fitText(ctx, c.customer, 270), L + 58, ry);
    ctx.font = '700 8.5px ' + FONTF; ctx.fillText('CHALLAN NO :', 385, ry);
    ctx.font = '9.5px ' + FONTF; ctx.fillText(c.no, 470, ry);
    ctx.font = '700 8.5px ' + FONTF; ctx.fillText('ADD:', L + 22, ry + 16);
    ctx.font = '9.5px ' + FONTF;
    var addr = wrapLines(ctx, c.address, 290).slice(0, 2);
    addr.forEach(function (t, i) { ctx.fillText(t, L + 58, ry + 16 + i * 12); });
    ctx.font = '700 8.5px ' + FONTF; ctx.fillText('DATE:', 400, ry + 16);
    ctx.font = '9.5px ' + FONTF; ctx.fillText(dmy(c.date), 470, ry + 16);
    var ty = ry + 16 + (addr.length > 1 ? 12 : 0) + 10;     // table top
    // table
    var HH = 16, lay = layoutItems(ctx, c), by = ty + HH;
    ctx.lineWidth = 0.9;
    ctx.strokeRect(L, ty, R - L, HH + BODY_H);
    ctx.beginPath(); ctx.moveTo(L, by); ctx.lineTo(R, by); ctx.moveTo(COLX.part, ty); ctx.lineTo(COLX.part, by + BODY_H); ctx.moveTo(COLX.qty, ty); ctx.lineTo(COLX.qty, by + BODY_H); ctx.stroke();
    ctx.font = '700 8px ' + FONTF; ctx.textAlign = 'center';
    ctx.fillText('SR. No.', (COLX.sr + COLX.part) / 2, ty + 11); ctx.fillText('PARTICULARS', (COLX.part + COLX.qty) / 2, ty + 11); ctx.fillText('QTY', (COLX.qty + COLX.end) / 2, ty + 11);
    ctx.font = lay.size + 'px ' + FONTF;
    lay.rows.forEach(function (r) {
      var base = by + r.y + lay.size;
      ctx.textAlign = 'center'; ctx.fillText(String(r.n), (COLX.sr + COLX.part) / 2, base);
      if (r.qty) { ctx.fillText(fitText(ctx, r.qty, COLX.end - COLX.qty - 8), (COLX.qty + COLX.end) / 2, base); }
      ctx.textAlign = 'left';
      r.lines.forEach(function (t, i) { ctx.fillText(t, COLX.part + 7, base + i * (lay.size + 3)); });
    });
    if (lay.noteLines.length) {
      ctx.font = '700 ' + lay.size + 'px ' + FONTF; ctx.textAlign = 'left';
      lay.noteLines.forEach(function (t, i) { ctx.fillText(t, COLX.part + 7, by + lay.noteY + lay.size + i * (lay.size + 3)); });
    }
    ctx.textAlign = 'left';
    return by + BODY_H;                                      // bottom of the table
  }
  function drawFooter(ctx, c, yb, transport) {
    var L = MX, R = PWP - MX;
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineWidth = 0.7; ctx.textAlign = 'left';
    ctx.font = '700 8.5px ' + FONTF; ctx.fillText(CO.sign, 385, yb + 16);
    if (transport) {
      var t = c.transporter || {}, ty = yb + 16;
      ctx.font = '700 8.5px ' + FONTF; ctx.fillText('Transporter', L + 12, ty);
      var rows = [['Name :', t.name], ['Vehicle No:', t.vehicle], ['Mob No:', t.mobile]];
      rows.forEach(function (r, i) {
        ctx.font = '8.5px ' + FONTF; ctx.fillText(r[0], L + 12, ty + 16 + i * 15);
        ctx.font = '9px ' + FONTF; ctx.fillText(fitText(ctx, r[1] || '', 150), L + 70, ty + 16 + i * 15);
      });
    }
    var sy = yb + (transport ? 80 : 50);
    var rx0 = transport ? 205 : L + 30, rx1 = transport ? 355 : L + 190;          // transporter copy: receiver's signature sits in the middle, next to the authorized signatory
    ctx.beginPath(); ctx.moveTo(rx0, sy); ctx.lineTo(rx1, sy); ctx.moveTo(385, sy); ctx.lineTo(R - 10, sy); ctx.stroke();
    ctx.font = '8.5px ' + FONTF; ctx.textAlign = 'center';
    ctx.fillText('Receivers Signature', (rx0 + rx1) / 2, sy + 12); ctx.fillText('Authorized Signatory', (385 + R - 10) / 2, sy + 12);
    ctx.textAlign = 'left';
  }
  function loadImg(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }

  function b64ToBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function strBytes(s) { var a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }
  function writePdfPortrait(jpegs) {
    var chunks = [], offsets = [], pos = 0;
    function push(b) { if (typeof b === 'string') b = strBytes(b); chunks.push(b); pos += b.length; }
    function obj(n, body) { offsets[n] = pos; push(n + ' 0 obj\n'); push(body); push('\nendobj\n'); }
    var n = jpegs.length, kids = [], i;
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    for (i = 0; i < n; i++) kids.push((3 + 3 * i) + ' 0 R');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>');
    for (i = 0; i < n; i++) {
      var pg = 3 + 3 * i, ct = pg + 1, im = pg + 2, j = jpegs[i];
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PWP + ' ' + PHP + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      var content = 'q ' + PWP + ' 0 0 ' + PHP + ' 0 0 cm /Im0 Do Q';
      obj(ct, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offsets[im] = pos;
      push(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + j.w + ' /Height ' + j.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + j.bytes.length + ' >>\nstream\n');
      push(j.bytes); push('\nendstream\nendobj\n');
    }
    var total = 3 + 3 * n, xref = pos;
    push('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (i = 1; i < total; i++) push(('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n');
    push('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(pos), at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }
  async function challanPdfBytes(c) {
    var logo = await loadImg('./logo-dark.png');
    var cv = document.createElement('canvas'); cv.width = PWP * SCP; cv.height = PHP * SCP;
    var ctx = cv.getContext('2d'); ctx.scale(SCP, SCP);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PWP, PHP);
    var b1 = drawCopy(ctx, c, 18, true, logo); drawFooter(ctx, c, b1, false);
    ctx.save(); ctx.strokeStyle = '#999'; ctx.setLineDash([5, 4]); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(14, 418); ctx.lineTo(PWP - 14, 418); ctx.stroke(); ctx.restore();
    var b2 = drawCopy(ctx, c, 432, false, logo); drawFooter(ctx, c, b2, true);
    var url = cv.toDataURL('image/jpeg', 0.92);
    return writePdfPortrait([{ w: cv.width, h: cv.height, bytes: b64ToBytes(url.slice(url.indexOf(',') + 1)) }]);
  }
  async function challanPdf(c) {
    try {
      toast('Making the challan PDF…');
      var bytes = await challanPdfBytes(c);
      await A.saveBinary('Challan-' + c.no.replace(/[\\/]/g, '-') + '.pdf', bytes);
    } catch (e) { toast(e && e.message ? e.message : 'Could not make the PDF.', 'err'); }
  }

  /* ============================== delivery challan: screens ============================== */
  var DR = null;            // the challan being typed
  var CQ = { q: '' };       // search box on the saved challans list

  function blankDraft(key) { return { key: key, id: null, date: today(), customer: '', address: '', note: 'RETURNABLE BASIS', items: [{ particulars: '', qty: '' }], transporter: { name: '', vehicle: '', mobile: '' } }; }
  function draftFrom(c, key) {
    return { key: key, id: c.id, date: c.date, customer: c.customer, address: c.address, note: c.note || '',
      items: c.items.length ? c.items.map(function (i) { return { particulars: i.particulars, qty: i.qty }; }) : [{ particulars: '', qty: '' }],
      transporter: Object.assign({ name: '', vehicle: '', mobile: '' }, c.transporter || {}) };
  }
  function readForm() {
    if (!DR) return;
    var v = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (v('o-date') !== null) DR.date = v('o-date');
    if (v('o-customer') !== null) DR.customer = v('o-customer');
    if (v('o-address') !== null) DR.address = v('o-address');
    if (v('o-note') !== null) DR.note = v('o-note');
    DR.items = DR.items.map(function (it, i) {
      var p = v('o-ip-' + i), q = v('o-iq-' + i);
      return { particulars: p === null ? it.particulars : p, qty: q === null ? it.qty : q };
    });
    if (v('o-tname') !== null) DR.transporter = { name: v('o-tname'), vehicle: v('o-tveh'), mobile: v('o-tmob') };
  }
  function allCustomers() {
    var seen = {}, out = [];
    A.customerNames().concat(D.challans.map(function (c) { return c.customer; })).forEach(function (n) {
      n = (n || '').trim(); var k = n.toLowerCase(); if (n && !seen[k]) { seen[k] = 1; out.push(n); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }

  SCREENS.challanForm = function (p) {
    var editing = p.id ? byId(D.challans, p.id) : null;
    if (p.id && !editing) return shell('Edit Challan', A.notFound('challan'));
    var key = p.id || 'new';
    if (!DR || DR.key !== key) DR = editing ? draftFrom(editing, key) : blankDraft(key);
    var d = DR, nn = editing ? { no: editing.no } : nextChallanNo(d.date);
    var banner = editing
      ? '<div class="mode-banner"><span>Editing challan <b class="mono">' + esc(editing.no) + '</b></span><button type="button" class="btn btn-secondary btn-sm" data-act="chlNew">Start a new challan</button></div>'
      : '<div class="mode-banner"><span>New challan <b class="mono" id="o-no-banner">' + esc(nn.no) + '</b></span><span class="muted">Number is picked automatically and confirmed when you save</span></div>';
    var rows = d.items.map(function (it, i) {
      return '<tr><td class="n">' + (i + 1) + '</td>' +
        '<td><textarea id="o-ip-' + i + '" placeholder="Item description">' + esc(it.particulars) + '</textarea></td>' +
        '<td class="q"><input id="o-iq-' + i + '" type="text" placeholder="1 Nos" value="' + esc(it.qty) + '" autocomplete="off"></td>' +
        '<td class="x">' + (d.items.length > 1 ? '<button type="button" class="btn btn-secondary btn-sm" data-act="chlDelRow" data-i="' + i + '" aria-label="Remove item ' + (i + 1) + '">✕</button>' : '') + '</td></tr>';
    }).join('');
    var t = d.transporter;
    return shell(editing ? 'Edit Delivery Challan' : 'New Delivery Challan',
      banner + '<datalist id="dl-o-cust">' + allCustomers().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' +
      '<form id="challan-form" novalidate autocomplete="off">' +
      '<div class="fieldset"><h2>Challan details</h2><div class="form-grid">' +
      '<div class="field"><label for="o-no">Challan no</label><input id="o-no" type="text" readonly value="' + esc(nn.no) + '"></div>' +
      '<div class="field"><label for="o-date">Date</label><input id="o-date" type="text" class="date-input" readonly placeholder="Click to pick a date" value="' + esc(d.date) + '"></div>' +
      '<div class="field"><label for="o-customer">Customer name *</label><input id="o-customer" type="text" list="dl-o-cust" value="' + esc(d.customer) + '"></div>' +
      '<div class="field wide"><label for="o-address">Customer address *</label><textarea id="o-address" style="min-height:64px">' + esc(d.address) + '</textarea></div>' +
      '</div></div>' +
      '<div class="fieldset"><h2>Items</h2><div class="cost-scroll"><table class="o-items"><thead><tr><th>Sr.</th><th>Particulars</th><th>Qty</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="btn-row"><button type="button" class="btn btn-secondary" data-act="chlAddRow">+ Add item</button></div>' +
      '<div class="field"><label for="o-note">Note printed under the items</label><input id="o-note" type="text" list="dl-o-note" value="' + esc(d.note) + '">' +
      '<datalist id="dl-o-note"><option value="RETURNABLE BASIS"><option value="NON-RETURNABLE"><option value="FOR REPAIR / REWORK"></datalist>' +
      '<span class="hint">Leave empty to print nothing.</span></div></div>' +
      '<div class="fieldset"><h2>Transporter (printed on the transporter copy)</h2><div class="form-grid">' +
      '<div class="field"><label for="o-tname">Name</label><input id="o-tname" type="text" value="' + esc(t.name) + '"></div>' +
      '<div class="field"><label for="o-tveh">Vehicle no</label><input id="o-tveh" type="text" value="' + esc(t.vehicle) + '"></div>' +
      '<div class="field"><label for="o-tmob">Mobile no</label><input id="o-tmob" type="text" value="' + esc(t.mobile) + '"></div>' +
      '</div><span class="hint">Optional. Leave blank to fill in by hand after printing.</span></div>' +
      '<div class="btn-row"><button type="button" class="btn grow-sm" data-act="chlSave">Save Challan</button>' +
      '<button type="button" class="btn btn-secondary grow-sm" data-act="chlSavePdf">Save and Download PDF</button>' +
      '<button type="button" class="btn btn-secondary grow-sm" data-act="chlList">Saved Challans</button></div></form>');
  };

  function challanCard(c) {
    var items = c.items.map(function (i) { return i.particulars; }).filter(Boolean);
    return '<article class="item"><div class="item-top"><div><div class="item-title">' + esc(c.customer) + '</div>' +
      '<div class="item-sub">' + esc(items.slice(0, 2).join(' · ') + (items.length > 2 ? ' · +' + (items.length - 2) + ' more' : '')) + '</div></div>' +
      '<span class="badge mono">' + esc(c.no) + '</span></div>' +
      '<dl class="facts"><div><dt>Date</dt><dd>' + esc(A.fmtDay(c.date)) + '</dd></div><div><dt>Items</dt><dd>' + c.items.length + '</dd></div>' +
      (c.transporter && c.transporter.vehicle ? '<div><dt>Vehicle</dt><dd>' + esc(c.transporter.vehicle) + '</dd></div>' : '') + '</dl>' +
      '<div class="actions"><button type="button" class="btn btn-sm" data-act="chlPdf" data-id="' + esc(c.id) + '">Download PDF</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="chlEdit" data-id="' + esc(c.id) + '">Edit</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="chlDup" data-id="' + esc(c.id) + '">Copy to new challan</button>' +
      '<button type="button" class="btn btn-danger btn-sm" data-act="chlDelete" data-id="' + esc(c.id) + '">Delete</button></div></article>';
  }
  function challanListHtml() {
    var q = CQ.q.trim().toLowerCase();
    var all = D.challans.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.prefix || '').localeCompare(a.prefix || '') || (b.seq - a.seq); });
    var list = all.filter(function (c) { return !q || (c.no + ' ' + c.customer + ' ' + c.items.map(function (i) { return i.particulars; }).join(' ')).toLowerCase().indexOf(q) >= 0; });
    if (!all.length) return '<div class="empty"><strong>No challans yet</strong><p>Challans you save appear here, newest first.</p><button type="button" class="btn" data-act="chlNew">New Challan</button></div>';
    if (!list.length) return '<div class="empty"><strong>No challans match “' + esc(CQ.q) + '”</strong></div>';
    return list.map(challanCard).join('');
  }
  SCREENS.challanList = function () {
    var nx = nextChallanNo(today());
    return shell('Saved Challans',
      '<div class="toolbar"><div class="grow"><input id="o-chl-search" type="search" placeholder="Search by number, customer or item" value="' + esc(CQ.q) + '" autocomplete="off"></div>' +
      '<button type="button" class="btn" data-act="chlNew">New Challan</button></div>' +
      '<div id="o-chl-list" class="list">' + challanListHtml() + '</div>' +
      '<div class="fieldset"><h2>Challan numbering</h2>' +
      '<p class="muted">Next number: <b class="mono">' + esc(nx.no) + '</b>. The number goes up by one for each saved challan and starts again from 1 in a new series.</p>' +
      '<div class="form-grid"><div class="field"><label for="o-series">Series changes every</label><select id="o-series"><option value="fy"' + (D.set.series === 'fy' ? ' selected' : '') + '>Financial year (April to March)</option><option value="cal"' + (D.set.series === 'cal' ? ' selected' : '') + '>Calendar year (January to December)</option></select></div>' +
      '<div class="field"><label for="o-start">Next number for series ' + esc(D.set.startPrefix) + '/… should not be lower than</label><input id="o-start" type="text" inputmode="numeric" value="' + esc(D.set.startSerial) + '"><span class="hint">Use this when you already issued challans on paper. Saved challans are always counted.</span></div></div></div>',
      { sub: plural(D.challans.length, 'challan') + ' saved. Newest first.' });
  };

  function validateDraft() {
    var d = DR, err = '';
    if (!parseYmd(d.date)) err = 'Pick the challan date.';
    else if (!d.customer.trim()) err = 'Enter the customer name.';
    else if (!d.address.trim()) err = 'Enter the customer address.';
    else if (!d.items.some(function (i) { return i.particulars.trim(); })) err = 'Enter at least one item.';
    return err;
  }
  function saveChallan() {
    readForm();
    var err = validateDraft(); if (err) { toast(err, 'err'); return null; }
    var d = DR, old = d.id ? byId(D.challans, d.id) : null, now = new Date().toISOString(), no;
    if (old) no = { prefix: old.prefix, seq: old.seq, no: old.no }; else no = nextChallanNo(d.date);
    var rec = { id: old ? old.id : uid('c'), no: no.no, prefix: no.prefix, seq: no.seq, date: d.date, customer: d.customer.trim(), address: d.address.trim(),
      note: d.note.trim(), items: d.items.filter(function (i) { return i.particulars.trim() || i.qty.trim(); }).map(function (i) { return { particulars: i.particulars.trim(), qty: i.qty.trim() }; }),
      transporter: { name: d.transporter.name.trim(), vehicle: d.transporter.vehicle.trim(), mobile: d.transporter.mobile.trim() },
      createdAt: old ? old.createdAt : now, updatedAt: now };
    if (!put(K.chl + rec.id, rec)) return null;
    upsert(D.challans, rec); DR = null;
    return rec;
  }

  ACTIONS.chlNew = function () { DR = null; A.go('challanForm', {}); };
  ACTIONS.chlList = function () { A.go('challanList', {}); };
  ACTIONS.chlEdit = function (el) { DR = null; A.go('challanForm', { id: el.dataset.id }); };
  ACTIONS.chlDup = function (el) { var c = byId(D.challans, el.dataset.id); if (!c) return; DR = draftFrom(c, 'new'); DR.id = null; DR.date = today(); A.go('challanForm', {}); toast('Copied. A new challan number is picked when you save.'); };
  ACTIONS.chlAddRow = function () { readForm(); if (DR.items.length >= 12) { toast('Up to 12 item lines per challan.', 'err'); return; } DR.items.push({ particulars: '', qty: '' }); A.render(); var e = document.getElementById('o-ip-' + (DR.items.length - 1)); if (e) e.focus(); };
  ACTIONS.chlDelRow = function (el) { readForm(); DR.items.splice(+el.dataset.i, 1); if (!DR.items.length) DR.items.push({ particulars: '', qty: '' }); A.render(); };
  ACTIONS.chlSave = function () { var rec = saveChallan(); if (!rec) return; A.go('challanList', {}, { replace: true }); toast('Challan ' + rec.no + ' saved.', null, { label: 'Download PDF', run: function () { challanPdf(rec); } }); };
  ACTIONS.chlSavePdf = async function () { var rec = saveChallan(); if (!rec) return; A.go('challanList', {}, { replace: true }); await challanPdf(rec); };
  ACTIONS.chlPdf = function (el) { var c = byId(D.challans, el.dataset.id); if (c) challanPdf(c); };
  ACTIONS.chlDelete = async function (el) {
    var c = byId(D.challans, el.dataset.id); if (!c) return;
    var ok = await A.confirmDialog('Delete challan ' + c.no + '?', '<p><b>' + esc(c.customer) + '</b></p><p>This cannot be undone. The number ' + esc(c.no) + (c.seq === Math.max.apply(null, D.challans.filter(function (x) { return x.prefix === c.prefix; }).map(function (x) { return x.seq; })) ? ' will be used again by the next challan.' : ' will stay unused.') + '</p>', 'Delete challan', true);
    if (!ok) return;
    drop(K.chl + c.id); D.challans = D.challans.filter(function (x) { return x.id !== c.id; }); A.render(); toast('Challan ' + c.no + ' deleted.');
  };

  AFTER.challanForm = function () { /* the date picker and inputs need no extra set-up */ };
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'o-chl-search') { CQ.q = t.value; var l = document.getElementById('o-chl-list'); if (l) l.innerHTML = challanListHtml(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'o-date' && S.view.name === 'challanForm') {
      readForm();
      var editing = DR && DR.id; if (!editing) { var nn = nextChallanNo(DR.date), a = document.getElementById('o-no'), b = document.getElementById('o-no-banner'); if (a) a.value = nn.no; if (b) b.textContent = nn.no; }
    } else if (t.id === 'o-customer' && S.view.name === 'challanForm') {          // fill the address from the last challan to this customer
      var addr = document.getElementById('o-address'), name = t.value.trim().toLowerCase();
      if (addr && !addr.value.trim() && name) {
        var prev = D.challans.filter(function (c) { return c.customer.trim().toLowerCase() === name && c.address; }).sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); })[0];
        if (prev) addr.value = prev.address;
      }
    } else if (t.id === 'o-series') { D.set.series = t.value; saveSet(); A.render(); }
    else if (t.id === 'o-start') {
      var n = parseInt(t.value, 10);
      if (!(n >= 1 && n <= 999999)) { toast('Enter a whole number, 1 or more.', 'err'); t.value = D.set.startSerial; return; }
      D.set.startSerial = n; D.set.startPrefix = seriesPrefix(today()); saveSet(); A.render(); toast('Saved. The next challan will be ' + nextChallanNo(today()).no + '.');
    }
  });

  /* ============================== attendance and salary: calculations ============================== */
  function inr(n) {
    var cur = (S.settings && S.settings.currency) || 'INR';
    try { return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n); }
    catch (e) { return cur + ' ' + Math.round(n); }
  }
  function byName(a, b) { return (a.name || '').localeCompare(b.name || ''); }
  function inService(e, dt) { var j = parseYmd(e.joinDate), l = parseYmd(e.leftDate); if (j && dt < j) return false; if (l && dt > l) return false; return true; }
  function rerender() { var y = window.scrollY; A.render(); window.scrollTo(0, y); }
  function attKey(empId, y, m) { return empId + ':' + mkey(y, m); }
  function getSt(empId, dt) { var r = D.att[attKey(empId, dt.getFullYear(), dt.getMonth())]; return (r && r.days[dt.getDate()]) || ''; }
  function setSt(empId, dt, st) {
    var key = attKey(empId, dt.getFullYear(), dt.getMonth()), r = D.att[key] || { days: {}, bonus: 0, ded: 0 };
    if (st) r.days[dt.getDate()] = st; else delete r.days[dt.getDate()];
    D.att[key] = r; put(K.att + key, r);
  }
  function calcMonth(e, y, m) {
    var n = dim(y, m), rec = D.att[attKey(e.id, y, m)] || { days: {}, bonus: 0, ded: 0 };
    var now = new Date(), ty = now.getFullYear(), tm = now.getMonth();
    var cur = (y === ty && m === tm), future = (y * 12 + m > ty * 12 + tm);
    var last = future ? 0 : (cur ? now.getDate() : n);
    var r = { P: 0, H: 0, A: 0, unmarked: 0, sunWork: 0, days: 0, partial: cur };
    for (var d = 1; d <= last; d++) {
      var dt = new Date(y, m, d); if (!inService(e, dt)) continue;
      r.days++;
      var st = rec.days[d] || '', sun = dt.getDay() === WOFF();
      if (st === 'P') { r.P++; if (sun) r.sunWork += 1; }
      else if (st === 'H') { r.H++; if (sun) r.sunWork += 0.5; }
      else if (st === 'A') r.A++;
      else if (!sun) r.unmarked++;
    }
    r.div = Math.max(1, parseInt(D.set.workDays, 10) || 26);                    // salary is spread over the working days (26)
    r.sunPaid = D.set.sundayWork === 'extra' ? r.sunWork : 0;                    // Sunday work paid as an extra day
    var base = Math.max(0, r.P + r.H * 0.5 - r.sunWork);                         // working days only (not the weekly holiday)
    r.payable = Math.min(base, r.div) + r.sunPaid;
    var gross = (num(e.salary) || 0) * r.payable / r.div;
    r.bonus = num(rec.bonus) || 0; r.ded = num(rec.ded) || 0;
    r.gross = Math.round(gross); r.net = Math.round(gross + r.bonus - r.ded);
    return r;
  }
  function dayWord(n) { return (Math.round(n * 2) / 2).toString(); }

  /* ============================== attendance: mark every day ============================== */
  var AT = { date: today() };
  function statusButtons(e, st) {
    var names = { P: 'Present', H: 'Half day', A: 'Absent' };
    return '<div class="o-3" role="group" aria-label="Attendance for ' + esc(e.name) + '">' + ['P', 'H', 'A'].map(function (k) {
      return '<button type="button" data-act="attMark" data-emp="' + esc(e.id) + '" data-st="' + k + '" aria-pressed="' + (st === k) + '">' + names[k] + '</button>';
    }).join('') + '</div>';
  }
  SCREENS.attToday = function () {
    var dt = parseYmd(AT.date) || new Date(); AT.date = ymd(dt);
    var list = D.employees.filter(function (e) { return inService(e, dt); }).sort(byName);
    var c = { P: 0, H: 0, A: 0, none: 0 };
    var rows = list.map(function (e) {
      var st = getSt(e.id, dt); if (st) c[st]++; else c.none++;
      var m = calcMonth(e, dt.getFullYear(), dt.getMonth());
      return '<div class="o-rowwrap"><div class="o-row"><div><div class="nm">' + esc(e.name) + '</div><div class="sub">' + esc(e.designation || '') + (e.designation ? ' · ' : '') + 'this month: ' + m.P + ' present, ' + m.H + ' half day, ' + m.A + ' absent</div></div>' + statusButtons(e, st) + '</div>' +
        '<button type="button" class="btn o-sheetbtn" data-act="attSheetOpen" data-id="' + esc(e.id) + '" aria-label="Open the monthly sheet of ' + esc(e.name) + '">Monthly Sheet</button></div>';
    }).join('');
    var sun = dt.getDay() === WOFF();
    var body = '<div class="o-day"><button type="button" class="btn btn-secondary" data-act="attDate" data-delta="-1" aria-label="Previous day">‹ Previous</button>' +
      '<input id="o-att-date" class="o-date date-input" type="text" readonly value="' + esc(AT.date) + '" aria-label="Pick a date" style="max-width:200px;text-align:center;font-weight:700">' +
      '<button type="button" class="btn btn-secondary" data-act="attDate" data-delta="1" aria-label="Next day">Next ›</button>' +
      '<button type="button" class="btn btn-secondary" data-act="attDate" data-delta="0">Today</button></div>' +
      '<h2 class="sec-title" style="margin-top:6px">' + esc(DOW[dt.getDay()] + ', ' + dmy(AT.date)) + '</h2>' +
      (sun ? '<div class="note info">' + OFFNAME() + ' is the weekly holiday and is not part of the ' + (parseInt(D.set.workDays, 10) || 26) + ' working days. Leave it blank, and mark only those who came to work' + (D.set.sundayWork === 'extra' ? ' (paid as an extra day).' : ' (no extra pay).') + '</div>' : '') +
      '<div class="o-sum"><span class="o-pill">Present ' + c.P + '</span><span class="o-pill">Half day ' + c.H + '</span><span class="o-pill">Absent ' + c.A + '</span><span class="o-pill">Not marked ' + c.none + '</span></div>' +
      (list.length ? '<div class="btn-row"><button type="button" class="btn" data-act="attAllPresent"' + (c.none ? '' : ' disabled') + '>Mark everyone not yet marked as Present</button></div>' +
        '<div class="list" style="display:flex;flex-direction:column;gap:10px">' + rows + '</div>' +
        '<p class="muted">Tap a button to mark. Tap the same button again to clear it. Changes are saved at once.</p>'
        : '<div class="empty"><strong>' + (D.employees.length ? 'Nobody was working on this date' : 'No employees yet') + '</strong><p>' + (D.employees.length ? 'Employees appear from their joining date.' : 'Add your employees once, then mark their attendance here every day.') + '</p><button type="button" class="btn" data-act="empNew">Add Employee</button></div>');
    return shell('Mark Attendance', body, { sub: plural(list.length, 'employee') + ' on this date.' });
  };
  ACTIONS.attDate = function (el) {
    var d = parseYmd(AT.date) || new Date(), k = +el.dataset.delta;
    AT.date = k === 0 ? today() : ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + k)); rerender();
  };
  ACTIONS.attMark = function (el) {
    var dt = parseYmd(AT.date); if (!dt) return;
    var cur = getSt(el.dataset.emp, dt); setSt(el.dataset.emp, dt, cur === el.dataset.st ? '' : el.dataset.st); rerender();
  };
  ACTIONS.attAllPresent = async function () {
    var dt = parseYmd(AT.date); if (!dt) return;
    if (dt.getDay() === WOFF() && !(await A.confirmDialog('Today is ' + OFFNAME(), '<p>' + OFFNAME() + ' is the weekly holiday. Mark everyone who is not yet marked as having <b>worked</b> today?</p>', 'Mark as Present', false))) return;
    D.employees.filter(function (e) { return inService(e, dt) && !getSt(e.id, dt); }).forEach(function (e) { setSt(e.id, dt, 'P'); });
    rerender();
  };
  document.addEventListener('change', function (e) {
    if (e.target.id === 'o-att-date' && S.view.name === 'attToday') { AT.date = e.target.value; rerender(); }
  });

  /* ============================== employees ============================== */
  SCREENS.empList = function () {
    var list = D.employees.slice().sort(byName);
    var cards = list.map(function (e) {
      var left = e.leftDate && parseYmd(e.leftDate) < new Date();
      return '<article class="item"><div class="item-top"><div><div class="item-title">' + esc(e.name) + '</div><div class="item-sub">' + esc(e.designation || '') + '</div></div>' +
        (left ? '<span class="badge">Left ' + esc(A.fmtDay(e.leftDate)) + '</span>' : '') + '</div>' +
        '<dl class="facts"><div><dt>Joined</dt><dd>' + esc(A.fmtDay(e.joinDate)) + '</dd></div><div><dt>Monthly salary</dt><dd class="mono">' + esc(inr(num(e.salary) || 0)) + '</dd></div></dl>' +
        '<div class="actions"><button type="button" class="btn btn-sm" data-act="attSheetOpen" data-id="' + esc(e.id) + '">Attendance sheet</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-act="empEdit" data-id="' + esc(e.id) + '">Edit</button></div></article>';
    }).join('');
    return shell('Employees',
      '<div class="toolbar"><div class="grow"></div><button type="button" class="btn" data-act="empNew">Add Employee</button></div>' +
      (list.length ? '<div class="list">' + cards + '</div>' : '<div class="empty"><strong>No employees yet</strong><p>Add each employee with the joining date and monthly salary.</p><button type="button" class="btn" data-act="empNew">Add Employee</button></div>'),
      { sub: plural(list.length, 'employee') + '.' });
  };
  SCREENS.empForm = function (p) {
    var e = p.id ? byId(D.employees, p.id) : null;
    if (p.id && !e) return shell('Edit Employee', A.notFound('employee'));
    e = e || { name: '', designation: '', joinDate: today(), salary: '', leftDate: '' };
    return shell(p.id ? 'Edit Employee' : 'Add Employee',
      '<form id="emp-form" novalidate autocomplete="off"><div class="fieldset"><h2>Employee details</h2><div class="form-grid">' +
      '<div class="field"><label for="o-en">Name *</label><input id="o-en" type="text" value="' + esc(e.name) + '"></div>' +
      '<div class="field"><label for="o-ed">Designation (optional)</label><input id="o-ed" type="text" value="' + esc(e.designation) + '"></div>' +
      '<div class="field"><label for="o-ej">Joining date *</label><input id="o-ej" type="text" class="date-input" readonly placeholder="Click to pick a date" value="' + esc(e.joinDate) + '"></div>' +
      '<div class="field"><label for="o-es">Monthly salary *</label><input id="o-es" type="text" inputmode="decimal" value="' + esc(e.salary) + '"></div>' +
      '<div class="field"><label for="o-el">Last working day (only if the employee has left)</label><input id="o-el" type="text" class="date-input" readonly placeholder="Not left" value="' + esc(e.leftDate || '') + '"><button type="button" class="btn btn-secondary btn-sm" data-act="empClearLeft" style="align-self:flex-start">Clear</button></div>' +
      '</div></div><div class="btn-row"><button type="button" class="btn grow-sm" data-act="empSave" data-id="' + esc(p.id || '') + '">Save Employee</button>' +
      '<button type="button" class="btn btn-secondary grow-sm" data-act="back">Cancel</button>' +
      (p.id ? '<button type="button" class="btn btn-danger grow-sm" data-act="empDelete" data-id="' + esc(p.id) + '">Delete Employee</button>' : '') + '</div></form>');
  };
  ACTIONS.empNew = function () { A.go('empForm', {}); };
  ACTIONS.empEdit = function (el) { A.go('empForm', { id: el.dataset.id }); };
  ACTIONS.empClearLeft = function () { var i = document.getElementById('o-el'); if (i) i.value = ''; };
  ACTIONS.empSave = function (el) {
    var v = function (id) { return (document.getElementById(id).value || '').trim(); };
    var name = v('o-en'), join = v('o-ej'), sal = num(v('o-es')), left = v('o-el');
    var err = !name ? 'Enter the employee name.' : !parseYmd(join) ? 'Pick the joining date.' : !(sal >= 0) ? 'Enter the monthly salary as a number.' : (left && (!parseYmd(left) || parseYmd(left) < parseYmd(join))) ? 'The last working day cannot be before the joining date.' : '';
    if (err) { toast(err, 'err'); return; }
    var old = el.dataset.id ? byId(D.employees, el.dataset.id) : null;
    var rec = { id: old ? old.id : uid('e'), name: name, designation: v('o-ed'), joinDate: join, salary: sal, leftDate: left, createdAt: old ? old.createdAt : new Date().toISOString() };
    if (!put(K.emp + rec.id, rec)) return;
    upsert(D.employees, rec); toast('Saved ' + name + '.'); A.go('empList', {}, { replace: true });
  };
  ACTIONS.empDelete = async function (el) {
    var e = byId(D.employees, el.dataset.id); if (!e) return;
    var n = Object.keys(D.att).filter(function (k) { return k.indexOf(e.id + ':') === 0; }).length;
    var ok = await A.confirmDialog('Delete ' + e.name + '?', '<p>This also deletes <b>' + plural(n, 'month') + '</b> of saved attendance for this employee and cannot be undone.</p><p class="muted">If the employee has only left, keep them and set a last working day instead.</p>', 'Delete employee', true);
    if (!ok) return;
    Object.keys(D.att).forEach(function (k) { if (k.indexOf(e.id + ':') === 0) { delete D.att[k]; drop(K.att + k); } });
    drop(K.emp + e.id); D.employees = D.employees.filter(function (x) { return x.id !== e.id; });
    toast(e.name + ' deleted.'); A.go('empList', {}, { replace: true });
  };

  /* ============================== yearly sheet per employee (same layout as your sheet) ============================== */
  SCREENS.attSheet = function (p) {
    var emps = D.employees.slice().sort(byName);
    if (!emps.length) return shell('Employee Attendance Sheet', '<div class="empty"><strong>No employees yet</strong><p>Add an employee first.</p><button type="button" class="btn" data-act="empNew">Add Employee</button></div>');
    var e = byId(emps, p.id) || emps[0]; p.id = e.id;
    var y = +p.year || new Date().getFullYear(); p.year = y;
    var head = '<tr><th style="width:44px"></th>' + MON3.map(function (n) { return '<th>' + n + '</th>'; }).join('') + '</tr>';
    var body = '';
    for (var row = 0; row < 42; row++) {
      body += '<tr><td class="dw' + (row % 7 === WOFF() ? ' su' : '') + '">' + DOW1[row % 7] + '</td>';
      for (var m = 0; m < 12; m++) {
        var first = new Date(y, m, 1).getDay(), d = row - first + 1;
        if (d < 1 || d > dim(y, m)) { body += '<td class="off"></td>'; continue; }
        var dt = new Date(y, m, d), svc = inService(e, dt);
        if (!svc) { body += '<td class="off"><i>' + d + '</i></td>'; continue; }
        var st = getSt(e.id, dt);
        body += '<td class="ac ' + (st ? 's' + st : (dt.getDay() === WOFF() ? 'sun' : '')) + '" data-act="attCell" data-emp="' + esc(e.id) + '" data-date="' + ymd(dt) + '" title="' + esc(dmy(ymd(dt)) + ' ' + DOW[dt.getDay()]) + '"><i>' + d + '</i><b>' + st + '</b></td>';
      }
      body += '</tr>';
    }
    var calc = []; for (var mm = 0; mm < 12; mm++) calc.push(calcMonth(e, y, mm));
    function frow(label, fn) { return '<tr><td class="lb">' + label + '</td>' + calc.map(function (r) { return '<td>' + (r.days ? fn(r) : '–') + '</td>'; }).join('') + '</tr>'; }
    var foot = frow('Present', function (r) { return r.P; }) + frow('Half day', function (r) { return r.H; }) + frow('Absent', function (r) { return r.A; }) +
      frow('Total day', function (r) { return dayWord(r.P + r.H * 0.5); }) + frow('Payable', function (r) { return (r.P + r.H + r.A) ? dayWord(r.payable) : '–'; }) + frow('Salary', function (r) { return (r.P + r.H + r.A) ? inr(r.gross) : '–'; });
    var opts = emps.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === e.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    return shell('Employee Attendance Sheet',
      '<div class="fieldset"><div class="form-grid">' +
      '<div class="field"><label for="o-sheet-emp">Name</label><select id="o-sheet-emp">' + opts + '</select></div>' +
      '<div class="field"><label>Joining date</label><input type="text" readonly value="' + esc(dmy(e.joinDate)) + '"></div>' +
      '<div class="field"><label>Monthly salary</label><input type="text" readonly value="' + esc(inr(num(e.salary) || 0)) + '"></div>' +
      '<div class="field"><label>Year</label><div class="o-day"><button type="button" class="btn btn-secondary btn-sm" data-act="attYear" data-delta="-1" aria-label="Previous year">‹</button><b style="font-size:20px;min-width:64px;text-align:center">' + y + '</b><button type="button" class="btn btn-secondary btn-sm" data-act="attYear" data-delta="1" aria-label="Next year">›</button></div></div></div>' +
      '<div class="o-legend"><span><b style="background:#1f8a47">P</b>Present</span><span><b style="background:#e0a100;color:#1a1200">H</b>Half day</span><span><b style="background:#d6443a">A</b>Absent</span><span>Click a day to change it: empty → P → H → A → empty. Grey rows are ' + OFFNAME() + 's (weekly holiday).</span></div></div>' +
      '<div class="o-scroll"><table class="o-sheet"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>',
      { sub: esc(e.name) + ' · ' + y });
  };
  ACTIONS.attCell = function (el) {
    var dt = parseYmd(el.dataset.date); if (!dt) return;
    var order = ['', 'P', 'H', 'A'], cur = getSt(el.dataset.emp, dt);
    setSt(el.dataset.emp, dt, order[(order.indexOf(cur) + 1) % 4]); rerender();
  };
  ACTIONS.attYear = function (el) { S.view.p.year = (+S.view.p.year || new Date().getFullYear()) + (+el.dataset.delta); rerender(); };
  ACTIONS.attSheetOpen = function (el) { A.go('attSheet', { id: el.dataset.id, year: new Date().getFullYear() }); };
  document.addEventListener('change', function (e) {
    if (e.target.id === 'o-sheet-emp' && S.view.name === 'attSheet') { S.view.p.id = e.target.value; rerender(); }
  });

  /* ============================== monthly salary ============================== */
  var PAYSEL = { y: new Date().getFullYear(), m: new Date().getMonth() };
  function r26() { return String(parseInt(D.set.workDays, 10) || 26); }
  function payRows(y, m) {
    var first = new Date(y, m, 1), last = new Date(y, m, dim(y, m));
    return D.employees.filter(function (e) {
      var j = parseYmd(e.joinDate), l = parseYmd(e.leftDate);
      return (!j || j <= last) && (!l || l >= first);
    }).sort(byName).map(function (e) { return { e: e, r: calcMonth(e, y, m) }; });
  }
  function sumRows(rows) { var t = { gross: 0, bonus: 0, ded: 0, net: 0, unmarked: 0 }; rows.forEach(function (x) { t.gross += x.r.gross; t.bonus += x.r.bonus; t.ded += x.r.ded; t.net += x.r.net; t.unmarked += x.r.unmarked; }); return t; }
  SCREENS.attPayroll = function (p) {
    p = p || {};
    if (p.ym) { var mm = /^(\d{4})-(\d{2})$/.exec(p.ym); if (mm) { PAYSEL.y = +mm[1]; PAYSEL.m = +mm[2] - 1; } }
    var y = PAYSEL.y, m = PAYSEL.m, rows = payRows(y, m), t = sumRows(rows);
    var now = new Date(), partial = (y === now.getFullYear() && m === now.getMonth());
    var future = (y * 12 + m > now.getFullYear() * 12 + now.getMonth());
    var tr = rows.map(function (x) {
      var e = x.e, r = x.r, rec = D.att[attKey(e.id, y, m)] || {};
      return '<tr><td><b>' + esc(e.name) + '</b></td><td>' + esc(inr(num(e.salary) || 0)) + '</td><td>' + r.P + '</td><td>' + r.H + '</td><td>' + r.A + '</td>' +
        '<td' + (r.unmarked ? ' class="neg"' : '') + '>' + r.unmarked + '</td><td>' + dayWord(r.sunPaid) + '</td><td>' + dayWord(r.payable) + ' / ' + r.div + '</td><td>' + esc(inr(r.gross)) + '</td>' +
        '<td><input id="o-bonus-' + esc(e.id) + '" type="text" inputmode="decimal" value="' + (rec.bonus ? esc(rec.bonus) : '') + '" placeholder="0" aria-label="Bonus or overtime for ' + esc(e.name) + '"></td>' +
        '<td><input id="o-ded-' + esc(e.id) + '" type="text" inputmode="decimal" value="' + (rec.ded ? esc(rec.ded) : '') + '" placeholder="0" aria-label="Advance or deduction for ' + esc(e.name) + '"></td>' +
        '<td class="net" id="o-net-' + esc(e.id) + '">' + esc(inr(r.net)) + '</td></tr>';
    }).join('');
    var monthOpts = MONTHS.map(function (n, i) { return '<option value="' + i + '"' + (i === m ? ' selected' : '') + '>' + n + '</option>'; }).join('');
    var yearOpts = ''; for (var yy = y - 5; yy <= y + 1; yy++) yearOpts += '<option value="' + yy + '"' + (yy === y ? ' selected' : '') + '>' + yy + '</option>';
    return shell('Monthly Salary',
      '<div class="o-day"><button type="button" class="btn btn-secondary" data-act="payMonth" data-delta="-1">‹ Previous</button>' +
      '<select id="o-pay-m" aria-label="Month" style="max-width:170px">' + monthOpts + '</select><select id="o-pay-y" aria-label="Year" style="max-width:110px">' + yearOpts + '</select>' +
      '<button type="button" class="btn btn-secondary" data-act="payMonth" data-delta="1">Next ›</button><button type="button" class="btn btn-secondary" data-act="payMonth" data-delta="0">This month</button></div>' +
      (partial ? '<div class="note info">This month is still running. Amounts are calculated up to today and update as you mark attendance.</div>' : '') +
      (future ? '<div class="note info">This month has not started yet.</div>' : '') +
      '<div id="o-pay-warn">' + (t.unmarked ? '<div class="note warn">' + plural(t.unmarked, 'working day') + ' not marked yet. Unmarked days count as absent. Mark them in <b>Mark Attendance</b> or <b>Employee Sheets</b>.</div>' : '') + '</div>' +
      (rows.length ? '<div class="o-scroll"><table class="o-pay"><thead><tr><th>Employee</th><th>Monthly salary</th><th>Present</th><th>Half day</th><th>Absent</th><th>Not marked</th><th>Holiday work</th><th>Payable days</th><th>Salary</th><th>Bonus / overtime (+)</th><th>Advance / deduction (−)</th><th>Net pay</th></tr></thead><tbody>' + tr + '</tbody>' +
        '<tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td id="o-tot-gross">' + esc(inr(t.gross)) + '</td><td id="o-tot-bonus">' + esc(inr(t.bonus)) + '</td><td id="o-tot-ded">' + esc(inr(t.ded)) + '</td><td id="o-tot-net">' + esc(inr(t.net)) + '</td></tr></tfoot></table></div>' +
        '<div class="btn-row"><button type="button" class="btn" data-act="payPdf">Download salary sheet (PDF)</button><button type="button" class="btn btn-secondary" data-act="payCsv">Export to Excel (CSV)</button></div>'
        : '<div class="empty"><strong>No employees in ' + esc(MONTHS[m] + ' ' + y) + '</strong><p>Add employees and mark their attendance to see salaries here.</p><button type="button" class="btn" data-act="empNew">Add Employee</button></div>') +
      '<div class="fieldset"><h2>How salary is worked out</h2>' +
      '<p>Salary per day = monthly salary ÷ <b>' + r26() + ' working days</b>. Payable days = present days (not counting ' + OFFNAME() + 's) + ½ × half days, never more than ' + r26() + ', plus ' + OFFNAME() + ' work' + (D.set.sundayWork === 'extra' ? ' (paid as an extra day)' : ' (not paid extra)') + '. Net pay = salary + bonus − advance/deduction, rounded to the nearest rupee. ' + OFFNAME() + 's are the weekly holiday and are not counted. Days before joining or after the last working day are not counted.</p>' +
      '<div class="form-grid"><div class="field"><label for="o-weeklyoff">Weekly holiday</label><select id="o-weeklyoff">' + DOW.map(function (n, i) { return '<option value="' + i + '"' + (i === WOFF() ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div><div class="field"><label for="o-workdays">Working days in a month</label><input id="o-workdays" type="text" inputmode="numeric" value="' + esc(D.set.workDays) + '"></div>' +
      '<div class="field"><label for="o-sunwork">If someone works on the weekly holiday</label><select id="o-sunwork"><option value="extra"' + (D.set.sundayWork === 'extra' ? ' selected' : '') + '>Paid as an extra day (half day = half pay)</option><option value="none"' + (D.set.sundayWork === 'none' ? ' selected' : '') + '>No extra pay</option></select></div></div></div>',
      { sub: esc(MONTHS[m] + ' ' + y) + ' · ' + plural(rows.length, 'employee') });
  };
  ACTIONS.payMonth = function (el) {
    var k = +el.dataset.delta, now = new Date();
    if (k === 0) { PAYSEL.y = now.getFullYear(); PAYSEL.m = now.getMonth(); }
    else { var d = new Date(PAYSEL.y, PAYSEL.m + k, 1); PAYSEL.y = d.getFullYear(); PAYSEL.m = d.getMonth(); }
    S.view.p.ym = mkey(PAYSEL.y, PAYSEL.m); rerender();
  };
  function updatePayTotals() {
    var rows = payRows(PAYSEL.y, PAYSEL.m), t = sumRows(rows), set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    rows.forEach(function (x) { set('o-net-' + x.e.id, inr(x.r.net)); });
    set('o-tot-gross', inr(t.gross)); set('o-tot-bonus', inr(t.bonus)); set('o-tot-ded', inr(t.ded)); set('o-tot-net', inr(t.net));
  }
  document.addEventListener('change', function (e) {
    var t = e.target, id = t.id || '', m;
    if (S.view.name !== 'attPayroll') return;
    if (id === 'o-pay-m' || id === 'o-pay-y') { PAYSEL.m = +document.getElementById('o-pay-m').value; PAYSEL.y = +document.getElementById('o-pay-y').value; S.view.p.ym = mkey(PAYSEL.y, PAYSEL.m); rerender(); return; }
    if (id === 'o-workdays') {
      var wd = parseInt(t.value, 10);
      if (!(wd >= 1 && wd <= 31)) { toast('Enter a number of days from 1 to 31.', 'err'); t.value = D.set.workDays; return; }
      D.set.workDays = wd; saveSet(); rerender(); return;
    }
    if (id === 'o-weeklyoff') { D.set.weeklyOff = parseInt(t.value, 10); saveSet(); rerender(); return; }
    if (id === 'o-sunwork') { D.set.sundayWork = t.value; saveSet(); rerender(); return; }
    m = /^o-(bonus|ded)-(.+)$/.exec(id);
    if (m) {
      var v = t.value.trim() === '' ? 0 : num(t.value);
      if (!(v >= 0)) { toast('Enter an amount of 0 or more.', 'err'); t.value = ''; v = 0; }
      var key = attKey(m[2], PAYSEL.y, PAYSEL.m), r = D.att[key] || { days: {}, bonus: 0, ded: 0 };
      r[m[1]] = v; D.att[key] = r; put(K.att + key, r); updatePayTotals();
    }
  });
  function payTable() {
    var rows = payRows(PAYSEL.y, PAYSEL.m), t = sumRows(rows);
    return { rows: rows, t: t, title: MONTHS[PAYSEL.m] + ' ' + PAYSEL.y };
  }
  ACTIONS.payPdf = async function () {
    if (!window.MBM_PDF) { toast('PDF is not ready yet. Try again in a moment.', 'err'); return; }
    var P = payTable(), cur = new Date();
    var sec = {
      title: 'Salary sheet: ' + P.title, count: plural(P.rows.length, 'employee'),
      cols: [{ h: '#', w: 0.04 }, { h: 'Employee', w: 0.16 }, { h: 'Monthly salary', w: 0.09, align: 'right' }, { h: 'Present', w: 0.05, align: 'right' }, { h: 'Half day', w: 0.05, align: 'right' },
        { h: 'Absent', w: 0.05, align: 'right' }, { h: 'Not marked', w: 0.06, align: 'right' }, { h: 'Holiday work', w: 0.06, align: 'right' }, { h: 'Payable days', w: 0.07, align: 'right' },
        { h: 'Salary', w: 0.09, align: 'right' }, { h: 'Bonus (+)', w: 0.07, align: 'right' }, { h: 'Deduction (−)', w: 0.08, align: 'right' }, { h: 'Net pay', w: 0.13, align: 'right' }],
      rows: P.rows.map(function (x, i) {
        return [String(i + 1), x.e.name, inr(num(x.e.salary) || 0), String(x.r.P), String(x.r.H), String(x.r.A), String(x.r.unmarked), dayWord(x.r.sunPaid), dayWord(x.r.payable), inr(x.r.gross), inr(x.r.bonus), inr(x.r.ded), inr(x.r.net)];
      }),
      summary: ['Total salary: ' + inr(P.t.gross) + '   ·   Bonus: ' + inr(P.t.bonus) + '   ·   Deductions: ' + inr(P.t.ded) + '   ·   Total net pay: ' + inr(P.t.net)]
    };
    var basis = 'Salary per day = monthly salary ÷ ' + r26() + ' working days · ' + OFFNAME() + ' work ' + (D.set.sundayWork === 'extra' ? 'paid as an extra day' : 'not paid extra');
    try {
      toast('Making your PDF…');
      var bytes = await window.MBM_PDF.build({ sections: [sec], subtitle: basis + ' · created ' + dmy(ymd(cur)) });
      await A.saveBinary('salary-' + mkey(PAYSEL.y, PAYSEL.m) + '.pdf', bytes);
    } catch (e) { toast('Could not make the PDF: ' + (e && e.message || e), 'err'); }
  };
  ACTIONS.payCsv = function () {
    var P = payTable();
    function cell(v) { v = String(v === undefined || v === null ? '' : v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var lines = [['Employee', 'Monthly salary', 'Present', 'Half day', 'Absent', 'Not marked', 'Holiday work', 'Payable days', 'Salary', 'Bonus', 'Deduction', 'Net pay'].join(',')];
    P.rows.forEach(function (x) { lines.push([x.e.name, num(x.e.salary) || 0, x.r.P, x.r.H, x.r.A, x.r.unmarked, dayWord(x.r.sunPaid), dayWord(x.r.payable), x.r.gross, x.r.bonus, x.r.ded, x.r.net].map(cell).join(',')); });
    lines.push(['Total', '', '', '', '', '', '', '', P.t.gross, P.t.bonus, P.t.ded, P.t.net].join(','));
    A.saveFile('salary-' + mkey(PAYSEL.y, PAYSEL.m) + '.csv', lines.join('\r\n'));
  };

  // the wide tables get more room than the 1040 px page column
  function widen() { var m = document.querySelector('main.wrap'); if (m) m.style.maxWidth = '1360px'; }
  AFTER.attSheet = widen; AFTER.attPayroll = widen;

  /* ============================== dashboard tiles ============================== */
  ACTIONS.offGoToday = function () { AT.date = today(); A.go('attToday', {}); };
  ACTIONS.offGoSheet = function () { A.go('attSheet', { year: new Date().getFullYear() }); };
  ACTIONS.offGoPay = function () { PAYSEL.y = new Date().getFullYear(); PAYSEL.m = new Date().getMonth(); A.go('attPayroll', { ym: mkey(PAYSEL.y, PAYSEL.m) }); };
  ACTIONS.offGoEmp = function () { A.go('empList', {}); };
  function tile(label, desc, act, cls) { return '<button type="button" class="tile ' + (cls || '') + '" data-act="' + act + '"><span class="tile-top"><strong>' + esc(label) + '</strong></span><span>' + esc(desc) + '</span></button>'; }
  var origDash = SCREENS.dashboard;
  SCREENS.dashboard = function () {
    var html = origDash.apply(this, arguments), now = new Date();
    var here = D.employees.filter(function (e) { return inService(e, now); });
    var marked = here.filter(function (e) { return getSt(e.id, now); }).length;
    var block =
      '<section><h2 class="sec-title">Delivery challan</h2><div class="tiles">' +
      tile('New Delivery Challan', 'Next number ' + nextChallanNo(today()).no + ' is picked for you', 'chlNew', 'tile-primary') +
      tile('Saved Challans', plural(D.challans.length, 'challan') + ' · download PDF again or copy', 'chlList') +
      '</div></section>' +
      '<section><h2 class="sec-title">Attendance and salary</h2><div class="tiles">' +
      tile('Mark Attendance', here.length ? 'Today: ' + marked + ' of ' + here.length + ' marked' : 'Add your employees first', 'offGoToday', 'tile-primary') +
      tile('Employee Sheets', 'Yearly attendance sheet for each employee', 'offGoSheet') +
      tile('Monthly Salary', 'Salary worked out automatically each month', 'offGoPay') +
      tile('Employees', plural(D.employees.length, 'employee') + ' · joining date and salary', 'offGoEmp') +
      '</div></section>';
    var marker = '<section><h2 class="sec-title">Data</h2>', i = html.indexOf(marker);
    return i < 0 ? html : html.slice(0, i) + block + html.slice(i);
  };
  Object.assign(A.TITLES, { challanForm: 'Delivery Challan', challanList: 'Saved Challans', attToday: 'Mark Attendance', empList: 'Employees', empForm: 'Employee', attSheet: 'Employee Attendance Sheet', attPayroll: 'Monthly Salary' });

  /* ============================== backup and restore ============================== */
  function collect() { return { challans: D.challans, employees: D.employees, attendance: D.att, settings: D.set }; }
  function hasData() { return D.challans.length || D.employees.length || Object.keys(D.att).length; }
  window.MBM_OFFICE = {
    collect: collect,
    restore: function (o) {
      if (!o || typeof o !== 'object') return '';
      var nc = 0, ne = 0, na = 0;
      (Array.isArray(o.challans) ? o.challans : []).forEach(function (c) {
        if (c && typeof c.id === 'string' && Array.isArray(c.items) && c.no && c.customer !== undefined) { put(K.chl + c.id, c); upsert(D.challans, c); nc++; }
      });
      (Array.isArray(o.employees) ? o.employees : []).forEach(function (e) {
        if (e && typeof e.id === 'string' && e.name) { put(K.emp + e.id, e); upsert(D.employees, e); ne++; }
      });
      if (o.attendance && typeof o.attendance === 'object') Object.keys(o.attendance).forEach(function (k) {
        var r = o.attendance[k]; if (/^[^:]+:\d{4}-\d{2}$/.test(k) && r && typeof r.days === 'object') { D.att[k] = r; put(K.att + k, r); na++; }
      });
      return (nc || ne || na) ? ' Also restored ' + plural(nc, 'challan') + ', ' + plural(ne, 'employee') + ' and ' + plural(na, 'month') + ' of attendance.' : '';
    }
  };
  if (window.MBM && typeof window.MBM.makeBackup === 'function') {
    var origBackup = window.MBM.makeBackup;
    window.MBM.makeBackup = function () {
      var b = origBackup.apply(this, arguments);
      try { if (hasData()) b.officeTools = JSON.parse(JSON.stringify(collect())); } catch (e) { /* keep the normal backup */ }
      return b;
    };
  }

  // the dashboard may already be on screen: draw it again with the new tiles
  if (S.view && S.view.name === 'dashboard') A.render();
})();
