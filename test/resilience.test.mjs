/**
 * Regression tests for the failure that showed a customer "We could not save
 * that" after their rating had already been written to the sheet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'resilience-test-secret';
const APPS_SCRIPT_URL = 'https://script.example.test/exec';
const N8N_URL = 'https://n8n.example.test/webhook/abc';

process.env.NPS_SECRET = SECRET;
process.env.NPS_APPS_SCRIPT_URL = APPS_SCRIPT_URL;
process.env.NPS_N8N_WEBHOOK_URL = N8N_URL;

const { createInviteToken, createSubmitToken, MIN_DWELL_MS } = await import('../api/_lib/token.mjs');
const { default: handler } = await import('../api/redirect.mjs');

const INVITE = createInviteToken(
  { customer: '12345', email: 'bob@example.com', record: 'deal-9' },
  SECRET,
);

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
  };
}

const submit = async (score = 9) => {
  const res = mockRes();
  const st = createSubmitToken(INVITE, score, SECRET, Date.now() - MIN_DWELL_MS - 500);
  await handler({ method: 'POST', query: {}, body: { score: String(score), t: INVITE, st } }, res);
  return res;
};

/** Routes stubbed fetch by URL so we can drive each hop independently. */
function stubFetch({ appsScript, n8n }) {
  const calls = { appsScript: [], n8n: [] };
  const original = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const target = url.startsWith(N8N_URL) ? 'n8n' : 'appsScript';
    calls[target].push(JSON.parse(options.body));
    const behaviour = target === 'n8n' ? n8n : appsScript;

    if (behaviour instanceof Error) throw behaviour;
    return {
      ok: behaviour.status < 400,
      status: behaviour.status,
      text: async () => behaviour.body,
    };
  };

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const OK = { status: 200, body: JSON.stringify({ status: 'recorded', score: 9, category: 'Promoter' }) };
const N8N_OK = { status: 200, body: '{}' };

const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

test('a timeout on the sheet write does not tell the customer it failed', async () => {
  // Apps Script appends the row before it replies. When the reply is late the
  // vote is already saved, so an error page would send the customer back to
  // re-submit a rating we already hold.
  const stub = stubFetch({ appsScript: abortError(), n8n: N8N_OK });
  try {
    const res = await submit(9);

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Thank you for your feedback/);
    assert.doesNotMatch(res.body, /could not save/i);
  } finally {
    stub.restore();
  }
});

test('an outright rejection still shows an error', async () => {
  const stub = stubFetch({
    appsScript: { status: 200, body: JSON.stringify({ status: 'error', reason: 'bad_signature' }) },
    n8n: N8N_OK,
  });
  try {
    const res = await submit(9);

    assert.equal(res.statusCode, 502);
    assert.match(res.body, /could not save/i);
    assert.doesNotMatch(res.body, /Thank you for your feedback/);
  } finally {
    stub.restore();
  }
});

test('a non-JSON reply shows an error rather than a false thank-you', async () => {
  const stub = stubFetch({ appsScript: { status: 200, body: '<html>Sign in</html>' }, n8n: N8N_OK });
  try {
    const res = await submit(9);

    assert.equal(res.statusCode, 502);
    assert.doesNotMatch(res.body, /Thank you for your feedback/);
  } finally {
    stub.restore();
  }
});

test('the n8n webhook fires after the write, with the payload it expects', async () => {
  const stub = stubFetch({ appsScript: OK, n8n: N8N_OK });
  try {
    const res = await submit(9);

    assert.equal(res.statusCode, 200);
    assert.equal(stub.calls.n8n.length, 1);

    const payload = stub.calls.n8n[0];
    assert.equal(payload['Contact ID'], '12345');
    assert.equal(payload.score, 9);
    assert.equal(payload.email, 'bob@example.com');
    assert.equal(payload.recordId, 'deal-9');
    assert.equal(payload.category, 'Promoter');
    assert.equal(payload.status, 'recorded');
    assert.ok(payload.timestamp);
  } finally {
    stub.restore();
  }
});

test('a slow webhook never turns a saved vote into an error page', async () => {
  // This is the shape of the original bug: the webhook held the request open
  // long enough for the caller to give up. It must not be able to do that now.
  const stub = stubFetch({ appsScript: OK, n8n: abortError() });
  try {
    const res = await submit(9);

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Thank you for your feedback/);
  } finally {
    stub.restore();
  }
});

test('a failing webhook never turns a saved vote into an error page', async () => {
  const stub = stubFetch({ appsScript: OK, n8n: { status: 500, body: 'boom' } });
  try {
    const res = await submit(9);

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Thank you for your feedback/);
  } finally {
    stub.restore();
  }
});

test('the webhook is not called when the write was rejected', async () => {
  const stub = stubFetch({
    appsScript: { status: 200, body: JSON.stringify({ status: 'error', reason: 'stale' }) },
    n8n: N8N_OK,
  });
  try {
    await submit(9);
    assert.equal(stub.calls.n8n.length, 0, 'no vote, no notification');
  } finally {
    stub.restore();
  }
});

test('a revised score reaches the webhook with the previous value', async () => {
  const stub = stubFetch({
    appsScript: {
      status: 200,
      body: JSON.stringify({
        status: 'revised',
        score: 9,
        category: 'Promoter',
        previousScore: 0,
        revisions: 1,
      }),
    },
    n8n: N8N_OK,
  });
  try {
    const res = await submit(9);

    assert.match(res.body, /updated your earlier response of 0\/10/);
    assert.equal(stub.calls.n8n[0].status, 'revised');
    assert.equal(stub.calls.n8n[0].previousScore, 0);
  } finally {
    stub.restore();
  }
});
