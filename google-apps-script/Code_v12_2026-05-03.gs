/**
 * FATUWR Training Portal — Google Apps Script
 * Sheet ID: 19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM
 *
 * v12 changes (2026-05-03):
 *   - doPost: added "editPayment" action routing.
 *   - editPaymentRow(): new function — updates col F (PaymentID Match) and
 *     col G (Email) for a Payments tab row by its 1-based sheet row number.
 *     The row number is stored in the DB (sheetPayments.rowIndex) during sync
 *     and passed from the server when an admin edits a payment. This ensures
 *     the Sheet stays in sync with admin edits so the next DB sync (triggered
 *     by the 1-min processMaybankEmails cron) can't overwrite them.
 *     After the write, notifyRailway("payments") is called so the DB re-syncs.
 *
 * Production base: v9 (with v11 features applied) — includes TRIGGER_MODE,
 *   buildAddOnHomepage, onNewPaymentEmail, dual-mode createPaymentTrigger,
 *   OAuth check in processMaybankEmails, threadWriteOk in processMaybankLabel.
 *
 * v11 changes (2026-04-26):
 *   - processMaybankEmails: added OAuth validity check (GmailApp.getInboxUnreadCount).
 *   - processMaybankLabel: appendPaymentRow wrapped in try/catch per message;
 *     threadWriteOk guards label moves so failed writes stay for retry.
 *
 * v10 changes (2026-04-18):
 *   - Removed forGmail().onFiltersMatched() from regular script (API doesn't exist).
 *   - createPaymentTrigger() uses TRIGGER_MODE to switch between addon and timer.
 *
 * v9 changes (2026-04-18):
 *   - Gmail Add-on support: buildAddOnHomepage(), onNewPaymentEmail().
 *   - createPaymentTrigger(): TRIGGER_MODE "addon" | "timer".
 *   - Time-based fallback improved from 5 min → 1 min.
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
 *   [21] Venue / Pool Cost      (col V)
 *   [22] Revenue                (col W)
 *   [23] PnL                    (col X)  ← sheet formula, not written by GAS
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
 *   [0]  Payment ID                  (col A)
 *   [1]  Name                        (col B)
 *   [2]  User Email                  (col C)
 *   [3]  Email                       (col D)
 *   [4]  Image                       (col E)
 *   [5]  Club Role                   (col F)
 *   [6]  Annual Membership Start     (col G)
 *   [7]  Phone Number                (col H)
 *   [8]  Birth Date                  (col I)
 *   [9]  Membership Status           (col J)
 *   [10] Trial Start Date            (col K)
 *   [11] Trial End Date              (col L)
 *   [12] Date Created                (col M)
 *
 * Payments tab columns (0-indexed) — verified against live sheet:
 *   [0]  Maybank Payment Message     (col A)
 *   [1]  Subject                     (col B)
 *   [2]  Date                        (col C)
 *   [3]  Amount                      (col D)
 *   [4]  OTHR Message                (col E)
 *   [5]  PaymentID Match             (col F) ← GAS-resolved
 *   [6]  Email                       (col G) ← GAS-resolved
 */

var SHEET_ID     = "19Vxpj2AoJizVwhkSxEtV70yKDlWMyrfQGDIu6k6RSRM";
var TAB_SESSIONS = "Training Sessions";
var TAB_SIGNUPS  = "Training Sign-ups";
var TAB_USERS    = "User";
var TAB_PAYMENTS = "Payments";

// ─── Entry points ─────────────────────────────────────────────────────────────

function doGet(e) {
  return jsonResponse({ status: "ok", message: "FATUWR GAS v12 running" });
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var action = params.action;

    if (action === "submitSignUp")        return submitSignUp(params);
    if (action === "editSignup")          return editSignup(params);
    if (action === "deleteSignup")        return deleteSignup(params);
    if (action === "createUser")          return createUser(params);
    if (action === "updateTrialSignup")   return updateTrialSignup(params);
    if (action === "updateMemberSignup")  return updateMemberSignup(params);
    if (action === "grantStudentStatus")  return grantStudentStatus(params);
    if (action === "updateUser")          return updateUser(params);
    if (action === "addSession")          return addSession(params);
    if (action === "closeSession")        return closeSession(params);
    if (action === "addMembershipSignup") return addMembershipSignup(params);
    if (action === "editPayment")         return editPaymentRow(params);

    return jsonResponse({ status: "error", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ─── submitSignUp ─────────────────────────────────────────────────────────────

function submitSignUp(params) {
  var email        = normalizeEmail(params.email);
  var trainingDate = params.trainingDate;
  var pool         = (params.pool || "").trim();
  var name         = params.name || "";
  var activity     = params.activity || "";
  var baseFee      = Number(params.baseFee) || 0;
  var actualFee    = Number(params.actualFee) || 0;
  var memberOnDate = params.memberOnTrainingDate || "";

  var sessionCheck = checkSessionClosed(trainingDate, pool);
  if (sessionCheck.closed) {
    return jsonResponse({ status: "error", message: "Session is closed" });
  }

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

  var paymentId   = lookupPaymentId(email);
  var now         = new Date();
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
      var sheetRow = i + 2;
      sheet.getRange(sheetRow, 7).setValue(activity);
      sheet.getRange(sheetRow, 8).setValue(activity);
      sheet.getRange(sheetRow, 9).setValue(baseFee);
      sheet.getRange(sheetRow, 10).setValue(actualFee);
      notifyRailway("signups");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "Sign-up not found" });
}

// ─── deleteSignup ─────────────────────────────────────────────────────────────

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
      sheet.deleteRow(i + 2);
      notifyRailway("signups");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "Sign-up not found" });
}

