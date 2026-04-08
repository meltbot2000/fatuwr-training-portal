/**
 * FATUWR Training Portal — Google Apps Script
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
 * User tab columns (0-indexed) — verified against live sheet:
 *   [0]  ID                          (col A)
 *   [1]  Name                        (col B)
 *   [2]  User Email                  (col C)
 *   [3]  Email                       (col D)
 *   [4]  Image                       (col E)
 *   [5]  Club Role                   (col F)  ← getRange uses column 6
 *   [6]  Annual Membership Start     (col G)
 *   [7]  Payment ID / Phone (Paynow) (col H)  ← getRange uses column 8
 *   [8]  Birth Date                  (col I)  ← empty, NOT membership status
 *   [9]  Membership Status           (col J)  ← getRange uses column 10
 *   [10] Trial Start Date            (col K)  ← getRange uses column 11
 *   [11] Trial End Date              (col L)  ← getRange uses column 12
 *   [12] Date Created                (col M)
 */

var SHEET_ID = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
var TAB_SESSIONS = "Training Sessions";
var TAB_SIGNUPS  = "Training Sign-ups";
var TAB_USERS    = "User";

// ─── Entry points ─────────────────────────────────────────────────────────────

function doGet(e) {
  return jsonResponse({ status: "ok", message: "FATUWR GAS v1 running" });
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var action = params.action;

    if (action === "submitSignUp")       return submitSignUp(params);
    if (action === "editSignup")         return editSignup(params);
    if (action === "deleteSignup")       return deleteSignup(params);
    if (action === "createUser")         return createUser(params);
    if (action === "updateTrialSignup")  return updateTrialSignup(params);
    if (action === "updateMemberSignup") return updateMemberSignup(params);
    if (action === "grantStudentStatus") return grantStudentStatus(params);
    if (action === "updateUser")         return updateUser(params);
    if (action === "addSession")            return addSession(params);
    if (action === "closeSession")          return closeSession(params);
    if (action === "addMembershipSignup")   return addMembershipSignup(params);

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

  // Column order matches User tab layout — verified against live sheet
  sheet.appendRow([
    id,            // [0]  col A — ID
    name,          // [1]  col B — Name
    email,         // [2]  col C — User Email
    email,         // [3]  col D — Email (duplicate)
    "",            // [4]  col E — Image
    "",            // [5]  col F — Club Role (empty for new users)
    "",            // [6]  col G — Annual Membership Start Date
    "",            // [7]  col H — Payment ID (empty for new users)
    "",            // [8]  col I — Birth Date
    "Non-Member",  // [9]  col J — Membership Status
    "NA",          // [10] col K — Trial Start Date (NA = never trialled)
    "",            // [11] col L — Trial End Date
    new Date(),    // [12] col M — Date Created
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
      sheet.getRange(sheetRow, 10).setValue("Trial");             // col J — Membership Status
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
      sheet.getRange(i + 2, 10).setValue("Member"); // col J — Membership Status
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
      sheet.getRange(sheetRow, 10).setValue("Student"); // col J — Membership Status
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── updateUser ───────────────────────────────────────────────────────────────
// Admin action: update memberStatus and/or clubRole for a user by email.
// Expected params: email, memberStatus (optional), clubRole (optional)

function updateUser(params) {
  var email        = normalizeEmail(params.email);
  var memberStatus = params.memberStatus; // may be undefined
  var clubRole     = params.clubRole;     // may be undefined

  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[2])) === email ||
      normalizeEmail(String(row[3])) === email
    ) {
      var sheetRow = i + 2;
      if (memberStatus !== undefined && memberStatus !== null) {
        sheet.getRange(sheetRow, 10).setValue(memberStatus); // col J — Membership Status
        if (memberStatus === "Trial") {
          var today   = new Date();
          var endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 30);
          sheet.getRange(sheetRow, 11).setValue(formatDate(today));   // col K — Trial Start Date
          sheet.getRange(sheetRow, 12).setValue(formatDate(endDate)); // col L — Trial End Date
        }
      }
      if (clubRole !== undefined && clubRole !== null) {
        sheet.getRange(sheetRow, 6).setValue(clubRole); // col F — Club Role
      }
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── addMembershipSignup ─────────────────────────────────────────────────────
// Records a membership purchase as a sign-up row in Training Sign-ups.
// Unlike submitSignUp, this skips session/duplicate checks — the caller is
// responsible for ensuring it is only called once per membership purchase.
// Expected params: email, name, activity ("Trial Membership" | "Membership Fee"), actualFee

function addMembershipSignup(params) {
  var email    = normalizeEmail(params.email);
  var name     = params.name || "";
  var activity = params.activity || "Membership Fee";
  var actualFee = Number(params.actualFee) || 0;

  // Look up Payment ID from User tab (col H = column 8, index 7)
  var paymentId = lookupPaymentId(email);

  var now = new Date();
  var dateTimeStr = formatDateTime(now);

  var sheet = getSheet(TAB_SIGNUPS);
  sheet.appendRow([
    name,         // [0]  col A — Name
    email,        // [1]  col B — Email  ← always populated by this function
    paymentId,    // [2]  col C — Payment ID
    dateTimeStr,  // [3]  col D — DateTime of action
    "",           // [4]  col E — Pool (none for membership)
    dateTimeStr,  // [5]  col F — Date of training (same as action time)
    activity,     // [6]  col G — Activity
    "",           // [7]  col H — ActivityValue
    "",           // [8]  col I — Base fee
    actualFee,    // [9]  col J — Actual fee
    "",           // [10] col K — Member on training date
  ]);

  return jsonResponse({ status: "success" });
}

// ─── addSession ───────────────────────────────────────────────────────────────
// Admin action: append a new row to Training Sessions.
// Expected params: trainingDate, day, trainingTime, pool, memberFee, nonMemberFee,
//                  memberSwimFee, nonMemberSwimFee, studentFee, studentSwimFee,
//                  trainerFee, notes, trainingObjective

function addSession(params) {
  var trainingDate      = params.trainingDate || "";
  var day               = params.day || "";
  var trainingTime      = params.trainingTime || "";
  var pool              = (params.pool || "").trim();
  var memberFee         = Number(params.memberFee) || 0;
  var nonMemberFee      = Number(params.nonMemberFee) || 0;
  var memberSwimFee     = Number(params.memberSwimFee) || 0;
  var nonMemberSwimFee  = Number(params.nonMemberSwimFee) || 0;
  var studentFee        = Number(params.studentFee) || 0;
  var studentSwimFee    = Number(params.studentSwimFee) || 0;
  var trainerFee        = Number(params.trainerFee) || 0;
  var notes             = params.notes || "";
  var trainingObjective = params.trainingObjective || "";
  var rowId             = "ROW-" + Date.now();

  var sheet = getSheet(TAB_SESSIONS);
  sheet.appendRow([
    trainingDate,      // [0]  col A — Training Date
    day,               // [1]  col B — Day
    trainingTime,      // [2]  col C — Training Time
    pool,              // [3]  col D — Pool
    "",                // [4]  col E — Pool Image URL
    memberFee,         // [5]  col F — Member Fee
    nonMemberFee,      // [6]  col G — Non-Member Fee
    memberSwimFee,     // [7]  col H — Member Swim Fee
    nonMemberSwimFee,  // [8]  col I — Non-Member Swim Fee
    studentFee,        // [9]  col J — Student Fee
    studentSwimFee,    // [10] col K — Student Swim Fee
    trainerFee,        // [11] col L — Trainer Fee
    notes,             // [12] col M — Notes
    rowId,             // [13] col N — Row ID
    0,                 // [14] col O — Attendance
    "",                // [15] col P — Close? (empty = open)
    trainingObjective, // [16] col Q — Training Objective
  ]);

  return jsonResponse({ status: "success", rowId: rowId });
}

// ─── closeSession ─────────────────────────────────────────────────────────────
// Admin action: mark a session as closed by setting col P (index 15) = "Closed".
// Expected params: rowId

function closeSession(params) {
  var rowId = (params.rowId || "").trim();
  if (!rowId) {
    return jsonResponse({ status: "error", message: "rowId is required" });
  }

  var sheet = getSheet(TAB_SESSIONS);
  var data  = getSheetData(sheet);

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[13] || "").trim() === rowId) {
      sheet.getRange(i + 2, 16).setValue("Closed"); // col P — isClosed
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "Session not found" });
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

