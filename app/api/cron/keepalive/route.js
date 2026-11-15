import { getDb } from "../../../../lib/db.js";
import { isAuthorizedCron } from "../../../../lib/cron-auth.js";
import { runKeepalive } from "../../../../lib/keepalive.js";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  if (!isAuthorizedCron(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runKeepalive(await getDb()));
  } catch (error) {
    console.error("keepalive failed", error.message);
    return Response.json({ mongo: "error" }, { status: 500 });
  }
}
