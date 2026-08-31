/**
 * FATUWR Training Portal — Google Apps Script
 * Sheet ID: 19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM
 *
 * v17 changes (2026-09-01):
 *   Rebased on the LIVE editor source, not the repo's Code.gs. The repo file had
 *   drifted well behind the deployed script: the live version already carries the
 *   doPost shared-secret check, editPaymentRow (v13 + its Bug 16 patches), the
 *   v14 heartbeat and the v16 B1 reference resolution — none of which the repo's
 *   Code.gs contained. Verified against the deployment by probe: "editPayment"
 *   answers correctly, so payment EDITING was never broken.
 *
 *   - NEW addPaymentRow() + doPost "addPayment" route. The admin "+ Add payment"
 *     button wrote DB-only, with no Sheet row and no rowIndex, so the row was
 *     erased by the next syncTab("payments") DELETE+INSERT. Probe confirmed the
 *     deployment answers "Unknown action: addPayment" — the route never existed.
 *   - NEW deletePaymentRow() + doPost "deletePayment" route. Soft delete: zeroes
 *     col D and attaches a note. Deliberately NOT deleteRow() — removing a row
 *     shifts every rowIndex below it, invalidating every cached rowIndex in the
 *     DB and making the next edit write to the WRONG payment. Zeroing makes the
 *     row vanish from the app via the existing amount===0 skip in
 *     fetchSheetsPayments(), while keeping the raw Maybank email body in col A.
 *   - editPaymentRow() now REJECTS a zero amount. Saving 0 would drop the row
 *     from the DB and leave it unreachable from the UI. Clearing a payment is
 *     deletePaymentRow's job now.
 *   - appendPaymentRow() (the 1-min Maybank cron path) takes the SAME script lock
 *     as addPaymentRow. GAS locks are cooperative: a lock held by only one of two
 *     writers is a no-op, and the cron could otherwise append between the admin's
 *     appendRow and getLastRow, returning a row number belonging to a real bank
 *     payment — which a later edit would then overwrite.
 *   - New payment dates are written as real Date objects, never strings. Col C
 *     holds genuine date values (verified: serial 46022.729 = "12/31/2025 17:30:00").
 *   - REMOVED dead Gmail add-on code: buildAddOnHomepage, onNewPaymentEmail,
 *     createPaymentTrigger, deletePaymentTrigger, TRIGGER_MODE. Near-real-time
 *     Gmail delivery needs an add-on deployment that was never done; the 1-min
 *     time-based cron is the actual mechanism. Verified no trigger references
 *     them (Triggers panel holds only processMaybankEmails and gasHeartbeat).
 *   - doGet reports v17. The string had been stuck at "v7" since April, which is
 *     what made the repo/editor drift invisible.
 *
 * v9 changes (2026-04-18):
 *   - Gmail Add-on support: added buildAddOnHomepage() so the manifest can declare
 *     this script as a Gmail Add-on. Once deployed as an add-on (test deployment),
 *     createPaymentTrigger() can install the forGmail().onFiltersMatched() trigger
 *     which fires within seconds of email delivery — true near-real-time.
 *   - createPaymentTrigger(): MODE constant at the top controls behaviour:
 *       "addon"  → installs forGmail().onFiltersMatched() — requires add-on deployment
 *       "timer"  → falls back to every-1-minute time-based poll (default if not add-on)
 *   - Time-based fallback improved from 5 min → 1 min (Apps Script minimum).
 *   - See SETUP INSTRUCTIONS below for how to deploy as a Gmail Add-on.
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
  return jsonResponse({ status: "ok", message: "FATUWR GAS v17 running" });
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);

    // Validate shared secret — same value as APPS_SCRIPT_SECRET in Railway
    var secret = PropertiesService.getScriptProperties().getProperty("APPS_SCRIPT_SECRET");
    if (!secret || params.token !== secret) {
      return jsonResponse({ status: "error", message: "Unauthorized" });
    }

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
    if (action === "editPayment")         return editPaymentRow(params);
    if (action === "addPayment")          return addPaymentRow(params);
    if (action === "deletePayment")       return deletePaymentRow(params);

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
  // Changed 28 June 
 
 
 
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

// ─── Admin payment writes (v17) ───────────────────────────────────────────────
//
// The Sheet is the source of truth for payments. These write the Sheet FIRST;
// the server awaits the result and only mirrors to the DB on success. A DB-only
// write is erased by the next syncTab("payments"), which does a full
// DELETE + INSERT of sheet_payments from the Sheet.
//
// Neither calls notifyRailway("payments") — see Bug 16. The Sheets API can serve
// pre-flush cached values for seconds after a GAS write, so an immediate Sheet→DB
// sync reads stale cells and reverts the change. editPaymentRow already follows
// this rule (flush, no notify); these match it.

var _paymentTz = null;

// The spreadsheet's timezone (Asia/Singapore). Dates must be built against this,
// not Session.getScriptTimeZone() — if the two differ, a payment written near
// midnight lands on the adjacent calendar day.
function paymentTimeZone() {
  if (!_paymentTz) _paymentTz = SpreadsheetApp.openById(SHEET_ID).getSpreadsheetTimeZone();
  return _paymentTz;
}

// Coerces an incoming date to a real Date for writing to col C, or null if there
// is nothing meaningful to write.
//
// Col C holds genuine date values, so we setValue() a Date object rather than a
// string. A string would be re-parsed using the SPREADSHEET's locale, which
// silently swaps month and day in any non-US locale. (This sheet is en_US, so
// today a string would work — but that is a property of the sheet's settings,
// not of this code, and it should not be load-bearing.)
function toPaymentDate(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  var str = String(value == null ? "" : value).trim();
  if (!str) return null;

  var m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);              // YYYY-MM-DD
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {                                                         // M/D/YYYY [HH:MM:SS]
    return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]),
                    Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  }

  var loose = new Date(str);
  return isNaN(loose.getTime()) ? null : loose;
}

// Renders a Date in the canonical sheet format, in the spreadsheet's timezone.
// Returned to the server so the DB stores exactly the string the next sync will
// read back out of the Sheet, instead of the raw "YYYY-MM-DD" the client sent.
function formatPaymentDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  return Utilities.formatDate(date, paymentTimeZone(), "M/d/yyyy HH:mm:ss");
}

/**
 * Append a manually-entered payment to the Payments tab.
 *
 * Returns the new row's 1-based sheet row number as `rowIndex`, and the exact
 * date string written as `date`, so the server can mirror both. rowIndex is the
 * only stable handle to a payment row — sheet_payments.id is an auto-increment
 * that is reassigned on every sync cycle.
 */
