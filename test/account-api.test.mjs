import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { createAccountApi } from "../account-api.mjs";
import { hashPassword, verifyPassword } from "../auth-utils.mjs";

class MemoryPool {
  constructor(users) {
    this.users = users;
    this.sessions = new Map();
    this.tasks = new Map();
    this.revisions = new Map();
  }

  async query(sql, values = []) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("select users.id, users.email")) {
      const session = this.sessions.get(values[0]);
      const user = this.users.find(({ id }) => id === session?.userId);
      return {
        rows:
          session && session.expiresAt > new Date() && user?.email_verified_at
            ? [{ id: user.id, email: user.email }]
            : [],
      };
    }
    if (query.startsWith("insert into sessions")) {
      this.sessions.set(values[0], {
        userId: values[1],
        expiresAt: new Date(values[2]),
      });
      return { rows: [] };
    }
    if (query.startsWith("insert into user_sync")) {
      if (!this.revisions.has(values[0])) this.revisions.set(values[0], 0);
      return { rows: [] };
    }
    if (query.startsWith("select id, text, completed, due_date::text as date")) {
      return {
        rows: this.tasks.get(values[0]) || [],
      };
    }
    if (query.startsWith("select revision from user_sync")) {
      return { rows: [{ revision: this.revisions.get(values[0]) || 0 }] };
    }
    throw new Error(`Unexpected query: ${query}`);
  }

  async connect() {
    return {
      query: async (sql, values = []) => {
        const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
        if (["begin", "commit", "rollback"].includes(query)) {
          return { rows: [] };
        }
        if (query.startsWith("select pg_advisory_xact_lock")) {
          return { rows: [] };
        }
        if (query.startsWith("select id, email from users where google_sub")) {
          return {
            rows: this.users
              .filter((user) => user.google_sub === values[0])
              .map(({ id, email }) => ({ id, email })),
          };
        }
        if (query.startsWith("select id, email from users where facebook_id")) {
          return {
            rows: this.users
              .filter((user) => user.facebook_id === values[0])
              .map(({ id, email }) => ({ id, email })),
          };
        }
        if (query.startsWith("select id from users where email")) {
          return {
            rows: this.users
              .filter((user) => user.email === values[0])
              .map(({ id }) => ({ id })),
          };
        }
        if (query.startsWith("select id, email, google_sub from users")) {
          return {
            rows: this.users
              .filter((user) => user.email === values[0])
              .map(({ id, email, google_sub }) => ({ id, email, google_sub })),
          };
        }
        if (query.startsWith("update users set email =")) {
          const user = this.users.find(({ id }) => id === values[1]);
          user.email = values[0];
          user.email_verified_at = new Date();
          return { rows: [] };
        }
        if (query.startsWith("update users set email_verified_at")) {
          const user = this.users.find(({ id }) => id === values[0]);
          user.email_verified_at ||= new Date();
          return { rows: [] };
        }
        if (query.startsWith("update users set google_sub")) {
          const user = this.users.find(({ id }) => id === values[1]);
          user.google_sub = values[0];
          user.email_verified_at = new Date();
          return { rows: [] };
        }
        if (query.startsWith("select id, email, facebook_id from users")) {
          return {
            rows: this.users
              .filter((user) => user.email === values[0])
              .map(({ id, email, facebook_id }) => ({ id, email, facebook_id })),
          };
        }
        if (query.startsWith("update users set facebook_id")) {
          const user = this.users.find(({ id }) => id === values[1]);
          user.facebook_id = values[0];
          user.email_verified_at = new Date();
          return { rows: [] };
        }
        if (query.startsWith("insert into users")) {
          // Handle Google (3 values: id, email, google_sub), Facebook (3 values: id, email, facebook_id), or legacy (4 values)
          if (values.length === 4) {
            // Legacy: id, email, google_sub, facebook_id
            const user = {
              id: values[0],
              email: values[1],
              google_sub: values[2] || null,
              facebook_id: values[3] || null,
              email_verified_at: new Date(),
            };
            this.users.push(user);
            return { rows: [{ id: user.id, email: user.email }] };
          } else if (values.length === 3) {
            // Check the original SQL to determine if it's Google or Facebook insert
            const isGoogleInsert = sql.toLowerCase().includes("google_sub");
            const isFacebookInsert = sql.toLowerCase().includes("facebook_id");
            const thirdValue = values[2];
            if (isGoogleInsert) {
              const user = {
                id: values[0],
                email: values[1],
                google_sub: thirdValue,
                facebook_id: null,
                email_verified_at: new Date(),
              };
              this.users.push(user);
              return { rows: [{ id: user.id, email: user.email }] };
            } else if (isFacebookInsert) {
              const user = {
                id: values[0],
                email: values[1],
                google_sub: null,
                facebook_id: thirdValue,
                email_verified_at: new Date(),
              };
              this.users.push(user);
              return { rows: [{ id: user.id, email: user.email }] };
            }
            // Fallback: assume Google
            const user = {
              id: values[0],
              email: values[1],
              google_sub: thirdValue,
              facebook_id: null,
              email_verified_at: new Date(),
            };
            this.users.push(user);
            return { rows: [{ id: user.id, email: user.email }] };
          }
        }
        if (query.startsWith("insert into user_sync")) {
          if (!this.revisions.has(values[0])) this.revisions.set(values[0], 0);
          return { rows: [] };
        }
        if (query.startsWith("select revision from user_sync")) {
          return {
            rows: [{ revision: this.revisions.get(values[0]) || 0 }],
          };
        }
        if (query.startsWith("delete from tasks")) {
          this.tasks.delete(values[0]);
          return { rows: [] };
        }
        if (query.startsWith("insert into tasks")) {
          const tasks = JSON.parse(values[1]).map((task) => ({
            ...task,
          }));
          this.tasks.set(values[0], tasks);
          return { rows: [] };
        }
        if (query.startsWith("update user_sync")) {
          const revision = (this.revisions.get(values[0]) || 0) + 1;
          this.revisions.set(values[0], revision);
          return { rows: [{ revision }] };
        }
        throw new Error(`Unexpected transaction query: ${query}`);
      },
      release() {},
    };
  }
}

