/**
 * FATUWR Training Portal — Google Apps Script
 * Sheet ID: 19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM
 *
 * v8 changes (2026-04-18):
 *   - createPaymentTrigger: replaced forGmail().onFiltersMatched() (Gmail Add-on only —
 *     throws TypeError in regular scripts) with a time-based every-5-minute trigger.
 *     processMaybankEmails() is called directly by the trigger on each tick.
 *   - deletePaymentTrigger: now removes triggers for "processMaybankEmails" as well as
 *     the old "onNewPaymentEmail" handler name so old installs are fully cleaned up.
 *
 * v7 changes (2026-04-18):
 *   - Document cols V (21), W (22), X (23) in Training Sessions column layout
 *     (Venue/Pool Cost, Revenue, PnL — pre-existing sheet columns now seeded into DB)
 *   - fetchSheetsSessions (server/googleSheets.ts) reads [21]=venueCost, [22]=revenue
 *     so existing historical data is picked up on the next sync/reseed
 *   - addSession: accepts optional venueCost param and writes it to col V [21]
 *     (cols 17–20 are padded with empty strings to preserve column alignment)
 *   - No rainOff column exists in the sheet; rainOff stays as an empty string in DB
 *
 * Column layout matches server/googleSheets.ts exactly so reads and writes stay in sync.
 *
 * Training Sessions tab columns (0-indexed):
 *   [0]  Training Date          (col A)
 *   [1]  Day                    (col B)
 *   [2]  Training Time          (col C)
 *   [3]  Pool                   (col D)
 *   [4]  Pool Image URL         (col E)
 *   [5]  Member Fee             (col F)
 *   [6]  Non-Member Fee         (col G)
 *   [7]  Member Swim Fee        (col H)
 *   [8]  Non-Member Swim Fee    (col I)
 *   [9]  Student Fee            (col J)
 *   [10] Student Swim Fee       (col K)
 *   [11] Trainer Fee            (col L)
 *   [12] Notes                  (col M)
 *   [13] Row ID                 (col N)
 *   [14] Attendance             (col O)
 *   [15] Close? (isClosed)      (col P)  non-empty = session closed
 *   [16] Training Objective     (col Q)
 *   [17] (unused)               (col R)
 *   [18] (unused)               (col S)
 *   [19] Sign-Up Close Time     (col T)
 *   [20] (unused)               (col U)
 *   [21] Venue / Pool Cost      (col V)  ← seeded into DB as venueCost
 *   [22] Revenue                (col W)  ← seeded into DB; portal now auto-calculates from signups
 *   [23] PnL                    (col X)  ← read-only in sheet (Revenue − Cost); not stored in DB
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
 *   [0]  Payment ID                  (col A) ← PaymentID used for Maybank matching (e.g. "mel", "hayley")
 *   [1]  Name                        (col B)
 *   [2]  User Email                  (col C)
 *   [3]  Email                       (col D)
 *   [4]  Image                       (col E)
 *   [5]  Club Role                   (col F)
 *   [6]  Annual Membership Start     (col G)
 *   [7]  Phone Number                (col H) ← phone only, NOT PaymentID
 *   [8]  Birth Date                  (col I)
 *   [9]  Membership Status           (col J)
 *   [10] Trial Start Date            (col K)
 *   [11] Trial End Date              (col L)
 *   [12] Date Created                (col M)
 *
 * Payments tab columns (0-indexed) — verified against live sheet:
 *   [0]  Maybank Payment Message     (col A) ← raw email body
 *   [1]  Subject                     (col B)
 *   [2]  Date                        (col C) e.g. "20/03/2026 16:47:13"
 *   [3]  Amount                      (col D) numeric
 *   [4]  OTHR Message                (col E) ← PayNow reference the sender typed (e.g. "mel")
 *   [5]  PaymentID Match             (col F) ← matched PaymentID (GAS-resolved, NOT a formula)
 *   [6]  Email                       (col G) ← matched email (GAS-resolved, NOT a formula)
 */

var SHEET_ID    = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
var TAB_SESSIONS = "Training Sessions";
var TAB_SIGNUPS  = "Training Sign-ups";
var TAB_USERS    = "User";
var TAB_PAYMENTS = "Payments";

