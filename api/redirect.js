// Vercel Serverless Function for NPS Redirect
// This handles the redirect server-side, which works with Outlook

export default function handler(req, res) {
  // Get parameters from URL
  const { score, customer, email } = req.query;
  
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
  const redirectUrl = `${scriptUrl}?score=${encodeURIComponent(score)}&customer=${encodeURIComponent(customer)}&email=${encodeURIComponent(email)}`;
  
  // Server-side redirect (works with Outlook!)
  res.redirect(302, redirectUrl);
}

