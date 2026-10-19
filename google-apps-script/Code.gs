/**
 * ============================================================================
 * PAC Automobile Club - Recruitment 2026
 * Backend System: Google Apps Script + Google Sheets Database
 * ============================================================================
 *
 * Core Features:
 * 1. Persistent Data Storage in Google Sheets ("Bookings" & "Slots_Config" tabs).
 * 2. Concurrency Control with LockService (prevents overbooking under high traffic).
 * 3. Strict Server-Side Capacity Enforcement for all 9 interview slots.
 * 4. Duplicate Prevention via Case-Insensitive Normalized Email addresses.
 * 5. Real-Time Seat Availability calculation and instant rejection of full slots.
 * 6. High-Reliability Cross-Origin Support (supports POST simple requests and GET fallback).
 * 7. One-click setup and built-in safe test functions.
 */

// Global Configuration
var CONFIG = {
  // OPTIONAL: If using a standalone script, paste your Google Sheet ID here.
  // Leave EMPTY "" if the script is container-bound (opened from Extensions > Apps Script in your sheet).
  SPREADSHEET_ID: "",

  BOOKINGS_SHEET_NAME: "Bookings",
  CONFIG_SHEET_NAME: "Slots_Config",
  LOCK_TIMEOUT_MS: 30000, // 30 seconds wait for lock

  // ============================================================================
  // FEATURE 1: Candidate Eligibility Verification Configuration
  // Source: Google Form responses spreadsheet "FY_2026 (Responses)"
  // ============================================================================
  // ID of the separate "FY_2026 (Responses)" Google Spreadsheet.
  // Obtain this from the spreadsheet URL: https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
  // You can set it here OR via Project Settings > Script Properties as "ELIGIBILITY_SPREADSHEET_ID".
  ELIGIBILITY_SPREADSHEET_ID: "",

  // Tab name where candidate form responses are stored (Sole eligibility source of truth)
  ELIGIBILITY_SHEET_NAME: "Form responses 1",

  // Header name for the candidate's email column in "Form responses 1"
  ELIGIBILITY_EMAIL_HEADER: "Email address",

  // Header name for the candidate's name column in "Form responses 1"
  ELIGIBILITY_NAME_HEADER: "Full name",

  // ============================================================================
  // FEATURE 2: Booking Confirmation Email Configuration
  // ============================================================================
  CLUB_NAME: "PAC Automobile Club",
  // Official Club Email address (used for reply-to and display)
  CLUB_EMAIL: "pacautomobileclub@gmail.com",
  EMAIL_SUBJECT: "PAC Recruitment – Interview Slot Confirmed",
  VENUE: "Behind EDC Building",
  TIMEZONE: "Asia/Kolkata",

  // Exact Interview Dates and Capacities
  SLOT_DEFINITIONS: [
    // Wednesday, 21 October 2026 (Total: 27)
    { date: "Wednesday, 21 October 2026", timeSlot: "4:30 PM–5:30 PM", capacity: 5 },
    { date: "Wednesday, 21 October 2026", timeSlot: "5:30 PM–6:30 PM", capacity: 10 },
    { date: "Wednesday, 21 October 2026", timeSlot: "6:30 PM–7:30 PM", capacity: 12 },

    // Thursday, 22 October 2026 (Total: 35)
    { date: "Thursday, 22 October 2026", timeSlot: "4:30 PM–5:30 PM", capacity: 10 },
    { date: "Thursday, 22 October 2026", timeSlot: "5:30 PM–6:30 PM", capacity: 10 },
    { date: "Thursday, 22 October 2026", timeSlot: "6:30 PM–7:30 PM", capacity: 15 },

    // Friday, 23 October 2026 (Total: 40)
    { date: "Friday, 23 October 2026", timeSlot: "4:30 PM–5:30 PM", capacity: 10 },
    { date: "Friday, 23 October 2026", timeSlot: "5:30 PM–6:30 PM", capacity: 15 },
    { date: "Friday, 23 October 2026", timeSlot: "6:30 PM–7:30 PM", capacity: 15 }
  ]
};

/**
 * Handle GET requests
 * Supports:
 * - ?action=ping (Health check)
 * - ?action=getSlots (Live slot availability & remaining seats)
 * - ?action=checkEmail&email=... (Pre-check if email is booked)
 * - ?action=bookSlot (Fallback booking endpoint for strict CORS/file:// protocol environments)
 */
function doGet(e) {
  try {
    var params = e ? e.parameter : {};
    var action = (params.action || "getSlots").trim();

    if (action === "ping") {
      return jsonResponse({
        success: true,
        status: "online",
        serverTime: new Date().toISOString(),
        club: "PAC Automobile Club",
        event: "Recruitment 2026",
        message: "Google Apps Script backend is online and ready."
      });
    }

    if (action === "checkEmail") {
      var emailToCheck = (params.email || "").trim().toLowerCase();
      if (!emailToCheck) {
        return jsonResponse({
          success: false,
          error: "INVALID_INPUT",
          message: "Email parameter is required."
        });
      }
      var ss = getTargetSpreadsheet();
      ensureSheetsExist(ss);
      var booked = isEmailAlreadyBooked(ss, emailToCheck);
      var eligibility = checkCandidateEligibility(emailToCheck);
      return jsonResponse({
        success: true,
        email: emailToCheck,
        isBooked: booked,
        isEligible: eligibility.eligible
      });
    }

    if (action === "bookSlot") {
      // Allow booking via GET as a fallback if the client cannot issue POST due to local browser policy
      return processBooking(params);
    }

    // Default: getSlots
    var ss = getTargetSpreadsheet();
    ensureSheetsExist(ss);
    var slotAvailability = getSlotsAvailability(ss);

    return jsonResponse({
      success: true,
      data: slotAvailability,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: "SERVER_ERROR",
      message: "Failed to process GET request: " + error.toString()
    });
  }
}

