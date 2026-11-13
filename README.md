# Daylight

Daylight is a local to-do list with a calendar, an in-app reminder screen, and scheduled browser push reminders.

## Run it

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` (do not open `index.html` directly).

The first server start creates VAPID push keys and a subscription store in `data/`. Keep that folder private and backed up; it is ignored by Git.

## Set up reminders

- Open the bell icon beside the calendar to view today’s reminders, or use the gear icon beside it to jump to notification settings.
- Add one or more reminder times (up to 8 per day).
- Choose **Enable notifications** and allow browser notifications.
- The reminder screen shows today’s unfinished tasks. Marking one Done removes it from reminders and leaves it completed in the main to-do list.

Reminder times use the browser’s current time zone. Keep the local Node server running and the computer awake and connected to send reminders while the app is closed. The app sends only a generic push message; task names stay in browser storage. Browser and operating-system settings can still delay or suppress notifications.

The server listens on `127.0.0.1` for local use. Public deployment needs HTTPS and authentication before exposing the API; this local server is not configured for public deployment.

## Set up Gemini AI chat

- Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY` in the server process environment before running `npm start`. The server uses `gemini-3.5-flash-lite`. Keep the key on the server; never add it to browser code or commit it.
- The task assistant uses a low thinking level for faster replies, allows up to 45 seconds for a response, and retries a temporary Gemini 503 once.
- The free tier has model-specific quotas and availability that can change; check [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing). Google’s [Gemini API terms](https://ai.google.dev/gemini-api/docs/terms) state that unpaid prompts and responses may be used to improve Google products and reviewed by people. Do not send personal, sensitive, or confidential details.
- Chat messages, recent chat history, the current task list, and selected date/time-zone context are sent to Gemini to generate responses. The assistant can propose adding, editing, completing, or scheduling tasks. Each proposal must be approved individually before it changes the list. It cannot delete tasks or change reminder settings.
- Microphone dictation uses your browser’s speech-recognition service when supported. That service may process voice input; review the transcript before sending it. The transcript is sent to Gemini only when you press Send.
- Google’s Gemini API terms describe the service as intended for professional or business developer use, not consumer use. Check that your intended use is eligible, especially before sharing the app with others.