// ─── createUser ───────────────────────────────────────────────────────────────

function createUser(params) {
  var name      = params.name || "";
  var email     = normalizeEmail(params.email);
  var paymentId = params.paymentId || "";
  var phone     = params.phone || "";
  var dob       = params.dob || "";

  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);

  for (var i = 0; i < data.length; i++) {
    if (
      normalizeEmail(String(data[i][2])) === email ||
      normalizeEmail(String(data[i][3])) === email
    ) {
      var sheetRow = i + 2;
      if (paymentId) sheet.getRange(sheetRow, 1).setValue(paymentId);
      if (name)      sheet.getRange(sheetRow, 2).setValue(name);
      if (phone)     sheet.getRange(sheetRow, 8).setValue(phone);
      if (dob)       sheet.getRange(sheetRow, 9).setValue(dob);
      notifyRailway("users");
      return jsonResponse({ status: "updated" });
    }
  }

  sheet.appendRow([
    paymentId,
    name,
    email,
    email,
    "",
    "",
    "",
    phone,
    dob,
    "Non-Member",
    "NA",
    "",
    new Date(),
  ]);

  notifyRailway("users");
  return jsonResponse({ status: "success" });
}

// ─── updateTrialSignup ────────────────────────────────────────────────────────

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
      sheet.getRange(sheetRow, 10).setValue("Trial");
      sheet.getRange(sheetRow, 11).setValue(formatDate(today));
      sheet.getRange(sheetRow, 12).setValue(formatDate(endDate));
      notifyRailway("users");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── updateMemberSignup ───────────────────────────────────────────────────────

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
      sheet.getRange(i + 2, 10).setValue("Member");
      notifyRailway("users");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── grantStudentStatus ───────────────────────────────────────────────────────

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
      sheet.getRange(i + 2, 10).setValue("Student");
      notifyRailway("users");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── updateUser ───────────────────────────────────────────────────────────────

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
        sheet.getRange(sheetRow, 10).setValue(memberStatus);
        if (memberStatus === "Trial") {
          var today   = new Date();
          var endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 30);
          sheet.getRange(sheetRow, 11).setValue(formatDate(today));
          sheet.getRange(sheetRow, 12).setValue(formatDate(endDate));
        }
      }
      if (clubRole !== undefined && clubRole !== null) {
        sheet.getRange(sheetRow, 6).setValue(clubRole);
      }
      if (trialStart !== undefined && trialStart !== null) {
        sheet.getRange(sheetRow, 11).setValue(trialStart);
      }
      if (trialEnd !== undefined && trialEnd !== null) {
        sheet.getRange(sheetRow, 12).setValue(trialEnd);
      }
      notifyRailway("users");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "User not found" });
}

// ─── addMembershipSignup ─────────────────────────────────────────────────────

function addMembershipSignup(params) {
  var email     = normalizeEmail(params.email);
  var name      = params.name || "";
  var activity  = params.activity || "Membership Fee";
  var actualFee = Number(params.actualFee) || 0;

  var paymentId   = lookupPaymentId(email);
  var now         = new Date();
  var dateTimeStr = formatDateTime(now);

  var sheet = getSheet(TAB_SIGNUPS);
  sheet.appendRow([
    name,
    email,
    paymentId,
    dateTimeStr,
    "",
    dateTimeStr,
    activity,
    "",
    "",
    actualFee,
    "",
  ]);

  notifyRailway("signups");
  return jsonResponse({ status: "success" });
}

