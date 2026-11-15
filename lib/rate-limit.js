// Fixed-window rate limiter on Mongo (one upsert per call). The TTL index on `expiresAt`
// removes old counters, so there is no cleanup job and no Redis to keep alive.
export async function hit(db, key, { limit, windowSeconds }) {
  const windowMs = windowSeconds * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  const doc = await db.collection("rate_limits").findOneAndUpdate(
    { _id: `${key}:${bucket}` },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs + 60_000) },
    },
    { upsert: true, returnDocument: "after" },
  );
  return {
    allowed: doc.count <= limit,
    remaining: Math.max(0, limit - doc.count),
  };
}
