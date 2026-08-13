/**
 * Exercises the deployed request handler in-process.
 *
 * The regression under test: a link scanner used to be able to record a vote by
 * fetching the email link and following the links on the page it returned.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'handler-test-secret';

process.env.NPS_SECRET = SECRET;
process.env.NPS_APPS_SCRIPT_URL = 'https://script.example.test/exec';
process.env.NPS_BRAND_NAME = 'Impressive Electrical';

const { createInviteToken, createSubmitToken, MIN_DWELL_MS } = await import('../api/_lib/token.mjs');
const { default: handler } = await import('../api/redirect.mjs');

const INVITE = createInviteToken(
  { customer: '12345', email: 'bob@example.com', record: 'deal-9' },
  SECRET,
);

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

/** Replaces global fetch and records the calls the handler makes. */
function stubAppsScript(response = { status: 'recorded', score: 9 }) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify(response) };
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const get = async (query) => {
  const res = mockRes();
  await handler({ method: 'GET', query, body: {} }, res);
  return res;
};

const post = async (body) => {
  const res = mockRes();
  await handler({ method: 'POST', query: {}, body }, res);
  return res;
};

/* ------------------------------------------------------------------ GET -- */

test('GET renders a confirmation form and records nothing', async () => {
  const stub = stubAppsScript();
  try {
    const res = await get({ score: '0', t: INVITE });

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /method="POST"/);
    assert.equal(stub.calls.length, 0, 'GET must never call Apps Script');
  } finally {
    stub.restore();
  }
});

test('the confirmation page contains no link that could submit a vote', async () => {
  const res = await get({ score: '0', t: INVITE });

  const hrefs = [...res.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    assert.doesNotMatch(href, /score=/, `crawlable submit link found: ${href}`);
    assert.doesNotMatch(href, /confirm=/, `crawlable confirm link found: ${href}`);
    assert.doesNotMatch(href, /script\.google\.com/, `Apps Script exposed to the browser: ${href}`);
  }
});

test('the submit token is not readable from the form markup', async () => {
  const res = await get({ score: '7', t: INVITE });

  const stField = res.body.match(/id="st"[^>]*value="([^"]*)"/);
  assert.ok(stField, 'expected an st field');
  assert.equal(stField[1], '', 'submit token must be injected by JavaScript, not pre-filled');
});

