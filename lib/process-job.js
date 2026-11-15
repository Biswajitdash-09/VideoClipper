import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickWindow } from "./highlight/pick-window.js";
import { claimJob, completeJob, failJob } from "./queue.js";
import { renderReel } from "./render/crop-captions.js";
import { downloadWithCap } from "./source/download.js";
import { probeDuration, sliceUpload } from "./source/upload-source.js";
import { uploadReel } from "./storage/cloudinary.js";

const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

const realSteps = {
  download: downloadWithCap,
  probe: probeDuration,
  slice: sliceUpload,
  render: renderReel,
  upload: uploadReel,
};

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
    // Uploads have no captions yet, so no cues and a fixed pick.
    const window = pickWindow([], duration);
    const slicePath = await steps.slice(sourcePath, window, dir);
    const reelPath = await steps.render({
      slicePath,
      cues: [],
      window,
      dir,
      outputName: "reel.mp4",
    });
    const reelUrl = await steps.upload(reelPath, String(job._id));

    await completeJob(db, job._id, {
      reelUrl,
      start: window.start,
      end: window.end,
    });
  } catch (error) {
    await failJob(db, job._id, error.message);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  return job._id;
}
