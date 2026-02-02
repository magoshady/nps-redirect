// Vercel Serverless Function for NPS Redirect
// This handles the redirect server-side, which works with Outlook

export default function handler(req, res) {
  // Get parameters from URL
  const { score, customer, email, record, confirm } = req.query;
  
  // Validate parameters
  if (!score || !customer || !email) {
    // Return error page if parameters are missing
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invalid Link</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #ffe5e8 0%, #fff9fa 100%);
          }
          .container {
            background: white;
            padding: 60px 40px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 500px;
          }
          h1 {
            color: #333;
            font-size: 24px;
            margin: 0 0 20px 0;
          }
          p {
            color: #666;
            font-size: 16px;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Invalid Link</h1>
          <p>Please use the link from your email.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  // Build redirect URL to Google Apps Script
  const scriptUrl = 'https://script.google.com/macros/s/AKfycby0Ou-QXI1unShZiRoQUVAqbRn6PZFsgwkvV-df0kLIrm8nizaeZc6VpAJf-SJvt6wahQ/exec';
  let redirectUrl = `${scriptUrl}?score=${encodeURIComponent(score)}&customer=${encodeURIComponent(customer)}&email=${encodeURIComponent(email)}`;
  
  // Add record ID if provided
  if (record) {
    redirectUrl += `&record=${encodeURIComponent(record)}`;
  }

  // If user confirmed, redirect to Apps Script
  if (confirm === '1' || confirm === 'true') {
    res.redirect(302, redirectUrl);
    return;
  }

  // Otherwise show a confirmation page to avoid accidental clicks
  const confirmUrl = `/api/redirect?score=${encodeURIComponent(score)}&customer=${encodeURIComponent(customer)}&email=${encodeURIComponent(email)}${record ? `&record=${encodeURIComponent(record)}` : ''}&confirm=1`;

  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirm Your Rating</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #ffe5e8 0%, #fff9fa 100%);
        }
        .container {
          background: white;
          padding: 60px 40px;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          text-align: center;
          max-width: 520px;
        }
        h1 {
          color: #333;
          font-size: 28px;
          margin: 0 0 12px 0;
        }
        p {
          color: #666;
          font-size: 16px;
          margin: 8px 0;
          line-height: 1.5;
        }
        .score {
          display: inline-block;
          background: #e0001a;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          margin: 16px 0 8px 0;
        }
        .actions {
          margin-top: 20px;
        }
        .btn {
          display: inline-block;
          background: #e0001a;
          color: white;
          text-decoration: none;
          padding: 12px 20px;
          border-radius: 8px;
          font-weight: 600;
        }
        .note {
          font-size: 14px;
          color: #999;
          margin-top: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Confirm your rating</h1>
        <div class="score">You selected: ${score}/10</div>
        <p>Tap confirm to submit your response.</p>
        <div class="actions">
          <a class="btn" href="${confirmUrl}">Confirm rating</a>
        </div>
        <p class="note">If this isn’t right, close this page and click a different number in the email.</p>
      </div>
    </body>
    </html>
  `);
}

