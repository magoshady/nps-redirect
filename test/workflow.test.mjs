/**
 * Executes the Code node exactly as it is embedded in n8n-workflow.json, with
 * the n8n globals stubbed, so a broken template or placeholder never ships.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = JSON.parse(readFileSync(new URL('../n8n-workflow.json', import.meta.url), 'utf8'));

const nodeNamed = (name) => workflow.nodes.find((n) => n.name === name);

const TOKEN = 'test-token-abc123';
const RATING_URLS = Object.fromEntries(
  Array.from({ length: 11 }, (_, score) => [
    score,
    `https://nps.impressivebatteries.com.au/r?score=${score}&t=${TOKEN}`,
  ]),
);

const CUSTOMER = {
  customer_id: 'CUST-77',
  customer_email: 'bob@example.com',
  customer_name: 'Bob',
  record_id: 'DEAL-9',
};

/** Runs the Code node body with n8n's globals stubbed out. */
function runCodeNode({ input = { token: TOKEN, ratingUrls: RATING_URLS }, customer = CUSTOMER } = {}) {
  const jsCode = nodeNamed('Prepare NPS Email').parameters.jsCode;
  const $input = { item: { json: input } };
  const $ = (name) => {
    if (name !== 'Customer Data') throw new Error(`Unexpected node reference: ${name}`);
    return { item: { json: customer } };
  };
  return new Function('$input', '$', jsCode)($input, $);
}

test('the workflow has the four nodes wired in order', () => {
  assert.deepEqual(
    workflow.nodes.map((n) => n.name),
    [
      'When clicking Execute workflow',
      'Customer Data',
      'Get NPS Token',
      'Prepare NPS Email',
      'Send Email',
    ],
  );

  assert.equal(
    workflow.connections['Customer Data'].main[0][0].node,
    'Get NPS Token',
  );
  assert.equal(
    workflow.connections['Get NPS Token'].main[0][0].node,
    'Prepare NPS Email',
  );
  assert.equal(
    workflow.connections['Prepare NPS Email'].main[0][0].node,
    'Send Email',
  );
});

test('the token request is a POST authenticated by header credential', () => {
  const http = nodeNamed('Get NPS Token');

  assert.equal(http.parameters.method, 'POST');
  assert.match(http.parameters.url, /\/api\/token$/);
  assert.equal(http.parameters.genericAuthType, 'httpHeaderAuth');
  assert.ok(http.credentials.httpHeaderAuth, 'must reference a Header Auth credential');

  // The secret must never appear anywhere in the workflow file.
  assert.doesNotMatch(JSON.stringify(workflow), /NPS_SECRET/);
  assert.doesNotMatch(JSON.stringify(workflow), /x-api-key["']?\s*:\s*["'][^"']{10,}/);
});

test('sending goes through the Gmail node, which aligns SPF and DKIM', () => {
  const send = nodeNamed('Send Email');

  assert.equal(send.type, 'n8n-nodes-base.gmail');
  assert.equal(send.parameters.emailType, 'html');
  assert.ok(send.credentials.gmailOAuth2, 'must reference a Gmail OAuth credential');
});

test('the Code node runs once per item', () => {
  assert.equal(nodeNamed('Prepare NPS Email').parameters.mode, 'runOnceForEachItem');
});

test('the Code node produces a complete email', () => {
  const { json } = runCodeNode();

  assert.equal(json.to, 'bob@example.com');
  assert.equal(json.from, 'support@impressivebatteries.com.au');
  assert.ok(json.subject);
  assert.ok(json.html.length > 1000, 'html should contain the full template');
  assert.ok(json.text.length > 200, 'a plaintext alternative is required');
});

test('no placeholder survives into the sent email', () => {
  const { json } = runCodeNode();

  for (const field of ['html', 'text']) {
    assert.doesNotMatch(json[field], /\{\{[A-Z_]+\}\}/, `unreplaced placeholder in ${field}`);
    assert.doesNotMatch(json[field], /PASTE THE CONTENTS/, `template was never embedded in ${field}`);
  }
});

