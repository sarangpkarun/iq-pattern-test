// app.js – the whole screen flow of the test.
// Screens: hook -> setup -> how it works -> questions (32, timed, in 4 sections) -> a result card after each section
//          -> analyzing -> locked result -> (pay) -> unlocked result.

const TOTAL = QUESTIONS.length;                 // 32
const PER_SECTION = 8;
const SECTION_NAMES = [...new Set(QUESTIONS.map((q) => q.section))];   // in the order they are asked
const SECTION_INTRO = {                         // one line shown on the card that leads into each section
  'Spatial Reasoning': 'Rotate, flip and mirror shapes in your head.',
  'Numerical Reasoning': 'Number patterns and quick mental maths.',
  'Verbal Reasoning': 'Word meanings, analogies and simple logic.',
};
const STORE_KEY = 'iqtest_progress_v2';

// Everything we need to remember lives in this one object (and is mirrored to localStorage).
let state = {
  qIndex: 0,        // which question is on screen (0-based)
  answers: [],      // chosen letters, or "-" when the time ran out, e.g. ["B", "-", "D", ...]
  ageRange: '',
  startedAt: 0,     // Date.now() when the first question appeared
  finished: false,
  timeTakenMs: 0,
  cardDone: -1,     // last section whose result card the visitor has moved past
  tracked: {},      // ad events already sent for this attempt, so refresh never double-counts
  payment: null,    // { order_id, payment_id, signature } once the visitor has paid
};
let locked = false; // true while an answer is being processed -> ignores double taps

const $ = (id) => document.getElementById(id);

// ---------- saving / loading (wrapped in try/catch: storage can be blocked) ----------
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.answers)) return s;
  } catch (e) { /* ignore */ }
  return null;
}
function clearSaved() {
  try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
}

// ---------- screens ----------
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === id));
  document.body.dataset.screen = id;                                   // the hook is cobalt, everything else is light
  $('themeColor').setAttribute('content', id === 'hook' ? '#2433e8' : '#f1f3ff');
  window.scrollTo(0, 0);
}

// ---------- hook: the little puzzle you can solve on the first screen ----------
(function initHero() {
  const slot = $('heroSlot'), msg = $('heroMsg');
  let solved = false;
  $('heroOpts').addEventListener('click', (e) => {
    const b = e.target.closest('.ho');
    if (!b || solved) return;
    if (b.dataset.ok === '1') {
      solved = true;
      b.classList.add('ok');
      slot.className = 'hc c9 solved';
      slot.innerHTML = b.innerHTML;
      msg.textContent = 'Yes. Rows are shapes, columns are colours. Now try 32 more.';
    } else {
      b.classList.remove('no'); void b.offsetWidth; b.classList.add('no');
      msg.textContent = 'Not quite. Check what each row and column has in common.';
    }
  });
})();

// ---------- hook -> setup -> how it works ----------
function freshState() {
  return { qIndex: 0, answers: [], ageRange: '', startedAt: 0, finished: false, timeTakenMs: 0, cardDone: -1, tracked: {}, payment: null };
}
function startTest() {
  state = freshState();
  track('ViewContent', { content_name: 'IQ test' });   // Start tapped
  state.tracked.viewContent = true;
  save();
  showScreen('setup');
}
function chooseAge(age, chip) {
  state.ageRange = age;
  if (chip) chip.classList.add('picked');
  setTimeout(() => { save(); showScreen('intro'); }, 250);
}
function beginQuestions() {
  state.startedAt = Date.now();
  save();
  showQuestion(0);
}

// ---------- the per-question countdown ----------
// Uses real time (Date.now), so switching tabs or a slow phone cannot give extra seconds.
let timerHandle = null;
function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }
function startTimer(i, q) {
  stopTimer();
  const total = q.timeLimit * 1000, end = Date.now() + total;
  const fill = $('timerFill'), num = $('timerNum');
  const tick = () => {
    const left = Math.max(0, end - Date.now());
    fill.style.transform = `scaleX(${left / total})`;
    num.textContent = Math.ceil(left / 1000);
    num.classList.toggle('low', left <= 5000);
    if (left <= 0) { stopTimer(); timeUp(i); }
  };
  tick();
  timerHandle = setInterval(tick, 100);
}