// ─── Entry points ─────────────────────────────────────────────────────────────

function doGet(e) {
  return jsonResponse({ status: "ok", message: "FATUWR GAS v7 running" });
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
    if (action === "addSession")         return addSession(params);
    if (action === "closeSession")       return closeSession(params);
    if (action === "addMembershipSignup") return addMembershipSignup(params);

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

  // Look up Payment ID from User tab col A (PaymentID)
  var paymentId = lookupPaymentId(email);

  var now = new Date();
  var dateTimeStr = formatDateTime(now);

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

  notifyRailway("signups");
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
      notifyRailway("signups");
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
      notifyRailway("signups");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "Sign-up not found" });
}

// ─── createUser ───────────────────────────────────────────────────────────────
// Appends a new row to the User tab.
// Expected params: name, email, paymentId
//
// IMPORTANT: col A stores the PaymentID (e.g. "mel", "hayley") — NOT a system
// timestamp ID. The server generates this from the user's name and passes it
// here. col H is the phone number field and is left empty by this function.

function createUser(params) {
  var name      = params.name || "";
  var email     = normalizeEmail(params.email);
  var paymentId = params.paymentId || "";
  var phone     = params.phone || "";
  var dob       = params.dob   || "";

  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);

  // Upsert: if a row with this email already exists, update it rather than append
  for (var i = 0; i < data.length; i++) {
    if (
      normalizeEmail(String(data[i][2])) === email ||
      normalizeEmail(String(data[i][3])) === email
    ) {
      var sheetRow = i + 2; // +1 for header, +1 for 1-based index
      if (paymentId) sheet.getRange(sheetRow, 1).setValue(paymentId); // col A — PaymentID
      if (name)      sheet.getRange(sheetRow, 2).setValue(name);      // col B — Name
      if (phone)     sheet.getRange(sheetRow, 8).setValue(phone);     // col H — Phone Number
      if (dob)       sheet.getRange(sheetRow, 9).setValue(dob);       // col I — Birth Date
      notifyRailway("users");
      return jsonResponse({ status: "updated" });
    }
  }

  // No existing row — append new one
  // Column order matches User tab layout
  sheet.appendRow([
    paymentId,     // [0]  col A — PaymentID (e.g. "mel", "hayley")
    name,          // [1]  col B — Name
    email,         // [2]  col C — User Email
    email,         // [3]  col D — Email (duplicate)
    "",            // [4]  col E — Image
    "",            // [5]  col F — Club Role (empty for new users)
    "",            // [6]  col G — Annual Membership Start Date
    phone,         // [7]  col H — Phone Number
    dob,           // [8]  col I — Birth Date
    "Non-Member",  // [9]  col J — Membership Status
    "NA",          // [10] col K — Trial Start Date (NA = never trialled)
    "",            // [11] col L — Trial End Date
    new Date(),    // [12] col M — Date Created
  ]);

  notifyRailway("users");
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
      notifyRailway("users");
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
      notifyRailway("users");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── grantStudentStatus ───────────────────────────────────────────────────────
// Sets membership status to "Student".
// Expected params: email

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
      sheet.getRange(i + 2, 10).setValue("Student"); // col J — Membership Status
      notifyRailway("users");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── updateUser ───────────────────────────────────────────────────────────────
// Admin action: update memberStatus and/or clubRole for a user by email.
// Expected params: email, memberStatus (optional), clubRole (optional),
//                  trialStartDate (optional), trialEndDate (optional)

function updateUser(params) {
  var email        = normalizeEmail(params.email);
  var memberStatus = params.memberStatus;
  var clubRole     = params.clubRole;
  var trialStart   = params.trialStartDate;
  var trialEnd     = params.trialEndDate;

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
          sheet.getRange(sheetRow, 11).setValue(formatDate(today));   // col K
          sheet.getRange(sheetRow, 12).setValue(formatDate(endDate)); // col L
        }
      }
      if (clubRole !== undefined && clubRole !== null) {
        sheet.getRange(sheetRow, 6).setValue(clubRole); // col F — Club Role
      }
      if (trialStart !== undefined && trialStart !== null) {
        sheet.getRange(sheetRow, 11).setValue(trialStart); // col K — Trial Start Date
      }
      if (trialEnd !== undefined && trialEnd !== null) {
        sheet.getRange(sheetRow, 12).setValue(trialEnd); // col L — Trial End Date
      }
      notifyRailway("users");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── addMembershipSignup ─────────────────────────────────────────────────────
