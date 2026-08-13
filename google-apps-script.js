/**
 * NPS Survey Response Tracker
 *
 * Writes are POST-only and signed. The Vercel function at
 * https://nps.impressivebatteries.com.au is the only caller; it holds the same
 * shared secret and signs every vote.
 *
 * Setup:
 * 1. Extensions > Apps Script in your Google Sheet
 * 2. Paste this code
 * 3. Project Settings > Script Properties > add NPS_SECRET
 *    (the same value as the NPS_SECRET environment variable in Vercel)
 * 4. Deploy > New deployment > Web app
 *      Execute as:     Me
 *      Who has access: Anyone
 * 5. Put the /exec URL in Vercel as NPS_APPS_SCRIPT_URL
 */

// Configuration
const SHEET_NAME = 'NPS Responses';
const UNSUBSCRIBE_SHEET_NAME = 'Unsubscribes';
const UNSUBSCRIBE_HEADERS = ['Timestamp', 'Email', 'Customer ID', 'Record ID'];

/** How stale a signed vote may be before we reject it as a replay. */
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

const HEADERS = [
  'Timestamp',
  'Score',
  'Customer ID',
  'Email',
  'Category',
  'Date',
  'Time',
  'Record ID',
  'Revisions',
  'Original Score',
];

/**
 * GET is read-only on purpose.
 *
 * Mail security scanners follow links from emails and from the pages those
 * links return. When recording lived behind a GET, scanners submitted votes on
 * customers' behalf — always score 0, because that was the first link in the
 * email. Nothing here may write to the sheet.
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>NPS Survey</title></head>' +
      '<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;' +
      'display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f6f7f9">' +
      '<div style="background:#fff;border-radius:14px;padding:40px;max-width:460px;text-align:center;' +
      'box-shadow:0 6px 28px rgba(20,24,31,.08)">' +
      '<h1 style="font-size:22px;color:#1e2126;margin:0 0 12px">Please use the link in your email</h1>' +
      '<p style="color:#565d68;line-height:1.55;margin:0">Ratings can only be submitted from the buttons ' +
      'in the survey email we sent you.</p>' +
      '</div></body></html>',
  );
}

/**
 * POST is the only way a response gets recorded, and only with a valid
 * signature from the Vercel function.
 */
function doPost(e) {
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('NPS_SECRET');
    if (!secret) {
      Logger.log('NPS_SECRET script property is not set');
      return jsonResponse({ status: 'error', reason: 'not_configured' });
    }

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: 'error', reason: 'empty_body' });
    }

    var body = JSON.parse(e.postData.contents);

    if (!body.ts || Math.abs(Date.now() - Number(body.ts)) > MAX_SIGNATURE_AGE_MS) {
      return jsonResponse({ status: 'error', reason: 'stale' });
    }

    switch (body.action) {
      case 'unsubscribe':
        return handleUnsubscribe(body, secret);
      case 'suppressions':
        return handleSuppressions(body, secret);
      default:
        return handleVote(body, secret);
    }
  } catch (error) {
    Logger.log('doPost error: ' + error.toString());
    return jsonResponse({ status: 'error', reason: 'exception' });
  }
}

