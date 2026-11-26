// meta-capi.js – sends the "Purchase" event to Meta's Conversions API (server side).
//
// Why: ad blockers and iOS can hide purchases from the browser Pixel. Sending the same purchase from our
// server, with the SAME event_id, lets Meta count it once and match it to the ad that caused it.
const crypto = require('crypto');

const DEFAULT_VERSION = 'v22.0'; // Meta retires old versions - check https://developers.facebook.com/docs/graph-api/changelog

// Meta wants emails lower-cased, trimmed and hashed with SHA-256. Meta never sees the plain address.
function hashEmail(email) {
  return crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');
}

// Build the event from the Razorpay order (our saved notes) and the captured payment.
function buildPurchaseEvent(order, payment) {
  const n = order.notes || {};
  const user = { em: [hashEmail(n.email)] };
  if (n.ip) user.client_ip_address = n.ip;
  if (n.ua) user.client_user_agent = n.ua;
  if (n.fbp) user.fbp = n.fbp;
  if (n.fbc) user.fbc = n.fbc;
  const event = {
    event_name: 'Purchase',
    event_time: Number(payment.created_at) || Math.floor(Date.now() / 1000),
    event_id: payment.id,                         // same id the browser Pixel used -> Meta removes the duplicate
    action_source: 'website',
    user_data: user,
    custom_data: { value: payment.amount / 100, currency: payment.currency }, // Razorpay amounts are in paise
  };
  if (n.src) event.event_source_url = n.src;
  return event;
}

// Send it. Returns 'skipped' when Meta is not configured, 'sent' on success, and throws if Meta refuses.
async function sendPurchase(order, payment, fetchImpl) {
  const pixelId = process.env.META_PIXEL_ID, token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return 'skipped';
  const body = { data: [buildPurchaseEvent(order, payment)] };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE; // shows up in Events Manager > Test Events
  const version = process.env.META_API_VERSION || DEFAULT_VERSION;
  const url = `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const res = await (fetchImpl || fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Meta CAPI responded ' + res.status);
  return 'sent';
}

module.exports = { hashEmail, buildPurchaseEvent, sendPurchase };
