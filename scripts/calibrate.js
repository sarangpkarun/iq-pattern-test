// calibrate.js – builds api/_lib/iq-table.json:
//   overall  : weighted score  -> estimated IQ                (mean 100, SD 15)
//   sections : section score   -> percentile, one table per section (for the "top X%" cards)
//
//   node scripts/calibrate.js                  simulate 50,000 test-takers (placeholder until you have real data)
//   node scripts/calibrate.js --data file.txt  use REAL answer strings, one per line (needs at least 200)
//
// Idea: line everyone up by score. Someone at the 84th percentile gets IQ ~115 (100 + 15 x z-score of 1.0).
const fs = require('fs');
const path = require('path');
const S = require('../api/_lib/score');

const OUT = path.join(__dirname, '..', 'api', '_lib', 'iq-table.json');

// ---- small seeded random generator so the simulation gives the same table every time ----
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// z-score for a probability p (bisection on the normal CDF – simple and plenty accurate).
function zFromP(p) {
  let lo = -6, hi = 6;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (S.normalCdf(mid) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// ---- collect one { overall, sections[] } weighted-score record per test-taker ----

// Simulated people. Each has a general ability plus a section-specific part, so sections are related but not identical.
// A question succeeds with probability  guess + (1 - guess) x logistic(1.2 x (ability - difficulty)),
// where guess = 1 / number of answer tiles.
function simulatedPeople(n, seed = 20240607) {
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const base = { easy: -1.3, medium: 0.1, hard: 1.3 };
  const diff = S.IDS.map((id, i) => base[S.KEY.tiers[id]] + ((i % 8) % 3 - 1) * 0.12);
  const guess = S.IDS.map((id) => 1 / S.KEY.options[id]);
  const people = [];
  for (let k = 0; k < n; k++) {
    const general = gauss();
    const sections = [];
    let overall = 0;
    S.SECTION_IDS.forEach((ids, s) => {
      const ability = 0.8 * general + 0.6 * gauss();
      let w = 0;
      ids.forEach((id) => {
        const i = S.IDS.indexOf(id);
        const p = guess[i] + (1 - guess[i]) / (1 + Math.exp(-1.2 * (ability - diff[i])));
        if (rand() < p) w += S.WEIGHTS[i];
      });
      sections.push(w); overall += w;
    });
    people.push({ overall, sections });
  }
  return people;
}

function realPeople(file) {
  const rows = fs.readFileSync(file, 'utf8').split(/\s+/).filter(Boolean);
  const good = rows.filter(S.isValidAnswerString);
  console.log(`Read ${rows.length} lines, ${good.length} valid answer strings.`);
  if (good.length < 200 && !process.argv.includes('--force')) {
    console.error('Need at least 200 valid answer strings for a stable table (add --force to ignore).');
    process.exit(1);
  }
  return good.map((str) => ({
    overall: S.weightedScore(str),
    sections: S.SECTION_IDS.map((ids, s) => S.sectionWeighted(s, ids.map((id) => str[S.IDS.indexOf(id)]).join(''))),
  }));
}

// ---- turn a list of scores into a table of "percentile rank" values ----
// index = round(score x scale); value = (people below + half of the people tied) / everyone, then convert().
function rankTable(scores, size, scale, convert) {
  const counts = new Array(size).fill(0);
  scores.forEach((w) => { counts[Math.min(size - 1, Math.round(w * scale))]++; });
  let below = 0;
  const t = counts.map((c) => {
    if (c === 0) return null;
    const rank = (below + c / 2) / scores.length;
    below += c;
    return convert(rank);
  });
  // scores nobody got: copy the nearest value below (or above) so the table has no gaps
  for (let i = 0; i < size; i++) if (t[i] === null) t[i] = i > 0 ? t[i - 1] : null;
  for (let i = size - 1; i >= 0; i--) if (t[i] === null) t[i] = t[i + 1];
  // never let the table go down as the score goes up
  for (let i = 1; i < size; i++) t[i] = Math.max(t[i], t[i - 1]);
  return t;
}

function buildTables(people) {
  // overall: percentile rank -> IQ, kept inside IQ_MIN..IQ_MAX, extremes pinned
  const size = Math.round(S.MAX_WEIGHTED) + 1;                       // weighted scores 0..39
  const overall = rankTable(people.map((p) => p.overall), size, 1, (r) => 100 + 15 * zFromP(r))
    .map((v) => Math.min(S.IQ_MAX, Math.max(S.IQ_MIN, Math.round(v))));
  overall[0] = S.IQ_MIN;
  overall[size - 1] = S.IQ_MAX;

  // sections: percentile 1..99, half-point steps in the score
  const sections = {};
  S.SECTIONS.forEach((name, s) => {
    const sz = Math.round(S.MAX_SECTION(s) * 2) + 1;                  // 0..20
    sections[name] = rankTable(people.map((p) => p.sections[s]), sz, 2, (r) => r * 100)
      .map((v) => Math.min(99, Math.max(1, Math.round(v))));
  });
  return { overall, sections };
}

module.exports = { buildTables, simulatedPeople };

// ---- run from the command line ----
if (require.main === module) {
  const dataIdx = process.argv.indexOf('--data');
  const people = dataIdx > -1 ? realPeople(process.argv[dataIdx + 1]) : simulatedPeople(50000);
  const source = dataIdx > -1 ? 'real' : 'simulated';
  const out = {
    version: 2,
    source,                                    // "simulated" = placeholder, "real" = built from real answers
    generatedAt: new Date().toISOString(),
    people: people.length,
    ...buildTables(people),
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${source}, ${people.length} people)`);
  console.log('overall weighted score -> IQ:', out.overall.map((v, i) => `${i}:${v}`).join(' '));
  S.SECTIONS.forEach((n) => console.log(`${n} (score x2 -> percentile):`, out.sections[n].map((v, i) => `${i}:${v}`).join(' ')));
}
