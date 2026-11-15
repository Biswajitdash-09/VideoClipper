import { getDb } from "../../../../lib/db.js";
import { isAuthorizedCron } from "../../../../lib/cron-auth.js";
import { deleteExpiredAssets } from "../../../../lib/retention.js";
import { processJob } from "../../../../lib/process-job.js";
import { failExhaustedJobs } from "../../../../lib/queue.js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIME_BUDGET_MS = 150_000; // stop starting new jobs well before maxDuration

// Daily safety net: fail jobs that ran out of attempts, finish stuck ones, and delete
// videos older than the 7-day retention promised on the site.
export async function GET(request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const failed = await failExhaustedJobs(db);

  const startedAt = Date.now();
  let recovered = 0;
  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const jobId = await processJob(db);
    if (!jobId) {
      break;
    }
    recovered++;
  }

  const deleted = await deleteExpiredAssets(db);

  return Response.json({ failed, recovered, deleted });
}
