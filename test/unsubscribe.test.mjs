/**
 * An unsubscribe link is a state change sitting in an inbox, so it needs the
 * same protection the rating links needed — otherwise a mail scanner clicking
 * every link would opt out customers who never asked to leave.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'unsubscribe-test-secret';
const APPS_SCRIPT_URL = 'https://script.example.test/exec';
const N8N_URL = 'https://n8n.example.test/webhook/abc';

process.env.NPS_SECRET = SECRET;
process.env.NPS_APPS_SCRIPT_URL = APPS_SCRIPT_URL;
process.env.NPS_N8N_WEBHOOK_URL = N8N_URL;

const { createInviteToken, createActionToken, MIN_DWELL_MS, INVITE_TTL_MS } = await import(
  '../api/_lib/token.mjs'
);
const { default: handler } = await import('../api/unsubscribe.mjs');

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

function stubFetch({ appsScript = { status: 200, body: '{"status":"unsubscribed"}' }, n8n = { status: 200, body: '{}' } } = {}) {
  const calls = { appsScript: [], n8n: [] };
  const original = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const target = url.startsWith(N8N_URL) ? 'n8n' : 'appsScript';
    calls[target].push(JSON.parse(options.body));
    const behaviour = target === 'n8n' ? n8n : appsScript;

    if (behaviour instanceof Error) throw behaviour;
    return { ok: behaviour.status < 400, status: behaviour.status, text: async () => behaviour.body };
  };

  return { calls, restore: () => { globalThis.fetch = original; } };
}

const get = async (query = { t: INVITE }) => {
  const res = mockRes();
  await handler({ method: 'GET', query, body: {} }, res);
  return res;
};

const post = async (body) => {
  const res = mockRes();
  await handler({ method: 'POST', query: {}, body }, res);
  return res;
};

const validAction = (invite = INVITE) =>
  createActionToken(invite, 'unsubscribe', SECRET, Date.now() - MIN_DWELL_MS - 500);

/* ------------------------------------------------------------------ GET -- */

test('GET asks for confirmation and unsubscribes nobody', async () => {
  const stub = stubFetch();
  try {
    const res = await get();

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /Stop feedback requests\?/);
    assert.match(res.body, /method="POST"/);
    assert.equal(stub.calls.appsScript.length, 0, 'GET must never record an opt-out');
  } finally {
    stub.restore();
  }
});

test('the page shows whose address it is about', async () => {
  const res = await get();
  assert.match(res.body, /bob@example\.com/);
});

test('no crawlable link on the page can unsubscribe anyone', async () => {
  const res = await get();

  const hrefs = [...res.body.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    assert.doesNotMatch(href, /unsubscribe\?/, `crawlable unsubscribe link: ${href}`);
    assert.doesNotMatch(href, /\bt=/, `crawlable token link: ${href}`);
  }
});

test('the action token is not pre-filled in the markup', async () => {
  const res = await get();
  const field = res.body.match(/id="at"[^>]*value="([^"]*)"/);

  assert.ok(field, 'expected an action-token field');
  assert.equal(field[1], '', 'must be injected by JavaScript, not shipped in the HTML');
});

test('the inline script is valid JavaScript', async () => {
  const res = await get();
  const script = res.body.match(/<script>([\s\S]*?)<\/script>/);

  assert.ok(script);
  assert.doesNotThrow(() => new Function(script[1]));
});

test('an expired invite can still unsubscribe', async () => {
  // Refusing to stop emailing someone because their link is old would be the
  // wrong way round, and would not satisfy the obligation.
  const old = createInviteToken(
    { customer: '1', email: 'old@example.com' },
    SECRET,
    Date.now() - INVITE_TTL_MS - 60_000,
  );

  const res = await get({ t: old });
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Stop feedback requests\?/);
});

