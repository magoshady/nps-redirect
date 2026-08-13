/**
 * n8n Code Node - Prepare NPS Email
 *
 * Mode: "Run Once for Each Item"
 *
 * No secret and no crypto module needed here. n8n Code nodes cannot read
 * credentials, so instead of putting the signing secret in the n8n
 * environment, the preceding HTTP Request node asks Vercel to mint the token
 * using an API key held in a Header Auth credential.
 *
 * Workflow shape:
 *
 *   [ Customer Data ]           customer_id, customer_email, customer_name, record_id
 *          |
 *   [ Get NPS Token ]           HTTP Request node — see the setup notes at the
 *          |                    bottom of this file
 *   [ Prepare NPS Email ]       this Code node
 *          |
 *   [ Send Email ]
 */

// ============================================
// STEP 1: Config
// ============================================

// The node supplying customer details. Rename to match your workflow.
const CUSTOMER_SOURCE_NODE = 'Customer Data';

const CONFIG = {
  // The Gmail node ignores this — it sends as whichever account the credential
  // is connected to. Kept because List-Unsubscribe uses it, and so the intended
  // sender is written down somewhere. That account must be
  // support@impressivebatteries.com.au or have it as a verified "Send mail as"
  // alias, otherwise the From domain stops matching the links.
  from: 'support@impressivebatteries.com.au',
  fromName: 'Impressive Electrical',
  subject: 'How was your installation?',
  businessAddress: 'Unit 2, 8-18 Kareena Rd, Miranda, NSW',
  // Keep this on the same domain as `from`. A link to a third domain is the
  // mismatch filters read as phishing — the display name above is free to be
  // the trading name customers recognise, because names carry no weight in
  // SPF, DKIM or DMARC.
  unsubscribeBaseUrl: 'https://impressivebatteries.com.au/unsubscribe',
};

// ============================================
// STEP 2: Inputs
// ============================================

// From the HTTP Request node that called POST /api/token
const { token: npsToken, ratingUrls } = $input.item.json;

// From the node holding the customer record
const source = $(CUSTOMER_SOURCE_NODE).item.json;
const customerEmail = source.customer_email;
const customerName = source.customer_name || 'there';
const customerId = source.customer_id;
const recordId = source.record_id || '';

if (!npsToken || !ratingUrls) {
  throw new Error(
    'No token in the input. Check that the "Get NPS Token" HTTP Request node ran and returned JSON.',
  );
}
if (!customerEmail) {
  throw new Error(`No customer_email on the item from "${CUSTOMER_SOURCE_NODE}"`);
}

const unsubscribeUrl = `${CONFIG.unsubscribeBaseUrl}?t=${encodeURIComponent(npsToken)}`;

// ============================================
// STEP 3: The email template
// ============================================
//
// Paste the full contents of email-template.html between the backticks below.
// Keep the {{PLACEHOLDER}} tokens intact — they are replaced in step 4.

const emailTemplate = `
<!-- >>> PASTE THE CONTENTS OF email-template.html HERE <<< -->
`;

// ============================================
// STEP 4: Fill in the placeholders
// ============================================

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

const html = emailTemplate
  .replace(/\{\{CUSTOMER_NAME\}\}/g, escapeHtml(customerName))
  .replace(/\{\{NPS_TOKEN\}\}/g, encodeURIComponent(npsToken))
  .replace(/\{\{BUSINESS_ADDRESS\}\}/g, escapeHtml(CONFIG.businessAddress))
  .replace(/\{\{UNSUBSCRIBE_URL\}\}/g, unsubscribeUrl);

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
  ...Object.keys(ratingUrls)
    .map(Number)
    .sort((a, b) => a - b)
    .map((score) => `  ${String(score).padStart(2)} - ${ratingUrls[score]}`),
  '',
  '--',
  CONFIG.fromName,
  CONFIG.businessAddress,
  'https://impressivebatteries.com.au',
  '',
  `Unsubscribe from feedback requests: ${unsubscribeUrl}`,
].join('\n');

// ============================================
// STEP 5: Output
// ============================================

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
    customerId,
    recordId,
  },
};

/* ===========================================================================
 * Setting up the "Get NPS Token" HTTP Request node
 * ===========================================================================
 *
 * 1. Add an HTTP Request node between your customer data and this Code node.
 *    Name it exactly "Get NPS Token".
 *
 * 2. Configure it:
 *      Method:               POST
 *      URL:                  https://nps.impressivebatteries.com.au/api/token
 *      Authentication:       Generic Credential Type
 *      Generic Auth Type:    Header Auth
 *      Credential:           create one — see step 3
 *      Send Body:            on
 *      Body Content Type:    JSON
 *      Specify Body:         Using JSON
 *
 *    JSON body:
 *      {
 *        "customer": "{{ $json.customer_id }}",
 *        "email":    "{{ $json.customer_email }}",
 *        "record":   "{{ $json.record_id }}"
 *      }
 *
 * 3. Create the Header Auth credential (Credentials > New > Header Auth):
 *      Name:  NPS Token API
 *      Name:  x-api-key          <- the header name
 *      Value: <the NPS_API_KEY value from Vercel>
 *
 *    n8n encrypts this at rest and redacts it from logs and exports. Rotating
 *    it means changing NPS_API_KEY in Vercel and updating this credential —
 *    the signing secret itself never changes and never enters n8n.
 *
 * 4. In the Send Email node, map:
 *      To:      {{ $json.to }}
 *      Subject: {{ $json.subject }}
 *      HTML:    {{ $json.html }}
 *      Text:    {{ $json.text }}
 *
 *    And add these headers, which materially improve inbox placement:
 *      List-Unsubscribe:      {{ $json.headers['List-Unsubscribe'] }}
 *      List-Unsubscribe-Post: {{ $json.headers['List-Unsubscribe-Post'] }}
 */