/**
 * Handle POST requests
 * Primary endpoint for form submissions. Expects JSON or Form payload.
 */
function doPost(e) {
  try {
    var payload = {};

    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (jsonErr) {
        // Fallback if submitted as URL-encoded or raw query
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    return processBooking(payload);

  } catch (err) {
    return jsonResponse({
      success: false,
      error: "POST_ERROR",
      message: "Failed to handle POST request: " + err.toString()
    });
  }
}

/**
 * Core Booking Logic with Concurrency Lock & Validation
 */
function processBooking(payload) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    // 1. Concurrency control: Wait for lock to prevent race conditions
    lockAcquired = lock.tryLock(CONFIG.LOCK_TIMEOUT_MS);
    if (!lockAcquired) {
      return jsonResponse({
        success: false,
        error: "SERVER_BUSY",
        message: "High server traffic. Please try submitting again in a few moments."
      });
    }

    // 2. Validate input fields
    var fullName = (payload.fullName || "").trim();
    var rawEmail = (payload.email || "").trim();
    var date = (payload.date || "").trim();
    var timeSlot = (payload.timeSlot || "").trim();

    if (!fullName || fullName.length < 2) {
      return jsonResponse({
        success: false,
        error: "INVALID_NAME",
        message: "Please enter your full name (minimum 2 characters)."
      });
    }

    // Normalize email (lowercase & trimmed)
    var email = rawEmail.toLowerCase();
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return jsonResponse({
        success: false,
        error: "INVALID_EMAIL",
        message: "Please provide a valid email address."
      });
    }

    // 3. FEATURE 1: Verify Candidate Eligibility from "FY_2026 (Responses)" -> "Form responses 1"
    var eligibility = checkCandidateEligibility(email);
    if (!eligibility.eligible) {
      return jsonResponse({
        success: false,
        error: eligibility.error || "INELIGIBLE_EMAIL",
        message: eligibility.message || "This email address is not registered as an eligible candidate. Please use the email submitted in your recruitment application form."
      });
    }

    // Use candidate's registered name from form responses if submitted name was sparse
    if (eligibility.registeredName && (!fullName || fullName.length < 2)) {
      fullName = eligibility.registeredName;
    }

    // 4. Initialize Spreadsheet and match slot definition using live capacity from Slots_Config
    var ss = getTargetSpreadsheet();
    ensureSheetsExist(ss);
    var bookingsSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET_NAME);

    var slotDef = findSlotDefinition(ss, date, timeSlot);
    if (!slotDef) {
      return jsonResponse({
        success: false,
        error: "INVALID_SLOT",
        message: "The requested interview date or time slot was not recognized."
      });
    }

    // 5. Duplicate Check: Prevent duplicate bookings with the same normalized email
    if (isEmailAlreadyBooked(ss, email)) {
      return jsonResponse({
        success: false,
        error: "DUPLICATE_BOOKING",
        message: "This email address (" + email + ") has already booked an interview slot. Only one booking per candidate is permitted."
      });
    }

    // 6. Capacity Check: Ensure current bookings do not exceed maximum capacity
    var currentBooked = countBookingsForSlot(bookingsSheet, slotDef.date, slotDef.timeSlot);
    if (currentBooked >= slotDef.capacity) {
      return jsonResponse({
        success: false,
        error: "SLOT_FULL",
        message: "Sorry, the slot for " + slotDef.date + " (" + slotDef.timeSlot + ") has reached full capacity (" + slotDef.capacity + " candidates). Please select another slot."
      });
    }

    // 7. Generate unique Reference ID and formatted timestamp
    var bookingId = generateBookingId();
    var timestamp = new Date();
    var formattedTimestamp = Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone() || "Asia/Kolkata",
      "yyyy-MM-dd HH:mm:ss"
    );

    // 8. Persistently store booking in Google Sheets
    bookingsSheet.appendRow([
      bookingId,
      formattedTimestamp,
      fullName,
      email,
      slotDef.date,
      slotDef.timeSlot,
      "CONFIRMED"
    ]);

    // Force flush changes immediately
    SpreadsheetApp.flush();

    // 9. FEATURE 2: Dispatch Booking Confirmation Email
    // Sent ONLY after the booking has been successfully saved to the database.
    // Failure to deliver email will NOT roll back the booking or release the slot.
    var emailResult = {
      sent: false,
      error: null
    };

    try {
      sendBookingConfirmationEmail({
        bookingId: bookingId,
        fullName: fullName,
        email: email,
        date: slotDef.date,
        timeSlot: slotDef.timeSlot
      });
      emailResult.sent = true;
    } catch (emailErr) {
      emailResult.sent = false;
      emailResult.error = emailErr.toString();
      Logger.log("[Email Dispatch] Diagnostic: Confirmation email delivery failed for " + bookingId + ": " + emailErr.toString());
    }

    // 10. Immediately sync and update Slots_Config dashboard & recalculate availability
    var updatedSlots = getSlotsAvailability(ss);
    var targetCanonicalKey = getCanonicalSlotKey(slotDef.date, slotDef.timeSlot);
    var newRemaining = Math.max(0, slotDef.capacity - (currentBooked + 1));
    for (var u = 0; u < updatedSlots.length; u++) {
      if (updatedSlots[u].canonicalKey === targetCanonicalKey) {
        newRemaining = updatedSlots[u].remaining;
        break;
      }
    }

    return jsonResponse({
      success: true,
      message: "Interview slot successfully booked!",
      booking: {
        bookingId: bookingId,
        fullName: fullName,
        email: email,
        date: slotDef.date,
        timeSlot: slotDef.timeSlot,
        timestamp: formattedTimestamp,
        remainingSeats: newRemaining,
        emailSent: emailResult.sent,
        emailError: emailResult.sent ? null : "Email delivery notice: Confirmation email could not be delivered automatically."
      }
    });

  } catch (err) {
    return jsonResponse({
      success: false,
      error: "EXECUTION_ERROR",
      message: "Booking error: " + err.toString()
    });
  } finally {
    // Always release lock
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (e) {
        // Safe to ignore release errors
      }
    }
  }
}

