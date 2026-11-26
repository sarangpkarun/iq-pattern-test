// POST /api/verify-payment  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Checks the payment signature, then scores the answers saved in the order and returns the result.
// The answers come from Razorpay's stored order notes - never from the browser.
const crypto = require('crypto');
const { getClient, readJson } = require('./_lib/razorpay');
const { scoreAnswers } = require('./_lib/score');

function signatureMatches(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = readJson(req);
  if (!orderId || !paymentId || !signatureMatches(orderId, paymentId, signature)) {
    return res.status(400).json({ error: 'Payment could not be verified.' });
  }
  try {
    const order = await getClient().orders.fetch(orderId);
    const result = scoreAnswers(order.notes.answers);
    res.status(200).json({
      ...result,
      timeTaken: Number(order.notes.timeTaken) || 0,
      email: order.notes.email,
    });
  } catch (err) {
    console.error('verify-payment failed:', err);
    res.status(500).json({ error: 'Could not load your result. Please contact support.' });
  }
};
