/**
 * The survey site refuses to mint a rating link for a contact who has opted
 * out. This is the backstop — the real suppression happens in HubSpot off the
 * unsubscribe webhook — so it must fail open rather than stop every survey.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'suppression-test-secret';
const API_KEY = 'suppression-test-api-key';
const APPS_SCRIPT_URL = 'https://script.example.test/exec';

process.env.NPS_SECRET = SECRET;
process.env.NPS_API_KEY = API_KEY;
process.env.NPS_APPS_SCRIPT_URL = APPS_SCRIPT_URL;
process.env.NPS_PUBLIC_URL = 'https://nps.example.test';

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

/** A query string gives each test a module with an empty suppression cache. */
const freshHandler = async (tag) => (await import(`../api/token.mjs?cache=${tag}`)).default;

function stubSuppressions(behaviour) {
  const calls = [];
  const original = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (behaviour instanceof Error) throw behaviour;
    return { ok: true, status: 200, text: async () => behaviour };
  };

  return { calls, restore: () => { globalThis.fetch = original; } };
}

const mint = async (handler, email) => {
  const res = mockRes();
  await handler(
    {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
      body: { customer: '1', email },
    },
    res,
  );
  return res;
};

const LIST = JSON.stringify({ status: 'ok', emails: ['blocked@example.com'] });

test('an unsubscribed contact gets no survey link', async () => {
  const handler = await freshHandler('blocked');
  const stub = stubSuppressions(LIST);
  try {
    const res = await mint(handler, 'blocked@example.com');

    assert.equal(res.statusCode, 409);
    assert.equal(JSON.parse(res.body).error, 'unsubscribed');
    assert.ok(!res.body.includes('token'), 'no token may be issued');
  } finally {
    stub.restore();
  }
});

test('the suppression request is signed', async () => {
  const handler = await freshHandler('signed');
  const stub = stubSuppressions(LIST);
  try {
    await mint(handler, 'someone@example.com');

    assert.equal(stub.calls[0].action, 'suppressions');
    assert.ok(stub.calls[0].sig, 'Apps Script must be able to verify the caller');
    assert.ok(stub.calls[0].ts);
  } finally {
    stub.restore();
  }
});

test('matching ignores case', async () => {
  const handler = await freshHandler('case');
  const stub = stubSuppressions(LIST);
  try {
    assert.equal((await mint(handler, 'BLOCKED@Example.COM')).statusCode, 409);
  } finally {
    stub.restore();
  }
});

test('everyone else still gets a token', async () => {
  const handler = await freshHandler('allowed');
  const stub = stubSuppressions(LIST);
  try {
    const res = await mint(handler, 'fine@example.com');

    assert.equal(res.statusCode, 200);
    assert.ok(JSON.parse(res.body).token);
  } finally {
    stub.restore();
  }
});

test('the list is fetched once per batch, not once per customer', async () => {
  const handler = await freshHandler('cache');
  const stub = stubSuppressions(LIST);
  try {
    await mint(handler, 'one@example.com');
    await mint(handler, 'two@example.com');
    await mint(handler, 'three@example.com');

    assert.equal(stub.calls.length, 1, 'a batch send must not pay for one lookup per contact');
  } finally {
    stub.restore();
  }
});

test('an unreachable list mints the token anyway', async () => {
  // Failing closed would let a broken lookup silently stop every survey.
  const handler = await freshHandler('failopen');
  const stub = stubSuppressions(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  try {
    const res = await mint(handler, 'someone@example.com');

    assert.equal(res.statusCode, 200);
    assert.ok(JSON.parse(res.body).token);
  } finally {
    stub.restore();
  }
});

test('a rejected list request mints the token anyway', async () => {
  const handler = await freshHandler('rejected');
  const stub = stubSuppressions(JSON.stringify({ status: 'error', reason: 'bad_signature' }));
  try {
    assert.equal((await mint(handler, 'someone@example.com')).statusCode, 200);
  } finally {
    stub.restore();
  }
});