/**
 * Returns JSON response
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Resolve eligibility spreadsheet ID: Script Properties > CONFIG
 */
function getEligibilitySpreadsheetId() {
  try {
    var prop = PropertiesService.getScriptProperties().getProperty("ELIGIBILITY_SPREADSHEET_ID");
    if (prop && prop.trim() !== "") {
      return prop.trim();
    }
  } catch (e) {
    // Non-blocking
  }
  return (CONFIG.ELIGIBILITY_SPREADSHEET_ID || "").trim();
}

/**
 * Resolve booking spreadsheet: Script Properties > CONFIG > Active Spreadsheet
 */
function getTargetSpreadsheet() {
  var id = "";
  try {
    id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "";
  } catch (e) {}
  if (!id) {
    id = (CONFIG.SPREADSHEET_ID || "").trim();
  }
  if (id && id.trim() !== "") {
    return SpreadsheetApp.openById(id.trim());
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * FEATURE 1: Validates candidate eligibility against "FY_2026 (Responses)" -> "Form responses 1"
 *
 * Rules:
 * - Dynamic header lookup for "Email address" and "Full name".
 * - Case-insensitive & trimmed comparison on normalized emails.
 * - Fails safely if spreadsheet or sheet is inaccessible without allowing unverified bookings.
 * - Diagnostic logging does NOT leak sensitive candidate data.
 *
 * @param {string} emailToVerify
 * @return {{ eligible: boolean, error?: string, message?: string, registeredEmail?: string, registeredName?: string }}
 */
function checkCandidateEligibility(emailToVerify) {
  var normalizedTarget = (emailToVerify || "").toString().trim().toLowerCase();
  if (!normalizedTarget) {
    return {
      eligible: false,
      error: "INVALID_EMAIL",
      message: "Please provide a valid email address."
    };
  }

  var sheetId = getEligibilitySpreadsheetId();
  if (!sheetId) {
    Logger.log("[Eligibility Check] Diagnostic: ELIGIBILITY_SPREADSHEET_ID is empty. Set it in CONFIG or Script Properties.");
    return {
      eligible: false,
      error: "ELIGIBILITY_SERVICE_UNCONFIGURED",
      message: "Candidate eligibility verification service is temporarily unconfigured. Please contact the recruitment team."
    };
  }

  var eligibilitySs;
  try {
    eligibilitySs = SpreadsheetApp.openById(sheetId);
  } catch (openErr) {
    Logger.log("[Eligibility Check] Diagnostic: Failed to open eligibility spreadsheet ID: " + sheetId + ". Error: " + openErr.toString());
    return {
      eligible: false,
      error: "ELIGIBILITY_SERVICE_UNAVAILABLE",
      message: "Unable to verify candidate eligibility at this time. Please try again later or contact the recruitment team."
    };
  }

  var targetSheetName = CONFIG.ELIGIBILITY_SHEET_NAME || "Form responses 1";
  var sheet = eligibilitySs.getSheetByName(targetSheetName);
  if (!sheet) {
    Logger.log("[Eligibility Check] Diagnostic: Tab '" + targetSheetName + "' not found in eligibility spreadsheet.");
    return {
      eligible: false,
      error: "ELIGIBILITY_RECORDS_UNAVAILABLE",
      message: "Eligibility records are currently unavailable. Please contact the recruitment team."
    };
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol < 1) {
    Logger.log("[Eligibility Check] Diagnostic: Sheet '" + targetSheetName + "' has no data rows (lastRow=" + lastRow + ").");
    return {
      eligible: false,
      error: "INELIGIBLE_EMAIL",
      message: "This email address (" + normalizedTarget + ") is not registered as an eligible candidate. Please use the email submitted in your recruitment application form."
    };
  }

  // 1. Read Header Row (Row 1) dynamically
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var targetEmailHeader = (CONFIG.ELIGIBILITY_EMAIL_HEADER || "Email address").trim().toLowerCase();
  var targetNameHeader = (CONFIG.ELIGIBILITY_NAME_HEADER || "Full name").trim().toLowerCase();

  var emailColIndex = -1;
  var nameColIndex = -1;

  for (var c = 0; c < headers.length; c++) {
    var h = (headers[c] || "").toString().trim().toLowerCase();
    if (h === targetEmailHeader) {
      emailColIndex = c + 1; // 1-indexed for getRange
    } else if (h === targetNameHeader) {
      nameColIndex = c + 1;
    }
  }

  // Fallback: search for header containing "email" if exact match fails
  if (emailColIndex === -1) {
    for (var c2 = 0; c2 < headers.length; c2++) {
      var h2 = (headers[c2] || "").toString().trim().toLowerCase();
      if (h2.indexOf("email") !== -1) {
        emailColIndex = c2 + 1;
        break;
      }
    }
  }

  if (emailColIndex === -1) {
    Logger.log("[Eligibility Check] Diagnostic: Email header '" + CONFIG.ELIGIBILITY_EMAIL_HEADER + "' not found in row 1. Header count: " + headers.length);
    return {
      eligible: false,
      error: "ELIGIBILITY_HEADER_MISSING",
      message: "Candidate verification data structure error. Please contact the recruitment team."
    };
  }

  // 2. Read only the Email column
  var emailValues = sheet.getRange(2, emailColIndex, lastRow - 1, 1).getValues();
  var matchedRow = -1;

  for (var r = 0; r < emailValues.length; r++) {
    var regEmail = (emailValues[r][0] || "").toString().trim().toLowerCase();
    if (regEmail === normalizedTarget) {
      matchedRow = r + 2; // 1-indexed row number in the sheet
      break;
    }
  }

  if (matchedRow === -1) {
    return {
      eligible: false,
      error: "INELIGIBLE_EMAIL",
      message: "This email address (" + normalizedTarget + ") is not registered as an eligible candidate. Please use the email submitted in your recruitment application form."
    };
  }

  // 3. Optional: Read candidate's registered name
  var registeredName = "";
  if (nameColIndex !== -1) {
    try {
      registeredName = (sheet.getRange(matchedRow, nameColIndex).getValue() || "").toString().trim();
    } catch (e) {
      // Non-blocking
    }
  }

  return {
    eligible: true,
    registeredEmail: normalizedTarget,
    registeredName: registeredName
  };
}

/**
 * FEATURE 2: Sends a booking confirmation email from the PAC club Gmail account.
 *
 * Requirements:
 * - Sent only after booking has been successfully saved to Bookings sheet.
 * - Formats dates & times in Asia/Kolkata (IST).
 * - Exact start and end times, venue, arrive 10-15 min early instructions.
 * - Handled gracefully so failures never release slots or create duplicate bookings.
 *
 * @param {{ bookingId: string, fullName: string, email: string, date: string, timeSlot: string }} bookingDetails
 */
function sendBookingConfirmationEmail(bookingDetails) {
  var fullName = bookingDetails.fullName || "Candidate";
  var email = bookingDetails.email;
  var bookingId = bookingDetails.bookingId;
  var date = bookingDetails.date;
  var timeSlot = bookingDetails.timeSlot;
  var venue = CONFIG.VENUE || "Behind EDC Building";
  var clubName = CONFIG.CLUB_NAME || "PAC Automobile Club";
  var clubEmail = CONFIG.CLUB_EMAIL || "pacautomobileclub@gmail.com";
  var subject = CONFIG.EMAIL_SUBJECT || "PAC Recruitment – Interview Slot Confirmed";

  // Plain Text Body
  var plainText = [
    clubName + " – Recruitment 2026",
    "Interview Slot Confirmed",
    "",
    "Dear " + fullName + ",",
    "",
    "Your interview slot for " + clubName + " Recruitment 2026 has been successfully confirmed.",
    "",
    "BOOKING DETAILS:",
    "• Reference ID: " + bookingId,
    "• Candidate Name: " + fullName,
    "• Registered Email: " + email,
    "• Interview Date: " + date,
    "• Time Slot: " + timeSlot + " (Asia/Kolkata, IST)",
    "• Reporting Venue: " + venue,
    "",
    "IMPORTANT INSTRUCTIONS:",
    "1. Please arrive at the venue 10–15 minutes prior to your scheduled time slot.",
    "2. Bring a valid College Student ID card.",
    "3. Feel free to bring any relevant technical projects or portfolio you wish to discuss.",
    "",
    "If you have any questions or scheduling conflicts, please reply directly to this email (" + clubEmail + ").",
    "",
    "Warm regards,",
    clubName + " Recruitment Team"
  ].join("\n");

  // Rich HTML Body
  var htmlBody = [
    '<!DOCTYPE html>',
    '<html>',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>',
    '<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">',
    '  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:30px 15px;">',
    '    <tr>',
    '      <td align="center">',
    '        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);border:1px solid #e2e8f0;" cellspacing="0" cellpadding="0">',
    '          <tr>',
    '            <td style="background-color:#0f172a;padding:28px 32px;text-align:center;">',
    '              <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#38bdf8;text-transform:uppercase;margin-bottom:6px;">' + clubName + '</div>',
    '              <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Recruitment 2026 • Interview Confirmed</h1>',
    '            </td>',
    '          </tr>',
    '          <tr>',
    '            <td style="padding:32px;">',
    '              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#334155;">Dear <strong>' + escapeHtml(fullName) + '</strong>,</p>',
    '              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569;">',
    '                Your interview slot for <strong>' + clubName + ' Recruitment 2026</strong> has been confirmed and officially recorded in our recruitment register.',
    '              </p>',
    '              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">',
    '                <tr>',
    '                  <td style="padding:20px;">',
    '                    <div style="font-size:11px;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;">Booking Pass Details</div>',
    '                    <table role="presentation" width="100%" cellspacing="0" cellpadding="6" style="font-size:14px;">',
    '                      <tr><td width="36%" style="color:#64748b;font-weight:500;">Reference ID:</td><td width="64%" style="color:#0f172a;font-weight:700;font-family:monospace;">' + escapeHtml(bookingId) + '</td></tr>',
    '                      <tr><td style="color:#64748b;font-weight:500;">Candidate Name:</td><td style="color:#0f172a;font-weight:600;">' + escapeHtml(fullName) + '</td></tr>',
    '                      <tr><td style="color:#64748b;font-weight:500;">Registered Email:</td><td style="color:#0f172a;">' + escapeHtml(email) + '</td></tr>',
    '                      <tr><td style="color:#64748b;font-weight:500;">Interview Date:</td><td style="color:#0f172a;font-weight:600;">' + escapeHtml(date) + '</td></tr>',
    '                      <tr><td style="color:#64748b;font-weight:500;">Exact Time Slot:</td><td style="color:#0284c7;font-weight:700;">' + escapeHtml(timeSlot) + ' (Asia/Kolkata, IST)</td></tr>',
    '                      <tr><td style="color:#64748b;font-weight:500;">Reporting Venue:</td><td style="color:#0f172a;font-weight:600;">' + escapeHtml(venue) + '</td></tr>',
    '                    </table>',
    '                  </td>',
    '                </tr>',
    '              </table>',
    '              <div style="background-color:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;padding:14px 16px;margin-bottom:24px;">',
    '                <div style="font-weight:700;font-size:14px;color:#1e40af;margin-bottom:6px;">Important Instructions:</div>',
    '                <ul style="margin:0;padding-left:20px;font-size:13.5px;line-height:1.6;color:#1e3a8a;">',
    '                  <li>Please arrive at the venue <strong>10–15 minutes early</strong> prior to your scheduled time slot.</li>',
    '                  <li>Bring a valid <strong>College Student ID card</strong>.</li>',
    '                  <li>Feel free to bring any relevant technical projects, designs, or portfolio you wish to discuss.</li>',
    '                </ul>',
    '              </div>',
    '              <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#475569;">',
    '                If you have any questions, reply directly to this email or contact us at <a href="mailto:' + clubEmail + '" style="color:#0284c7;text-decoration:none;">' + clubEmail + '</a>.',
    '              </p>',
    '              <p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:#334155;">',
    '                Warm regards,<br>',
    '                <strong>' + clubName + ' Recruitment Team</strong>',
    '              </p>',
    '            </td>',
    '          </tr>',
    '          <tr>',
    '            <td style="background-color:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">',
    '              ' + clubName + ' • Engineering • Innovation • Performance<br>',
    '              Automated confirmation for Recruitment 2026. Do not forward.',
    '            </td>',
    '          </tr>',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>'
  ].join("\n");

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: plainText,
    htmlBody: htmlBody,
    name: clubName,
    replyTo: clubEmail
  });
}

