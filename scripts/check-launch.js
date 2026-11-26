// check-launch.js – run this before going live:   node scripts/check-launch.js
// It lists anything still unfinished (placeholders, example values, missing settings) and exits with an error if there is any.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const problems = [], warnings = [];

// 1. Placeholders left in the business details or any public page
const pub = path.join(root, 'public');
for (const f of ['business.js', ...fs.readdirSync(pub).filter((n) => n.endsWith('.html'))]) {
  const file = path.join(pub, f);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  // in business.js only look at quoted values; in pages look for the marker anywhere
  const re = f.endsWith('.js') ? /(["'])\[PLACEHOLDER.*?\1/g : /\[PLACEHOLDER[^\]]*\]/g;
  [...text.matchAll(re)].forEach((m) => problems.push(`public/${f}: ${m[0]}`));
}

// 2. Environment values (read from .env if it exists; on Vercel set them in the dashboard instead)
const envFile = path.join(root, '.env');
if (!fs.existsSync(envFile)) {
  warnings.push('No .env file found. That is fine if the values are set in the Vercel dashboard, but check them there.');
} else {
  const env = {};
  fs.readFileSync(envFile, 'utf8').split('\n').forEach((l) => { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); });
  for (const k of ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM', 'SITE_URL', 'SITE_NAME', 'PRICE_PAISE', 'META_PIXEL_ID', 'META_CAPI_TOKEN']) {
    if (!env[k]) problems.push(`.env: ${k} is empty`);
  }
  if (/yourdomain\.com/.test(env.EMAIL_FROM || '')) problems.push('.env: EMAIL_FROM is still the example address');
  if (env.SITE_URL && !/^https:\/\//.test(env.SITE_URL)) problems.push('.env: SITE_URL must start with https://');
  if (env.META_TEST_EVENT_CODE) warnings.push('META_TEST_EVENT_CODE is set: events go to Test Events only and do not count for ads. Remove it when testing is done.');
  if (/^rzp_test_/.test(env.RAZORPAY_KEY_ID || '')) warnings.push('RAZORPAY_KEY_ID is a TEST key. Use live keys after KYC approval.');
  if (env.PRICE_PAISE && env.PRICE_PAISE !== '5000') warnings.push(`PRICE_PAISE is ${env.PRICE_PAISE}, but the site text says ₹50.`);
}

warnings.forEach((w) => console.log('warning:', w));
if (problems.length) {
  console.log(`\n${problems.length} thing(s) to fix before launch:`);
  problems.forEach((p) => console.log(' -', p));
  process.exit(1);
}
console.log('Launch check passed.');
