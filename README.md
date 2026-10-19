# PAC Automobile Club — Recruitment 2026 Interview Slot Booking System

A clean, modern, mobile-friendly interview slot booking website engineered for **PAC Automobile Club Recruitment 2026**.

Built with a high-performance **HTML5, Vanilla CSS, and JavaScript** frontend, paired with a serverless **Google Apps Script & Google Sheets** backend and persistent database. 100% free to host and run.

---

## 🏎️ Key Features

- **Automotive-Themed Dark Design**: High-contrast dark aesthetic (`#07080a`, `#131722`) with racing red accents (`#e11d48`), glowing gauges, and metallic typography (`Rajdhani` & `Outfit`).
- **Live Seat Availability Counter**: Displays exact remaining capacity for each slot in real time with dynamic fill gauges.
- **Automatic Slot Disabling**: Automatically disables slots when capacity reaches 0 (`0 Seats Left (FULL)`).
- **Duplicate Prevention**: Strict case-insensitive normalized email checking (`alex@domain.com` == `ALEX@domain.com`).
- **Concurrency & Race Condition Control**: Implemented with Google Apps Script `LockService.getScriptLock(30000)` to ensure concurrent requests never exceed maximum slot capacity.
- **Persistent Storage**: All bookings are permanently stored in Google Sheets with a unique booking reference code (`PAC-2026-XXXX`).
- **Candidate Boarding Pass / Ticket Modal**: Instant printable confirmation with unique ID, venue instructions, and a one-click **"Add to Calendar" (.ics)** file download.
- **Official PAC / TORQSCREW Emblem**: High-resolution official circular logo integrated across the site header, browser favicon, confirmation pass, and splash sequence.
- **Premium Opening Animation**: Centered emblem entrance with smooth fade-in, scale-up, ambient red pulse, restrained racing-line sweep, and smooth ~1.2s transition into the portal. Respects `prefers-reduced-motion` and single-session caching.
- **Mobile Responsive**: Fully responsive layout optimized for mobile screens, tablets, and desktops.
- **Direct Backend Integration**: Built-in fixed connection to Google Apps Script Web App with live seat synchronization.

---

## 📅 Interview Dates & Capacities

| Date | Time Slot | Max Capacity |
| :--- | :--- | :---: |
| **Wednesday, 21 October 2026** | 4:30 PM–5:30 PM | 5 candidates |
| | 5:30 PM–6:30 PM | 10 candidates |
| | 6:30 PM–7:30 PM | 12 candidates |
| **Thursday, 22 October 2026** | 4:30 PM–5:30 PM | 10 candidates |
| | 5:30 PM–6:30 PM | 10 candidates |
| | 6:30 PM–7:30 PM | 15 candidates |
| **Friday, 23 October 2026** | 4:30 PM–5:30 PM | 10 candidates |
| | 5:30 PM–6:30 PM | 15 candidates |
| | 6:30 PM–7:30 PM | 15 candidates |

---

## 📂 Repository Structure

```
PAC/Recruitment/
├── index.html                   # Main responsive booking application
├── assets/
│   ├── pac-logo.png             # Official transparent PAC/TORQSCREW emblem
│   └── pac-logo-raw.jpg         # Original uploaded image source
├── css/
│   └── styles.css               # Automotive dark theme, opening animation & responsive styles
├── js/
│   ├── config.js                # Central configuration (Backend URL, schedule & capacities)
│   └── app.js                   # Application controller, intro sequence & API integration
├── google-apps-script/
│   ├── Code.gs                  # Google Apps Script backend with LockService & Sheets sync
│   └── appsscript.json          # Apps Script manifest file
├── docs/
│   └── SETUP_GUIDE.md           # Step-by-step deployment guide & test checklist
└── README.md                    # Project overview & documentation
```

---

## 🚀 Quick Start Guide

For complete, detailed instructions, see the [Setup & Deployment Guide](docs/SETUP_GUIDE.md).

### 1. Setup Backend in Google Sheets (2 minutes)
1. Create a new sheet at [sheets.new](https://sheets.new).
2. Go to **Extensions** > **Apps Script**.
3. Replace the script code with [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
4. Run `setup()` once to initialize headers and slot capacities.
5. Click **Deploy** > **New deployment** > Select **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
6. Copy the Web App URL (ends in `/exec`).

### 2. Connect the Frontend
Paste your Web App URL into [`js/config.js`](js/config.js):
```javascript
GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxcHY2SIQtMFChKw9pygNa4Lr7cVU7iFENuoTD1KjdU5yenc3qWqzzrGrvK0qrtLiGIVg/exec"
```

### 3. Launch Frontend (Free Hosting)
Open `index.html` directly in any web browser, or host for free via:
- **GitHub Pages**: Push repo, enable Pages under *Settings > Pages*.
- **Vercel / Netlify / Cloudflare Pages**: Connect repo or drag & drop folder.

---

## 🔒 Booking Rules & Server-Side Security

1. **Strict Capacity Limits**: Each slot is locked to its prescribed ceiling.
2. **Server-Side Lock**: Concurrency is managed with `LockService.getScriptLock()` waiting up to 30 seconds for atomic transactions.
3. **Duplicate Prevention**: Email normalization (`trim().toLowerCase()`) is enforced before both query and row append.
4. **No Auth/OTP/Payment Required**: Accessible, zero-friction flow for student applicants.
