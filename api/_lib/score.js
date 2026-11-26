// score.js – turns a string of answers ("BDAC...") into an IQ estimate.
//
// How it works (explain this in a presentation):
//   1. Each correct answer earns points. Harder questions are worth more. A skipped (timed-out) question earns nothing.
//   2. The weighted total is looked up in iq-table.json to get an estimated IQ (mean 100, SD 15).
//   3. The percentile is worked out from the IQ with the normal distribution.
//   4. Per-section scores are simple "% correct"; each finished section also gets a percentile ("top X%") from its own table.
// The table is built by scripts/calibrate.js – first from a simulation, later from real test-takers.
const KEY = require('./answers');

const SECTIONS = ['Pattern Recognition', 'Spatial Reasoning', 'Numerical Reasoning', 'Verbal Reasoning'];
const IDS = Object.keys(KEY.answers); // q01 ... q32, in the order shown to the visitor
const SECTION_IDS = SECTIONS.map((name) => IDS.filter((id) => KEY.sections[id] === name)); // 8 ids per section

// Points per question by difficulty: harder questions are worth more.
const TIER_POINTS = { easy: 1, medium: 1.25, hard: 1.5 };
const WEIGHTS = IDS.map((id) => TIER_POINTS[KEY.tiers[id]]);
const WEIGHT_OF = Object.fromEntries(IDS.map((id, i) => [id, WEIGHTS[i]]));
const MAX_WEIGHTED = WEIGHTS.reduce((a, b) => a + b, 0);                                  // 39
const MAX_SECTION = (i) => SECTION_IDS[i].reduce((a, id) => a + WEIGHT_OF[id], 0);        // 9.75

// IQ shown to the visitor is kept inside this range: a short test cannot measure beyond it reliably.
const IQ_MIN = 70, IQ_MAX = 145;

// Lookup tables (built by scripts/calibrate.js):
//   overall[round(weighted score)]            -> estimated IQ
//   sections[name][round(weighted score * 2)] -> percentile (share of test-takers beaten)
let TABLES = null;
try { TABLES = require('./iq-table.json'); } catch (e) { /* not generated yet: run  node scripts/calibrate.js */ }

// What each skill area measures (shown in the report and the email).
const SECTION_INFO = {
  'Pattern Recognition': 'How quickly you spot the rule behind a set of shapes and predict what comes next.',
  'Spatial Reasoning': 'How well you picture shapes being rotated, flipped and mirrored in your head.',
  'Numerical Reasoning': 'How well you spot number patterns and work with quantities in your head.',
  'Verbal Reasoning': 'How well you handle word meanings, relationships and simple logical deductions.',
};

// Plain-language explanation for each band. Always honest about the limits of a 25-question test.
const CATEGORY_INFO = {
  'Very Superior': 'You solved most of the puzzles, including nearly all of the hardest ones. This puts you well above the typical result on this test.',
  'Superior': 'You handled the hard puzzles better than most people. Your visual reasoning is a clear strength on this test.',
  'High Average': 'You did better than the typical test-taker, including some of the harder puzzles.',
  'Average': 'Your result sits in the middle range, where most people land. You solved the easier puzzles reliably and found some of the harder ones tricky.',
  'Low Average': 'You solved many of the early puzzles but found the harder ones difficult. Practice with similar puzzles often improves results.',
  'Below Average': 'You found many of the puzzles difficult on this attempt. Tiredness, distraction or unfamiliarity with this puzzle style can all lower a score.',
};
const ACCURACY_NOTE = 'This is an estimate from 25 puzzles, so it can easily be off by 10 points or more. It is not a clinical or professionally administered IQ test.';

// A single answer is a tile letter that exists for that question, or "-" when the question timed out.
function validAnswer(id, ch) {
  if (ch === '-') return true;
  const code = String(ch).charCodeAt(0) - 65; // A = 0
  return String(ch).length === 1 && code >= 0 && code < KEY.options[id];
}

// Is this a well-formed answer string for the whole test? Right length, every character valid.
function isValidAnswerString(str) {
  return typeof str === 'string' && str.length === IDS.length && IDS.every((id, i) => validAnswer(id, str[i]));
}

