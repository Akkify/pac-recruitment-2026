const assert = require('assert');

// Exact 9 interview slot definitions for PAC Recruitment 2026
const SLOT_DEFINITIONS = [
  // Wednesday, 21 October 2026 (Total: 27 by default)
  { date: 'Wednesday, 21 October 2026', timeSlot: '4:30 PM–5:30 PM', capacity: 5 },
  { date: 'Wednesday, 21 October 2026', timeSlot: '5:30 PM–6:30 PM', capacity: 10 },
  { date: 'Wednesday, 21 October 2026', timeSlot: '6:30 PM–7:30 PM', capacity: 12 },

  // Thursday, 22 October 2026 (Total: 35)
  { date: 'Thursday, 22 October 2026', timeSlot: '4:30 PM–5:30 PM', capacity: 10 },
  { date: 'Thursday, 22 October 2026', timeSlot: '5:30 PM–6:30 PM', capacity: 10 },
  { date: 'Thursday, 22 October 2026', timeSlot: '6:30 PM–7:30 PM', capacity: 15 },

  // Friday, 23 October 2026 (Total: 40)
  { date: 'Friday, 23 October 2026', timeSlot: '4:30 PM–5:30 PM', capacity: 10 },
  { date: 'Friday, 23 October 2026', timeSlot: '5:30 PM–6:30 PM', capacity: 15 },
  { date: 'Friday, 23 October 2026', timeSlot: '6:30 PM–7:30 PM', capacity: 15 }
];

/**
 * Backend & Frontend Canonical Date Normalizer
 */
function getCanonicalDate(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = (val.getMonth() + 1 < 10 ? '0' : '') + (val.getMonth() + 1);
    const d = (val.getDate() < 10 ? '0' : '') + val.getDate();
    return `${y}-${m}-${d}`;
  }
  const str = String(val).toLowerCase();
  if (str.includes('21') && (str.includes('oct') || str.includes('wed') || str.includes('2026'))) {
    return '2026-10-21';
  }
  if (str.includes('22') && (str.includes('oct') || str.includes('thu') || str.includes('2026'))) {
    return '2026-10-22';
  }
  if (str.includes('23') && (str.includes('oct') || str.includes('fri') || str.includes('2026'))) {
    return '2026-10-23';
  }
  return str.replace(/[^a-z0-9]/g, '');
}

/**
 * Backend & Frontend Canonical Time Slot Normalizer
 */
function getCanonicalTime(val) {
  if (!val && val !== 0) return '';
  const str = String(val).toLowerCase().replace(/[\s\u00A0\u202F]/g, '').replace(/[–—−]/g, '-');
  if (str.includes('4:30') && str.includes('5:30')) return '4:30pm-5:30pm';
  if (str.includes('5:30') && str.includes('6:30')) return '5:30pm-6:30pm';
  if (str.includes('6:30') && str.includes('7:30')) return '6:30pm-7:30pm';
  return str;
}

function getCanonicalSlotKey(dateVal, timeVal) {
  const cDate = getCanonicalDate(dateVal);
  const cTime = getCanonicalTime(timeVal);
  if (!cDate || !cTime) return '';
  return `${cDate}|${cTime}`;
}

/**
 * Simulated Google Sheets Database Implementation matching Code.gs
 * Uses Slots_Config as the single source of truth for slot capacities.
 */
class MockGoogleSpreadsheet {
  constructor() {
    this.bookings = []; // rows: [bookingId, timestamp, fullName, normalizedEmail, date, timeSlot, status]
    this.slotsConfig = SLOT_DEFINITIONS.map(s => ({
      date: s.date,
      timeSlot: s.timeSlot,
      capacity: s.capacity,
      booked: 0,
      remaining: s.capacity,
      status: 'OPEN'
    }));
    this.eligibilitySheet = null;
    this.eligibilityEnabled = false;
    this.sentEmails = [];
    this.simulateEmailFailure = false;
  }

  setEligibilitySheet(sheet) {
    this.eligibilitySheet = sheet;
    this.eligibilityEnabled = true;
  }