class MemoryResponse {
  headers = {};
  bodyChunks = [];

  setHeader(name, value) {
    this.headers[name] = value;
  }

  writeHead(status, headers) {
    this.status = status;
    Object.assign(this.headers, headers);
  }

  write(chunk) {
    this.bodyChunks.push(chunk);
  }

  end(chunk) {
    if (chunk) this.bodyChunks.push(chunk);
    this.ended = true;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.write(Buffer.from(JSON.stringify(value)));
  response.end();
}

async function request(api, method, pathname, body, cookie) {
  const incoming = {
    method,
    url: pathname,
    headers: { cookie: cookie || "" },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(JSON.stringify(body));
    },
  };
  const response = new MemoryResponse();
  const handled = await api.handle(incoming, response, pathname);
  if (!handled) throw new Error(`Unhandled: ${method} ${pathname}`);
  let bodyData = "{}";
  if (response.bodyChunks && response.bodyChunks.length > 0) {
    bodyData = Buffer.concat(response.bodyChunks).toString();
  }
  return {
    status: response.status,
    headers: response.headers,
    body: bodyData ? JSON.parse(bodyData) : {},
  };
}

test("task lists are account-scoped and stale revisions cannot overwrite", async () => {
  const pool = new MemoryPool([
    { id: "user-a", email: "a@example.com", google_sub: "google-a", email_verified_at: new Date() },
    { id: "user-b", email: "b@example.com", google_sub: "google-b", email_verified_at: new Date() },
  ]);
  const api = createAccountApi({
    pool,
    origin: "https://daylight.example",
    sendJson,
    verifyGoogleCredential: async (credential) => {
      if (credential === "google-a") {
        return { sub: "google-a", email: "a@example.com", email_verified: true };
      }
      if (credential === "google-b") {
        return { sub: "google-b", email: "b@example.com", email_verified: true };
      }
      throw new Error("Invalid credential");
    },
    verifyFacebookCredential: async () => { throw new Error("Not implemented"); },
  });

  const googleLoginA = await request(api, "POST", "/api/auth/google", {
    credential: "google-a",
  });
  const googleLoginB = await request(api, "POST", "/api/auth/google", {
    credential: "google-b",
  });
  const cookieA = googleLoginA.headers["Set-Cookie"].split(";")[0];
  const cookieB = googleLoginB.headers["Set-Cookie"].split(";")[0];
  const taskList = Array.from({ length: 100 }, (_, index) => ({
    id: `task-${index}`,
    text: index === 0 ? "Private task" : "x".repeat(160),
    completed: false,
    date: "2026-03-10",
  }));

  const saved = await request(
    api,
    "PUT",
    "/api/tasks",
    {
      revision: 0,
      tasks: taskList,
    },
    cookieA
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 1);

  const otherAccount = await request(api, "GET", "/api/tasks", undefined, cookieB);
  assert.equal(otherAccount.status, 200);
  assert.deepEqual(otherAccount.body.tasks, []);

  await assert.rejects(
    request(
      api,
      "PUT",
      "/api/tasks",
      { revision: 0, tasks: [] },
      cookieA
    ),
    { status: 409 }
  );
  const accountA = await request(api, "GET", "/api/tasks", undefined, cookieA);
  assert.equal(accountA.status, 200);
  assert.equal(accountA.body.tasks.length, 100);
  assert.deepEqual(accountA.body.tasks[0], {
    id: "task-0",
    text: "Private task",
    completed: false,
    date: "2026-03-10",
  });
});

