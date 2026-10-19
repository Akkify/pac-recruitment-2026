/**
 * PAC Automobile Club - Recruitment 2026
 * Frontend Configuration File
 */

const APP_CONFIG = {
  // Hardcoded deployed Google Apps Script Web App URL (Fixed for all visitors)
  GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxcHY2SIQtMFChKw9pygNa4Lr7cVU7iFENuoTD1KjdU5yenc3qWqzzrGrvK0qrtLiGIVg/exec",

  // Club details
  CLUB_NAME: "PAC Automobile Club",
  EVENT_NAME: "Recruitment 2026",
  SUBTITLE: "Recruitment 2026 — Interview Slot Booking",
  VENUE: "Behind EDC Building",

  // Predefined Interview Schedule and Maximum Capacities
  SCHEDULE: [
    {
      date: "Wednesday, 21 October 2026",
      shortDate: "Wed, Oct 21",
      dayName: "Wednesday",
      dateNumber: "21 Oct",
      slots: [
        { time: "4:30 PM–5:30 PM", capacity: 5 },
        { time: "5:30 PM–6:30 PM", capacity: 10 },
        { time: "6:30 PM–7:30 PM", capacity: 12 }
      ]
    },
    {
      date: "Thursday, 22 October 2026",
      shortDate: "Thu, Oct 22",
      dayName: "Thursday",
      dateNumber: "22 Oct",
      slots: [
        { time: "4:30 PM–5:30 PM", capacity: 10 },
        { time: "5:30 PM–6:30 PM", capacity: 10 },
        { time: "6:30 PM–7:30 PM", capacity: 15 }
      ]
    },
    {
      date: "Friday, 23 October 2026",
      shortDate: "Fri, Oct 23",
      dayName: "Friday",
      dateNumber: "23 Oct",
      slots: [
        { time: "4:30 PM–5:30 PM", capacity: 10 },
        { time: "5:30 PM–6:30 PM", capacity: 15 },
        { time: "6:30 PM–7:30 PM", capacity: 15 }
      ]
    }
  ],

  /**
   * Helper to resolve the active backend URL.
   * Fixed for all visitors and does not depend on browser localStorage or sessionStorage.
   */
  getBackendUrl() {
    return (this.GOOGLE_SCRIPT_URL || "").trim();
  }
};