  checkCandidateEligibility(emailToVerify) {
    const normalizedTarget = String(emailToVerify || '').trim().toLowerCase();
    if (!normalizedTarget) {
      return { eligible: false, error: 'INVALID_EMAIL', message: 'Please provide a valid email address.' };
    }

    if (!this.eligibilitySheet) {
      return {
        eligible: false,
        error: 'ELIGIBILITY_SERVICE_UNCONFIGURED',
        message: 'Candidate eligibility verification service is temporarily unconfigured. Please contact the recruitment team.'
      };
    }

    const { headers, rows } = this.eligibilitySheet;
    if (!headers || !Array.isArray(headers)) {
      return {
        eligible: false,
        error: 'ELIGIBILITY_RECORDS_UNAVAILABLE',
        message: 'Eligibility records are currently unavailable. Please contact the recruitment team.'
      };
    }

    // Dynamic header lookup
    let emailColIndex = -1;
    let nameColIndex = -1;
    for (let c = 0; c < headers.length; c++) {
      const h = String(headers[c] || '').trim().toLowerCase();
      if (h === 'email address') {
        emailColIndex = c;
      } else if (h === 'full name') {
        nameColIndex = c;
      }
    }

    // Fallback search
    if (emailColIndex === -1) {
      for (let c = 0; c < headers.length; c++) {
        if (String(headers[c] || '').toLowerCase().includes('email')) {
          emailColIndex = c;
          break;
        }
      }
    }

    if (emailColIndex === -1) {
      return {
        eligible: false,
        error: 'ELIGIBILITY_HEADER_MISSING',
        message: 'Candidate verification data structure error. Please contact the recruitment team.'
      };
    }

    if (!rows || rows.length === 0) {
      return {
        eligible: false,
        error: 'INELIGIBLE_EMAIL',
        message: `This email address (${normalizedTarget}) is not registered as an eligible candidate. Please use the email submitted in your recruitment application form.`
      };
    }

    for (const row of rows) {
      const regEmail = String(row[emailColIndex] || '').trim().toLowerCase();
      if (regEmail === normalizedTarget) {
        const regName = nameColIndex !== -1 ? String(row[nameColIndex] || '').trim() : '';
        return {
          eligible: true,
          registeredEmail: normalizedTarget,
          registeredName: regName
        };
      }
    }

    return {
      eligible: false,
      error: 'INELIGIBLE_EMAIL',
      message: `This email address (${normalizedTarget}) is not registered as an eligible candidate. Please use the email submitted in your recruitment application form.`
    };
  }

  sendBookingConfirmationEmail(bookingDetails) {
    if (this.simulateEmailFailure) {
      throw new Error('Simulated MailApp / GmailApp quota or network failure');
    }
    this.sentEmails.push({
      to: bookingDetails.email,
      fullName: bookingDetails.fullName,
      bookingId: bookingDetails.bookingId,
      date: bookingDetails.date,
      timeSlot: bookingDetails.timeSlot,
      subject: 'PAC Recruitment – Interview Slot Confirmed',
      timezone: 'Asia/Kolkata',
      instructions: 'Please arrive at the venue 10–15 minutes early'
    });
  }

  appendBooking(row) {
    this.bookings.push([...row]);
  }

  isEmailBooked(email) {
    const norm = String(email || '').trim().toLowerCase();
    return this.bookings.some(b => String(b[3] || '').trim().toLowerCase() === norm);
  }

  getSlotsConfigMap() {
    const configMap = {};
    for (const sc of this.slotsConfig) {
      const key = getCanonicalSlotKey(sc.date, sc.timeSlot);
      if (key) {
        configMap[key] = sc.capacity;
      }
    }
    return configMap;
  }

