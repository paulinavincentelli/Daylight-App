import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import webPush from "web-push";

const root = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(root, "data");
const vapidPath = join(dataDirectory, "vapid-keys.json");
const subscriptionsPath = join(dataDirectory, "subscriptions.json");
const port = Number(process.env.PORT || 3000);
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/crystal-ball.js", ["crystal-ball.js", "text/javascript; charset=utf-8"]],
  ["/sw.js", ["sw.js", "text/javascript; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json"]],
  ["/icon.svg", ["icon.svg", "image/svg+xml"]],
]);

let vapidKeys;
let subscriptions = new Map();
let schedulerRunning = false;
let subscriptionWrites = Promise.resolve();

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32_768) {
      throw requestError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw requestError(400, "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw requestError(400, "JSON body must be an object.");
  }
  return body;
}

function validTimes(value) {
  if (
    !Array.isArray(value) ||
    value.length > 8 ||
    !value.every((time) => typeof time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
  ) {
    throw requestError(400, "Provide up to 8 valid reminder times.");
  }
  return [...new Set(value)].sort();
}

function validTimezone(value) {
  if (typeof value !== "string" || value.length > 80) {
    throw requestError(400, "Provide a valid time zone.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
  } catch {
    throw requestError(400, "Provide a valid time zone.");
  }
  return value;
}

function validDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw requestError(400, "Provide a valid task date.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw requestError(400, "Provide a valid task date.");
  }
  return value;
}

function validHasTasks(value) {
  if (typeof value !== "boolean") {
    throw requestError(400, "Provide whether today has unfinished tasks.");
  }
  return value;
}

function validEndpoint(value) {
  if (typeof value !== "string") {
    throw requestError(400, "A push subscription endpoint is required.");
  }
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw requestError(400, "The push subscription endpoint is invalid.");
  }
  if (endpoint.protocol !== "https:") {
    throw requestError(400, "The push subscription endpoint must use HTTPS.");
  }
  return value;
}

function validSubscription(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !value.keys ||
    typeof value.keys.p256dh !== "string" ||
    typeof value.keys.auth !== "string"
  ) {
    throw requestError(400, "The browser push subscription is invalid.");
  }
  return {
    endpoint: validEndpoint(value.endpoint),
    expirationTime: value.expirationTime ?? null,
    keys: {
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
    },
  };
}

function localClock(timezone, instant) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

async function writeJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temporary, file);
}

async function loadVapidKeys() {
  try {
    const saved = JSON.parse(await readFile(vapidPath, "utf8"));
    if (typeof saved.publicKey !== "string" || typeof saved.privateKey !== "string") {
      throw new Error("Saved VAPID keys are invalid.");
    }
    return saved;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const generated = webPush.generateVAPIDKeys();
    await writeJson(vapidPath, generated);
    return generated;
  }
}

