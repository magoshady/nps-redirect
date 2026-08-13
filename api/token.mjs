/**
 * Mints signed survey invite tokens for n8n.
 *
 * n8n Code nodes cannot read credentials, so rather than putting the signing
 * secret in the n8n environment, n8n calls this endpoint with an API key held
 * in a Header Auth credential. NPS_SECRET then only ever exists in Vercel and
 * Apps Script, and the API key can be rotated without re-issuing anything.
 *
 *   POST /api/token
 *   x-api-key: <NPS_API_KEY>
 *   { "customer": "12345", "email": "bob@example.com", "record": "deal-9" }
 *
 *   → { "token": "...", "expiresAt": "...", "ratingUrls": { "0": "...", ... } }
 */

import { INVITE_TTL_MS, createInviteToken, timingSafeCompare } from './_lib/token.mjs';

const SECRET = process.env.NPS_SECRET;
const API_KEY = process.env.NPS_API_KEY;
const PUBLIC_URL = process.env.NPS_PUBLIC_URL || 'https://nps.impressivebatteries.com.au';

const json = (res, status, payload) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(JSON.stringify(payload));
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  if (!SECRET || !API_KEY) {
    console.error('Missing NPS_SECRET or NPS_API_KEY environment variable');
    return json(res, 500, { error: 'not_configured' });
  }

  const presented = req.headers['x-api-key'];
  if (!timingSafeCompare(typeof presented === 'string' ? presented : '', API_KEY)) {
    return json(res, 401, { error: 'unauthorized' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const customer = body.customer === undefined || body.customer === null ? '' : String(body.customer).trim();
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const record = body.record === undefined || body.record === null ? '' : String(body.record).trim();

  if (!customer || !email) {
    return json(res, 400, { error: 'customer and email are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { error: 'email is not a valid address' });
  }

  const issuedAt = Date.now();
  const token = createInviteToken({ customer, email, record }, SECRET, issuedAt);
  const encoded = encodeURIComponent(token);

  const ratingUrls = {};
  for (let score = 0; score <= 10; score++) {
    ratingUrls[score] = `${PUBLIC_URL}/r?score=${score}&t=${encoded}`;
  }

  return json(res, 200, {
    token,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(issuedAt + INVITE_TTL_MS).toISOString(),
    ratingUrls,
  });
}