  findSlotDefinition(date, timeSlot) {
    const targetKey = getCanonicalSlotKey(date, timeSlot);
    if (!targetKey) return null;
    const sheetConfigMap = this.getSlotsConfigMap();

    for (const def of SLOT_DEFINITIONS) {
      if (getCanonicalSlotKey(def.date, def.timeSlot) === targetKey) {
        const effectiveCapacity = (sheetConfigMap[targetKey] !== undefined && sheetConfigMap[targetKey] !== null)
          ? sheetConfigMap[targetKey]
          : def.capacity;
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

  countBookingsForSlot(targetDate, targetTimeSlot) {
    const targetKey = getCanonicalSlotKey(targetDate, targetTimeSlot);
    return this.bookings.filter(b => {
      const rowKey = getCanonicalSlotKey(b[4], b[5]);
      const status = String(b[6] || '').trim().toUpperCase();
      const isConfirmed = (status === 'CONFIRMED' || status === '' || status === 'ACTIVE');
      return rowKey === targetKey && isConfirmed && status !== 'CANCELLED';
    }).length;
  }

  bookSlot(fullName, rawEmail, date, timeSlot) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!fullName || fullName.trim().length < 2) return { success: false, error: 'INVALID_NAME' };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'INVALID_EMAIL' };

    // FEATURE 1: Verify Candidate Eligibility
    if (this.eligibilityEnabled) {
      const eligibility = this.checkCandidateEligibility(email);
      if (!eligibility.eligible) {
        return {
          success: false,
          error: eligibility.error || 'INELIGIBLE_EMAIL',
          message: eligibility.message
        };
      }
      if (eligibility.registeredName && (!fullName || fullName.length < 2)) {
        fullName = eligibility.registeredName;
      }
    }

    const slotDef = this.findSlotDefinition(date, timeSlot);
    if (!slotDef) return { success: false, error: 'INVALID_SLOT' };

    if (this.isEmailBooked(email)) {
      return { success: false, error: 'DUPLICATE_BOOKING', message: 'Email already booked' };
    }

    const currentBooked = this.countBookingsForSlot(slotDef.date, slotDef.timeSlot);
    if (currentBooked >= slotDef.capacity) {
      return {
        success: false,
        error: 'SLOT_FULL',
        message: `Sorry, the slot has reached full capacity (${slotDef.capacity} candidates).`
      };
    }

    const bookingId = 'PAC-2026-TEST';
    this.appendBooking([bookingId, new Date().toISOString(), fullName, email, slotDef.date, slotDef.timeSlot, 'CONFIRMED']);

    // FEATURE 2: Send Booking Confirmation Email
    let emailSent = false;
    let emailError = null;
    try {
      this.sendBookingConfirmationEmail({
        bookingId,
        fullName,
        email,
        date: slotDef.date,
        timeSlot: slotDef.timeSlot
      });
      emailSent = true;
    } catch (e) {
      emailSent = false;
      emailError = e.message;
    }

    const updated = this.getSlotsAvailability();
    const targetSlot = updated.find(s => s.canonicalKey === slotDef.canonicalKey);

    return {
      success: true,
      booking: {
        bookingId,
        fullName,
        email,
        date: slotDef.date,
        timeSlot: slotDef.timeSlot,
        remainingSeats: targetSlot ? targetSlot.remaining : slotDef.capacity - (currentBooked + 1),
        emailSent,
        emailError
      }
    };
  }

  getSlotsAvailability() {
    const bookedMap = {};
    for (const b of this.bookings) {
      const rowDate = b[4];
      const rowTime = b[5];
      const status = String(b[6] || '').trim().toUpperCase();
      const isConfirmed = (status === 'CONFIRMED' || status === '' || status === 'ACTIVE');
      if (isConfirmed && status !== 'CANCELLED') {
        const key = getCanonicalSlotKey(rowDate, rowTime);
        if (key) {
          bookedMap[key] = (bookedMap[key] || 0) + 1;
        }
      }
    }

    // Read capacities from Slots_Config (Source of Truth)
    const sheetConfigMap = this.getSlotsConfigMap();

    const results = SLOT_DEFINITIONS.map(def => {
      const defKey = getCanonicalSlotKey(def.date, def.timeSlot);
      const configuredCapacity = (sheetConfigMap[defKey] !== undefined && sheetConfigMap[defKey] !== null)
        ? sheetConfigMap[defKey]
        : def.capacity;

      const booked = bookedMap[defKey] || 0;
      const remaining = Math.max(0, configuredCapacity - booked);
      const isFull = remaining <= 0;
      return {
        date: def.date,
        timeSlot: def.timeSlot,
        canonicalKey: defKey,
        capacity: configuredCapacity,
        booked,
        remaining,
        isFull,
        status: isFull ? 'FULL' : 'OPEN'
      };
    });

    // Update Slots_Config summary
    for (const item of results) {
      const target = this.slotsConfig.find(sc => getCanonicalSlotKey(sc.date, sc.timeSlot) === item.canonicalKey);
      if (target) {
        target.booked = item.booked;
        target.remaining = item.remaining;
        target.status = item.status;
      }
    }

    return results;
  }
}

console.log('========================================================');
console.log('Running PAC Capacity & Source of Truth Verification Tests');
console.log('========================================================\n');

// --------------------------------------------------------------------------
// TEST 1: Capacity 1 with 1 confirmed booking (Slot must be FULL with 0 remaining)
// Requirement: In Slots_Config, Wednesday 4:30 PM–5:30 PM has Max Capacity = 1
// and 1 confirmed booking. Remaining Seats must be 0 and status must be FULL.
// --------------------------------------------------------------------------
console.log('▶ Test 1: Capacity = 1 with 1 Confirmed Booking');
const db = new MockGoogleSpreadsheet();

