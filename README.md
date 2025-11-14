# Free NPS Survey System 📊

A complete, free NPS (Net Promoter Score) survey solution using HTML emails, Google Sheets, and Google Apps Script. **No paid tools required!**

## ✨ Features

- ✅ **One-click ratings** - Customers just click a number in the email
- ✅ **Automatic data collection** - Responses go straight to Google Sheets
- ✅ **Beautiful email design** - Professional, mobile-responsive template
- ✅ **NPS calculation** - Automatic calculation of your NPS score
- ✅ **Dashboard** - Visual dashboard with charts and metrics
- ✅ **Completely FREE** - Uses Google Sheets (free tier is more than enough)
- ✅ **HubSpot Integration** - Automatically send surveys when deals close (see below)

## 🔄 HubSpot + n8n Integration

**Want to automatically send NPS surveys when deals close in HubSpot?**

This system integrates perfectly with HubSpot via n8n (free automation tool):
- Deal closes in HubSpot → Webhook triggers n8n → Email sent automatically
- **Setup time:** 10 minutes
- **Cost:** $0 (n8n free tier: 5,000 executions/month)
- **See:** [`INTEGRATION-QUICKSTART.md`](INTEGRATION-QUICKSTART.md) for step-by-step guide

The email template uses placeholders (`{{CUSTOMER_ID}}` and `{{CUSTOMER_EMAIL}}`) that n8n automatically replaces with data from HubSpot deals/contacts.

## 🚀 Quick Setup (15 minutes)

### Step 1: Set Up Google Sheet

