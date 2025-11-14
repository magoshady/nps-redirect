# 🔄 HubSpot + n8n Integration Guide

Automatically send NPS surveys when a deal closes in HubSpot using n8n.

## 📋 Overview

When a deal is **Won** in HubSpot → n8n workflow triggers → Customer receives NPS survey email

## 🎯 The Placeholders

Your email template has **TWO placeholders** that need to be replaced for each customer:

| Placeholder | What It Is | Example |
|------------|------------|---------|
| `{{CUSTOMER_ID}}` | Unique identifier for the customer | `DEAL-12345` or `CUST-789` |
| `{{CUSTOMER_EMAIL}}` | Customer's email address | `john@example.com` |

**These placeholders appear in EVERY rating link (0-10)** in the email template.

### Example URL Structure

```
https://script.google.com/macros/.../exec?score=10&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}
```

**After replacement:**
```
https://script.google.com/macros/.../exec?score=10&customer=DEAL-12345&email=john@example.com
```

---

## 🔧 n8n Workflow Setup

### Step 1: Create the Workflow in n8n

#### Node 1: HubSpot Trigger
**Type:** `HubSpot Trigger` or `Webhook`

**Option A: Using HubSpot Trigger Node**
1. Add **HubSpot Trigger** node
2. Select **Deal**
3. Choose event: **Deal Updated**
4. Add filter: `dealstage` = `closedwon` (or your "Won" stage)

**Option B: Using Webhook (More Reliable)**
1. Add **Webhook** node
2. Set to **Waiting for Webhook Call**
3. Copy the webhook URL
4. In HubSpot:
   - Go to Settings > Integrations > Workflows
   - Create workflow: "Deal Won → Send NPS"
   - Trigger: Deal Stage = Won
   - Action: Send webhook to n8n URL

---

#### Node 2: Extract Customer Data
**Type:** `Set` node

Extract the data from HubSpot:

```json
{
  "customer_id": "={{ $json.hs_object_id }}",
  "customer_email": "={{ $json.properties.email }}",
  "customer_name": "={{ $json.properties.firstname }} {{ $json.properties.lastname }}",
  "deal_name": "={{ $json.properties.dealname }}",
  "close_date": "={{ $json.properties.closedate }}"
}
```

**HubSpot Field Mapping:**
- Deal ID: `hs_object_id` or `dealId`
- Email: Usually from associated contact `properties.email`
- Name: `properties.firstname` + `properties.lastname`
- Deal Name: `properties.dealname`

---

#### Node 3: Get Contact Email (if needed)
**Type:** `HubSpot` node

If the email isn't directly on the deal, fetch the associated contact:

1. **Operation:** Get Contact
2. **Contact ID:** `={{ $json.associations.contacts[0] }}`
3. This will return contact details including email

---

#### Node 4: Wait 7 Days (Optional)
**Type:** `Wait` node

Best practice: Send NPS survey **7 days after installation/close**

1. **Resume:** After time interval
2. **Amount:** 7
3. **Unit:** Days

💡 **Skip this if you want to send immediately**

---

#### Node 5: Load Email Template
**Type:** `HTTP Request` or `Read Binary File`

**Option A: Load from file**
```javascript
// Use Code node instead
const fs = require('fs');
const emailTemplate = fs.readFileSync('/path/to/email-template.html', 'utf8');
return [{ json: { template: emailTemplate } }];
```

