import { after } from "next/server";
import { getDb } from "../../../lib/db.js";
import { releaseReel, reserveReel } from "../../../lib/entitlements.js";
import { processJob } from "../../../lib/process-job.js";
import { enqueueJob } from "../../../lib/queue.js";
import { hit } from "../../../lib/rate-limit.js";
import { rateLimitResponse } from "../../../lib/request-info.js";
import { getSessionUser } from "../../../lib/session.js";
import { isOwnSourceUrl } from "../../../lib/storage/cloudinary.js";
import { createJobSchema } from "../../../lib/validators.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Circuit breaker: the most reels the whole service makes per day, so a surge or an
// attack cannot burn through the free-tier quotas.
const GLOBAL_DAILY_LIMIT = Number(process.env.GLOBAL_DAILY_LIMIT) || 200;

// Step 2: the browser has uploaded the video and now asks for a reel.
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  const limited = await rateLimitResponse(`jobs:${user.id}`, 5, 3600);
  if (limited) {
    return limited;
  }

  const body = await request.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success || !isOwnSourceUrl(parsed.data.sourceUrl)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDb();
  const reserved = await reserveReel(db, user.id);
  if (!reserved.ok) {
    return Response.json({ error: reserved.reason }, { status: 402 });
  }

  try {
    const global = await hit(db, "global-jobs", {
      limit: GLOBAL_DAILY_LIMIT,
      windowSeconds: 24 * 3600,
    });
    if (!global.allowed) {
      await releaseReel(db, user.id, reserved.charge);
      return Response.json(
        { error: "Busy, try again tomorrow" },
        { status: 503 },
      );
    }

    const job = await enqueueJob(db, {
      userId: user.id,
      sourceUrl: parsed.data.sourceUrl,
      start: parsed.data.start,
      duration: parsed.data.duration,
      charge: reserved.charge,
    });
    after(() => processJob(db, job._id));

    return Response.json({ id: String(job._id) }, { status: 202 });
  } catch (error) {
    await releaseReel(db, user.id, reserved.charge);
    throw error;
  }
}
