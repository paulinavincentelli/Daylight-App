# Daylight

Daylight is a responsive, installable task app with a calendar, scheduled browser reminders, and an AI task assistant.

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` (do not open `index.html` directly).

Without `DATABASE_URL`, the server runs in local-only mode: tasks stay in that browser's local storage, and reminders use files under the ignored `data/` directory. This mode is for local development only and is not suitable for public access.

For local AI chat and voice transcription, set `GEMINI_API_KEY` in the same terminal before starting the server. On macOS with zsh, enter `read -s "GEMINI_API_KEY?Gemini API key: "`, paste the key at the hidden prompt, press Return, then enter `export GEMINI_API_KEY` and `npm start`. Google sign-in and sign-out require `DATABASE_URL` and `GOOGLE_CLIENT_ID`; without account storage, the account controls are hidden.

## Prepare a Render deployment

The root `render.yaml` defines an always-on Node web service and a Render Postgres database in the same region. It deliberately selects paid plans so the reminder scheduler stays online and account data is stored in managed Postgres. Check Render's current [pricing](https://render.com/pricing) before applying the Blueprint. Automatic deploys are disabled until enabled in Render.

1. Push this project to a GitHub repository and create a Render **Blueprint** from it. Review the web and database plans and estimated charges before confirming.
2. In the Render service's environment settings, add the following values:
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` for an SMTP provider that is authorized to send from your address/domain. The Blueprint defaults to port `587` without implicit TLS; change `SMTP_PORT` and `SMTP_SECURE` if your provider requires different settings.
   - `VAPID_SUBJECT` as a valid contact URI, for example `mailto:you@example.com`.
   - `GEMINI_API_KEY` if you want AI chat. Keep it in Render only; do not put it in browser code.
   - `GOOGLE_CLIENT_ID` to enable Google sign-in. Create a Google OAuth client for a web application. In Google Auth Platform, add `https://daylight-app-gxqd.onrender.com` as an authorized JavaScript origin and `https://daylight-app-gxqd.onrender.com/api/auth/google/redirect` as an authorized redirect URI. Confirm the app's domain is allowed in the OAuth consent settings. If using a custom domain, use its exact HTTPS origin and redirect URI instead. The client ID is public; no client secret is needed. iOS and standalone PWAs use a full-page redirect; other browsers use popup UX.
   - `APP_ORIGIN` is optional when using Render's generated `RENDER_EXTERNAL_URL`; set it to the exact `https://` origin if you add a custom domain.
3. Apply the Blueprint and open the resulting HTTPS URL. Create an account and follow the verification email. Password recovery also uses the configured SMTP provider.
4. Install Daylight from the browser's **Install app** or **Add to Home Screen** option on desktop or mobile.

The service starts only in production when `DATABASE_URL` is present. Database tables are initialized idempotently at startup. Email/password credentials use scrypt hashes, Google accounts use verified ID tokens, verification/reset tokens are stored hashed and expire, and sessions use HTTP-only, secure production cookies. Tasks and reminder schedules are user-scoped. Task sync uses a revision check; if another device changes the list at the same time, Daylight pauses sync instead of overwriting the newer account list.

Google sign-in requires a verified Google email. A first-time Google user gets a Daylight account; a verified Google email that matches an existing Daylight account links to it.

On first sign-in, if the account has no tasks, Daylight offers to import tasks saved in that browser. Local-only tasks remain on their original device until imported. If task changes could not sync, Daylight keeps a device backup and asks whether to restore it or keep the account list.

Open signup shares the server's Gemini quota. The app limits AI use to 6 requests per account per minute, 12 requests per server per minute, and 200 requests per server per day; Gemini's own quotas and availability still apply. Free-tier prompts may be used by Google to improve its products and reviewed by people. Avoid sensitive task information and check Google's current [API terms](https://ai.google.dev/gemini-api/docs/terms) and [pricing](https://ai.google.dev/gemini-api/docs/pricing).

## Notifications and reminders

- Open the bell icon beside the calendar to view today's task notifications. The gear icon opens reminder settings separately.
- Add up to 8 reminder times and enable browser notifications.
- Reminder times are stored per account/device. Notifications contain no task names.
- Keep the Render service running for scheduled notifications. Browser and operating-system settings can delay or suppress them.

## AI assistant

The assistant can add, edit, complete, or schedule tasks when requested, and validated changes are applied automatically. It cannot delete tasks or change reminder settings. Review your request before sending. Chat content and up to 100 of the signed-in user's tasks (prioritizing the selected date) are sent to Gemini when you press Send.

Microphone dictation records up to 60 seconds in the browser and sends the recording to Gemini for transcription when you stop. Review the transcript before sending it. This uses the server's `GEMINI_API_KEY` and counts against its AI request quota.

Run the focused account and password tests with `npm test`.
