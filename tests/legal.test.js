// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawnSync } = require('child_process');

const pub = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');
const PAGES = ['terms.html', 'privacy.html', 'refund.html', 'contact.html'];
const DISCLAIMER = 'An online self-assessment for personal insight and entertainment. Not a clinical or professionally administered IQ test.';

test('all four legal pages exist with a title, heading, back link and footer links', () => {
  for (const f of PAGES) {
    const t = read(f);
    assert.ok(/<title>.+<\/title>/.test(t) && /<h1>.+<\/h1>/.test(t), f);
    assert.ok(t.includes('href="./"'), f + ' back link');
    for (const l of ['terms.html', 'privacy.html', 'refund.html', 'contact.html']) assert.ok(t.includes(`href="${l}"`), `${f} footer links to ${l}`);
    assert.ok(t.includes(DISCLAIMER), f + ' disclaimer');
    assert.ok(t.includes('business.js') && t.includes('legal.js'), f + ' loads business details');
  }
});

test('page content covers what Razorpay and the law expect', () => {
  const terms = read('terms.html'), privacy = read('privacy.html'), refund = read('refund.html'), contact = read('contact.html');
  assert.ok(/&#8377;50/.test(terms) && /Every question is timed/.test(terms) && /18 or over/.test(terms) && /not a clinical/i.test(terms) && /Razorpay/.test(terms));
  assert.ok(/not affiliated/i.test(terms), 'no fake affiliation claims, explicit denial');
  assert.ok(/Meta Pixel/.test(privacy) && /Conversions API/.test(privacy) && /Razorpay/.test(privacy) && /Resend/.test(privacy) && /Vercel/.test(privacy));
  assert.ok(/Digital Personal Data Protection/.test(privacy) && /18 and over/.test(privacy) && /hashed/.test(privacy));
  assert.ok(/all sales are final/i.test(refund) && /no refunds/i.test(refund) && /5&ndash;7 business days/.test(refund));
  assert.ok(/data-biz="phone"/.test(contact) && /data-biz="address"/.test(contact) && /data-biz-mailto/.test(contact) && /&#8377;50/.test(contact));
});

test('the page text never claims university/Mensa/official endorsement', () => {
  for (const f of [...PAGES, 'index.html']) {
    const t = read(f).replace(/not affiliated[^.]*\./i, '');
    assert.ok(!/oxford|harvard|mensa|certified|official iq/i.test(t), f);
  }
});

test('every data-biz field used on the pages exists in business.js', () => {
  const sandbox = {};
  vm.runInNewContext(read('business.js') + '; this.B = BUSINESS;', sandbox);
  for (const f of PAGES) {
    for (const m of read(f).matchAll(/data-biz="(\w+)"/g)) assert.ok(sandbox.B[m[1]] !== undefined, `${f}: ${m[1]}`);
  }
});

test('footer links + disclaimer on hook, locked result and unlocked screens; none during questions', () => {
  const html = read('index.html');
  const section = (id) => html.slice(html.indexOf(`<section id="${id}"`), html.indexOf('</section>', html.indexOf(`<section id="${id}"`)));
  for (const id of ['hook', 'result', 'unlocked']) {
    const s = section(id);
    assert.ok(s.includes('terms.html') && s.includes('privacy.html') && s.includes('refund.html') && s.includes('contact.html'), id + ' links');
    assert.ok(s.includes(DISCLAIMER), id + ' disclaimer');
  }
  assert.ok(!section('question').includes('terms.html'));
  assert.ok(!/₹|Full report|Free to take/.test(section('hook')), 'the hook screen no longer shows the price');
});

test('pay form shows consent line with links', () => {
  const s = read('index.html');
  assert.ok(/By paying you agree to the <a href="terms.html"/.test(s) && /Refund Policy<\/a> \(all sales are final\)/.test(s));
});

test('Under 18 is gone from the setup screen and the 18+ note is shown', () => {
  const html = read('index.html');
  assert.ok(!/Under 18/.test(html));
  assert.ok(/aged 18 and over/.test(html));
});

test('create-order rejects "Under 18" and still accepts the adult ranges', async () => {
  const S = require('../api/_lib/score');
  const answers = S.IDS.map((id) => S.KEY.answers[id]).join('');
  const handler = require('../api/create-order');
  const call = async (ageRange) => {
    let status = 200, body;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; } };
    await handler({ method: 'POST', body: { email: 'a@b.com', answers, timeTaken: 100, ageRange } }, res);
    return { status, body };
  };
  const bad = await call('Under 18');
  assert.strictEqual(bad.status, 400);
  assert.match(bad.body.error, /age/i);
  // adult ranges pass validation (no Razorpay keys in the test, so they stop later with 500, never 400)
  for (const age of ['18–24', '25–34', '35–44', '45–54', '55+', '']) assert.notStrictEqual((await call(age)).status, 400, age);
});

test('check-launch lists placeholders and fails until they are filled in', () => {
  const script = path.join(__dirname, '..', 'scripts', 'check-launch.js');
  const r = spawnSync('node', [script], { encoding: 'utf8' });
  assert.notStrictEqual(r.status, 0);
  assert.ok(/PLACEHOLDER/.test(r.stdout));
  // a filled-in copy of the project passes the placeholder check
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-'));
  fs.mkdirSync(path.join(tmp, 'scripts')); fs.mkdirSync(path.join(tmp, 'public'));
  fs.copyFileSync(script, path.join(tmp, 'scripts', 'check-launch.js'));
  fs.writeFileSync(path.join(tmp, 'public', 'business.js'), "const BUSINESS = { name: 'Acme Pvt Ltd' };\n");
  const ok = spawnSync('node', [path.join(tmp, 'scripts', 'check-launch.js')], { encoding: 'utf8' });
  assert.strictEqual(ok.status, 0, ok.stdout);
});
