# Daylight

Daylight is a local to-do list with a calendar, an in-app reminder screen, and scheduled browser push reminders.

## Run it

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000` (do not open `index.html` directly).

The first server start creates VAPID push keys and a subscription store in `data/`. Keep that folder private and backed up; it is ignored by Git.

## Set up reminders

- Open the bell icon beside the calendar.
- Add one or more reminder times (up to 8 per day).
- Choose **Enable notifications** and allow browser notifications.
- The reminder screen shows today’s unfinished tasks. Marking one Done removes it from reminders and leaves it completed in the main to-do list.

Reminder times use the browser’s current time zone. Keep the local Node server running and the computer awake and connected to send reminders while the app is closed. The app sends only a generic push message; task names stay in browser storage. Browser and operating-system settings can still delay or suppress notifications.

The server listens on `127.0.0.1` for local use. Public deployment needs HTTPS and authentication before exposing the API; this local server is not configured for public deployment.