test('a forged token is refused', async () => {
  const forged = createInviteToken({ customer: '1', email: 'a@b.co' }, 'wrong-secret');

  assert.equal((await get({ t: forged })).statusCode, 400);
  assert.equal((await get({ t: 'nonsense' })).statusCode, 400);
  assert.equal((await get({})).statusCode, 400);
});

/* ----------------------------------------------------------------- POST -- */

test('POST without an action token is rejected', async () => {
  const stub = stubFetch();
  try {
    const res = await post({ t: INVITE, at: '' });

    assert.equal(res.statusCode, 400);
    assert.equal(stub.calls.appsScript.length, 0);
  } finally {
    stub.restore();
  }
});

test('POST that fires instantly is rejected as automated', async () => {
  const stub = stubFetch();
  try {
    const at = createActionToken(INVITE, 'unsubscribe', SECRET, Date.now());
    const res = await post({ t: INVITE, at });

    assert.equal(res.statusCode, 400);
    assert.equal(stub.calls.appsScript.length, 0);
  } finally {
    stub.restore();
  }
});

test('a vote submit token cannot be replayed as an unsubscribe', async () => {
  const { createSubmitToken } = await import('../api/_lib/token.mjs');
  const stub = stubFetch();
  try {
    const voteToken = createSubmitToken(INVITE, 9, SECRET, Date.now() - MIN_DWELL_MS - 500);
    const res = await post({ t: INVITE, at: voteToken });

    assert.equal(res.statusCode, 400);
    assert.equal(stub.calls.appsScript.length, 0);
  } finally {
    stub.restore();
  }
});

test('a confirmed opt-out is recorded and signed', async () => {
  const stub = stubFetch();
  try {
    const res = await post({ t: INVITE, at: validAction() });

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /You're unsubscribed/);
    assert.equal(stub.calls.appsScript.length, 1);

    const sent = stub.calls.appsScript[0];
    assert.equal(sent.action, 'unsubscribe');
    assert.equal(sent.email, 'bob@example.com');
    assert.equal(sent.customer, '12345');
    assert.ok(sent.sig, 'the opt-out must be signed');
  } finally {
    stub.restore();
  }
});

test('n8n is told, so the contact can be suppressed at source', async () => {
  const stub = stubFetch();
  try {
    await post({ t: INVITE, at: validAction() });

    assert.equal(stub.calls.n8n.length, 1);
    assert.equal(stub.calls.n8n[0].type, 'unsubscribe');
    assert.equal(stub.calls.n8n[0].email, 'bob@example.com');
    assert.equal(stub.calls.n8n[0]['Contact ID'], '12345');
  } finally {
    stub.restore();
  }
});

test('a timeout does not tell someone their opt-out failed', async () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const stub = stubFetch({ appsScript: abort });
  try {
    const res = await post({ t: INVITE, at: validAction() });

    assert.equal(res.statusCode, 200);
    assert.match(res.body, /You're unsubscribed/);
  } finally {
    stub.restore();
  }
});

test('an outright rejection is reported honestly', async () => {
  const stub = stubFetch({ appsScript: { status: 200, body: '{"status":"error","reason":"bad_signature"}' } });
  try {
    const res = await post({ t: INVITE, at: validAction() });

    assert.equal(res.statusCode, 502);
    assert.doesNotMatch(res.body, /You're unsubscribed/);
  } finally {
    stub.restore();
  }
});

test('a failing n8n webhook does not undo a recorded opt-out', async () => {
  const stub = stubFetch({ n8n: { status: 500, body: 'boom' } });
  try {
    const res = await post({ t: INVITE, at: validAction() });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /You're unsubscribed/);
  } finally {
    stub.restore();
  }
});

test('the background caller gets JSON', async () => {
  const stub = stubFetch();
  try {
    const res = await post({ t: INVITE, at: validAction(), ajax: '1' });

    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(JSON.parse(res.body).status, 'unsubscribed');
  } finally {
    stub.restore();
  }
});