// ---------- questions ----------
function showQuestion(i) {
  locked = false;
  stopTimer();
  state.qIndex = i;
  const q = QUESTIONS[i];

  if (i === 9 && !state.tracked.q10) {              // first time question 10 is reached (shows where people drop off)
    state.tracked.q10 = true; save();
    trackCustom('Q10Reached');
  }

  $('qLabel').textContent = `Question ${i + 1} of ${TOTAL}`;
  $('progressFill').style.width = `${(i / TOTAL) * 100}%`;
  $('sectionTag').textContent = q.section;
  $('timeUp').hidden = true;

  // the puzzle: a picture, or written text
  const isText = q.type === 'text';
  $('stimulus').hidden = isText;
  $('promptText').hidden = !isText;
  if (isText) {
    $('promptText').textContent = q.prompt;
  } else {
    $('stimulus').src = q.image;
    $('stimulus').alt = `Puzzle ${i + 1}`;
  }

  // the answer tiles
  const tiles = $('tiles');
  tiles.innerHTML = '';
  tiles.className = 'tiles' + (isText ? ' text' : q.options.length > 4 ? ' cols-3' : '');
  q.options.forEach((opt, k) => {
    const letter = String.fromCharCode(65 + k);
    const b = document.createElement('button');
    b.className = 'tile';
    b.setAttribute('aria-label', 'Option ' + letter);
    const tag = document.createElement('span');
    tag.className = 'letter'; tag.textContent = letter;
    b.appendChild(tag);
    if (isText) {
      b.appendChild(document.createTextNode(opt));
    } else {
      const img = document.createElement('img');
      img.src = opt; img.alt = '';
      b.appendChild(img);
    }
    b.addEventListener('click', () => answer(i, letter, b));
    tiles.appendChild(b);
  });

  showScreen('question');
  // re-trigger the slide-in animation for each new question
  const el = $('question');
  el.classList.remove('active'); void el.offsetWidth; el.classList.add('active');

  // quietly load the next picture so it appears instantly
  const next = QUESTIONS[i + 1];
  if (next && next.type === 'image') { new Image().src = next.image; }

  startTimer(i, q);
}

function answer(i, letter, tile) {
  if (locked) return;           // ignore double taps
  locked = true;
  stopTimer();
  tile.classList.add('picked');
  if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* ignore */ } }

  state.answers[i] = letter;
  $('progressFill').style.width = `${((i + 1) / TOTAL) * 100}%`;
  save();
  setTimeout(() => advance(i), 300);
}

// Time ran out: the question counts as missed ("-") and we move on.
function timeUp(i) {
  if (locked) return;
  locked = true;
  state.answers[i] = '-';
  $('progressFill').style.width = `${((i + 1) / TOTAL) * 100}%`;
  save();
  $('timeUp').hidden = false;
  setTimeout(() => advance(i), 700);
}

// After question i: the next question, or the result card when a section has just ended.
function advance(i) {
  const n = i + 1;
  if (n % PER_SECTION === 0) showSectionDone(n / PER_SECTION - 1);
  else showQuestion(n);
}

// ---------- the "top X%" card after each section ----------
let cardSection = 0;
function showSectionDone(s) {
  stopTimer();
  cardSection = s;
  const name = SECTION_NAMES[s];
  document.querySelectorAll('#sectionDots li').forEach((li, k) => li.classList.toggle('on', k <= s));
  $('doneName').textContent = `${name} complete`;
  $('rankBig').textContent = '…';
  $('rankSub').textContent = 'Checking how you did';
  $('rankFill').style.width = '0';
  $('doneMsg').textContent = '';

  const last = s === SECTION_NAMES.length - 1;
  $('nextCard').hidden = last;
  if (!last) {
    $('nextName').textContent = `Up next: ${SECTION_NAMES[s + 1]}`;
    $('nextInfo').textContent = `${PER_SECTION} questions. ${SECTION_INTRO[SECTION_NAMES[s + 1]]} Each one is timed.`;
  }
  $('nextBtn').textContent = last ? 'See my result' : `Start ${SECTION_NAMES[s + 1]}`;

  if (!state.tracked['sec' + s]) { state.tracked['sec' + s] = true; save(); trackCustom('SectionCompleted', { section: name }); }
  showScreen('sectionDone');

  // the server holds the answer key, so it works out the percentile
  const mine = state.answers.slice(s * PER_SECTION, (s + 1) * PER_SECTION).map((a) => a || '-').join('');
  postJson('/api/section-score', { section: s, answers: mine })
    .then((r) => { if (cardSection === s) renderRank(r.percentile, name); })
    .catch(() => {                                   // the card still works without the number
      if (cardSection !== s) return;
      $('rankBig').textContent = 'Done';
      $('rankSub').textContent = name;
    });
}

