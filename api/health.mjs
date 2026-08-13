/**
 * Configuration check.
 *
 *   curl -H "x-api-key: <NPS_API_KEY>" https://nps.impressivebatteries.com.au/api/health
 *
 * Reports which variables are present, never what they contain. This exists
 * because environment variables only take effect on a new deployment, so
 * "I set it" and "it is running with it" are different states — and the
 * difference used to only show up as a feature quietly not happening.
 */

import { timingSafeCompare } from './_lib/token.mjs';

const API_KEY = process.env.NPS_API_KEY;

const REQUIRED = ['NPS_SECRET', 'NPS_API_KEY', 'NPS_APPS_SCRIPT_URL'];
const OPTIONAL = [
  'NPS_N8N_WEBHOOK_URL',
  'NPS_PUBLIC_URL',
  'NPS_BRAND_NAME',
  'NPS_BRAND_URL',
  'NPS_SUPPORT_EMAIL',
];

const json = (res, status, payload) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(JSON.stringify(payload, null, 2));
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!API_KEY) {
    return json(res, 500, { error: 'not_configured', detail: 'NPS_API_KEY is not set' });
  }

  const presented = req.headers['x-api-key'];
  if (!timingSafeCompare(typeof presented === 'string' ? presented : '', API_KEY)) {
    return json(res, 401, { error: 'unauthorized' });
  }

  const present = (name) => Boolean(process.env[name] && process.env[name].trim());
  const report = (names) => Object.fromEntries(names.map((name) => [name, present(name)]));

  const missing = REQUIRED.filter((name) => !present(name));

  return json(res, missing.length ? 503 : 200, {
    ok: missing.length === 0,
    missing,
    required: report(REQUIRED),
    optional: report(OPTIONAL),
    notes: present('NPS_N8N_WEBHOOK_URL')
      ? undefined
      : 'NPS_N8N_WEBHOOK_URL is unset, so votes will not notify n8n.',
    deployedAt: process.env.VERCEL_DEPLOYMENT_ID ? undefined : 'local',
  });
}