// ─── addSession ───────────────────────────────────────────────────────────────

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
    trainingDate,      // [0]  col A
    day,               // [1]  col B
    trainingTime,      // [2]  col C
    pool,              // [3]  col D
    "",                // [4]  col E — Pool Image URL
    memberFee,         // [5]  col F
    nonMemberFee,      // [6]  col G
    memberSwimFee,     // [7]  col H
    nonMemberSwimFee,  // [8]  col I
    studentFee,        // [9]  col J
    studentSwimFee,    // [10] col K
    trainerFee,        // [11] col L
    notes,             // [12] col M
    rowId,             // [13] col N
    0,                 // [14] col O — Attendance
    "",                // [15] col P — isClosed
    trainingObjective, // [16] col Q
    "",                // [17] col R
    "",                // [18] col S
    "",                // [19] col T — Sign-Up Close Time
    "",                // [20] col U
    venueCost,         // [21] col V — Venue / Pool Cost
  ]);

  notifyRailway("sessions");
  return jsonResponse({ status: "success", rowId: rowId });
}

// ─── closeSession ─────────────────────────────────────────────────────────────

function closeSession(params) {
  var rowId = (params.rowId || "").trim();
  if (!rowId) {
    return jsonResponse({ status: "error", message: "rowId is required" });
  }

  var sheet = getSheet(TAB_SESSIONS);
  var data  = getSheetData(sheet);

  for (var i = 0; i < data.length; i++) {
    if (String(data[i][13] || "").trim() === rowId) {
      sheet.getRange(i + 2, 16).setValue("Closed");
      notifyRailway("sessions");
      return jsonResponse({ status: "success" });
    }
  }

  return jsonResponse({ status: "error", message: "Session not found" });
}

// ─── editPaymentRow (v12) ─────────────────────────────────────────────────────
// Updates col F (PaymentID Match) and/or col G (Email) for a specific Payments
// tab row identified by its 1-based sheet row number.
//
// rowIndex is stored in the DB (sheetPayments.rowIndex) during sync and sent
// from the server when an admin saves a payment edit. The server awaits this
// call before updating the DB, so any subsequent 1-min cron sync reads the
// already-updated Sheet values and cannot overwrite the edit.
//
// Expected params:
//   rowIndex   {number}  1-based sheet row (must be >= 2; row 1 = header)
//   paymentId  {string}  new value for col F — optional
//   email      {string}  new value for col G — optional

function editPaymentRow(params) {
  var rowIndex  = Number(params.rowIndex);
  var paymentId = params.paymentId;
  var email     = params.email;

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

  if (paymentId !== undefined && paymentId !== null) {
    sheet.getRange(rowIndex, 6).setValue(paymentId); // col F — PaymentID Match
    Logger.log("[editPaymentRow] row " + rowIndex + " col F → " + paymentId);
  }
  if (email !== undefined && email !== null) {
    sheet.getRange(rowIndex, 7).setValue(email || ""); // col G — Email
    Logger.log("[editPaymentRow] row " + rowIndex + " col G → " + (email || ""));
  }

  notifyRailway("payments");
  return jsonResponse({ status: "success" });
}

// ─── Payment email processing ─────────────────────────────────────────────────

function processMaybankEmails() {
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
    var threadWriteOk = true;

    for (var m = 0; m < messages.length; m++) {
      var msg   = messages[m];
      var msgId = msg.getId();

      if (processedIds[msgId]) {
        Logger.log("[" + labelName + "] Skipping already-processed message " + msgId);
        continue;
      }

      var parsed = parseMaybankEmail(msg);
      if (!parsed) {
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
        threadWriteOk = false;
        Logger.log("[" + labelName + "] Sheet write failed for message " + msgId + ": " + writeErr);
      }
    }

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

function parseMaybankEmail(message) {
  var body    = message.getPlainBody() || "";
  var subject = message.getSubject() || "";
  var date    = message.getDate();

  Logger.log("Parsing message id=" + message.getId() + " subject=" + subject);

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
      if (!isNaN(parsed) && parsed > 0) { amount = parsed; break; }
    }
  }

  var othr = "";
  var othrPatterns = [
    /\(ref-OTHR-([^)]+)\)/i,
    /OTHR[-\/\s:]+([^\s\n\r\/|,)]+)/i,
    /Sender['']?s?\s+Ref(?:erence)?[^:\n]*:\s*(?:OTHR[-\/])?([^\n\r|,]+)/i,
    /Payment\s+Ref(?:erence)?[^:\n]*:\s*(?:OTHR[-\/])?([^\n\r|,]+)/i,
    /Reference[^:\n]*:\s*(?:OTHR[-\/])?([^\n\r|,]{1,50})/i,
  ];
  for (var j = 0; j < othrPatterns.length; j++) {
    var om = body.match(othrPatterns[j]);
    if (om) {
      var candidate = om[1].trim().replace(/\s+/g, " ").replace(/\s*\|.*$/, "").trim();
      if (candidate) { othr = candidate; break; }
    }
  }

  Logger.log("Parsed — amount: " + amount + ", othr: " + othr);

  if (amount === 0 && !othr) {
    Logger.log("Skipping — could not parse amount or othr from body: " + body.substring(0, 300));
    return null;
  }

  return {
    body:    body.substring(0, 5000),
    subject: subject,
    date:    formatDateTime(date),
    amount:  amount,
    othr:    othr,
  };
}