// ─── Gmail trigger — replaces the time-based cronjob ─────────────────────────
//
// HOW IT WORKS
// The installable "onFiltersMatched" trigger fires the moment an incoming email
// matches an existing Gmail filter — typically within seconds of delivery.
// This replaces the ~5-minute polling cronjob entirely.
//
// PREREQUISITE
// You must already have a Gmail filter that applies the "Maybank" label to
// incoming Maybank PayNow alert emails. The trigger piggybacks on that filter.
//
// ONE-TIME SETUP (run once from the Apps Script editor):
//   1. Open this script in the Apps Script editor
//   2. Select "createPaymentTrigger" in the function dropdown
//   3. Click ▶ Run — grant Gmail permission when prompted
//   4. Open Triggers (clock icon) to confirm the trigger appears
//   5. Delete / disable your existing time-based cronjob for permfix1
//
// TO REMOVE the trigger later, run deletePaymentTrigger() the same way.

/**
 * Handler called by the Gmail trigger when a new email matches a Gmail filter.
 * Runs permfix1 (parse + write to sheet) then removeDuplicatesAndSortByTime.
 * The event object `e` is unused — permfix1 already scans all Maybank-labelled
 * threads each time it runs, so no per-message routing is needed.
 */
function onNewPaymentEmail(e) {
  Logger.log("Gmail trigger fired — processing new payment email");
  try {
    permfix1();
    removeDuplicatesAndSortByTime();
    Logger.log("Payment processing complete");
  } catch (err) {
    Logger.log("Error in onNewPaymentEmail: " + err.message);
  }
}

/**
 * Creates the installable Gmail trigger.
 * Run this ONCE from the Apps Script editor.
 * Safe to re-run — removes any existing trigger for onNewPaymentEmail first.
 */
function createPaymentTrigger() {
  // Remove any existing triggers for onNewPaymentEmail to avoid duplicates
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "onNewPaymentEmail") {
      ScriptApp.deleteTrigger(existing[i]);
      Logger.log("Removed existing trigger");
    }
  }

  ScriptApp.newTrigger("onNewPaymentEmail")
    .forGmail()
    .onFiltersMatched()
    .create();

  Logger.log("Gmail trigger created — onNewPaymentEmail will fire on matching emails");
  Logger.log("You can now disable the time-based cronjob for permfix1.");
}

/**
 * Removes the Gmail trigger.
 * Run this from the Apps Script editor if you want to revert to the cronjob.
 */
function deletePaymentTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "onNewPaymentEmail") {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  Logger.log("Removed " + removed + " trigger(s) for onNewPaymentEmail");
}
