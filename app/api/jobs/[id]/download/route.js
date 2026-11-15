import { ObjectId } from "mongodb";
import { getDb } from "../../../../../lib/db.js";
import { getSessionUser } from "../../../../../lib/session.js";
import {
  deleteAssets,
  reelUrl,
} from "../../../../../lib/storage/cloudinary.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Step 4: hand the finished reel to its owner, once. The reel is streamed from Cloudinary
// and deleted only after the whole file has gone out, so a broken download can be retried.
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
  const jobs = db.collection("jobs");
  const job = await jobs.findOne({
    _id: jobId,
    userId: user.id,
    status: "done",
  });
  if (!job) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (job.reelDeleted) {
    return Response.json({ error: "Already downloaded" }, { status: 410 });
  }

  const upstream = await fetch(reelUrl(id));
  if (!upstream.ok) {
    return Response.json({ error: "Reel unavailable" }, { status: 410 });
  }

  const deleteWhenSent = new TransformStream({
    async flush() {
      try {
        await deleteAssets([`reels/${id}`]);
        await jobs.updateOne({ _id: jobId }, { $set: { reelDeleted: true } });
      } catch {
        // The 7-day sweep removes the reel if this fails.
      }
    },
  });

  return new Response(upstream.body.pipeThrough(deleteWhenSent), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": 'attachment; filename="reel.mp4"',
      "Cache-Control": "no-store",
    },
  });
}