function appendPaymentRow(parsed) {
  var sheet    = getSheet(TAB_PAYMENTS);
  var userInfo = lookupUserByPaymentRef(parsed.othr);

  sheet.appendRow([
    parsed.body,
    parsed.subject,
    parsed.date,
    parsed.amount,
    parsed.othr,
    userInfo.paymentId,
    userInfo.email,
  ]);

  Logger.log("appendPaymentRow — othr=" + parsed.othr + " → paymentId=" + userInfo.paymentId + " email=" + userInfo.email);
}

function lookupUserByPaymentRef(reference) {
  var ref = (reference || "").toLowerCase().trim();
  if (!ref) return { paymentId: "", email: "" };

  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);

  for (var i = 0; i < data.length; i++) {
    var colA = String(data[i][0] || "").toLowerCase().trim();
    if (colA && colA === ref) {
      return {
        paymentId: String(data[i][0] || ""),
        email:     String(data[i][3] || "").toLowerCase().trim(),
      };
    }
  }

  Logger.log("lookupUserByPaymentRef: no match for reference=" + reference);
  return { paymentId: "", email: "" };
}

function getLabelOrCreate(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) {
    label = GmailApp.createLabel(name);
    Logger.log("Created Gmail label: " + name);
  }
  return label;
}

var PROCESSED_KEY = "processedMaybankIds";

function loadProcessedIds() {
  try {
    var stored = PropertiesService.getScriptProperties().getProperty(PROCESSED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    Logger.log("[loadProcessedIds] Failed to load: " + e);
    return {};
  }
}

function saveProcessedIds(idsObj) {
  try {
    var keys = Object.keys(idsObj);
    if (keys.length > 200) {
      var trimmed = {};
      var recentKeys = keys.slice(keys.length - 200);
      for (var k = 0; k < recentKeys.length; k++) { trimmed[recentKeys[k]] = true; }
      idsObj = trimmed;
    }
    PropertiesService.getScriptProperties().setProperty(PROCESSED_KEY, JSON.stringify(idsObj));
  } catch (e) {
    Logger.log("[saveProcessedIds] Failed to save: " + e);
  }
}

// ─── Payment trigger ──────────────────────────────────────────────────────────
//
// Set TRIGGER_MODE before running createPaymentTrigger():
//   "timer" → 1-minute time-based poll (default, no extra setup required)
//   "addon" → fires on email delivery via forGmail().onFiltersMatched()
//             (requires this script deployed as a Gmail Add-on)

var TRIGGER_MODE = "timer"; // "addon" | "timer"

function buildAddOnHomepage(e) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("FATUWR Payment Processor"))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText(
          "Payment email processing is active. New Maybank PayNow emails are processed automatically."
        ))
    )
    .build();
}

function onNewPaymentEmail(e) {
  Logger.log("onFiltersMatched trigger fired");
  try {
    processMaybankEmails();
  } catch (err) {
    Logger.log("Error in onNewPaymentEmail: " + err.message);
  }
}

function createPaymentTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    var fn = existing[i].getHandlerFunction();
    if (fn === "processMaybankEmails" || fn === "onNewPaymentEmail") {
      ScriptApp.deleteTrigger(existing[i]);
      Logger.log("Removed existing trigger: " + fn);
    }
  }

  if (TRIGGER_MODE === "addon") {
    ScriptApp.newTrigger("onNewPaymentEmail")
      .forGmail()
      .onFiltersMatched()
      .create();
    Logger.log("Add-on trigger created — onNewPaymentEmail fires on email delivery");
  } else {
    ScriptApp.newTrigger("processMaybankEmails")
      .timeBased()
      .everyMinutes(1)
      .create();
    Logger.log("Time-based trigger created — processMaybankEmails runs every 1 minute");
  }
}

function deletePaymentTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  var removed  = 0;
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
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error("Tab not found: " + tabName);
  return sheet;
}

function getSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