// Records a membership purchase as a sign-up row in Training Sign-ups.
// Expected params: email, name, activity ("Trial Membership" | "Membership Fee"), actualFee

function addMembershipSignup(params) {
  var email    = normalizeEmail(params.email);
  var name     = params.name || "";
  var activity = params.activity || "Membership Fee";
  var actualFee = Number(params.actualFee) || 0;

  // Look up Payment ID from User tab col A (PaymentID)
  var paymentId = lookupPaymentId(email);

  var now = new Date();
  var dateTimeStr = formatDateTime(now);

  var sheet = getSheet(TAB_SIGNUPS);
  sheet.appendRow([
    name,         // [0]  col A — Name
    email,        // [1]  col B — Email
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

  notifyRailway("signups");
  return jsonResponse({ status: "success" });
}

// ─── addSession ───────────────────────────────────────────────────────────────
// Admin action: append a new row to Training Sessions.
// Expected params: trainingDate, day, trainingTime, pool, memberFee, nonMemberFee,
//                  memberSwimFee, nonMemberSwimFee, studentFee, studentSwimFee,
//                  trainerFee, notes, trainingObjective, venueCost (optional)
//
// Cols R–U (17–20) are written as empty strings to maintain column alignment so
// that venueCost lands correctly in col V (21).

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
  var venueCost         = Number(params.venueCost) || 0;
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
    "",                // [17] col R — (unused)
    "",                // [18] col S — (unused)
    "",                // [19] col T — Sign-Up Close Time
    "",                // [20] col U — (unused)
    venueCost,         // [21] col V — Venue / Pool Cost
                       // col W (Revenue) and col X (PnL) are sheet formulas — not written by GAS
  ]);

  notifyRailway("sessions");
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
      notifyRailway("sessions");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "Session not found" });
}

// ─── Payment email processing ─────────────────────────────────────────────────
//
// processMaybankEmails() is called by the Gmail trigger (onNewPaymentEmail) and
// can also be run manually from the Apps Script editor.
//
// Two Gmail label variants are supported:
//   "Maybank"  → processed → moved to "Maybank_Done"
//   "Maybank2" → processed → moved to "Maybank_Done2"
//
// Dedup is primary via label removal (threads move out of the source label after
// processing) and secondary via Script Properties (last 200 message IDs).

function processMaybankEmails() {
  processMaybankLabel("Maybank", "Maybank_Done");
  processMaybankLabel("Maybank2", "Maybank_Done2");
}

/**
 * Process all Gmail threads with the given label.
 * Writes new payment rows to the Payments sheet, then moves the thread to
 * the done label and removes the source label so it won't be re-processed.
 */
function processMaybankLabel(labelName, doneLabelName) {
  var label     = getLabelOrCreate(labelName);
  var doneLabel = getLabelOrCreate(doneLabelName);

  var processedIds = loadProcessedIds();
  var newCount = 0;

  var threads = label.getThreads();
  Logger.log("[" + labelName + "] Found " + threads.length + " thread(s)");

  for (var t = 0; t < threads.length; t++) {
    var thread   = threads[t];
    var messages = thread.getMessages();

    for (var m = 0; m < messages.length; m++) {
      var msg   = messages[m];
      var msgId = msg.getId();

      // Secondary dedup: skip if already processed
      if (processedIds[msgId]) {
        Logger.log("[" + labelName + "] Skipping already-processed message " + msgId);
        continue;
      }

      var parsed = parseMaybankEmail(msg);
      if (!parsed) {
        // Couldn't extract payment info — still mark as processed to avoid re-tries
        processedIds[msgId] = true;
        Logger.log("[" + labelName + "] Could not parse message " + msgId + " — skipping");
        continue;
      }

      appendPaymentRow(parsed);
      processedIds[msgId] = true;
      newCount++;
      Logger.log("[" + labelName + "] Wrote payment row: amount=" + parsed.amount + " othr=" + parsed.othr);
    }

    // Primary dedup: move thread out of source label regardless of whether we
    // found new messages. This prevents threads from re-appearing on next run.
    try {
      thread.addLabel(doneLabel);
      thread.removeLabel(label);
    } catch (labelErr) {
      Logger.log("[" + labelName + "] Label move failed for thread: " + labelErr);
    }
  }

  if (newCount > 0) {
    saveProcessedIds(processedIds);
    notifyRailway("payments");
    Logger.log("[" + labelName + "] Done — wrote " + newCount + " new payment row(s)");
  } else {
    Logger.log("[" + labelName + "] Done — no new payments found");
  }
}

