import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { createAccountApi } from "../account-api.mjs";
import { hashPassword } from "../auth-utils.mjs";

class MemoryPool {
  constructor(users) {
    this.users = users;
    this.sessions = new Map();
    this.tasks = new Map();
    this.revisions = new Map();
  }

  async query(sql, values = []) {
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (query.startsWith("select id, email, password_hash")) {
      return {
        rows: this.users.filter((user) => user.email === values[0]),
      };
    }
    if (query.startsWith("insert into sessions")) {
      this.sessions.set(values[0], {
        userId: values[1],
        expiresAt: new Date(values[2]),
      });
      return { rows: [] };
    }
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
        if (query.startsWith("delete from email_tokens")) {
          return { rows: [] };
        }
        if (query.startsWith("insert into users")) {
          const user = {
            id: values[0],
            email: values[1],
            password_hash: null,
            google_sub: values[2],
            email_verified_at: new Date(),
          };
          this.users.push(user);
          return { rows: [{ id: user.id, email: user.email }] };
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

  setHeader(name, value) {
    this.headers[name] = value;
  }

  writeHead(status, headers) {
    this.status = status;
    Object.assign(this.headers, headers);
  }

  end(body) {
    this.body = body ? JSON.parse(body) : undefined;
  }
}

async function request(api, method, path, body, cookie = "") {
  const input = body ? [Buffer.from(JSON.stringify(body))] : [];
  const incoming = Readable.from(input);
  incoming.method = method;
  incoming.headers = { cookie };
  incoming.socket = { remoteAddress: "127.0.0.1" };
  const response = new MemoryResponse();
  await api.handle(incoming, response, path);
  return response;
}

test("task lists are account-scoped and stale revisions cannot overwrite", async () => {
  const passwordHash = await hashPassword("correct horse battery staple");
  const pool = new MemoryPool([
    {
      id: "user-a",
      email: "a@example.com",
      password_hash: passwordHash,
      email_verified_at: new Date(),
    },
    {
      id: "user-b",
      email: "b@example.com",
      password_hash: passwordHash,
      email_verified_at: new Date(),
    },
  ]);
  const api = createAccountApi({
    pool,
    origin: "https://daylight.example",
    sendJson(response, status, value) {
      response.writeHead(status, {});
      response.end(JSON.stringify(value));
    },
  });
  const loginA = await request(api, "POST", "/api/auth/login", {
    email: "a@example.com",
    password: "correct horse battery staple",
  });

  const loginB = await request(api, "POST", "/api/auth/login", {
    email: "b@example.com",
    password: "correct horse battery staple",
  });
  const cookieA = loginA.headers["Set-Cookie"].split(";")[0];
  const cookieB = loginB.headers["Set-Cookie"].split(";")[0];
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
  assert.equal(saved.body.revision, 1);

  const otherAccount = await request(api, "GET", "/api/tasks", undefined, cookieB);
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
    password_hash: await hashPassword("correct horse battery staple"),
    google_sub: null,
    email_verified_at: null,
  };
  const pool = new MemoryPool([existingUser]);
  const api = createAccountApi({
    pool,
    origin: "https://daylight.example",
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
      return {
        sub: "google-unverified",
        email: "unverified@example.com",
        email_verified: false,
      };
    },
    sendJson(response, status, value) {
      response.writeHead(status, {});
      response.end(JSON.stringify(value));
    },
  });

  const linked = await request(api, "POST", "/api/auth/google", {
    credential: "existing",
  });
  assert.equal(linked.body.user.id, existingUser.id);
  assert.equal(existingUser.google_sub, "google-existing");
  assert.ok(existingUser.email_verified_at);

  const created = await request(api, "POST", "/api/auth/google", {
    credential: "new",
  });
  assert.equal(created.body.user.email, "new@example.com");
  const newUser = pool.users.find((user) => user.email === "new@example.com");
  assert.equal(newUser.password_hash, null);
  assert.equal(newUser.google_sub, "google-new");
  assert.ok(newUser.email_verified_at);
  assert.equal(pool.revisions.get(newUser.id), 0);

  await assert.rejects(
    request(api, "POST", "/api/auth/google", { credential: "unverified" }),
    { status: 401 }
  );
});

test("Google redirect sign-in verifies GIS CSRF tokens and creates a session", async () => {
  const pool = new MemoryPool([]);
  const api = createAccountApi({
    pool,
    origin: "https://daylight-app-gxqd.onrender.com",
    verifyGoogleCredential: async (credential) => {
      assert.equal(credential, "valid-google-id-token");
      return {
        sub: "google-redirect-user",
        email: "redirect@example.com",
        email_verified: true,
      };
    },
    sendJson(response, status, value) {
      response.writeHead(status, {});
      response.end(JSON.stringify(value));
    },
  });
  const csrfToken = "csrf-token-123";
  const incoming = Readable.from([
    Buffer.from(
      new URLSearchParams({
        credential: "valid-google-id-token",
        g_csrf_token: csrfToken,
      }).toString()
    ),
  ]);
  incoming.method = "POST";
  incoming.headers = {
    cookie: `g_csrf_token=${csrfToken}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  incoming.socket = { remoteAddress: "127.0.0.1" };
  const response = new MemoryResponse();

  await api.handle(incoming, response, "/api/auth/google/redirect");

  assert.equal(response.status, 303);
  assert.equal(response.headers.Location, "https://daylight-app-gxqd.onrender.com");
  assert.match(response.headers["Set-Cookie"], /^daylight_session=/);
  assert.equal(pool.users[0].email, "redirect@example.com");
  assert.equal(pool.users[0].google_sub, "google-redirect-user");

  const invalid = Readable.from([
    Buffer.from(
      new URLSearchParams({
        credential: "valid-google-id-token",
        g_csrf_token: "different-token",
      }).toString()
    ),
  ]);
  invalid.method = "POST";
  invalid.headers = {
    cookie: `g_csrf_token=${csrfToken}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  invalid.socket = { remoteAddress: "127.0.0.1" };
  await assert.rejects(
    api.handle(invalid, new MemoryResponse(), "/api/auth/google/redirect"),
    { status: 400 }
  );
});