function lookupPaymentId(email) {
  var sheet = getSheet(TAB_USERS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      normalizeEmail(String(row[2])) === email ||
      normalizeEmail(String(row[3])) === email
    ) {
      return String(row[0] || "");
    }
  }
  return "";
}

function checkSessionClosed(trainingDate, pool) {
  var sheet = getSheet(TAB_SESSIONS);
  var data  = getSheetData(sheet);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (
      datesMatch(String(row[0]), trainingDate) &&
      normalizeStr(String(row[3])) === normalizeStr(pool)
    ) {
      return { found: true, closed: String(row[15] || "").trim().length > 0 };
    }
  }
  return { found: false, closed: false };
}

function datesMatch(date1, date2) {
  var d1 = new Date(date1);
  var d2 = new Date(date2);
  if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
    return d1.toDateString() === d2.toDateString();
  }
  return date1.trim().toLowerCase() === date2.trim().toLowerCase();
}

function normalizeEmail(str) { return (str || "").toLowerCase().trim(); }
function normalizeStr(str)   { return (str || "").toLowerCase().trim(); }

function formatDate(date) {
  var d = String(date.getDate()).padStart(2, "0");
  var m = String(date.getMonth() + 1).padStart(2, "0");
  return d + "/" + m + "/" + date.getFullYear();
}

function formatDateTime(date) {
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
      method:             "post",
      muteHttpExceptions: true,
      followRedirects:    true,
    });
    Logger.log("[notifyRailway] Pinged Railway for tab=" + tab);
  } catch (e) {
    Logger.log("[notifyRailway] Failed: " + e);
  }
}

// ─── DB → Sheet sync (Sync from DB menu) ─────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FATUWR Admin")
    .addItem("Sync all tabs from DB",  "syncAllTabsFromDb")
    .addSeparator()
    .addItem("Sync Sessions from DB",  "syncSessionsFromDb")
    .addItem("Sync Sign-ups from DB",  "syncSignupsFromDb")
    .addItem("Sync Payments from DB",  "syncPaymentsFromDb")
    .addItem("Sync Users from DB",     "syncUsersFromDb")
    .addToUi();
}

function syncAllTabsFromDb() {
  var errors = [];
  var tabs   = ["sessions", "signups", "payments", "users"];
  for (var i = 0; i < tabs.length; i++) {
    try { syncTabFromDb(tabs[i]); } catch (e) { errors.push(tabs[i] + ": " + e.message); }
  }
  var msg = errors.length === 0
    ? "All tabs synced successfully from DB."
    : "Completed with errors:\n" + errors.join("\n");
  try { SpreadsheetApp.getUi().alert(msg); } catch (uiErr) { Logger.log(msg); }
}

function syncSessionsFromDb() { syncTabFromDb("sessions"); }
function syncSignupsFromDb()  { syncTabFromDb("signups");  }
function syncPaymentsFromDb() { syncTabFromDb("payments"); }
function syncUsersFromDb()    { syncTabFromDb("users");    }

function syncTabFromDb(tab) {
  var props  = PropertiesService.getScriptProperties();
  var url    = props.getProperty("RAILWAY_URL");
  var secret = props.getProperty("APPS_SCRIPT_SECRET");
  if (!url || !secret) {
    var msg = "RAILWAY_URL and APPS_SCRIPT_SECRET must be set in Script Properties.";
    Logger.log("[syncTabFromDb] " + msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (uiErr) {}
    return;
  }

  var response   = UrlFetchApp.fetch(url + "/api/export?tab=" + tab + "&token=" + secret, { muteHttpExceptions: true });
  var statusCode = response.getResponseCode();
  if (statusCode !== 200) {
    throw new Error("HTTP " + statusCode + ": " + response.getContentText().substring(0, 200));
  }

  var data = JSON.parse(response.getContentText());
  if (!data.rows) throw new Error("Response missing rows field for tab=" + tab);

  writeRowsToTab(tab, data.rows);
  Logger.log("[syncTabFromDb] " + tab + " — wrote " + data.rows.length + " rows");
}

function writeRowsToTab(tab, rows) {
  var sheetName = tab === "sessions" ? TAB_SESSIONS
                : tab === "signups"  ? TAB_SIGNUPS
                : tab === "users"    ? TAB_USERS
                : tab === "payments" ? TAB_PAYMENTS : null;
  if (!sheetName) { Logger.log("[writeRowsToTab] Unknown tab: " + tab); return; }

  if (!rows || rows.length === 0) {
    Logger.log("[writeRowsToTab] " + tab + " — 0 rows returned, skipping to avoid data loss");
    return;
  }

  var sheet   = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}
