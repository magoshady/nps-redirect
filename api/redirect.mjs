/**
 * NPS confirmation + submission endpoint.
 *
 * GET  - renders the confirmation page. Never writes anything.
 * POST - verifies the submit token, then records the vote by calling Apps
 *        Script server-side. The customer's browser never touches
 *        script.google.com.
 *
 * The GET/POST split is the thing that stops link scanners: mail security
 * products (Defender Safe Links, Proofpoint, Mimecast) fetch the URL in the
 * email *and* follow the links on the page it returns, but they issue GET and
 * HEAD requests only.
 */

import {
  createSubmitToken,
  escapeHtml,
  parseScore,
  signVote,
  verifyInviteToken,
  verifySubmitToken,
} from './_lib/token.mjs';

const BRAND = {
  name: process.env.NPS_BRAND_NAME || 'Impressive Electrical',
  site: process.env.NPS_BRAND_URL || 'https://impressiveelectrical.com.au',
  supportEmail: process.env.NPS_SUPPORT_EMAIL || 'support@impressivebatteries.com.au',
  accent: '#e0001a',
};

const SECRET = process.env.NPS_SECRET;
const APPS_SCRIPT_URL = process.env.NPS_APPS_SCRIPT_URL;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );

  if (!SECRET || !APPS_SCRIPT_URL) {
    console.error('Missing NPS_SECRET or NPS_APPS_SCRIPT_URL environment variable');
    return send(res, 500, page('Something went wrong', '<p>We could not load the survey just now. Please try again shortly.</p>'));
  }

  if (req.method === 'GET' || req.method === 'HEAD') return renderConfirmation(req, res);
  if (req.method === 'POST') return recordVote(req, res);

  res.setHeader('Allow', 'GET, POST');
  return send(res, 405, page('Not allowed', '<p>That request is not supported.</p>'));
}

/* ---------------------------------------------------------------- GET ---- */

function renderConfirmation(req, res) {
  const score = parseScore(req.query.score);
  const inviteToken = typeof req.query.t === 'string' ? req.query.t : '';

  if (score === null) return send(res, 400, invalidLinkPage());

  const invite = verifyInviteToken(inviteToken, SECRET);
  if (!invite.ok) {
    return send(res, 400, invite.reason === 'expired' ? expiredLinkPage() : invalidLinkPage());
  }

  const submitToken = createSubmitToken(inviteToken, score, SECRET);

  // The submit token is delivered base64-encoded and written into the form by
  // JavaScript. A crawler that submits the form as parsed sends an empty value
  // and is rejected.
  const body = `
      <h1>Confirm your rating</h1>
      <div class="score">${score}<span class="out-of">/10</span></div>
      <p>You're about to tell us how likely you are to recommend ${escapeHtml(BRAND.name)}.</p>
      <form method="POST" action="/r" id="nps-form">
        <input type="hidden" name="score" value="${score}">
        <input type="hidden" name="t" value="${escapeHtml(inviteToken)}">
        <input type="hidden" name="st" id="st" value="">
        <button type="submit" class="btn" id="nps-submit" disabled>Confirm my rating</button>
      </form>
      <p class="note">Not the rating you meant? Close this page and choose a different number in the email.</p>
      <noscript>
        <p class="note">
          Your browser has JavaScript turned off, so we can't submit this rating.
          Please open the email in another browser, or reply to it and we'll record your score manually.
        </p>
      </noscript>
      <script>
        (function () {
          var field = document.getElementById('st');
          var button = document.getElementById('nps-submit');
          field.value = atob('${Buffer.from(submitToken).toString('base64')}');
          button.disabled = false;
          document.getElementById('nps-form').addEventListener('submit', function () {
            button.disabled = true;
            button.textContent = 'Sending\\u2026';
          });
        })();
      </script>`;

  return send(res, 200, page('Confirm your rating', body));
}

/* --------------------------------------------------------------- POST ---- */

