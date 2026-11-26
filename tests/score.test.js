// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('../api/_lib/score');
const { buildTables, simulatedPeople } = require('../scripts/calibrate');

const K = S.KEY;
const N = S.IDS.length; // 32
const right = S.IDS.map((id) => K.answers[id]);
const wrongLetter = (id) => 'ABCDEF'[(('ABCDEF'.indexOf(K.answers[id]) + 1) % K.options[id])];
const str = (arr) => arr.join('');
// answer string with only the listed question positions correct (0-based), everything else wrong
const only = (positions) => str(S.IDS.map((id, i) => (positions.includes(i) ? K.answers[id] : wrongLetter(id))));

test('32 questions in 4 sections of 8', () => {
  assert.strictEqual(N, 32);
  assert.deepStrictEqual(S.SECTIONS, ['Pattern Recognition', 'Spatial Reasoning', 'Numerical Reasoning', 'Verbal Reasoning']);
  S.SECTION_IDS.forEach((ids) => assert.strictEqual(ids.length, 8));
  assert.strictEqual(S.MAX_WEIGHTED, 39);
});

test('all correct -> 145, all wrong -> 70', () => {
  assert.strictEqual(S.scoreAnswers(str(right)).iq, 145);
  const none = S.scoreAnswers(only([]));
  assert.strictEqual(none.iq, 70);
  assert.strictEqual(none.raw, 0);
});

test('skipped ("-") questions score nothing, same as wrong', () => {
  const skipped = S.scoreAnswers('-'.repeat(N));
  assert.strictEqual(skipped.raw, 0);
  assert.strictEqual(skipped.iq, 70);
  // one correct, rest skipped -> exactly one point-worth
  const one = S.scoreAnswers(str(S.IDS.map((id, i) => (i === 0 ? K.answers[id] : '-'))));
  assert.strictEqual(one.raw, 1);
  assert.strictEqual(one.weighted, 1);
});

test('weights follow difficulty: easy x1, medium x1.25, hard x1.5', () => {
  const sec = S.SECTION_IDS[0].map((id) => K.tiers[id]);
  assert.deepStrictEqual(sec, ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard']);
  const idx = (n) => S.IDS.indexOf(S.SECTION_IDS[0][n]);
  assert.strictEqual(S.scoreAnswers(only([idx(0)])).weighted, 1);
  assert.strictEqual(S.scoreAnswers(only([idx(3)])).weighted, 1.25);
  assert.strictEqual(S.scoreAnswers(only([idx(7)])).weighted, 1.5);
  assert.ok(S.MAX_SECTION(0) === 9.75);
});

test('IQ never goes down when the weighted score goes up', () => {
  let last = 0;
  for (let w = 0; w <= 39; w++) {
    const iq = S.iqFromWeighted(w);
    assert.ok(iq >= last, `iq at ${w} (${iq}) < previous (${last})`);
    assert.ok(iq >= S.IQ_MIN && iq <= S.IQ_MAX);
    last = iq;
  }
});

test('percentile is consistent with IQ and stays within 1..99', () => {
  assert.strictEqual(S.scoreAnswers(str(right)).percentile, 99);
  assert.strictEqual(S.scoreAnswers(only([])).percentile, 2);
  assert.strictEqual(Math.round(S.normalCdf(0) * 100), 50);
});

test('category boundaries', () => {
  const cases = [[145, 'Very Superior'], [130, 'Very Superior'], [129, 'Superior'], [120, 'Superior'], [119, 'High Average'], [110, 'High Average'],
    [109, 'Average'], [90, 'Average'], [89, 'Low Average'], [80, 'Low Average'], [79, 'Below Average'], [70, 'Below Average']];
  for (const [iq, cat] of cases) assert.strictEqual(S.category(iq), cat, `iq ${iq}`);
});

test('result has meaning text, accuracy note and a blurb for each of the 4 sections', () => {
  const r = S.scoreAnswers(str(right));
  assert.ok(r.meaning.length > 30 && /estimate/i.test(r.accuracyNote) && /not a clinical/i.test(r.accuracyNote));
  assert.strictEqual(r.sections.length, 4);
  r.sections.forEach((s) => { assert.ok(s.blurb.length > 20); assert.strictEqual(s.percent, 100); assert.strictEqual(s.total, 8); });
});

test('invalid answer strings are rejected, dashes allowed', () => {
  for (const bad of ['', 'A', 'A'.repeat(31), 'A'.repeat(33), 'G'.repeat(32), null, undefined, 123, 'a'.repeat(32), 'A'.repeat(31) + '*']) {
    assert.strictEqual(S.isValidAnswerString(bad), false, String(bad));
    assert.throws(() => S.scoreAnswers(bad));
  }
  assert.strictEqual(S.isValidAnswerString('-'.repeat(32)), true);
  // a letter beyond the number of tiles for that question is invalid (4-tile question, letter E)
  const fourTile = S.IDS.findIndex((id) => K.options[id] === 4);
  const bad = right.slice(); bad[fourTile] = 'E';
  assert.strictEqual(S.isValidAnswerString(str(bad)), false);
});

test('scoreSection: rounds to 5, stays in 5..95, uses that section only', () => {
  for (let s = 0; s < 4; s++) {
    const ids = S.SECTION_IDS[s];
    const perfect = S.scoreSection(s, ids.map((id) => K.answers[id]).join(''));
    const nothing = S.scoreSection(s, '-'.repeat(8));
    assert.strictEqual(perfect.section, S.SECTIONS[s]);
    assert.strictEqual(perfect.percentile, 95);
    assert.strictEqual(nothing.percentile, 5);
  }
  // every possible weighted score gives a multiple of 5 between 5 and 95, never going down
  for (let s = 0; s < 4; s++) {
    let last = 0;
    for (let w = 0; w <= S.MAX_SECTION(s); w += 0.25) {
      const p = Math.min(95, Math.max(5, Math.round(S.sectionPercentile(s, w) / 5) * 5));
      assert.ok(p % 5 === 0 && p >= 5 && p <= 95 && p >= last, `${s} @${w}: ${p}`);
      last = p;
    }
  }
  assert.throws(() => S.scoreSection(0, 'ABC'));
  assert.throws(() => S.scoreSection(4, 'AAAAAAAA'));
});

test('section answers validation', () => {
  assert.strictEqual(S.isValidSectionAnswers(0, 'AAAAAAAA'), true);
  assert.strictEqual(S.isValidSectionAnswers(0, '--------'), true);
  assert.strictEqual(S.isValidSectionAnswers(0, 'AAAAAAA'), false);
  assert.strictEqual(S.isValidSectionAnswers(-1, 'AAAAAAAA'), false);
  assert.strictEqual(S.isValidSectionAnswers(4, 'AAAAAAAA'), false);
  assert.strictEqual(S.isValidSectionAnswers(0, 'ZZZZZZZZ'), false);
});

test('the shipped tables: sizes, source and monotonic', () => {
  const t = require('../api/_lib/iq-table.json');
  assert.strictEqual(t.overall.length, 40);
  assert.ok(['simulated', 'real'].includes(t.source));
  for (let i = 1; i < t.overall.length; i++) assert.ok(t.overall[i] >= t.overall[i - 1]);
  S.SECTIONS.forEach((name) => {
    const p = t.sections[name];
    assert.strictEqual(p.length, 21);
    for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1], name);
    assert.ok(p[0] >= 1 && p[p.length - 1] <= 99);
  });
});

