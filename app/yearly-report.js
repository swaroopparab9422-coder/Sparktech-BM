/* Yearly business report (PO based): one report for every financial year (April to March).
 * Lives in Settings. Downloads as PDF (A4 landscape, Spark Tech colours) or Excel (.xlsx with live formulas). */
(function () {
  'use strict';
  var A = window.MBM_APP;
  if (!A || !A.SCREENS) return;
  var S = A.S, esc = A.esc, toast = A.toast, plural = A.plural;

  /* ---------------------------------------------------------------- data */
  var PREF_KEY = 'mbm:rpt';
  function prefs() { try { return Object.assign({ company: 'Spark Tech Automation', preparedBy: '', fy: '' }, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { return { company: 'Spark Tech Automation', preparedBy: '', fy: '' }; } }
  function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseYmd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function dmy(s) { var d = parseYmd(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function fyOf(s) { var d = parseYmd(s); if (!d) return null; return d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear(); }
  function fyLabel(y) { return y + '-' + pad((y + 1) % 100); }
  function curFy() { var d = new Date(); return d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear(); }
  function fyList() {
    var set = {}; set[curFy()] = 1;
    (S.pos || []).forEach(function (p) { var y = fyOf(p.poDate); if (y !== null) set[y] = 1; });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }
  function fmt(n, cur) {
    try { return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n); }
    catch (e) { return cur + ' ' + n; }
  }
  function symbol(cur) {
    try { var parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).formatToParts(0); for (var i = 0; i < parts.length; i++) if (parts[i].type === 'currency') return parts[i].value; } catch (e) { /* ignore */ }
    return cur;
  }
  function buildReport(fy) {
    var all = (S.pos || []).filter(function (p) { return fyOf(p.poDate) === fy; });
    all.sort(function (a, b) { return (a.poDate || '').localeCompare(b.poDate || '') || (a.poNumber || '').localeCompare(b.poNumber || ''); });
    var count = {}; all.forEach(function (p) { count[p.currency] = (count[p.currency] || 0) + 1; });
    var main = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0] || (S.settings && S.settings.currency) || 'INR';
    var by = {};   // totals per currency
    all.forEach(function (p) {
      var c = by[p.currency] || (by[p.currency] = { total: 0, done: 0, pending: 0 });
      var v = Number(p.value) || 0; c.total += v; if (p.status === 'Completed') c.done += v; else c.pending += v;
    });
    var m = by[main] || { total: 0, done: 0, pending: 0 };
    var nDone = all.filter(function (p) { return p.status === 'Completed'; }).length;
    var pr = prefs();
    return { fy: fy, label: fyLabel(fy), company: pr.company, preparedBy: pr.preparedBy, rows: all, main: main, by: by, mixed: Object.keys(by).length > 1,
      total: m.total, done: m.done, pending: m.pending, nTotal: all.length, nDone: nDone, nPending: all.length - nDone,
      pctValue: m.total > 0 ? m.done / m.total : 0, pctPO: all.length ? nDone / all.length : 0,
      noValue: all.filter(function (p) { return p.value === null || p.value === undefined; }).length,
      noDate: (S.pos || []).filter(function (p) { return !p.poDate; }).length };
  }
  function takeaway(r) {
    return 'During the financial year ' + r.label + ', the company received PO business worth ' + fmt(r.total, r.main) + '. Of this, ' + fmt(r.done, r.main) +
      ' worth of POs were completed and ' + fmt(r.pending, r.main) + ' remains pending. Overall business completion by value: ' + (r.pctValue * 100).toFixed(1) + '%.';
  }
  var CALC = 'Calculation: Total PO Business = sum of all PO values received during the year. Completed PO Value = sum of PO values marked Completed. Pending PO Value = sum of PO values marked Not Completed. Business Completion % = Completed PO Value ÷ Total PO Business × 100. This is a PO-completion report, not audited accounting turnover; use one consistent PO value basis (excluding GST is recommended).';

  /* ---------------------------------------------------------------- PDF (A4 landscape) */
  var W = 842, H = 595, M = 28, SC = 3, FONT = '"Roboto","Helvetica Neue",Arial,"Noto Sans",sans-serif';
  var OR = '#f3881e', OR_D = '#d9730d', BLK = '#121212', GREY = '#6b635a', TINT = '#fff1e0', LINE = '#e6dccd';
  var COLS = [{ h: 'PO No.', w: 92 }, { h: 'Customer / Project', w: 236 }, { h: 'PO Date', w: 70 }, { h: 'PO Value (', w: 116, right: true }, { h: 'Status', w: 92 }, { h: 'Remarks', w: 180 }];
  function wrap(ctx, text, width, maxLines) {
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (para) {
      var line = '';
      para.split(/\s+/).forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width <= width) line = t; else { if (line) out.push(line); line = w; while (ctx.measureText(line).width > width && line.length > 1) { var k = line.length - 1; while (k > 1 && ctx.measureText(line.slice(0, k)).width > width) k--; out.push(line.slice(0, k)); line = line.slice(k); } }
      });
      out.push(line);
    });
    if (maxLines && out.length > maxLines) { out = out.slice(0, maxLines); out[maxLines - 1] = out[maxLines - 1].replace(/.{1}$/, '…'); }
    return out;
  }
  function ell(ctx, text, width) { text = String(text || ''); if (ctx.measureText(text).width <= width) return text; while (text.length > 1 && ctx.measureText(text + '…').width > width) text = text.slice(0, -1); return text + '…'; }
  function fitFont(ctx, text, width, size, weight) { while (size > 8) { ctx.font = weight + ' ' + size + 'px ' + FONT; if (ctx.measureText(text).width <= width) break; size -= 0.5; } }
  function newPage() { var cv = document.createElement('canvas'); cv.width = W * SC; cv.height = H * SC; var ctx = cv.getContext('2d'); ctx.scale(SC, SC); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'alphabetic'; return { cv: cv, ctx: ctx }; }
  function loadImg(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function sectionHead(ctx, text, y) { ctx.fillStyle = OR; ctx.fillRect(M, y - 11, 4, 15); ctx.fillStyle = BLK; ctx.font = '700 11px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(text, M + 11, y); }
  function tableHead(ctx, y, sym) {
    ctx.fillStyle = BLK; ctx.fillRect(M, y, W - 2 * M, 20); ctx.fillStyle = OR; ctx.fillRect(M, y + 20, W - 2 * M, 2);
    var x = M; ctx.font = '700 8.5px ' + FONT; ctx.fillStyle = '#fff';
    COLS.forEach(function (c) { var label = c.h === 'PO Value (' ? 'PO Value (' + sym + ')' : c.h; if (c.right) { ctx.textAlign = 'right'; ctx.fillText(label, x + c.w - 8, y + 13.5); } else { ctx.textAlign = 'left'; ctx.fillText(label, x + 8, y + 13.5); } x += c.w; });
    ctx.textAlign = 'left'; return y + 22;
  }
  function header(ctx, r, logo, first) {
    ctx.fillStyle = BLK; ctx.fillRect(0, 0, W, 8); ctx.fillStyle = OR; ctx.fillRect(0, 0, 150, 8);
    if (logo) { var lw = 112, lh = lw * logo.height / logo.width; ctx.drawImage(logo, W - M - lw, 18, lw, lh); }
    ctx.fillStyle = BLK; ctx.textAlign = 'left'; ctx.font = '800 20px ' + FONT; ctx.fillText('YEARLY BUSINESS SUMMARY — PO BASED', M, 46);
    ctx.fillStyle = OR; ctx.fillRect(M, 54, 64, 4);
    if (!first) return 70;
    var items = [['Company Name:', r.company || '—', M], ['Financial Year:', r.label, 330], ['Prepared By:', r.preparedBy || '—', 560]];
    items.forEach(function (it) { ctx.font = '700 9px ' + FONT; ctx.fillStyle = GREY; ctx.fillText(it[0], it[2], 80); var lw2 = ctx.measureText(it[0]).width; ctx.font = '600 10.5px ' + FONT; ctx.fillStyle = BLK; ctx.fillText(ell(ctx, it[1], 200 - lw2), it[2] + lw2 + 6, 80); });
    return 90;
  }
  function kpis(ctx, r, y) {
    var gap = 12, cw = (W - 2 * M - 3 * gap) / 4, sym = symbol(r.main);
    var cards = [
      { t: 'TOTAL PO BUSINESS RECEIVED', v: fmt(r.total, r.main), body: TINT, fg: BLK },
      { t: 'COMPLETED PO VALUE', v: fmt(r.done, r.main), body: BLK, fg: '#ffffff' },
      { t: 'PENDING PO VALUE', v: fmt(r.pending, r.main), body: OR, fg: '#1c0d00' },
      { t: 'TOTAL POs RECEIVED', v: String(r.nTotal), body: '#f3efe8', fg: BLK }];
    cards.forEach(function (c, i) {
      var x = M + i * (cw + gap);
      ctx.fillStyle = c.body; rrect(ctx, x, y, cw, 62, 6); ctx.fill();
      ctx.save(); rrect(ctx, x, y, cw, 62, 6); ctx.clip(); ctx.fillStyle = i === 1 ? OR : BLK; ctx.fillRect(x, y, cw, 20); ctx.restore();
      ctx.fillStyle = i === 1 ? '#1c0d00' : '#fff'; ctx.font = '700 8px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(c.t, x + cw / 2, y + 13);
      ctx.fillStyle = c.fg; fitFont(ctx, c.v, cw - 16, 21, '800'); ctx.fillText(c.v, x + cw / 2, y + 48); ctx.textAlign = 'left';
    });
    return y + 62;
  }
  function completion(ctx, r, y) {
    var gap = 12, cw = (W - 2 * M - 3 * gap) / 4;
    var cells = [['BUSINESS COMPLETION %', (r.pctValue * 100).toFixed(1) + ' %', r.pctValue], ['COMPLETED POs', String(r.nDone), null], ['NOT COMPLETED POs', String(r.nPending), null], ['PO COMPLETION %', (r.pctPO * 100).toFixed(1) + ' %', r.pctPO]];
    cells.forEach(function (c, i) {
      var x = M + i * (cw + gap);
      ctx.fillStyle = '#f7f2ea'; rrect(ctx, x, y, cw, 54, 6); ctx.fill(); ctx.fillStyle = OR; ctx.fillRect(x, y + 6, 3.5, 42);
      ctx.fillStyle = GREY; ctx.font = '700 8px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(c[0], x + 14, y + 16);
      ctx.fillStyle = BLK; ctx.font = '800 19px ' + FONT; ctx.fillText(c[1], x + 14, y + 40);
      if (c[2] !== null) { var bx = x + cw - 74, bw = 60; ctx.fillStyle = '#e4dccf'; rrect(ctx, bx, y + 30, bw, 8, 4); ctx.fill(); if (c[2] > 0) { ctx.fillStyle = OR; rrect(ctx, bx, y + 30, Math.max(8, bw * c[2]), 8, 4); ctx.fill(); } }
    });
    return y + 54;
  }
  async function renderPdf(r) {
    var logo = await loadImg('./logo-dark.png'), pages = [], sym = symbol(r.main), pg = newPage(), y;
    pages.push(pg);
    y = header(pg.ctx, r, logo, true);
    y = kpis(pg.ctx, r, y + 4) + 12; y = completion(pg.ctx, r, y) + 22;
    sectionHead(pg.ctx, 'PO BUSINESS BREAKDOWN', y); y = tableHead(pg.ctx, y + 8, sym);
    var limit = H - 40, ctx = pg.ctx;
    function ensure(h, withHead) {
      if (y + h <= limit) return;
      pg = newPage(); pages.push(pg); ctx = pg.ctx; y = header(ctx, r, logo, false);
      if (withHead) { sectionHead(ctx, 'PO BUSINESS BREAKDOWN (continued)', y + 6); y = tableHead(ctx, y + 14, sym); }
    }
    if (!r.rows.length) { ctx.fillStyle = GREY; ctx.font = '600 10px ' + FONT; ctx.fillText('No purchase orders with a PO date in this financial year.', M + 8, y + 18); y += 30; }
    r.rows.forEach(function (p, i) {
      ctx.font = '700 9px ' + FONT; var cust = wrap(ctx, p.customer || '—', COLS[1].w - 16, 2);
      ctx.font = '8px ' + FONT; var proj = p.project ? wrap(ctx, p.project, COLS[1].w - 16, 1) : [];
      ctx.font = '8.5px ' + FONT; var rem = p.remarks ? wrap(ctx, p.remarks, COLS[5].w - 14, 3) : [];
      var h = Math.max(24, cust.length * 11 + proj.length * 10 + 9, rem.length * 10.5 + 10);
      ensure(h, true);
      if (i % 2 === 0) { ctx.fillStyle = '#fbf6ee'; ctx.fillRect(M, y, W - 2 * M, h); }
      ctx.strokeStyle = LINE; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(M, y + h); ctx.lineTo(W - M, y + h); ctx.stroke();
      var x = M, base = y + 15; ctx.textAlign = 'left'; ctx.fillStyle = BLK;
      ctx.font = '700 9px ' + FONT; ctx.fillText(ell(ctx, p.poNumber || '—', COLS[0].w - 14), x + 8, base); x += COLS[0].w;
      ctx.font = '700 9px ' + FONT; cust.forEach(function (t, k) { ctx.fillText(t, x + 8, base + k * 11); });
      ctx.fillStyle = GREY; ctx.font = '8px ' + FONT; proj.forEach(function (t, k) { ctx.fillText(t, x + 8, base + cust.length * 11 + k * 10 - 1); }); x += COLS[1].w;
      ctx.fillStyle = BLK; ctx.font = '9px ' + FONT; ctx.fillText(dmy(p.poDate), x + 8, base); x += COLS[2].w;
      var val = (p.value === null || p.value === undefined) ? '—' : fmt(p.value, p.currency); ctx.font = '700 9px ' + FONT; ctx.textAlign = 'right'; ctx.fillText(val, x + COLS[3].w - 8, base); ctx.textAlign = 'left'; x += COLS[3].w;
      var done = p.status === 'Completed'; ctx.font = '800 8.5px ' + FONT; ctx.fillStyle = done ? '#1f7a3d' : OR_D; ctx.fillText(done ? 'Completed' : 'Not Completed', x + 8, base);
      if (!done && p.status) { ctx.font = '7.5px ' + FONT; ctx.fillStyle = GREY; ctx.fillText(ell(ctx, p.status, COLS[4].w - 12), x + 8, base + 10); } x += COLS[4].w;
      ctx.fillStyle = '#3b352d'; ctx.font = '8.5px ' + FONT; rem.forEach(function (t, k) { ctx.fillText(t, x + 7, base + k * 10.5); });
      y += h;
    });
    // total row
    ensure(26, true);
    ctx.fillStyle = BLK; ctx.fillRect(M, y, W - 2 * M, 22); ctx.fillStyle = '#fff'; ctx.font = '800 9px ' + FONT; ctx.textAlign = 'left'; ctx.fillText('TOTAL (' + plural(r.nTotal, 'PO') + ')', M + 8, y + 14.5);
    ctx.textAlign = 'right'; ctx.fillStyle = OR; ctx.fillText(fmt(r.total, r.main), M + COLS[0].w + COLS[1].w + COLS[2].w + COLS[3].w - 8, y + 14.5); ctx.textAlign = 'left'; y += 22;
    if (r.mixed) { ctx.fillStyle = GREY; ctx.font = '7.5px ' + FONT; var other = Object.keys(r.by).filter(function (c) { return c !== r.main; }).map(function (c) { return c + ' ' + fmt(r.by[c].total, c); }).join(', '); ctx.fillText('Other currencies are not added to the totals above: ' + other + '.', M, y + 11); y += 14; }
    // takeaway
    ensure(118, false);
    y += 28; sectionHead(ctx, 'MANAGEMENT TAKEAWAY', y); y += 8;
    ctx.font = '600 10px ' + FONT; var tk = wrap(ctx, takeaway(r), W - 2 * M - 34, 5), bh = tk.length * 14 + 18;
    ctx.fillStyle = TINT; rrect(ctx, M, y, W - 2 * M, bh, 6); ctx.fill(); ctx.fillStyle = OR; ctx.fillRect(M, y + 6, 4, bh - 12);
    ctx.fillStyle = BLK; tk.forEach(function (t, k) { ctx.fillText(t, M + 18, y + 18 + k * 14); }); y += bh + 10;
    ctx.fillStyle = GREY; ctx.font = '7.5px ' + FONT; wrap(ctx, CALC, W - 2 * M, 4).forEach(function (t, k) { ctx.fillText(t, M, y + 8 + k * 10); });
    // footers
    var made = dmy(new Date().getFullYear() + '-' + pad(new Date().getMonth() + 1) + '-' + pad(new Date().getDate()));
    pages.forEach(function (p, i) {
      var c = p.ctx; c.strokeStyle = OR; c.lineWidth = 1; c.beginPath(); c.moveTo(M, H - 26); c.lineTo(W - M, H - 26); c.stroke();
      c.fillStyle = GREY; c.font = '8px ' + FONT; c.textAlign = 'left'; c.fillText((r.company || 'Spark Tech Automation') + ' · Yearly PO Business Report · FY ' + r.label + ' · created ' + made, M, H - 14);
      c.textAlign = 'right'; c.fillText('Page ' + (i + 1) + ' of ' + pages.length, W - M, H - 14); c.textAlign = 'left';
    });
    return pages;
  }
  function b64ToBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function strBytes(s) { var a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }
  function pdfBytes(pages) {
    var chunks = [], offsets = [], pos = 0;
    function push(b) { if (typeof b === 'string') b = strBytes(b); chunks.push(b); pos += b.length; }
    function obj(n, body) { offsets[n] = pos; push(n + ' 0 obj\n'); push(body); push('\nendobj\n'); }
    var n = pages.length, kids = [], i;
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'); obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    for (i = 0; i < n; i++) kids.push((3 + 3 * i) + ' 0 R');
    obj(2, '<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>');
    pages.forEach(function (p, i2) {
      var url = p.cv.toDataURL('image/jpeg', 0.92), bytes = b64ToBytes(url.slice(url.indexOf(',') + 1));
      var pg = 3 + 3 * i2, ct = pg + 1, im = pg + 2;
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      var content = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q'; obj(ct, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offsets[im] = pos; push(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.cv.width + ' /Height ' + p.cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bytes.length + ' >>\nstream\n'); push(bytes); push('\nendstream\nendobj\n');
    });
    var total = 3 + 3 * n, xref = pos; push('xref\n0 ' + total + '\n0000000000 65535 f \n');
    for (i = 1; i < total; i++) push(('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n');
    push('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(pos), at = 0; chunks.forEach(function (c) { out.set(c, at); at += c.length; }); return out;
  }

  /* ---------------------------------------------------------------- Excel (.xlsx, written by hand) */
  var CRC = (function () { var t = [], n, c, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF, i; for (i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function zip(files) {
    var parts = [], central = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; } function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, data);
      central.push({ name: name, crc: crc, size: data.length, off: off });
      off += head.length + name.length + data.length;
    });
    var cstart = off, csize = 0;
    central.forEach(function (c) {
      var h = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
      parts.push(new Uint8Array(h), c.name); csize += h.length + c.name.length;
    });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(csize), u32(cstart), u16(0))));
    var len = 0; parts.forEach(function (p) { len += p.length; }); var out = new Uint8Array(len), at = 0; parts.forEach(function (p) { out.set(p, at); at += p.length; }); return out;
  }
  function x(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colName(i) { return String.fromCharCode(65 + i); }
  function serial(s) { var d = parseYmd(s); return d ? Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000) : ''; }
  function xlsxBytes(r) {
    var curs = Object.keys(r.by); if (curs.indexOf(r.main) < 0) curs.push(r.main);
    // styles: fonts / fills / borders / numFmts / cellXfs
    var numFmts = ['<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>'], curFmt = {};
    curs.forEach(function (c, i) { var id = 170 + i; curFmt[c] = id; numFmts.push('<numFmt numFmtId="' + id + '" formatCode="' + x('"' + symbol(c) + ' "#,##0.00') + '"/>'); });
    var fonts = ['<font><sz val="10"/><name val="Calibri"/></font>', '<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><name val="Calibri"/></font>', '<font><sz val="9"/><color rgb="FF6B635A"/><name val="Calibri"/></font>', '<font><b/><sz val="12"/><name val="Calibri"/></font>'];
    var fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FF121212"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFF3881E"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1E0"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFFBF6EE"/></patternFill></fill>'];
    var borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color rgb="FFE6DCCD"/></left><right style="thin"><color rgb="FFE6DCCD"/></right><top style="thin"><color rgb="FFE6DCCD"/></top><bottom style="thin"><color rgb="FFE6DCCD"/></bottom><diagonal/></border>'];
    var xfs = [], xfMap = {};
    function xf(key, font, fill, border, numFmt, align) { xfMap[key] = xfs.length; xfs.push('<xf numFmtId="' + numFmt + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + border + '" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"' + (align ? ' applyAlignment="1"><alignment ' + align + '/></xf>' : '/>')); }
    xf('def', 0, 0, 0, 0); xf('title', 1, 2, 0, 0, 'vertical="center"'); xf('head', 2, 2, 1, 0, 'horizontal="center" vertical="center" wrapText="1"'); xf('lbl', 3, 0, 0, 0); xf('lblTint', 3, 4, 1, 0, 'vertical="center"');
    xf('txt', 0, 0, 1, 0, 'vertical="top" wrapText="1"'); xf('txtZ', 0, 5, 1, 0, 'vertical="top" wrapText="1"'); xf('date', 0, 0, 1, 164, 'horizontal="center" vertical="top"'); xf('dateZ', 0, 5, 1, 164, 'horizontal="center" vertical="top"');
    xf('pct', 5, 4, 1, 10, 'horizontal="right" vertical="center"'); xf('int', 5, 4, 1, 1, 'horizontal="right" vertical="center"'); xf('note', 4, 0, 0, 0, 'vertical="top" wrapText="1"'); xf('take', 3, 4, 1, 0, 'vertical="top" wrapText="1"'); xf('sec', 3, 3, 0, 0, 'vertical="center"');
    xf('totLbl', 2, 2, 1, 0, 'vertical="center"');
    curs.forEach(function (c) { xf('cur' + c, 5, 4, 1, curFmt[c], 'horizontal="right" vertical="center"'); xf('curRow' + c, 0, 0, 1, curFmt[c], 'horizontal="right" vertical="top"'); xf('curRowZ' + c, 0, 5, 1, curFmt[c], 'horizontal="right" vertical="top"'); xf('curTot' + c, 2, 2, 1, curFmt[c], 'horizontal="right" vertical="center"'); });
    var rowsXml = [], merges = [], R = 0;
    function cell(ref, style, kind, v, f) {
      var s = ' s="' + xfMap[style] + '"';
      if (kind === 's') return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
      if (kind === 'n') return '<c r="' + ref + '"' + s + '>' + (f ? '<f>' + x(f) + '</f>' : '') + '<v>' + v + '</v></c>';
      return '<c r="' + ref + '"' + s + '/>';
    }
    function row(n, cells, ht) { rowsXml.push('<row r="' + n + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + cells.join('') + '</row>'); }
    var first = 17, last = first + Math.max(r.rows.length, 1) - 1, rng = function (c) { return c + first + ':' + c + last; };
    var single = !r.mixed;
    // title and info
    row(1, [cell('A1', 'title', 's', 'YEARLY BUSINESS SUMMARY — PO BASED')].concat(['B', 'C', 'D', 'E', 'F'].map(function (c) { return cell(c + '1', 'title', 'e'); })), 30); merges.push('A1:F1');
    row(3, [cell('A3', 'lbl', 's', 'Company Name:'), cell('B3', 'lbl', 's', r.company), cell('C3', 'lbl', 's', 'Financial Year:'), cell('D3', 'lbl', 's', r.label), cell('E3', 'lbl', 's', 'Prepared By:'), cell('F3', 'lbl', 's', r.preparedBy)]);
    // summary block
    var cs = 'cur' + r.main, sumTotal = single ? 'SUM(' + rng('D') + ')' : '', sumDone = single ? 'SUMIF(' + rng('E') + ',"Completed",' + rng('D') + ')' : '';
    row(5, [cell('A5', 'sec', 's', 'SUMMARY'), cell('B5', 'sec', 'e')]);
    function srow(n, label, style, val, f) { row(n, [cell('A' + n, 'lblTint', 's', label), cell('B' + n, style, 'n', val, f)], 20); }
    srow(6, 'TOTAL PO BUSINESS RECEIVED', cs, r.total, single ? sumTotal : '');
    srow(7, 'COMPLETED PO VALUE', cs, r.done, single ? sumDone : '');
    srow(8, 'PENDING PO VALUE', cs, r.pending, single ? 'B6-B7' : '');
    srow(9, 'TOTAL POs RECEIVED', 'int', r.nTotal, 'COUNTA(' + rng('A') + ')');
    srow(10, 'COMPLETED POs', 'int', r.nDone, 'COUNTIF(' + rng('E') + ',"Completed")');
    srow(11, 'NOT COMPLETED POs', 'int', r.nPending, 'B9-B10');
    srow(12, 'BUSINESS COMPLETION %', 'pct', r.pctValue, 'IF(B6=0,0,B7/B6)');
    srow(13, 'PO COMPLETION %', 'pct', r.pctPO, 'IF(B9=0,0,B10/B9)');
    row(15, [cell('A15', 'sec', 's', 'PO BUSINESS BREAKDOWN')].concat(['B', 'C', 'D', 'E', 'F'].map(function (c) { return cell(c + '15', 'sec', 'e'); })));
    row(16, ['PO No.', 'Customer / Project', 'PO Date', 'PO Value (' + symbol(r.main) + ')', 'Status', 'Remarks'].map(function (h, i) { return cell(colName(i) + '16', 'head', 's', h); }), 22);
    if (!r.rows.length) row(first, [cell('A' + first, 'txt', 's', 'No purchase orders with a PO date in this financial year.')]);
    r.rows.forEach(function (p, i) {
      var n = first + i, z = i % 2 === 1 ? 'Z' : '', done = p.status === 'Completed';
      var hasVal = !(p.value === null || p.value === undefined);
      row(n, [cell('A' + n, 'txt' + z, 's', p.poNumber), cell('B' + n, 'txt' + z, 's', p.customer + (p.project ? ' / ' + p.project : '')), cell('C' + n, 'date' + z, 'n', serial(p.poDate)),
        hasVal ? cell('D' + n, 'curRow' + z + p.currency, 'n', p.value) : cell('D' + n, 'txt' + z, 'e'), cell('E' + n, 'txt' + z, 's', done ? 'Completed' : 'Not Completed'), cell('F' + n, 'txt' + z, 's', p.remarks)]);
    });
    var tr = last + 1;
    row(tr, [cell('A' + tr, 'totLbl', 's', 'TOTAL'), cell('B' + tr, 'totLbl', 'e'), cell('C' + tr, 'totLbl', 'e'), cell('D' + tr, 'curTot' + r.main, 'n', r.total, single ? 'SUM(' + rng('D') + ')' : ''), cell('E' + tr, 'totLbl', 'e'), cell('F' + tr, 'totLbl', 'e')], 22);
    var t1 = tr + 2; row(t1, [cell('A' + t1, 'sec', 's', 'MANAGEMENT TAKEAWAY')].concat(['B', 'C', 'D', 'E', 'F'].map(function (c) { return cell(c + t1, 'sec', 'e'); })));
    var t2 = t1 + 1; row(t2, [cell('A' + t2, 'take', 's', takeaway(r))].concat(['B', 'C', 'D', 'E', 'F'].map(function (c) { return cell(c + t2, 'take', 'e'); })), 48); merges.push('A' + t2 + ':F' + t2);
    var t3 = t2 + 1; row(t3, [cell('A' + t3, 'note', 's', CALC + (r.mixed ? ' Other currencies are listed in the table but are not added to the totals.' : ''))], 54); merges.push('A' + t3 + ':F' + t3);
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
      '<cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="46" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/><col min="5" max="5" width="16" customWidth="1"/><col min="6" max="6" width="40" customWidth="1"/></cols>' +
      '<sheetData>' + rowsXml.join('') + '</sheetData><mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts><fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    return zip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FY ' + x(r.label) + '" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: styles }, { name: 'xl/worksheets/sheet1.xml', data: sheet }]);
  }

  /* ---------------------------------------------------------------- Settings block + actions */
  function reportBlock() {
    var pr = prefs(), list = fyList(), sel = (pr.fy && list.indexOf(+pr.fy) >= 0) ? +pr.fy : list[0];
    var r = buildReport(sel);
    return '<div class="fieldset" id="rep-box"><h2>Yearly business report (PO based)</h2>' +
      '<p class="muted">One report for each financial year (April to March), with the totals, completion %, the full PO list and a management summary. Use it at the end of March for the year that just ended.</p>' +
      '<div class="form-grid"><div class="field"><label for="o-rep-fy">Financial year</label><select id="o-rep-fy">' + list.map(function (y) { return '<option value="' + y + '"' + (y === sel ? ' selected' : '') + '>FY ' + fyLabel(y) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="o-rep-co">Company name</label><input id="o-rep-co" type="text" value="' + esc(pr.company) + '"></div>' +
      '<div class="field"><label for="o-rep-by">Prepared by</label><input id="o-rep-by" type="text" value="' + esc(pr.preparedBy) + '" placeholder="Name"></div></div>' +
      '<p class="muted" id="o-rep-sum">' + esc(plural(r.nTotal, 'PO') + ' in FY ' + r.label + ': ' + r.nDone + ' completed, ' + r.nPending + ' not completed.') + (r.noDate ? ' ' + esc(plural(r.noDate, 'PO')) + ' without a PO date are not included.' : '') + (r.noValue ? ' ' + esc(plural(r.noValue, 'PO')) + ' without a value count as zero.' : '') + '</p>' +
      '<div class="btn-row"><button type="button" class="btn" data-act="repPdf">Download report (PDF)</button><button type="button" class="btn btn-secondary" data-act="repXlsx">Download report (Excel)</button></div></div>';
  }
  var origSettings = A.SCREENS.settings;
  A.SCREENS.settings = function () {
    var html = origSettings.apply(this, arguments), marker = '<div class="fieldset"><h2>Backup and export</h2>', i = html.indexOf(marker);
    return i < 0 ? html : html.slice(0, i) + reportBlock() + html.slice(i);
  };
  function readInputs() {
    var pr = prefs(), g = function (id) { var e = document.getElementById(id); return e ? e.value : null; };
    if (g('o-rep-fy') !== null) pr.fy = g('o-rep-fy'); if (g('o-rep-co') !== null) pr.company = g('o-rep-co').trim(); if (g('o-rep-by') !== null) pr.preparedBy = g('o-rep-by').trim();
    savePrefs(pr); return pr;
  }
  function current() { var pr = readInputs(), list = fyList(); return buildReport((pr.fy && list.indexOf(+pr.fy) >= 0) ? +pr.fy : list[0]); }
  document.addEventListener('change', function (e) {
    if (['o-rep-fy', 'o-rep-co', 'o-rep-by'].indexOf(e.target.id) < 0) return;
    readInputs(); var r = current(), s = document.getElementById('o-rep-sum');
    if (s) s.textContent = plural(r.nTotal, 'PO') + ' in FY ' + r.label + ': ' + r.nDone + ' completed, ' + r.nPending + ' not completed.' + (r.noDate ? ' ' + plural(r.noDate, 'PO') + ' without a PO date are not included.' : '') + (r.noValue ? ' ' + plural(r.noValue, 'PO') + ' without a value count as zero.' : '');
  });
  A.ACTIONS.repPdf = async function () {
    var r = current();
    if (!r.nTotal && !confirmEmpty(r)) return;
    try { toast('Making the report PDF…'); var pages = await renderPdf(r); await A.saveBinary('Yearly-PO-Business-Report-FY-' + r.label + '.pdf', pdfBytes(pages)); }
    catch (e) { toast('Could not make the report: ' + (e && e.message || e), 'err'); }
  };
  A.ACTIONS.repXlsx = async function () {
    var r = current();
    try { await A.saveBinary('Yearly-PO-Business-Report-FY-' + r.label + '.xlsx', xlsxBytes(r)); }
    catch (e) { toast('Could not make the Excel file: ' + (e && e.message || e), 'err'); }
  };
  function confirmEmpty() { toast('There are no purchase orders with a PO date in this financial year. The report will be empty.'); return true; }
  window.MBM_REPORT = { build: buildReport, renderPdf: renderPdf, pdfBytes: pdfBytes, xlsxBytes: xlsxBytes, fyList: fyList,
    kit: { W: W, H: H, M: M, SC: SC, FONT: FONT, newPage: newPage, wrap: wrap, ell: ell, rrect: rrect, loadImg: loadImg, fitFont: fitFont, zip: zip, xml: x, colName: colName, symbol: symbol } };
})();
