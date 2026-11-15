import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, FFMPEG_BIN, FFPROBE_BIN } from "../../lib/run.js";
import { processJob } from "../../lib/process-job.js";
import { downloadWithCap } from "../../lib/source/download.js";
import { probeDuration, sliceUpload } from "../../lib/source/upload-source.js";
import { renderReel } from "../../lib/render/crop-captions.js";
import { enqueueJob } from "../../lib/queue.js";
import { startTestDb } from "../helpers.js";

// Real ffmpeg and ffprobe (the bundled binaries). Only the Cloudinary upload is replaced.
let testDb, db, httpServer, sourceUrl;

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;

  const dir = await mkdtemp(join(tmpdir(), "src-"));
  const sourceFile = join(dir, "source.mp4");
  await run(FFMPEG_BIN, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=1280x720:d=40",
    "-f",
    "lavfi",
    "-i",
    "sine=d=40",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-shortest",
    sourceFile,
  ]);
  const bytes = await readFile(sourceFile);
  httpServer = createServer((request, response) => response.end(bytes));
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  sourceUrl = `http://127.0.0.1:${httpServer.address().port}/source.mp4`;
}, 180_000);

afterAll(async () => {
  httpServer?.close();
  await testDb?.stop();
});

describe("full pipeline with real ffmpeg", () => {
  it("turns a 40 s landscape video into a 15 s 720x1280 reel", async () => {
    const job = await enqueueJob(db, { userId: "u1", sourceUrl });
    const upload = vi.fn(async (reelPath) => {
      // The file is deleted after the job, so inspect it now.
      const out = await run(FFPROBE_BIN, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration",
        "-of",
        "csv=p=0",
        reelPath,
      ]);
      upload.probed = out.trim();
      return "https://cdn.example/reel.mp4";
    });

    await processJob(db, job._id, {
      download: downloadWithCap,
      probe: probeDuration,
      slice: sliceUpload,
      render: renderReel,
      upload,
    });

    const saved = await db.collection("jobs").findOne({ _id: job._id });
    expect(saved.status).toBe("done");
    const [width, height, duration] = upload.probed.split(",");
    expect([width, height]).toEqual(["720", "1280"]);
    expect(Number(duration)).toBeGreaterThan(9.5);
    expect(Number(duration)).toBeLessThan(20.5);
  }, 120_000);

  it("fails cleanly on a file that is not a video", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bad-"));
    const notVideo = join(dir, "notes.txt");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(notVideo, "this is not a video");

    await expect(probeDuration(notVideo)).rejects.toThrow(
      "not a playable video",
    );
  });
});