// Same check for one section's 8 answers (used for the "top X%" card after each section).
function isValidSectionAnswers(sectionIndex, str) {
  const ids = SECTION_IDS[sectionIndex];
  return !!ids && typeof str === 'string' && str.length === ids.length && ids.every((id, i) => validAnswer(id, str[i]));
}

// Standard normal cumulative distribution (Abramowitz-Stegun approximation).
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function category(iq) {
  if (iq >= 130) return 'Very Superior';
  if (iq >= 120) return 'Superior';
  if (iq >= 110) return 'High Average';
  if (iq >= 90) return 'Average';
  if (iq >= 80) return 'Low Average';
  return 'Below Average';
}

// Weighted points for the whole answer string (also used by scripts/calibrate.js).
function weightedScore(str) {
  let w = 0;
  IDS.forEach((id, i) => { if (str[i] === KEY.answers[id]) w += WEIGHTS[i]; });
  return w;
}

// Weighted points for one section's answers.
function sectionWeighted(sectionIndex, str) {
  let w = 0;
  SECTION_IDS[sectionIndex].forEach((id, i) => { if (str[i] === KEY.answers[id]) w += WEIGHT_OF[id]; });
  return w;
}

function needTables() {
  if (!TABLES) throw new Error('iq-table.json is missing. Run: node scripts/calibrate.js');
  return TABLES;
}

// Weighted score -> estimated IQ, using the lookup table.
function iqFromWeighted(weighted) {
  const t = needTables().overall;
  const idx = Math.min(t.length - 1, Math.max(0, Math.round(weighted)));
  return Math.min(IQ_MAX, Math.max(IQ_MIN, t[idx]));
}

// One section's weighted score -> percentile (0-100) from that section's table.
function sectionPercentile(sectionIndex, weighted) {
  const t = needTables().sections[SECTIONS[sectionIndex]];
  const idx = Math.min(t.length - 1, Math.max(0, Math.round(weighted * 2)));
  return t[idx];
}

// For the card shown right after a section: percentile rounded to the nearest 5 and kept within 5..95.
// (Coarse on purpose: the card is a free preview and should not reveal exactly which answers were right.)
function scoreSection(sectionIndex, str) {
  if (!isValidSectionAnswers(sectionIndex, str)) throw new Error('Invalid section answers');
  const p = sectionPercentile(sectionIndex, sectionWeighted(sectionIndex, str));
  return { section: SECTIONS[sectionIndex], percentile: Math.min(95, Math.max(5, Math.round(p / 5) * 5)) };
}

// Main function. Returns everything the result screen and the email need.
function scoreAnswers(str) {
  if (!isValidAnswerString(str)) throw new Error('Invalid answer string');
  const totals = {}, right = {};
  SECTIONS.forEach((s) => { totals[s] = 0; right[s] = 0; });
  let raw = 0;
  IDS.forEach((id, i) => {
    const section = KEY.sections[id];
    totals[section]++;
    if (str[i] === KEY.answers[id]) { raw++; right[section]++; }
  });
  const weighted = weightedScore(str);
  const iq = iqFromWeighted(weighted);
  const percentile = Math.min(99, Math.max(1, Math.round(normalCdf((iq - 100) / 15) * 100)));
  const cat = category(iq);
  const sections = SECTIONS.map((name) => ({
    name, correct: right[name], total: totals[name],
    percent: Math.round((right[name] / totals[name]) * 100), blurb: SECTION_INFO[name],
  }));
  return {
    raw, total: IDS.length, weighted, iq, percentile, category: cat,
    meaning: CATEGORY_INFO[cat], accuracyNote: ACCURACY_NOTE, sections,
  };
}

module.exports = {
  scoreAnswers, scoreSection, isValidAnswerString, isValidSectionAnswers, weightedScore, sectionWeighted,
  iqFromWeighted, sectionPercentile, normalCdf, category,
  SECTIONS, SECTION_IDS, WEIGHTS, MAX_WEIGHTED, MAX_SECTION, IQ_MIN, IQ_MAX, IDS, KEY,
};