test('every rating link points at our own domain and carries the token', () => {
  const { json } = runCodeNode();

  const hrefs = [...json.html.matchAll(/href="(https:\/\/nps\.[^"]*\/r\?[^"]+)"/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 11, 'expected 11 rating links');

  for (let score = 0; score <= 10; score++) {
    const expected = `https://nps.impressivebatteries.com.au/r?score=${score}&t=${TOKEN}`;
    assert.ok(hrefs.includes(expected), `missing or malformed link for score ${score}`);
  }

  // Nothing may point at the old hosts.
  assert.doesNotMatch(json.html, /nps-redirect\.vercel\.app/);
  assert.doesNotMatch(json.html, /script\.google\.com/);
});

test('the plaintext part lists all 11 scores', () => {
  const { json } = runCodeNode();

  for (let score = 0; score <= 10; score++) {
    assert.ok(
      json.text.includes(`https://nps.impressivebatteries.com.au/r?score=${score}&t=${TOKEN}`),
      `plaintext missing score ${score}`,
    );
  }
});

/**
 * The company website customers know is impressiveelectrical.com.au, while
 * mail is sent from impressivebatteries.com.au. A passive footer link to the
 * company site is a deliberate exception; anything the customer is asked to
 * act on must match the sending domain.
 */
const BRAND_SITE_HOST = 'impressiveelectrical.com.au';

test('every actionable link stays on the sending domain', () => {
  const { json } = runCodeNode();

  const sendingDomain = json.from.split('@')[1];
  const urls = [
    ...[...json.html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]),
    ...[...json.text.matchAll(/(https?:\/\/\S+)/g)].map((m) => m[1]),
  ];

  assert.ok(urls.length > 0, 'expected to find links');

  for (const url of urls) {
    const host = new URL(url).hostname;
    if (host === BRAND_SITE_HOST) continue; // passive footer link, see above

    assert.ok(
      host === sendingDomain || host.endsWith(`.${sendingDomain}`),
      `link points off the sending domain (${sendingDomain}): ${url}`,
    );
  }
});

test('the unsubscribe link is on the sending domain, not the brand site', () => {
  const { json } = runCodeNode();

  const sendingDomain = json.from.split('@')[1];
  const unsubscribe = json.headers['List-Unsubscribe'].match(/<(https?:\/\/[^>]+)>/)[1];

  assert.ok(
    new URL(unsubscribe).hostname.endsWith(sendingDomain),
    `unsubscribe must stay on ${sendingDomain}, got ${unsubscribe}`,
  );
  assert.match(json.html, /href="https:\/\/nps\.impressivebatteries\.com\.au\/unsubscribe/);
});

test('the brand site appears exactly once, as a passive footer link', () => {
  const { json } = runCodeNode();

  const hrefs = [...json.html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  const brandLinks = hrefs.filter((url) => new URL(url).hostname === BRAND_SITE_HOST);

  assert.equal(brandLinks.length, 1, 'the brand site should only be the footer link');
  assert.equal(brandLinks[0], `https://${BRAND_SITE_HOST}`, 'it should be a bare site link');
});

test('the brand name may differ from the sending domain', () => {
  const { json } = runCodeNode();

  // Deliberate: customers recognise "Impressive Electrical", and display names
  // carry no weight in SPF, DKIM or DMARC.
  assert.equal(json.fromName, 'Impressive Electrical');
  assert.match(json.from, /@impressivebatteries\.com\.au$/);
});

test('the customer email address never appears in a rating URL', () => {
  const { json } = runCodeNode();

  const urls = [...json.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const url of urls) {
    assert.ok(!url.includes('bob@example.com'), `email leaked into URL: ${url}`);
    assert.ok(!url.includes('bob%40example.com'), `email leaked into URL: ${url}`);
  }
});

test('a customer name containing markup is escaped', () => {
  const { json } = runCodeNode({
    customer: { ...CUSTOMER, customer_name: '<script>alert(1)</script>' },
  });

  assert.doesNotMatch(json.html, /<script>alert\(1\)<\/script>/);
  assert.match(json.html, /&lt;script&gt;/);
});

test('List-Unsubscribe headers are emitted', () => {
  const { json } = runCodeNode();

  assert.match(json.headers['List-Unsubscribe'], /^<https:\/\/nps\.impressivebatteries\.com\.au/);
  assert.equal(json.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

test('a missing token fails loudly rather than sending a broken email', () => {
  assert.throws(() => runCodeNode({ input: {} }), /No token in the input/);
});

test('a missing customer email fails loudly', () => {
  assert.throws(
    () => runCodeNode({ customer: { ...CUSTOMER, customer_email: '' } }),
    /No customer_email/,
  );
});