test("Google sign-in creates a verified account and links by verified email", async () => {
  const existingUser = {
    id: "existing-user",
    email: "existing@example.com",
    google_sub: null,
    facebook_id: null,
    email_verified_at: null,
  };
  const pool = new MemoryPool([existingUser]);
  const api = createAccountApi({
    pool,
    origin: "https://daylight.example",
    sendJson,
    verifyGoogleCredential: async (credential) => {
      if (credential === "existing") {
        return {
          sub: "google-existing",
          email: "EXISTING@example.com",
          email_verified: true,
        };
      }
      if (credential === "new") {
        return {
          sub: "google-new",
          email: "new@example.com",
          email_verified: true,
        };
      }
      throw new Error("Invalid credential");
    },
    verifyFacebookCredential: async () => { throw new Error("Not implemented"); },
  });

  const linked = await request(api, "POST", "/api/auth/google", {
    credential: "existing",
  });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.user.email, "existing@example.com");
  assert.equal(pool.users[0].google_sub, "google-existing");
  assert.ok(pool.users[0].email_verified_at);

  const created = await request(api, "POST", "/api/auth/google", {
    credential: "new",
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.user.email, "new@example.com");
  assert.equal(pool.users[1].google_sub, "google-new");
  assert.ok(pool.users[1].email_verified_at);

  await assert.rejects(
    request(api, "POST", "/api/auth/google", { credential: "unverified" }),
    { status: 401 }
  );
});

test("Google redirect sign-in verifies GIS CSRF tokens and creates a session", async () => {
  const pool = new MemoryPool([]);
  const api = createAccountApi({
    pool,
    origin: "https://daylight.example",
    sendJson,
    verifyGoogleCredential: async (credential) => {
      if (credential === "valid-credential") {
        return {
          sub: "google-redirect-user",
          email: "redirect@example.com",
          email_verified: true,
        };
      }
      throw new Error("Invalid credential");
    },
    verifyFacebookCredential: async () => { throw new Error("Not implemented"); },
  });

  const formData = new URLSearchParams({
    g_csrf_token: "csrf123",
    credential: "valid-credential",
  });
  const incoming = {
    method: "POST",
    url: "/api/auth/google/redirect",
    headers: { 
      cookie: "g_csrf_token=csrf123",
      "content-type": "application/x-www-form-urlencoded",
    },
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(formData.toString());
    },
  };
  const response = new MemoryResponse();
  await api.handle(incoming, response, "/api/auth/google/redirect");
  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, "https://daylight.example");
  assert.ok(response.headers["Set-Cookie"].startsWith("daylight_session="));

  await assert.rejects(
    api.handle(
      {
        method: "POST",
        url: "/api/auth/google/redirect",
        headers: { 
          cookie: "g_csrf_token=wrong",
          "content-type": "application/x-www-form-urlencoded",
        },
        socket: { remoteAddress: "127.0.0.1" },
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(new URLSearchParams({ g_csrf_token: "csrf123", credential: "valid-credential" }).toString());
        },
      },
      new MemoryResponse(),
      "/api/auth/google/redirect"
    ),
    { status: 400 }
  );
});

test("Facebook sign-in creates a verified account and links by verified email", async () => {
  const existingUser = {
    id: "existing-user",
    email: "existing@example.com",
    google_sub: null,
    facebook_id: null,
    email_verified_at: null,
  };
  const pool = new MemoryPool([existingUser]);
  const api = createAccountApi({
    pool,
    origin: "https://daylight.example",
    sendJson,
    verifyGoogleCredential: async () => { throw new Error("Not implemented"); },
    verifyFacebookCredential: async (accessToken) => {
      if (accessToken === "existing-fb-token") {
        return { id: "fb-existing", email: "EXISTING@example.com" };
      }
      if (accessToken === "new-fb-token") {
        return { id: "fb-new", email: "new@example.com" };
      }
      throw new Error("Invalid access token");
    },
  });

  const linked = await request(api, "POST", "/api/auth/facebook", {
    accessToken: "existing-fb-token",
  });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.user.email, "existing@example.com");
  assert.equal(pool.users[0].facebook_id, "fb-existing");
  assert.ok(pool.users[0].email_verified_at);

  const created = await request(api, "POST", "/api/auth/facebook", {
    accessToken: "new-fb-token",
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.user.email, "new@example.com");
  assert.equal(pool.users[1].facebook_id, "fb-new");
  assert.ok(pool.users[1].email_verified_at);

  await assert.rejects(
    request(api, "POST", "/api/auth/facebook", { accessToken: "invalid" }),
    { status: 401 }
  );
});

test("passwords are stored as scrypt hashes and verified", async () => {
  const password = "correct horse battery staple";
  const hash = await hashPassword(password);
  assert.match(hash, /^scrypt\$/);
  assert.ok(await verifyPassword(password, hash));
  assert.ok(!await verifyPassword("wrong password", hash));
});

test("email and session tokens are random and stored as one-way hashes", async () => {
  const { createToken, hashToken } = await import("../auth-utils.mjs");
  const token1 = createToken();
  const token2 = createToken();
  assert.notEqual(token1, token2);
  const hash1 = hashToken(token1);
  const hash2 = hashToken(token2);
  assert.notEqual(hash1, hash2);
  assert.equal(hashToken(token1), hash1);
});