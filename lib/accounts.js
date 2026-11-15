import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hashPassword, verifyPassword } from "./password.js";

// The password cap stops someone sending a huge string to burn CPU in scrypt.
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});

// Returns { ok: true, user } or { ok: false, reason: "exists" }.
export async function createAccount(db, { email, password }) {
  const user = {
    _id: randomUUID(),
    email,
    passwordHash: await hashPassword(password),
    trialUsed: false,
    subscriptionStatus: "none",
    createdAt: new Date(),
  };

  try {
    await db.collection("users").insertOne(user);
  } catch (error) {
    if (error.code === 11000) {
      return { ok: false, reason: "exists" };
    }
    throw error;
  }
  return { ok: true, user: { id: user._id, email } };
}

// Returns { id, email } when the password matches, otherwise null.
export async function checkPassword(db, { email, password }) {
  const user = await db.collection("users").findOne({ email });
  const matches = await verifyPassword(password, user?.passwordHash);
  return matches ? { id: user._id, email: user.email } : null;
}
