// send-test-email.js – sends a sample result email through Resend, to check it in a real inbox.
//   RESEND_API_KEY=... EMAIL_FROM=... node scripts/send-test-email.js you@example.com
// (Without a verified domain, Resend only delivers to your own account email, from onboarding@resend.dev.)
const S = require('../api/_lib/score');
const { sendResultEmail } = require('../api/_lib/email');

const to = process.argv[2];
if (!to || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
  console.error('Usage: RESEND_API_KEY=... EMAIL_FROM=... node scripts/send-test-email.js you@example.com');
  process.exit(1);
}
const answers = S.IDS.map((id, i) => (i % 2 === 0 ? S.KEY.answers[id] : 'A')).join('');
sendResultEmail(to, { ...S.scoreAnswers(answers), timeTaken: 702 })
  .then(() => console.log('Sent a sample email to', to))
  .catch((e) => { console.error('Failed:', e.message); process.exit(1); });