// p = share of test-takers you beat (5..95). Top half: "Top 15%". Below the median: "Ahead of 40%" (still true, and kinder).
function renderRank(p, name) {
  $('rankBig').classList.toggle('long', p < 50);   // "Ahead of 40%" is longer than "Top 15%", so it is set a little smaller
  if (p >= 50) { $('rankBig').textContent = `Top ${100 - p}%`; $('rankSub').textContent = `on ${name}`; }
  else { $('rankBig').textContent = `Ahead of ${p}%`; $('rankSub').textContent = `of test-takers on ${name}`; }
  $('doneMsg').textContent =
    p >= 85 ? 'Excellent. That is a standout result.' :
    p >= 65 ? 'Strong. You are well ahead of most people.' :
    p >= 50 ? 'Solid. You are in the top half.' :
    p >= 30 ? 'A fair start. Every section is scored on its own, so the next one is a fresh chance.' :
              'A tough one. Every section is scored on its own, so the next one is a fresh start.';
  requestAnimationFrame(() => requestAnimationFrame(() => { $('rankFill').style.width = p + '%'; }));
}

function onNext() {
  state.cardDone = cardSection;
  save();
  if (cardSection < SECTION_NAMES.length - 1) showQuestion((cardSection + 1) * PER_SECTION);
  else finishTest();
}

// ---------- analyzing -> result ----------
function finishTest() {
  state.finished = true;
  state.timeTakenMs = Date.now() - state.startedAt;
  if (!state.tracked.completed) {
    state.tracked.completed = true;
    track('CompleteRegistration');
    trackCustom('TestCompleted');
  }
  save();                       // kept (not cleared) so Phase 3 can send the answers after payment
  showScreen('analyzing');

  const steps = document.querySelectorAll('#steps li');
  steps.forEach((li) => li.classList.remove('on'));
  steps.forEach((li, n) => setTimeout(() => li.classList.add('on'), 600 + n * 800));
  setTimeout(showResult, 4200);
}

