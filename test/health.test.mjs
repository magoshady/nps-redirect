/**
 * The config check exists because an unset variable used to show up only as a
 * feature quietly not happening. It must never leak a value.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const API_KEY = 'health-test-api-key';
const SECRET = 'health-test-secret-value';

process.env.NPS_API_KEY = API_KEY;
process.env.NPS_SECRET = SECRET;
process.env.NPS_APPS_SCRIPT_URL = 'https://script.example.test/exec';
delete process.env.NPS_N8N_WEBHOOK_URL;

const { default: handler } = await import('../api/health.mjs');

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

const call = async (apiKey = API_KEY) => {
  const res = mockRes();
  await handler({ headers: apiKey === null ? {} : { 'x-api-key': apiKey } }, res);
  return res;
};

test('reports required variables as present without revealing them', async () => {
  const res = await call();
  const report = JSON.parse(res.body);

  assert.equal(res.statusCode, 200);
  assert.equal(report.ok, true);
  assert.deepEqual(report.missing, []);
  assert.equal(report.required.NPS_SECRET, true);

  // Booleans only.
  assert.ok(!res.body.includes(SECRET));
  assert.ok(!res.body.includes(API_KEY));
  assert.ok(!res.body.includes('script.example.test'));
});

test('flags the webhook variable that stopped the n8n notification', async () => {
  const res = await call();
  const report = JSON.parse(res.body);

  assert.equal(report.optional.NPS_N8N_WEBHOOK_URL, false);
  assert.match(report.notes, /will not notify n8n/);
});

test('drops the note once the webhook is configured', async () => {
  process.env.NPS_N8N_WEBHOOK_URL = 'https://n8n.example.test/webhook/abc';
  try {
    const report = JSON.parse((await call()).body);

    assert.equal(report.optional.NPS_N8N_WEBHOOK_URL, true);
    assert.equal(report.notes, undefined);
  } finally {
    delete process.env.NPS_N8N_WEBHOOK_URL;
  }
});

test('returns 503 when a required variable is missing', async () => {
  const saved = process.env.NPS_APPS_SCRIPT_URL;
  delete process.env.NPS_APPS_SCRIPT_URL;
  try {
    const res = await call();
    const report = JSON.parse(res.body);

    assert.equal(res.statusCode, 503);
    assert.equal(report.ok, false);
    assert.deepEqual(report.missing, ['NPS_APPS_SCRIPT_URL']);
  } finally {
    process.env.NPS_APPS_SCRIPT_URL = saved;
  }
});

test('treats a blank value as missing', async () => {
  const saved = process.env.NPS_APPS_SCRIPT_URL;
  process.env.NPS_APPS_SCRIPT_URL = '   ';
  try {
    assert.equal(JSON.parse((await call()).body).required.NPS_APPS_SCRIPT_URL, false);
  } finally {
    process.env.NPS_APPS_SCRIPT_URL = saved;
  }
});

test('requires the API key', async () => {
  assert.equal((await call(null)).statusCode, 401);
  assert.equal((await call('')).statusCode, 401);
  assert.equal((await call('wrong')).statusCode, 401);
});
