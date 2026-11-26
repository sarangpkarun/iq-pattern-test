// One shared Razorpay client, built from environment variables.
const Razorpay = require('razorpay');

function getClient() {
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

// The browser sends JSON; Vercel usually parses it for us, but be safe.
function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

module.exports = { getClient, readJson };
