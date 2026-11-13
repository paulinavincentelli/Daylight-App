import assert from "node:assert/strict";
import test from "node:test";
import {
  createToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../auth-utils.mjs";

test("passwords are stored as scrypt hashes and verified", async () => {
  const password = "correct horse battery staple";
  const encoded = await hashPassword(password);

  assert.match(encoded, /^scrypt\$32768\$8\$1\$/);
  assert.notEqual(encoded, password);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("incorrect password", encoded), false);
});

test("email and session tokens are random and stored as one-way hashes", () => {
  const first = createToken();
  const second = createToken();

  assert.equal(first.length, 43);
  assert.notEqual(first, second);
  assert.match(hashToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashToken(first), first);
});
