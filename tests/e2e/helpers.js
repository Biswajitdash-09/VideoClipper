import { MongoClient } from "mongodb";
import { encode } from "next-auth/jwt";

const COOKIE = "authjs.session-token";
const AUTH_SECRET = "e2e-auth-secret-0123456789abcdef";

export async function db() {
  const client = await new MongoClient(
    "mongodb://127.0.0.1:27099/reelmark_e2e",
  ).connect();
  return { db: client.db(), close: () => client.close() };
}

// Signs in without Google: Auth.js sessions are just a signed cookie, and we know the secret.
export async function signInAs(context, { id, email }) {
  const value = await encode({
    token: { sub: id, email, name: "E2E" },
    secret: AUTH_SECRET,
    salt: COOKIE,
  });
  await context.addCookies([
    { name: COOKIE, value, domain: "localhost", path: "/" },
  ]);
}

export async function resetUser(id, fields = {}) {
  const { db: database, close } = await db();
  await database.collection("jobs").deleteMany({ userId: id });
  await database.collection("users").deleteOne({ _id: id });
  if (fields) {
    await database.collection("users").insertOne({
      _id: id,
      email: `${id}@example.com`,
      trialUsed: false,
      subscriptionStatus: "none",
      ...fields,
    });
  }
  await close();
}
