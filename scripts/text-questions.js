// text-questions.js – the 16 written (non-visual) questions: 8 numerical, 8 verbal.
// All are original. Each has exactly one correct answer (the first option listed is the correct one;
// scripts/build-questions.js shuffles the positions). Order = easy, easy, easy, medium x3, hard x2.
//
// Numerical questions carry a `verify` function that recomputes the answer from the rule,
// so a typo in the prompt or the answer is caught when the questions are built.

const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i));

const NUMERICAL = [
  { // easy: add 3 each time
    difficulty: 'easy', prompt: 'What comes next?\n3, 6, 9, 12, ?',
    options: ['15', '14', '16', '18'],
    verify: () => seq(5, (i) => 3 * (i + 1)).join(', ') === '3, 6, 9, 12, 15',
  },
  { // easy: 5 x 12
    difficulty: 'easy', prompt: 'One pen costs ₹12. What do 5 pens cost?',
    options: ['₹60', '₹50', '₹55', '₹72'],
    verify: () => 5 * 12 === 60,
  },
  { // easy: squares with one intruder
    difficulty: 'easy', prompt: 'Which number does not belong?\n4, 9, 16, 20, 25',
    options: ['20', '4', '9', '16', '25'],
    verify: () => [4, 9, 16, 20, 25].filter((n) => !Number.isInteger(Math.sqrt(n))).join() === '20',
  },
  { // medium: multiply by 3
    difficulty: 'medium', prompt: 'What comes next?\n2, 6, 18, 54, ?',
    options: ['162', '108', '148', '216'],
    verify: () => seq(5, (i) => 2 * 3 ** i).join(', ') === '2, 6, 18, 54, 162',
  },
  { // medium: differences double (2^n + 1)
    difficulty: 'medium', prompt: 'What comes next?\n3, 5, 9, 17, 33, ?',
    options: ['65', '49', '57', '63'],
    verify: () => seq(6, (i) => 2 ** (i + 1) + 1).join(', ') === '3, 5, 9, 17, 33, 65',
  },
  { // medium: speed = 150 / 2.5 = 60 km/h; 4 h -> 240
    difficulty: 'medium', prompt: 'A train covers 150 km in 2.5 hours. At the same speed, how far does it go in 4 hours?',
    options: ['240 km', '200 km', '220 km', '260 km'],
    verify: () => (150 / 2.5) * 4 === 240,
  },
  { // hard: +2, x2, +2, x2 ...
    difficulty: 'hard', prompt: 'What comes next?\n4, 6, 12, 14, 28, 30, ?',
    options: ['60', '32', '58', '62'],
    verify: () => { const a = [4]; for (let i = 0; i < 6; i++) a.push(i % 2 === 0 ? a[i] + 2 : a[i] * 2); return a.join(', ') === '4, 6, 12, 14, 28, 30, 60'; },
  },
  { // hard: 100 -> 120 -> 96 (4% lower)
    difficulty: 'hard', prompt: 'A price goes up by 20%, then falls by 20%. Compared with the starting price, the final price is:',
    options: ['4% lower', 'The same', '4% higher', '2% lower'],
    verify: () => Math.round(100 * 1.2 * 0.8) === 96,
  },
];

const VERBAL = [
  { difficulty: 'easy', prompt: 'Hot is to cold as up is to …', options: ['down', 'high', 'sky', 'warm'] },
  { difficulty: 'easy', prompt: 'Which word does not belong?', options: ['Carrot', 'Apple', 'Banana', 'Mango'] },
  { difficulty: 'easy', prompt: 'Which word means almost the same as “rapid”?', options: ['quick', 'slow', 'heavy', 'quiet'] },
  { difficulty: 'medium', prompt: 'Book is to reading as fork is to …', options: ['eating', 'cooking', 'kitchen', 'spoon'] },
  { difficulty: 'medium', prompt: 'No cats are dogs. All kittens are cats.\nWhich statement must be true?', options: ['No kittens are dogs', 'Some kittens are dogs', 'All dogs are kittens', 'Some dogs are cats'] },
  { difficulty: 'medium', prompt: 'Whisper is to shout as drizzle is to …', options: ['downpour', 'rain', 'cloud', 'mist'] },
  { difficulty: 'hard', prompt: 'Which word means almost the same as “ephemeral”?', options: ['brief', 'lasting', 'bright', 'ancient'] },
  { difficulty: 'hard', prompt: 'Four people stand in a row, left to right. Ann is left of Ben. Ben is left of Cara. Dev is between Ann and Ben.\nWho is third from the left?', options: ['Ben', 'Ann', 'Cara', 'Dev'] },
];

module.exports = {
  'Numerical Reasoning': NUMERICAL,
  'Verbal Reasoning': VERBAL,
};
