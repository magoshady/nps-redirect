#!/usr/bin/env node
/**
 * Builds n8n-workflow.json — an importable workflow with email-template.html
 * embedded in the Code node.
 *
 * Re-run this after editing email-template.html or n8n-code-node-example.js:
 *   npm run build:workflow
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const template = readFileSync(join(root, 'email-template.html'), 'utf8');
const codeSource = readFileSync(join(root, 'n8n-code-node-example.js'), 'utf8');

/* -------------------------------------------------- build the Code node -- */

// Anything inside a template literal has to survive being one.
const escapedTemplate = template.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const PLACEHOLDER = /const emailTemplate = `\n<!-- >>> PASTE THE CONTENTS OF email-template\.html HERE <<< -->\n`;/;

if (!PLACEHOLDER.test(codeSource)) {
  console.error('Could not find the emailTemplate placeholder in n8n-code-node-example.js');
  process.exit(1);
}

const jsCode = codeSource
  .replace(PLACEHOLDER, `const emailTemplate = \`\n${escapedTemplate}\`;`)
  // Drop the trailing HTTP Request setup notes — they are documentation, and
  // the workflow this generates already wires that node up.
  .replace(/\n\/\* =+\n \* Setting up the "Get NPS Token"[\s\S]*$/, '\n');

/* ------------------------------------------------------------- workflow -- */

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  parameters,
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  name,
  type,
  typeVersion,
  position,
  ...extra,
});

const workflow = {
  name: 'NPS Survey',
  nodes: [
    node('When clicking Execute workflow', 'n8n-nodes-base.manualTrigger', 1, [-40, 300], {}),

    node(
      'Customer Data',
      'n8n-nodes-base.set',
      3.4,
      [180, 300],
      {
        assignments: {
          assignments: [
            { id: 'a1', name: 'customer_id', value: 'TEST-001', type: 'string' },
            { id: 'a2', name: 'customer_email', value: 'you@impressivebatteries.com.au', type: 'string' },
            { id: 'a3', name: 'customer_name', value: 'Rodrigo', type: 'string' },
            { id: 'a4', name: 'record_id', value: 'TEST-DEAL-001', type: 'string' },
          ],
        },
        options: {},
      },
      {
        notes:
          'Replace this with your real source (HubSpot trigger, webhook, etc). '
          + 'It must output customer_id, customer_email, customer_name and record_id.',
        notesInFlow: true,
      },
    ),

    node(
      'Get NPS Token',
      'n8n-nodes-base.httpRequest',
      4.2,
      [400, 300],
      {
        method: 'POST',
        url: 'https://nps.impressivebatteries.com.au/api/token',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={\n'
          + '  "customer": "{{ $json.customer_id }}",\n'
          + '  "email": "{{ $json.customer_email }}",\n'
          + '  "record": "{{ $json.record_id }}"\n'
          + '}',
        options: {},
      },
      {
        credentials: {
          httpHeaderAuth: { id: 'REPLACE_WITH_YOUR_CREDENTIAL_ID', name: 'NPS Token API' },
        },
        notes: 'Select your "NPS Token API" Header Auth credential after importing.',
        notesInFlow: true,
      },
    ),

    node('Prepare NPS Email', 'n8n-nodes-base.code', 2, [620, 300], {
      mode: 'runOnceForEachItem',
      jsCode,
    }),

    node(
      'Send Email',
      'n8n-nodes-base.gmail',
      2.1,
      [840, 300],
      {
        resource: 'message',
        operation: 'send',
        sendTo: '={{ $json.to }}',
        subject: '={{ $json.subject }}',
        emailType: 'html',
        message: '={{ $json.html }}',
        options: {
          senderName: '={{ $json.fromName }}',
          appendAttribution: false,
        },
      },
      {
        credentials: {
          gmailOAuth2: { id: 'REPLACE_WITH_YOUR_GMAIL_CREDENTIAL_ID', name: 'Gmail account' },
        },
        notes:
          'Select your Gmail credential after importing. The account it is connected to '
          + 'determines the From address — it must be support@impressivebatteries.com.au, or '
          + 'have that set up as a verified "Send mail as" alias in Gmail settings.',
        notesInFlow: true,
      },
    ),
  ],
  connections: {
    'When clicking Execute workflow': {
      main: [[{ node: 'Customer Data', type: 'main', index: 0 }]],
    },
    'Customer Data': { main: [[{ node: 'Get NPS Token', type: 'main', index: 0 }]] },
    'Get NPS Token': { main: [[{ node: 'Prepare NPS Email', type: 'main', index: 0 }]] },
    'Prepare NPS Email': { main: [[{ node: 'Send Email', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
  pinData: {},
};

const outPath = join(root, 'n8n-workflow.json');
writeFileSync(outPath, JSON.stringify(workflow, null, 2) + '\n');

console.log(`Wrote ${outPath}`);
console.log(`  Code node: ${jsCode.length} chars (template embedded: ${template.length} chars)`);
