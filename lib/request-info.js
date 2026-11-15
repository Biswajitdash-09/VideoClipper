import { getDb } from "./db.js";
import { hit } from "./rate-limit.js";

// Returns a 429 Response when `key` is over the limit, otherwise null.
export async function rateLimitResponse(key, limit, windowSeconds) {
  const db = await getDb();
  const { allowed } = await hit(db, key, { limit, windowSeconds });

  if (allowed) {
    return null;
  }
  return Response.json({ error: "Too many requests" }, { status: 429 });
}