test('the confirmation page submits in the background', async () => {
  const res = await get({ score: '9', t: INVITE });

  assert.match(res.body, /id="view"/, 'needs a container to swap');
  assert.match(res.body, /addEventListener\('submit'/);
  assert.match(res.body, /fetch\(form\.action/);
  assert.match(res.body, /Saving your rating/, 'should acknowledge before the write confirms');
});

test('the inline script is valid JavaScript', () => {
  // It is built inside a template literal inside a template literal, so a
  // mis-escaped quote would ship a page whose button does nothing.
  return get({ score: '7', t: INVITE }).then((res) => {
    const script = res.body.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(script, 'expected an inline script');
    assert.doesNotThrow(() => new Function(script[1]), 'inline script failed to parse');
  });
});

test('the CSP allows the page to call back to itself', async () => {
  const res = await get({ score: '9', t: INVITE });

  // Without connect-src the background fetch is blocked and the button hangs.
  assert.match(res.headers['content-security-policy'], /connect-src 'self'/);
  assert.match(res.headers['content-security-policy'], /default-src 'none'/);
});

test('GET rejects a score that is not 0-10', async () => {
  for (const score of ['11', '-1', '3.5', 'abc']) {
    const res = await get({ score, t: INVITE });
    assert.equal(res.statusCode, 400, `expected ${score} to be rejected`);
  }
});

test('the reflected XSS payload is rejected and never echoed', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const res = await get({ score: payload, t: INVITE });

  assert.equal(res.statusCode, 400);
  assert.doesNotMatch(res.body, /<img src=x/);
  assert.doesNotMatch(res.body, /onerror/);
});

test('GET rejects a missing or forged invite token', async () => {
  assert.equal((await get({ score: '9' })).statusCode, 400);
  assert.equal((await get({ score: '9', t: 'nonsense' })).statusCode, 400);
  assert.equal(
    (await get({ score: '9', t: createInviteToken({ customer: '1', email: 'a@b.c' }, 'wrong') }))
      .statusCode,
    400,
  );
});

/* ----------------------------------------------------------------- POST -- */

test('POST without a submit token is rejected (JavaScript never ran)', async () => {
  const stub = stubAppsScript();
  try {
    const res = await post({ score: '0', t: INVITE, st: '' });

    assert.equal(res.statusCode, 400);
    assert.equal(stub.calls.length, 0, 'no vote may reach Apps Script');
  } finally {
    stub.restore();
  }
});

test('POST that fires instantly is rejected as automated', async () => {
  const stub = stubAppsScript();
  try {
    const st = createSubmitToken(INVITE, 0, SECRET, Date.now());
    const res = await post({ score: '0', t: INVITE, st });

    assert.equal(res.statusCode, 400);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('a submit token cannot be replayed against a different score', async () => {
  const stub = stubAppsScript();
  try {
    const st = createSubmitToken(INVITE, 9, SECRET, Date.now() - MIN_DWELL_MS - 500);
    const res = await post({ score: '0', t: INVITE, st });

    assert.equal(res.statusCode, 400);
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('a genuine confirmed submission is recorded and signed', async () => {
  const stub = stubAppsScript({ status: 'recorded', score: 9 });
  try {
    const st = createSubmitToken(INVITE, 9, SECRET, Date.now() - MIN_DWELL_MS - 500);
    const res = await post({ score: '9', t: INVITE, st });

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Thank you for your feedback/);
    assert.equal(stub.calls.length, 1);

    const sent = stub.calls[0].body;
    assert.equal(sent.score, 9);
    assert.equal(sent.customer, '12345');
    assert.equal(sent.email, 'bob@example.com');
    assert.equal(sent.record, 'deal-9');
    assert.ok(sent.sig, 'the vote must be signed for Apps Script');
    assert.ok(sent.ts, 'the vote must carry a timestamp');
  } finally {
    stub.restore();
  }
});

test('a revised score tells the customer what changed', async () => {
  const stub = stubAppsScript({ status: 'revised', score: 9, previousScore: 0 });
  try {
    const st = createSubmitToken(INVITE, 9, SECRET, Date.now() - MIN_DWELL_MS - 500);
    const res = await post({ score: '9', t: INVITE, st });

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /updated your earlier response of 0\/10/);
  } finally {
    stub.restore();
  }
});

test('an Apps Script failure surfaces as an error, not a false thank-you', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  try {
    const st = createSubmitToken(INVITE, 9, SECRET, Date.now() - MIN_DWELL_MS - 500);
    const res = await post({ score: '9', t: INVITE, st });

    assert.equal(res.statusCode, 502);
    assert.doesNotMatch(res.body, /Thank you for your feedback/);
  } finally {
    globalThis.fetch = original;
  }
});

test('a background submission gets JSON, not a page', async () => {
  const stub = stubAppsScript({ status: 'recorded', score: 9, category: 'Promoter' });
  try {
    const res = mockRes();
    const st = createSubmitToken(INVITE, 9, SECRET, Date.now() - MIN_DWELL_MS - 500);
    await handler(
      { method: 'POST', query: {}, body: { score: '9', t: INVITE, st, ajax: '1' } },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /application\/json/);

    const payload = JSON.parse(res.body);
    assert.equal(payload.score, 9);
    assert.equal(payload.status, 'recorded');
    assert.ok(payload.closing, 'the page needs a closing line to render');
  } finally {
    stub.restore();
  }
});

test('an Accept header alone is enough to get JSON', async () => {
  const stub = stubAppsScript({ status: 'recorded', score: 5, category: 'Detractor' });
  try {
    const res = mockRes();
    const st = createSubmitToken(INVITE, 5, SECRET, Date.now() - MIN_DWELL_MS - 500);
    await handler(
      {
        method: 'POST',
        query: {},
        headers: { accept: 'application/json' },
        body: { score: '5', t: INVITE, st },
      },
      res,
    );

    assert.match(res.headers['content-type'], /application\/json/);
  } finally {
    stub.restore();
  }
});

test('a rejected background submission gets JSON too, not an HTML page', async () => {
  const res = mockRes();
  await handler(
    { method: 'POST', query: {}, body: { score: '9', t: INVITE, st: '', ajax: '1' } },
    res,
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.ok(JSON.parse(res.body).error, 'the client needs a reason, not markup');
});

test('a revision reports the previous score to the background caller', async () => {
  const stub = stubAppsScript({ status: 'revised', score: 9, category: 'Promoter', previousScore: 0 });
  try {
    const res = mockRes();
    const st = createSubmitToken(INVITE, 9, SECRET, Date.now() - MIN_DWELL_MS - 500);
    await handler(
      { method: 'POST', query: {}, body: { score: '9', t: INVITE, st, ajax: '1' } },
      res,
    );

    assert.equal(JSON.parse(res.body).previousScore, 0);
  } finally {
    stub.restore();
  }
});

test('other HTTP methods are refused', async () => {
  const res = mockRes();
  await handler({ method: 'DELETE', query: {}, body: {} }, res);
  assert.equal(res.statusCode, 405);
});
