// POST /api/webhook  – called by Razorpay when a payment is captured ("payment.captured").
// This is the reliable path: it sends the result email even if the visitor closed the tab after paying.
const crypto = require('crypto');
const { getClient } = require('./_lib/razorpay');
const { scoreAnswers } = require('./_lib/score');
const { sendResultEmail } = require('./_lib/email');
const { sendPurchase } = require('./_lib/meta-capi');

// Read the exact bytes Razorpay sent (the signature is calculated over them).
// Read the stream FIRST: on Vercel, touching req.body makes the platform consume and parse the stream.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.readableEnded) { // the platform already read it: use what it kept
      const b = req.body;
      return resolve(typeof b === 'string' ? b : Buffer.isBuffer(b) ? b.toString('utf8') : JSON.stringify(b || {}));
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function signatureOk(raw, signature) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const raw = await readRawBody(req);
  if (!signatureOk(raw, req.headers['x-razorpay-signature'])) return res.status(401).json({ error: 'Bad signature' });

  const event = JSON.parse(raw);
  if (event.event !== 'payment.captured') return res.status(200).json({ ignored: true });

  try {
    const razorpay = getClient();
    const payment = event.payload.payment.entity;
    const order = await razorpay.orders.fetch(payment.order_id);
    const notes = order.notes || {};

    const alreadyEmailed = notes.emailed === '1';
    const alreadyReported = notes.capi === '1';

    // 1) the result email (skipped if an earlier delivery already sent it, so retries never double-send)
    if (!alreadyEmailed) {
      await sendResultEmail(notes.email, { ...scoreAnswers(notes.answers), timeTaken: Number(notes.timeTaken) || 0 });
    }

    // 2) tell Meta about the purchase (best effort: a Meta problem must never fail the webhook or resend the email)
    let reported = alreadyReported;
    if (!alreadyReported) {
      try { reported = (await sendPurchase(order, payment)) === 'sent'; }
      catch (e) { console.error('Meta CAPI failed (continuing):', e.message); }
    }

    // 3) remember what is done. If this fails we only risk one duplicate on a retry, so don't fail the webhook.
    if (!alreadyEmailed || reported !== alreadyReported) {
      try { await razorpay.orders.edit(order.id, { notes: { ...notes, emailed: '1', ...(reported ? { capi: '1' } : {}) } }); }
      catch (e) { console.error('could not update order notes:', e); }
    }

    if (alreadyEmailed) return res.status(200).json({ alreadySent: true });
    res.status(200).json({ sent: true });
  } catch (err) {
    console.error('webhook failed:', err);
    res.status(500).json({ error: 'Failed' }); // 500 makes Razorpay retry later
  }
}

module.exports = handler;
// We need the raw, unparsed body to check Razorpay's signature, so turn off automatic body parsing.
module.exports.config = { api: { bodyParser: false } };