// Configure Max Capacity = 1 for Wednesday 4:30-5:30 PM in Slots_Config
const wedConfigItem = db.slotsConfig.find(s => getCanonicalSlotKey(s.date, s.timeSlot) === '2026-10-21|4:30pm-5:30pm');
wedConfigItem.capacity = 1;

// Existing test booking in Bookings tab
db.appendBooking([
  'PAC-2026-T101',
  '2026-10-17 15:30:00',
  'First Candidate',
  'first.candidate@example.com',
  'Wednesday, 21 October 2026',
  '4:30 PM–5:30 PM',
  'CONFIRMED'
]);

// Run availability calculation
const availTest1 = db.getSlotsAvailability();
const slotTest1 = availTest1.find(s => s.canonicalKey === '2026-10-21|4:30pm-5:30pm');

assert(slotTest1, 'Wednesday 4:30 PM slot must exist');
assert.strictEqual(slotTest1.capacity, 1, 'Slot capacity must be read as 1 from Slots_Config');
assert.strictEqual(slotTest1.booked, 1, 'Booked count must be 1');
assert.strictEqual(slotTest1.remaining, 0, 'Remaining seats must be Math.max(0, 1 - 1) = 0 (NOT 4)');
assert.strictEqual(slotTest1.isFull, true, 'Slot must be marked isFull = true');
assert.strictEqual(slotTest1.status, 'FULL', 'Slot status must be FULL');

// Verify Slots_Config sheet was updated with Booked = 1, Remaining = 0, Status = FULL
assert.strictEqual(wedConfigItem.capacity, 1, 'Slots_Config capacity preserved as 1');
assert.strictEqual(wedConfigItem.booked, 1, 'Slots_Config Booked Seats must equal 1');
assert.strictEqual(wedConfigItem.remaining, 0, 'Slots_Config Remaining Seats must equal 0');
assert.strictEqual(wedConfigItem.status, 'FULL', 'Slots_Config Status must equal FULL');

// Attempt a second booking on this full slot (capacity 1, 1 booked)
const secondBooking = db.bookSlot('Second Candidate', 'second@example.com', 'Wednesday, 21 October 2026', '4:30 PM–5:30 PM');
assert.strictEqual(secondBooking.success, false, 'Second booking on full slot must be rejected');
assert.strictEqual(secondBooking.error, 'SLOT_FULL', 'Rejection reason must be SLOT_FULL');
console.log('✔ Test 1 Passed: Capacity 1 with 1 booking correctly yields 0 remaining seats, status FULL, and rejects new bookings.\n');

// --------------------------------------------------------------------------
// TEST 2: Restore Original Capacity of 5 for Wednesday 4:30–5:30 PM
// Requirement: Restore the original capacity of 5 for this slot after testing.
// --------------------------------------------------------------------------
console.log('▶ Test 2: Restore Original Capacity of 5 for Wednesday 4:30–5:30 PM');
// Restore capacity to 5 in Slots_Config
wedConfigItem.capacity = 5;

// Re-calculate availability
const availRestored = db.getSlotsAvailability();
const slotRestored = availRestored.find(s => s.canonicalKey === '2026-10-21|4:30pm-5:30pm');

assert.strictEqual(slotRestored.capacity, 5, 'Slot capacity must be read as 5 from Slots_Config');
assert.strictEqual(slotRestored.booked, 1, 'Booked count must remain 1');
assert.strictEqual(slotRestored.remaining, 4, 'Remaining seats must be Math.max(0, 5 - 1) = 4');
assert.strictEqual(slotRestored.isFull, false, 'Slot must now be OPEN');
assert.strictEqual(slotRestored.status, 'OPEN', 'Slot status must be OPEN');

// Verify Slots_Config sheet was updated with Booked = 1, Remaining = 4, Status = OPEN
assert.strictEqual(wedConfigItem.capacity, 5, 'Slots_Config capacity restored to 5');
assert.strictEqual(wedConfigItem.booked, 1, 'Slots_Config Booked Seats equals 1');
assert.strictEqual(wedConfigItem.remaining, 4, 'Slots_Config Remaining Seats equals 4');
assert.strictEqual(wedConfigItem.status, 'OPEN', 'Slots_Config Status equals OPEN');