/**
 * Parse a Maybank PayNow notification email and return an object with the
 * fields needed to write a Payments row, or null if parsing fails.
 *
 * Handles multiple Maybank email formats. The OTHR reference is the short
 * identifier the sender typed (e.g. "mel", "hayley") which is used to match
 * the payment to a user in the User tab.
 */
function parseMaybankEmail(message) {
  var body    = message.getPlainBody() || "";
  var subject = message.getSubject() || "";
  var date    = message.getDate();

  Logger.log("Parsing message id=" + message.getId() + " subject=" + subject);

  // ── Extract amount ──────────────────────────────────────────────────────────
  var amount = 0;
  var amountPatterns = [
    /Credit Amount\s*[:\-]\s*(?:SGD|S\$|RM)?\s*([\d,]+\.?\d*)/i,
    /Amount\s*[:\-]\s*(?:SGD|S\$|RM)?\s*([\d,]+\.?\d*)/i,
    /SGD\s+([\d,]+\.?\d*)/i,
    /S\$\s*([\d,]+\.?\d*)/i,
    /RM\s+([\d,]+\.?\d*)/i,
  ];
  for (var i = 0; i < amountPatterns.length; i++) {
    var am = body.match(amountPatterns[i]);
    if (am) {
      var parsed = parseFloat(am[1].replace(/,/g, ""));
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  // ── Extract OTHR reference ──────────────────────────────────────────────────
  // PayNow transfers include an ISO 20022 "OTHR" reference field.
  // Examples in email body: "OTHR/mel", "OTHR : mel", "Reference: OTHR/mel"
  var othr = "";
  var othrPatterns = [
    /\(ref-OTHR-([^)]+)\)/i,                                             // Maybank SG: "(ref-OTHR-mel)"
    /OTHR[-\/\s:]+([^\s\n\r\/|,)]+)/i,                                   // generic: "OTHR-mel", "OTHR/mel"
    /Sender['']?s?\s+Ref(?:erence)?[^:\n]*:\s*(?:OTHR[-\/])?([^\n\r|,]+)/i,
    /Payment\s+Ref(?:erence)?[^:\n]*:\s*(?:OTHR[-\/])?([^\n\r|,]+)/i,
    /Reference[^:\n]*:\s*(?:OTHR[-\/])?([^\n\r|,]{1,50})/i,
  ];
  for (var j = 0; j < othrPatterns.length; j++) {
    var om = body.match(othrPatterns[j]);
    if (om) {
      var candidate = om[1].trim().replace(/\s+/g, " ").replace(/\s*\|.*$/, "").trim();
      if (candidate) {
        othr = candidate;
        break;
      }
    }
  }

  Logger.log("Parsed — amount: " + amount + ", othr: " + othr);

  // Only skip if both amount and othr are missing
  if (amount === 0 && !othr) {
    Logger.log("Skipping — could not parse amount or othr from body: " + body.substring(0, 300));
    return null;
  }

  return {
    body:    body.substring(0, 5000),  // truncate long bodies for the sheet cell
    subject: subject,
    date:    formatDateTime(date),
    amount:  amount,
    othr:    othr,
  };
}

/**
 * Append one row to the Payments tab.
 * Cols F and G (PaymentID Match, Email) are resolved here via GAS lookup —
 * no VLOOKUP formula is copied from adjacent rows.
 *
 * @param {Object} parsed  Output of parseMaybankEmail()
 */
