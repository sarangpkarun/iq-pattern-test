// POST /api/section-score  { section: 0-3, answers: "ABC--DEF" }  ->  { percentile }
// Powers the "you are in the top X%" card shown after each section.
// The answer key stays on the server. The percentile is rounded to the nearest 5 (and kept between 5 and 95),
// so this free preview never reveals exactly which answers were right.
const { scoreSection, isValidSectionAnswers } = require('./_lib/score');
const { readJson } = require('./_lib/razorpay');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { section, answers } = readJson(req);
  if (!Number.isInteger(section) || !isValidSectionAnswers(section, answers)) {
    return res.status(400).json({ error: 'Invalid section answers' });
  }
  const r = scoreSection(section, answers);
  res.status(200).json({ section: r.section, percentile: r.percentile });
};
