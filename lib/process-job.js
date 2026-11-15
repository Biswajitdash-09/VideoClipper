import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refundJob } from "./entitlements.js";
import { claimJob, completeJob, failJob } from "./queue.js";
import { sourcePublicId } from "./retention.js";
import { renderReel } from "./render/crop-captions.js";
import { downloadWithCap } from "./source/download.js";
import { probeDuration, sliceUpload } from "./source/upload-source.js";
import { deleteAssets, uploadReel } from "./storage/cloudinary.js";

const MAX_SOURCE_BYTES = 200 * 1024 * 1024;
// The browser and ffprobe can disagree on a video's length by a fraction of a second.
const END_TOLERANCE_SECONDS = 0.5;

const realSteps = {
  download: downloadWithCap,
  probe: probeDuration,
  slice: sliceUpload,
  render: renderReel,
  upload: uploadReel,
  removeSource: (sourceUrl) => deleteAssets([sourcePublicId(sourceUrl)]),
};

// The source is no longer needed once the reel exists. If this fails, the 7-day sweep gets it.
async function removeSourceQuietly(steps, sourceUrl) {
  try {
    await steps.removeSource(sourceUrl);
  } catch {
    // Not worth failing a finished reel over.
  }
}

// Claims one job and runs it to done or failed. Safe to call from several places at once:
// claimJob is atomic, so only one caller gets the job and the others return null.
// `steps` is replaceable so tests don't need ffmpeg or Cloudinary.
export async function processJob(db, jobId, steps = realSteps) {
  const job = await claimJob(db, jobId);
  if (!job) {
    return null;
  }

  const dir = await mkdtemp(join(tmpdir(), "reel-"));
  try {
    const sourcePath = join(dir, "source");
    await steps.download(job.sourceUrl, sourcePath, MAX_SOURCE_BYTES);

    const duration = await steps.probe(sourcePath);
    // The user chose this part of the video. Uploads have no captions, so no cues.
    const window = { start: job.start, end: job.start + job.duration };
    if (window.end > duration + END_TOLERANCE_SECONDS) {
      throw new Error("The chosen part is past the end of the video");
    }
    const slicePath = await steps.slice(sourcePath, window, dir);
    const reelPath = await steps.render({
      slicePath,
      cues: [],
      window,
      dir,
      outputName: "reel.mp4",
    });
    await steps.upload(reelPath, String(job._id));
    await removeSourceQuietly(steps, job.sourceUrl);

    await completeJob(db, job._id);
  } catch (error) {
    // Refund only if this worker still owned the job; a newer worker may be finishing it.
    const failed = await failJob(db, job._id, error.message);
    if (failed.modifiedCount) {
      await refundJob(db, job);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  return job._id;
}