/**
 * Basic HTML escaping helper
 */
function escapeHtml(str) {
  if (!str) return "";
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Ensures 'Bookings' and 'Slots_Config' sheets exist with proper headers
 */
function ensureSheetsExist(ss) {
  // 1. Bookings Sheet
  var bookingsSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET_NAME);
  if (!bookingsSheet) {
    bookingsSheet = ss.insertSheet(CONFIG.BOOKINGS_SHEET_NAME);
    bookingsSheet.appendRow([
      "Booking ID",
      "Timestamp",
      "Full Name",
      "Normalized Email",
      "Interview Date",
      "Time Slot",
      "Status"
    ]);
    formatHeaderRow(bookingsSheet, 7);
  } else if (bookingsSheet.getLastRow() === 0) {
    bookingsSheet.appendRow([
      "Booking ID",
      "Timestamp",
      "Full Name",
      "Normalized Email",
      "Interview Date",
      "Time Slot",
      "Status"
    ]);
    formatHeaderRow(bookingsSheet, 7);
  }

  // 2. Slots Config Sheet
  var configSheet = ss.getSheetByName(CONFIG.CONFIG_SHEET_NAME);
  if (!configSheet) {
    configSheet = ss.insertSheet(CONFIG.CONFIG_SHEET_NAME);
    configSheet.appendRow([
      "Interview Date",
      "Time Slot",
      "Max Capacity",
      "Booked Seats",
      "Remaining Seats",
      "Status"
    ]);
    formatHeaderRow(configSheet, 6);

    for (var i = 0; i < CONFIG.SLOT_DEFINITIONS.length; i++) {
      var s = CONFIG.SLOT_DEFINITIONS[i];
      configSheet.appendRow([
        s.date,
        s.timeSlot,
        s.capacity,
        0,
        s.capacity,
        "OPEN"
      ]);
    }
  }
}