1. **Create a new Google Sheet**
   - Go to [Google Sheets](https://sheets.google.com)
   - Create a new blank spreadsheet
   - Name it "NPS Survey Responses" (or whatever you prefer)

2. **Add the Apps Script**
   - In your Google Sheet, go to **Extensions** > **Apps Script**
   - Delete any existing code
   - Copy and paste the entire contents of `google-apps-script.js`
   - Click the **Save** icon (💾)

3. **Deploy as Web App**
   - Click **Deploy** > **New deployment**
   - Click the gear icon ⚙️ next to "Select type"
   - Choose **Web app**
   - Configure settings:
     - **Description**: "NPS Survey Handler"
     - **Execute as**: **Me**
     - **Who has access**: **Anyone**
   - Click **Deploy**
   - **Authorize** the app (click "Authorize access", select your Google account, click "Advanced", then "Go to [Project Name]")
   - **COPY THE WEB APP URL** (it will look like: `https://script.google.com/macros/s/ABC123.../exec`)
   - Keep this URL handy!

### Step 2: Customize Your Email Template

1. Open `email-template.html`

2. Replace these placeholders:
   - `{{SCRIPT_URL}}` - Replace with your Web App URL from Step 1
   - `{{CUSTOMER_ID}}` - Replace with your customer's unique ID (e.g., `CUST-12345`)
   - `{{CUSTOMER_EMAIL}}` - Replace with your customer's email address

3. **Example replacement:**

   **Before:**
   ```html
   <a href="{{SCRIPT_URL}}?score=10&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}">
   ```

   **After:**
   ```html
   <a href="https://script.google.com/macros/s/ABC123.../exec?score=10&customer=CUST-12345&email=john@example.com">
   ```

4. Customize the text/branding if desired:
   - Update the heading text
   - Change colors (search for hex color codes like `#667eea`)
   - Add your company logo

### Step 3: Send Your First Email

You can send the email using any email service:

#### Option A: Gmail (for testing)
1. Open the HTML file in a browser
2. Copy everything (Cmd/Ctrl+A, then Cmd/Ctrl+C)
3. In Gmail, compose a new email
4. Paste the content
5. Send to yourself for testing!

#### Option B: Email Service Provider (Mailchimp, SendGrid, etc.)
1. Import the HTML template into your email service
2. Use merge tags to dynamically replace `{{CUSTOMER_ID}}` and `{{CUSTOMER_EMAIL}}`
3. Send to your customer list

#### Option C: Programmatic (Node.js, Python, etc.)
See the `examples/` folder for sample code (coming soon)

### Step 4: View Your Results

1. **See responses in real-time:**
   - Responses will appear in the "NPS Responses" sheet automatically
   - Columns: Timestamp, Score, Customer ID, Email, Category, Date, Time

2. **Calculate your NPS:**
   - In Google Sheets, go to **NPS Tools** > **Calculate NPS**
   - You'll see a popup with your current NPS score

3. **Create a visual dashboard:**
   - Go to **NPS Tools** > **Create Dashboard**
   - A new "NPS Dashboard" sheet will be created with:
     - Summary metrics
     - Response distribution chart
     - Real-time NPS calculation

## 📊 Understanding Your NPS Score

### What is NPS?

NPS (Net Promoter Score) ranges from **-100 to +100** and measures customer loyalty.

**Formula:**
```
NPS = (% Promoters) - (% Detractors)
```

### Score Categories

- **Promoters (9-10)**: 😍 Your biggest fans! Likely to recommend you.
- **Passives (7-8)**: 😐 Satisfied but not enthusiastic. Could switch to competitors.
- **Detractors (0-6)**: 😞 Unhappy customers. May damage your brand through negative word-of-mouth.

### What's a Good NPS?

- **Above 0**: Good - You have more promoters than detractors
- **Above 20**: Great - You're doing better than most
- **Above 50**: Excellent - World-class customer satisfaction
- **Above 70**: Outstanding - Best in class (very rare!)

### Industry Benchmarks (2024)

- SaaS/Software: 30-40
- E-commerce: 45-60
- Financial Services: 30-35
- Healthcare: 35-40

## 🎨 Customization

### Change Colors

In `email-template.html`, find and replace these color codes:

```css
/* Detractors (0-6) - Gray */
background-color: #f0f0f0;

/* Passives (7-8) - Yellow */
background-color: #fff3cd;

/* Promoters (9-10) - Green */
background-color: #d4edda;
```

### Add Your Logo

Replace this section in the email template:

```html
<!-- Header -->
<tr>
    <td style="padding: 40px 40px 30px; text-align: center;">
        <!-- Add your logo here -->
        <img src="https://your-domain.com/logo.png" alt="Company Logo" style="max-width: 200px; margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 24px;">
            How likely are you to recommend us?
        </h1>
    </td>
</tr>
```

### Change Thank You Page

Edit the `THANK_YOU_URL` variable in `google-apps-script.js`:

```javascript
const THANK_YOU_URL = 'https://your-domain.com/thank-you.html';
```

Or use the built-in thank you page (it's already configured!).

## 🔧 Advanced Usage

### Track Additional Data

Modify the URL parameters to track more information:

```html
?score=10&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}&product={{PRODUCT_NAME}}&install_date={{DATE}}
```

Update `google-apps-script.js` to capture these:

```javascript
const product = e.parameter.product;
const installDate = e.parameter.install_date;

// Add to recordResponse function
sheet.appendRow([timestamp, score, customerId, email, category, date, time, product, installDate]);
```

### Automated Email Sending

**Example with Node.js + Nodemailer:**

```javascript
const nodemailer = require('nodemailer');
const fs = require('fs');

// Read template
let emailHTML = fs.readFileSync('email-template.html', 'utf8');

// Replace placeholders
emailHTML = emailHTML
  .replace(/{{SCRIPT_URL}}/g, 'YOUR_SCRIPT_URL')
  .replace(/{{CUSTOMER_ID}}/g, customer.id)
  .replace(/{{CUSTOMER_EMAIL}}/g, customer.email);

// Send email
const transporter = nodemailer.createTransport({ /* config */ });
await transporter.sendMail({
  from: 'yourcompany@example.com',
  to: customer.email,
  subject: 'How was your installation experience?',
  html: emailHTML
});
```

### Set Up Automatic Reminders

If a customer doesn't respond within 7 days, you could send a follow-up. Store sent emails in a separate sheet and use Apps Script triggers.

## 📈 Best Practices

### Timing
- **B2B Software**: Send 1-2 weeks after installation
- **E-commerce**: Send 1-3 days after delivery
- **Services**: Send immediately after completion

### Email Subject Lines
- ✅ "Quick question about your experience"
- ✅ "How did we do?"
- ✅ "Your feedback matters to us"
- ❌ "NPS Survey" (too formal)
- ❌ "Please rate us" (sounds desperate)

### Follow-Up Actions
- **Promoters (9-10)**: Ask for a review or referral
- **Passives (7-8)**: Ask what would make them a 10
- **Detractors (0-6)**: Reach out personally to resolve issues

### Response Rate Tips
- Keep it simple (one-click is key!)
- Send at the right time (not too early or too late)
- Personalize the email
- Make it mobile-friendly (our template already is!)
- Send from a real person (not noreply@)

## 🐛 Troubleshooting

### "Script has not been deployed as a web app"
- Make sure you deployed the script (see Step 1.3)
- Ensure "Who has access" is set to "Anyone"

### Responses not showing up
- Check that you copied the Web App URL correctly
- Open the Apps Script logs: Extensions > Apps Script > Executions
- Make sure the sheet name matches (default: "NPS Responses")

### Thank you page not loading
- The built-in thank you page should work automatically
- If customizing, ensure your HTML page is publicly accessible

### Email looks broken
- Some email clients block external CSS
- Our template uses inline styles to avoid this
- Test with Gmail, Outlook, and Apple Mail

## 💰 Cost Comparison

| Solution | Cost | Responses/Month |
|----------|------|-----------------|
| **This Solution** | **$0** | **Unlimited** |
| HubSpot NPS Add-on | $50-100/mo | Varies |
| SurveyMonkey | $25-75/mo | Limited |
| Typeform | $25-70/mo | Limited |
| Delighted | $49-249/mo | 500-10,000 |

## 🤝 Support

If you need help:
1. Check the troubleshooting section
2. Review the Apps Script execution logs
3. Test with a personal email first
4. Make sure all placeholders are replaced

## 📝 License

Free to use and modify for your business!

## 🎉 You're All Set!

Your NPS system is ready to go. Start collecting feedback and improving your customer experience!

**Remember:** The goal isn't just to collect scores—it's to act on the feedback and improve your product/service.

Good luck! 🚀


