/**
 * PAC Automobile Club - Recruitment 2026
 * Frontend Application Controller
 */

(function () {
  'use strict';

  // Application State
  const state = {
    selectedDate: APP_CONFIG.SCHEDULE[0].date,
    selectedSlot: null,
    slotsAvailability: {}, // key: "Date|TimeSlot" -> { capacity, booked, remaining, isFull }
    isSubmitting: false,
    backendStatus: 'checking', // 'checking' | 'online' | 'unconfigured' | 'error'
    currentBooking: null
  };

  // DOM Elements Cache
  const DOM = {
    backendStatusChip: document.getElementById('backend-status-chip'),
    backendStatusText: document.getElementById('backend-status-text'),
    btnRefreshSlots: document.getElementById('btn-refresh-slots'),
    refreshIcon: document.getElementById('refresh-icon'),
    dateButtonsContainer: document.getElementById('date-buttons-container'),
    selectedDateSummary: document.getElementById('selected-date-summary'),
    slotsContainer: document.getElementById('slots-container'),
    bookingForm: document.getElementById('booking-form'),
    inputFullName: document.getElementById('input-fullname'),
    inputEmail: document.getElementById('input-email'),
    errorFullName: document.getElementById('error-fullname'),
    errorEmail: document.getElementById('error-email'),
    errorDate: document.getElementById('error-date'),
    errorSlot: document.getElementById('error-slot'),
    summaryCandidateName: document.getElementById('summary-candidate-name'),
    summaryCandidateEmail: document.getElementById('summary-candidate-email'),
    summarySlotTime: document.getElementById('summary-slot-time'),
    btnSubmit: document.getElementById('btn-submit-booking'),
    submitSpinner: document.getElementById('submit-spinner'),
    formAlertMessage: document.getElementById('form-alert-message'),
    formAlertText: document.getElementById('form-alert-text'),
    // Confirmation Modal Elements
    modalConfirmation: document.getElementById('modal-confirmation'),
    confBookingId: document.getElementById('conf-booking-id'),
    confName: document.getElementById('conf-name'),
    confEmail: document.getElementById('conf-email'),
    confDate: document.getElementById('conf-date'),
    confTime: document.getElementById('conf-time'),
    confVenue: document.getElementById('conf-venue'),
    btnAddCalendar: document.getElementById('btn-add-calendar'),
    btnPrintTicket: document.getElementById('btn-print-ticket'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    // Opening Splash Animation Overlay
    introOverlay: document.getElementById('pac-intro-overlay')
  };

  /**
   * Initialize Application
   */
  function init() {
    initIntroAnimation();
    initDefaultAvailability();
    renderDateButtons();
    renderSlots();
    attachEventListeners();
    checkBackendConnection();
  }

  /**
   * Premium Opening Splash Animation Controller
   * Plays the complete 2.5–3 second cinematic animation on every page load/reload.
   * Respects prefers-reduced-motion for accessibility.
   * Does not use sessionStorage or localStorage, ensuring it replays on every visit.
   * Guaranteed fail-safe prevents overlay from sticking or blocking form interactions.
   */
  function initIntroAnimation() {
    const overlay = DOM.introOverlay;
    if (!overlay) return;

    // Respect accessibility motion preference
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      overlay.classList.add('fade-out');
      overlay.classList.add('intro-hidden');
      return;
    }

    let dismissed = false;
    const dismissIntro = () => {
      if (dismissed) return;
      dismissed = true;
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.classList.add('intro-hidden');
      }, 700);
    };

    // Complete cinematic animation playback (~2.6s before smooth fade-out)
    const introTimer = setTimeout(dismissIntro, 2600);

    // Fail-safe timeout guaranteeing the form is never blocked
    setTimeout(dismissIntro, 3500);

    // Also allow instant skip if visitor clicks or taps anywhere
    overlay.addEventListener('click', () => {
      clearTimeout(introTimer);
      dismissIntro();
    });
  }

  /**
   * Initialize default availability values from APP_CONFIG
   */
  function initDefaultAvailability() {
    APP_CONFIG.SCHEDULE.forEach(day => {
      day.slots.forEach(slot => {
        const key = getSlotKey(day.date, slot.time);
        state.slotsAvailability[key] = {
          date: day.date,
          timeSlot: slot.time,
          capacity: slot.capacity,
          booked: 0,
          remaining: slot.capacity,
          isFull: false
        };
      });
    });
  }

  function canonicalDate(val) {
    if (!val) return '';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const str = String(val).toLowerCase();
    if (str.includes('21') && (str.includes('oct') || str.includes('wed') || str.includes('2026'))) return '2026-10-21';
    if (str.includes('22') && (str.includes('oct') || str.includes('thu') || str.includes('2026'))) return '2026-10-22';
    if (str.includes('23') && (str.includes('oct') || str.includes('fri') || str.includes('2026'))) return '2026-10-23';
    return str.replace(/[^a-z0-9]/g, '');
  }

  function canonicalTime(val) {
    if (!val) return '';
    const str = String(val).toLowerCase().replace(/[\s\u00A0\u202F]/g, '').replace(/[–—−]/g, '-');
    if (str.includes('4:30') && str.includes('5:30')) return '4:30pm-5:30pm';
    if (str.includes('5:30') && str.includes('6:30')) return '5:30pm-6:30pm';
    if (str.includes('6:30') && str.includes('7:30')) return '6:30pm-7:30pm';
    return str;
  }

  function getSlotKey(date, timeSlot) {
    const cDate = canonicalDate(date);
    const cTime = canonicalTime(timeSlot);
    if (!cDate || !cTime) return `${(date || '').trim()}|${(timeSlot || '').trim()}`;
    return `${cDate}|${cTime}`;
  }

  /**
   * Render Date Selection Buttons
   */
  function renderDateButtons() {
    DOM.dateButtonsContainer.innerHTML = '';

    APP_CONFIG.SCHEDULE.forEach(day => {
      // Calculate total remaining seats for this day
      let dayCapacity = 0;
      let dayRemaining = 0;

      day.slots.forEach(s => {
        const key = getSlotKey(day.date, s.time);
        const avail = state.slotsAvailability[key] || { capacity: s.capacity, remaining: s.capacity };
        dayCapacity += avail.capacity;
        dayRemaining += avail.remaining;
      });

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `date-btn ${state.selectedDate === day.date ? 'active' : ''}`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', state.selectedDate === day.date ? 'true' : 'false');
      btn.dataset.date = day.date;

      btn.innerHTML = `
        <span class="date-btn-day">${day.dayName}</span>
        <span class="date-btn-sub">${day.dateNumber} 2026</span>
        <span class="date-btn-seats">${dayRemaining} seats available</span>
      `;

      btn.addEventListener('click', () => {
        selectDate(day.date);
      });

      DOM.dateButtonsContainer.appendChild(btn);
    });
  }

  /**
   * Handle Date Selection
   */
  function selectDate(date) {
    if (state.selectedDate === date) return;
    state.selectedDate = date;
    state.selectedSlot = null; // Reset slot selection when date changes

    // Update UI
    renderDateButtons();
    renderSlots();
    updateSummary();
    hideFieldError(DOM.errorDate);
    hideFieldError(DOM.errorSlot);
  }

  /**
   * Render Time Slots for the Selected Date
   */
  function renderSlots() {
    const currentDay = APP_CONFIG.SCHEDULE.find(d => d.date === state.selectedDate);
    if (!currentDay) return;

    DOM.selectedDateSummary.textContent = `Showing slots for ${currentDay.shortDate}`;
    DOM.slotsContainer.innerHTML = '';

    currentDay.slots.forEach(slotDef => {
      const key = getSlotKey(state.selectedDate, slotDef.time);
      const avail = state.slotsAvailability[key] || {
        capacity: slotDef.capacity,
        booked: 0,
        remaining: slotDef.capacity,
        isFull: false
      };

      const isSelected = state.selectedSlot && state.selectedSlot.time === slotDef.time;
      const isFull = avail.remaining <= 0 || avail.isFull;

      const card = document.createElement('div');
      card.className = `slot-card ${isSelected ? 'selected' : ''} ${isFull ? 'disabled' : ''}`;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      card.setAttribute('aria-disabled', isFull ? 'true' : 'false');
      card.dataset.time = slotDef.time;

      // Status badge styling
      let statusBadgeClass = 'status-open';
      let statusText = `${avail.remaining} seats left`;

      if (isFull) {
        statusBadgeClass = 'status-full';
        statusText = '0 Seats Left (FULL)';
      } else if (avail.remaining <= 2) {
        statusBadgeClass = 'status-critical';
        statusText = `Only ${avail.remaining} seat${avail.remaining === 1 ? '' : 's'} left!`;
      } else if (avail.remaining <= 5) {
        statusBadgeClass = 'status-low';
        statusText = `${avail.remaining} seats left (Fast Filling)`;
      }

      // Progress bar percentage
      const percentBooked = Math.min(100, Math.round(((avail.capacity - avail.remaining) / avail.capacity) * 100));
      let progressClass = '';
      if (percentBooked >= 80) progressClass = 'fill-high';
      else if (percentBooked >= 50) progressClass = 'fill-medium';

      card.innerHTML = `
        <div class="slot-time-header">
          <svg class="slot-clock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="slot-time-text">${slotDef.time}</span>
        </div>

        <div class="slot-status-bar">
          <div class="slot-seats-badge ${statusBadgeClass}">
            <span>${statusText}</span>
          </div>

          <div class="slot-progress-track">
            <div class="slot-progress-fill ${progressClass}" style="width: ${percentBooked}%"></div>
          </div>

          <div class="slot-capacity-caption">
            <span>Capacity: ${avail.capacity} max</span>
            <span>${avail.booked || 0} booked</span>
          </div>
        </div>
      `;

      if (!isFull) {
        card.addEventListener('click', () => {
          selectSlot(slotDef, avail);
        });
      }

      DOM.slotsContainer.appendChild(card);
    });
  }

  /**
   * Handle Slot Selection
   */
  function selectSlot(slotDef, avail) {
    if (avail.remaining <= 0) return;
    state.selectedSlot = {
      time: slotDef.time,
      capacity: slotDef.capacity,
      remaining: avail.remaining
    };

    renderSlots();
    updateSummary();
    hideFieldError(DOM.errorSlot);
  }

  /**
   * Update Form Summary Recap Box
   */
  function updateSummary() {
    const fullName = DOM.inputFullName.value.trim();
    const email = DOM.inputEmail.value.trim().toLowerCase();

    DOM.summaryCandidateName.textContent = fullName || 'Not entered yet';
    DOM.summaryCandidateEmail.textContent = email || 'Not entered yet';

    if (state.selectedDate && state.selectedSlot) {
      DOM.summarySlotTime.textContent = `${state.selectedDate} • ${state.selectedSlot.time}`;
    } else if (state.selectedDate) {
      DOM.summarySlotTime.textContent = `${state.selectedDate} (Select time slot)`;
    } else {
      DOM.summarySlotTime.textContent = 'Select date & slot above';
    }
  }

  /**
   * Form Validation
   */
  function validateForm() {
    let isValid = true;
    hideAlert();

    // 1. Full Name
    const fullName = DOM.inputFullName.value.trim();
    if (!fullName || fullName.length < 2) {
      showFieldError(DOM.errorFullName, DOM.inputFullName);
      isValid = false;
    } else {
      hideFieldError(DOM.errorFullName, DOM.inputFullName);
    }

    // 2. Email Address
    const email = DOM.inputEmail.value.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showFieldError(DOM.errorEmail, DOM.inputEmail);
      isValid = false;
    } else {
      hideFieldError(DOM.errorEmail, DOM.inputEmail);
    }

    // 3. Date Selection
    if (!state.selectedDate) {
      showFieldError(DOM.errorDate);
      isValid = false;
    } else {
      hideFieldError(DOM.errorDate);
    }

    // 4. Slot Selection
    if (!state.selectedSlot) {
      showFieldError(DOM.errorSlot);
      isValid = false;
    } else {
      hideFieldError(DOM.errorSlot);
    }

    return isValid;
  }

  function showFieldError(errorElem, inputElem) {
    if (errorElem) errorElem.classList.add('visible');
    if (inputElem) inputElem.classList.add('is-invalid');
  }

  function hideFieldError(errorElem, inputElem) {
    if (errorElem) errorElem.classList.remove('visible');
    if (inputElem) inputElem.classList.remove('is-invalid');
  }

  function showAlert(message, type = 'error') {
    DOM.formAlertText.textContent = message;
    DOM.formAlertMessage.className = `form-alert alert-${type}`;
    DOM.formAlertMessage.classList.remove('hidden');
    DOM.formAlertMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    DOM.formAlertMessage.classList.add('hidden');
  }

  /**
   * Handle Form Submission
   */
  async function handleBookingSubmit(e) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const backendUrl = APP_CONFIG.getBackendUrl();

    if (!backendUrl) {
      showAlert(
        'Cannot complete booking: Service temporarily unavailable. Please try again later or contact the recruitment team.',
        'error'
      );
      return;
    }

    setSubmitting(true);
    hideAlert();

    const normalizedEmail = DOM.inputEmail.value.trim().toLowerCase();
    const payload = {
      action: 'bookSlot',
      fullName: DOM.inputFullName.value.trim(),
      email: normalizedEmail,
      date: state.selectedDate,
      timeSlot: state.selectedSlot.time
    };

    try {
      let response;
      let result;

      // Primary Attempt: POST with text/plain (avoids CORS preflight in standard web browsers)
      try {
        response = await fetch(backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        result = await response.json();
      } catch (postErr) {
        console.warn('POST submission encounter, attempting reliable GET fallback:', postErr);
        // Fallback Attempt: GET request with URL parameters (for strict local file:/// or proxy environments)
        const getParams = new URLSearchParams({
          action: 'bookSlot',
          fullName: payload.fullName,
          email: payload.email,
          date: payload.date,
          timeSlot: payload.timeSlot,
          _t: Date.now()
        });
        const fallbackUrl = `${backendUrl}${backendUrl.includes('?') ? '&' : '?'}${getParams.toString()}`;
        response = await fetch(fallbackUrl, {
          method: 'GET',
          redirect: 'follow'
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        result = await response.json();
      }

      if (result.success) {
        // Successful booking!
        state.currentBooking = result.booking || {
          bookingId: result.bookingId || 'PAC-2026-CONF',
          fullName: payload.fullName,
          email: payload.email,
          date: payload.date,
          timeSlot: payload.timeSlot,
          timestamp: new Date().toISOString()
        };

        // Show confirmation pass
        showConfirmationModal(state.currentBooking);

        // Refresh seats from server to update capacity across all slots
        await fetchSlotsAvailability();

        // Reset form inputs
        DOM.bookingForm.reset();
        state.selectedSlot = null;
        updateSummary();
      } else {
        // Handle specific server rejections
        if (result.error === 'INELIGIBLE_EMAIL' || result.error === 'NOT_ELIGIBLE') {
          showAlert(result.message || 'This email address is not registered as an eligible candidate. Please use the email address you submitted in your recruitment application form.', 'error');
        } else if (result.error === 'DUPLICATE_BOOKING') {
          showAlert(result.message || 'This email address has already been used to book an interview slot. Only one booking per candidate is permitted.', 'error');
        } else if (result.error === 'SLOT_FULL') {
          showAlert(result.message || 'Sorry, this time slot has just reached full capacity. Please select another slot.', 'error');
          // Refresh slots to show updated disabled state
          await fetchSlotsAvailability();
        } else {
          showAlert(result.message || 'Failed to complete booking. Please try again.', 'error');
        }
      }

    } catch (err) {
      console.error('Booking submission error:', err);
      showAlert(
        `Connection failed: Could not reach the booking server. Please verify your internet connection or check the Google Apps Script Web App deployment (${err.message}).`,
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function setSubmitting(isSubmitting) {
    state.isSubmitting = isSubmitting;
    DOM.btnSubmit.disabled = isSubmitting;
    if (isSubmitting) {
      DOM.submitSpinner.classList.remove('hidden');
    } else {
      DOM.submitSpinner.classList.add('hidden');
    }
  }

  /**
   * Check Backend Connection & Fetch Live Slots
   */
  async function checkBackendConnection() {
    const backendUrl = APP_CONFIG.getBackendUrl();

    if (!backendUrl) {
      setBackendStatus('error');
      return;
    }

    setBackendStatus('checking');

    try {
      await fetchSlotsAvailability();
      setBackendStatus('online');
    } catch (err) {
      console.warn('Backend check warning:', err);
      setBackendStatus('error');
    }
  }

  /**
   * Fetch Live Slot Capacities from Google Apps Script
   */
  async function fetchSlotsAvailability() {
    const backendUrl = APP_CONFIG.getBackendUrl();
    if (!backendUrl) return;

    DOM.refreshIcon.classList.add('spinning');

    try {
      const fetchUrl = `${backendUrl}${backendUrl.includes('?') ? '&' : '?'}action=getSlots&_t=${Date.now()}`;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        result.data.forEach(item => {
          const key = item.canonicalKey || getSlotKey(item.date, item.timeSlot);
          state.slotsAvailability[key] = {
            date: item.date,
            timeSlot: item.timeSlot,
            capacity: item.capacity,
            booked: item.booked,
            remaining: item.remaining,
            isFull: item.isFull || item.remaining <= 0
          };
          const altKey = getSlotKey(item.date, item.timeSlot);
          if (altKey && altKey !== key) {
            state.slotsAvailability[altKey] = state.slotsAvailability[key];
          }
        });

        // Re-render date counts and slots
        renderDateButtons();
        renderSlots();

        // If currently selected slot is now full, deselect it
        if (state.selectedSlot) {
          const currentKey = getSlotKey(state.selectedDate, state.selectedSlot.time);
          const currentAvail = state.slotsAvailability[currentKey];
          if (currentAvail && currentAvail.isFull) {
            state.selectedSlot = null;
            renderSlots();
            updateSummary();
            showAlert('Notice: The slot you had selected just reached full capacity.', 'error');
          }
        }
      }
    } finally {
      setTimeout(() => {
        DOM.refreshIcon.classList.remove('spinning');
      }, 400);
    }
  }

  /**
   * Update Backend Status Chip in Nav
   */
  function setBackendStatus(status) {
    state.backendStatus = status;
    if (DOM.backendStatusChip) {
      DOM.backendStatusChip.className = 'status-chip ' + status;
    }

    switch (status) {
      case 'online':
        DOM.backendStatusText.textContent = 'Google Sheets Connected';
        break;
      case 'checking':
        DOM.backendStatusText.textContent = 'Connecting...';
        break;
      case 'error':
      default:
        DOM.backendStatusText.textContent = 'Offline / Error';
        break;
    }
  }

  /**
   * Confirmation Modal Logic
   */
  function showConfirmationModal(booking) {
    DOM.confBookingId.textContent = booking.bookingId;
    DOM.confName.textContent = booking.fullName;
    DOM.confEmail.textContent = booking.email;
    DOM.confDate.textContent = booking.date;
    DOM.confTime.textContent = booking.timeSlot;
    DOM.confVenue.textContent = APP_CONFIG.VENUE;

    const subtext = document.querySelector('.confirmation-subtext');
    if (subtext) {
      if (booking.emailSent) {
        subtext.textContent = `Your interview booking is confirmed! A confirmation email has been dispatched to ${booking.email}.`;
      } else {
        subtext.textContent = 'Your interview booking has been locked and permanently recorded in the recruitment register.';
      }
    }

    DOM.modalConfirmation.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeConfirmationModal() {
    DOM.modalConfirmation.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /**
   * Generate .ics Calendar Invite
   */
  function downloadCalendarInvite() {
    if (!state.currentBooking) return;
    const b = state.currentBooking;

    // Parse date and time into ISO
    // Example: "Wednesday, 21 October 2026" & "4:30 PM–5:30 PM"
    let year = 2026;
    let month = 10;
    let day = 21;
    if (b.date.includes('22')) day = 22;
    if (b.date.includes('23')) day = 23;

    // Parse start and end times
    let startHour = 16, startMin = 30;
    let endHour = 17, endMin = 30;

    if (b.timeSlot.includes('5:30') && b.timeSlot.includes('6:30')) {
      startHour = 17; startMin = 30;
      endHour = 18; endMin = 30;
    } else if (b.timeSlot.includes('6:30') && b.timeSlot.includes('7:30')) {
      startHour = 18; startMin = 30;
      endHour = 19; endMin = 30;
    }

    const pad = n => String(n).padStart(2, '0');
    // Using Asia/Kolkata (IST = UTC+5:30) or local format
    const dtStart = `${year}${pad(month)}${pad(day)}T${pad(startHour)}${pad(startMin)}00`;
    const dtEnd = `${year}${pad(month)}${pad(day)}T${pad(endHour)}${pad(endMin)}00`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PAC Automobile Club//Recruitment 2026//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${b.bookingId}@pacautomobile.club`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;TZID=Asia/Kolkata:${dtStart}`,
      `DTEND;TZID=Asia/Kolkata:${dtEnd}`,
      `SUMMARY:PAC Automobile Club Interview - ${b.fullName}`,
      `DESCRIPTION:Interview booking confirmation (${b.bookingId}) for PAC Automobile Club Recruitment 2026. Please report 10 minutes prior with your student ID and portfolio.`,
      `LOCATION:${APP_CONFIG.VENUE}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PAC_Interview_${b.bookingId}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Event Listeners Registration
   */
  function attachEventListeners() {
    // Form Inputs real-time listener
    DOM.inputFullName.addEventListener('input', () => {
      hideFieldError(DOM.errorFullName, DOM.inputFullName);
      updateSummary();
    });

    DOM.inputEmail.addEventListener('input', () => {
      hideFieldError(DOM.errorEmail, DOM.inputEmail);
      updateSummary();
    });

    // Form Submit
    DOM.bookingForm.addEventListener('submit', handleBookingSubmit);

    // Refresh Seats Button
    DOM.btnRefreshSlots.addEventListener('click', () => {
      fetchSlotsAvailability();
    });

    // Confirmation Modal actions
    DOM.btnCloseModal.addEventListener('click', closeConfirmationModal);
    DOM.btnPrintTicket.addEventListener('click', () => window.print());
    DOM.btnAddCalendar.addEventListener('click', downloadCalendarInvite);

    // Modal background click close
    DOM.modalConfirmation.querySelector('.modal-backdrop').addEventListener('click', closeConfirmationModal);
  }

  // Initialize on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
