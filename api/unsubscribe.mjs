/**
 * Opt out of feedback requests.
 *
 * GET  - renders a confirmation page. Records nothing.
 * POST - verifies the JS-injected action token, records the opt-out in the
 *        sheet, and notifies n8n so the contact can be suppressed at source.
 *
 * The GET/POST split matters more here than anywhere else. An unsubscribe link
 * is a state change sitting in an inbox, and mail security scanners click every
 * link they find — without this, Safe Links would quietly opt out customers who
 * never asked to leave.
 */

import {
  createActionToken,
  escapeHtml,
  signRequest,
  verifyActionToken,
  verifyInviteToken,
} from './_lib/token.mjs';

const BRAND = {
  name: process.env.NPS_BRAND_NAME || 'Impressive Electrical',
  site: process.env.NPS_BRAND_URL || 'https://impressiveelectrical.com.au',
  supportEmail: process.env.NPS_SUPPORT_EMAIL || 'support@impressivebatteries.com.au',
  accent: '#e0001a',
};

const SECRET = process.env.NPS_SECRET;
const APPS_SCRIPT_URL = process.env.NPS_APPS_SCRIPT_URL;
const N8N_WEBHOOK_URL = process.env.NPS_N8N_WEBHOOK_URL;

const APPS_SCRIPT_TIMEOUT_MS = 12_000;
const WEBHOOK_TIMEOUT_MS = 2_500;

export const config = { maxDuration: 20 };

async function postJson(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
      + "connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );

  if (!SECRET || !APPS_SCRIPT_URL) {
    console.error('Missing NPS_SECRET or NPS_APPS_SCRIPT_URL environment variable');
    return sendHtml(res, 500, page('Something went wrong', '<p>Please try again shortly.</p>'));
  }

  if (req.method === 'GET' || req.method === 'HEAD') return renderConfirmation(req, res);
  if (req.method === 'POST') return recordOptOut(req, res);

  res.setHeader('Allow', 'GET, POST');
  return sendHtml(res, 405, page('Not allowed', '<p>That request is not supported.</p>'));
}

/* ---------------------------------------------------------------- GET ---- */

function renderConfirmation(req, res) {
  const inviteToken = typeof req.query.t === 'string' ? req.query.t : '';
  const invite = verifyInviteToken(inviteToken, SECRET);

  // An expired invite still gets to unsubscribe. Refusing to honour an opt-out
  // because the link is old would be the wrong way round.
  if (!invite.ok && invite.reason !== 'expired') {
    return sendHtml(res, 400, invalidLinkPage());
  }

  const actionToken = createActionToken(inviteToken, 'unsubscribe', SECRET);

  const body = `
      <h1>Stop feedback requests?</h1>
      <p>We'll stop emailing ${escapeHtml(invite.email || 'you')} to ask about your installations.</p>
      <p class="note">This won't affect anything else — quotes, invoices and job updates carry on as normal.</p>
      <form method="POST" action="/unsubscribe" id="nps-form">
        <input type="hidden" name="t" value="${escapeHtml(inviteToken)}">
        <input type="hidden" name="at" id="at" value="">
        <button type="submit" class="btn" id="nps-submit" disabled>Yes, unsubscribe me</button>
      </form>
      <p class="note">Changed your mind? Just close this page.</p>
      <noscript>
        <p class="note">
          Your browser has JavaScript turned off. Please email
          ${escapeHtml(BRAND.supportEmail)} and we'll unsubscribe you.
        </p>
      </noscript>`;

  return sendHtml(res, 200, page('Unsubscribe', body, clientScript(actionToken)));
}

function clientScript(actionToken) {
  return `
      (function () {
        var form = document.getElementById('nps-form');
        var button = document.getElementById('nps-submit');
        var view = document.getElementById('view');

        document.getElementById('at').value = atob('${Buffer.from(actionToken).toString('base64')}');
        button.disabled = false;

        if (!window.fetch || !window.FormData || !window.URLSearchParams) return;

        form.addEventListener('submit', function (event) {
          event.preventDefault();
          button.disabled = true;
          view.innerHTML = '<h1>Unsubscribing\\u2026</h1><p class="note">One moment.</p>';

          var data = new URLSearchParams(new FormData(form));
          data.append('ajax', '1');

          fetch(form.action, {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: data
          })
            .then(function (response) { return response.ok; })
            .then(function (ok) {
              if (!ok) throw new Error('failed');
              view.innerHTML =
                '<h1>You\\'re unsubscribed</h1>' +
                '<p>We won\\'t send you any more feedback requests.</p>' +
                '<p class="note">Changed your mind later? Email ${escapeHtml(BRAND.supportEmail)}.</p>';
            })
            .catch(function () {
              view.innerHTML =
                '<h1>We could not do that</h1>' +
                '<p>Something went wrong unsubscribing you.</p>' +
                '<p class="note">Email ${escapeHtml(BRAND.supportEmail)} and we will take care of it.</p>';
            });
        });
      })();`;
}

