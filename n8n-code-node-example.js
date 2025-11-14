/**
 * n8n Code Node - Prepare NPS Email
 * 
 * This goes in the "Code" node in your n8n workflow
 * Copy and paste this entire code into n8n
 */

// ============================================
// STEP 1: Get customer data from previous node
// ============================================

const customerId = $input.first().json.customer_id;
const customerEmail = $input.first().json.customer_email;
const customerName = $input.first().json.customer_name || 'there'; // fallback to "there" if no name
const recordId = $input.first().json.record_id; // HubSpot Record/Deal ID

// ============================================
// STEP 2: Your email template HTML
// ============================================

// OPTION A: Paste the entire email-template.html content here
// Open email-template.html, copy ALL of it, and paste between the backticks below
const emailTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>How likely are you to recommend us?</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
    
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td style="padding: 40px 20px;">
                
                <!-- Main Container -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #333333; line-height: 1.4;">
                                How likely are you to recommend us to a friend or colleague?
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Subtitle -->
                    <tr>
                        <td style="padding: 0 40px 30px; text-align: center;">
                            <p style="margin: 0; font-size: 16px; color: #666666; line-height: 1.5;">
                                We'd love to hear your feedback about your recent installation experience.
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Rating Scale -->
                    <tr>
                        <td style="padding: 0 20px 20px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; margin: 0 auto;">
                                <tr>
                                    <td align="center">
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=0&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">0</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=1&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">1</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=2&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">2</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=3&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">3</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=4&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">4</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=5&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">5</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=6&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">6</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=7&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">7</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=8&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">8</a>
                                           <a href="https://nps-redirect.vercel.app/api/redirect?score=9&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">9</a>
                                        <a href="https://nps-redirect.vercel.app/api/redirect?score=10&customer={{CUSTOMER_ID}}&email={{CUSTOMER_EMAIL}}" style="display: inline-block; width: 38px; height: 38px; margin: 3px; background-color: #e0001a; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; color: #ffffff; line-height: 38px; text-align: center;">10</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Labels -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="text-align: left; font-size: 12px; color: #999999;">
                                        Not likely at all
                                    </td>
                                    <td style="text-align: right; font-size: 12px; color: #999999;">
                                        Extremely likely
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #f9f9f9; border-top: 1px solid #eeeeee; border-radius: 0 0 8px 8px;">
                            <p style="margin: 0; font-size: 14px; color: #999999; text-align: center; line-height: 1.5;">
                                This should only take a moment. Thank you for your time!
                            </p>
                        </td>
                    </tr>
                    
                </table>
                
            </td>
        </tr>
    </table>
    
</body>
</html>
`;

// ============================================
// STEP 3: Replace placeholders with actual customer data
// ============================================

let emailHtml = emailTemplate;

// Replace {{CUSTOMER_ID}} with actual customer ID (URL encoded)
emailHtml = emailHtml.replace(/\{\{CUSTOMER_ID\}\}/g, encodeURIComponent(customerId));

// Replace {{CUSTOMER_EMAIL}} with actual customer email (URL encoded)
emailHtml = emailHtml.replace(/\{\{CUSTOMER_EMAIL\}\}/g, encodeURIComponent(customerEmail));

// Replace {{RECORD_ID}} with actual HubSpot record ID (URL encoded)
emailHtml = emailHtml.replace(/\{\{RECORD_ID\}\}/g, encodeURIComponent(recordId));

// Optional: If you add {{CUSTOMER_NAME}} to your template
emailHtml = emailHtml.replace(/\{\{CUSTOMER_NAME\}\}/g, customerName);

// ============================================
// STEP 4: Return the prepared email
// ============================================

return {
  json: {
    to: customerEmail,
    from: 'support@impressivebatteries.com.au', // Change this to your email
    fromName: 'Impressive Electrical', // Change this to your company name
    subject: 'How was your installation experience?',
    html: emailHtml,
    // These fields are for tracking/debugging
    customerId: customerId,
    timestamp: new Date().toISOString()
  }
};

// ============================================
// NOTES:
// ============================================

// The output of this node will be:
// {
//   "to": "customer@example.com",
//   "from": "support@yourcompany.com",
//   "subject": "How was your installation experience?",
//   "html": "[full HTML with replaced placeholders]",
//   "customerId": "DEAL-12345",
//   "timestamp": "2024-11-14T10:30:00.000Z"
// }

// You can then use these fields in the next node (Send Email node):
// - To: {{ $json.to }}
// - From: {{ $json.from }}
// - Subject: {{ $json.subject }}
// - Body (HTML): {{ $json.html }}