function formatTime(ms) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} min ${total % 60} s`;
}

// ---------- locked result, payment, unlocked result ----------
const timeTakenSec = () => Math.round(state.timeTakenMs / 1000);
const answersString = () => Array.from({ length: TOTAL }, (_, i) => state.answers[i] || '-').join('');

// POST JSON helper. Throws an Error with the server's message when the request fails.
async function postJson(url, data) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

function showResult() {
  if (state.payment) return showPaidResult();      // already paid (e.g. page was refreshed)
  showScreen('result');
}

function setPayError(msg) {
  $('payError').textContent = msg || '';
  $('payError').hidden = !msg;
}
function setPaying(on) {
  $('payBtn').disabled = on;
  $('payBtn').textContent = on ? 'Please wait…' : 'Unlock my result – ₹50';
}

// Load Razorpay's checkout script only when someone taps Pay (keeps the first page load light).
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.head.appendChild(s);
  });
}

async function startPayment(e) {
  e.preventDefault();
  setPayError('');
  const email = $('email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setPayError('Please enter a valid email address.');

  setPaying(true);
  try {
    // 1) server creates the order (the price is decided on the server)
    const order = await postJson('/api/create-order', {
      email, answers: answersString(), timeTaken: timeTakenSec(), ageRange: state.ageRange,
      // ad details so the server can report the purchase to Meta (the email itself never goes to Meta from here)
      fbp: readCookie('_fbp'), fbc: readCookie('_fbc'), url: location.href,
    });
    if (!state.tracked.checkout) {                  // email is valid and the order exists: checkout has started
      state.tracked.checkout = true; save();
      track('InitiateCheckout', { value: order.amount / 100, currency: 'INR' });
    }
    // 2) open Razorpay checkout
    await loadCheckout();
    const rzp = new window.Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: 'INR',
      name: 'IQ Pattern Test',
      description: 'Full result report',
      prefill: { email },
      theme: { color: '#5a3ff0' },
      handler: (resp) => onPaid(resp, email, order.amount),
      modal: { ondismiss: () => setPaying(false) },
    });
    rzp.on('payment.failed', () => { setPaying(false); setPayError('Payment failed. You have not been charged – please try again.'); });
    rzp.open();
  } catch (err) {
    setPaying(false);
    setPayError(err.message);
  }
}

// 3) payment finished in the browser: ask the server to verify it and give us the result
async function onPaid(resp, email, amountPaise) {
  // same id as the server's Conversions API event, so Meta counts this purchase only once
  track('Purchase', { value: amountPaise / 100, currency: 'INR' }, resp.razorpay_payment_id);
  state.payment = {
    order_id: resp.razorpay_order_id, payment_id: resp.razorpay_payment_id, signature: resp.razorpay_signature, email,
  };
  save();
  await showPaidResult(true);
}

async function showPaidResult(celebrate) {
  try {
    const p = state.payment;
    const result = await postJson('/api/verify-payment', {
      razorpay_order_id: p.order_id, razorpay_payment_id: p.payment_id, razorpay_signature: p.signature,
    });
    renderUnlocked(result);
    if (celebrate) confetti();
  } catch (err) {
    // keep the saved payment so a refresh can try again
    showScreen('result');
    setPaying(false);
    setPayError('Your payment went through, but we could not load your result yet. Please refresh in a moment. ' + err.message);
  }
}

function renderUnlocked(r) {
  $('iqNumber').textContent = r.iq;
  $('iqCategory').textContent = r.category;
  $('meaningText').textContent = r.meaning;
  $('accuracyNote').textContent = r.accuracyNote;
  $('percentileText').textContent = `You scored higher than about ${r.percentile}% of test-takers.`;
  $('sectionBars').innerHTML = r.sections.map((s) =>
    `<div class="section-row"><div class="row-head"><span>${s.name}</span><b>${s.percent}%</b></div><div class="bar"><div data-w="${s.percent}"></div></div><p class="blurb">${s.blurb}</p></div>`).join('');
  $('timeLine').textContent = `Completed in ${formatTime(r.timeTaken * 1000)}.`;
  $('emailedLine').textContent = `A copy is being emailed to ${r.email}.`;
  showScreen('unlocked');
  $('percentileFill').style.width = '0';
  // animate the bars after the screen is visible
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('percentileFill').style.width = r.percentile + '%';
    document.querySelectorAll('#sectionBars .bar > div').forEach((el) => { el.style.width = el.dataset.w + '%'; });
  }));
}

// Small confetti burst on a canvas (no library). Skipped if the visitor prefers reduced motion.
function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ['#5a3ff0', '#f5a524', '#16a34a', '#ec4899', '#0ea5e9'];
  const bits = Array.from({ length: 90 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.4,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, s: 5 + Math.random() * 6,
    c: colors[Math.floor(Math.random() * colors.length)], r: Math.random() * 6,
  }));
  const end = Date.now() + 2800;
  (function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    bits.forEach((b) => { b.x += b.vx; b.y += b.vy; b.r += 0.15; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.6); ctx.restore(); });
    if (Date.now() < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

function retake() {
  clearSaved();
  startTest();
}

// ---------- wire up buttons ----------
$('startBtn').addEventListener('click', startTest);
$('skipAge').addEventListener('click', () => chooseAge('', null));
$('ageChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) chooseAge(chip.dataset.age, chip);
});
$('introBtn').addEventListener('click', beginQuestions);
$('nextBtn').addEventListener('click', onNext);
$('retakeBtn').addEventListener('click', retake);
$('retakeBtn2').addEventListener('click', retake);
$('payForm').addEventListener('submit', startPayment);
$('restartBtn').addEventListener('click', retake);

// Continue after "Welcome back": back to the card or question where they stopped.
$('continueBtn').addEventListener('click', () => {
  const n = state.answers.length;
  if (n >= TOTAL) return showSectionDone(SECTION_NAMES.length - 1);
  if (n > 0 && n % PER_SECTION === 0 && state.cardDone < n / PER_SECTION - 1) return showSectionDone(n / PER_SECTION - 1);
  showQuestion(n);
});

// ---------- on page load: resume if the visitor was mid-test ----------
(function init() {
  const saved = load();
  if (!saved) return;
  state = { ...state, ...saved };
  const n = state.answers.length;
  if (state.finished && n === TOTAL) {
    showResult();
  } else if (state.startedAt && n > 0) {
    // ask before resuming: "Welcome back"
    $('welcomeText').textContent = n >= TOTAL ? 'See your result?' : `Continue from Question ${n + 1}?`;
    showScreen('welcome');
  }
})();
