// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { hashEmail, buildPurchaseEvent, sendPurchase } = require('../api/_lib/meta-capi');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const order = { id: 'order_1', notes: { email: '  Buyer@Example.COM ', ip: '203.0.113.7', ua: 'Mozilla/5.0 Test', fbp: 'fb.1.1700000000000.123456789', fbc: 'fb.1.1700000000000.AbCdEf', src: 'https://example.com/?fbclid=abc' } };
const payment = { id: 'pay_ABC123', amount: 5000, currency: 'INR', created_at: 1700000100 };
const ENV_KEYS = ['META_PIXEL_ID', 'META_CAPI_TOKEN', 'META_TEST_EVENT_CODE', 'META_API_VERSION'];
function withEnv(env, fn) {
  const saved = {}; ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  Object.assign(process.env, env);
  const restore = () => ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  return Promise.resolve(fn()).finally(restore);
}

test('hashEmail: known SHA-256 vector and normalisation', () => {
  assert.strictEqual(hashEmail('a@b.com'), sha('a@b.com'));
  assert.strictEqual(hashEmail('  A@B.COM '), sha('a@b.com'));
  assert.strictEqual(hashEmail('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('buildPurchaseEvent: shape, same event_id as the browser, value from Razorpay, no plain-text email', () => {
  const e = buildPurchaseEvent(order, payment);
  assert.strictEqual(e.event_name, 'Purchase');
  assert.strictEqual(e.event_id, 'pay_ABC123');
  assert.strictEqual(e.event_time, 1700000100);
  assert.strictEqual(e.action_source, 'website');
  assert.deepStrictEqual(e.custom_data, { value: 50, currency: 'INR' });
  assert.deepStrictEqual(e.user_data.em, [sha('buyer@example.com')]);
  assert.strictEqual(e.user_data.client_ip_address, '203.0.113.7');
  assert.strictEqual(e.user_data.client_user_agent, 'Mozilla/5.0 Test');
  assert.strictEqual(e.user_data.fbp, 'fb.1.1700000000000.123456789');
  assert.strictEqual(e.user_data.fbc, 'fb.1.1700000000000.AbCdEf');
  assert.strictEqual(e.event_source_url, 'https://example.com/?fbclid=abc');
  assert.ok(!JSON.stringify(e).toLowerCase().includes('buyer@example.com'), 'plain email must not appear');
});

test('buildPurchaseEvent: optional fields are left out when we do not have them', () => {
  const e = buildPurchaseEvent({ notes: { email: 'a@b.com' } }, { id: 'pay_1', amount: 9900, currency: 'INR' });
  assert.deepStrictEqual(Object.keys(e.user_data), ['em']);
  assert.ok(!('event_source_url' in e));
  assert.strictEqual(e.custom_data.value, 99);
  assert.ok(e.event_time > 1700000000);
});

test('sendPurchase: skipped when Meta is not configured, no network call', async () => {
  await withEnv({}, async () => {
    let calls = 0;
    assert.strictEqual(await sendPurchase(order, payment, async () => { calls++; return { ok: true }; }), 'skipped');
    assert.strictEqual(calls, 0);
  });
  await withEnv({ META_PIXEL_ID: '12345' }, async () => { // token missing
    assert.strictEqual(await sendPurchase(order, payment, async () => { throw new Error('should not call'); }), 'skipped');
  });
});

test('sendPurchase: correct URL, token and body; test_event_code only when set', async () => {
  await withEnv({ META_PIXEL_ID: '987654321', META_CAPI_TOKEN: 'tok en/1' }, async () => {
    let seen;
    assert.strictEqual(await sendPurchase(order, payment, async (url, init) => { seen = { url, init }; return { ok: true }; }), 'sent');
    assert.match(seen.url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/987654321\/events\?access_token=tok%20en%2F1$/);
    assert.strictEqual(seen.init.method, 'POST');
    const body = JSON.parse(seen.init.body);
    assert.strictEqual(body.data.length, 1);
    assert.strictEqual(body.data[0].event_id, 'pay_ABC123');
    assert.ok(!('test_event_code' in body));
  });
  await withEnv({ META_PIXEL_ID: '1', META_CAPI_TOKEN: 't', META_TEST_EVENT_CODE: 'TEST123', META_API_VERSION: 'v99.0' }, async () => {
    let seen;
    await sendPurchase(order, payment, async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true }; });
    assert.strictEqual(seen.body.test_event_code, 'TEST123');
    assert.match(seen.url, /\/v99\.0\//);
  });
});

test('sendPurchase: throws when Meta refuses (the webhook catches it)', async () => {
  await withEnv({ META_PIXEL_ID: '1', META_CAPI_TOKEN: 't' }, async () => {
    await assert.rejects(sendPurchase(order, payment, async () => ({ ok: false, status: 400 })), /400/);
  });
});

test('pixel-config only ever outputs digits', async () => {
  const handler = require('../api/pixel-config');
  const run = (id) => { let out = '', headers = {}; process.env.META_PIXEL_ID = id;
    handler({}, { setHeader: (k, v) => { headers[k] = v; }, end: (s) => { out = s; } }); return { out, headers }; };
  assert.strictEqual(run('1234567890').out, 'window.META_PIXEL_ID="1234567890";');
  assert.strictEqual(run('1"};alert(1);//').out, 'window.META_PIXEL_ID="";');
  assert.strictEqual(run('').out, 'window.META_PIXEL_ID="";');
  assert.match(run('12345').headers['Content-Type'], /javascript/);
  delete process.env.META_PIXEL_ID;
});

test('privacy page mentions IP address and browser type', () => {
  const t = require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
  assert.ok(/IP address and browser type/.test(t) && /hashed/.test(t));
});
