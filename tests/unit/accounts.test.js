import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { checkPassword, createAccount } from "../../lib/accounts.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { clearDb, startTestDb } from "../helpers.js";

let testDb, db;
beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
}, 120_000);
afterAll(() => testDb?.stop());
beforeEach(() => clearDb(db));

describe("passwords", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("wrong horse", stored)).toBe(false);
  });

  it("never stores the password itself", async () => {
    expect(await hashPassword("correct horse")).not.toContain("correct horse");
  });

  it("rejects a missing or malformed stored hash", async () => {
    expect(await verifyPassword("x", undefined)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("accounts", () => {
  const login = { email: "a@example.com", password: "password-123" };

  it("signs in with the right password only", async () => {
    await createAccount(db, login);
    expect(await checkPassword(db, login)).toMatchObject({
      email: "a@example.com",
    });
    expect(await checkPassword(db, { ...login, password: "nope-nope" })).toBe(
      null,
    );
  });

  it("refuses a second account with the same email, even at the same moment", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createAccount(db, login)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await db.collection("users").countDocuments()).toBe(1);
  });

  it("does not sign in an unknown email", async () => {
    expect(await checkPassword(db, login)).toBe(null);
  });
});
