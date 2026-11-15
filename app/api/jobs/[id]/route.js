import { after } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../../lib/db.js";
import { processJob } from "../../../../lib/process-job.js";
import { getSessionUser } from "../../../../lib/session.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Step 3: the browser polls until the job is done or failed.
export async function GET(request, { params }) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const db = await getDb();
  const jobId = new ObjectId(id);
  const job = await db
    .collection("jobs")
    .findOne({ _id: jobId, userId: user.id });
  if (!job) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // A job whose worker died is picked up again here. claimJob is atomic and only
  // claims queued jobs or ones with an expired lock, so a healthy job is never touched.
  if (job.status === "queued" || job.status === "processing") {
    after(() => processJob(db, jobId));
  }

  return Response.json({
    id,
    status: job.status,
    result: job.result,
    error: job.error,
  });
}
