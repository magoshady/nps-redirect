/**
 * The token-minting endpoint n8n calls, so the signing secret never has to
 * live in the n8n environment.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'endpoint-test-secret';
const API_KEY = 'endpoint-test-api-key';

process.env.NPS_SECRET = SECRET;
process.env.NPS_API_KEY = API_KEY;
process.env.NPS_PUBLIC_URL = 'https://nps.example.test';

const { verifyInviteToken, timingSafeCompare } = await import('../api/_lib/token.mjs');
const { default: handler } = await import('../api/token.mjs');

function mockRes() {
  return {
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
    get json() {
      return JSON.parse(this.body);
    },
  };
}

const call = async ({ method = 'POST', apiKey = API_KEY, body = {} } = {}) => {
  const res = mockRes();
  const headers = apiKey === null ? {} : { 'x-api-key': apiKey };
  await handler({ method, headers, body }, res);
  return res;
};

const VALID = { customer: '12345', email: 'bob@example.com', record: 'deal-9' };

test('mints a token that verifies against the same secret', async () => {
  const res = await call({ body: VALID });

  assert.equal(res.statusCode, 200);

  const verified = verifyInviteToken(res.json.token, SECRET);
  assert.equal(verified.ok, true);
  assert.equal(verified.customer, '12345');
  assert.equal(verified.email, 'bob@example.com');
  assert.equal(verified.record, 'deal-9');
});

test('returns ready-made rating URLs for all 11 scores', async () => {
  const res = await call({ body: VALID });
  const { ratingUrls, token } = res.json;

  assert.equal(Object.keys(ratingUrls).length, 11);
  for (let score = 0; score <= 10; score++) {
    assert.equal(
      ratingUrls[score],
      `https://nps.example.test/r?score=${score}&t=${encodeURIComponent(token)}`,
    );
  }
});

test('the response never leaks the signing secret', async () => {
  const res = await call({ body: VALID });
  assert.ok(!res.body.includes(SECRET));
  assert.ok(!res.body.includes(API_KEY));
});

test('the customer email is not readable from the token', async () => {
  const res = await call({ body: VALID });
  assert.ok(!res.json.token.includes('bob@example.com'));
});

test('rejects a missing, wrong or empty API key', async () => {
  assert.equal((await call({ apiKey: null, body: VALID })).statusCode, 401);
  assert.equal((await call({ apiKey: '', body: VALID })).statusCode, 401);
  assert.equal((await call({ apiKey: 'wrong-key', body: VALID })).statusCode, 401);
  assert.equal((await call({ apiKey: API_KEY + 'x', body: VALID })).statusCode, 401);
});

test('rejects any method other than POST', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    assert.equal((await call({ method, body: VALID })).statusCode, 405);
  }
});

test('requires a customer and a valid email', async () => {
  assert.equal((await call({ body: {} })).statusCode, 400);
  assert.equal((await call({ body: { customer: '1' } })).statusCode, 400);
  assert.equal((await call({ body: { email: 'a@b.co' } })).statusCode, 400);
  assert.equal((await call({ body: { customer: '1', email: 'not-an-email' } })).statusCode, 400);
  assert.equal((await call({ body: { customer: '  ', email: 'a@b.co' } })).statusCode, 400);
});

test('record is optional', async () => {
  const res = await call({ body: { customer: '1', email: 'a@b.co' } });
  assert.equal(res.statusCode, 200);
  assert.equal(verifyInviteToken(res.json.token, SECRET).record, '');
});

test('expiry is reported 30 days out', async () => {
  const res = await call({ body: VALID });
  const days = (new Date(res.json.expiresAt) - new Date(res.json.issuedAt)) / 86_400_000;
  assert.equal(Math.round(days), 30);
});

test('timingSafeCompare handles unequal lengths and junk input', () => {
  assert.equal(timingSafeCompare('abc', 'abc'), true);
  assert.equal(timingSafeCompare('abc', 'abcd'), false);
  assert.equal(timingSafeCompare('', ''), false);
  assert.equal(timingSafeCompare(null, 'abc'), false);
  assert.equal(timingSafeCompare('abc', undefined), false);
  assert.equal(timingSafeCompare(123, 123), false);
});