/* --------------------------------------------------------------- POST ---- */

async function recordOptOut(req, res) {
  const form = req.body && typeof req.body === 'object' ? req.body : {};
  const wantsJson =
    form.ajax === '1' || String(req.headers?.accept || '').includes('application/json');

  const inviteToken = typeof form.t === 'string' ? form.t : '';
  const actionToken = typeof form.at === 'string' ? form.at : '';

  const invite = verifyInviteToken(inviteToken, SECRET);
  if (!invite.ok && invite.reason !== 'expired') {
    return fail(res, wantsJson, 400, 'invalid', invalidLinkPage());
  }

  const action = verifyActionToken(actionToken, inviteToken, 'unsubscribe', SECRET);
  if (!action.ok) {
    console.warn('Rejected unsubscribe', { reason: action.reason, customer: invite.customer });
    return fail(res, wantsJson, 400, action.reason, staleFormPage());
  }

  const ts = Date.now();
  const optOut = {
    action: 'unsubscribe',
    customer: invite.customer,
    email: invite.email,
    record: invite.record,
    ts,
  };

  try {
    const response = await postJson(
      APPS_SCRIPT_URL,
      {
        ...optOut,
        sig: signRequest(['unsubscribe', optOut.customer, optOut.email, optOut.record || '', ts], SECRET),
      },
      APPS_SCRIPT_TIMEOUT_MS,
    );
    const text = await response.text();
    const result = JSON.parse(text);

    if (!response.ok || result.status === 'error') {
      console.error('Apps Script rejected the opt-out', response.status, result);
      throw new Error('rejected');
    }
  } catch (error) {
    // Same reasoning as votes: Apps Script writes before it replies, so a
    // timeout means the opt-out almost certainly landed. Telling someone their
    // unsubscribe failed when it did not is the worst outcome here.
    if (error.name !== 'AbortError') {
      console.error('Failed to record opt-out', error);
      return fail(
        res,
        wantsJson,
        502,
        'save_failed',
        page(
          'We could not do that',
          `<p>Something went wrong unsubscribing you.</p>
           <p class="note">Email ${escapeHtml(BRAND.supportEmail)} and we'll take care of it.</p>`,
        ),
      );
    }
    console.error('Apps Script timed out; the opt-out was most likely recorded', {
      customer: invite.customer,
    });
  }

  await notifyN8n(optOut);

  if (wantsJson) return sendJson(res, 200, { status: 'unsubscribed' });
  return sendHtml(res, 200, donePage());
}

/**
 * Tells n8n so the contact can be suppressed where the customer list actually
 * lives. The sheet row is the audit trail; HubSpot is what stops the next send.
 */
async function notifyN8n(optOut) {
  if (!N8N_WEBHOOK_URL) {
    console.warn('NPS_N8N_WEBHOOK_URL is not set — the opt-out will not reach HubSpot');
    return;
  }

  try {
    const response = await postJson(
      N8N_WEBHOOK_URL,
      {
        type: 'unsubscribe',
        'Contact ID': optOut.customer,
        email: optOut.email,
        recordId: optOut.record,
        timestamp: new Date(optOut.ts).toISOString(),
      },
      WEBHOOK_TIMEOUT_MS,
    );
    console.log(`n8n unsubscribe webhook replied ${response.status}`);
  } catch (error) {
    console.warn(`n8n unsubscribe webhook failed (${error.name}); the opt-out is recorded regardless`);
  }
}

/* --------------------------------------------------------------- pages --- */

const donePage = () =>
  page(
    'Unsubscribed',
    `<h1>You're unsubscribed</h1>
     <p>We won't send you any more feedback requests.</p>
     <p class="note">Changed your mind later? Email ${escapeHtml(BRAND.supportEmail)}.</p>`,
  );

const invalidLinkPage = () =>
  page(
    'That link looks incomplete',
    `<h1>That link looks incomplete</h1>
     <p>Please use the unsubscribe link from the bottom of our email.</p>
     <p class="note">Or email ${escapeHtml(BRAND.supportEmail)} and we'll do it for you.</p>`,
  );

const staleFormPage = () =>
  page(
    'Please try that again',
    `<h1>Please try that again</h1>
     <p>This page was open a little too long, so we didn't unsubscribe you.</p>
     <p class="note">Open the unsubscribe link again, or email ${escapeHtml(BRAND.supportEmail)}.</p>`,
  );

function page(title, body, script = '') {
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
    <div id="view">${body}</div>
    <div class="footer">
      ${escapeHtml(BRAND.name)} ·
      <a href="${escapeHtml(BRAND.site)}">${escapeHtml(BRAND.site.replace(/^https?:\/\//, ''))}</a>
    </div>
  </main>
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

function fail(res, wantsJson, status, reason, html) {
  if (wantsJson) return sendJson(res, status, { error: reason });
  return sendHtml(res, status, html);
}

function sendHtml(res, status, html) {
  res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}

function sendJson(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(JSON.stringify(payload));
}