function appendPaymentRow(parsed) {
  var sheet = getSheet(TAB_PAYMENTS);

  // GAS-side lookup: find User row whose col A (PaymentID) matches the OTHR reference
  var userInfo = lookupUserByPaymentRef(parsed.othr);

  sheet.appendRow([
    parsed.body,          // [0] col A — Maybank Payment Message (raw body)
    parsed.subject,       // [1] col B — Subject
    parsed.date,          // [2] col C — Date
    parsed.amount,        // [3] col D — Amount
    parsed.othr,          // [4] col E — OTHR Message (reference text)
    userInfo.paymentId,   // [5] col F — PaymentID Match (GAS-resolved)
    userInfo.email,       // [6] col G — Email (GAS-resolved)
  ]);

  Logger.log("appendPaymentRow — othr=" + parsed.othr + " → paymentId=" + userInfo.paymentId + " email=" + userInfo.email);
}

/**
 * Find the User row whose col A (PaymentID) case-insensitively matches `reference`.
 * Returns { paymentId, email } — both empty strings if no match found.
 *
 * This replaces the VLOOKUP formula in the Payments sheet col F/G.
 */
function lookupUserByPaymentRef(reference) {
  var ref = (reference || "").toLowerCase().trim();
  if (!ref) return { paymentId: "", email: "" };

  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);

  for (var i = 0; i < data.length; i++) {
    var row    = data[i];
    var colA   = String(row[0] || "").toLowerCase().trim(); // col A = PaymentID
    if (colA && colA === ref) {
      return {
        paymentId: String(row[0] || ""),                        // col A as-is
        email:     (String(row[3] || "")).toLowerCase().trim(), // col D = email
      };
    }
  }

  Logger.log("lookupUserByPaymentRef: no match for reference=" + reference);
  return { paymentId: "", email: "" };
}

/**
 * Get an existing Gmail label or create it if it doesn't exist.
 */
function getLabelOrCreate(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
    Logger.log("Created Gmail label: " + name);
  }
  return label;
}

// Script Properties key for secondary dedup of processed message IDs
var PROCESSED_KEY = "processedMaybankIds";

/**
 * Load the set of already-processed Gmail message IDs from Script Properties.
 * Returns a plain object { messageId: true, ... }.
 */
function loadProcessedIds() {
  try {
    var stored = PropertiesService.getScriptProperties().getProperty(PROCESSED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    Logger.log("[loadProcessedIds] Failed to load: " + e);
    return {};
  }
}

/**
 * Save the set of processed message IDs back to Script Properties.
 * Trims to the most recent 200 entries to stay well under the 9KB per-property limit.
 */
function saveProcessedIds(idsObj) {
  try {
    var keys = Object.keys(idsObj);
    if (keys.length > 200) {
      var trimmed = {};
      var recentKeys = keys.slice(keys.length - 200);
      for (var k = 0; k < recentKeys.length; k++) {
        trimmed[recentKeys[k]] = true;
      }
      idsObj = trimmed;
    }
    PropertiesService.getScriptProperties().setProperty(PROCESSED_KEY, JSON.stringify(idsObj));
  } catch (e) {
    Logger.log("[saveProcessedIds] Failed to save: " + e);
  }
}

// ─── Time-based payment trigger ───────────────────────────────────────────────
//
// HOW IT WORKS
// A time-based trigger fires processMaybankEmails() every 5 minutes.
// The function checks the Maybank / Maybank2 Gmail labels and processes any
// new payment emails found — dedup ensures each message is only processed once.
//
// NOTE: forGmail().onFiltersMatched() is a Gmail Add-on API and is NOT available
// in regular Apps Script projects (throws TypeError). A time-based trigger is
// the correct approach for standalone / container-bound scripts.
//
// PREREQUISITE
// Gmail filters must apply the "Maybank" and/or "Maybank2" labels to incoming
// Maybank PayNow alert emails.
//
// ONE-TIME SETUP (run once from the Apps Script editor):
//   1. Open this script in the Apps Script editor
//   2. Select "createPaymentTrigger" in the Run dropdown
//   3. Click ▶ Run — grant required permissions when prompted
//   4. Open Triggers (clock icon) to confirm the trigger appears

/**
 * Creates a time-based trigger that calls processMaybankEmails() every 5 minutes.
 * Safe to re-run — removes any existing trigger for processMaybankEmails or the
 * legacy onNewPaymentEmail handler before creating a fresh one.
 */
function createPaymentTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    var fn = existing[i].getHandlerFunction();
    if (fn === "processMaybankEmails" || fn === "onNewPaymentEmail") {
      ScriptApp.deleteTrigger(existing[i]);
      Logger.log("Removed existing trigger for: " + fn);
    }
  }

  ScriptApp.newTrigger("processMaybankEmails")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("Time-based trigger created — processMaybankEmails will run every 5 minutes");
}

