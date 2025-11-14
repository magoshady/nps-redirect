# ⚡ HubSpot + n8n Quick Start (10 Minutes)

Get your automated NPS system running with HubSpot in 10 minutes.

---

## 📋 What You Need

✅ Google Apps Script deployed (you already have this!)  
✅ n8n account ([n8n.io](https://n8n.io) - free cloud version available)  
✅ HubSpot account with workflows access  
✅ Email sending credentials (Gmail, SendGrid, etc.)  

---

## 🚀 5 Steps to Automation

### Step 1: Create n8n Workflow (2 min)

1. Log into [n8n.io](https://n8n.io)
2. Click **"New Workflow"**
3. Name it: "HubSpot Deal Won → NPS Survey"

---

### Step 2: Add HubSpot Webhook (2 min)

1. **Add node** → Search for **"Webhook"**
2. Click **"Waiting for Webhook Call"**
3. **Copy the webhook URL** (looks like: `https://yourworkflow.app.n8n.cloud/webhook/abc123`)
4. Leave this tab open, we'll come back to it

---

### Step 3: Configure HubSpot (2 min)

1. In HubSpot, go to **Automation** → **Workflows**
2. Click **"Create workflow"**
3. Choose **"Deal-based"**
4. **Trigger:** When deal stage = "Closed Won" (or your won stage)
5. **Action:** Click **"+"** → Search for **"Send webhook"**
6. Paste your n8n webhook URL
7. Click **"Review and publish"**
8. Activate the workflow

---

### Step 4: Extract & Prepare Email (3 min)

Back in n8n, add these nodes:

#### Node 2: Set (Extract Data)
1. Add **Set** node after Webhook
2. Add these values:
   - **customer_id**: `{{ $json.hs_object_id }}`
   - **customer_email**: `{{ $json.properties.email }}`
   - **customer_name**: `{{ $json.properties.firstname }}`

#### Node 3: Code (Prepare Email)
1. Add **Code** node
2. Copy the contents of `n8n-code-node-example.js` file
3. Paste it into the code editor
4. Update line 24 in the code to paste your full `email-template.html` content

💡 **Quick tip:** Open `email-template.html`, select all (Cmd/Ctrl+A), copy, then paste between the backticks in the Code node.

---

### Step 5: Send Email (3 min)

#### Option A: Gmail
1. Add **Gmail** node
2. Click **"Connect"** and authenticate with Google
3. Configure:
   - **To:** `{{ $json.to }}`
   - **Subject:** `{{ $json.subject }}`
   - **Email Type:** HTML
   - **Message:** `{{ $json.html }}`

#### Option B: SendGrid
1. Add **SendGrid** node
2. Add your SendGrid API key
3. Configure same as above

#### Option C: Generic SMTP
1. Add **Send Email** node
2. Add SMTP credentials
3. Configure same as above

---

### Step 6: Test It! (2 min)

1. **In n8n:** Click **"Execute Workflow"** button
2. **In HubSpot:** Create a test deal and mark it as "Won"
3. **Check:** n8n execution log (should show success)
4. **Verify:** Email received in inbox
5. **Click:** Click a rating (0-10) in the email
6. **Confirm:** Response appears in Google Sheet

---

## ✅ Done!

Your automated NPS system is live!

---

## 🎯 What Happens Now

```
HubSpot Deal Won
      ↓
n8n Webhook Triggered
      ↓
Customer Data Extracted
      ↓
Email Prepared (placeholders replaced)
      ↓
Email Sent to Customer
      ↓
Customer Clicks Rating
      ↓
Response Saved to Google Sheet
      ↓
You See Results in Dashboard
```

---

## 🔧 Optional: Add Wait Time

Want to send the survey **7 days after** the deal closes?

1. In n8n, add a **Wait** node after "Extract Data"
2. Set **Amount:** 7
3. Set **Unit:** Days
4. Move the rest of the workflow after this node

---

## 📊 The Placeholders Explained

Your email template has **two placeholders**:

| Placeholder | What It Does | Example |
|-------------|--------------|---------|
| `{{CUSTOMER_ID}}` | Identifies the customer/deal | `DEAL-12345` |
| `{{CUSTOMER_EMAIL}}` | Customer's email | `john@example.com` |

**These appear in EVERY rating link (0-10)** so each customer gets unique tracking URLs.

### Before Replacement:
```html
<a href="https://script.google.com/.../exec?score=10&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}">10</a>
```

### After Replacement (by n8n):
```html
<a href="https://script.google.com/.../exec?score=10&customer=DEAL-12345&email=john@example.com">10</a>
```

When John clicks "10", the URL includes his unique ID and email, so Google Sheets knows exactly who responded!

---

## 🎨 Customization Ideas

### 1. Use Different Customer ID Format

In the **Set** node, change:
```javascript
// Instead of HubSpot deal ID
customer_id: "DEAL-{{ $json.hs_object_id }}"

// Or use contact ID
customer_id: "CONTACT-{{ $json.associations.contacts[0] }}"

// Or create custom format
customer_id: "{{ $json.properties.firstname }}-{{ $json.hs_object_id }}"
```

### 2. Add Customer Name to Email

1. Add this line to your email template (in the greeting):
```html
<p style="font-size: 16px;">Hi {{CUSTOMER_NAME}},</p>
```

2. The code node already handles this replacement!

### 3. Only Send to Certain Deal Sizes

Add an **IF** node after "Extract Data":
```javascript
// Only send NPS for deals over $5000
{{ $json.properties.amount > 5000 }}
```

### 4. Different Timing by Deal Type

```javascript
// In Code node, add:
const dealAmount = $input.first().json.properties.amount;
let waitDays = dealAmount > 10000 ? 14 : 7; // Enterprise gets 2 weeks
```

---

## 🔍 Debugging Tips

### Webhook Not Triggering?
1. Check HubSpot workflow is **active**
2. Test by marking a real deal as "Won"
3. Check n8n **Executions** tab for incoming requests

### Email Not Sent?
1. Check n8n execution log (red = error)
2. Verify email credentials
3. Check spam folder

### Placeholders Not Replaced?
1. In n8n, click on each node to see data flow
2. Verify `customer_id` and `customer_email` exist
3. Check regex in Code node: `/\{\{CUSTOMER_ID\}\}/g`

### Customer Email Not Available?
HubSpot deals don't have emails directly. You need to:
1. Add a **HubSpot** node to get associated contact
2. **Operation:** Get Contact
3. **Contact ID:** `{{ $json.associations.contacts[0] }}`
4. Use contact's email: `{{ $json.properties.email }}`

---

## 📈 Track Your Results

### In Google Sheets:
- Go to **NPS Tools** → **Calculate NPS**
- Or **NPS Tools** → **Create Dashboard**

### Match Back to HubSpot:
The `Customer ID` column will have your HubSpot deal IDs, so you can:
- Identify which deals/customers gave which scores
- Follow up with detractors
- Thank promoters

---

## 🚀 Advanced: Sync NPS Back to HubSpot

Create a second workflow to update HubSpot with NPS scores:

**Trigger:** Google Sheets - On New Row  
**Action:** HubSpot - Update Deal

Add custom properties to HubSpot deals:
- `nps_score` (number)
- `nps_category` (text: Promoter/Passive/Detractor)
- `nps_response_date` (date)

See full instructions in `HUBSPOT-N8N-INTEGRATION.md`

---

## 💰 Cost Breakdown

| Service | Cost |
|---------|------|
| Google Sheets | **Free** |
| Google Apps Script | **Free** |
| n8n (Cloud free tier) | **Free** (up to 5,000 executions/month) |
| HubSpot Workflows | **Free** (with Free/Starter) |
| Email Sending (Gmail) | **Free** (up to 500/day) |
| **TOTAL** | **$0/month** |

Compare to: HubSpot NPS Add-on = $50-100/month

**You save: $600-1200/year!** 💰

---

## 🎉 You're All Set!

Your customers will now automatically receive NPS surveys when deals close in HubSpot!

**Questions?** Check the detailed guide: `HUBSPOT-N8N-INTEGRATION.md`

---

## 📚 Additional Resources

- **Full Setup:** `README.md`
- **Detailed Integration:** `HUBSPOT-N8N-INTEGRATION.md`
- **Code Example:** `n8n-code-node-example.js`
- **Email Template:** `email-template.html`
- **Backend Script:** `google-apps-script.js`

Happy automating! 🚀✨

