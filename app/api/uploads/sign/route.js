import { getDb } from "../../../../lib/db.js";
import { describeUser } from "../../../../lib/entitlements.js";
import { rateLimitResponse } from "../../../../lib/request-info.js";
import { getSessionUser } from "../../../../lib/session.js";
import { signUpload } from "../../../../lib/storage/cloudinary.js";

export const dynamic = "force-dynamic";

// Step 1: a signed-in user with a reel left asks to upload a source video to Cloudinary.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  const limited = await rateLimitResponse(`sign:${user.id}`, 10, 3600);
  if (limited) {
    return limited;
  }

  const db = await getDb();
  if (!(await describeUser(db, user.id)).canStart) {
    return Response.json({ error: "No reels left" }, { status: 402 });
  }

  return Response.json(signUpload());
}
