#!/usr/bin/env node
/*
 * Tests for Research Report Builder. Run from the repository root:  node Tests/run.js
 * Needs Node 18 or later and nothing else. It loads index.html, runs the embedded OSINT
 * citation core and the page's own core, and checks what the report is built from.
 * Page layout itself (Paged.js) needs a browser and is not tested here.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const grab = (id) => { const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>')); if (!m) throw new Error('No <script id="' + id + '"> in index.html'); return m[1]; };
const OSINT = new Function(grab('osint') + ';return OSINT;')();
const RR = new Function('OSINT', grab('core') + ';return RR;')(OSINT);
RR.useCiter(OSINT);

let failed = 0, passed = 0;
function eq(got, want, label) {
  if (got === want) { passed++; return; }
  failed++; console.log('FAIL  ' + label + '\n  got : ' + JSON.stringify(got) + '\n  want: ' + JSON.stringify(want));
}
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const notesOf = (h) => (h.match(/<span class="fn">[\s\S]*?<\/span><sup class="fn-call">/g) || []).map((x) => strip(x.replace(/<sup[\s\S]*$/, '')).trim());
const has = (p, re) => p.problems.some((x) => re.test(x.msg));

// ---- 1. Sources and citations ----
const list = JSON.stringify({ app: 'OSINT Citation Generator', format: 2, sources: [
  { id: 'a1', fields: { type: 'book', authors: 'Michael Beckley', title: "Unrivaled: Why America Will Remain the World's Sole Superpower", titleStyle: 'italics', descType: 'Monograph', publisher: 'Cornell University Press', date: '2018' } },
  { id: 'a2', fields: { type: 'news', authors: 'Jane Doe', title: 'Drones Over the Front', location: 'Example Times', date: '2024-05-01', url: 'https://example.com/x', rating: 'B2' } }] });
const imp = RR.importOsintList(list, []);
eq(imp.sources.map((s) => s.key).join(','), 'beckley-unrivaled,doe-drones', 'sources: keys from author and first title word');
eq(RR.importOsintList(list, imp.sources).skipped, 2, 'sources: opening the same list again adds nothing');

function report(over) {
  const d = RR.defaults();
  Object.assign(d.meta, { title: 'Test Report', preparedBy: 'Jane Doe', preparedFor: 'The Editor', date: 'October 2026', number: '007' });
  Object.assign(d.brand, { org: 'Example Media', marking: 'Internal', site: 'example.org' });
  d.sources = imp.sources.map((s) => Object.assign({}, s, { group: 'core', note: 'Good on numbers.' })).concat([{ key: 'typed', kind: 'typed', full: 'Example Agency, *Annual Report* (2024).', short: 'Example Agency, *Annual Report*.', rating: 'A1', group: 'further' }]);
  for (const k of Object.keys(over || {})) d[k] = typeof over[k] === 'object' && !Array.isArray(over[k]) ? Object.assign(d[k], over[k]) : over[k];
  return d;
}
let r = RR.render(report({ bottom: { bluf: 'Lead [@beckley-unrivaled, 25-27].' }, body: '# Intro\n\nAgain [@beckley-unrivaled, 45]. Both [@doe-drones; @typed, 4].' }));
let n = notesOf(r.html);
eq(n[0], '1 Michael Beckley, Unrivaled: Why America Will Remain the World’s Sole Superpower [Monograph] (Cornell University Press: 2018): pp. 25–27.', 'citation: the first use, on the bottom line page, is the full footnote');
eq(n[1], '2 Beckley, Unrivaled, p. 45.', 'citation: later uses, in the research, are the short form');
eq(n[2], '3 Jane Doe, “Drones Over the Front,” Example Times [B2] (01 May 2024) https://example.com/x; Example Agency, Annual Report (2024), p. 4.', 'citation: two sources in one note');
eq(has(RR.render(report({ body: '# A\n\n[@nobody]' })), /@nobody/), true, 'checks: an unknown key is flagged');
eq(/<script/.test(RR.render(report({ body: '# A\n\n<script>alert(1)</script>' })).html), false, 'text: typed HTML is escaped');

// ---- 2. Order of parts and contents ----
r = RR.render(report({
  bottom: { bluf: 'BLUF.', depth: '4', dimensions: 'Complexity | High | many actors\nContention | moderate\nPace | sideways', treatment: 'Long-form video', effort: 'Ten hours.', confidence: 'Moderate', takeaways: 'One | High\nTwo\nThree | low', decisions: 'Cover it?' },
  considerations: { items: 'Legal | Watch defamation.\nNo label here', misconceptions: 'It is new | It is old\nNo correction' },
  debates: { items: '? Who started it?\n+ Hawks: the other side.\nmore of the hawk view\n+ Doves: nobody.\n= Unclear.\n? Second\n+ Only one view' , gaps: 'Who paid? | Bank records' },
  context: { actors: 'Acme | Company | Makes things', timeline: 'March 3, 2022, It began\n2024, It grew', glossary: 'UAS | Uncrewed aircraft system' },
  body: '# Background\n\nText.\n\n## Detail\n\nMore.', appendix: '# Method\n\n[[rating-key]]'
}));
const order = ['id="bottom-line"', 'id="considerations"', 'id="sec-1"', 'id="debates"', 'id="reference"', 'id="sources"', 'id="app-A"', 'id="about"'].map((x) => r.html.indexOf(x));
eq(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), true, 'order: bottom line, considerations, research, debates, reference, sources, appendix, about');
eq((r.html.match(/<li class="l[012]">/g) || []).length, 9, 'contents: six parts, a research section and subsection, and an appendix');
eq(/<a href="#bottom-line">Bottom line<\/a>/.test(r.html) && /<a href="#sources">Source assessment<\/a>/.test(r.html), true, 'contents: front parts are listed');

// ---- 3. Bottom line ----
eq(/<span class="dp-score">4<small>\/5<\/small><\/span><span class="dp-name">Deep<\/span>/.test(r.html), true, 'depth: score and name');
eq((r.html.match(/<span class="meter m5"[^>]*>(?:<i class="on"><\/i>){4}<i><\/i><\/span>/g) || []).length >= 1, true, 'depth: a five-step meter with four lit');
eq(/Enough for several pieces/.test(r.html), true, 'depth: the scale\'s own description when no note is given');
eq(/<th>Contention<\/th><td class="lv"><span class="meter m3"[^>]*><i class="on"><\/i><i class="on"><\/i><i><\/i><\/span><span>Moderate<\/span>/.test(r.html), true, 'depth: a dimension level, in any case');
eq(has(r, /"Pace" needs a level/), true, 'depth: an unknown level is flagged');
eq(/Ten hours\. 3 sources assessed, 2 rated A or B\./.test(strip(r.html)), true, 'research basis: effort plus counted sources and grades');
eq(/<span class="conf c-high">High confidence<\/span>/.test(r.html) && /<span class="conf c-low">Low confidence<\/span>/.test(r.html), true, 'takeaways: confidence from a trailing | level');
eq(/<div class="gut">02<\/div><div class="ft">Two<\/div>/.test(r.html), true, 'takeaways: a line with no level has no chip');
eq(/<div class="gut">D1<\/div><div class="rt">Cover it\?<\/div>/.test(r.html), true, 'decisions: numbered D1');
eq(/but not fully corroborated/.test(r.html), true, 'confidence: the standard wording when no note is given');
eq(/cv-depth/.test(r.html) && /4\/5<\/b> Deep/.test(r.html), true, 'cover: depth and confidence shown');
eq(has(RR.render(report({ bottom: { bluf: 'x' } })), /Rate the topic's depth/), true, 'checks: an unrated depth is flagged');

// ---- 4. Considerations, debates, reference ----
eq(/<div class="gut">Legal<\/div><div class="lt">Watch defamation\.<\/div>/.test(r.html) && /<div class="gut">02<\/div><div class="lt">No label here<\/div>/.test(r.html), true, 'considerations: label in the margin, or a number');
eq(has(r, /Misconception "No correction" needs a correction/), true, 'misconceptions: a missing correction is flagged');
const deb = RR.parseDebates('? Q\n+ A: one\ncontinued\n+ B: two\n= Verdict\nmore');
eq(JSON.stringify(deb), '[{"q":"Q","views":["A: one continued","B: two"],"verdict":"Verdict more"}]', 'debates: marks and continuation lines');
eq(/<div class="vl">Hawks<\/div><div class="vt">the other side\. more of the hawk view<\/div>/.test(r.html), true, 'debates: a labeled view');
eq(has(r, /Debate 2 \("Second"\) has no assessment/) && has(r, /Debate 2 gives fewer than two views/), true, 'debates: missing assessment and single view are flagged');
eq(/<span>What would settle it<\/span> Bank records/.test(r.html), true, 'open questions: what would settle it');
eq(/<td class="who">Acme<\/td><td>Company<\/td><td>Makes things<\/td>/.test(r.html), true, 'reference: actors table');
eq(/<span class="when">March 3, 2022<\/span>/.test(r.html), true, 'reference: timeline dates keep their commas');
eq(/<dt>UAS<\/dt><dd>Uncrewed aircraft system<\/dd>/.test(r.html), true, 'reference: glossary');

// ---- 5. Source assessment ----
const srcPart = r.html.slice(r.html.indexOf('id="sources"'), r.html.indexOf('id="app-A"'));
eq(/Core sources[\s\S]*Further reading/.test(srcPart) && !/Supporting sources/.test(srcPart), true, 'sources: grouped, empty groups left out');
eq(/<div class="grade">B2<\/div>/.test(srcPart) && /<div class="grade">A1<\/div>/.test(srcPart) && /<div class="grade none">—<\/div>/.test(srcPart), true, 'sources: grades shown, ungraded marked');
eq(/<div class="an">Good on numbers\.<\/div>/.test(srcPart), true, 'sources: annotations shown');
eq(has(r, /1 listed source has no reliability grade/), true, 'checks: ungraded sources are counted');
const om = report({ body: '# A\n\nx' }); om.sources[0].group = 'omit';
eq(/Beckley/.test(RR.render(om).html.slice(RR.render(om).html.indexOf('id="sources"'))), false, 'sources: a source marked Not listed stays out of the list');
eq(RR.ratingOf({ kind: 'osint', st: { rating: 'c3' } }) + RR.ratingOf({ kind: 'typed', rating: 'a1' }), 'C3A1', 'sources: grade from the citation or typed');

// ---- 6. Parts turned off or empty ----
const off = report({ bottom: { bluf: 'x', depth: '2' }, body: '# A\n\nText.' }); off.meta.parts = { bottom: false, considerations: false, debates: false, context: false, sources: false, back: false };
r = RR.render(off);
eq(['bottom-line', 'considerations', 'debates', 'reference', 'id="sources"', 'id="about"'].some((x) => r.html.includes(x)), false, 'parts: every optional part can be turned off');
r = RR.render(report({ body: '# A\n\nText.' }));
eq(has(r, /Key considerations is turned on but empty/) && !r.html.includes('id="considerations"'), true, 'parts: an empty part is left out and noted');

// ---- 7. Brand, cover, page furniture ----
r = RR.render(report({ brand: { org: 'Example Media', prefix: 'BR', label: 'Topic Brief', marking: 'Internal: editorial', accent: '#0A7A55', ink: '#1B2A4A', logo: 'data:image/png;base64,iVBORw0KGgo=' }, body: '# A\n\nText.' }));
eq(/@top-left\{content:"Topic Brief BR-007"/.test(r.vars) && /@bottom-center\{content:"Internal: editorial"/.test(r.vars) && /@bottom-left\{content:"Test Report"/.test(r.vars), true, 'pages: header has the report name and number, footer the title and marking');
eq(/--rr-accent:#0A7A55;--rr-ink:#1B2A4A;--rr-paper:#F4F5F2/.test(r.vars), true, 'brand: colors set the page variables');
eq((r.html.match(/<img class="logo" src="data:image\/png/g) || []).length, 2, 'brand: logo on the cover and the last page');
eq(/<div class="cv-mark">Internal: editorial<\/div>/.test(r.html) && /<span class="tag">BR-007<\/span>/.test(r.html), true, 'cover: marking strip and report number');
eq(has(RR.render(report({ brand: { ink: '#DDDDDD' } })), /ink color is too light/), true, 'brand: an ink too light to read is flagged');
eq(has(RR.render(report({ brand: { accent: '#F4F0E0' } })), /accent color is hard to see/), true, 'brand: a faint accent is flagged');
eq(/RR-007/.test(RR.render(report({ brand: { prefix: '' } })).vars), true, 'brand: the number prefix defaults to RR');
eq(strip((r.html.match(/Reference as<\/div><div class="bt">([\s\S]*?)<\/div>/) || [])[1] || ''), 'Doe, Jane. “Test Report.” Topic Brief BR-007, version 1.0. Example Media, October 2026.', 'about page: reference line');
eq(/javascript/.test(RR.render(report({ brand: { logo: 'javascript:alert(1)' } })).html), false, 'brand: unsafe logo data is dropped');

// ---- 8. Visuals and numbering, carried over from the White Paper Builder ----
r = RR.render(report({ visuals: [{ id: 'fig-a', kind: 'bar', title: 'Up', source: 'Data', data: 'Year,Value\n2020,1\n2021,3' }, { id: 'app-t', kind: 'table', title: 'In appendix', source: 'S', data: 'a,b\n1,2' }], body: '# One\n\n[[fig-a]]\n\n## Sub\n\nx', appendix: '# M\n\n[[app-t]]\n\n[[rating-key]]' }));
eq(['Figure 1', 'Table A1', 'Table A2'].every((s) => r.html.includes('<div class="vlabel">' + s + '</div>')), true, 'visuals: figure numbering and appendix tables');
eq(['bar', 'hbar', 'line'].every((k) => /^<svg class="chart"/.test(RR.chartSvg({ kind: k, data: 'Y,A\n2020,1\n2021,3' }, '#1F5FAD'))), true, 'charts: each kind draws');
eq(RR.splitLead('1,200, Sea days', 'stats').join('|'), '1,200|Sea days', 'data: numbers keep their commas');

// ---- 9. Files ----
const d0 = report({ body: '# A\n\nText.' });
const back = RR.parseProject(RR.projectFile(d0));
eq(back.doc.meta.title + '|' + back.doc.sources.length + '|' + back.doc.sources[0].group + '|' + back.doc.brand.org, 'Test Report|3|core|Example Media', 'project file: saves and reopens with grades, groups, and brand');
eq(/Open it under Sources/.test(RR.parseProject(list).error), true, 'project file: says what an OSINT list file is for');
const wp = JSON.stringify({ app: 'White Paper Builder', format: 1, paper: { meta: { title: 'WP Title', subtitle: 'Sub', author: 'A. Writer', date: 'May 2026' }, summary: { lead: 'Lead.', findings: 'F1\nF2', recommendations: 'R1' }, body: '# Body', appendix: '# App', visuals: [{ id: 'v', kind: 'bar', data: 'a,1' }], sources: imp.sources } });
const fromWp = RR.parseProject(wp);
eq([fromWp.from, fromWp.doc.meta.title, fromWp.doc.meta.question, fromWp.doc.meta.preparedBy, fromWp.doc.bottom.bluf, fromWp.doc.bottom.takeaways, fromWp.doc.body, fromWp.doc.visuals.length, fromWp.doc.sources.length].join('|'), 'White Paper Builder|WP Title|Sub|A. Writer|Lead.|F1\nF2|# Body|1|2', 'project file: a White Paper Builder project carries over');
const bf = RR.parseBrand(RR.brandFile({ org: 'Org', accent: '#112233', marking: 'M' }));
eq(bf.brand.org + bf.brand.accent + bf.brand.marking + bf.brand.label, 'Org#112233MResearch Report', 'brand file: saves and reopens, filling defaults');
eq(/brand file/.test(RR.parseProject(RR.brandFile({ org: 'x' })).error) && !!RR.parseBrand(RR.projectFile(d0)).brand, true, 'brand file: kept apart from projects, and a project\'s brand can be borrowed');

console.log(failed ? `\n${failed} failed, ${passed} passed` : `All ${passed} checks passed.`);
process.exit(failed ? 1 : 0);