**Option B: Store template in n8n**
1. Copy the entire `email-template.html` content
2. In **Set** node, create a field called `emailTemplate`
3. Paste the HTML (but you'll need to replace placeholders dynamically)

---

#### Node 6: Replace Placeholders
**Type:** `Code` node (JavaScript)

```javascript
// Get the template and customer data
const template = $input.first().json.emailTemplate; // Or your template source
const customerId = $input.first().json.customer_id;
const customerEmail = $input.first().json.customer_email;

// Replace all placeholders
let emailHtml = template;
emailHtml = emailHtml.replace(/\{\{CUSTOMER_ID\}\}/g, customerId);
emailHtml = emailHtml.replace(/\{\{CUSTOMER_EMAIL\}\}/g, customerEmail);

// Return the processed email
return {
  json: {
    to: customerEmail,
    subject: 'How was your installation experience?',
    html: emailHtml
  }
};
```

---

#### Node 7: Send Email
**Type:** `Send Email` node

Choose your email provider:

**Option A: Gmail**
1. Credentials: Gmail OAuth2
2. To: `={{ $json.to }}`
3. Subject: `={{ $json.subject }}`
4. Email Type: HTML
5. Body: `={{ $json.html }}`

**Option B: SendGrid**
1. Credentials: SendGrid API
2. To: `={{ $json.to }}`
3. Subject: `={{ $json.subject }}`
4. Email Type: HTML
5. Body: `={{ $json.html }}`

**Option C: SMTP (Any provider)**
1. Add SMTP credentials
2. Configure as above

---

## 📦 Complete n8n Workflow JSON

Here's a ready-to-import workflow:

```json
{
  "name": "HubSpot Deal Won → NPS Survey",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "hubspot-deal-won",
        "responseMode": "lastNode",
        "options": {}
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "webhookId": "auto-generated"
    },
    {
      "parameters": {
        "values": {
          "string": [
            {
              "name": "customer_id",
              "value": "={{ $json.hs_object_id }}"
            },
            {
              "name": "customer_email",
              "value": "={{ $json.properties.email }}"
            },
            {
              "name": "customer_name",
              "value": "={{ $json.properties.firstname }} {{ $json.properties.lastname }}"
            }
          ]
        }
      },
      "name": "Extract Customer Data",
      "type": "n8n-nodes-base.set",
      "position": [450, 300]
    },
    {
      "parameters": {
        "amount": 7,
        "unit": "days"
      },
      "name": "Wait 7 Days",
      "type": "n8n-nodes-base.wait",
      "position": [650, 300]
    },
    {
      "parameters": {
        "jsCode": "// Load email template (you can store this in n8n or load from file)\nconst emailTemplate = `[PASTE YOUR EMAIL-TEMPLATE.HTML HERE]`;\n\nconst customerId = $input.first().json.customer_id;\nconst customerEmail = $input.first().json.customer_email;\n\n// Replace placeholders\nlet emailHtml = emailTemplate;\nemailHtml = emailHtml.replace(/\\{\\{CUSTOMER_ID\\}\\}/g, customerId);\nemailHtml = emailHtml.replace(/\\{\\{CUSTOMER_EMAIL\\}\\}/g, customerEmail);\n\nreturn {\n  json: {\n    to: customerEmail,\n    subject: 'How was your installation experience?',\n    html: emailHtml\n  }\n};"
      },
      "name": "Prepare Email",
      "type": "n8n-nodes-base.code",
      "position": [850, 300]
    },
    {
      "parameters": {
        "fromEmail": "support@yourcompany.com",
        "toEmail": "={{ $json.to }}",
        "subject": "={{ $json.subject }}",
        "emailType": "html",
        "message": "={{ $json.html }}"
      },
      "name": "Send Email",
      "type": "n8n-nodes-base.emailSend",
      "position": [1050, 300],
      "credentials": {
        "smtp": {
          "id": "1",
          "name": "SMTP account"
        }
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [
        [
          {
            "node": "Extract Customer Data",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Extract Customer Data": {
      "main": [
        [
          {
            "node": "Wait 7 Days",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Wait 7 Days": {
      "main": [
        [
          {
            "node": "Prepare Email",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Prepare Email": {
      "main": [
        [
          {
            "node": "Send Email",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

---

## 🔍 Understanding the Data Flow

### 1. HubSpot Deal Won
```json
{
  "hs_object_id": "12345678",
  "properties": {
    "dealname": "Acme Corp - Premium",
    "dealstage": "closedwon",
    "closedate": "2024-11-14",
    "amount": "5000"
  },
  "associations": {
    "contacts": ["987654"]
  }
}
```

### 2. After Extraction
```json
{
  "customer_id": "12345678",
  "customer_email": "john@acmecorp.com",
  "customer_name": "John Doe"
}
```

### 3. After Template Processing
The email HTML now has:
```html
<!-- Instead of placeholders -->
<a href="https://script.google.com/.../exec?score=10&customer=12345678&email=john@acmecorp.com">10</a>
```

### 4. Email Sent
John receives the email → Clicks "9" → Response saved to Google Sheet!

---

## 🎯 Alternative: Use HubSpot Contact ID

Instead of Deal ID, you might want to use **Contact ID**:

```javascript
// In the "Extract Customer Data" node
{
  "customer_id": "={{ $json.associations.contacts[0] }}", // Contact ID
  "customer_email": "={{ $json.properties.email }}"
}
```

Or create a **custom format**:
```javascript
{
  "customer_id": "DEAL-{{ $json.hs_object_id }}", // Prefixed with "DEAL-"
  "customer_email": "={{ $json.properties.email }}"
}
```

---

## 🧪 Testing Your Workflow

### Test in n8n

1. **Manually trigger** the workflow
2. Use **Execute Workflow** button
3. Provide test data:
```json
{
  "hs_object_id": "TEST-123",
  "properties": {
    "email": "your-email@example.com",
    "firstname": "Test",
    "lastname": "User"
  }
}
```

4. Check each node to see data transformation
5. Verify email is sent correctly

### Test in HubSpot

1. Create a **test deal**
2. Mark it as **Won**
3. Webhook should trigger n8n
4. Check n8n execution log
5. Verify email received

---

## 📊 What Gets Tracked in Google Sheets

When the customer clicks a rating, Google Sheets will record:

| Timestamp | Score | Customer ID | Email | Category | Date | Time |
|-----------|-------|-------------|-------|----------|------|------|
| 2024-11-14T10:30:00 | 9 | DEAL-12345 | john@acme.com | Promoter | 2024-11-14 | 10:30:00 |

You can then:
- Match responses back to HubSpot deals
- Update deal properties with NPS score
- Create follow-up tasks for detractors

---

## 🔄 Advanced: Update HubSpot with NPS Score

Add another workflow to **sync NPS back to HubSpot**:

### n8n Workflow: Google Sheets → HubSpot

**Trigger:** New row in Google Sheets (your NPS responses)

**Action:** Update HubSpot deal with custom property `nps_score`

```javascript
// In Code node
const customerId = $json.customer_id; // "DEAL-12345"
const score = $json.score; // 9

// Determine category
let category = 'Detractor';
if (score >= 9) category = 'Promoter';
else if (score >= 7) category = 'Passive';

return {
  json: {
    dealId: customerId.replace('DEAL-', ''),
    nps_score: score,
    nps_category: category,
    nps_response_date: new Date().toISOString()
  }
};
```

**HubSpot Node:**
- Operation: Update Deal
- Deal ID: `={{ $json.dealId }}`
- Properties:
  - `nps_score`: `={{ $json.nps_score }}`
  - `nps_category`: `={{ $json.nps_category }}`

---

## 🎨 Customization Options

### Add Customer Name to Email

Update the template to include name:

```html
<p>Hi {{CUSTOMER_NAME}},</p>
<p>How likely are you to recommend us?</p>
```

Then in n8n:
```javascript
emailHtml = emailHtml.replace(/\{\{CUSTOMER_NAME\}\}/g, customerName);
```

### Track Product/Deal Type

Add to URL parameters:
```html
?score=10&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}&product={{PRODUCT_NAME}}
```

Update Google Apps Script to capture it:
```javascript
const product = e.parameter.product;
sheet.appendRow([timestamp, score, customerId, email, category, date, time, product]);
```

### Conditional Timing

Send survey at different times based on deal size:

```javascript
// In n8n Code node
const dealAmount = $input.first().json.properties.amount;
let waitDays = 7; // default

