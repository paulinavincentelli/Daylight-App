import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import {
  createToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "./auth-utils.mjs";

const SESSION_COOKIE = "daylight_session";
const SESSION_DAYS = 7;
const authAttempts = new Map();
let dummyPasswordHash;
let resend;

function getResend() {
  if (!resend) {
    if (!process.env.RESEND_API_KEY) {
      throw requestError(503, "Email delivery is not configured on the server.");
    }
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJson(request, maxBytes = 16_384) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw requestError(413, "Request body is too large.");
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

async function readUrlEncoded(request, maxBytes = 16_384) {
  const contentType = request.headers["content-type"] || "";
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(contentType)) {
    throw requestError(415, "Google returned an invalid sign-in response.");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw requestError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function clientKey(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",").at(-1).trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function rateLimit(request, route, maximum, windowMs) {
  rateLimitKey(`${route}:${clientKey(request)}`, maximum, windowMs);
}

function rateLimitKey(key, maximum, windowMs) {
  const now = Date.now();
  const attempts = (authAttempts.get(key) || []).filter(
    (time) => now - time < windowMs
  );
  if (attempts.length >= maximum) {
    throw requestError(429, "Too many attempts. Please try again later.");
  }
  attempts.push(now);
  authAttempts.set(key, attempts);
  if (authAttempts.size > 10_000) {
    const oldestKey = authAttempts.keys().next().value;
    if (oldestKey) authAttempts.delete(oldestKey);
  }
}

function normalizeEmail(value) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  ) {
    throw requestError(400, "Enter a valid email address.");
  }
  return value.trim().toLowerCase();
}

function validPassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) {
    throw requestError(400, "Use a password between 12 and 128 characters.");
  }
  return value;
}

function readCookieValue(request, name) {
  const cookies = request.headers.cookie?.split(";") || [];
  const rawValue = cookies
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!rawValue) return "";
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return "";
  }
}

