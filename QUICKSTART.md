# 🚀 Quick Start Guide (5 Minutes)

Get your free NPS survey running in 5 minutes!

## Step 1: Set Up Google Sheet (2 minutes)

1. **Open [Google Sheets](https://sheets.google.com)** and create a new blank sheet
2. Click **Extensions** > **Apps Script**
3. Copy ALL the code from `google-apps-script.js` and paste it in
4. Click **Save** 💾
5. Click **Deploy** > **New deployment**
   - Click the gear ⚙️ > Choose "Web app"
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**
   - Click **Authorize access** and allow permissions
6. **COPY THE URL** that appears (looks like `https://script.google.com/macros/s/ABC123.../exec`)

## Step 2: Customize Email (1 minute)

1. Open `email-template.html`
2. Find and replace:
   - `{{SCRIPT_URL}}` → Paste your URL from Step 1
   - `{{CUSTOMER_ID}}` → Your customer's ID (e.g., `CUST-12345`)
   - `{{CUSTOMER_EMAIL}}` → Your customer's email

**Example:**

```html
<!-- BEFORE -->
<a href="{{SCRIPT_URL}}?score=10&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}">

<!-- AFTER -->
<a href="https://script.google.com/macros/s/ABC123/exec?score=10&customer=CUST-12345&email=john@example.com">
```

## Step 3: Send Test Email (1 minute)

**Option A: Via Gmail (Easiest)**
1. Open `email-template.html` in your browser
2. Press `Cmd+A` (Mac) or `Ctrl+A` (Windows) to select all
3. Press `Cmd+C` (Mac) or `Ctrl+C` (Windows) to copy
4. Open Gmail and paste into a new email
5. Send to yourself to test!

**Option B: Via Your Email Tool**
1. Import `email-template.html` into your email service (Mailchimp, SendGrid, etc.)
2. Send!

## Step 4: View Results (30 seconds)

1. Go back to your Google Sheet
2. Click **NPS Tools** menu > **Create Dashboard**
3. See your responses in real-time!

---

## ✅ That's It!

You now have a **completely free** NPS survey system.

### What Happens When Customer Clicks?

1. Customer clicks a number (0-10)
2. Response automatically saves to Google Sheet
3. Customer sees a beautiful thank you page
4. You can view your NPS score anytime

### Next Steps

- Read the full [README.md](README.md) for advanced features
- Customize colors and branding
- Set up automated sending (see `send-email-example.js`)

---

## 🆘 Troubleshooting

**Links don't work?**
- Make sure you deployed the script as a Web App
- Check that "Who has access" is set to "Anyone"

**No responses showing up?**
- Verify you copied the Web App URL correctly
- Check: Extensions > Apps Script > Executions for errors

**Email looks broken?**
- The template uses inline styles and works in all email clients
- Test in Gmail first

---

## 💡 Pro Tips

1. **Timing is everything**: Send 7 days after installation for best response rates
2. **Personalize**: Add customer's name to the email
3. **Follow up**: Contact detractors (0-6) personally within 24 hours
4. **Celebrate promoters**: Ask your 9-10 scorers for reviews/referrals

---

**Questions?** Check the full [README.md](README.md) for detailed instructions.

🎉 **Enjoy your free NPS system!**


