/**
 * n8n Code Node - Prepare NPS Email
 *
 * Mode: "Run Once for Each Item"
 *
 * Requires the crypto module. In your n8n environment set:
 *   NODE_FUNCTION_ALLOW_BUILTIN=crypto
 * (or add crypto to the existing comma-separated list)
 *
 * NPS_SECRET must be the SAME value in three places:
 *   - this workflow            (below, via $env or a credential)
 *   - Vercel                   (NPS_SECRET environment variable)
 *   - Apps Script              (Script Property NPS_SECRET)
 */

const crypto = require('crypto');

// ============================================
// STEP 1: Config
// ============================================

const CONFIG = {
  surveyBaseUrl: 'https://nps.impressivebatteries.com.au/r',
  secret: $env.NPS_SECRET, // never hard-code this
  from: 'support@impressivebatteries.com.au',
  fromName: 'Impressive Electrical',
  subject: 'How was your installation?',
  businessAddress: '123 Example Street, Sydney NSW 2000', // your registered address
  unsubscribeBaseUrl: 'https://impressivebatteries.com.au/unsubscribe',
};

if (!CONFIG.secret) {
  throw new Error('NPS_SECRET is not set — cannot sign survey links');
}

// ============================================
// STEP 2: Customer data from the previous node
// ============================================

const customerId = $input.item.json.customer_id;
const customerEmail = $input.item.json.customer_email;
const customerName = $input.item.json.customer_name || 'there';
const recordId = $input.item.json.record_id || '';

if (!customerId || !customerEmail) {
  throw new Error(`Missing customer_id or customer_email for item: ${JSON.stringify($input.item.json)}`);
}

// ============================================
// STEP 3: Build the signed invite token
// ============================================
//
// The token carries the customer identity instead of putting their email
// address in the URL, and it is signed so nobody can submit a rating for
// someone else. It expires after 30 days (enforced server-side).

function createInviteToken({ customer, email, record }, secret, now = Date.now()) {
  const body = Buffer.from(
    JSON.stringify({ c: String(customer), e: String(email), r: record ? String(record) : '', i: now }),
  ).toString('base64url');

  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

const npsToken = createInviteToken(
  { customer: customerId, email: customerEmail, record: recordId },
  CONFIG.secret,
);

const ratingUrl = (score) =>
  `${CONFIG.surveyBaseUrl}?score=${score}&t=${encodeURIComponent(npsToken)}`;

const unsubscribeUrl = `${CONFIG.unsubscribeBaseUrl}?t=${encodeURIComponent(npsToken)}`;

// ============================================
// STEP 4: The email template
// ============================================
//
// Paste the full contents of email-template.html between the backticks below.
// Keep the {{PLACEHOLDER}} tokens intact — they are replaced in step 5.

const emailTemplate = `
<!-- >>> PASTE THE CONTENTS OF email-template.html HERE <<< -->
`;

// ============================================
// STEP 5: Fill in the placeholders
// ============================================

let html = emailTemplate
  .replace(/\{\{CUSTOMER_NAME\}\}/g, escapeHtml(customerName))
  .replace(/\{\{NPS_TOKEN\}\}/g, encodeURIComponent(npsToken))
  .replace(/\{\{BUSINESS_ADDRESS\}\}/g, escapeHtml(CONFIG.businessAddress))
  .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

// A plaintext alternative is not optional. Sending HTML-only is one of the
// cheapest ways to look like bulk phishing to a spam filter.
const text = [
  `Hi ${customerName},`,
  '',
  'Your installation is complete, and we would like to know how it went.',
  'How likely are you to recommend Impressive Electrical to a friend or colleague?',
  '',
  'Rate us from 0 (not likely) to 10 (extremely likely):',
  '',
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => `  ${String(score).padStart(2)} - ${ratingUrl(score)}`),
  '',
  "You'll be asked to confirm your choice, so a mis-tap won't be counted.",
  '',
  '--',
  CONFIG.fromName,
  CONFIG.businessAddress,
  'https://impressivebatteries.com.au',
  '',
  `Unsubscribe from feedback requests: ${unsubscribeUrl}`,
].join('\n');

// ============================================
// STEP 6: Output
// ============================================
//
// In the Send Email node, map:
//   To:      {{ $json.to }}
//   Subject: {{ $json.subject }}
//   HTML:    {{ $json.html }}
//   Text:    {{ $json.text }}
//
// And add these headers — List-Unsubscribe materially improves inbox
// placement and is expected by Gmail and Outlook for bulk mail:
//   List-Unsubscribe:      {{ $json.headers['List-Unsubscribe'] }}
//   List-Unsubscribe-Post: {{ $json.headers['List-Unsubscribe-Post'] }}

return {
  json: {
    to: customerEmail,
    from: CONFIG.from,
    fromName: CONFIG.fromName,
    subject: CONFIG.subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${CONFIG.from}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    // Useful for debugging / logging, not for sending:
    customerId,
    recordId,
  },
};
