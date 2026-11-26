// email.js – builds and sends the result email through Resend.
//
// Emails are not web pages: Gmail/Outlook ignore most modern CSS. So this template uses the old, safe recipe:
// nested <table>s, inline styles only, no images, no JavaScript. We also send a plain-text copy,
// which helps deliverability and works in text-only mail apps.
const { Resend } = require('resend');

const DISCLAIMER = 'This is an online self-assessment for personal insight and entertainment. It is not a clinical or professionally administered IQ test.';
const COLORS = { ink: '#0d1236', muted: '#566090', accent: '#2433e8', soft: '#e2e6ff', track: '#d9defa', page: '#f1f3ff', card: '#ffffff', line: '#d3d9f6' };
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Escape text before putting it in HTML so nothing can inject markup.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Settings come from environment variables unless a test passes its own.
function settings(o = {}) {
  const url = o.siteUrl !== undefined ? o.siteUrl : (process.env.SITE_URL || '');
  return {
    siteName: o.siteName || process.env.SITE_NAME || 'IQ Pattern Test',
    siteUrl: /^https:\/\//.test(url) ? url : '',      // only ever link to https addresses
    replyTo: o.replyTo !== undefined ? o.replyTo : (process.env.EMAIL_REPLY_TO || ''),
  };
}

function formatTime(seconds) {
  const s = Math.round(Number(seconds) || 0);
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

// A progress bar made of two table cells (works everywhere, no images needed).
function bar(percent, height = 10) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const cell = (w, color) => `<td width="${w}%" height="${height}" bgcolor="${color}" style="background:${color};font-size:0;line-height:0;">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:99px;overflow:hidden;"><tr>${p > 0 ? cell(p, COLORS.accent) : ''}${p < 100 ? cell(100 - p, COLORS.track) : ''}</tr></table>`;
}

function shareText(result, s) {
  return `I scored ${result.iq} on the ${s.siteName} visual reasoning test.${s.siteUrl ? ' Try it: ' + s.siteUrl : ''}`;
}

// The accuracy note ends with the 'not a clinical test' sentence, which DISCLAIMER already says - keep only the first part.
function firstSentence(t) { return String(t || '').split(/(?<=\.)\s/)[0]; }

function subjectFor(result) { return `Your IQ result is ready: ${result.iq}`; }

function buildHtml(result, opts) {
  const s = settings(opts);
  const text = (t, size, color, extra = '') => `font-family:${FONT};font-size:${size}px;line-height:1.5;color:${color};${extra}`;
  const preheader = `Estimated IQ ${result.iq} · higher than about ${result.percentile}% of test-takers`;

  const sections = result.sections.map((sec) => `
    <tr><td style="padding:14px 0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="${text('', 15, COLORS.ink)}"><b>${esc(sec.name)}</b></td>
        <td align="right" style="${text('', 15, COLORS.ink)}"><b>${sec.percent}%</b></td>
      </tr></table>
      <div style="height:6px;line-height:6px;font-size:0;">&nbsp;</div>
      ${bar(sec.percent)}
      <div style="${text('', 13, COLORS.muted, 'padding-top:6px;')}">${esc(sec.blurb || '')}</div>
    </td></tr>`).join('');

  const timeLine = result.timeTaken ? `<tr><td style="${text('', 13, COLORS.muted, 'padding-top:16px;')}">Completed in ${esc(formatTime(result.timeTaken))}.</td></tr>` : '';

  const wa = 'https://wa.me/?text=' + encodeURIComponent(shareText(result, s));
  const btn = `display:inline-block;padding:12px 20px;border-radius:10px;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;`;
  const siteLink = s.siteUrl ? ` <a href="${esc(s.siteUrl)}" style="${btn}background:${COLORS.soft};color:${COLORS.accent};">Visit the test</a>` : '';
  const replyLine = s.replyTo ? `<br>Questions about your result? Just reply to this email.` : '';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(subjectFor(result))}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page};"><tr><td align="center" style="padding:20px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
    <tr><td style="${text('', 13, COLORS.accent, 'font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:0 4px 12px 4px;')}">${esc(s.siteName)}</td></tr>
    <tr><td bgcolor="${COLORS.card}" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:16px;padding:28px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="${text('', 14, COLORS.muted)}">Your estimated IQ</td></tr>
        <tr><td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:84px;line-height:1.05;font-weight:700;color:${COLORS.accent};padding-top:4px;">${result.iq}</td></tr>
        <tr><td align="center" style="${text('', 18, COLORS.ink, 'font-weight:700;')}">${esc(result.category)}</td></tr>
        <tr><td align="center" style="${text('', 14, COLORS.muted, 'padding:6px 0 16px 0;')}">Higher than about <b>${result.percentile}%</b> of test-takers</td></tr>
        <tr><td>${bar(result.percentile, 12)}</td></tr>

        <tr><td style="${text('', 18, COLORS.ink, 'font-weight:700;padding-top:28px;')}">What your score means</td></tr>
        <tr><td style="${text('', 15, COLORS.muted, 'padding-top:6px;')}">${esc(result.meaning || '')}</td></tr>

        <tr><td style="${text('', 18, COLORS.ink, 'font-weight:700;padding-top:28px;')}">Your skill areas</td></tr>
        ${sections}
        ${timeLine}

        <tr><td style="${text('', 18, COLORS.ink, 'font-weight:700;padding-top:24px;')}"><div style="border-top:1px solid ${COLORS.line};padding-top:24px;">Share your score</div></td></tr>
        <tr><td style="padding-top:10px;"><a href="${esc(wa)}" style="${btn}background:${COLORS.accent};color:#ffffff;">Share on WhatsApp</a>${siteLink}</td></tr>
      </table>
    </td></tr>
    <tr><td style="${text('', 12, COLORS.muted, 'padding:16px 8px 0 8px;')}">
      ${esc(firstSentence(result.accuracyNote))}<br><br>${esc(DISCLAIMER)}<br><br>
      You are receiving this because you purchased the full report at ${esc(s.siteName)}.${replyLine}
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// Plain-text version of the same email.
function buildText(result, opts) {
  const s = settings(opts);
  const lines = [
    `${s.siteName} – your result`, '',
    `Your estimated IQ: ${result.iq} (${result.category})`,
    `Higher than about ${result.percentile}% of test-takers.`, '',
    'WHAT YOUR SCORE MEANS', result.meaning || '', '',
    'YOUR SKILL AREAS',
    ...result.sections.map((x) => `- ${x.name}: ${x.percent}% – ${x.blurb || ''}`),
  ];
  if (result.timeTaken) lines.push('', `Completed in ${formatTime(result.timeTaken)}.`);
  lines.push('', 'SHARE YOUR SCORE', shareText(result, s), '',
    firstSentence(result.accuracyNote), DISCLAIMER, '',
    `You are receiving this because you purchased the full report at ${s.siteName}.`);
  if (s.replyTo) lines.push('Questions about your result? Just reply to this email.');
  return lines.join('\n');
}

async function sendResultEmail(to, result) {
  const s = settings();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const msg = { from: process.env.EMAIL_FROM, to, subject: subjectFor(result), html: buildHtml(result), text: buildText(result) };
  if (s.replyTo) msg.replyTo = s.replyTo;
  const { error } = await resend.emails.send(msg);
  if (error) throw new Error('Resend error: ' + (error.message || JSON.stringify(error)));
}

module.exports = { sendResultEmail, buildHtml, buildText, subjectFor, DISCLAIMER };