test('simulated population: overall mean ~100, SD ~15; sections spread evenly', () => {
  const people = simulatedPeople(20000);
  const iqs = people.map((p) => S.iqFromWeighted(p.overall));
  const mean = iqs.reduce((a, b) => a + b, 0) / iqs.length;
  const sd = Math.sqrt(iqs.reduce((a, b) => a + (b - mean) ** 2, 0) / iqs.length);
  assert.ok(Math.abs(mean - 100) < 3, 'mean ' + mean);
  assert.ok(sd > 11 && sd < 17, 'sd ' + sd); // clamping to 70-145 trims the tails a little
  // section percentile cards: roughly half of people should land in the "top half" band
  for (let s = 0; s < 4; s++) {
    const ps = people.map((p) => S.sectionPercentile(s, p.sections[s]));
    const avg = ps.reduce((a, b) => a + b, 0) / ps.length;
    assert.ok(avg > 44 && avg < 56, `section ${s} avg percentile ${avg}`);
  }
});

test('random guessing and all-skipped land well below 100', () => {
  let seed = 12345;
  const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let total = 0;
  const RUNS = 2000;
  for (let n = 0; n < RUNS; n++) total += S.scoreAnswers(str(S.IDS.map((id) => 'ABCDEF'[Math.floor(r() * K.options[id])]))).iq;
  assert.ok(total / RUNS < 78, 'average guesser IQ ' + total / RUNS);
});

test('--data mode refuses too little data; buildTables handles a known spread', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iqcal-'));
  const script = path.join(__dirname, '..', 'scripts', 'calibrate.js');
  const small = path.join(dir, 'small.txt');
  fs.writeFileSync(small, str(right) + '\n');
  assert.throws(() => execFileSync('node', [script, '--data', small], { stdio: 'pipe' }));
  // uniform spread of scores: higher score -> higher IQ, middle of the range -> about 100
  const people = [];
  for (let w = 0; w <= 39; w++) for (let k = 0; k < 10; k++) people.push({ overall: w, sections: [w / 4, w / 4, w / 4, w / 4] });
  const t = buildTables(people);
  for (let i = 1; i < t.overall.length; i++) assert.ok(t.overall[i] >= t.overall[i - 1]);
  assert.ok(Math.abs(t.overall[19] - 100) <= 4 && Math.abs(t.overall[20] - 100) <= 4, `middle ~100: ${t.overall[19]}, ${t.overall[20]}`);
});