if (dealAmount > 10000) {
  waitDays = 14; // Enterprise customers get 2 weeks
} else if (dealAmount < 1000) {
  waitDays = 3; // Small deals get 3 days
}

return { json: { waitDays: waitDays } };
```

---

## ✅ Quick Start Checklist

- [ ] Create n8n workflow
- [ ] Add HubSpot webhook trigger
- [ ] Test with sample deal data
- [ ] Configure email credentials
- [ ] Paste email template in Code node
- [ ] Set up placeholder replacement
- [ ] Test email sending
- [ ] Configure wait time (7 days recommended)
- [ ] Deploy workflow
- [ ] Test with real HubSpot deal
- [ ] Verify response in Google Sheet
- [ ] (Optional) Set up HubSpot sync back

---

## 🆘 Troubleshooting

**Webhook not triggering?**
- Check HubSpot webhook settings
- Verify n8n webhook URL is correct
- Test webhook manually

**Email not sent?**
- Check email credentials in n8n
- Verify SMTP settings
- Check n8n execution logs

**Placeholders not replaced?**
- Verify regex in Code node: `/\{\{CUSTOMER_ID\}\}/g`
- Check that data is flowing through nodes
- Use n8n's debug mode to inspect data

**Customer email not found?**
- HubSpot deals don't have emails directly
- You need to fetch associated contact
- Add a HubSpot node to get contact details

---

## 🎉 You're Done!

Your automated NPS system is now connected to HubSpot!

**What happens now:**
1. Deal closes in HubSpot → ✅
2. n8n receives webhook → ✅
3. Wait 7 days (optional) → ✅
4. Email sent with unique customer links → ✅
5. Customer clicks rating → ✅
6. Response saved to Google Sheet → ✅
7. You view results in dashboard → ✅

**Total cost: $0** (compared to HubSpot's $50-100/month NPS add-on!)