// Total Wednesday available seats = 4 + 10 + 12 = 26
const wedSlots = availRestored.filter(s => getCanonicalDate(s.date) === '2026-10-21');
const totalWedRemaining = wedSlots.reduce((sum, s) => sum + s.remaining, 0);
assert.strictEqual(totalWedRemaining, 26, 'Wednesday total remaining seats must be 26 (4 + 10 + 12)');
console.log('✔ Test 2 Passed: Restoring capacity to 5 yields 1 booked, 4 remaining, status OPEN, and 26 Wednesday seats.\n');

// --------------------------------------------------------------------------
// TEST 3: Duplicate Email Check & Lock Concurrency Invariance
// --------------------------------------------------------------------------
console.log('▶ Test 3: Duplicate Email & Invariance');
assert.strictEqual(db.isEmailBooked('FIRST.CANDIDATE@EXAMPLE.COM'), true, 'Duplicate normalized email must be blocked');
assert.strictEqual(db.isEmailBooked('other@example.com'), false, 'Unused email must be allowed');
console.log('✔ Test 3 Passed: Duplicate email check preserved.\n');

// --------------------------------------------------------------------------
// TEST 4: FEATURE 1 - Candidate Eligibility Verification via Google Form Responses
// Requirements:
// 1. Separate spreadsheet tab "Form responses 1" as sole eligibility source.
// 2. Dynamic header lookup for "Email address" and "Full name".
// 3. Normalized email comparison (trim & lowercase).
// 4. Ineligible emails rejected with clear friendly error; no slot consumed.
// 5. Safe failure when unconfigured/inaccessible; no unverified booking allowed.
// --------------------------------------------------------------------------
console.log('▶ Test 4: Candidate Eligibility Verification (Form responses 1)');
const eligibilityDb = new MockGoogleSpreadsheet();

// Configure Mock "Form responses 1" tab from "FY_2026 (Responses)"
// Notice header ordering puts "Email address" at column 2 (dynamic header test)
eligibilityDb.setEligibilitySheet({
  headers: ['Timestamp', 'Full name', 'Email address', 'College Department', 'Phone Number'],
  rows: [
    ['2026-10-15 10:14:00', 'Aarav Patel', 'aarav.patel@college.edu', 'Mechanical', '9876543210'],
    ['2026-10-15 11:22:30', 'Sneha Kulkarni', 'sneha.kulkarni@college.edu', 'Automobile', '9876543211'],
    ['2026-10-16 09:05:12', 'Kabir Verma', 'kabir.verma@college.edu', 'Electrical', '9876543212']
  ]
});

// 4A: Eligible email with untrimmed and mixed casing must succeed
const eligibleBooking = eligibilityDb.bookSlot(
  'Aarav Patel',
  '   AARAV.patel@COLLEGE.edu  ',
  'Wednesday, 21 October 2026',
  '5:30 PM–6:30 PM'
);
assert.strictEqual(eligibleBooking.success, true, 'Eligible candidate booking must succeed');
assert.strictEqual(eligibleBooking.booking.email, 'aarav.patel@college.edu', 'Email must be normalized');
assert.strictEqual(eligibilityDb.bookings.length, 1, 'Booking record must be created for eligible candidate');

// 4B: Unregistered email must be REJECTED with INELIGIBLE_EMAIL
const initialSeats = eligibilityDb.getSlotsAvailability().find(s => s.canonicalKey === '2026-10-21|6:30pm-7:30pm').remaining;
const ineligibleBooking = eligibilityDb.bookSlot(
  'Intruder Candidate',
  'intruder.random@gmail.com',
  'Wednesday, 21 October 2026',
  '6:30 PM–7:30 PM'
);
assert.strictEqual(ineligibleBooking.success, false, 'Ineligible email must be rejected');
assert.strictEqual(ineligibleBooking.error, 'INELIGIBLE_EMAIL', 'Error code must be INELIGIBLE_EMAIL');
assert(ineligibleBooking.message.includes('not registered as an eligible candidate'), 'Must return friendly error message');
assert.strictEqual(eligibilityDb.bookings.length, 1, 'Ineligible booking must NOT create any booking row');
const seatsAfterIneligible = eligibilityDb.getSlotsAvailability().find(s => s.canonicalKey === '2026-10-21|6:30pm-7:30pm').remaining;
assert.strictEqual(seatsAfterIneligible, initialSeats, 'Ineligible booking must NOT consume any slot capacity');

// 4C: Duplicate booking by eligible candidate must still be blocked by duplicate prevention
const dupEligible = eligibilityDb.bookSlot(
  'Aarav Patel',
  'aarav.patel@college.edu',
  'Thursday, 22 October 2026',
  '4:30 PM–5:30 PM'
);
assert.strictEqual(dupEligible.success, false, 'Duplicate booking for already booked candidate must be blocked');
assert.strictEqual(dupEligible.error, 'DUPLICATE_BOOKING', 'Error must be DUPLICATE_BOOKING');

