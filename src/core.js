/*
 * Research Report Builder core: turns a report (a plain JavaScript object, saved as a
 * project file) into HTML for Paged.js to lay out as printed pages. No page, no network:
 * the tests run this directly.
 *
 * The text, notes, citations, charts, and tables work as in the White Paper Builder, whose
 * core this grew from. Citations come from OSINT Citation Generator list files and are
 * formatted by that tool's own core (OSINT), which the page loads before this file.
 */
var RR = (function () {
  'use strict';
  var CITER = typeof OSINT !== 'undefined' ? OSINT : null;
  function useCiter(c) { CITER = c; }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // The OSINT Citation Generator's source types and saved fields (list file format 2).
  var OSINT_TYPES = ['book', 'journal', 'news', 'chapter', 'web', 'report', 'social', 'video', 'archival', 'live', 'imagery', 'ai'];
  var OSINT_KEYS = ['lead', 'authors', 'editors', 'translators', 'contributors', 'title', 'titleStyle', 'transTitle', 'origLang', 'transBy', 'location', 'descType', 'descDetails',
    'accessNote', 'rating', 'publisher', 'date', 'dateKind', 'accessed', 'url', 'archiveUrl', 'archiveDate', 'locator', 'note', 'shortName', 'shortTitle'];
  // Grades and their meanings in the words of the OSINT Style Guide, version 1.5.
  var RATING_KEY = {
    rel: [['A', 'Highly Reliable', 'Long track record, direct access, transparent method. Errors are rare and corrected.'],
      ['B', 'Usually Reliable', 'Generally sound, but with known institutional framing, incentives, or occasional error.'],
      ['C', 'Fairly Reliable', 'Mixed or short record. Sometimes right, sometimes not. Requires corroboration.'],
      ['D', 'Not Usually Reliable', 'More often wrong than right, or method is opaque. Use only with strong corroboration.'],
      ['E', 'Unreliable', 'Demonstrated pattern of error or deliberate distortion. Treat as a claim about the source, not the world.'],
      ['F', 'Unknown', 'No basis on which to judge. Anonymous, new, or unattributable.']],
    cred: [['1', 'Confirmed', 'Corroborated by independent sources or direct evidence.'],
      ['2', 'Probable', 'Consistent with other reporting; not independently confirmed.'],
      ['3', 'Possible', 'Plausible and not contradicted, but uncorroborated.'],
      ['4', 'Doubtful', 'In tension with better-supported information.'],
      ['5', 'Improbable', 'Contradicted by evidence, or internally incoherent.'],
      ['6', 'Unknown', 'No basis for judging the claim either way.']]
  };
  var VISUAL_KINDS = {
    bar: { label: 'Column chart', fig: 'figure' },
    hbar: { label: 'Bar chart', fig: 'figure' },
    line: { label: 'Line chart', fig: 'figure' },
    table: { label: 'Table', fig: 'table' },
    timeline: { label: 'Timeline', fig: 'figure' },
    stats: { label: 'Key numbers', fig: '' },
    image: { label: 'Image or map', fig: 'figure' }
  };

  // ------------------------------------------------------------------ small helpers
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function lines(s) { return String(s == null ? '' : s).split(/\r?\n/).map(clean).filter(Boolean); }
  function words(s) { var t = clean(String(s || '').replace(/[#*>\[\]^@{}]/g, ' ')); return t ? t.split(' ').length : 0; }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function letter(n) { return String.fromCharCode(65 + n); }
  function safeUrl(u) { u = clean(u); return /^(https?:|mailto:)/i.test(u) ? u : ''; }
  function safeImage(u) { return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+\/=\s]+$/.test(String(u || '')) ? String(u).replace(/\s/g, '') : ''; }
  function slug(s) { return clean(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // Inline formatting inside an already-escaped string: **bold**, *italic*, [text](url).
  function fmt(escaped) {
    return escaped
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, function (m, t, u) { return '<a href="' + u.replace(/"/g, '%22') + '">' + t + '</a>'; })
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<i>$2</i>');
  }
  function fmtText(s) { return fmt(esc(smart(s))); }
  // Typographer's quotes and apostrophes: "a" -> “a”, it's -> it’s.
  function smart(s) {
    return String(s == null ? '' : s)
      .replace(/(^|[\s(\[{\u2014\u2013\/-])"/g, '$1\u201C').replace(/"/g, '\u201D')
      .replace(/(^|[\s(\[{\u2014\u2013\/-])'/g, '$1\u2018').replace(/'/g, '\u2019');
  }
  // The same, applied only to the text between tags of a finished HTML string.
  function smartHtml(h) { return String(h).split(/(<[^>]*>)/).map(function (part, i) { return i % 2 ? part : smart(part); }).join(''); }

  // ------------------------------------------------------------------ sources
  function surnameOf(name) {
    var n = clean(name);
    if (!n) return '';
    if (n.indexOf(',') !== -1) return n.split(',')[0];
    var w = n.split(' ');
    return w.length > 1 && !/\b(Staff|Department|Ministry|Institute|University|Corporation|Council|Bureau|Service|Office|Agency|News|Organization|Press|Group|Center|Centre)\b/.test(n) ? w[w.length - 1] : w[0];
  }
  var STOP = /^(a|an|the|of|on|in|and|for|to|how|why|what|is|are|at|by|with)$/i;
  function keyFor(st, taken) {
    var who = surnameOf(lines(st.authors)[0] || st.publisher || st.location || '');
    var tw = clean(st.title).replace(/["“”]/g, '').split(/[\s:]+/).filter(function (w) { return w && !STOP.test(w); })[0] || '';
    var base = slug((who ? who + '-' : '') + tw).split('-').slice(0, 4).join('-') || 'source';
    var k = base, n = 2;
    while (taken[k]) k = base + '-' + n++;
    taken[k] = 1;
    return k;
  }
  // Reads an OSINT Citation Generator list file into sources with short keys for citing.
  function importOsintList(text, existing) {
    if (!CITER) return { error: 'The OSINT citation engine is not loaded.' };
    var res = CITER.parseListFile(text, OSINT_TYPES, OSINT_KEYS);
    if (res.error) return { error: res.error };
    var taken = {}, have = {};
    var texts = {};
    (existing || []).forEach(function (s) { taken[s.key] = 1; if (s.osintId) have[s.osintId] = s; if (s.kind === 'osint') texts[sourceLabel(s)] = 1; });
    var added = [], skipped = 0;
    res.items.forEach(function (it) {
      var label = sourceLabel({ kind: 'osint', st: it.st });
      if (have[it.id] || texts[label]) { skipped++; return; }
      texts[label] = 1;
      added.push({ key: keyFor(it.st, taken), kind: 'osint', osintId: it.id, st: it.st });
    });
    return { name: res.name, sources: added, skipped: skipped };
  }
  function sourceLabel(src) {
    if (src.kind === 'osint' && CITER) return CITER.toPlain(CITER.build(Object.assign({}, src.st, { locator: '' })).seg);
    return clean(src.full);
  }
  // A locator added before the closing period of a typed citation.
  function withLocator(text, loc) {
    var t = clean(text);
    if (!loc) return t;
    if (/\.["\u201D]$/.test(t)) return t.replace(/\.(["\u201D])$/, ',$1') + ' ' + loc + '.';
    return t.replace(/\.$/, '') + ', ' + loc + '.';
  }
  function citeHtml(src, loc, first) {
    if (src.kind === 'osint' && CITER) {
      var st = Object.assign({}, src.st, { locator: loc || '' });
      var seg = first ? CITER.build(st).seg : CITER.shortForms(st).short;
      return smartHtml(CITER.toHTML(seg));
    }
    var raw = first || !clean(src.short) ? src.full : src.short;
    return fmtText(withLocator(raw, loc && CITER ? CITER.normLocator(loc) : loc));
  }

  // ------------------------------------------------------------------ inline text with notes and citations
  // ^[note text] is a footnote; [@key, p. 4; @other] cites sources in a footnote of their own,
  // or inline when it sits inside a note.
  function matching(s, i) {
    var depth = 0;
    for (var j = i; j < s.length; j++) {
      if (s[j] === '[') depth++;
      else if (s[j] === ']') { depth--; if (depth === 0) return j; }
    }
    return -1;
  }
  function parseCites(inner) {
    return inner.split(';').map(function (part) {
      var m = part.match(/^\s*(.*?)@([A-Za-z0-9][\w.:-]*)\s*,?\s*(.*?)\s*$/);
      return m ? { prefix: m[1], key: m[2].replace(/[.:]$/, ''), loc: m[3] } : { text: clean(part) };
    });
  }
  function inline(text, ctx, inNote) {
    var s = String(text == null ? '' : text), out = '', buf = '', i = 0;
    function flush() { if (buf) { out += fmtText(buf); buf = ''; } }
    while (i < s.length) {
      if (!inNote && s[i] === '^' && s[i + 1] === '[') {
        var end = matching(s, i + 1);
        if (end > 0) { buf = buf.replace(/\s+$/, ''); flush(); out += ctx.note(inline(s.slice(i + 2, end), ctx, true)); i = end + 1; continue; }
      }
      if (s[i] === '[' && s[i + 1] === '@') {
        var e2 = s.indexOf(']', i);
        if (e2 > 0) {
          if (!inNote) buf = buf.replace(/\s+$/, '');
          flush();
          var html = ctx.cite(parseCites(s.slice(i + 1, e2)));
          i = e2 + 1;
          if (inNote) {
            // The note's own punctuation follows: drop the citation's final period, or, after a
            // closing quotation mark (."), drop the period typed after the brackets instead.
            if (/\.$/.test(html)) html = html.replace(/\.$/, '');
            else if (/\.\u201D$/.test(html.replace(/<[^>]+>/g, '')) && s[i] === '.') i++;
            out += html;
          } else out += ctx.note(html);
          continue;
        }
      }
      buf += s[i++];
    }
    flush();
    return out;
  }

  // ------------------------------------------------------------------ blocks
  // # section, ## subsection, ### minor heading, > quotation, !> key point, >> margin note,
  // - bullets, 1. numbers, {R1} labeled item, [[visual-id]], [[rating-key]], --- new page.
  function blocks(md) {
    var out = [], para = [], last = null;
    function flush() { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } last = null; }
    String(md || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      var line = raw.trim(), m;
      if (!line) { flush(); return; }
      if ((m = line.match(/^(#{1,3})\s+(.+)$/))) { flush(); out.push({ t: 'h', level: m[1].length, text: m[2] }); return; }
      if ((m = line.match(/^\[\[\s*([\w.-]+)\s*\]\]$/))) { flush(); out.push({ t: 'visual', id: m[1] }); return; }
      if (/^-{3,}$/.test(line)) { flush(); out.push({ t: 'break' }); return; }
      var kinds = [[/^!>\s?(.*)$/, 'key'], [/^>>\s?(.*)$/, 'side'], [/^>\s?(.*)$/, 'quote']];
      for (var k = 0; k < kinds.length; k++) {
        if ((m = line.match(kinds[k][0]))) {
          if (para.length) flush();
          if (last && last.t === kinds[k][1]) last.text += ' ' + m[1];
          else { last = { t: kinds[k][1], text: m[1] }; out.push(last); }
          return;
        }
      }
      if ((m = line.match(/^[-*•]\s+(.+)$/)) || (m = line.match(/^(\d+)[.)]\s+(.+)$/))) {
        var ordered = m.length === 3, item = ordered ? m[2] : m[1];
        if (para.length) flush();
        var t = ordered ? 'ol' : 'ul';
        if (last && last.t === t) last.items.push(item);
        else { last = { t: t, items: [item], start: ordered ? +m[1] : 1 }; out.push(last); }
        return;
      }
      if ((m = line.match(/^\{([^}]{1,24})\}\s*(.*)$/))) {
        if (para.length) flush();
        if (last && last.t === 'labeled') last.items.push({ label: m[1], text: m[2] });
        else { last = { t: 'labeled', items: [{ label: m[1], text: m[2] }] }; out.push(last); }
        return;
      }
      if (last && (last.t === 'ul' || last.t === 'ol')) { last.items[last.items.length - 1] += ' ' + line; return; }
      if (last && last.t === 'labeled') { last.items[last.items.length - 1].text += ' ' + line; return; }
      if (last) last = null;
      para.push(line);
    });
    flush();
    return out;
  }

  // ------------------------------------------------------------------ data for visuals
  function parseNumber(s) {
    var t = clean(s).replace(/[,\s$€£¥]/g, '').replace(/%$/, '');
    return /^[-+−]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? parseFloat(t.replace('−', '-')) : null;
  }
  function splitRow(line, d) {
    if (d === '|') return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(clean);
    if (d === '\t') return line.split('\t').map(clean);
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === d) { out.push(clean(cur)); cur = ''; }
      else cur += c;
    }
    out.push(clean(cur));
    return out;
  }
  // Pasted CSV, tab-separated (from a spreadsheet), or a Markdown table. A first row with
  // words where the numbers go is a header.
  function parseData(text, header) {
    var rows = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() && !/^\s*\|?\s*:?-{2,}/.test(l); });
    if (!rows.length) return { head: null, rows: [] };
    var f = rows[0], d = f.indexOf('\t') !== -1 ? '\t' : /^\s*\|/.test(f) ? '|' : (f.indexOf(';') !== -1 && f.indexOf(',') === -1) ? ';' : ',';
    var cells = rows.map(function (r) { return splitRow(r, d); });
    var head = null;
    if (header === true && cells.length > 1) head = cells.shift();
    else if (header === undefined && cells.length > 1 && cells[0].slice(1).some(function (c) { return c && parseNumber(c) === null; }) && cells[1].slice(1).some(function (c) { return parseNumber(c) !== null; })) head = cells.shift();
    return { head: head, rows: cells };
  }
  function series(data) {
    var n = Math.max.apply(null, data.rows.map(function (r) { return r.length; }).concat([2])) - 1, out = [];
    for (var j = 1; j <= n; j++) out.push({ name: data.head ? data.head[j] || '' : '', values: data.rows.map(function (r) { return parseNumber(r[j]); }) });
    return out.filter(function (s) { return s.values.some(function (v) { return v !== null; }); });
  }
  function fmtNum(v) {
    if (v === null || v === undefined || isNaN(v)) return '';
    var a = Math.abs(v), dp = a >= 100 ? 0 : a >= 10 ? 1 : 2;
    var s = v.toFixed(dp).replace(/\.0+$|(\.\d*?)0+$/, '$1');
    var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.').replace(/^-/, '−');
  }
  function niceStep(range, target) {
    var raw = range / target, e = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function scale(min, max) {
    if (min === max) { max = max === 0 ? 1 : max * 1.1; min = Math.min(0, min); }
    var step = niceStep(max - min, 4), lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (var v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { lo: lo, hi: hi, ticks: ticks };
  }

  // ------------------------------------------------------------------ charts (SVG)
  var INK = '#15181B', GRAY = '#565C61', RULE = '#C2C6BF';
  function svgText(x, y, s, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + ' font-family="' + (o.serif ? 'IBM Plex Serif' : 'IBM Plex Mono') + ', serif" font-size="' + (o.size || 11) + '"'
      + (o.bold ? ' font-weight="700"' : '') + ' fill="' + (o.fill || GRAY) + '">' + esc(s) + '</text>';
  }
  function trunc(s, n) { s = clean(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function palette(accent) { return [INK, accent, '#8A9096', '#7A3B2E']; }
  function legend(ss, accent, W) {
    if (ss.length < 2) return { svg: '', h: 0 };
    var x = 0, out = '', pal = palette(accent);
    ss.forEach(function (s, i) {
      out += '<rect x="' + x + '" y="2" width="14" height="4" fill="' + pal[i % 4] + '"/>' + svgText(x + 20, 9, trunc(s.name || 'Series ' + (i + 1), 28), { fill: INK });
      x += 34 + Math.min(28, (s.name || 'Series 1').length) * 6.6;
    });
    return { svg: out, h: 22 };
  }
  function chartSvg(v, accent) {
    var data = parseData(v.data), ss = series(data), W = 512, kind = v.kind;
    var labels = data.rows.map(function (r) { return r[0] || ''; });
    if (!ss.length || !labels.length) return '<div class="vempty">Paste data under Data to draw this chart.</div>';
    var hl = clean(v.highlight).toLowerCase(), pal = palette(accent), lg = legend(ss, accent, W);
    var all = []; ss.forEach(function (s) { s.values.forEach(function (x) { if (x !== null) all.push(x); }); });
    var sc = scale(Math.min(0, Math.min.apply(null, all)), Math.max(0, Math.max.apply(null, all)));
    var out = [], H, top = lg.h + 8;
    if (kind === 'hbar') {
      var rowH = ss.length > 1 ? 14 * ss.length + 10 : 26, lw = 150, cw = W - lw - 48;
      H = top + labels.length * rowH + 26;
      var hx = function (x) { return lw + (x - sc.lo) / (sc.hi - sc.lo) * cw; };
      sc.ticks.forEach(function (t) { out.push('<line x1="' + hx(t).toFixed(1) + '" x2="' + hx(t).toFixed(1) + '" y1="' + top + '" y2="' + (H - 22) + '" stroke="' + RULE + '" stroke-width="0.75"/>' + svgText(hx(t), H - 8, fmtNum(t), { anchor: 'middle' })); });
      labels.forEach(function (lab, i) {
        var y0 = top + i * rowH + 4, hot = hl && lab.toLowerCase() === hl;
        out.push(svgText(lw - 8, y0 + (rowH - 8) / 2 + 4, trunc(lab, 24), { anchor: 'end', serif: true, size: 12, fill: hot ? accent : INK, bold: hot }));
        ss.forEach(function (s, j) {
          var val = s.values[i]; if (val === null) return;
          var bh = ss.length > 1 ? 12 : rowH - 10, y = y0 + j * (bh + 2), x0 = hx(Math.max(0, sc.lo)), x1 = hx(val);
          out.push('<rect x="' + Math.min(x0, x1).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, Math.abs(x1 - x0)).toFixed(1) + '" height="' + bh + '" fill="' + (ss.length > 1 ? pal[j % 4] : hot ? accent : INK) + '"/>');
          out.push(svgText(Math.max(x0, x1) + 4, y + bh / 2 + 4, fmtNum(val), { fill: hot ? accent : INK }));
        });
      });
      out.push('<line x1="' + hx(Math.max(0, sc.lo)).toFixed(1) + '" x2="' + hx(Math.max(0, sc.lo)).toFixed(1) + '" y1="' + top + '" y2="' + (H - 22) + '" stroke="' + INK + '" stroke-width="1"/>');
    } else {
      H = top + 260 + 30;
      var L = 44, R = 8, ch = 260, cw2 = W - L - R, n = labels.length;
      var y = function (val) { return top + ch - (val - sc.lo) / (sc.hi - sc.lo) * ch; };
      sc.ticks.forEach(function (t) { out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '" stroke="' + RULE + '" stroke-width="0.75"/>' + svgText(L - 6, y(t) + 4, fmtNum(t), { anchor: 'end' })); });
      var every = Math.ceil(n / 12), band = cw2 / n;
      labels.forEach(function (lab, i) {
        if (i % every && i !== n - 1) return;
        var hot = hl && lab.toLowerCase() === hl;
        out.push(svgText(L + band * (i + 0.5), top + ch + 16, trunc(lab, Math.max(4, Math.floor(band * every / 7))), { anchor: 'middle', fill: hot ? accent : GRAY, bold: hot }));
      });
      if (kind === 'line') {
        ss.forEach(function (s, j) {
          var pts = [], col = pal[j % 4];
          s.values.forEach(function (val, i) { if (val !== null) pts.push([L + band * (i + 0.5), y(val), val, i]); });
          out.push('<polyline fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>');
          var lastP = pts[pts.length - 1];
          if (lastP) out.push('<circle cx="' + lastP[0].toFixed(1) + '" cy="' + lastP[1].toFixed(1) + '" r="3" fill="' + col + '"/>' + svgText(Math.min(lastP[0], W - 30), lastP[1] - 8, fmtNum(lastP[2]), { anchor: 'middle', fill: col, bold: true }));
          pts.forEach(function (p) { if (hl && labels[p[3]].toLowerCase() === hl) out.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + accent + '"/>' + svgText(p[0], p[1] - 9, fmtNum(p[2]), { anchor: 'middle', fill: accent, bold: true })); });
        });
      } else {
        var gw = band * 0.7, bw = gw / ss.length;
        labels.forEach(function (lab, i) {
          var hot = hl && lab.toLowerCase() === hl;
          ss.forEach(function (s, j) {
            var val = s.values[i]; if (val === null) return;
            var x = L + band * i + (band - gw) / 2 + j * bw, y0 = y(Math.max(0, sc.lo)), y1 = y(val);
            out.push('<rect x="' + x.toFixed(1) + '" y="' + Math.min(y0, y1).toFixed(1) + '" width="' + Math.max(1, bw - (ss.length > 1 ? 1 : 0)).toFixed(1) + '" height="' + Math.max(1, Math.abs(y1 - y0)).toFixed(1) + '" fill="' + (ss.length > 1 ? pal[j % 4] : hot ? accent : INK) + '"/>');
            if (ss.length === 1 && n <= 12) out.push(svgText(x + bw / 2, Math.min(y0, y1) - 5, fmtNum(val), { anchor: 'middle', fill: hot ? accent : INK, bold: hot }));
          });
        });
      }
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(Math.max(0, sc.lo)).toFixed(1) + '" y2="' + y(Math.max(0, sc.lo)).toFixed(1) + '" stroke="' + INK + '" stroke-width="1"/>');
      out.push('<line x1="' + L + '" x2="' + L + '" y1="' + top + '" y2="' + (top + ch) + '" stroke="' + INK + '" stroke-width="1"/>');
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(clean(v.title) || 'Chart') + '">' + lg.svg + out.join('') + '</svg>';
  }
  function tableHtml(v, ctx) {
    var data = parseData(v.data, !v.noHeader);
    if (!data.rows.length) return '<div class="vempty">Paste the table under Data.</div>';
    var cols = Math.max.apply(null, data.rows.map(function (r) { return r.length; }).concat(data.head ? [data.head.length] : []));
    var num = []; for (var c = 0; c < cols; c++) num.push(c > 0 && data.rows.every(function (r) { return !r[c] || parseNumber(r[c]) !== null || /^[\d\s–-]+$/.test(r[c]); }));
    var hl = clean(v.highlight).toLowerCase();
    var cell = function (s) { return inline(s, ctx, true); };
    var h = '<table class="dtable">';
    if (data.head) h += '<thead><tr>' + data.head.map(function (x, c) { return '<th' + (num[c] ? ' class="n"' : '') + '>' + cell(x) + '</th>'; }).join('') + '</tr></thead>';
    h += '<tbody>' + data.rows.map(function (r) {
      var hot = hl && clean(r[0]).toLowerCase() === hl;
      var row = []; for (var c2 = 0; c2 < cols; c2++) row.push('<td' + (num[c2] ? ' class="n"' : '') + '>' + cell(r[c2] || '') + '</td>');
      return '<tr' + (hot ? ' class="hot"' : '') + '>' + row.join('') + '</tr>';
    }).join('') + '</tbody></table>';
    return h;
  }
  // "March 3, 2022, What happened": the date runs to its year; "1,200, What it measures": the
  // number keeps its thousands separators. Otherwise a tab, or the first comma, divides the line.
  function splitLead(line, kind) {
    var l = clean(line), m;
    if (l.indexOf('\t') !== -1 || /\t/.test(line)) { var t = String(line).split('\t'); return [clean(t[0]), clean(t.slice(1).join(' '))]; }
    if (kind === 'timeline' && (m = l.match(/^(.*?\b\d{3,4}s?\b(?:\s*(?:BC|BCE|AD|CE))?)\s*[,:\u2013\u2014-]\s*(.+)$/))) return [m[1], m[2]];
    if (kind === 'stats' && (m = l.match(/^((?:[^,\s]|,(?=\d{3}(?!\d)))+)\s*,\s*(.+)$/))) return [m[1], m[2]];
    var i = l.indexOf(',');
    return i === -1 ? [l, ''] : [clean(l.slice(0, i)), clean(l.slice(i + 1))];
  }
  function leadRows(text, kind) { return String(text || '').split(/\r?\n/).filter(function (x) { return x.trim(); }).map(function (x) { return splitLead(x, kind); }); }
  function timelineHtml(v, ctx) {
    var rows = leadRows(v.data, 'timeline');
    if (!rows.length) return '<div class="vempty">Add one event per line: date, then what happened.</div>';
    return '<ol class="timeline">' + rows.map(function (r) {
      return '<li><span class="when">' + fmtText(r[0]) + '</span><span class="what">' + inline(r[1], ctx, true) + '</span></li>';
    }).join('') + '</ol>';
  }
  function statsHtml(v, ctx) {
    var rows = leadRows(v.data, 'stats');
    if (!rows.length) return '<div class="vempty">Add one number per line: the number, then what it measures.</div>';
    return '<div class="stats" style="grid-template-columns: repeat(' + Math.min(4, rows.length) + ', minmax(0, 1fr))">' + rows.slice(0, 4).map(function (r) {
      return '<div class="stat"><div class="big">' + fmtText(r[0]) + '</div><div class="what">' + inline(r[1], ctx, true) + '</div></div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ the report
  // How deep the topic runs, tied to the treatment it can carry.
  var DEPTH = [
    ['1', 'Light', 'A short piece covers it. Few moving parts, little dispute.'],
    ['2', 'Moderate', 'One solid treatment covers it. Some background is needed.'],
    ['3', 'Substantial', 'Needs a long-form treatment to do it justice.'],
    ['4', 'Deep', 'Enough for several pieces, or a long piece with follow-ups.'],
    ['5', 'Very deep', 'A series or ongoing coverage. The topic keeps opening up.']
  ];
  var LEVELS = ['Low', 'Moderate', 'High'];
  // Confidence in the report's judgments, in the usual analytic sense.
  var CONFIDENCE = {
    High: 'Several independent, high-quality sources agree.',
    Moderate: 'Credibly sourced and plausible, but not fully corroborated.',
    Low: 'Fragmentary, poorly corroborated, or from doubtful sources.'
  };
  var GROUPS = { core: 'Core sources', supporting: 'Supporting sources', further: 'Further reading', omit: 'Not listed' };
  var PARTS = ['bottom', 'considerations', 'debates', 'context', 'sources', 'back'];

  function hex(c, dflt) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : dflt; }
  function lum(c) {
    var v = [1, 3, 5].map(function (i) { var x = parseInt(c.slice(i, i + 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function pipes(text) { return lines(text).map(function (l) { return l.split('|').map(clean); }); }
  function levelOf(s) { var t = clean(s).toLowerCase(); return /^h/.test(t) ? 2 : /^m/.test(t) ? 1 : /^l/.test(t) ? 0 : -1; }
  function confOf(s) { var i = levelOf(s); return i < 0 ? '' : LEVELS[i]; }
  function meter(n, of, cls) {
    var out = '<span class="meter ' + (cls || '') + '" aria-label="' + n + ' of ' + of + '">';
    for (var i = 1; i <= of; i++) out += '<i' + (i <= n ? ' class="on"' : '') + '></i>';
    return out + '</span>';
  }
  function isGuide(s) { return /^\[[^\]@^]*\]$/.test(clean(s)); }
  function ratingOf(src) { return clean(src.kind === 'osint' ? src.st && src.st.rating : src.rating).toUpperCase(); }
  function paras(text, ctx, cls) {
    return String(text || '').split(/\n\s*\n/).map(function (p) { p = clean(p); return p ? '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + inline(p, ctx) + '</p>' : ''; }).join('');
  }
  // ? Question, + one view, + another view, = assessment. Lines without a mark continue the last item.
  function parseDebates(text) {
    var out = [], cur = null;
    String(text || '').replace(/\r/g, '').split('\n').forEach(function (raw) {
      var l = raw.trim(), m;
      if (!l) return;
      if ((m = l.match(/^\?\s*(.*)$/))) { cur = { q: m[1], views: [], verdict: '' }; out.push(cur); return; }
      if (!cur) { cur = { q: '', views: [], verdict: '' }; out.push(cur); }
      if ((m = l.match(/^\+\s*(.*)$/))) { cur.views.push(m[1]); return; }
      if ((m = l.match(/^=\s*(.*)$/))) { cur.verdict = clean(cur.verdict + ' ' + m[1]); return; }
      if (cur.verdict) cur.verdict += ' ' + l;
      else if (cur.views.length) cur.views[cur.views.length - 1] += ' ' + l;
      else cur.q = clean(cur.q + ' ' + l);
    });
    return out;
  }

  function defaults() {
    return {
      brand: { org: '', tagline: '', logo: '', label: 'Research Report', prefix: 'RR', marking: '', accent: '#1F5FAD', ink: '#15181B', paper: 'tinted', site: '', contact: '', disclaimer: '', license: '' },
      meta: {
        title: '', question: '', preparedFor: '', preparedBy: '', date: '', number: '001', version: '1.0', status: 'Draft', shortTitle: '',
        coverImage: '', coverCaption: '', sectionBreaks: true,
        parts: { bottom: true, considerations: true, debates: true, context: true, sources: true, back: true }
      },
      bottom: { bluf: '', takeaways: '', depth: '', depthNote: '', dimensions: '', treatment: '', effort: '', confidence: '', confidenceNote: '', decisions: '' },
      considerations: { intro: '', items: '', misconceptions: '' },
      debates: { intro: '', items: '', gaps: '' },
      context: { actors: '', timeline: '', glossary: '' },
      body: '', appendix: '',
      back: { method: '', distribution: '', history: '' },
      visuals: [], sources: []
    };
  }
  function normalize(doc) {
    var d = defaults();
    doc = doc && typeof doc === 'object' ? doc : {};
    ['brand', 'meta', 'bottom', 'considerations', 'debates', 'context', 'back'].forEach(function (k) {
      var src = doc[k] && typeof doc[k] === 'object' ? doc[k] : {};
      Object.keys(d[k]).forEach(function (f) { if (f !== 'parts' && typeof src[f] === typeof d[k][f]) d[k][f] = src[f]; });
    });
    var parts = doc.meta && doc.meta.parts && typeof doc.meta.parts === 'object' ? doc.meta.parts : {};
    PARTS.forEach(function (p) { if (typeof parts[p] === 'boolean') d.meta.parts[p] = parts[p]; });
    d.brand.logo = safeImage(d.brand.logo); d.meta.coverImage = safeImage(d.meta.coverImage);
    ['body', 'appendix'].forEach(function (k) { if (typeof doc[k] === 'string') d[k] = doc[k]; });
    if (Array.isArray(doc.visuals)) d.visuals = doc.visuals.filter(function (v) { return v && typeof v.id === 'string' && VISUAL_KINDS[v.kind]; }).map(function (v) {
      return { id: v.id.slice(0, 60), kind: v.kind, title: String(v.title || ''), subtitle: String(v.subtitle || ''), source: String(v.source || ''), note: String(v.note || ''),
        data: String(v.data || ''), highlight: String(v.highlight || ''), image: safeImage(v.image), wide: !!v.wide, noHeader: !!v.noHeader };
    });
    if (Array.isArray(doc.sources)) d.sources = doc.sources.filter(function (s) { return s && typeof s.key === 'string' && s.key; }).map(function (s) {
      var extra = { group: GROUPS[s.group] ? s.group : 'supporting', note: String(s.note || '') };
      if (s.kind === 'osint' && s.st && typeof s.st === 'object') {
        var st = {}; OSINT_KEYS.forEach(function (k) { st[k] = typeof s.st[k] === 'string' ? s.st[k] : ''; });
        st.type = OSINT_TYPES.indexOf(s.st.type) !== -1 ? s.st.type : 'web';
        st.access = Array.isArray(s.st.access) ? s.st.access.filter(function (x) { return typeof x === 'string'; }) : [];
        st.quals = Array.isArray(s.st.quals) ? s.st.quals.filter(function (x) { return typeof x === 'string'; }) : [];
        st.shortUseTitle = s.st.shortUseTitle !== false;
        return Object.assign({ key: s.key.slice(0, 60), kind: 'osint', osintId: String(s.osintId || ''), st: st }, extra);
      }
      return Object.assign({ key: s.key.slice(0, 60), kind: 'typed', full: String(s.full || ''), short: String(s.short || ''), rating: String(s.rating || '') }, extra);
    });
    return d;
  }

  function render(input) {
    var doc = normalize(input), m = doc.meta, br = doc.brand, P = m.parts;
    var accent = hex(br.accent, '#1F5FAD'), ink = hex(br.ink, '#15181B'), paperColor = br.paper === 'white' ? '#FFFFFF' : '#F4F5F2';
    INK = ink;
    var problems = [], notes = 0, srcByKey = {}, seen = {}, usedKeys = {};
    doc.sources.forEach(function (s) { srcByKey[s.key] = s; });
    var visById = {}; doc.visuals.forEach(function (v) { visById[v.id] = v; });
    function problem(level, msg, where) { if (!problems.some(function (p) { return p.msg === msg; })) problems.push({ level: level, msg: msg, where: where || '' }); }
    var ctx = {
      note: function (html) { notes++; return '<span class="fn"><span class="fn-n">' + notes + '</span> ' + html + '</span><sup class="fn-call">' + notes + '</sup>'; },
      cite: function (list) {
        return list.map(function (c, n) {
          if (c.text !== undefined) return fmtText(c.text);
          var src = srcByKey[c.key];
          if (!src) { problem('fix', 'No source has the key @' + c.key + '. Check the spelling, or open the list file that has it under Sources.', 'sources'); return '<span class="missing">[@' + esc(c.key) + ']</span>'; }
          usedKeys[c.key] = 1;
          var first = !seen[c.key]; seen[c.key] = 1;
          var h = citeHtml(src, c.loc, first);
          if (n < list.length - 1) h = h.replace(/\.(”)?$/, '$1');
          return (c.prefix ? fmtText(c.prefix) : '') + h;
        }).join('; ');
      }
    };
    var id = (clean(br.prefix) || 'RR') + '-' + (clean(m.number) || '000'), label = clean(br.label) || 'Research Report';
    var title = clean(m.title) || 'Untitled report', shortTitle = clean(m.shortTitle) || title;
    var figs = [], figN = 0, tabN = 0, appTabN = 0, appFigN = 0, usedVis = {}, toc = [];

    // ---- visuals, as in the White Paper Builder
    function visualHtml(vid, inAppendix, sectionLetter) {
      var v = visById[vid];
      if (vid === 'rating-key') return ratingKey(inAppendix ? (sectionLetter || 'A') + (++appTabN) : String(++tabN));
      if (!v) { problem('fix', 'There is no visual called [[' + vid + ']]. Check its name under Visuals.', 'visuals'); return '<p class="missing">[[' + esc(vid) + ']]</p>'; }
      usedVis[vid] = 1;
      var kind = VISUAL_KINDS[v.kind], lab = '', anchor = 'v-' + slug(vid);
      if (kind.fig === 'figure') lab = 'Figure ' + (inAppendix ? (sectionLetter || 'A') + (++appFigN) : ++figN);
      else if (kind.fig === 'table') lab = 'Table ' + (inAppendix ? (sectionLetter || 'A') + (++appTabN) : ++tabN);
      if (lab && clean(v.title)) figs.push({ label: lab, title: v.title, anchor: anchor });
      if (lab && !clean(v.source) && v.kind !== 'image') problem('check', lab + ' (' + (clean(v.title) || vid) + ') has no source line. Say where the data comes from.', 'visuals');
      if (v.kind === 'stats' && leadRows(v.data, 'stats').length > 4) problem('check', 'Key numbers ([[' + vid + ']]) shows only the first four lines.', 'visuals');
      if (lab && v.kind === 'image' && !v.image) problem('fix', lab + ' (' + (clean(v.title) || vid) + ') has no image yet.', 'visuals');
      var bodyH = v.kind === 'table' ? tableHtml(v, ctx) : v.kind === 'timeline' ? timelineHtml(v, ctx) : v.kind === 'stats' ? statsHtml(v, ctx)
        : v.kind === 'image' ? (v.image ? '<img class="vimg" src="' + v.image + '" alt="' + esc(clean(v.title)) + '">' : '<div class="vempty">Choose an image file under Visuals.</div>')
        : chartSvg(v, accent);
      if (v.kind === 'stats') return '<div class="vis stats-wrap" id="' + anchor + '">' + (clean(v.title) ? '<h4 class="stats-title">' + fmtText(v.title) + '</h4>' : '') + bodyH + (clean(v.source) ? '<div class="stats-src">' + inline(v.source, ctx, true) + '</div>' : '') + '</div>';
      return '<figure class="vis vis-' + v.kind + (v.wide ? ' wide' : '') + '" id="' + anchor + '">'
        + '<figcaption class="gut">' + (lab ? '<div class="vlabel">' + lab + '</div>' : '') + (clean(v.source) ? '<div class="vsrc">' + inline(v.source, ctx, true) + '</div>' : '') + (clean(v.note) ? '<div class="vnote">' + inline(v.note, ctx, true) + '</div>' : '') + '</figcaption>'
        + '<div class="vbody">' + (clean(v.title) ? '<h4 class="vtitle">' + fmtText(v.title) + '</h4>' : '') + (clean(v.subtitle) ? '<div class="vsub">' + fmtText(v.subtitle) + '</div>' : '') + bodyH + '</div></figure>';
    }
    function ratingRows(list) { return list.map(function (r) { return '<tr><td class="code">' + r[0] + '</td><td class="mean">' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join(''); }
    function ratingKey(n) {
      var lab = 'Table ' + n;
      figs.push({ label: lab, title: 'Source rating key', anchor: 'v-rating-key' });
      return '<figure class="vis vis-table rating" id="v-rating-key"><figcaption class="gut"><div class="vlabel">' + lab + '</div><div class="vsrc">OSINT Style Guide, version 1.5: Source Reliability &amp; Credibility.</div></figcaption><div class="vbody">'
        + '<h4 class="vtitle">Source rating key</h4>'
        + '<p class="rnote">Letters A–F rate the source: how much confidence its track record, access, and method warrant. Numbers 1–6 rate the information: how well the particular claim is corroborated, independent of who is making it.</p>'
        + '<table class="dtable"><thead><tr><th>Grade</th><th>Reliability of the source</th><th>In practice</th></tr></thead><tbody>' + ratingRows(RATING_KEY.rel) + '</tbody></table>'
        + '<table class="dtable"><thead><tr><th>Grade</th><th>Credibility of the information</th><th>In practice</th></tr></thead><tbody>' + ratingRows(RATING_KEY.cred) + '</tbody></table>'
        + '</div></figure>';
    }
    // Body and appendix share one renderer; the appendix numbers A, A.1.
    function flow(md, appendix) {
      var bs = blocks(md), out = [], sec = 0, sub = 0, pendingSide = '', letterNow = '';
      bs.forEach(function (b) {
        var side = pendingSide; pendingSide = '';
        var sideHtml = side ? '<aside class="side">' + side + '</aside>' : '';
        if (b.t === 'h') {
          var text = inline(b.text, ctx, false), plain = plainText(b.text);
          if (b.level === 1) {
            sec++; sub = 0;
            var num = appendix ? letter(sec - 1) : String(sec), hid = (appendix ? 'app-' : 'sec-') + num;
            letterNow = num;
            if (appendix) { appTabN = 0; appFigN = 0; }
            toc.push({ level: 1, num: num, title: appendix ? 'Appendix ' + num + ': ' + plain : plain, anchor: hid });
            out.push('<h2 class="sec' + (m.sectionBreaks ? ' brk' : '') + '" id="' + hid + '" data-run="' + esc(appendix ? 'Appendix ' + num : num + ' ' + plain) + '"><span class="num">' + num + '</span>' + (appendix ? '<span class="pre">Appendix ' + num + '</span>' : '') + '<span class="t">' + text + '</span></h2>');
          } else if (b.level === 2) {
            sub++;
            var n2 = (sec ? (appendix ? letter(sec - 1) : sec) + '.' : '') + sub, id2 = (appendix ? 'app-' : 'sec-') + (sec ? n2.replace('.', '-') : '0-' + sub);
            toc.push({ level: 2, num: n2, title: plain, anchor: id2 });
            out.push('<h3 class="sub" id="' + id2 + '"><span class="num">' + n2 + '</span>' + text + '</h3>');
          } else out.push('<h4 class="minor">' + text + '</h4>');
          if (sideHtml) out.push(sideHtml);
          return;
        }
        if (b.t === 'side') { pendingSide = inline(b.text, ctx, false); return; }
        if (b.t === 'break') { out.push('<div class="pagebreak"></div>'); return; }
        if (b.t === 'visual') { out.push(sideHtml + visualHtml(b.id, appendix, letterNow)); return; }
        if (b.t === 'p') { out.push(sideHtml + '<p>' + inline(b.text, ctx) + '</p>'); return; }
        if (b.t === 'quote') { out.push(sideHtml + '<blockquote>' + inline(b.text, ctx) + '</blockquote>'); return; }
        if (b.t === 'key') { out.push('<div class="keypoint"><div class="gut">Key point</div><div class="kp">' + inline(b.text, ctx) + '</div></div>'); return; }
        if (b.t === 'ul' || b.t === 'ol') { out.push(sideHtml + '<' + b.t + (b.t === 'ol' && b.start !== 1 ? ' start="' + b.start + '"' : '') + '>' + b.items.map(function (x) { return '<li>' + inline(x, ctx) + '</li>'; }).join('') + '</' + b.t + '>'); return; }
        if (b.t === 'labeled') { out.push(sideHtml + '<div class="labeled">' + b.items.map(function (x) { return '<div class="li"><div class="gut">' + fmtText(x.label) + '</div><div class="lt">' + inline(x.text, ctx) + '</div></div>'; }).join('') + '</div>'); return; }
      });
      if (pendingSide) out.push('<aside class="side">' + pendingSide + '</aside>');
      return out.join('\n');
    }
    function front(pid, heading, run) { toc.push({ level: 0, num: '', title: heading, anchor: pid }); return '<h2 class="front" id="' + pid + '" data-run="' + esc(run || heading) + '">' + esc(heading) + '</h2>'; }
    function emptyPart(name, tab) { problem('note', name + ' is turned on but empty, so it is left out. Fill it in, or turn it off under Report.', tab); }

    // ---- checks on the report as a whole
    if (!clean(m.title)) problem('fix', 'The report has no title yet. Fill it in under Report.', 'report');
    else if (isGuide(m.title)) problem('check', 'The title still has the template\'s guidance in it.', 'report');
    if (!clean(m.preparedBy) || isGuide(m.preparedBy)) problem('check', 'Say who prepared the report, under Report.', 'report');
    if (!clean(m.date)) problem('check', 'No date is given for the cover. Fill it in under Report.', 'report');
    if (!clean(br.org) || isGuide(br.org)) problem('note', 'No organization name is set under Brand.', 'brand');
    if (contrast(ink, paperColor) < 4.5) problem('check', 'The brand\'s ink color is too light to read on the page. Choose a darker one under Brand.', 'brand');
    if (contrast(accent, paperColor) < 3) problem('check', 'The accent color is hard to see on the page. Choose a darker or stronger one under Brand.', 'brand');
    if (shortTitle.length > 48) problem('note', 'The footer title is long. Give a short title under Report.', 'report');

    // ---- sources tallied once: the bottom line, the cover, and the source list use them
    var listed = doc.sources.filter(function (s) { return s.group !== 'omit'; });
    var rated = listed.filter(function (s) { return /^[A-F]/.test(ratingOf(s)); });
    var strong = rated.filter(function (s) { return /^[AB]/.test(ratingOf(s)); }).length;

    // ---- bottom line
    var bt = doc.bottom, bottomHtml = '', depthN = /^[1-5]$/.test(clean(bt.depth)) ? +clean(bt.depth) : 0, conf = confOf(bt.confidence);
    var takeaways = pipes(bt.takeaways), decisions = lines(bt.decisions), dims = pipes(bt.dimensions);
    var hasBottom = clean(bt.bluf) || takeaways.length || decisions.length || depthN || dims.length || clean(bt.treatment);
    if (P.bottom && hasBottom) {
      var depthBox = '';
      if (depthN || dims.length) {
        var dd = depthN ? DEPTH[depthN - 1] : null;
        depthBox = '<div class="depth"><div class="dp">'
          + (dd ? '<div class="dp-head"><span class="dp-k">Depth</span><span class="dp-score">' + depthN + '<small>/5</small></span><span class="dp-name">' + dd[1] + '</span>' + meter(depthN, 5, 'm5') + '</div>'
            + '<div class="dp-note">' + (clean(bt.depthNote) ? inline(bt.depthNote, ctx) : esc(dd[2])) + '</div>' : '')
          + (dims.length ? '<table class="dims"><tbody>' + dims.map(function (r) {
            var lv = levelOf(r[1]);
            if (lv < 0 && clean(r[1])) problem('check', 'Depth: "' + r[0] + '" needs a level of Low, Moderate, or High.', 'bottom');
            return '<tr><th>' + fmtText(r[0] || '') + '</th><td class="lv">' + (lv >= 0 ? meter(lv + 1, 3, 'm3') + '<span>' + LEVELS[lv] + '</span>' : '') + '</td><td>' + inline(r.slice(2).join(' | '), ctx, true) + '</td></tr>';
          }).join('') + '</tbody></table>' : '')
          + '</div></div>';
      } else problem('check', 'Rate the topic\'s depth under Bottom line.', 'bottom');
      var basis = [clean(bt.effort) ? inline(bt.effort, ctx) : '', listed.length ? listed.length + ' source' + (listed.length === 1 ? '' : 's') + ' assessed' + (rated.length ? ', ' + strong + ' rated A or B' : '') + '.' : ''].filter(Boolean).join(' ');
      var cell = function (k, v) { return v ? '<div class="fc"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>' : ''; };
      var facts = cell('Treatment', clean(bt.treatment) ? inline(bt.treatment, ctx) : '') + cell('Research basis', basis)
        + cell('Confidence', conf ? '<span class="conf c-' + conf.toLowerCase() + '">' + conf + '</span> ' + (clean(bt.confidenceNote) ? inline(bt.confidenceNote, ctx) : esc(CONFIDENCE[conf])) : '');
      bottomHtml = '<section class="part bottom">' + front('bottom-line', 'Bottom line')
        + paras(bt.bluf, ctx, 'lead') + depthBox
        + (facts ? '<div class="facts"><div class="fg">' + facts + '</div></div>' : '')
        + (takeaways.length ? '<h3 class="plain">Key takeaways</h3><div class="findings">' + takeaways.map(function (r, i) {
          var c = r.length > 1 ? confOf(r[r.length - 1]) : '', text = c ? r.slice(0, -1).join(' | ') : r.join(' | ');
          return '<div class="finding"><div class="gut">' + pad2(i + 1) + '</div><div class="ft">' + inline(text, ctx) + (c ? ' <span class="conf c-' + c.toLowerCase() + '">' + c + ' confidence</span>' : '') + '</div></div>';
        }).join('') + '</div>' : '')
        + (decisions.length ? '<h3 class="plain">For your decision</h3><div class="recs">' + decisions.map(function (r, i) { return '<div class="rec"><div class="gut">D' + (i + 1) + '</div><div class="rt">' + inline(r, ctx) + '</div></div>'; }).join('') + '</div>' : '')
        + '</section>';
      if (!clean(bt.bluf)) problem('check', 'The bottom line has no summary paragraph yet.', 'bottom');
      if (takeaways.length > 5) problem('note', 'More than five key takeaways. Three to five keep the page to one.', 'bottom');
      if (words(bt.bluf) + words(bt.takeaways) + words(bt.decisions) + words(bt.depthNote) + words(bt.dimensions) > 420) problem('check', 'The bottom line may run past one page (about 350 words fit).', 'bottom');
    } else if (P.bottom) emptyPart('The bottom line', 'bottom');

    // ---- key considerations
    var cs = doc.considerations, items = pipes(cs.items), myths = pipes(cs.misconceptions), consHtml = '';
    if (P.considerations && (clean(cs.intro) || items.length || myths.length)) {
      consHtml = '<section class="part considerations">' + front('considerations', 'Key considerations') + paras(cs.intro, ctx)
        + (items.length ? '<div class="labeled cons">' + items.map(function (r, i) {
          var lab = r.length > 1 ? r[0] : pad2(i + 1), text = r.length > 1 ? r.slice(1).join(' | ') : r[0];
          return '<div class="li"><div class="gut">' + fmtText(lab) + '</div><div class="lt">' + inline(text, ctx) + '</div></div>';
        }).join('') + '</div>' : '')
        + (myths.length ? '<h3 class="plain">Common misconceptions</h3><table class="dtable myths"><thead><tr><th>What is often said</th><th>What the research shows</th></tr></thead><tbody>' + myths.map(function (r) {
          if (r.length < 2) problem('check', 'Misconception "' + trunc(r[0], 40) + '" needs a correction after a | mark.', 'considerations');
          return '<tr><td>' + inline(r[0], ctx) + '</td><td>' + inline(r.slice(1).join(' | '), ctx) + '</td></tr>';
        }).join('') + '</tbody></table>' : '')
        + '</section>';
    } else if (P.considerations) emptyPart('Key considerations', 'considerations');

    // ---- the research itself
    var bodyHtml = clean(doc.body) ? flow(doc.body, false) : '';
    if (!clean(doc.body)) problem('check', 'The research body is empty.', 'body');

    // ---- debates and open questions
    var db = doc.debates, debates = parseDebates(db.items), gaps = pipes(db.gaps), debHtml = '';
    if (P.debates && (clean(db.intro) || debates.length || gaps.length)) {
      debHtml = '<section class="part debates">' + front('debates', 'Debates and open questions', 'Debates and open questions') + paras(db.intro, ctx)
        + (debates.length ? (gaps.length ? '<h3 class="plain">Where accounts differ</h3>' : '') + debates.map(function (d, i) {
          if (!d.verdict) problem('check', 'Debate ' + (i + 1) + (d.q ? ' ("' + trunc(d.q, 40) + '")' : '') + ' has no assessment. Add a line starting with =.', 'debates');
          if (d.views.length < 2) problem('note', 'Debate ' + (i + 1) + ' gives fewer than two views.', 'debates');
          return '<div class="debate"><div class="gut">Debate ' + (i + 1) + '</div><div class="db">' + (d.q ? '<h4 class="dq">' + inline(d.q, ctx) + '</h4>' : '')
            + (d.views.length ? '<div class="views">' + d.views.map(function (v) {
              var mm = v.match(/^([^:\[\]()]{1,48}):\s+(.+)$/);
              return '<div class="view">' + (mm ? '<div class="vl">' + fmtText(mm[1]) + '</div><div class="vt">' + inline(mm[2], ctx) + '</div>' : '<div class="vt">' + inline(v, ctx) + '</div>') + '</div>';
            }).join('') + '</div>' : '')
            + (d.verdict ? '<div class="verdict"><span class="vk">Assessment</span> ' + inline(d.verdict, ctx) + '</div>' : '') + '</div></div>';
        }).join('') : '')
        + (gaps.length ? '<h3 class="plain">Open questions</h3><div class="labeled gaps">' + gaps.map(function (r, i) {
          return '<div class="li"><div class="gut">Q' + (i + 1) + '</div><div class="lt"><div class="gq">' + inline(r[0], ctx) + '</div>' + (r.length > 1 ? '<div class="settle"><span>What would settle it</span> ' + inline(r.slice(1).join(' | '), ctx) + '</div>' : '') + '</div></div>';
        }).join('') + '</div>' : '')
        + '</section>';
    } else if (P.debates) emptyPart('Debates and open questions', 'debates');

    // ---- reference: actors, timeline, glossary
    var cx = doc.context, actors = pipes(cx.actors), terms = pipes(cx.glossary), refHtml = '';
    if (P.context && (actors.length || clean(cx.timeline) || terms.length)) {
      refHtml = '<section class="part reference">' + front('reference', 'Reference: actors, timeline, terms', 'Reference')
        + (actors.length ? '<h3 class="plain">Key actors</h3><table class="dtable actors"><thead><tr><th>Who</th><th>What they are</th><th>Why they matter</th></tr></thead><tbody>' + actors.map(function (r) {
          return '<tr><td class="who">' + inline(r[0] || '', ctx) + '</td><td>' + inline(r[1] || '', ctx) + '</td><td>' + inline(r.slice(2).join(' | '), ctx) + '</td></tr>';
        }).join('') + '</tbody></table>' : '')
        + (clean(cx.timeline) ? '<h3 class="plain">Timeline</h3><div class="tl-wrap">' + timelineHtml({ data: cx.timeline }, ctx) + '</div>' : '')
        + (terms.length ? '<h3 class="plain">Terms</h3><dl class="gloss">' + terms.map(function (r) { return '<div class="gi"><dt>' + fmtText(r[0]) + '</dt><dd>' + inline(r.slice(1).join(' | '), ctx) + '</dd></div>'; }).join('') + '</dl>' : '')
        + '</section>';
    } else if (P.context) emptyPart('Reference (actors, timeline, terms)', 'context');

    // ---- source assessment
    var srcHtml = '';
    if (P.sources && listed.length) {
      var weak = listed.length - strong - rated.filter(function (s) { return /^C/.test(ratingOf(s)); }).length;
      var stat = function (n, what) { return '<div class="stat"><div class="big">' + n + '</div><div class="what">' + what + '</div></div>'; };
      var groupsHtml = ['core', 'supporting', 'further'].map(function (g) {
        var gs = listed.filter(function (s) { return s.group === g; }).sort(function (a, b) { return sourceLabel(a).localeCompare(sourceLabel(b)); });
        if (!gs.length) return '';
        return '<h3 class="plain">' + GROUPS[g] + '</h3><ol class="annot">' + gs.map(function (s) {
          var gr = ratingOf(s), cit = s.kind === 'osint' && CITER ? smartHtml(CITER.toHTML(CITER.build(Object.assign({}, s.st, { locator: '' })).seg)) : fmtText(s.full);
          return '<li><div class="grade' + (gr ? '' : ' none') + '">' + (gr ? esc(gr) : '—') + '</div><div class="ae"><div class="ct">' + cit + '</div>' + (clean(s.note) ? '<div class="an">' + inline(s.note, ctx, true) + '</div>' : '') + '</div></li>';
        }).join('') + '</ol>';
      }).join('');
      srcHtml = '<section class="part sources">' + front('sources', 'Source assessment')
        + '<div class="stats src-stats" style="grid-template-columns: repeat(4, minmax(0, 1fr))">' + stat(listed.length, 'Sources assessed') + stat(listed.filter(function (s) { return s.group === 'core'; }).length, 'Core sources') + stat(strong, 'Rated A or B: usually reliable or better') + stat(weak, 'Rated D to F, or not rated') + '</div>'
        + groupsHtml
        + '<div class="keymini"><div class="gut">Grades</div><div class="km"><p>Letters rate the source, numbers the information, after the Admiralty system used in the OSINT Style Guide.</p><div class="kg">'
        + RATING_KEY.rel.map(function (r) { return '<span><b>' + r[0] + '</b> ' + r[1] + '</span>'; }).join('') + '</div><div class="kg">'
        + RATING_KEY.cred.map(function (r) { return '<span><b>' + r[0] + '</b> ' + r[1] + '</span>'; }).join('') + '</div></div></div>'
        + '</section>';
      var unrated = listed.length - rated.length, bare = listed.filter(function (s) { return !clean(s.note); }).length;
      if (unrated) problem('check', unrated + ' listed source' + (unrated === 1 ? ' has' : 's have') + ' no reliability grade. Grade them under Sources.', 'sources');
      if (bare) problem('note', bare + ' listed source' + (bare === 1 ? ' has' : 's have') + ' no annotation. A line on what each is good for helps the reader.', 'sources');
    } else if (P.sources && !doc.sources.length) problem('note', 'No sources yet, so the source assessment is left out. Open an OSINT list file under Sources.', 'sources');

    var appHtml = clean(doc.appendix) ? flow(doc.appendix, true) : '';
    doc.visuals.forEach(function (v) { if (!usedVis[v.id]) problem('note', 'The visual [[' + v.id + ']] is not placed in the text yet.', 'visuals'); });
    doc.sources.forEach(function (s) { if (!usedKeys[s.key]) problem('note', 'Source @' + s.key + ' is not cited in the text.', 'sources'); });

    // ---- about this report
    var bk = doc.back, backHtml = '', dateTxt = clean(m.date), ver = clean(m.version) || '1.0';
    if (P.back) {
      var hist = pipes(bk.history);
      var ref = (clean(m.preparedBy) && !isGuide(m.preparedBy) ? fmtText(invertName(m.preparedBy)) + '. ' : '') + '“' + fmtText(title) + '.” <i>' + esc(label) + '</i> ' + esc(id) + ', version ' + esc(ver) + '. '
        + (clean(br.org) ? esc(clean(br.org)) + ', ' : '') + esc(dateTxt || 'n.d.') + '.';
      var row = function (k, v) { return v ? '<div class="brow"><div class="gut">' + k + '</div><div class="bt">' + v + '</div></div>' : ''; };
      backHtml = '<section class="back">' + front('about', 'About this report')
        + row('Prepared by', clean(m.preparedBy) ? '<b>' + fmtText(m.preparedBy) + '</b>' : '')
        + row('Prepared for', clean(m.preparedFor) ? fmtText(m.preparedFor) : '')
        + row('Method', clean(bk.method) ? paras(bk.method, ctx).replace(/<p>/g, '<p class="bp">') : '')
        + row('Handling', [clean(br.marking) ? '<b>' + esc(clean(br.marking)) + '.</b>' : '', clean(bk.distribution) ? fmtText(bk.distribution) : ''].filter(Boolean).join(' '))
        + row('Reference as', ref)
        + row('Versions', hist.length ? '<table class="dtable"><thead><tr><th>Version</th><th>Date</th><th>Change</th></tr></thead><tbody>' + hist.map(function (r) { return '<tr><td class="code">' + esc(r[0] || '') + '</td><td>' + esc(r[1] || '') + '</td><td>' + fmtText(r[2] || '') + '</td></tr>'; }).join('') + '</tbody></table>' : '')
        + row('Disclaimer', clean(br.disclaimer) ? fmtText(br.disclaimer) : '')
        + '<div class="colophon">' + (br.logo ? '<img class="logo" src="' + br.logo + '" alt="">' : '')
        + '<div class="cl">' + (clean(br.org) ? '<div class="b">' + esc(clean(br.org)) + '</div>' : '') + (clean(br.tagline) ? '<div>' + esc(clean(br.tagline)) + '</div>' : '')
        + (clean(br.site) ? '<div>' + esc(clean(br.site)) + '</div>' : '') + (clean(br.contact) ? '<div>' + esc(clean(br.contact)) + '</div>' : '')
        + (clean(br.license) ? '<div class="lic">' + fmtText(br.license) + '</div>' : '') + '</div></div>'
        + '</section>';
    }

    // ---- cover
    var lw = label.length, labSize = Math.max(36, Math.min(112, Math.floor(676 / (Math.max(6, lw) * 0.62))));
    var cover = '<section class="cover">'
      + '<div class="cv-brand">' + (br.logo ? '<img class="logo" src="' + br.logo + '" alt="">' : '')
      + '<div class="org">' + (clean(br.org) ? '<div class="o">' + esc(clean(br.org)) + '</div>' : '') + (clean(br.tagline) ? '<div class="t">' + esc(clean(br.tagline)) + '</div>' : '') + '</div>'
      + '<div class="r">' + (dateTxt ? '<span>' + esc(dateTxt) + '</span>' : '') + '<span class="tag">' + esc(id) + '</span></div></div>'
      + (clean(br.marking) ? '<div class="cv-mark">' + esc(clean(br.marking)) + '</div>' : '')
      + '<div class="cv-label" style="font-size:' + labSize + 'px">' + esc(label) + '</div>'
      + '<div class="cv-rule"><span></span><i></i></div>'
      + '<div class="cv-no">' + esc(label) + ' ' + esc(id) + (clean(m.status) ? ' · ' + esc(clean(m.status)) : '') + '</div>'
      + '<h1 class="cv-title">' + fmtText(title) + '</h1>'
      + (clean(m.question) ? '<div class="cv-q"><span class="k">The question</span>' + fmtText(m.question) + '</div>' : '')
      + '<div class="cv-meta">'
      + (clean(m.preparedFor) ? '<div><div class="k">Prepared for</div><div class="v">' + fmtText(m.preparedFor) + '</div></div>' : '')
      + (clean(m.preparedBy) ? '<div><div class="k">Prepared by</div><div class="v">' + fmtText(m.preparedBy) + '</div></div>' : '')
      + '<div><div class="k">Version</div><div class="v">' + esc(ver) + '</div></div>'
      + '<div><div class="k">Length</div><div class="v"><span class="cover-length">—</span> pages</div></div></div>'
      + (P.bottom && (depthN || conf) ? '<div class="cv-depth">'
        + (depthN ? '<div><div class="k">Depth</div><div class="v">' + meter(depthN, 5, 'm5') + '<b>' + depthN + '/5</b> ' + DEPTH[depthN - 1][1] + '</div></div>' : '')
        + (conf ? '<div><div class="k">Confidence</div><div class="v"><span class="conf c-' + conf.toLowerCase() + '">' + conf + '</span></div></div>' : '')
        + (listed.length ? '<div><div class="k">Sources</div><div class="v"><b>' + listed.length + '</b> assessed</div></div>' : '')
        + '</div>' : '')
      + (m.coverImage ? '<figure class="cv-img"><img src="' + m.coverImage + '" alt="">' + (clean(m.coverCaption) ? '<figcaption>' + fmtText(m.coverCaption) + '</figcaption>' : '') + '</figure>' : '')
      + '<div class="cv-foot"><div>' + esc(clean(br.site)) + '</div><div class="mk">' + esc(clean(br.marking)) + '</div></div>'
      + '</section>';

    // ---- contents, built last because it needs every heading and figure
    var contents = '<section class="contents"><h2 class="front" id="contents" data-run="Contents">Contents</h2><ol class="toc">'
      + toc.map(function (r) { return '<li class="l' + r.level + '"><span class="num">' + esc(r.num) + '</span><a href="#' + r.anchor + '">' + esc(r.title) + '</a></li>'; }).join('') + '</ol>'
      + (figs.length ? '<div class="lof"><div class="gut">Figures and tables</div><ol>' + figs.map(function (f) { return '<li><span class="lab">' + esc(f.label.replace('Figure', 'Fig.')) + '</span><a href="#' + f.anchor + '">' + esc(clean(f.title)) + '</a></li>'; }).join('') + '</ol></div>' : '')
      + '</section>';

    var vars = ':root{--rr-accent:' + accent + ';--rr-ink:' + ink + ';--rr-paper:' + paperColor + ';}';
    var box = 'font-family:"Plex Mono",monospace;font-size:11px;line-height:16px;letter-spacing:0.08em;text-transform:uppercase;color:' + ink + ';';
    var top = 'vertical-align:bottom;padding-bottom:10px;border-bottom:1px solid ' + ink + ';margin-bottom:36px;', bot = 'vertical-align:top;padding-top:10px;border-top:1px solid ' + ink + ';margin-top:28px;';
    var running = '@page{'
      + '@top-left{content:"' + cssStr(label + ' ' + id) + '";' + box + 'font-weight:700;' + top + '}'
      + '@top-right{content:string(section);' + box + top + '}'
      + '@bottom-left{content:"' + cssStr(shortTitle) + '";' + box + 'color:#565C61;' + bot + '}'
      + '@bottom-center{content:"' + cssStr(clean(br.marking)) + '";' + box + 'font-weight:700;color:' + accent + ';' + bot + '}'
      + '@bottom-right{content:counter(page, decimal-leading-zero) " / " counter(pages, decimal-leading-zero);' + box + bot + '}'
      + '}';
    var html = '<div class="rr">' + cover + contents + bottomHtml + consHtml + (bodyHtml ? '<section class="rr-body">' + bodyHtml + '</section>' : '') + debHtml + refHtml + srcHtml
      + (appHtml ? '<section class="rr-appendix">' + appHtml + '</section>' : '') + backHtml + '</div>';
    var allWords = [bt.bluf, bt.takeaways, bt.decisions, bt.depthNote, cs.intro, cs.items, cs.misconceptions, doc.body, db.intro, db.items, db.gaps, cx.actors, cx.timeline, cx.glossary, doc.appendix].reduce(function (a, t) { return a + words(t); }, 0);
    return {
      html: html, vars: vars + running, problems: problems, id: id, shortTitle: shortTitle,
      stats: { notes: notes, words: allWords, figures: figs.length, cited: Object.keys(usedKeys).length, sources: listed.length }
    };
  }
  // A heading as the contents and running head show it: no notes, citations, or markup.
  function plainText(s) {
    var t = String(s || ''), out = '', i = 0;
    while (i < t.length) {
      if ((t[i] === '^' && t[i + 1] === '[') || (t[i] === '[' && t[i + 1] === '@')) { var e = t[i] === '^' ? matching(t, i + 1) : t.indexOf(']', i); if (e > 0) { i = e + 1; continue; } }
      out += t[i++];
    }
    return smart(clean(out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|\*/g, '')));
  }
  function cssStr(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' '); }
  function invertName(name) {
    var n = clean(name);
    if (!n || /[,\[\]&]| and /.test(n)) return n;
    var w = n.split(' ');
    return w.length > 1 ? w[w.length - 1] + ', ' + w.slice(0, -1).join(' ') : n;
  }

  // ------------------------------------------------------------------ files
  var APP = 'Research Report Builder';
  function projectFile(doc) { return JSON.stringify({ app: APP, format: 1, savedAt: new Date().toISOString(), report: normalize(doc) }, null, 1) + '\n'; }
  function brandFile(brand) { return JSON.stringify({ app: APP, format: 1, kind: 'brand', savedAt: new Date().toISOString(), brand: normalize({ brand: brand }).brand }, null, 1) + '\n'; }
  function readJson(text) { try { return JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return null; } }
  // A report project, or a White Paper Builder project: its text, visuals, and sources carry over.
  function parseProject(text) {
    var j = readJson(text);
    if (!j || typeof j !== 'object') return { error: 'That file is not a Research Report Builder project: it could not be read.' };
    if (j.app === 'OSINT Citation Generator') return { error: 'That is an OSINT Citation Generator list file. Open it under Sources to cite from it.' };
    if (j.app === APP && j.kind === 'brand') return { error: 'That is a brand file. Open it under Brand.' };
    if (j.app === APP && j.report && typeof j.report === 'object') return { doc: normalize(j.report) };
    if (j.app === 'White Paper Builder' && j.paper && typeof j.paper === 'object') {
      var p = j.paper, pm = p.meta || {}, s = p.summary || {};
      var d = normalize({ body: p.body, appendix: p.appendix, visuals: p.visuals, sources: p.sources });
      Object.assign(d.meta, { title: String(pm.title || ''), question: String(pm.subtitle || ''), preparedBy: String(pm.author || ''), date: String(pm.date || ''), shortTitle: String(pm.shortTitle || '') });
      d.bottom.bluf = String(s.lead || ''); d.bottom.takeaways = String(s.findings || ''); d.bottom.decisions = String(s.recommendations || '');
      return { doc: d, from: 'White Paper Builder' };
    }
    return { error: 'That file is not a Research Report Builder project.' };
  }
  function parseBrand(text) {
    var j = readJson(text);
    if (j && j.app === APP && j.kind === 'brand' && j.brand && typeof j.brand === 'object') return { brand: normalize({ brand: j.brand }).brand };
    if (j && j.app === APP && j.report && j.report.brand) return { brand: normalize({ brand: j.report.brand }).brand };
    return { error: 'That file is not a brand file. Save one with Save brand.' };
  }

  return {
    useCiter: useCiter, defaults: defaults, normalize: normalize, render: render, blocks: blocks, inline: inline, parseData: parseData, parseNumber: parseNumber,
    chartSvg: chartSvg, plainText: plainText, splitLead: splitLead, importOsintList: importOsintList, keyFor: keyFor, sourceLabel: sourceLabel, ratingOf: ratingOf,
    projectFile: projectFile, parseProject: parseProject, brandFile: brandFile, parseBrand: parseBrand, parseDebates: parseDebates, contrast: contrast,
    VISUAL_KINDS: VISUAL_KINDS, MONTHS: MONTHS, DEPTH: DEPTH, GROUPS: GROUPS, PARTS: PARTS, slug: slug, words: words, invertName: invertName
  };
})();
if (typeof module !== 'undefined') module.exports = RR;
