/**
 * Run with: node --test test/
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INVITE_TTL_MS,
  MIN_DWELL_MS,
  SUBMIT_TTL_MS,
  createInviteToken,
  createSubmitToken,
  escapeHtml,
  parseScore,
  signVote,
  verifyInviteToken,
  verifySubmitToken,
} from '../api/_lib/token.mjs';

const SECRET = 'test-secret-value';
const CUSTOMER = { customer: '12345', email: 'bob@example.com', record: 'deal-9' };

test('parseScore accepts only whole numbers 0-10', () => {
  for (let n = 0; n <= 10; n++) {
    assert.equal(parseScore(String(n)), n);
  }
  assert.equal(parseScore(' 7 '), 7);

  for (const bad of ['11', '-1', '3.5', '07', 'abc', '', '1e1', null, undefined, {}]) {
    assert.equal(parseScore(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('parseScore rejects the XSS payload that was reflected in production', () => {
  assert.equal(parseScore('<img src=x onerror=alert(1)>'), null);
  assert.equal(parseScore('0<script>alert(1)</script>'), null);
});

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
});

test('invite token round-trips the customer without exposing it', () => {
  const token = createInviteToken(CUSTOMER, SECRET);
  assert.ok(!token.includes('bob@example.com'), 'email must not appear in the token verbatim');

  const result = verifyInviteToken(token, SECRET);
  assert.equal(result.ok, true);
  assert.equal(result.customer, '12345');
  assert.equal(result.email, 'bob@example.com');
  assert.equal(result.record, 'deal-9');
});

test('invite token is rejected when tampered with or signed by someone else', () => {
  const token = createInviteToken(CUSTOMER, SECRET);

  assert.equal(verifyInviteToken(token, 'other-secret').ok, false);
  assert.equal(verifyInviteToken(token.slice(0, -2) + 'xy', SECRET).ok, false);
  assert.equal(verifyInviteToken('garbage', SECRET).ok, false);
  assert.equal(verifyInviteToken('', SECRET).ok, false);

  // Swapping in a payload for a different customer without a valid signature.
  const forged = Buffer.from(JSON.stringify({ c: '999', e: 'mallory@evil.com', i: Date.now() }))
    .toString('base64url');
  assert.equal(verifyInviteToken(`${forged}.${token.split('.')[1]}`, SECRET).ok, false);
});

test('invite token expires after 30 days', () => {
  const issued = Date.now();
  const token = createInviteToken(CUSTOMER, SECRET, issued);

  assert.equal(verifyInviteToken(token, SECRET, issued + INVITE_TTL_MS - 1000).ok, true);

  const expired = verifyInviteToken(token, SECRET, issued + INVITE_TTL_MS + 1000);
  assert.equal(expired.ok, false);
  assert.equal(expired.reason, 'expired');
});

test('submit token binds to both the invite token and the score', () => {
  const invite = createInviteToken(CUSTOMER, SECRET);
  const issued = Date.now();
  const submit = createSubmitToken(invite, 9, SECRET, issued);
  const later = issued + MIN_DWELL_MS + 500;

  assert.equal(verifySubmitToken(submit, invite, 9, SECRET, later).ok, true);

  // Same token replayed against a different score.
  const wrongScore = verifySubmitToken(submit, invite, 0, SECRET, later);
  assert.equal(wrongScore.ok, false);
  assert.equal(wrongScore.reason, 'score_mismatch');

  // Same token replayed against a different customer's invite.
  const otherInvite = createInviteToken({ customer: '999', email: 'eve@example.com' }, SECRET);
  const wrongCustomer = verifySubmitToken(submit, otherInvite, 9, SECRET, later);
  assert.equal(wrongCustomer.ok, false);
  assert.equal(wrongCustomer.reason, 'token_mismatch');
});

test('submit token rejects instant submission and stale tabs', () => {
  const invite = createInviteToken(CUSTOMER, SECRET);
  const issued = Date.now();
  const submit = createSubmitToken(invite, 8, SECRET, issued);

  // An automated submitter posts the form the instant it is parsed.
  const instant = verifySubmitToken(submit, invite, 8, SECRET, issued);
  assert.equal(instant.ok, false);
  assert.equal(instant.reason, 'too_fast');

  // A tab left open overnight.
  const stale = verifySubmitToken(submit, invite, 8, SECRET, issued + SUBMIT_TTL_MS + 1000);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'expired');

  // A person who reads the page and clicks.
  assert.equal(verifySubmitToken(submit, invite, 8, SECRET, issued + 3000).ok, true);
});

test('an empty submit token is rejected (the no-JavaScript crawler case)', () => {
  const invite = createInviteToken(CUSTOMER, SECRET);
  for (const empty of ['', null, undefined]) {
    assert.equal(verifySubmitToken(empty, invite, 5, SECRET).ok, false);
  }
});

test('vote signature covers every field Apps Script trusts', () => {
  const vote = { score: 9, customer: '12345', email: 'bob@example.com', record: 'deal-9', ts: 1700000000000 };
  const sig = signVote(vote, SECRET);

  assert.equal(signVote({ ...vote }, SECRET), sig);
  assert.notEqual(signVote({ ...vote, score: 0 }, SECRET), sig);
  assert.notEqual(signVote({ ...vote, customer: '99' }, SECRET), sig);
  assert.notEqual(signVote({ ...vote, email: 'eve@evil.com' }, SECRET), sig);
  assert.notEqual(signVote({ ...vote, record: 'deal-1' }, SECRET), sig);
  assert.notEqual(signVote({ ...vote, ts: vote.ts + 1 }, SECRET), sig);
  assert.notEqual(signVote(vote, 'other-secret'), sig);
});
