/**
 * NPS Survey Response Tracker
 * 
 * This Google Apps Script receives NPS ratings from email links and stores them in a Google Sheet.
 * 
 * Setup Instructions:
 * 1. Create a new Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Paste this code
 * 4. Deploy as Web App (Deploy > New deployment > Web app)
 * 5. Set "Execute as" to "Me"
 * 6. Set "Who has access" to "Anyone"
 * 7. Copy the deployment URL and use it in your email template as {{SCRIPT_URL}}
 */

// Configuration
const SHEET_NAME = 'NPS Responses';
const THANK_YOU_URL = 'https://your-domain.com/thank-you.html'; // Update this with your thank you page URL

/**
 * Handle GET requests (when customer clicks a rating link)
 */
function doGet(e) {
  try {
    // Get parameters from URL
    const scoreParam = e.parameter.score;
    const customerId = e.parameter.customer;
    const email = e.parameter.email;
    const recordId = e.parameter.record || ''; // HubSpot Record/Deal ID (optional)
    
    // Validate and convert score to integer
    const score = parseInt(scoreParam);
    if (isNaN(score) || score < 0 || score > 10) {
      return ContentService.createTextOutput('Invalid score').setMimeType(ContentService.MimeType.TEXT);
    }
    
    // Record the response
    recordResponse(score, customerId, email, recordId);
    
    // Redirect to thank you page with the score
    const redirectUrl = `${THANK_YOU_URL}?score=${score}`;
    
    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Thank You!</title>
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
              font-size: 32px;
              margin: 0 0 20px 0;
            }
            p {
              color: #666;
              font-size: 18px;
              line-height: 1.6;
              margin: 0;
            }
            .emoji {
              font-size: 64px;
              margin-bottom: 20px;
            }
            .score {
              display: inline-block;
              background: #e0001a;
              color: white;
              padding: 8px 16px;
              border-radius: 20px;
              font-weight: 600;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">${getEmojiForScore(score)}</div>
            <h1>Thank you for your feedback!</h1>
            <div class="score">You rated us: ${score}/10</div>
            <p>We really appreciate you taking the time to share your experience with us.</p>
            ${score < 7 ? '<p style="margin-top: 20px;">We\'re sorry we didn\'t meet your expectations. We\'ll work hard to improve!</p>' : ''}
            ${score >= 9 ? '<p style="margin-top: 20px;">We\'re thrilled you had a great experience! 🎉</p>' : ''}
          </div>
        </body>
      </html>
    `);
    
  } catch (error) {
    Logger.log('Error: ' + error.toString());
    return ContentService.createTextOutput('Error processing request').setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Record the NPS response in the spreadsheet
 */
function recordResponse(score, customerId, email, recordId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Add headers
    sheet.appendRow(['Timestamp', 'Score', 'Customer ID', 'Email', 'Category', 'Date', 'Time', 'Record ID']);
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  
  // Determine NPS category
  const category = getCategory(score);
  
  // Get timestamp
  const now = new Date();
  const timestamp = now.toISOString();
  const date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const time = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');
  
  // Add the response
  sheet.appendRow([timestamp, score, customerId, email, category, date, time, recordId]);
  
  // Auto-resize columns
  sheet.autoResizeColumns(1, 8);
}

/**
 * Get NPS category based on score
 */
function getCategory(score) {
  score = parseInt(score);
  if (score >= 9) return 'Promoter';
  if (score >= 7) return 'Passive';
  return 'Detractor';
}

/**
 * Get emoji based on score
 */
function getEmojiForScore(score) {
  score = parseInt(score);
  if (score >= 9) return '🌟';
  if (score >= 7) return '😊';
  if (score >= 5) return '😐';
  return '😞';
}

/**
 * Calculate NPS Score
 * Run this function manually to see your current NPS
 */
function calculateNPS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    Logger.log('No responses yet!');
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  
  // Skip header row
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  
  for (let i = 1; i < data.length; i++) {
    const category = data[i][4]; // Category column
    if (category === 'Promoter') promoters++;
    else if (category === 'Passive') passives++;
    else if (category === 'Detractor') detractors++;
  }
  
  const total = promoters + passives + detractors;
  
  if (total === 0) {
    Logger.log('No responses yet!');
    return;
  }
  
  const npsScore = ((promoters - detractors) / total) * 100;
  
  Logger.log('=== NPS REPORT ===');
  Logger.log('Total Responses: ' + total);
  Logger.log('Promoters (9-10): ' + promoters + ' (' + ((promoters/total)*100).toFixed(1) + '%)');
  Logger.log('Passives (7-8): ' + passives + ' (' + ((passives/total)*100).toFixed(1) + '%)');
  Logger.log('Detractors (0-6): ' + detractors + ' (' + ((detractors/total)*100).toFixed(1) + '%)');
  Logger.log('NPS Score: ' + npsScore.toFixed(1));
  Logger.log('==================');
  
  // Also show in a dialog if running from UI
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('NPS Report',
      `Total Responses: ${total}\n\n` +
      `Promoters (9-10): ${promoters} (${((promoters/total)*100).toFixed(1)}%)\n` +
      `Passives (7-8): ${passives} (${((passives/total)*100).toFixed(1)}%)\n` +
      `Detractors (0-6): ${detractors} (${((detractors/total)*100).toFixed(1)}%)\n\n` +
      `📊 NPS Score: ${npsScore.toFixed(1)}`,
      ui.ButtonSet.OK);
  } catch (e) {
    // Running from script editor
  }
  
  return npsScore;
}

/**
 * Create a dashboard sheet with NPS metrics
 */
function createDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let dashboardSheet = ss.getSheetByName('NPS Dashboard');
  
  // Create dashboard if it doesn't exist
  if (!dashboardSheet) {
    dashboardSheet = ss.insertSheet('NPS Dashboard', 0);
  } else {
    dashboardSheet.clear();
  }
  
  const responseSheet = ss.getSheetByName(SHEET_NAME);
  if (!responseSheet) {
    dashboardSheet.getRange('A1').setValue('No responses yet! The dashboard will appear after you receive your first response.');
    return;
  }
  
  // Title
  dashboardSheet.getRange('A1').setValue('NPS Dashboard').setFontSize(18).setFontWeight('bold');
  
  // Summary metrics
  dashboardSheet.getRange('A3').setValue('Summary Metrics').setFontWeight('bold').setFontSize(14);
  
  // Total responses
  dashboardSheet.getRange('A5').setValue('Total Responses:');
  dashboardSheet.getRange('B5').setFormula(`=COUNTA('${SHEET_NAME}'!A2:A)-1`);
  
  // Promoters
  dashboardSheet.getRange('A6').setValue('Promoters (9-10):');
  dashboardSheet.getRange('B6').setFormula(`=COUNTIF('${SHEET_NAME}'!E2:E,"Promoter")`);
  dashboardSheet.getRange('C6').setFormula(`=IF(B5>0,B6/B5,0)`).setNumberFormat('0.0%');
  
  // Passives
  dashboardSheet.getRange('A7').setValue('Passives (7-8):');
  dashboardSheet.getRange('B7').setFormula(`=COUNTIF('${SHEET_NAME}'!E2:E,"Passive")`);
  dashboardSheet.getRange('C7').setFormula(`=IF(B5>0,B7/B5,0)`).setNumberFormat('0.0%');
  
  // Detractors
  dashboardSheet.getRange('A8').setValue('Detractors (0-6):');
  dashboardSheet.getRange('B8').setFormula(`=COUNTIF('${SHEET_NAME}'!E2:E,"Detractor")`);
  dashboardSheet.getRange('C8').setFormula(`=IF(B5>0,B8/B5,0)`).setNumberFormat('0.0%');
  
  // NPS Score
  dashboardSheet.getRange('A10').setValue('NPS Score:').setFontWeight('bold').setFontSize(14);
  dashboardSheet.getRange('B10').setFormula('=IF(B5>0,(B6-B8)/B5*100,0)').setNumberFormat('0.0').setFontWeight('bold').setFontSize(14);
  
  // Format
  dashboardSheet.setColumnWidth(1, 200);
  dashboardSheet.setColumnWidth(2, 100);
  dashboardSheet.setColumnWidth(3, 100);
  
  // Add chart
  const chartRange = dashboardSheet.getRange('A6:B8');
  const chart = dashboardSheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(chartRange)
    .setPosition(12, 1, 0, 0)
    .setOption('title', 'Response Distribution')
    .setOption('width', 400)
    .setOption('height', 300)
    .setOption('colors', ['#34A853', '#FBBC04', '#EA4335'])
    .build();
  
  dashboardSheet.insertChart(chart);
  
  SpreadsheetApp.getUi().alert('Dashboard created successfully!');
}

/**
 * Add custom menu to Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('NPS Tools')
    .addItem('Calculate NPS', 'calculateNPS')
    .addItem('Create Dashboard', 'createDashboard')
    .addSeparator()
    .addItem('Setup Instructions', 'showSetupInstructions')
    .addToUi();
}

/**
 * Show setup instructions
 */
function showSetupInstructions() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Setup Instructions',
    '1. Deploy this script as a Web App:\n' +
    '   • Click "Deploy" > "New deployment"\n' +
    '   • Select "Web app" type\n' +
    '   • Set "Execute as" to "Me"\n' +
    '   • Set "Who has access" to "Anyone"\n' +
    '   • Click "Deploy" and copy the URL\n\n' +
    '2. Update your email template:\n' +
    '   • Replace {{SCRIPT_URL}} with your deployment URL\n' +
    '   • Replace {{CUSTOMER_ID}} with actual customer IDs\n' +
    '   • Replace {{CUSTOMER_EMAIL}} with actual emails\n\n' +
    '3. Send emails to your customers!\n\n' +
    '4. Use "NPS Tools" menu to view your results',
    ui.ButtonSet.OK);
}