function addPaymentRow(params) {
  var amount = Number(params.amount);
  if (!amount || isNaN(amount)) {
    return jsonResponse({ status: "error", message: "amount is required and must be non-zero" });
  }

  var dateVal   = toPaymentDate(params.date);
  var reference = params.reference == null ? "" : String(params.reference);
  var paymentId = params.paymentId == null ? "" : String(params.paymentId);
  var email     = params.email     == null ? "" : String(params.email);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (e) {
    return jsonResponse({ status: "error", message: "Sheet is busy, nothing was written. Please try again." });
  }

  try {
    var sheet = getSheet(TAB_PAYMENTS);
    sheet.appendRow([
      "[Added manually via admin portal]", // col A — no raw email body exists
      "",                                  // col B — no subject
      dateVal || "",                       // col C — real Date, not a string
      amount,                              // col D
      reference,                           // col E
      paymentId,                           // col F
      email,                               // col G
    ]);
    SpreadsheetApp.flush();

    var rowIndex = sheet.getLastRow();
    Logger.log("[addPaymentRow] appended row " + rowIndex +
               " amount=" + amount + " paymentId=" + paymentId + " email=" + email);

    return jsonResponse({
      status: "success",
      rowIndex: rowIndex,
      date: formatPaymentDate(dateVal),
    });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Remove a payment from the app by zeroing col D and attaching a note.
 *
 * Deliberately NOT sheet.deleteRow(). Deleting a row shifts every row below it up
 * by one, so every rowIndex cached in sheet_payments below that point becomes
 * off-by-one, and the next admin edit would write to the WRONG payment until a
 * sync re-derived them. Zeroing keeps every rowIndex stable permanently.
 *
 * fetchSheetsPayments() skips amount===0 rows, so the payment disappears from the
 * DB and the app on the next sync while the Sheet keeps the row — including the
 * raw Maybank email body in col A, the only forensic record of a real transfer.
 * Reversible by restoring the amount in the Sheet.
 */
function deletePaymentRow(params) {
  var rowIndex = Number(params.rowIndex);
  if (!rowIndex || rowIndex < 2) {
    return jsonResponse({ status: "error", message: "rowIndex must be >= 2 (row 1 is the header)" });
  }

  var sheet   = getSheet(TAB_PAYMENTS);
  var lastRow = sheet.getLastRow();
  if (rowIndex > lastRow) {
    return jsonResponse({
      status: "error",
      message: "rowIndex " + rowIndex + " out of range (sheet has " + lastRow + " rows)"
    });
  }

  var cell = sheet.getRange(rowIndex, 4);
  var was  = cell.getValue();
  if (Number(was) === 0) {
    // Already cleared — treat as success so a retry is harmless.
    return jsonResponse({ status: "success", alreadyDeleted: true });
  }

  cell.setValue(0);
  cell.setNote("Removed via admin portal on " +
               Utilities.formatDate(new Date(), paymentTimeZone(), "yyyy-MM-dd HH:mm:ss") +
               " — original amount " + was);
  SpreadsheetApp.flush();

  Logger.log("[deletePaymentRow] row " + rowIndex + " zeroed (was " + was + ")");
  return jsonResponse({ status: "success", previousAmount: Number(was) });
}

// ─── Payment email processing ─────────────────────────────────────────────────
//
// processMaybankEmails() is called by the 1-minute time-based trigger and
// can also be run manually from the Apps Script editor.
//
// Both Gmail label variants route to "Maybank_Done2":
//   "Maybank"  → processed → moved to "Maybank_Done2"
//   "Maybank2" → processed → moved to "Maybank_Done2"
//
// Threads are only moved to the done label if all sheet writes succeeded.
// If appendPaymentRow fails for any message in a thread, the thread stays
// in the source label so the next trigger run can retry it.
//
// Dedup is primary via label removal and secondary via Script Properties
// (last 200 message IDs stored under the key "processedMaybankIds").

function processMaybankEmails() {
  // ── OAuth validity check ────────────────────────────────────────────────────
  // GmailApp.getInboxUnreadCount() requires the Gmail OAuth scope. If permissions
  // have been revoked (password change, long inactivity, scope change after an
  // edit), this throws immediately rather than silently doing nothing.
  try {
    GmailApp.getInboxUnreadCount();
  } catch (authErr) {
    var msg = "processMaybankEmails: OAuth invalid or permissions revoked.\n\n" +
              "Error: " + authErr.message + "\n\n" +
              "Fix: open the Apps Script editor, run the function manually, " +
              "and re-grant permissions when prompted. Then verify the trigger " +
              "is still active in the Triggers panel.";
    Logger.log("[processMaybankEmails] " + msg);
    try {
      MailApp.sendEmail("tanmelanie@gmail.com", "⚠️ FATUWR GAS: permissions revoked", msg);
    } catch (mailErr) {
      Logger.log("[processMaybankEmails] Could not send alert email: " + mailErr);
    }
    return;
  }

  processMaybankLabel("Maybank",  "Maybank_Done2");
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

    // Track whether every attempted sheet write in this thread succeeded.
    // If any write fails, we leave the thread in the source label for retry.
    var threadWriteOk = true;

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
        // Couldn't extract payment info — mark as processed to avoid re-tries
        processedIds[msgId] = true;
        Logger.log("[" + labelName + "] Could not parse message " + msgId + " — marking done, skipping");
        continue;
      }

      try {
        appendPaymentRow(parsed);
        processedIds[msgId] = true;
        newCount++;
        Logger.log("[" + labelName + "] Wrote payment row: amount=" + parsed.amount + " othr=" + parsed.othr);
      } catch (writeErr) {
        // Sheet write failed — do NOT mark as processed, do NOT move thread
        threadWriteOk = false;
        Logger.log("[" + labelName + "] Sheet write failed for message " + msgId + ": " + writeErr);
      }
    }

    // Only move thread to done label if every write in this thread succeeded.
    // A failed write means the thread stays in the source label for next retry.
    if (threadWriteOk) {
      try {
        thread.addLabel(doneLabel);
        thread.removeLabel(label);
      } catch (labelErr) {
        Logger.log("[" + labelName + "] Label move failed for thread: " + labelErr);
      }
    } else {
      Logger.log("[" + labelName + "] Thread left in source label — write failure(s) will be retried");
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

  // Take the SAME script lock addPaymentRow uses. GAS locks are cooperative — a
  // lock held by only one of two writers protects nothing. Without this, an append
  // here can land between the admin's appendRow and getLastRow, so the admin's
  // payment is recorded against THIS row's number and a later edit overwrites this
  // real bank payment. The lookup above stays outside the lock: it makes a
  // UrlFetch call and must not hold the sheet while it waits.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (e) {
    // Couldn't get the lock — leave the message unprocessed. The Gmail label is
    // only moved after a successful append, so the next cron tick retries it.
    Logger.log("[appendPaymentRow] lock timeout — deferring to next run");
    throw new Error("Could not acquire sheet lock");
  }

  try {
    sheet.appendRow([
      parsed.body,          // [0] col A — Maybank Payment Message (raw body)
      parsed.subject,       // [1] col B — Subject
      parsed.date,          // [2] col C — Date
      parsed.amount,        // [3] col D — Amount
      parsed.othr,          // [4] col E — OTHR Message (reference text)
      userInfo.paymentId,   // [5] col F — PaymentID Match (GAS-resolved)
      userInfo.email,       // [6] col G — Email (GAS-resolved)
    ]);
    SpreadsheetApp.flush();
    Logger.log("appendPaymentRow — othr=" + parsed.othr + " → paymentId=" + userInfo.paymentId + " email=" + userInfo.email);
  } finally {
    lock.releaseLock();
  }
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

  // ── Primary: resolve against the live DB via Railway ──
  try {
    var props  = PropertiesService.getScriptProperties();
    var url     = props.getProperty("RAILWAY_URL");
    var secret  = props.getProperty("APPS_SCRIPT_SECRET");
    if (url && secret) {
      var resp = UrlFetchApp.fetch(
        url + "/api/resolve-payment-ref?ref=" + encodeURIComponent(ref) +
              "&token=" + encodeURIComponent(secret),
        { method: "get", muteHttpExceptions: true, followRedirects: true }
      );
      if (resp.getResponseCode() === 200) {
        var data = JSON.parse(resp.getContentText());
        if (data && data.paymentId) {
          Logger.log("lookupUserByPaymentRef: DB match ref=" + ref + " → " + data.paymentId);
          return { paymentId: String(data.paymentId), email: String(data.email || "") };
        }
      } else {
        Logger.log("lookupUserByPaymentRef: DB lookup HTTP " + resp.getResponseCode() + " — falling back to sheet");
      }
    } else {
      Logger.log("lookupUserByPaymentRef: RAILWAY_URL/APPS_SCRIPT_SECRET not set — using sheet");
    }
  } catch (e) {
    Logger.log("lookupUserByPaymentRef: DB lookup failed (" + e + ") — falling back to sheet");
  }

  // ── Fallback: local sheet User tab (col A = PaymentID) ──
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row    = data[i];
    var colA   = String(row[0] || "").toLowerCase().trim();
    if (colA && colA === ref) {
      return {
        paymentId: String(row[0] || ""),
        email:     (String(row[3] || "")).toLowerCase().trim(),
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


// ─── editPaymentRow (v13) ─────────────────────────────────────────────────────
// Updates any editable column in the Payments tab for a specific row identified
// by its 1-based sheet row number (rowIndex, stored in DB as sheetPayments.rowIndex).
//
// The server AWAITS this call and only updates the DB after this succeeds.
// If this returns an error, the server throws a TRPCError so the admin sees
// the failure and can retry — the DB is NOT updated in that case.
//
// After writing, notifyRailway("payments") triggers a DB re-sync from the
// (now-updated) Sheet, ensuring Sheet and DB stay consistent.
//
// Payments tab column mapping (1-based for getRange):
//   col 3 (C) = Date
//   col 4 (D) = Amount
//   col 5 (E) = OTHR Message / Reference
//   col 6 (F) = PaymentID Match
//   col 7 (G) = Email
//
// Expected params:
//   rowIndex   {number}  1-based sheet row (must be >= 2; row 1 = header)
//   date       {string}  new value for col C — optional
//   amount     {number}  new value for col D — optional
//   reference  {string}  new value for col E (OTHR) — optional
//   paymentId  {string}  new value for col F — optional
//   email      {string}  new value for col G — optional

function editPaymentRow(params) {
  var rowIndex  = Number(params.rowIndex);
  var date      = params.date;
  var amount    = params.amount;
  var reference = params.reference;
  var paymentId = params.paymentId;
  var email     = params.email;

  if (!rowIndex || rowIndex < 2) {
    return jsonResponse({ status: "error", message: "rowIndex must be >= 2 (row 1 is the header)" });
  }

  // Reject a zeroed amount. fetchSheetsPayments() skips amount===0 rows, so
  // saving 0 here would drop the row from the DB entirely and leave it
  // unreachable from the UI — there would be no row left to edit back.
  // Clearing a payment is deletePaymentRow's job.
  if (amount !== undefined && amount !== null) {
    var amtCheck = Number(amount);
    if (!amtCheck || isNaN(amtCheck)) {
      return jsonResponse({
        status: "error",
        message: "Amount must be non-zero. To remove this payment, use Delete instead."
      });
    }
  }

  var sheet   = getSheet(TAB_PAYMENTS);
  var lastRow = sheet.getLastRow();

  if (rowIndex > lastRow) {
    return jsonResponse({
      status: "error",
      message: "rowIndex " + rowIndex + " out of range (sheet has " + lastRow + " rows)"
    });
  }

  if (date !== undefined && date !== null) {
    sheet.getRange(rowIndex, 3).setValue(date);           // col C — Date
    Logger.log("[editPaymentRow] row " + rowIndex + " col C → " + date);
  }
  if (amount !== undefined && amount !== null) {
    sheet.getRange(rowIndex, 4).setValue(Number(amount)); // col D — Amount
    Logger.log("[editPaymentRow] row " + rowIndex + " col D → " + amount);
  }
  if (reference !== undefined && reference !== null) {
    sheet.getRange(rowIndex, 5).setValue(reference);      // col E — OTHR / Reference
    Logger.log("[editPaymentRow] row " + rowIndex + " col E → " + reference);
  }
  if (paymentId !== undefined && paymentId !== null) {
    sheet.getRange(rowIndex, 6).setValue(paymentId);      // col F — PaymentID Match
    Logger.log("[editPaymentRow] row " + rowIndex + " col F → " + paymentId);
  }
  if (email !== undefined && email !== null) {
    sheet.getRange(rowIndex, 7).setValue(email || "");    // col G — Email
    Logger.log("[editPaymentRow] row " + rowIndex + " col G → " + (email || ""));
  }

  SpreadsheetApp.flush();   // ← commit all setValue() calls before server reads Sheet
  return jsonResponse({ status: "success" });
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────
//
// gasHeartbeat() pings POST /api/health/gas-heartbeat on Railway. The server's
// health monitor alerts only when this heartbeat stops — reactive notifyRailway
// calls (sign-ups, admin edits, new payment emails) no longer reset the timer,
// so a broken heartbeat trigger can't be masked by sporadic activity.
//
// ONE-TIME SETUP (run once from the Apps Script editor):
//   1. Select "createHeartbeatTrigger" in the function dropdown
//   2. Click ▶ Run — grant permissions when prompted
//   3. Open Triggers (clock icon) to confirm a "gasHeartbeat" time-based
//      trigger appears (firing every 30 min)

function gasHeartbeat() {
  try {
    var props  = PropertiesService.getScriptProperties();
    var url    = props.getProperty("RAILWAY_URL");
    var secret = props.getProperty("APPS_SCRIPT_SECRET");
    if (!url || !secret) {
      Logger.log("[gasHeartbeat] RAILWAY_URL or APPS_SCRIPT_SECRET not set — skipping");
      return;
    }
    UrlFetchApp.fetch(url + "/api/health/gas-heartbeat?token=" + secret, {
      method:             "post",
      muteHttpExceptions: true,
      followRedirects:    true,
    });
    Logger.log("[gasHeartbeat] Pinged Railway");
  } catch (e) {
    Logger.log("[gasHeartbeat] Failed: " + e);
  }
}

/**
 * Creates the time-based trigger that runs gasHeartbeat() every 30 minutes.
 * Run this ONCE from the Apps Script editor.
 * Safe to re-run — removes any existing trigger for gasHeartbeat first.
 */
function createHeartbeatTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "gasHeartbeat") {
      ScriptApp.deleteTrigger(existing[i]);
      Logger.log("Removed existing heartbeat trigger");
    }
  }

  ScriptApp.newTrigger("gasHeartbeat")
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log("Heartbeat trigger created — gasHeartbeat will fire every 30 min");
}

/**
 * Removes the heartbeat trigger.
 */
function deleteHeartbeatTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "gasHeartbeat") {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  Logger.log("Removed " + removed + " trigger(s) for gasHeartbeat");
}

