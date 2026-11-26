# IQ Pattern Test

A mobile-first online reasoning test: 32 timed puzzles in four sections (patterns, spatial, numbers, words). Taking the test is free; the full IQ report is unlocked with a ₹50 Razorpay payment and emailed to the buyer.

Plain HTML, CSS and vanilla JavaScript in `public/`, with Vercel serverless functions in `api/`. No database and no build step.

## Layout

- `public/` – the website (one page with screens, plus the legal pages)
- `api/` – serverless functions: create-order, verify-payment, webhook, section-score, pixel-config
- `api/_lib/` – server-only code, including the answer key (`answers.js`), scoring, email and Meta Conversions API
- `scripts/` – question builder, score calibration, launch check, email preview
- `tests/` – unit tests, run with `node --test tests/`

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values (never commit `.env`).
3. Run `node scripts/check-launch.js` before going live.

A fuller write-up of how the whole flow works will be added in the deploy phase.
