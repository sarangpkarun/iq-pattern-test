// legal.js – fills the business details into the legal pages.
// Elements like <span data-biz="email"></span> get BUSINESS.email; <a data-biz-mailto> becomes a mailto link.
(function () {
  document.querySelectorAll('[data-biz]').forEach(function (el) {
    var v = BUSINESS[el.dataset.biz] || '';
    el.textContent = v;
    if (v.indexOf('[PLACEHOLDER') === 0) el.classList.add('placeholder'); // yellow highlight while unfilled
  });
  document.querySelectorAll('[data-biz-mailto]').forEach(function (el) {
    el.href = 'mailto:' + BUSINESS.email;
    el.textContent = BUSINESS.email;
    if (BUSINESS.email.indexOf('[PLACEHOLDER') === 0) el.classList.add('placeholder');
  });
})();