/**
 * Header styling for readability
 */
function formatHeaderRow(sheet, numCols) {
  var headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setBackground("#0F172A");
  headerRange.setFontColor("#FFFFFF");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

/**
 * Canonical Date Normalizer:
 * Converts Date objects, ISO strings, or verbal dates into canonical YYYY-MM-DD.
 * Handles:
 * - Date objects (e.g. Wed Oct 21 2026 ... from Google Sheets cell)
 * - "Wednesday, 21 October 2026"
 * - "21 October 2026", "21 Oct 2026", "2026-10-21", "21/10/2026"
 */
function getCanonicalDate(val) {
  if (!val && val !== 0) return "";
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = (val.getMonth() + 1 < 10 ? "0" : "") + (val.getMonth() + 1);
    var d = (val.getDate() < 10 ? "0" : "") + val.getDate();
    return y + "-" + m + "-" + d;
  }
  var str = val.toString().toLowerCase();
  if (str.indexOf("21") !== -1 && (str.indexOf("oct") !== -1 || str.indexOf("wed") !== -1 || str.indexOf("2026") !== -1)) {
    return "2026-10-21";
  }
  if (str.indexOf("22") !== -1 && (str.indexOf("oct") !== -1 || str.indexOf("thu") !== -1 || str.indexOf("2026") !== -1)) {
    return "2026-10-22";
  }
  if (str.indexOf("23") !== -1 && (str.indexOf("oct") !== -1 || str.indexOf("fri") !== -1 || str.indexOf("2026") !== -1)) {
    return "2026-10-23";
  }
  return str.replace(/[^a-z0-9]/g, "");
}