async function recordVote(req, res) {
  const form = req.body && typeof req.body === 'object' ? req.body : {};
  const score = parseScore(form.score);
  const inviteToken = typeof form.t === 'string' ? form.t : '';
  const submitToken = typeof form.st === 'string' ? form.st : '';

  if (score === null) return send(res, 400, invalidLinkPage());

  const invite = verifyInviteToken(inviteToken, SECRET);
  if (!invite.ok) {
    return send(res, 400, invite.reason === 'expired' ? expiredLinkPage() : invalidLinkPage());
  }

  const submit = verifySubmitToken(submitToken, inviteToken, score, SECRET);
  if (!submit.ok) {
    // Anything landing here is an automated submission or a stale tab.
    console.warn('Rejected submission', { reason: submit.reason, customer: invite.customer });
    return send(res, 400, staleFormPage());
  }

  const ts = Date.now();
  const vote = {
    score,
    customer: invite.customer,
    email: invite.email,
    record: invite.record,
    ts,
  };

  let result;
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...vote, sig: signVote(vote, SECRET) }),
    });
    const text = await response.text();
    try {
      result = JSON.parse(text);
    } catch {
      console.error('Apps Script returned non-JSON', response.status, text.slice(0, 400));
      throw new Error('bad_response');
    }
    if (!response.ok || result.status === 'error') {
      console.error('Apps Script rejected the vote', response.status, result);
      throw new Error('rejected');
    }
  } catch (error) {
    console.error('Failed to record vote', error);
    return send(
      res,
      502,
      page(
        'We could not save that',
        `<p>Something went wrong while saving your rating. Please try the link again in a moment.</p>
         <p class="note">If it keeps happening, email us at ${escapeHtml(BRAND.supportEmail)} and we'll record it for you.</p>`,
      ),
    );
  }

  return send(res, 200, thankYouPage(score, result));
}

/* --------------------------------------------------------------- pages --- */

function thankYouPage(score, result) {
  const revised = result.status === 'revised';
  const closing =
    score >= 9
      ? "We're really glad you had a good experience."
      : score >= 7
        ? "Thanks for the honest score — we'll keep working at it."
        : "We're sorry we fell short. Someone from our team will be in touch.";

  return page(
    'Thank you',
    `<h1>Thank you for your feedback</h1>
     <div class="score">${score}<span class="out-of">/10</span></div>
     ${revised ? `<p class="note">We've updated your earlier response of ${escapeHtml(result.previousScore)}/10.</p>` : ''}
     <p>${closing}</p>
     <p class="note">You can close this page now.</p>`,
  );
}

const invalidLinkPage = () =>
  page(
    'That link looks incomplete',
    `<h1>That link looks incomplete</h1>
     <p>Please open the rating buttons directly from the email we sent you.</p>
     <p class="note">Need a hand? Email ${escapeHtml(BRAND.supportEmail)}.</p>`,
  );

const expiredLinkPage = () =>
  page(
    'This survey has closed',
    `<h1>This survey has closed</h1>
     <p>Rating links stay open for 30 days. This one has passed that.</p>
     <p class="note">Still want to share feedback? Email ${escapeHtml(BRAND.supportEmail)} — we'd genuinely like to hear it.</p>`,
  );

const staleFormPage = () =>
  page(
    'Please try that again',
    `<h1>Please try that again</h1>
     <p>This page was open a little too long, so we didn't submit your rating.</p>
     <p class="note">Go back to the email and click your rating again — it only takes a second.</p>`,
  );

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · ${escapeHtml(BRAND.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; margin: 0; padding: 24px;
    background: #f6f7f9; color: #1e2126;
  }
  .card {
    background: #fff; border: 1px solid #e6e8ec; border-radius: 14px;
    box-shadow: 0 6px 28px rgba(20,24,31,.08);
    padding: 40px 36px 32px; max-width: 520px; width: 100%; text-align: center;
  }
  .brand {
    font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
    color: ${BRAND.accent}; margin-bottom: 24px;
  }
  h1 { font-size: 25px; line-height: 1.25; margin: 0 0 8px; color: #1e2126; }
  p { font-size: 16px; line-height: 1.55; color: #565d68; margin: 12px 0; }
  .score {
    display: inline-block; margin: 20px 0 4px;
    font-size: 44px; font-weight: 700; color: ${BRAND.accent};
  }
  .out-of { font-size: 20px; font-weight: 500; color: #98a0ab; }
  .btn {
    appearance: none; border: 0; cursor: pointer;
    display: inline-block; margin-top: 22px; padding: 14px 30px;
    background: ${BRAND.accent}; color: #fff; border-radius: 9px;
    font-size: 16px; font-weight: 600; font-family: inherit;
  }
  .btn:disabled { opacity: .55; cursor: default; }
  .note { font-size: 14px; color: #8b929c; }
  .footer {
    margin-top: 28px; padding-top: 18px; border-top: 1px solid #eef0f3;
    font-size: 13px; color: #98a0ab;
  }
  .footer a { color: #98a0ab; }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">${escapeHtml(BRAND.name)}</div>
    ${body}
    <div class="footer">
      Sent by ${escapeHtml(BRAND.name)} ·
      <a href="${escapeHtml(BRAND.site)}">${escapeHtml(BRAND.site.replace(/^https?:\/\//, ''))}</a>
    </div>
  </main>
</body>
</html>`;
}

function send(res, status, html) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}
