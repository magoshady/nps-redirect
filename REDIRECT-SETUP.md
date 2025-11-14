# 🔗 NPS Redirect Setup Guide

This guide will help you set up the redirect page on your domain to fix the Gmail link issue.

---

## 🎯 What This Solves

Gmail was modifying your Google Apps Script URLs (adding `/u/3/`), breaking the links for everyone. By using your own domain as an intermediary, Gmail won't interfere with the links.

---

## 📋 Step-by-Step Setup

### Step 1: Upload the Redirect Page (5 minutes)

1. **Get the file:** `nps-redirect.html` (already created in this folder)

2. **Upload to your website:**
   - Upload `nps-redirect.html` to your website root directory
   - The file should be accessible at: `https://yimpressivebatteries.com.au/nps-redirect.html`

3. **How to upload (depends on your hosting):**

   **Option A: cPanel/File Manager**
   - Log into your hosting cPanel
   - Go to File Manager
   - Navigate to `public_html` (or `www`)
   - Upload `nps-redirect.html`

   **Option B: FTP**
   - Use an FTP client (like FileZilla)
   - Connect to your website
   - Upload to the root directory

   **Option C: Website Builder**
   - If using WordPress/Wix/Squarespace, you might need to create a custom page
   - Copy the HTML from `nps-redirect.html`
   - Create a new page and paste the HTML

---

### Step 2: Test the Redirect (2 minutes)

**Test URL:**
```
https://yimpressivebatteries.com.au/nps-redirect.html?score=5&customer=TEST-123&email=test@example.com
```

**What should happen:**
1. You'll see a brief "Submitting your feedback..." message with a loading spinner
2. You'll be instantly redirected to your Google Apps Script
3. You'll see the thank you page with "You rated us: 5/10"
4. A new row appears in your Google Sheet

**If you see "Invalid Link":**
- The URL parameters are missing
- Make sure you include `?score=X&customer=Y&email=Z`

**If the page doesn't load at all:**
- The file isn't uploaded correctly
- Check the file is at the correct URL
- Check file permissions (should be 644 or public readable)

---

### Step 3: Update Your n8n Workflow (2 minutes)

1. **Go to your n8n workflow**
2. **Click on the Code node**
3. **Copy the ENTIRE updated code** from `n8n-code-node-example.js`
4. **Paste it** into the Code node (replace everything)
5. **Save** the workflow

**The new email links will now use:**
```
https://yimpressivebatteries.com.au/nps-redirect.html?score=X&customer=...
```

Instead of:
```
https://script.google.com/macros/s/.../exec?score=X&customer=...
```

---

### Step 4: Test the Full Flow (5 minutes)

1. **Trigger your n8n workflow** (create a test deal in HubSpot or manually execute)
2. **Check the email** you receive
3. **Click on a number** (any number 0-10)
4. **Verify:**
   - ✅ You see the loading page briefly
   - ✅ You're redirected to the thank you page
   - ✅ The response appears in your Google Sheet
   - ✅ NO Gmail errors or Drive errors!

---

## 🎉 Success Checklist

- [ ] `nps-redirect.html` uploaded to your website
- [ ] Redirect page accessible at `https://yimpressivebatteries.com.au/nps-redirect.html`
- [ ] Test URL works (redirects to thank you page)
- [ ] n8n Code node updated with new template
- [ ] Test email sent and received
- [ ] Links in email work when clicked
- [ ] Response recorded in Google Sheet
- [ ] Boss can click the links successfully! 😊

---

## 🔧 Troubleshooting

### "Page not found" when clicking the test URL
**Problem:** File not uploaded or wrong location  
**Solution:** 
- Check the file is at the website root (not in a subfolder)
- Try accessing: `https://yimpressivebatteries.com.au/nps-redirect.html` directly
- Check file permissions (644)

### "Invalid Link" message appears
**Problem:** Missing URL parameters  
**Solution:** 
- The URL must include `?score=X&customer=Y&email=Z`
- Check the email template has the correct URL format

### Redirect happens but Google Script shows "Invalid score"
**Problem:** Google Apps Script not updated  
**Solution:**
- Go back to Google Sheets → Extensions → Apps Script
- Make sure you have the `parseInt(scoreParam)` fix
- Redeploy with "New version"

### Links still don't work for some email clients
**Problem:** Some email clients might still have issues  
**Solution:**
- Make sure the redirect page uses `window.location.replace()` (it does)
- Try adding a meta refresh as backup (I can add this if needed)

---

## 🌐 Alternative Domains

If you want to use a different subdomain or path:

**Option 1: Subdomain**
```
https://feedback.yimpressivebatteries.com.au/nps.html
```

**Option 2: Subfolder**
```
https://yimpressivebatteries.com.au/feedback/nps-redirect.html
```

**Just update the URL in:**
1. `email-template.html` 
2. `n8n-code-node-example.js`
3. Upload the redirect file to that location

---

## 📝 How It Works

```
Customer clicks number in email
         ↓
Email link: https://yimpressivebatteries.com.au/nps-redirect.html?score=5&customer=...
         ↓
Your redirect page loads (shows loading spinner)
         ↓
JavaScript extracts the parameters
         ↓
Redirects to: https://script.google.com/macros/s/.../exec?score=5&customer=...
         ↓
Google Apps Script processes the response
         ↓
Shows thank you page + saves to Google Sheet
         ↓
Success! 🎉
```

**Key benefit:** Gmail never sees the `script.google.com` URL, so it can't modify it!

---

## ✨ Bonus: Making It Even Better

### Add your own branded thank you page
Instead of redirecting to Google Apps Script, you could:
1. Show your own thank you page
2. Use JavaScript to POST the data to Google Apps Script in the background
3. Fully branded experience with your logo and colors

Want me to create this enhanced version? Let me know!

---

## 🆘 Need Help?

If you run into any issues:
1. Check the file is uploaded correctly
2. Test the URL directly in your browser
3. Check the browser console for JavaScript errors (F12 → Console tab)
4. Verify the Google Apps Script is deployed correctly

---

**Once you've uploaded the file and tested it, let me know and we'll do a final end-to-end test!** 🚀

