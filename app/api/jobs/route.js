import { after } from "next/server";
import { getDb } from "../../../lib/db.js";
import { processJob } from "../../../lib/process-job.js";
import { enqueueJob } from "../../../lib/queue.js";
import { clientIp, rateLimitResponse } from "../../../lib/request-info.js";
import { isOwnSourceUrl } from "../../../lib/storage/cloudinary.js";
import { createJobSchema } from "../../../lib/validators.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Step 2: the browser has uploaded the video and now asks for a reel.
export async function POST(request) {
  const limited = await rateLimitResponse(request, "jobs", 5, 3600);
  if (limited) {
    return limited;
  }

  const body = await request.json().catch(() => null);
  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success || !isOwnSourceUrl(parsed.data.sourceUrl)) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDb();
  // TODO(phase 3): replace the IP placeholder with the signed-in user.
  const job = await enqueueJob(db, {
    userId: `anon:${clientIp(request)}`,
    sourceUrl: parsed.data.sourceUrl,
  });

  after(() => processJob(db, job._id));

  return Response.json({ id: String(job._id) }, { status: 202 });
}
