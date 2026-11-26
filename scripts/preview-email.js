// preview-email.js – writes a sample result email to a file so you can open it in a browser.
//   node scripts/preview-email.js [answers-type: good|mixed|bad] [output.html]
const fs = require('fs');
const S = require('../api/_lib/score');
const { buildHtml, buildText } = require('../api/_lib/email');

const kind = process.argv[2] || 'mixed';
const out = process.argv[3] || 'email-preview.html';
const right = S.IDS.map((id) => S.KEY.answers[id]);
const wrong = (id) => 'ABCDEF'[('ABCDEF'.indexOf(S.KEY.answers[id]) + 1) % S.KEY.options[id]];
const str = kind === 'good' ? right.join('')
  : kind === 'bad' ? S.IDS.map(wrong).join('')
  : S.IDS.map((id, i) => (i % 2 === 0 ? S.KEY.answers[id] : wrong(id))).join('');

const result = { ...S.scoreAnswers(str), timeTaken: 702 };
fs.writeFileSync(out, buildHtml(result));
fs.writeFileSync(out.replace(/\.html$/, '') + '.txt', buildText(result));
console.log(`Wrote ${out} (IQ ${result.iq}, ${result.category})`);