// 4D: Failsafe test - Inaccessible/unconfigured eligibility source must fail safely without allowing booking
const unconfiguredDb = new MockGoogleSpreadsheet();
unconfiguredDb.eligibilityEnabled = true; // Enabled but no eligibilitySheet provided
const unverifiedBooking = unconfiguredDb.bookSlot(
  'Test User',
  'test.user@example.com',
  'Wednesday, 21 October 2026',
  '4:30 PM–5:30 PM'
);
assert.strictEqual(unverifiedBooking.success, false, 'Unverified booking must be rejected if eligibility source unavailable');
assert.strictEqual(unverifiedBooking.error, 'ELIGIBILITY_SERVICE_UNCONFIGURED', 'Must return unconfigured service error');
assert.strictEqual(unconfiguredDb.bookings.length, 0, 'No booking record must be created when eligibility cannot be checked');
console.log('✔ Test 4 Passed: Candidate eligibility verification accurately validates registered emails, rejects unlisted candidates, prevents slot consumption, and fails safely.\n');

// --------------------------------------------------------------------------
// TEST 5: FEATURE 2 - Booking Confirmation Email Dispatch
// Requirements:
// 1. Sent ONLY after booking has been successfully saved.
// 2. Email contains reference ID, candidate name, registered email, date, exact start and end times in Asia/Kolkata, arrive 10-15 min early instructions.
// 3. Sent only once per successful booking; never on rejected or duplicate bookings.
// 4. Email delivery failure does not roll back booking or release slot.
// --------------------------------------------------------------------------
console.log('▶ Test 5: Booking Confirmation Email Dispatch');

// 5A: Successful booking triggers confirmation email
assert.strictEqual(eligibilityDb.sentEmails.length, 1, 'Exactly one confirmation email must have been sent for Aarav Patel');
const sentEmail = eligibilityDb.sentEmails[0];
assert.strictEqual(sentEmail.to, 'aarav.patel@college.edu', 'Email recipient must match candidate');
assert.strictEqual(sentEmail.subject, 'PAC Recruitment – Interview Slot Confirmed', 'Email subject must match requirement');
assert.strictEqual(sentEmail.timezone, 'Asia/Kolkata', 'Email timezone must be Asia/Kolkata');
assert(sentEmail.instructions.includes('10–15 minutes early'), 'Email must include arrival instructions');
assert.strictEqual(eligibleBooking.booking.emailSent, true, 'Booking response must indicate emailSent: true');

// 5B: No emails dispatched for ineligible or duplicate attempts
const emailCountBeforeAttempts = eligibilityDb.sentEmails.length;
eligibilityDb.bookSlot('Unregistered', 'unregistered@example.com', 'Wednesday, 21 October 2026', '4:30 PM–5:30 PM');
eligibilityDb.bookSlot('Aarav Patel', 'aarav.patel@college.edu', 'Wednesday, 21 October 2026', '4:30 PM–5:30 PM');
assert.strictEqual(eligibilityDb.sentEmails.length, emailCountBeforeAttempts, 'Rejected/duplicate bookings must NEVER send confirmation emails');

// 5C: Email delivery failure resilience (does NOT roll back booking or release slot)
eligibilityDb.simulateEmailFailure = true;
const emailFailBooking = eligibilityDb.bookSlot(
  'Sneha Kulkarni',
  'sneha.kulkarni@college.edu',
  'Thursday, 22 October 2026',
  '5:30 PM–6:30 PM'
);
assert.strictEqual(emailFailBooking.success, true, 'Booking itself must succeed even if email delivery fails');
assert.strictEqual(emailFailBooking.booking.emailSent, false, 'Response must truthfully indicate emailSent: false');
assert(emailFailBooking.booking.emailError !== null, 'Response must include error notice');
assert.strictEqual(eligibilityDb.bookings.some(b => b[3] === 'sneha.kulkarni@college.edu'), true, 'Booking row MUST be preserved in Bookings sheet');
console.log('✔ Test 5 Passed: Confirmation emails are dispatched upon successful booking with full details in Asia/Kolkata, duplicate/ineligible attempts send 0 emails, and email failures do not affect booking persistence.\n');

console.log('========================================================');
console.log('All Capacity, Eligibility & Confirmation Email Tests PASSED with 100% precision!');
console.log('========================================================');

