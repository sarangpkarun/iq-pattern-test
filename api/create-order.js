// POST /api/create-order  { email, answers, timeTaken, ageRange }  ->  { order_id, key_id, amount }
// Creates a Razorpay order. The price is set HERE on the server, never taken from the browser.
// Email + answers are saved in the order's "notes", so we need no database.
const { getClient, readJson } = require('./_lib/razorpay');
const { isValidAnswerString } = require('./_lib/score');

const AGE_RANGES = ['', '18–24', '25–34', '35–44', '45–54', '55+'];
const net = require('net');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// ---- advertising details (for the Meta Conversions API in the webhook) ----
// Anything that looks wrong is silently dropped - ad data must never block a payment.
const FBP_RE = /^fb\.[0-2]\.\d{10,16}\.\d{1,20}$/;
const FBC_RE = /^fb\.[0-2]\.\d{10,16}\.[A-Za-z0-9_-]{1,200}$/;
const clip = (v, n = 250) => String(v).slice(0, n);

function cleanUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' ? clip(x.href) : ''; } catch (e) { return ''; }
}
function clientIp(req) {
  const fwd = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  const ip = fwd || (req.socket && req.socket.remoteAddress) || '';
  return net.isIP(ip) ? ip : '';
}

// The order "notes" are our database: Razorpay keeps them for us (max 15 keys, 256 characters each).
// The IP address and browser are the BUYER's - the webhook is called by Razorpay, so it cannot see them later.
function buildNotes({ email, answers, secs, ageRange, fbp, fbc, url, req }) {
  const notes = { email, answers, timeTaken: String(secs) };
  const optional = {
    ageRange: ageRange || '',
    fbp: typeof fbp === 'string' && FBP_RE.test(fbp) ? fbp : '',
    fbc: typeof fbc === 'string' && FBC_RE.test(fbc) ? fbc : '',
    src: cleanUrl(url),
    ip: clientIp(req),
    ua: clip((req.headers && req.headers['user-agent']) || ''),
  };
  Object.keys(optional).forEach((k) => { if (optional[k]) notes[k] = optional[k]; });
  return notes;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { email, answers, timeTaken, ageRange, fbp, fbc, url } = readJson(req);

  // --- validate everything the browser sent ---
  if (typeof email !== 'string' || email.length > 120 || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!isValidAnswerString(answers)) return res.status(400).json({ error: 'Invalid answers.' });
  const secs = Number(timeTaken);
  if (!Number.isInteger(secs) || secs < 0 || secs > 86400) return res.status(400).json({ error: 'Invalid time.' });
  if (!AGE_RANGES.includes(ageRange || '')) return res.status(400).json({ error: 'Invalid age range.' });

  try {
    const amount = Number(process.env.PRICE_PAISE || 5000); // paise: 5000 = ₹50
    const order = await getClient().orders.create({
      amount,
      currency: 'INR',
      receipt: 'iq_' + Date.now(),
      notes: buildNotes({ email: email.trim().toLowerCase(), answers, secs, ageRange, fbp, fbc, url, req }),
    });
    res.status(200).json({ order_id: order.id, key_id: process.env.RAZORPAY_KEY_ID, amount });
  } catch (err) {
    console.error('create-order failed:', err);
    res.status(500).json({ error: 'Could not start the payment. Please try again.' });
  }
};
