#!/usr/bin/env node
/**
 * Post-deploy check: replays the behaviour that was recording phantom zeros.
 *
 *   NPS_URL=https://nps.impressivebatteries.com.au \
 *   NPS_SECRET=<the secret> \
 *   node test/scanner-probe.mjs
 *
 * Add --write to also run the happy path, which records one real row for the
 * probe customer. Without it, nothing is written to the sheet.
 */

import { createInviteToken, createSubmitToken, MIN_DWELL_MS } from '../api/_lib/token.mjs';

const BASE = (process.env.NPS_URL || '').replace(/\/$/, '');
const SECRET = process.env.NPS_SECRET;
const WRITE = process.argv.includes('--write');

if (!BASE || !SECRET) {
  console.error('Set NPS_URL and NPS_SECRET.');
  process.exit(2);
}

const PROBE = {
  customer: 'PROBE-' + Date.now(),
  email: `probe+${Date.now()}@example.com`,
  record: 'PROBE-' + Date.now(),
};

// A user agent in the style of the mail-security crawlers that caused this.
const SCANNER_UA =
  'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0; BOIE9;ENUS)';

let failures = 0;

function check(name, passed, detail = '') {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures++;
}

const inviteToken = createInviteToken(PROBE, SECRET);
const confirmUrl = `${BASE}/r?score=0&t=${encodeURIComponent(inviteToken)}`;

const postForm = (fields) =>
  fetch(`${BASE}/r`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': SCANNER_UA },
    body: new URLSearchParams(fields).toString(),
    redirect: 'follow',
  });

console.log(`Probing ${BASE}\n`);

// 1. The scanner fetches the score=0 link from the email.
const page = await fetch(confirmUrl, { headers: { 'User-Agent': SCANNER_UA } });
const html = await page.text();

check('confirmation page loads', page.status === 200, `status ${page.status}`);
check('confirmation page did not record a vote', !/Thank you for your feedback/i.test(html));

// 2. The scanner follows every link on that page, which is how the old
//    confirmation step was defeated.
const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const submitLinks = hrefs.filter((href) => /score=|confirm=|script\.google\.com/.test(href));
check(
  'no crawlable link can submit a vote',
  submitLinks.length === 0,
  submitLinks.length ? submitLinks.join(', ') : 'none found',
);

for (const href of hrefs) {
  const target = href.startsWith('http') ? href : `${BASE}${href}`;
  if (!target.startsWith(BASE)) continue;
  const followed = await fetch(target, { headers: { 'User-Agent': SCANNER_UA } });
  const followedHtml = await followed.text();
  check(
    `following ${href} records nothing`,
    !/Thank you for your feedback/i.test(followedHtml),
  );
}

// 3. The submit token must be absent from the raw HTML form value, otherwise a
//    crawler could post the form as parsed.
const stField = html.match(/id="st"[^>]*value="([^"]*)"/) || html.match(/name="st"[^>]*value="([^"]*)"/);
check('submit token is not pre-filled in the HTML', !!stField && stField[1] === '');

// 4. A form POST with no submit token (JavaScript never ran).
const noToken = await postForm({ score: '0', t: inviteToken, st: '' });
check('POST without a submit token is rejected', noToken.status === 400, `status ${noToken.status}`);

// 5. A form POST that fires the instant the page is parsed.
const instantToken = createSubmitToken(inviteToken, 0, SECRET, Date.now());
const instant = await postForm({ score: '0', t: inviteToken, st: instantToken });
check('instant POST is rejected as too fast', instant.status === 400, `status ${instant.status}`);

// 6. A forged token signed with the wrong secret.
const forged = createInviteToken(PROBE, 'wrong-secret');
const forgedResponse = await postForm({
  score: '0',
  t: forged,
  st: createSubmitToken(forged, 0, 'wrong-secret', Date.now() - MIN_DWELL_MS - 500),
});
check('forged token is rejected', forgedResponse.status === 400, `status ${forgedResponse.status}`);

// 7. A real person: reads the page, then clicks.
if (WRITE) {
  const genuine = createSubmitToken(inviteToken, 9, SECRET, Date.now() - MIN_DWELL_MS - 800);
  const submitted = await postForm({ score: '9', t: inviteToken, st: genuine });
  const submittedHtml = await submitted.text();
  check(
    'a genuine confirmed submission is recorded',
    submitted.status === 200 && /Thank you for your feedback/i.test(submittedHtml),
    `status ${submitted.status}`,
  );
  console.log(`\nWrote one probe row: customer ${PROBE.customer} — delete it from the sheet.`);
} else {
  console.log('\nSkipped the write test. Re-run with --write to verify the happy path.');
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