function handleVote(body, secret) {
  var score = parseInt(body.score, 10);

  if (isNaN(score) || score < 0 || score > 10) {
    return jsonResponse({ status: 'error', reason: 'invalid_score' });
  }
  if (!body.customer || !body.email) {
    return jsonResponse({ status: 'error', reason: 'incomplete' });
  }

  var canonical = [score, body.customer, body.email, body.record || '', body.ts].join('|');
  if (!signaturesMatch(body.sig, canonical, secret)) {
    Logger.log('Rejected unsigned or mis-signed vote for ' + body.customer);
    return jsonResponse({ status: 'error', reason: 'bad_signature' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockError) {
    return jsonResponse({ status: 'error', reason: 'busy' });
  }

  try {
    // Nothing slow may happen between the write and the reply. The n8n
    // notification used to run here, synchronously and inside the lock, so a
    // webhook that responds only when its workflow finishes held this request
    // open long enough for the caller to time out — the vote saved, but the
    // customer was shown a failure. The survey site fires that webhook now,
    // after it has replied to the customer.
    return jsonResponse(recordResponse(score, body.customer, body.email, body.record || ''));
  } finally {
    lock.releaseLock();
  }
}

/**
 * Record an opt-out. Idempotent — unsubscribing twice is not an error and must
 * never be reported as one.
 *
 * An expired invite token is still honoured upstream, because refusing to stop
 * emailing someone on the grounds that their link is old would be the wrong way
 * round.
 */
function handleUnsubscribe(body, secret) {
  if (!body.email) {
    return jsonResponse({ status: 'error', reason: 'incomplete' });
  }

  var canonical = ['unsubscribe', body.customer || '', body.email, body.record || '', body.ts].join('|');
  if (!signaturesMatch(body.sig, canonical, secret)) {
    Logger.log('Rejected unsigned or mis-signed unsubscribe for ' + body.email);
    return jsonResponse({ status: 'error', reason: 'bad_signature' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockError) {
    return jsonResponse({ status: 'error', reason: 'busy' });
  }

  try {
    var sheet = getOrCreateUnsubscribeSheet();
    var email = body.email.toString().trim();

    if (!findUnsubscribeRow(sheet, email)) {
      sheet.appendRow([new Date().toISOString(), email, body.customer || '', body.record || '']);
    }

    return jsonResponse({ status: 'unsubscribed', email: email });
  } finally {
    lock.releaseLock();
  }
}

/**
 * The suppression list, so the survey site can refuse to mint a rating link for
 * someone who has opted out.
 */
function handleSuppressions(body, secret) {
  if (!signaturesMatch(body.sig, ['suppressions', body.ts].join('|'), secret)) {
    return jsonResponse({ status: 'error', reason: 'bad_signature' });
  }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UNSUBSCRIBE_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({ status: 'ok', emails: [] });
  }

  var values = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  var emails = [];

  for (var i = 0; i < values.length; i++) {
    var email = String(values[i][0] || '').trim().toLowerCase();
    if (email) emails.push(email);
  }

  return jsonResponse({ status: 'ok', emails: emails });
}

function getOrCreateUnsubscribeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(UNSUBSCRIBE_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(UNSUBSCRIBE_SHEET_NAME);
    sheet.appendRow(UNSUBSCRIBE_HEADERS);
    sheet
      .getRange(1, 1, 1, UNSUBSCRIBE_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#e0001a')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function findUnsubscribeRow(sheet, email) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  return sheet
    .getRange(2, 2, lastRow - 1, 1) // column B, Email
    .createTextFinder(email)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();
}

/**
 * Constant-time-ish comparison of the request signature against our own.
 * Utilities.base64EncodeWebSafe pads with '='; Node's base64url does not.
 */
function signaturesMatch(provided, canonical, secret) {
  if (!provided) return false;
  var raw = Utilities.computeHmacSha256Signature(canonical, secret);
  var expected = Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
  if (provided.length !== expected.length) return false;

  var diff = 0;
  for (var i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Record a response, or revise the customer's existing one.
 *
 * We deliberately do not lock a customer out after their first vote. The old
 * behaviour meant a stray automated vote could never be corrected — the
 * customer clicked 9, got told they'd already answered 0, and gave up. Since
 * writes now require a signed POST, a second vote is a real person changing
 * their mind, so it replaces the first and we keep a count.
 */
function recordResponse(score, customerId, email, recordId) {
  var sheet = getOrCreateSheet();
  var category = getCategory(score);
  var now = new Date();
  var timestamp = now.toISOString();
  var date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var time = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');

  var existing = findExistingRow(sheet, recordId, email);

  if (existing) {
    var previousScore = existing.score;
    var revisions = Number(existing.revisions || 0) + 1;
    var originalScore = existing.originalScore === '' ? previousScore : existing.originalScore;

    sheet
      .getRange(existing.row, 1, 1, HEADERS.length)
      .setValues([
        [timestamp, score, customerId, email, category, date, time, recordId, revisions, originalScore],
      ]);

    return {
      status: 'revised',
      score: score,
      category: category,
      previousScore: previousScore,
      revisions: revisions,
    };
  }

  sheet.appendRow([timestamp, score, customerId, email, category, date, time, recordId, 0, '']);
  return { status: 'recorded', score: score, category: category };
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    return sheet;
  }

  // Widen older sheets that predate the revision columns.
  if (sheet.getLastColumn() < HEADERS.length) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('#ffffff');
  }

  return sheet;
}

/**
 * Find this customer's existing response. Record ID wins when present,
 * because one person can hold several deals; email is the fallback.
 */
function findExistingRow(sheet, recordId, email) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  // TextFinder searches on Google's side. Pulling every row across the wire to
  // find one cell is the single slowest thing this script used to do, and it
  // got slower with every response recorded — the customer waits on it.
  var match = null;

  if (recordId) {
    match = sheet
      .getRange(2, 8, lastRow - 1, 1) // column H, Record ID
      .createTextFinder(recordId.toString())
      .matchEntireCell(true)
      .findNext();
  } else if (email) {
    match = sheet
      .getRange(2, 4, lastRow - 1, 1) // column D, Email
      .createTextFinder(email)
      .matchEntireCell(true)
      .matchCase(false)
      .findNext();
  }

  if (!match) return null;

  var row = match.getRow();
  var values = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];

  return { row: row, score: values[1], revisions: values[8], originalScore: values[9] };
}

function getCategory(score) {
  score = parseInt(score, 10);
  if (score >= 9) return 'Promoter';
  if (score >= 7) return 'Passive';
  return 'Detractor';
}

/**
 * Calculate NPS Score
 * Run this function manually to see your current NPS
 */
function calculateNPS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log('No responses yet!');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var promoters = 0;
  var passives = 0;
  var detractors = 0;

  for (var i = 1; i < data.length; i++) {
    var category = data[i][4];
    if (category === 'Promoter') promoters++;
    else if (category === 'Passive') passives++;
    else if (category === 'Detractor') detractors++;
  }

  var total = promoters + passives + detractors;

  if (total === 0) {
    Logger.log('No responses yet!');
    return;
  }

  var npsScore = ((promoters - detractors) / total) * 100;

  Logger.log('=== NPS REPORT ===');
  Logger.log('Total Responses: ' + total);
  Logger.log('Promoters (9-10): ' + promoters);
  Logger.log('Passives (7-8): ' + passives);
  Logger.log('Detractors (0-6): ' + detractors);
  Logger.log('NPS Score: ' + npsScore.toFixed(1));

  try {
    SpreadsheetApp.getUi().alert(
      'NPS Report',
      'Total Responses: ' +
        total +
        '\n\nPromoters (9-10): ' +
        promoters +
        ' (' +
        ((promoters / total) * 100).toFixed(1) +
        '%)\nPassives (7-8): ' +
        passives +
        ' (' +
        ((passives / total) * 100).toFixed(1) +
        '%)\nDetractors (0-6): ' +
        detractors +
        ' (' +
        ((detractors / total) * 100).toFixed(1) +
        '%)\n\nNPS Score: ' +
        npsScore.toFixed(1),
      SpreadsheetApp.getUi().ButtonSet.OK,
    );
  } catch (e) {
    // Running from the script editor, no UI available.
  }

  return npsScore;
}

/**
 * Create a dashboard sheet with NPS metrics
 */
function createDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dashboardSheet = ss.getSheetByName('NPS Dashboard');

  if (!dashboardSheet) {
    dashboardSheet = ss.insertSheet('NPS Dashboard', 0);
  } else {
    dashboardSheet.clear();
  }

  var responseSheet = ss.getSheetByName(SHEET_NAME);
  if (!responseSheet) {
    dashboardSheet
      .getRange('A1')
      .setValue('No responses yet! The dashboard will appear after your first response.');
    return;
  }

  dashboardSheet.getRange('A1').setValue('NPS Dashboard').setFontSize(18).setFontWeight('bold');
  dashboardSheet.getRange('A3').setValue('Summary Metrics').setFontWeight('bold').setFontSize(14);

  dashboardSheet.getRange('A5').setValue('Total Responses:');
  dashboardSheet.getRange('B5').setFormula("=COUNTA('" + SHEET_NAME + "'!A2:A)");

  dashboardSheet.getRange('A6').setValue('Promoters (9-10):');
  dashboardSheet.getRange('B6').setFormula("=COUNTIF('" + SHEET_NAME + "'!E2:E,\"Promoter\")");
  dashboardSheet.getRange('C6').setFormula('=IF(B5>0,B6/B5,0)').setNumberFormat('0.0%');

  dashboardSheet.getRange('A7').setValue('Passives (7-8):');
  dashboardSheet.getRange('B7').setFormula("=COUNTIF('" + SHEET_NAME + "'!E2:E,\"Passive\")");
  dashboardSheet.getRange('C7').setFormula('=IF(B5>0,B7/B5,0)').setNumberFormat('0.0%');

  dashboardSheet.getRange('A8').setValue('Detractors (0-6):');
  dashboardSheet.getRange('B8').setFormula("=COUNTIF('" + SHEET_NAME + "'!E2:E,\"Detractor\")");
  dashboardSheet.getRange('C8').setFormula('=IF(B5>0,B8/B5,0)').setNumberFormat('0.0%');

  dashboardSheet.getRange('A10').setValue('NPS Score:').setFontWeight('bold').setFontSize(14);
  dashboardSheet
    .getRange('B10')
    .setFormula('=IF(B5>0,(B6-B8)/B5*100,0)')
    .setNumberFormat('0.0')
    .setFontWeight('bold')
    .setFontSize(14);

  dashboardSheet.getRange('A12').setValue('Revised Responses:');
  dashboardSheet.getRange('B12').setFormula("=COUNTIF('" + SHEET_NAME + "'!I2:I,\">0\")");

  dashboardSheet.setColumnWidth(1, 200);
  dashboardSheet.setColumnWidth(2, 100);
  dashboardSheet.setColumnWidth(3, 100);

  var chart = dashboardSheet
    .newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dashboardSheet.getRange('A6:B8'))
    .setPosition(14, 1, 0, 0)
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
  SpreadsheetApp.getUi()
    .createMenu('NPS Tools')
    .addItem('Calculate NPS', 'calculateNPS')
    .addItem('Create Dashboard', 'createDashboard')
    .addSeparator()
    .addItem('Setup Instructions', 'showSetupInstructions')
    .addToUi();
}

function showSetupInstructions() {
  SpreadsheetApp.getUi().alert(
    'Setup Instructions',
    '1. Project Settings > Script Properties:\n' +
      '   Add NPS_SECRET (same value as in Vercel)\n\n' +
      '2. Deploy > New deployment > Web app\n' +
      '   Execute as: Me\n' +
      '   Who has access: Anyone\n\n' +
      '3. Copy the /exec URL into Vercel as NPS_APPS_SCRIPT_URL\n\n' +
      'Responses are only accepted as signed POSTs from the survey site.',
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}