async function loadSubscriptions() {
  try {
    const saved = JSON.parse(await readFile(subscriptionsPath, "utf8"));
    if (!Array.isArray(saved)) throw new Error("Saved subscriptions must be an array.");
    return new Map(
      saved.map((record) => {
        const subscription = validSubscription(record.subscription);
        return [
          subscription.endpoint,
          {
            subscription,
            times: validTimes(record.times),
            timezone: validTimezone(record.timezone),
            hasTasks: record.hasTasks === true,
            tasksDate: typeof record.tasksDate === "string" ? record.tasksDate : "",
            sentDate: typeof record.sentDate === "string" ? record.sentDate : "",
            sentTimes: Array.isArray(record.sentTimes) ? record.sentTimes : [],
          },
        ];
      })
    );
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

function saveSubscriptions() {
  const savedRecords = [...subscriptions.values()].map((record) => record);
  const write = () => writeJson(subscriptionsPath, savedRecords);
  subscriptionWrites = subscriptionWrites.then(write, write);
  return subscriptionWrites;
}

async function runScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  let changed = false;
  const now = new Date();

  try {
    for (const [endpoint, record] of subscriptions) {
      const { date, time } = localClock(record.timezone, now);
      if (record.sentDate !== date) {
        record.sentDate = date;
        record.sentTimes = [];
        changed = true;
      }
      if (
        !record.hasTasks ||
        record.tasksDate !== date ||
        !record.times.includes(time) ||
        record.sentTimes.includes(time)
      ) {
        continue;
      }

      record.sentTimes.push(time);
      changed = true;
      try {
        await webPush.sendNotification(
          record.subscription,
          JSON.stringify({
            title: "Daylight reminder",
            body: "Your unfinished tasks are ready.",
            tag: `daylight-${date}-${time}`,
            url: "/?screen=reminders",
          })
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          subscriptions.delete(endpoint);
          console.info("Removed an expired push subscription.");
        } else {
          console.error("Could not deliver a scheduled reminder.", error);
        }
      }
    }
    if (changed) await saveSubscriptions();
  } finally {
    schedulerRunning = false;
  }
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/config" && request.method === "GET") {
    sendJson(response, 200, { publicKey: vapidKeys.publicKey });
    return;
  }

  if (pathname === "/api/subscribe" && request.method === "POST") {
    const body = await readJson(request);
    const subscription = validSubscription(body.subscription);
    const previous = subscriptions.get(subscription.endpoint);
    subscriptions.set(subscription.endpoint, {
      subscription,
      times: validTimes(body.times),
      timezone: validTimezone(body.timezone),
      hasTasks: validHasTasks(body.hasTasks),
      tasksDate: validDateKey(body.tasksDate),
      sentDate: previous?.sentDate ?? "",
      sentTimes: previous?.sentTimes ?? [],
    });
    await saveSubscriptions();
    sendJson(response, 201, { ok: true });
    return;
  }

  if (pathname === "/api/schedule" && request.method === "PUT") {
    const body = await readJson(request);
    const endpoint = validEndpoint(body.endpoint);
    const record = subscriptions.get(endpoint);
    if (!record) throw requestError(404, "Push subscription was not found.");
    record.times = validTimes(body.times);
    record.timezone = validTimezone(body.timezone);
    record.hasTasks = validHasTasks(body.hasTasks);
    record.tasksDate = validDateKey(body.tasksDate);
    await saveSubscriptions();
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/subscribe" && request.method === "DELETE") {
    const body = await readJson(request);
    const endpoint = validEndpoint(body.endpoint);
    subscriptions.delete(endpoint);
    await saveSubscriptions();
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function serve(request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  if (requestUrl.pathname.startsWith("/api/")) {
    const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);
    if (!allowedHosts.has(request.headers.host)) {
      sendJson(response, 403, { error: "This local service only accepts localhost requests." });
      return;
    }
    const allowedOrigins = new Set([
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
    ]);
    if (
      request.method !== "GET" &&
      !allowedOrigins.has(request.headers.origin)
    ) {
      sendJson(response, 403, { error: "Request origin is not allowed." });
      return;
    }
    await handleApi(request, response, requestUrl.pathname);
    return;
  }

  const file = files.get(requestUrl.pathname);
  if (!file || request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const [filename, contentType] = file;
  const content = await readFile(join(root, filename));
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": filename === "sw.js" ? "no-cache" : "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  });
  response.end(request.method === "HEAD" ? undefined : content);
}

async function start() {
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  vapidKeys = await loadVapidKeys();
  subscriptions = await loadSubscriptions();
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notifications@example.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const server = createServer((request, response) => {
    serve(request, response).catch((error) => {
      console.error("Request failed.", error);
      if (!response.headersSent) {
        sendJson(response, error.status || 500, {
          error: error.status ? error.message : "The server could not complete the request.",
        });
      } else {
        response.destroy();
      }
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Daylight is available at http://localhost:${port}`);
  });
  const schedulerTick = () => {
    runScheduler().catch((error) => {
      console.error("Reminder scheduler failed.", error);
    });
  };
  setInterval(schedulerTick, 15_000);
  schedulerTick();
}

start().catch((error) => {
  console.error("Could not start the Daylight server.", error);
  process.exitCode = 1;
});