/**
 * Removes all payment-related triggers (both current and legacy handler names).
 */
function deletePaymentTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < existing.length; i++) {
    var fn = existing[i].getHandlerFunction();
    if (fn === "processMaybankEmails" || fn === "onNewPaymentEmail") {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  Logger.log("Removed " + removed + " payment trigger(s)");
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

/**
 * Looks up the PaymentID (col A, index 0) for a given email.
 * Searches User tab col C (index 2) and col D (index 3).
 *
 * NOTE: col A stores the PaymentID (e.g. "mel"). col H is the phone number
 * field and is unrelated to payment matching.
 */
function lookupPaymentId(email) {
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[2])) === email ||
      normalizeEmail(String(row[3])) === email
    ) {
      return String(row[0] || ""); // col A = PaymentID
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
  // Session not found — allow the sign-up (not closed)
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
  // M/DD/YYYY HH:MM:SS — matches format of existing Payments rows (e.g. "3/20/2026 16:47:13")
  var m  = date.getMonth() + 1;
  var d  = date.getDate();
  var y  = date.getFullYear();
  var hh = String(date.getHours()).padStart(2, "0");
  var mm = String(date.getMinutes()).padStart(2, "0");
  var ss = String(date.getSeconds()).padStart(2, "0");
  return m + "/" + d + "/" + y + " " + hh + ":" + mm + ":" + ss;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Railway sync notification ────────────────────────────────────────────────
//
// Pings the Railway server to re-sync the relevant DB cache table immediately
// after a write. Called at the end of every function that modifies a sheet.
//
// Requires two Script Properties to be set (Settings → Script Properties):
//   RAILWAY_URL         e.g. https://fatuwr.up.railway.app
//   APPS_SCRIPT_SECRET  same value as APPS_SCRIPT_SECRET env var on Railway

function notifyRailway(tab) {
  try {
    var props  = PropertiesService.getScriptProperties();
    var url    = props.getProperty("RAILWAY_URL");
    var secret = props.getProperty("APPS_SCRIPT_SECRET");
    if (!url || !secret) {
      Logger.log("[notifyRailway] RAILWAY_URL or APPS_SCRIPT_SECRET not set — skipping");
      return;
    }
    UrlFetchApp.fetch(url + "/api/sync?tab=" + tab + "&token=" + secret, {
      method:            "post",
      muteHttpExceptions: true,
      followRedirects:    true,
    });
    Logger.log("[notifyRailway] Pinged Railway for tab=" + tab);
  } catch (e) {
    Logger.log("[notifyRailway] Failed: " + e);
  }
}

// ─── DB → Sheet sync (Sync from DB menu) ─────────────────────────────────────
//
// Pulls current DB data from the Railway server and overwrites each Sheet tab.
// Use this before manual reconciliation to ensure the Sheet matches the DB.
//
// SETUP: Set RAILWAY_URL and APPS_SCRIPT_SECRET in
//   Apps Script editor → Project Settings → Script Properties.
//
// The menu is added automatically when the spreadsheet is opened (onOpen trigger).
// To install it as a simple trigger, open the Apps Script editor and run
// the script once — the onOpen trigger fires automatically on open.

/**
 * Adds the "FATUWR Admin" menu to the spreadsheet UI.
 * Runs automatically when the spreadsheet is opened.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("FATUWR Admin")
    .addItem("Sync all tabs from DB", "syncAllTabsFromDb")
    .addSeparator()
    .addItem("Sync Sessions from DB",  "syncSessionsFromDb")
    .addItem("Sync Sign-ups from DB",  "syncSignupsFromDb")
    .addItem("Sync Payments from DB",  "syncPaymentsFromDb")
    .addItem("Sync Users from DB",     "syncUsersFromDb")
    .addToUi();
}

/**
 * Syncs all four tabs from the Railway DB.
 * Shows a summary alert when complete.
 */
function syncAllTabsFromDb() {
  var errors = [];
  var tabs = ["sessions", "signups", "payments", "users"];
  for (var i = 0; i < tabs.length; i++) {
    try {
      syncTabFromDb(tabs[i]);
    } catch (e) {
      errors.push(tabs[i] + ": " + e.message);
    }
  }
  var msg = errors.length === 0
    ? "All tabs synced successfully from DB."
    : "Completed with errors:\n" + errors.join("\n");
  try { SpreadsheetApp.getUi().alert(msg); } catch (uiErr) { Logger.log(msg); }
}

function syncSessionsFromDb()  { syncTabFromDb("sessions"); }
function syncSignupsFromDb()   { syncTabFromDb("signups"); }
function syncPaymentsFromDb()  { syncTabFromDb("payments"); }
function syncUsersFromDb()     { syncTabFromDb("users"); }

/**
 * Pulls the latest data for one tab from the Railway DB and writes it to the
 * corresponding Sheet tab (clearing old rows first, keeping the header).
 */
function syncTabFromDb(tab) {
  var props  = PropertiesService.getScriptProperties();
  var url    = props.getProperty("RAILWAY_URL");
  var secret = props.getProperty("APPS_SCRIPT_SECRET");
  if (!url || !secret) {
    var cfgMsg = "RAILWAY_URL and APPS_SCRIPT_SECRET must be set in Script Properties.\n" +
      "Go to: Apps Script editor → Project Settings → Script Properties.";
    Logger.log("[syncTabFromDb] " + cfgMsg);
    try { SpreadsheetApp.getUi().alert(cfgMsg); } catch (uiErr) { /* not in UI context */ }
    return;
  }

  var response = UrlFetchApp.fetch(
    url + "/api/export?tab=" + tab + "&token=" + secret,
    { muteHttpExceptions: true }
  );

  var statusCode = response.getResponseCode();
  if (statusCode !== 200) {
    throw new Error("HTTP " + statusCode + ": " + response.getContentText().substring(0, 200));
  }

  var data = JSON.parse(response.getContentText());
  if (!data.rows) {
    throw new Error("Response missing rows field for tab=" + tab);
  }

  writeRowsToTab(tab, data.rows);
  Logger.log("[syncTabFromDb] " + tab + " — wrote " + data.rows.length + " rows");
}

/**
 * Clears all data rows in the given Sheet tab (keeps header row 1) and writes
 * the supplied rows array starting from row 2.
 *
 * Safety: if rows is empty, the sheet is NOT cleared — this prevents data loss
 * when the DB table hasn't been seeded yet (e.g. after a fresh deployment).
 *
 * @param {string}    tab   One of: "sessions", "signups", "payments", "users"
 * @param {Array[][]} rows  Array of row arrays in sheet column order
 */
function writeRowsToTab(tab, rows) {
  var sheetName = tab === "sessions" ? TAB_SESSIONS
                : tab === "signups"  ? TAB_SIGNUPS
                : tab === "users"    ? TAB_USERS
                : tab === "payments" ? TAB_PAYMENTS : null;
  if (!sheetName) {
    Logger.log("[writeRowsToTab] Unknown tab: " + tab);
    return;
  }

  // Safety guard: never clear sheet data when DB returned 0 rows.
  // This prevents data loss if the DB table is empty / not yet seeded.
  if (!rows || rows.length === 0) {
    Logger.log("[writeRowsToTab] " + tab + " — 0 rows returned from DB, skipping to avoid data loss");
    return;
  }

  var sheet   = getSheet(sheetName);
  var lastRow = sheet.getLastRow();

  // Clear existing data rows (row 2 onwards), keep header row 1
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }

  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}
