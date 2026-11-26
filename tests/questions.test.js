// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const K = require('../api/_lib/answers');
const TEXT = require('../scripts/text-questions');
const QUESTIONS = new Function(fs.readFileSync(path.join(pub, 'questions.js'), 'utf8') + '; return QUESTIONS;')();

const SECTIONS = ['Pattern Recognition', 'Spatial Reasoning', 'Numerical Reasoning', 'Verbal Reasoning'];
const TIERS = ['easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard'];
const LIMIT = { easy: 15, medium: 25, hard: 40 };

test('32 questions, 4 sections x 8, in section order, easy -> hard inside each', () => {
  assert.strictEqual(QUESTIONS.length, 32);
  SECTIONS.forEach((name, s) => {
    const qs = QUESTIONS.slice(s * 8, s * 8 + 8);
    qs.forEach((q) => assert.strictEqual(q.section, name));
    assert.deepStrictEqual(qs.map((q) => q.difficulty), TIERS, name);
  });
});

test('ids are q01..q32 and match the answer key', () => {
  QUESTIONS.forEach((q, i) => assert.strictEqual(q.id, 'q' + String(i + 1).padStart(2, '0')));
  assert.deepStrictEqual(Object.keys(K.answers), QUESTIONS.map((q) => q.id));
  QUESTIONS.forEach((q) => {
    assert.strictEqual(K.sections[q.id], q.section);
    assert.strictEqual(K.tiers[q.id], q.difficulty);
    assert.strictEqual(K.options[q.id], q.options.length);
    assert.ok('ABCDEF'.slice(0, q.options.length).includes(K.answers[q.id]), q.id + ' answer is one of its tiles');
  });
});

test('time limit follows difficulty: 15 / 25 / 40 seconds', () => {
  QUESTIONS.forEach((q) => assert.strictEqual(q.timeLimit, LIMIT[q.difficulty], q.id));
});

test('question shapes: pictures for the first two sections, words and numbers for the last two', () => {
  QUESTIONS.forEach((q, i) => {
    if (i < 16) {
      assert.strictEqual(q.type, 'image');
      assert.ok(fs.existsSync(path.join(pub, q.image)), q.image);
      q.options.forEach((o) => assert.ok(fs.existsSync(path.join(pub, o)), o));
      assert.ok(q.options.length >= 4 && q.options.length <= 6);
    } else {
      assert.strictEqual(q.type, 'text');
      assert.ok(typeof q.prompt === 'string' && q.prompt.length > 8);
      assert.ok(q.options.length >= 4 && q.options.length <= 6);
      assert.strictEqual(new Set(q.options).size, q.options.length, q.id + ' has duplicate options');
      q.options.forEach((o) => assert.ok(typeof o === 'string' && o.length > 0 && o.length < 40));
    }
  });
});

test('written questions: the correct tile is the source answer; numeric rules re-check', () => {
  const all = [...TEXT['Numerical Reasoning'], ...TEXT['Verbal Reasoning']];
  QUESTIONS.slice(16).forEach((q, i) => {
    const src = all[i];
    assert.strictEqual(q.prompt, src.prompt);
    assert.strictEqual(q.options[K.answers[q.id].charCodeAt(0) - 65], src.options[0], q.id);
    assert.deepStrictEqual([...q.options].sort(), [...src.options].sort());
    if (src.verify) assert.ok(src.verify(), q.id);
  });
});

test('no stale or missing picture files in public/img', () => {
  const used = new Set();
  QUESTIONS.filter((q) => q.type === 'image').forEach((q) => [q.image, ...q.options].forEach((f) => used.add(path.basename(f))));
  const onDisk = fs.readdirSync(path.join(pub, 'img'));
  assert.deepStrictEqual(onDisk.sort(), [...used].sort());
});

test('correct answers are spread across the tile positions', () => {
  const dist = {};
  Object.values(K.answers).forEach((a) => { dist[a] = (dist[a] || 0) + 1; });
  Object.entries(dist).forEach(([l, n]) => assert.ok(n <= 8, `${l} is correct ${n} times`));
  assert.ok(Object.keys(dist).length >= 5, 'at least 5 different letters used');
});

test('no correct answers anywhere in public/', () => {
  const q = fs.readFileSync(path.join(pub, 'questions.js'), 'utf8').replace(/^\/\/.*$/gm, ''); // ignore the header comment
  assert.ok(!/"answer"|correct|answers\s*:/i.test(q));
  QUESTIONS.forEach((x) => assert.deepStrictEqual(Object.keys(x).filter((k) => /answer|correct|key/i.test(k)), []));
  // the key file is not under public/
  assert.ok(!fs.existsSync(path.join(pub, 'answers.js')));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  walk(pub).filter((f) => /\.(js|html|json)$/.test(f)).forEach((f) => assert.ok(!fs.readFileSync(f, 'utf8').includes('ANSWER KEY'), f));
});

test('questions.js and answers.js are exactly what scripts/build-questions.js produces', () => {
  const crypto = require('crypto');
  const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
  const files = [path.join(pub, 'questions.js'), path.join(__dirname, '..', 'api', '_lib', 'answers.js')];
  const before = files.map(hash);
  require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build-questions.js')], { stdio: 'pipe' });
  assert.deepStrictEqual(files.map(hash), before);
});