function readCookie(request, name) {
  const value = readCookieValue(request, name);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`
  );
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

async function createSession(pool, response, userId) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES($1, $2, $3)",
    [hashToken(token), userId, expiresAt]
  );
  setSessionCookie(response, token);
}

async function sendAccountEmail(to, purpose, token, origin) {
  const resendClient = getResend();
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const isVerification = purpose === "verify";
  const subject = isVerification
    ? "Verify your Daylight account"
    : "Reset your Daylight password";
  const url = `${origin}/#${isVerification ? "verify" : "reset"}=${token}`;
  const action = isVerification ? "Verify email" : "Reset password";
  console.info("Sending account email via Resend", { to, from, subject, purpose, url });
  try {
    const { data, error } = await resendClient.emails.send({
      from,
      to,
      subject,
      text: `${action}: ${url}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p><a href="${url}">${action}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
    if (error) {
      console.error("Resend API error", { to, from, purpose, error });
      throw requestError(503, "The email could not be sent. Please try again later.");
    }
    console.info("Account email sent via Resend", { messageId: data?.id });
  } catch (error) {
    if (error.status) throw error;
    console.error("Could not send account email.", { to, from, purpose, error: error.message, stack: error.stack });
    throw requestError(503, "The email could not be sent. Please try again later.");
  }
}

async function createEmailToken(pool, userId, purpose) {
  const token = createToken();
  const hours = purpose === "verify" ? 24 : 1;
  await pool.query(
    "DELETE FROM email_tokens WHERE user_id = $1 AND purpose = $2",
    [userId, purpose]
  );
  await pool.query(
    "INSERT INTO email_tokens(token_hash, user_id, purpose, expires_at) VALUES($1, $2, $3, NOW() + ($4 * INTERVAL '1 hour'))",
    [hashToken(token), userId, purpose, hours]
  );
  return token;
}

async function sendVerification(pool, user, origin) {
  const token = await createEmailToken(pool, user.id, "verify");
  await sendAccountEmail(user.email, "verify", token, origin);
}

async function sendPasswordReset(pool, user, origin) {
  const token = await createEmailToken(pool, user.id, "reset");
  await sendAccountEmail(user.email, "reset", token, origin);
}

async function attemptAccountEmail(send) {
  await send();
}

export async function resolveSessionUser(request, pool) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT users.id, users.email
       FROM sessions
       JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = $1
        AND sessions.expires_at > NOW()
        AND users.email_verified_at IS NOT NULL`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

async function findOrCreateGoogleUser(pool, claims) {
  if (
    !claims ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 255 ||
    claims.email_verified !== true
  ) {
    throw requestError(401, "Google could not verify this account.");
  }
  let email;
  try {
    email = normalizeEmail(claims.email);
  } catch {
    throw requestError(401, "Google could not verify this account.");
  }
  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");
    const lockKeys = [`email:${email}`, `google:${claims.sub}`].sort();
    for (const lockKey of lockKeys) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [lockKey]
      );
    }

    const linked = await client.query(
      "SELECT id, email FROM users WHERE google_sub = $1 FOR UPDATE",
      [claims.sub]
    );
    if (linked.rows[0]) {
      user = linked.rows[0];
      if (user.email !== email) {
        const owner = await client.query(
          "SELECT id FROM users WHERE email = $1 FOR UPDATE",
          [email]
        );
        if (owner.rows[0] && owner.rows[0].id !== user.id) {
          throw requestError(
            409,
            "This Google email is already used by another Daylight account."
          );
        }
        await client.query(
          "UPDATE users SET email = $1, email_verified_at = NOW() WHERE id = $2",
          [email, user.id]
        );
        user.email = email;
      } else {
        await client.query(
          "UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1",
          [user.id]
        );
      }
    } else {
      const existing = await client.query(
        "SELECT id, email, google_sub FROM users WHERE email = $1 FOR UPDATE",
        [email]
      );
      if (existing.rows[0]) {
        if (existing.rows[0].google_sub) {
          throw requestError(
            409,
            "This email is already connected to a different Google account."
          );
        }
        user = existing.rows[0];
        await client.query(
          `UPDATE users
              SET google_sub = $1, email_verified_at = NOW()
            WHERE id = $2`,
          [claims.sub, user.id]
        );
        await client.query(
          "DELETE FROM email_tokens WHERE user_id = $1 AND purpose = 'verify'",
          [user.id]
        );
      } else {
        const id = randomUUID();
        const inserted = await client.query(
          `INSERT INTO users(id, email, password_hash, google_sub, email_verified_at)
           VALUES($1, $2, NULL, $3, NOW())
           RETURNING id, email`,
          [id, email, claims.sub]
        );
        user = inserted.rows[0];
        await client.query(
          "INSERT INTO user_sync(user_id, revision) VALUES($1, 0)",
          [user.id]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction may already have been rolled back.
    }
    throw error;
  } finally {
    client.release();
  }
  return user;
}

function validateTaskList(value) {
  if (!Array.isArray(value) || value.length > 1000) {
    throw requestError(400, "Provide up to 1,000 tasks.");
  }
  const seen = new Set();
  return value.map((task) => {
    if (
      !task ||
      typeof task.id !== "string" ||
      !task.id.trim() ||
      task.id.length > 80 ||
      seen.has(task.id) ||
      typeof task.text !== "string" ||
      !task.text.trim() ||
      task.text.length > 160 ||
      typeof task.completed !== "boolean" ||
      !isValidDateKey(task.date)
    ) {
      throw requestError(400, "A task in the list is invalid.");
    }
    seen.add(task.id);
    return {
      id: task.id,
      text: task.text.trim(),
      completed: task.completed,
      date: task.date,
    };
  });
}

function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

async function getTasks(pool, userId) {
  await pool.query(
    "INSERT INTO user_sync(user_id, revision) VALUES($1, 0) ON CONFLICT(user_id) DO NOTHING",
    [userId]
  );
  const [taskResult, revisionResult] = await Promise.all([
    pool.query(
      `SELECT id, text, completed, due_date::text AS date
         FROM tasks
        WHERE user_id = $1
        ORDER BY due_date, id`,
      [userId]
    ),
    pool.query("SELECT revision FROM user_sync WHERE user_id = $1", [userId]),
  ]);
  return {
    tasks: taskResult.rows,
    revision: revisionResult.rows[0].revision,
  };
}

async function replaceTasks(pool, userId, body) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) {
    throw requestError(400, "A valid task sync revision is required.");
  }
  const tasks = validateTaskList(body.tasks);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO user_sync(user_id, revision) VALUES($1, 0) ON CONFLICT(user_id) DO NOTHING",
      [userId]
    );
    const current = await client.query(
      "SELECT revision FROM user_sync WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    if (current.rows[0].revision !== body.revision) {
      await client.query("ROLLBACK");
      throw requestError(
        409,
        "Your task list changed on another device. Reload the latest list before saving."
      );
    }
    await client.query("DELETE FROM tasks WHERE user_id = $1", [userId]);
    if (tasks.length) {
      await client.query(
        `INSERT INTO tasks(user_id, id, text, completed, due_date)
         SELECT $1, task.id, task.text, task.completed, task.date
           FROM jsonb_to_recordset($2::jsonb)
             AS task(id TEXT, text TEXT, completed BOOLEAN, date DATE)`,
        [userId, JSON.stringify(tasks)]
      );
    }
    const updated = await client.query(
      "UPDATE user_sync SET revision = revision + 1 WHERE user_id = $1 RETURNING revision",
      [userId]
    );
    await client.query("COMMIT");
    return updated.rows[0].revision;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The transaction may already have been rolled back.
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createAccountApi({
  pool,
  origin,
  sendJson,
  verifyGoogleCredential,
}) {
  async function getGoogleUser(credential) {
    if (!verifyGoogleCredential) {
      throw requestError(503, "Google sign-in is not configured.");
    }
    if (typeof credential !== "string" || !credential || credential.length > 8192) {
      throw requestError(400, "A valid Google credential is required.");
    }
    let claims;
    try {
      claims = await verifyGoogleCredential(credential);
    } catch (error) {
      console.warn("Google credential verification failed.", error.message);
      throw requestError(401, "Google sign-in could not be verified. Please try again.");
    }
    return findOrCreateGoogleUser(pool, claims);
  }

  async function requireUser(request) {
    const user = await resolveSessionUser(request, pool);
    if (!user) throw requestError(401, "Please sign in to continue.");
    return user;
  }

  async function handle(request, response, pathname) {
    if (pathname === "/api/auth/me" && request.method === "GET") {
      const user = await resolveSessionUser(request, pool);
      sendJson(response, 200, { authRequired: true, user });
      return true;
    }

    if (pathname === "/api/auth/google" && request.method === "POST") {
      rateLimit(request, "google-login", 10, 15 * 60 * 1000);
      const body = await readJson(request);
      const user = await getGoogleUser(body.credential);
      await createSession(pool, response, user.id);
      sendJson(response, 200, { user: { id: user.id, email: user.email } });
      return true;
    }

    if (pathname === "/api/auth/google/redirect" && request.method === "POST") {
      rateLimit(request, "google-login", 10, 15 * 60 * 1000);
      const fields = await readUrlEncoded(request);
      const csrfCookie = readCookieValue(request, "g_csrf_token");
      const csrfValues = fields.getAll("g_csrf_token");
      const credentials = fields.getAll("credential");
      if (
        !csrfCookie ||
        csrfCookie.length > 256 ||
        csrfValues.length !== 1 ||
        csrfValues[0] !== csrfCookie ||
        credentials.length !== 1
      ) {
        throw requestError(400, "Google sign-in could not be verified. Please try again.");
      }
      const user = await getGoogleUser(credentials[0]);
      await createSession(pool, response, user.id);
      response.writeHead(303, {
        Location: origin,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      response.end();
      return true;
    }

    if (pathname === "/api/auth/register" && request.method === "POST") {
      rateLimit(request, "register", 5, 60 * 60 * 1000);
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      rateLimitKey(`register-email:${email}`, 5, 60 * 60 * 1000);
      const password = validPassword(body.password);
      const passwordHash = await hashPassword(password);
      const id = randomUUID();
      let user;
      try {
        const inserted = await pool.query(
          "INSERT INTO users(id, email, password_hash) VALUES($1, $2, $3) RETURNING id, email",
          [id, email, passwordHash]
        );
        user = inserted.rows[0];
        await pool.query(
          "INSERT INTO user_sync(user_id, revision) VALUES($1, 0)",
          [id]
        );
      } catch (error) {
        if (error.code !== "23505") throw error;
        const existing = await pool.query(
          "SELECT id, email, email_verified_at FROM users WHERE email = $1",
          [email]
        );
        user = existing.rows[0];
      }
      if (user && !user.email_verified_at) {
        await attemptAccountEmail(() => sendVerification(pool, user, origin));
      }
      sendJson(response, 202, {
        message: "If this address can be registered, a verification link has been sent.",
      });
      return true;
    }

    if (pathname === "/api/auth/resend-verification" && request.method === "POST") {
      rateLimit(request, "resend", 5, 60 * 60 * 1000);
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      rateLimitKey(`resend-email:${email}`, 3, 60 * 60 * 1000);
      const { rows } = await pool.query(
        "SELECT id, email, email_verified_at FROM users WHERE email = $1",
        [email]
      );
      const user = rows[0];
      if (user && !user.email_verified_at) {
        await attemptAccountEmail(() => sendVerification(pool, user, origin));
      }
      sendJson(response, 200, {
        message: "If the account needs verification, a new link has been sent.",
      });
      return true;
    }

    if (pathname === "/api/auth/verify-email" && request.method === "POST") {
      rateLimit(request, "verify", 20, 15 * 60 * 1000);
      const body = await readJson(request);
      if (typeof body.token !== "string" || body.token.length > 128) {
        throw requestError(400, "The verification link is invalid or expired.");
      }
      const client = await pool.connect();
      let user;
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT users.id, users.email
             FROM email_tokens
             JOIN users ON users.id = email_tokens.user_id
            WHERE email_tokens.token_hash = $1
              AND email_tokens.purpose = 'verify'
              AND email_tokens.expires_at > NOW()
            FOR UPDATE`,
          [hashToken(body.token)]
        );
        user = result.rows[0];
        if (!user) {
          await client.query("ROLLBACK");
          throw requestError(400, "The verification link is invalid or expired.");
        }
        await client.query(
          "UPDATE users SET email_verified_at = NOW() WHERE id = $1",
          [user.id]
        );
        await client.query(
          "DELETE FROM email_tokens WHERE user_id = $1 AND purpose = 'verify'",
          [user.id]
        );
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The transaction may already have been rolled back.
        }
        throw error;
      } finally {
        client.release();
      }
      await createSession(pool, response, user.id);
      sendJson(response, 200, { user });
      return true;
    }

    if (pathname === "/api/auth/login" && request.method === "POST") {
      rateLimit(request, "login", 10, 15 * 60 * 1000);
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      rateLimitKey(`login-email:${email}`, 10, 15 * 60 * 1000);
      if (typeof body.password !== "string" || body.password.length > 128) {
        throw requestError(400, "Email or password is incorrect.");
      }
      const { rows } = await pool.query(
        "SELECT id, email, password_hash, email_verified_at FROM users WHERE email = $1",
        [email]
      );
      if (!dummyPasswordHash) {
        dummyPasswordHash = await hashPassword("invalid-login-timing-value");
      }
      const user = rows[0];
      const matches = await verifyPassword(
        body.password,
        user?.password_hash || dummyPasswordHash
      );
      if (!user || !matches) {
        throw requestError(401, "Email or password is incorrect.");
      }
      if (!user.email_verified_at) {
        throw requestError(
          403,
          "Verify your email before signing in. You can resend the verification link."
        );
      }
      await createSession(pool, response, user.id);
      sendJson(response, 200, {
        user: { id: user.id, email: user.email },
      });
      return true;
    }

    if (pathname === "/api/auth/forgot-password" && request.method === "POST") {
      rateLimit(request, "forgot", 5, 60 * 60 * 1000);
      const body = await readJson(request);
      const email = normalizeEmail(body.email);
      rateLimitKey(`forgot-email:${email}`, 3, 60 * 60 * 1000);
      const { rows } = await pool.query(
        "SELECT id, email FROM users WHERE email = $1 AND email_verified_at IS NOT NULL",
        [email]
      );
      if (rows[0]) {
        await attemptAccountEmail(() =>
          sendPasswordReset(pool, rows[0], origin)
        );
      }
      sendJson(response, 200, {
        message: "If an account exists for that address, a password reset link has been sent.",
      });
      return true;
    }

    if (pathname === "/api/auth/reset-password" && request.method === "POST") {
      rateLimit(request, "reset", 10, 15 * 60 * 1000);
      const body = await readJson(request);
      if (typeof body.token !== "string" || body.token.length > 128) {
        throw requestError(400, "The password reset link is invalid or expired.");
      }
      const password = validPassword(body.password);
      const tokenHash = hashToken(body.token);
      const available = await pool.query(
        `SELECT 1
           FROM email_tokens
           JOIN users ON users.id = email_tokens.user_id
          WHERE email_tokens.token_hash = $1
            AND email_tokens.purpose = 'reset'
            AND email_tokens.expires_at > NOW()
            AND users.email_verified_at IS NOT NULL`,
        [tokenHash]
      );
      if (!available.rowCount) {
        throw requestError(400, "The password reset link is invalid or expired.");
      }
      const passwordHash = await hashPassword(password);
      const client = await pool.connect();
      let user;
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT users.id, users.email
             FROM email_tokens
             JOIN users ON users.id = email_tokens.user_id
            WHERE email_tokens.token_hash = $1
              AND email_tokens.purpose = 'reset'
              AND email_tokens.expires_at > NOW()
              AND users.email_verified_at IS NOT NULL
            FOR UPDATE`,
          [tokenHash]
        );
        user = result.rows[0];
        if (!user) {
          await client.query("ROLLBACK");
          throw requestError(400, "The password reset link is invalid or expired.");
        }
        await client.query(
          "UPDATE users SET password_hash = $1 WHERE id = $2",
          [passwordHash, user.id]
        );
        await client.query(
          "DELETE FROM email_tokens WHERE user_id = $1",
          [user.id]
        );
        await client.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The transaction may already have been rolled back.
        }
        throw error;
      } finally {
        client.release();
      }
      await createSession(pool, response, user.id);
      sendJson(response, 200, { user });
      return true;
    }

    if (pathname === "/api/auth/logout" && request.method === "POST") {
      const token = readCookie(request, SESSION_COOKIE);
      if (token) {
        await pool.query("DELETE FROM sessions WHERE token_hash = $1", [
          hashToken(token),
        ]);
      }
      clearSessionCookie(response);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (pathname === "/api/tasks" && request.method === "GET") {
      const user = await requireUser(request);
      sendJson(response, 200, await getTasks(pool, user.id));
      return true;
    }

    if (pathname === "/api/tasks" && request.method === "PUT") {
      const user = await requireUser(request);
      const body = await readJson(request, 512 * 1024);
      const revision = await replaceTasks(pool, user.id, body);
      sendJson(response, 200, { revision });
      return true;
    }

    return false;
  }

  return { handle, requireUser };
}
