// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const S = require('../api/_lib/score');
const { buildHtml, buildText, subjectFor, DISCLAIMER } = require('../api/_lib/email');

const K = S.KEY;
const wrong = (id) => 'ABCDEF'[('ABCDEF'.indexOf(K.answers[id]) + 1) % K.options[id]];
const mixed = S.IDS.map((id, i) => (i % 2 === 0 ? K.answers[id] : wrong(id))).join('');
const result = { ...S.scoreAnswers(mixed), timeTaken: 702 };
const OPTS = { siteName: 'Brain Lab', siteUrl: 'https://example.com', replyTo: 'help@example.com' };

test('subject contains the IQ', () => {
  assert.strictEqual(subjectFor(result), `Your IQ result is ready: ${result.iq}`);
});

test('html has the score, category, percentile, meaning, sections, blurbs, time and disclaimer', () => {
  const html = buildHtml(result, OPTS);
  assert.ok(html.includes(`>${result.iq}</td>`));
  assert.ok(html.includes(result.category));
  assert.ok(html.includes(`${result.percentile}%`));
  assert.ok(html.includes(result.meaning));
  result.sections.forEach((s) => { assert.ok(html.includes(s.name)); assert.ok(html.includes(s.blurb)); assert.ok(html.includes(`${s.percent}%`)); });
  assert.ok(html.includes('Completed in 11 min 42 s'));
  assert.ok(html.includes(DISCLAIMER));
  assert.ok(html.includes('Brain Lab') && html.includes('reply to this email'));
});

test('bar widths match the percentages', () => {
  const html = buildHtml(result, OPTS);
  assert.ok(html.includes(`width="${result.percentile}%"`));
  result.sections.forEach((s) => assert.ok(html.includes(`width="${s.percent}%"`), s.name));
  // 0% and 100% must not produce a zero-width cell
  const edge = { ...result, sections: result.sections.map((s, i) => ({ ...s, percent: i === 0 ? 0 : 100 })) };
  assert.ok(!buildHtml(edge, OPTS).includes('width="0%"'));
});

test('safe for email clients: no scripts, images, external css or non-https links', () => {
  const html = buildHtml(result, OPTS);
  assert.ok(!/<script|<img|<link|<style|@import/i.test(html));
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 1);
  links.forEach((l) => assert.ok(l.startsWith('https://'), l));
  assert.ok(Buffer.byteLength(html) < 40 * 1024, 'size ' + Buffer.byteLength(html)); // Gmail clips around 102 KB
});

test('share links: WhatsApp text has the score, site link is https only', () => {
  const html = buildHtml(result, OPTS);
  const wa = html.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/)[1];
  const decoded = decodeURIComponent(wa.split('text=')[1]);
  assert.ok(decoded.includes(`I scored ${result.iq}`) && decoded.includes('https://example.com'));
  // a non-https site url is dropped
  const bad = buildHtml(result, { ...OPTS, siteUrl: 'javascript:alert(1)' });
  assert.ok(!bad.includes('javascript:'));
  assert.ok(!bad.includes('Visit the test'));
});

test('hostile text is escaped', () => {
  const evil = '<script>alert(1)</script>"&';
  const html = buildHtml({ ...result, category: evil, meaning: evil, sections: result.sections.map((s) => ({ ...s, name: evil, blurb: evil })) }, { ...OPTS, siteName: evil });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('plain text version has the same facts', () => {
  const t = buildText(result, OPTS);
  assert.ok(t.includes(String(result.iq)) && t.includes(result.category) && t.includes(`${result.percentile}%`));
  result.sections.forEach((s) => assert.ok(t.includes(`${s.name}: ${s.percent}%`)));
  assert.ok(t.includes(DISCLAIMER) && t.includes('Completed in 11 min 42 s') && t.includes('I scored'));
  assert.ok(!/<[a-z]/i.test(t), 'no html tags in text version');
});

test('works without optional settings (no time, no site url, no reply-to)', () => {
  const r = { ...result, timeTaken: 0 };
  const html = buildHtml(r, { siteName: 'X', siteUrl: '', replyTo: '' });
  assert.ok(!html.includes('Completed in') && !html.includes('reply to this email'));
  assert.ok(buildText(r, { siteName: 'X', siteUrl: '', replyTo: '' }).includes('I scored'));
});

test('low, middle and top scores all render', () => {
  for (const str of [S.IDS.map(wrong).join(''), mixed, S.IDS.map((id) => K.answers[id]).join('')]) {
    const r = S.scoreAnswers(str);
    const html = buildHtml(r, OPTS);
    assert.ok(html.includes(`>${r.iq}</td>`) && html.includes(r.category));
  }
});