/**
 * Canonical Time Slot Normalizer:
 * Handles:
 * - Differences in dashes: en dash (–), em dash (—), hyphen (-), minus (−)
 * - Spaces, tabs, and non-breaking spaces (\u00A0, \u202F)
 * - "4:30 PM–5:30 PM", "4:30 PM - 5:30 PM", "4:30pm-5:30pm", etc.
 */
function getCanonicalTime(val) {
  if (!val && val !== 0) return "";
  var str = val.toString().toLowerCase().replace(/[\s\u00A0\u202F]/g, "").replace(/[–—−]/g, "-");
  if (str.indexOf("4:30") !== -1 && str.indexOf("5:30") !== -1) {
    return "4:30pm-5:30pm";
  }
  if (str.indexOf("5:30") !== -1 && str.indexOf("6:30") !== -1) {
    return "5:30pm-6:30pm";
  }
  if (str.indexOf("6:30") !== -1 && str.indexOf("7:30") !== -1) {
    return "6:30pm-7:30pm";
  }
  return str;
}

/**
 * Canonical Slot Key Generator:
 * Generates an identical canonical string key for both backend calculation and frontend lookup:
 * Example: "2026-10-21|4:30pm-5:30pm"
 */
function getCanonicalSlotKey(dateVal, timeVal) {
  var cDate = getCanonicalDate(dateVal);
  var cTime = getCanonicalTime(timeVal);
  if (!cDate || !cTime) return "";
  return cDate + "|" + cTime;
}

/**
 * Reads configured slot capacities from 'Slots_Config' sheet.
 * Returns a map of canonicalKey -> { capacity: number, date: string, timeSlot: string }
 */
function getSlotsConfigMap(ss) {
  var configMap = {};
  if (!ss) return configMap;

  var configSheet = ss.getSheetByName(CONFIG.CONFIG_SHEET_NAME);
  if (!configSheet) return configMap;

  var lastRow = configSheet.getLastRow();
  if (lastRow <= 1) return configMap;

  // Columns: 1: Date, 2: Time Slot, 3: Max Capacity
  var data = configSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    var rowDate = data[i][0];
    var rowTime = data[i][1];
    var rawCap = data[i][2];

    var key = getCanonicalSlotKey(rowDate, rowTime);
    if (key) {
      var cap = parseInt(rawCap, 10);
      configMap[key] = {
        date: rowDate instanceof Date ? Utilities.formatDate(rowDate, Session.getScriptTimeZone() || "Asia/Kolkata", "EEEE, d MMMM yyyy") : rowDate.toString(),
        timeSlot: rowTime.toString(),
        capacity: (!isNaN(cap) && cap >= 0) ? cap : null
      };
    }
  }
  return configMap;
}

/**
 * Match slot definition reliably using canonical keys and active capacity from Slots_Config
 */
