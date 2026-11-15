import { getDb } from "./db.js";
import { hit } from "./rate-limit.js";

// Vercel sets x-forwarded-for itself, so the first entry is the real client.
export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

// Returns a 429 Response when the caller is over the limit, otherwise null.
export async function rateLimitResponse(request, name, limit, windowSeconds) {
  const db = await getDb();
  const { allowed } = await hit(db, `${name}:${clientIp(request)}`, {
    limit,
    windowSeconds,
  });

  if (allowed) {
    return null;
  }
  return Response.json({ error: "Too many requests" }, { status: 429 });
}
