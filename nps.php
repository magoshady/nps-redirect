<?php
/**
 * NPS Survey Redirect
 * 
 * This file redirects to Google Apps Script with the survey parameters.
 * Upload this file to your website root: public_html/nps.php
 * 
 * URL: https://www.impressiveelectrical.com.au/nps.php?score=X&customer=Y&email=Z
 */

// Get parameters from URL
$score = isset($_GET['score']) ? $_GET['score'] : '';
$customer = isset($_GET['customer']) ? $_GET['customer'] : '';
$email = isset($_GET['email']) ? $_GET['email'] : '';

// Validate parameters
if (empty($score) || empty($customer) || empty($email)) {
    // Show error if parameters are missing
    echo '<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Invalid Link</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
    </html>';
    exit;
}

// Google Apps Script URL
$scriptUrl = 'https://script.google.com/macros/s/AKfycby0Ou-QXI1unShZiRoQUVAqbRn6PZFsgwkvV-df0kLIrm8nizaeZc6VpAJf-SJvt6wahQ/exec';

// Build redirect URL with parameters
$redirectUrl = $scriptUrl . '?score=' . urlencode($score) . '&customer=' . urlencode($customer) . '&email=' . urlencode($email);

// Redirect to Google Apps Script
header('Location: ' . $redirectUrl);
exit;
?>