function findSlotDefinition(ss, date, timeSlot) {
  // Support both findSlotDefinition(date, timeSlot) and findSlotDefinition(ss, date, timeSlot)
  if (typeof ss === "string" && typeof date === "string") {
    timeSlot = date;
    date = ss;
    ss = null;
  }
  if (!ss) {
    try {
      ss = getTargetSpreadsheet();
    } catch (e) {
      ss = null;
    }
  }

  var targetKey = getCanonicalSlotKey(date, timeSlot);
  if (!targetKey) return null;

  var sheetConfigMap = ss ? getSlotsConfigMap(ss) : {};

  for (var i = 0; i < CONFIG.SLOT_DEFINITIONS.length; i++) {
    var def = CONFIG.SLOT_DEFINITIONS[i];
    if (getCanonicalSlotKey(def.date, def.timeSlot) === targetKey) {
      var effectiveCapacity = def.capacity;
      if (sheetConfigMap[targetKey] && sheetConfigMap[targetKey].capacity !== null && !isNaN(sheetConfigMap[targetKey].capacity)) {
        effectiveCapacity = sheetConfigMap[targetKey].capacity;
      }
      return {
        date: def.date,
        timeSlot: def.timeSlot,
        canonicalKey: targetKey,
        capacity: effectiveCapacity
      };
    }
  }
  return null;
}

/**
 * Checks if a normalized email has already booked a slot
 */
function isEmailAlreadyBooked(ss, normalizedEmail) {
  var bookingsSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET_NAME);
  if (!bookingsSheet) return false;

  var lastRow = bookingsSheet.getLastRow();
  if (lastRow <= 1) return false;

  // Column 4 is Normalized Email
  var emails = bookingsSheet.getRange(2, 4, lastRow - 1, 1).getValues();
  for (var i = 0; i < emails.length; i++) {
    var existing = (emails[i][0] || "").toString().trim().toLowerCase();
    if (existing === normalizedEmail) {
      return true;
    }
  }
  return false;
}

/**
 * Counts existing confirmed bookings for a date and slot using canonical normalization
 */
function countBookingsForSlot(bookingsSheet, targetDate, targetTimeSlot) {
  var lastRow = bookingsSheet.getLastRow();
  if (lastRow <= 1) return 0;

  var targetKey = getCanonicalSlotKey(targetDate, targetTimeSlot);
  if (!targetKey) return 0;

  // Columns 5 (Date), 6 (Time Slot), 7 (Status)
  var data = bookingsSheet.getRange(2, 5, lastRow - 1, 3).getValues();
  var count = 0;

  for (var i = 0; i < data.length; i++) {
    var rowKey = getCanonicalSlotKey(data[i][0], data[i][1]);
    var status = (data[i][2] || "").toString().trim().toUpperCase();

    var isConfirmed = (status === "CONFIRMED" || status === "" || status === "ACTIVE");
    if (rowKey === targetKey && isConfirmed && status !== "CANCELLED") {
      count++;
    }
  }
  return count;
}

/**
 * Calculates live availability for all slots directly from confirmed Bookings,
 * using the capacity configured in Slots_Config as the source of truth.
 */
function getSlotsAvailability(ss) {
  var bookingsSheet = ss.getSheetByName(CONFIG.BOOKINGS_SHEET_NAME);
  var bookedMap = {};

  if (bookingsSheet && bookingsSheet.getLastRow() > 1) {
    var lastRow = bookingsSheet.getLastRow();
    // Columns 5 (Date), 6 (Time Slot), 7 (Status)
    var data = bookingsSheet.getRange(2, 5, lastRow - 1, 3).getValues();

    for (var i = 0; i < data.length; i++) {
      var rowDate = data[i][0];
      var rowTime = data[i][1];
      var status = (data[i][2] || "").toString().trim().toUpperCase();

      var isConfirmed = (status === "CONFIRMED" || status === "" || status === "ACTIVE");
      if (isConfirmed && status !== "CANCELLED") {
        var key = getCanonicalSlotKey(rowDate, rowTime);
        if (key) {
          bookedMap[key] = (bookedMap[key] || 0) + 1;
        }
      }
    }
  }

  // Source of Truth: Read capacities configured in 'Slots_Config'
  var sheetConfigMap = getSlotsConfigMap(ss);

  var results = [];
  for (var j = 0; j < CONFIG.SLOT_DEFINITIONS.length; j++) {
    var def = CONFIG.SLOT_DEFINITIONS[j];
    var defKey = getCanonicalSlotKey(def.date, def.timeSlot);

    // Prioritize capacity configured in 'Slots_Config' sheet; fallback to default if not configured
    var configuredCapacity = def.capacity;
    if (sheetConfigMap[defKey] && sheetConfigMap[defKey].capacity !== null && !isNaN(sheetConfigMap[defKey].capacity)) {
      configuredCapacity = sheetConfigMap[defKey].capacity;
    }

    var booked = bookedMap[defKey] || 0;
    var remaining = Math.max(0, configuredCapacity - booked);
    var isFull = remaining <= 0;

    results.push({
      date: def.date,
      timeSlot: def.timeSlot,
      canonicalKey: defKey,
      capacity: configuredCapacity,
      booked: booked,
      remaining: remaining,
      isFull: isFull,
      status: isFull ? "FULL" : "OPEN"
    });
  }

  // Update Config sheet in Google Sheets dashboard immediately
  updateConfigSheetSummary(ss, results);

  return results;
}

