/**
 * FATUWR Training Portal — Google Apps Script
 * Version: v1
 * Last updated: 2026-04-15
 * Sheet ID: 19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM
 *
 * Column layout matches server/googleSheets.ts exactly so reads and writes stay in sync.
 *
 * Training Sessions tab columns (0-indexed):
 *   [0]  Training Date
 *   [1]  Day
 *   [2]  Training Time
 *   [3]  Pool
 *   [4]  Pool Image URL
 *   [5]  Member Fee
 *   [6]  Non-Member Fee
 *   [7]  Member Swim Fee
 *   [8]  Non-Member Swim Fee
 *   [9]  Student Fee
 *   [10] Student Swim Fee
 *   [11] Trainer Fee
 *   [12] Notes
 *   [13] Row ID
 *   [14] Attendance
 *   [15] Close? (isClosed — non-empty = session closed)
 *   [16] Training Objective
 *   [17] (unused)
 *   [18] (unused)
 *   [19] Sign-Up Close Time
 *
 * Training Sign-ups tab columns (0-indexed):
 *   [0]  Name
 *   [1]  Email
 *   [2]  Payment ID
 *   [3]  DateTime Signed Up
 *   [4]  Pool
 *   [5]  Date of Training
 *   [6]  Activity
 *   [7]  Activity Value
 *   [8]  Base Fee
 *   [9]  Actual Fee
 *   [10] Member on Training Date
 *
 * User tab columns (0-indexed):
 *   [0]  ID
 *   [1]  Name
 *   [2]  User Email (col C)
 *   [3]  Email (col D)
 *   [4]  Image
 *   [5]  (empty)
 *   [6]  (empty)
 *   [7]  Payment ID
 *   [8]  Membership Status
 *   [9]  Club Role
 *   [10] Trial Start Date
 *   [11] Trial End Date
 *   [12] Student Start Date
 */
var SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
var TAB_SESSIONS = "Training Sessions";
var TAB_SIGNUPS  = "Training Sign-ups";
var TAB_USERS    = "User";
var TAB_PAYMENTS  = "Payments";
var MAYBANK_LABEL = "Maybank"; // ← must exactly match your Gmail label name
var PROCESSED_KEY = "processedMaybankIds";
// ─── Entry points ─────────────────────────────────────────────────────────────
function doGet(e) {
  return jsonResponse({ status: "ok", message: "FATUWR GAS v1 running" });
}
function doPost(e) {

  try {
    var params = JSON.parse(e.postData.contents);  // ← existing line, don't touch
    // ↓ PASTE THESE 5 LINES RIGHT HERE ↓
    var SCRIPT_SECRET = PropertiesService.getScriptProperties().getProperty("APP_SECRET");
    if (params.token !== SCRIPT_SECRET) {
      return jsonResponse({ status: "error", message: "Unauthorized" });
    }
    // ↑ END OF PASTED BLOCK ↑
    var action = params.action;  // ← existing line, don't touch
    if (action === "submitSignUp")       return submitSignUp(params);
    if (action === "editSignup")         return editSignup(params);
    if (action === "deleteSignup")       return deleteSignup(params);
    if (action === "createUser")         return createUser(params);
    if (action === "updateTrialSignup")  return updateTrialSignup(params);
    if (action === "updateMemberSignup") return updateMemberSignup(params);
    if (action === "grantStudentStatus") return grantStudentStatus(params);
    return jsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}
// ─── submitSignUp ─────────────────────────────────────────────────────────────
// Appends a row to Training Sign-ups after pre-checks.
// Expected params: name, email, trainingDate, pool, activity, baseFee, actualFee,
//                  memberOnTrainingDate
function submitSignUp(params) {
  var email         = normalizeEmail(params.email);
  var trainingDate  = params.trainingDate;
  var pool          = (params.pool || "").trim();
  var name          = params.name || "";
  var activity      = params.activity || "";
  var baseFee       = Number(params.baseFee) || 0;
  var actualFee     = Number(params.actualFee) || 0;
  var memberOnDate  = params.memberOnTrainingDate || "";
  // Pre-check 1: session must not be closed
  var sessionCheck = checkSessionClosed(trainingDate, pool);
  if (sessionCheck.closed) {
    return jsonResponse({ status: "error", message: "Session is closed" });
  }
  // Pre-check 2: duplicate sign-up check
  var signupsSheet = getSheet(TAB_SIGNUPS);
  var signupsData  = getSheetData(signupsSheet);
  for (var i = 0; i < signupsData.length; i++) {
    var row = signupsData[i];
    if (
      normalizeEmail(String(row[1])) === email &&
      datesMatch(String(row[5]), trainingDate) &&
      normalizeStr(String(row[4])) === normalizeStr(pool)
    ) {
      return jsonResponse({ status: "error", message: "Already signed up" });
    }
  }
  // Look up Payment ID from User tab (col H = index 7)
  var paymentId = lookupPaymentId(email);
  // Format current datetime
  var now = new Date();
  var dateTimeStr = formatDateTime(now);
  // Append row — column order matches SignUpRow in googleSheets.ts
  signupsSheet.appendRow([
    name,          // [0]  col A — Name
    email,         // [1]  col B — Email
    paymentId,     // [2]  col C — Payment ID
    dateTimeStr,   // [3]  col D — DateTime signed up
    pool,          // [4]  col E — Pool
    trainingDate,  // [5]  col F — Training Date
    activity,      // [6]  col G — Activity
    activity,      // [7]  col H — Activity Value (same as Activity)
    baseFee,       // [8]  col I — Base Fee
    actualFee,     // [9]  col J — Actual Fee
    memberOnDate,  // [10] col K — Member on Training Date
  ]);
  return jsonResponse({ status: "success" });
}
// ─── editSignup ───────────────────────────────────────────────────────────────
// Updates Activity, Activity Value, Base Fee, Actual Fee for a matching sign-up.
// Expected params: email, trainingDate, pool, activity, baseFee, actualFee
function editSignup(params) {
  var email        = normalizeEmail(params.email);
  var trainingDate = params.trainingDate;
  var pool         = (params.pool || "").trim();
  var activity     = params.activity || "";
  var baseFee      = Number(params.baseFee) || 0;
  var actualFee    = Number(params.actualFee) || 0;
  var sheet = getSheet(TAB_SIGNUPS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[1])) === email &&
      datesMatch(String(row[5]), trainingDate) &&
      normalizeStr(String(row[4])) === normalizeStr(pool)
    ) {
      var sheetRow = i + 2; // +1 for header, +1 for 1-based index
      sheet.getRange(sheetRow, 7).setValue(activity);   // col G — Activity
      sheet.getRange(sheetRow, 8).setValue(activity);   // col H — Activity Value
      sheet.getRange(sheetRow, 9).setValue(baseFee);    // col I — Base Fee
      sheet.getRange(sheetRow, 10).setValue(actualFee); // col J — Actual Fee
      return jsonResponse({ status: "success" });
    }
  }
  return jsonResponse({ status: "error", message: "Sign-up not found" });
}
// ─── deleteSignup ─────────────────────────────────────────────────────────────
// Deletes a sign-up row after confirming session is not closed.
// Expected params: email, trainingDate, pool
function deleteSignup(params) {
  var email        = normalizeEmail(params.email);
  var trainingDate = params.trainingDate;
  var pool         = (params.pool || "").trim();
  // Check session is not closed
  var sessionCheck = checkSessionClosed(trainingDate, pool);
  if (sessionCheck.closed) {
    return jsonResponse({ status: "error", message: "Session is closed" });
  }
  var sheet = getSheet(TAB_SIGNUPS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[1])) === email &&
      datesMatch(String(row[5]), trainingDate) &&
      normalizeStr(String(row[4])) === normalizeStr(pool)
    ) {
      sheet.deleteRow(i + 2); // +1 header, +1 for 1-based
      return jsonResponse({ status: "success" });
    }
  }
  return jsonResponse({ status: "error", message: "Sign-up not found" });
}
// ─── createUser ───────────────────────────────────────────────────────────────
// Appends a new row to the User tab.
// Expected params: name, email
function createUser(params) {
  var name  = params.name || "";
  var email = normalizeEmail(params.email);
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  // Duplicate check on col C (index 2)
  for (var i = 0; i < data.length; i++) {
    if (normalizeEmail(String(data[i][2])) === email) {
      return jsonResponse({ status: "exists" });
    }
  }
  var id = "USR-" + Date.now();
  // Column order matches User tab layout read by googleSheets.ts getUsers()
  sheet.appendRow([
    id,            // [0]  col A — ID
    name,          // [1]  col B — Name
    email,         // [2]  col C — User Email
    email,         // [3]  col D — Email (duplicate)
    "",            // [4]  col E — Image
    "",            // [5]  col F — (empty)
    "",            // [6]  col G — (empty)
    "",            // [7]  col H — Payment ID (empty for new users)
    "Non-Member",  // [8]  col I — Membership Status
    "",            // [9]  col J — Club Role
    "NA",          // [10] col K — Trial Start Date (NA = never trialled)
    "",            // [11] col L — Trial End Date
    "",            // [12] col M — Student Start Date
  ]);
  return jsonResponse({ status: "success" });
}
// ─── updateTrialSignup ────────────────────────────────────────────────────────
// Sets membership status to "Trial" and sets trial start/end dates (+30 days).
// Expected params: email
function updateTrialSignup(params) {
  var email = normalizeEmail(params.email);
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[2])) === email ||
      normalizeEmail(String(row[3])) === email
    ) {
      var today   = new Date();
      var endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 30);
      var sheetRow = i + 2;
      sheet.getRange(sheetRow, 9).setValue("Trial");              // col I — Membership Status
      sheet.getRange(sheetRow, 11).setValue(formatDate(today));   // col K — Trial Start Date
      sheet.getRange(sheetRow, 12).setValue(formatDate(endDate)); // col L — Trial End Date
      return jsonResponse({ status: "success" });
    }
  }
  return jsonResponse({ status: "error", message: "User not found" });
}
// ─── updateMemberSignup ───────────────────────────────────────────────────────
// Sets membership status to "Member".
// Expected params: email
function updateMemberSignup(params) {
  var email = normalizeEmail(params.email);
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[2])) === email ||
      normalizeEmail(String(row[3])) === email
    ) {
      sheet.getRange(i + 2, 9).setValue("Member"); // col I — Membership Status
      return jsonResponse({ status: "success" });
    }
  }
  return jsonResponse({ status: "error", message: "User not found" });
}
// ─── grantStudentStatus ───────────────────────────────────────────────────────
// Sets membership status to "Student" and records today as student start date.
// Expected params: email
// Note: admin-only — enforce authorization on the calling server, not here.
function grantStudentStatus(params) {
  var email = normalizeEmail(params.email);
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[2])) === email ||
      normalizeEmail(String(row[3])) === email
    ) {
      var sheetRow = i + 2;
      sheet.getRange(sheetRow, 9).setValue("Student");                      // col I — Membership Status
      sheet.getRange(sheetRow, 13).setValue(formatDate(new Date()));        // col M — Student Start Date
      return jsonResponse({ status: "success" });
    }
  }
  return jsonResponse({ status: "error", message: "User not found" });
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSheet(tabName) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error("Tab not found: " + tabName);
  return sheet;
}
// Returns all data rows excluding the header row (row 1).
function getSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}
// Looks up Payment ID (col H = column index 7) for a given email.
// Searches User tab col C (index 2) and col D (index 3).
function lookupPaymentId(email) {
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[2])) === email ||
      normalizeEmail(String(row[3])) === email
    ) {
      return String(row[7] || "");
    }
  }
  return "";
}
// Checks whether a session (matched by date + pool) has col P (index 15) non-empty.
function checkSessionClosed(trainingDate, pool) {
  var sheet = getSheet(TAB_SESSIONS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      datesMatch(String(row[0]), trainingDate) &&
      normalizeStr(String(row[3])) === normalizeStr(pool)
    ) {
      var isClosed = String(row[15] || "").trim();
      return { found: true, closed: isClosed.length > 0 };
    }
  }
  // Session not found in sheet — allow the sign-up (not closed)
  return { found: false, closed: false };
}
// Compares two date strings by their calendar date (ignores time).
function datesMatch(date1, date2) {
  var d1 = new Date(date1);
  var d2 = new Date(date2);
  if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
    return d1.toDateString() === d2.toDateString();
  }
  return date1.trim().toLowerCase() === date2.trim().toLowerCase();
}
function normalizeEmail(str) {
  return (str || "").toLowerCase().trim();
}
function normalizeStr(str) {
  return (str || "").toLowerCase().trim();
}
// Formats a Date as "DD/MM/YYYY"
function formatDate(date) {
  var d = String(date.getDate()).padStart(2, "0");
  var m = String(date.getMonth() + 1).padStart(2, "0");
  var y = date.getFullYear();
  return d + "/" + m + "/" + y;
}
// Formats a Date as "DD/MM/YYYY HH:MM:SS"
function formatDateTime(date) {
  var d  = String(date.getDate()).padStart(2, "0");
  var m  = String(date.getMonth() + 1).padStart(2, "0");
  var y  = date.getFullYear();
  var hh = String(date.getHours()).padStart(2, "0");
  var mm = String(date.getMinutes()).padStart(2, "0");
  var ss = String(date.getSeconds()).padStart(2, "0");
  return d + "/" + m + "/" + y + " " + hh + ":" + mm + ":" + ss;
}
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
// ─── processMaybankEmails ─────────────────────────────────────────────────────
// Reads new emails from the Maybank Gmail label, parses payment details, and
// appends rows to the Payments sheet (cols A–E; cols F–G remain formula-driven).
function processMaybankEmails() {
  var label     = GmailApp.getUserLabelByName(MAYBANK_LABEL);
  var doneLabel = GmailApp.getUserLabelByName(MAYBANK_DONE)
                  || GmailApp.createLabel(MAYBANK_DONE);
  if (!label) {
    Logger.log("[PaymentSync] Gmail label '" + MAYBANK_LABEL + "' not found.");
    return;
  }
  var processedIds = getProcessedIds();
  var sheet        = getSheet(TAB_PAYMENTS);
  var newCount     = 0;
  var threads = label.getThreads(0, 50);
  for (var t = 0; t < threads.length; t++) {
    var thread   = threads[t];
    var messages = thread.getMessages();
    var threadHadNew = false;
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      var id  = msg.getId();
      if (processedIds[id]) continue;
      var parsed = parseMaybankEmail(msg);
      if (!parsed) {
        Logger.log("[PaymentSync] Skipped (no amount): " + msg.getSubject());
        processedIds[id] = true;
        continue;
      }
      appendPaymentRow(sheet, parsed);
      processedIds[id] = true;
      threadHadNew = true;
      newCount++;
      Logger.log("[PaymentSync] Added SGD " + parsed.amount + " — ref: " + (parsed.reference || "(none)"));
    }
    // Primary dedup: move thread out of Maybank2 regardless of whether
    // we wrote a row (handles already-processed threads on retry runs too)
    thread.addLabel(doneLabel);
    thread.removeLabel(label);
  }
  saveProcessedIds(processedIds);
  if (newCount > 0) {
    notifyRailway("payments");
  }
  Logger.log("[PaymentSync] Complete. " + newCount + " new payment(s) added.");
}
// ─── parseMaybankEmail ────────────────────────────────────────────────────────
// Returns { body, subject, date, amount, reference } or null if no amount found.
// Regex patterns cover common Maybank PayNow notification formats.
// If your emails look different, adjust the patterns in amountMatch and othrMatch.
function parseMaybankEmail(msg) {
  var subject = msg.getSubject() || "";
  var body    = msg.getPlainBody() || "";
  var date    = msg.getDate();
  // Amount: "SGD 13.00", "S$13", "SGD13.00", "$7", etc.
  var amountMatch = body.match(/(?:SGD|S\$|\$)\s*([\d,]+\.?\d*)/i);
  if (!amountMatch) return null;
  var amount = parseFloat(amountMatch[1].replace(/,/g, ""));
  if (!amount || amount <= 0) return null;
  // OTHR reference: the free-text PayNow reference the sender typed
  // Tries "OTHR <text>", "Reference: <text>", "Ref: <text>"
  var reference = "";
  var othrMatch = body.match(/(?:OTHR|Reference|Ref\.?)\s*[:\-]?\s*(.+?)(?:\r?\n|$)/i);
  if (othrMatch) reference = othrMatch[1].trim();
  // Date formatted to match existing sheet format: "M/D/YYYY H:MM:SS"
  var dateStr = (date.getMonth() + 1) + "/" + date.getDate() + "/" + date.getFullYear()
    + " " + date.getHours() + ":"
    + String(date.getMinutes()).padStart(2, "0") + ":"
    + String(date.getSeconds()).padStart(2, "0");
  return { body: body, subject: subject, date: dateStr, amount: amount, reference: reference };
}
// ─── appendPaymentRow ─────────────────────────────────────────────────────────
// Writes cols A–E then resolves PaymentID Match (col F) and Email (col G)
// directly via a GAS lookup — no formulas, no spreadsheet lag.
function appendPaymentRow(sheet, parsed) {
  var lastRow = sheet.getLastRow();
  var newRow  = lastRow + 1;
  sheet.getRange(newRow, 1).setValue(parsed.body);       // col A — raw email body
  sheet.getRange(newRow, 2).setValue(parsed.subject);    // col B — subject
  sheet.getRange(newRow, 3).setValue(parsed.date);       // col C — date
  sheet.getRange(newRow, 4).setValue(parsed.amount);     // col D — amount (numeric)
  sheet.getRange(newRow, 5).setValue(parsed.reference);  // col E — OTHR reference
  // Direct GAS lookup — no formulas
  var match = lookupUserByPaymentRef(parsed.reference);
  if (match) {
    sheet.getRange(newRow, 6).setValue(match.paymentId); // col F — PaymentID Match
    sheet.getRange(newRow, 7).setValue(match.email);     // col G — Email
  }
}
// ─── lookupUserByPaymentRef ───────────────────────────────────────────────────
// Scans col A of the User tab (case-insensitive) for a matching paymentId.
// Returns { paymentId, email } or null if not found.
function lookupUserByPaymentRef(reference) {
  if (!reference) return null;
  var refLower = reference.toString().toLowerCase().trim();
  var data = getSheet("User").getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {  // row 0 is header
    var colA  = (data[i][0] || "").toString().toLowerCase().trim();  // col A = PaymentID
    var email = (data[i][3] || "").toString().toLowerCase().trim();  // col D = email
    if (colA && colA === refLower) {
      return {
        paymentId: data[i][0].toString(),  // preserve original case from sheet
        email:     email
      };
    }
  }
  return null;
}
// ─── setupPaymentTrigger ──────────────────────────────────────────────────────
// Run this ONCE manually to install an hourly trigger.
// Verify it appears under Edit → Current project's triggers.
function setupPaymentTrigger() {
  // Remove any existing trigger first to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "processMaybankEmails") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("processMaybankEmails")
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log("Hourly trigger installed for processMaybankEmails.");
}
// ─── Dedup helpers ────────────────────────────────────────────────────────────
// Script Properties limit is 9 KB per value. Keep max 200 IDs (~5.6 KB) as a
// secondary safety net — label removal is the primary dedup mechanism.
function getProcessedIds() {
  var stored = PropertiesService.getScriptProperties().getProperty(PROCESSED_KEY);
  try { return stored ? JSON.parse(stored) : {}; } catch(e) { return {}; }
}
function saveProcessedIds(ids) {
  var keys = Object.keys(ids);
  if (keys.length > 200) {
    var trimmed = {};
    keys.slice(keys.length - 200).forEach(function(k) { trimmed[k] = ids[k]; });
    ids = trimmed;
  }
  try {
    PropertiesService.getScriptProperties().setProperty(PROCESSED_KEY, JSON.stringify(ids));
  } catch(e) {
    Logger.log("[PaymentSync] Warning: could not save processedIds — " + e.message);
  }
}
