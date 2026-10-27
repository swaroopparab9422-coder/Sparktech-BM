/* PDF of the two saved lists (Saved Quotations and Purchase Orders).
 * Pages are drawn on a canvas (so any language and the rupee sign print correctly) and written into a
 * plain PDF file by hand: no library, no internet. Exposed as window.MBM_PDF.build(options).
 */
(function () {
  'use strict';
  var PW = 842, PH = 595;                // A4 landscape in points
  var SC = 2.2;                          // canvas pixels per point
  var M = 28;                            // page margin
  var ORANGE = '#f3881e', INK = '#141418', MUTED = '#6f675d', LINE = '#e4ded4', ZEBRA = '#faf7f2';
  var FONT = '"Roboto","Helvetica Neue",Arial,"Noto Sans",sans-serif';
  var BODY = 8.5, HEAD = 8, PAD = 4, LH = 11, MAXLINES = 4;

  function loadImage(src) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = src;
    });
  }

  function wrap(ctx, text, width) {
    text = String(text === null || text === undefined || text === '' ? '—' : text);
    var out = [], paras = text.split(/\r?\n/), i, words, line, w, test;
    for (i = 0; i < paras.length; i++) {
      words = paras[i].split(/\s+/); line = '';
      for (w = 0; w < words.length; w++) {
        var word = words[w];
        while (ctx.measureText(word).width > width && word.length > 1) {   // break a very long word
          var k = word.length - 1;
          while (k > 1 && ctx.measureText(word.slice(0, k)).width > width) k--;
          if (line) { out.push(line); line = ''; }
          out.push(word.slice(0, k)); word = word.slice(k);
        }
        test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width <= width) line = test; else { if (line) out.push(line); line = word; }
      }
      out.push(line);
    }
    if (out.length > MAXLINES) {
      out = out.slice(0, MAXLINES);
      var last = out[MAXLINES - 1];
      while (last.length > 1 && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
      out[MAXLINES - 1] = last + '…';
    }
    return out;
  }

  // sections: [{title, count, cols:[{h, w, align}], rows:[[text...]], summary:[text...]}]
  function layout(sections) {
    var scratch = document.createElement('canvas').getContext('2d');
    var pages = [], usable = PW - 2 * M, top = 74, bottom = PH - 40;
    sections.forEach(function (sec) {
      var widths = sec.cols.map(function (c) { return c.w * usable; });
      scratch.font = '700 ' + HEAD + 'px ' + FONT;
      var headLines = sec.cols.map(function (c, i) { return wrap(scratch, c.h, widths[i] - 2 * PAD); });
      var headH = Math.max.apply(null, headLines.map(function (l) { return l.length; })) * LH + 2 * PAD;
      scratch.font = BODY + 'px ' + FONT;
      var rows = sec.rows.map(function (r) {
        var lines = r.map(function (t, i) { return wrap(scratch, t, widths[i] - 2 * PAD); });
        return { lines: lines, h: Math.max.apply(null, lines.map(function (l) { return l.length; })) * LH + 2 * PAD };
      });
      var cur = null, y = 0, startNew = function () {
        cur = { sec: sec, widths: widths, headLines: headLines, headH: headH, rows: [], first: pages.every(function (p) { return p.sec !== sec; }), summary: false };
        pages.push(cur); y = top + 24 + headH;           // 24pt for the section heading band
      };
      startNew();
      rows.forEach(function (r) {
        if (y + r.h > bottom) { startNew(); cur.first = false; }
        cur.rows.push(r); y += r.h;
      });
      var sumH = (sec.summary.length + 1) * 13 + 8;
      if (y + sumH > bottom) { startNew(); cur.first = false; }
      cur.summary = true;
    });
    return pages;
  }

  function drawPage(ctx, pg, idx, total, ctxInfo) {
    var s = SC;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PW, PH);
    ctx.textBaseline = 'alphabetic';

    // header
    if (ctxInfo.logo) {
      var lh = 22, lw = lh * ctxInfo.logo.width / ctxInfo.logo.height;
      ctx.drawImage(ctxInfo.logo, PW - M - lw, 18, lw, lh);
    }
    ctx.fillStyle = INK; ctx.font = '700 15px ' + FONT; ctx.fillText('Manufacturing Business Manager', M, 32);
    ctx.fillStyle = MUTED; ctx.font = '9px ' + FONT; ctx.fillText(ctxInfo.subtitle, M, 46);
    ctx.fillStyle = ORANGE; ctx.fillRect(M, 54, PW - 2 * M, 2);

    var y = 74, sec = pg.sec, x;
    ctx.fillStyle = INK; ctx.font = '700 12px ' + FONT;
    ctx.fillText(sec.title + (pg.first ? '' : ' (continued)'), M, y + 8);
    if (pg.first) {
      var tw = ctx.measureText(sec.title).width;     // measured while the heading font is still set
      ctx.fillStyle = MUTED; ctx.font = '9px ' + FONT;
      ctx.fillText(sec.count, M + tw + 12, y + 8);
    }
    y += 24;

    // table header
    ctx.fillStyle = INK; ctx.fillRect(M, y, PW - 2 * M, pg.headH);
    ctx.fillStyle = ORANGE; ctx.fillRect(M, y + pg.headH - 1.5, PW - 2 * M, 1.5);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 ' + HEAD + 'px ' + FONT;
    x = M;
    sec.cols.forEach(function (c, i) {
      pg.headLines[i].forEach(function (ln, k) { drawText(ctx, ln, x, y + PAD + 8 + k * LH, pg.widths[i], c.align); });
      x += pg.widths[i];
    });
    y += pg.headH;

    // rows
    ctx.font = BODY + 'px ' + FONT;
    pg.rows.forEach(function (r, ri) {
      if (ri % 2 === 1) { ctx.fillStyle = ZEBRA; ctx.fillRect(M, y, PW - 2 * M, r.h); }
      ctx.fillStyle = INK; x = M;
      sec.cols.forEach(function (c, i) {
        r.lines[i].forEach(function (ln, k) { drawText(ctx, ln, x, y + PAD + 8 + k * LH, pg.widths[i], c.align); });
        x += pg.widths[i];
      });
      ctx.fillStyle = LINE; ctx.fillRect(M, y + r.h - 0.5, PW - 2 * M, 0.5);
      y += r.h;
    });
    if (!pg.rows.length && pg.first) {
      ctx.fillStyle = MUTED; ctx.font = 'italic 10px ' + FONT; ctx.fillText('Nothing saved yet.', M + PAD, y + 16); y += 26;
    }

    // totals
    if (pg.summary && sec.summary.length) {
      y += 12; ctx.fillStyle = INK; ctx.font = '700 9px ' + FONT; ctx.fillText('Totals', M, y);
      ctx.font = '9px ' + FONT;
      sec.summary.forEach(function (t, i) { ctx.fillText(t, M + 4, y + 13 * (i + 1)); });
    }

    // footer
    ctx.fillStyle = LINE; ctx.fillRect(M, PH - 30, PW - 2 * M, 0.7);
    ctx.fillStyle = MUTED; ctx.font = '8px ' + FONT;
    ctx.fillText('All rights reserved by Spark Tech Automation', M, PH - 17);
    var pgText = 'Page ' + idx + ' of ' + total;
    ctx.fillText(pgText, PW - M - ctx.measureText(pgText).width, PH - 17);
  }

  function drawText(ctx, text, x, y, w, align) {
    var tx = x + PAD;
    if (align === 'right') tx = x + w - PAD - ctx.measureText(text).width;
    ctx.fillText(text, tx, y);
  }

  /* ---------- tiny PDF writer: one JPEG image per page ---------- */
  function b64ToBytes(b64) { var s = atob(b64), a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function strBytes(s) { var a = new Uint8Array(s.length), i; for (i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }

  function writePdf(jpegs) {
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
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      var content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
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

  /* ---------- public ---------- */
  async function build(o) {
    var sections = o.sections;
    var logo = await loadImage(o.logoUrl || './logo-dark.png');
    var pages = layout(sections);
    var canvas = document.createElement('canvas');
    canvas.width = Math.round(PW * SC); canvas.height = Math.round(PH * SC);
    var ctx = canvas.getContext('2d');
    var info = { logo: logo, subtitle: o.subtitle || '' };
    var jpegs = [];
    for (var i = 0; i < pages.length; i++) {
      drawPage(ctx, pages[i], i + 1, pages.length, info);
      var url = canvas.toDataURL('image/jpeg', 0.88);
      jpegs.push({ w: canvas.width, h: canvas.height, bytes: b64ToBytes(url.slice(url.indexOf(',') + 1)) });
      await new Promise(function (r) { setTimeout(r, 0); });      // let the screen breathe between pages
    }
    return writePdf(jpegs);
  }
  function toBase64(bytes) {
    var s = '', i;
    for (i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  window.MBM_PDF = { build: build, toBase64: toBase64 };
})();