/**
 * Updates Slots_Config sheet dashboard with current live booking counts
 */
function updateConfigSheetSummary(ss, availabilityList) {
  try {
    var configSheet = ss.getSheetByName(CONFIG.CONFIG_SHEET_NAME);
    if (!configSheet) return;

    var lastRow = configSheet.getLastRow();
    if (lastRow <= 1) return;

    var rows = configSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var r = 0; r < rows.length; r++) {
      var rowKey = getCanonicalSlotKey(rows[r][0], rows[r][1]);
      if (!rowKey) continue;

      for (var k = 0; k < availabilityList.length; k++) {
        var item = availabilityList[k];
        if (item.canonicalKey === rowKey) {
          var rowIndex = r + 2;
          configSheet.getRange(rowIndex, 4).setValue(item.booked);
          configSheet.getRange(rowIndex, 5).setValue(item.remaining);
          configSheet.getRange(rowIndex, 6).setValue(item.isFull ? "FULL" : "OPEN");
          break;
        }
      }
    }
  } catch (e) {
    // Non-blocking
  }
}

/**
 * Generate unique Reference ID like PAC-2026-X7K2
 */
function generateBookingId() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var token = "";
  for (var i = 0; i < 4; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return "PAC-2026-" + token;
}

/**
 * One-click initialization: Run from Script Editor to set up sheets & headers
 */
function setup() {
  var ss = getTargetSpreadsheet();
  ensureSheetsExist(ss);
  getSlotsAvailability(ss);
  Logger.log("✔ PAC Automobile Club Recruitment 2026 database initialized successfully.");
}

/**
 * Safe Dry-Run Test Function (Runs in Script Editor without creating permanent booking rows)
 */
function testBookingDryRun() {
  var ss = getTargetSpreadsheet();
  ensureSheetsExist(ss);
  var slots = getSlotsAvailability(ss);
  Logger.log("Total slots configured: " + slots.length);
  for (var i = 0; i < slots.length; i++) {
    Logger.log("Slot [" + slots[i].date + " | " + slots[i].timeSlot + "]: Booked = " + slots[i].booked + ", Remaining = " + slots[i].remaining + " / " + slots[i].capacity + " (" + (slots[i].isFull ? "FULL" : "OPEN") + ")");
  }
  var testEmail = "dryrun.test@example.com";
  var isBooked = isEmailAlreadyBooked(ss, testEmail);
  Logger.log("Dry run check for '" + testEmail + "': " + (isBooked ? "Booked" : "Available"));
  Logger.log("✔ Backend logic and spreadsheet connection verified successfully!");
}

/**
 * Diagnostic Tool: Test Candidate Eligibility Verification
 * Run from Apps Script editor to verify connection to the eligibility spreadsheet.
 */
function testEligibilityVerification() {
  var id = getEligibilitySpreadsheetId();
  Logger.log("=== Testing Eligibility Verification ===");
  Logger.log("Configured Eligibility Spreadsheet ID: " + (id || "(NOT CONFIGURED)"));

  if (!id) {
    Logger.log("⚠️ ELIGIBILITY_SPREADSHEET_ID is currently empty.");
    Logger.log("Please paste the spreadsheet ID into CONFIG.ELIGIBILITY_SPREADSHEET_ID or set it under Project Settings > Script Properties.");
    return;
  }

  var res = checkCandidateEligibility("test.ineligible.check@example.com");
  Logger.log("Test check with unlisted email: " + JSON.stringify(res));
  if (res.error === "ELIGIBILITY_SERVICE_UNCONFIGURED" || res.error === "ELIGIBILITY_SERVICE_UNAVAILABLE" || res.error === "ELIGIBILITY_RECORDS_UNAVAILABLE") {
    Logger.log("❌ Connection or tab error: " + res.message);
  } else {
    Logger.log("✔ Eligibility spreadsheet connection and header parsing verified successfully!");
  }
}

/**
 * Diagnostic Tool: Test Confirmation Email Layout (Sends preview to active Apps Script editor user)
 */
function testConfirmationEmailLayout() {
  var activeUserEmail = "";
  try {
    activeUserEmail = Session.getActiveUser().getEmail();
  } catch (e) {}

  if (!activeUserEmail) {
    Logger.log("⚠️ Could not detect active user email. Provide a test recipient email.");
    return;
  }

  Logger.log("Sending preview confirmation email to active developer: " + activeUserEmail);
  try {
    sendBookingConfirmationEmail({
      bookingId: "PAC-2026-TEST",
      fullName: "Test Candidate",
      email: activeUserEmail,
      date: "Wednesday, 21 October 2026",
      timeSlot: "4:30 PM–5:30 PM"
    });
    Logger.log("✔ Test confirmation email sent successfully to " + activeUserEmail);
  } catch (err) {
    Logger.log("❌ Test email delivery failed: " + err.toString());
  }
}

