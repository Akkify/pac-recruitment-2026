# PAC Automobile Club Recruitment 2026 — Complete Setup & Deployment Guide

This guide provides end-to-end instructions for configuring the Google Sheet backend, deploying the Google Apps Script Web App, linking it to the frontend, and verifying the booking system.

---

## Architecture Overview

```
┌─────────────────────────────────┐
│     Candidate's Browser         │
│  (HTML5 / Vanilla CSS / JS)     │
└──────────────┬──────────────────┘
               │
               │ HTTP GET / POST (fetch)
               ▼
┌─────────────────────────────────┐
│ Google Apps Script (Web App)    │
│  • LockService concurrency lock │
│  • Email normalization & check  │
│  • Strict capacity enforcement  │
└──────────────┬──────────────────┘
               │
               │ SpreadsheetApp API
               ▼
┌─────────────────────────────────┐
│ Google Sheets Database          │
│  • "Bookings" sheet             │
│  • "Slots_Config" sheet         │
└─────────────────────────────────┘
```

---

## Step 1: Create the Google Sheet Database

1. Open your browser and navigate to [Google Sheets](https://sheets.new).
2. Name the spreadsheet: **`PAC Automobile Club Recruitment 2026 - Database`**.
3. You can leave the sheet blank. The script contains an automated `setup()` routine that creates the sheets and formats the column headers for you.

---

## Step 2: Open Google Apps Script & Paste Backend Code

1. In your new Google Sheet, click the top menu: **Extensions** > **Apps Script**.
2. A new tab will open with the Apps Script editor.
3. Rename the project at the top left from *Untitled project* to **`PAC-Recruitment-2026-Backend`**.
4. In the left file tree, select the default file `Code.gs`.
5. Delete any placeholder code (`function myFunction() {...}`) and paste the entire contents of [`google-apps-script/Code.gs`](../google-apps-script/Code.gs).
6. Press `Ctrl + S` (or `Cmd + S` on Mac) to save the file.

---

## Step 3: Run the One-Click Sheet Initialization

1. In the Apps Script toolbar, locate the function dropdown (next to "Debug").
2. Select **`setup`** from the dropdown.
3. Click the **Run** button.
4. **Authorization Dialog**:
   - Google will prompt: *"Authorization required"*.
   - Click **Review permissions**.
   - Choose your Google Account.
   - Click **Advanced** (in small text at the bottom left).
   - Click **Go to PAC-Recruitment-2026-Backend (unsafe)**.
   - Click **Allow**.
5. Once execution finishes (takes ~3 seconds), switch back to your Google Sheet tab. You will see two professionally formatted sheets:
   - **`Bookings`**: Columns `[Booking ID | Timestamp | Full Name | Normalized Email | Interview Date | Time Slot | Status]`.
   - **`Slots_Config`**: Pre-loaded with all 9 interview slot definitions and their capacities (Wednesday 21 Oct, Thursday 22 Oct, Friday 23 Oct 2026).

---

## Step 2B: Configure Candidate Eligibility Source (Google Forms Responses)

The eligibility verification uses a separate Google spreadsheet containing the recruitment form responses:
- **Spreadsheet Name**: `FY_2026 (Responses)`
- **Response Tab**: `Form responses 1` (Sole eligibility source of truth)
- **Header Columns**: `Email address` and `Full name` (detected dynamically by header name)

### How to Obtain and Set the Eligibility Spreadsheet ID:
1. Open the Google Form response spreadsheet **`FY_2026 (Responses)`** in your web browser.
2. Inspect the browser address bar:
   ```
   https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
                                           └──────────────────┬──────────────────┘
                                                       SPREADSHEET ID
   ```
3. Copy the string between `/d/` and `/edit`.
4. You can configure this ID in either of two ways:
   - **Method A (Direct in Code)**: In `Code.gs`, paste the ID into `CONFIG.ELIGIBILITY_SPREADSHEET_ID`:
     ```javascript
     ELIGIBILITY_SPREADSHEET_ID: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
     ```
   - **Method B (Script Properties - Recommended for Security)**:
     - In Apps Script, click the **Gear Icon** (Project Settings) in the left sidebar.
     - Scroll down to **Script Properties** > Click **Add script property**.
     - Property: `ELIGIBILITY_SPREADSHEET_ID`
     - Value: `<YOUR_COPIED_SPREADSHEET_ID>`
     - Click **Save script properties**.

---

## Step 3: Run One-Click Initialization & Pre-Deployment Diagnostics

1. In the Apps Script toolbar, locate the function dropdown (next to "Debug").
2. Select **`setup`** and click **Run**.
3. **Authorization Dialog**:
   - Google will prompt: *"Authorization required"*.
   - Click **Review permissions** > Choose your Google Account > **Advanced** > **Go to PAC-Recruitment-2026-Backend (unsafe)** > **Allow**.
4. Once `setup()` finishes, run the diagnostic tools right inside the Apps Script editor:
   - **`testBookingDryRun`**: Verifies slot capacities, database structure, and duplicate checks.
   - **`testEligibilityVerification`**: Confirms that the script can reach `FY_2026 (Responses)`, find `Form responses 1`, and detect the `Email address` column.
   - **`testConfirmationEmailLayout`**: Dispatches a test confirmation email to your active account to preview formatting, exact times, and instructions.

---

## Step 4: Deploy as Web App from the PAC Club Gmail Account

> [!IMPORTANT]
> **Sending from the Club Account**:
> Google Apps Script sends emails under the identity of the account specified in the deployment's **"Execute as"** setting (`USER_DEPLOYING`).
> To ensure candidate confirmation emails are sent from the official PAC club Gmail account (`pacautomobileclub@gmail.com`):
> 1. Grant the PAC club Google account **Editor** permissions on both spreadsheets: the booking database sheet and the `FY_2026 (Responses)` sheet.
> 2. Log into the PAC club Google account in your browser.
> 3. Open the Apps Script editor while signed in as the club account.
> 4. Perform the deployment steps below.

### Deployment Instructions:
1. In the Apps Script editor, click the blue **Deploy** button at the top right and select **New deployment** (or **Manage deployments** > **Edit** > **New version** when updating).
2. Click the gear icon (**Select type**) and select **Web app**.
3. Configure the settings **exactly** as follows:
   - **Description**: `PAC Recruitment 2026 Live Web App with Form Eligibility & Club Email Confirmation`
   - **Execute as**: `Me (<your-club-account>@gmail.com)` *(Ensures script writes to sheets and sends emails from club account)*
   - **Who has access**: `Anyone` *(Allows applicants to submit without requiring a Google sign-in)*
4. Click **Deploy**.
5. When prompted for authorization, review and allow the permissions (including Google Sheets access and MailApp permissions).
6. Copy the generated **Web app URL** (`https://script.google.com/macros/s/AKfycbx.../exec`).

---

## Step 5: Connect Frontend to the Deployed Web App
 
In [`js/config.js`](../js/config.js) (and [`PAC-Public/js/config.js`](../PAC-Public/js/config.js)), ensure `GOOGLE_SCRIPT_URL` matches your active deployment URL:
```javascript
GOOGLE_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxcHY2SIQtMFChKw9pygNa4Lr7cVU7iFENuoTD1KjdU5yenc3qWqzzrGrvK0qrtLiGIVg/exec",
```

---

## Step 6: Verify the Complete Booking Flow (Test Checklist)

Run through these validation tests to verify that every requirement is satisfied:

| Test Case | Steps | Expected Result |
| :--- | :--- | :--- |
| **1. Unregistered Email Rejection** | Enter an unregistered email (e.g., `not.in.form@gmail.com`) and attempt booking. | Rejected with error: *"This email address is not registered as an eligible candidate."* No booking row added; slot remaining seats unaffected. |
| **2. Eligible Candidate Booking** | Enter an email registered in `Form responses 1` (e.g. `aarav.patel@college.edu`). | Booking confirmed with Reference ID (`PAC-2026-XXXX`). Bookings sheet updated. Remaining seats decrease by 1. |
| **3. Confirmation Email Dispatch** | Check candidate's inbox after successful booking. | Receives email with subject `PAC Recruitment – Interview Slot Confirmed` from the club account, containing exact date, time slot in Asia/Kolkata, arrive 10-15 min early instructions, and venue. |
| **4. Duplicate Email Prevention** | Attempt to re-submit with the same eligible email (in any casing, e.g. `AARAV.PATEL@COLLEGE.EDU`). | Server rejects booking with error: *"This email has already booked an interview slot."* No duplicate row added; no second email sent. |
| **5. Capacity Limit Enforcement** | Fill a slot to capacity in `Slots_Config`. | Slot disables immediately on frontend with `0 Seats Left (FULL)`. Server rejects overbooking attempts with `SLOT_FULL`. |
| **6. Email Failure Resilience** | If email delivery encounters quota or temporary network failure. | Booking remains safely recorded in Google Sheets; slot remains reserved; user pass is displayed; diagnostic error logged without leaking candidate data. |

## Technical Note: Cross-Origin Communication Reliability (CORS)

Google Apps Script Web Apps handle cross-origin HTTP traffic in a specific way that trips up standard `fetch` configurations:
1. **No OPTIONS preflight support**: Standard `fetch` with `headers: { 'Content-Type': 'application/json' }` causes browsers to send an HTTP `OPTIONS` preflight request. Google Apps Script returns a `405/CORS error` because it only handles `GET` and `POST`.
2. **Simple Request Strategy**: The frontend in `js/app.js` sends requests with `'Content-Type': 'text/plain;charset=utf-8'`. According to W3C Fetch specification, this is a "simple request", completely bypassing the CORS preflight check.
3. **Redirect Following**: Google Apps Script returns a `302 Found` redirecting to `script.googleusercontent.com`. `redirect: 'follow'` is explicitly enabled in `js/app.js`.
4. **Automatic GET Fallback**: If an applicant's browser environment blocks cross-origin POSTs (such as when opening the HTML file directly via `file:///` in certain secure browser profiles), `js/app.js` automatically retries the booking seamlessly via `GET ?action=bookSlot&...`. Both `doPost` and `doGet` execute identical server-side lock, duplicate checks, and capacity assertions.

## Free Hosting Options for the Frontend

Since the frontend is built purely with vanilla HTML, CSS, and JavaScript, it can be hosted 100% free with SSL:

1. **GitHub Pages (Fastest)**:
   - Create a free GitHub repository and push this directory.
   - Go to **Settings** > **Pages** > Select `main` branch / root > **Save**.
   - Your site will be live at `https://<username>.github.io/<repo-name>/`.
2. **Cloudflare Pages / Vercel / Netlify**:
   - Drag and drop the `Recruitment` folder directly into Netlify Drop or connect the GitHub repository.
3. **Local Testing**:
   - Open `index.html` directly in any web browser, or run a lightweight local server:
     ```powershell
     python -m http.server 8000
     # Or: npx serve
     ```
