import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { ensureIndexes } from "../../lib/db.js";
import { processJob } from "../../lib/process-job.js";
import { enqueueJob } from "../../lib/queue.js";
import { downloadWithCap } from "../../lib/source/download.js";
import { isOwnSourceUrl, signUpload } from "../../lib/storage/cloudinary.js";

// The Cloudinary SDK reads this when it is first imported, so set it before imports run.
vi.hoisted(() => {
  process.env.CLOUDINARY_URL = "cloudinary://key:secret@democloud";
});

process.env.CLOUDINARY_URL = "cloudinary://key:secret@democloud";
const { isOwnSourceUrl, signUpload } =
  await import("../../lib/storage/cloudinary.js");

let server, client, db;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = await new MongoClient(server.getUri()).connect();
  db = client.db("test");
  await ensureIndexes(db);
}, 120_000);
afterAll(async () => {
  await client?.close();
  await server?.stop();
});
beforeEach(() => db.collection("jobs").deleteMany({}));

const SOURCE =
  "https://res.cloudinary.com/democloud/video/upload/v1/sources/a.mp4";

function fakeSteps(overrides = {}) {
  return {
    download: vi.fn(),
    probe: vi.fn().mockResolvedValue(40),
    slice: vi.fn().mockResolvedValue("slice.mp4"),
    render: vi.fn().mockResolvedValue("reel.mp4"),
    upload: vi.fn().mockResolvedValue("https://cdn/reel.mp4"),
    ...overrides,
  };
}

describe("processJob", () => {
  it("runs a job to done and stores the reel url", async () => {
    const job = await enqueueJob(db, { userId: "u1", sourceUrl: SOURCE });
    const steps = fakeSteps();

    await processJob(db, job._id, steps);

    const saved = await db.collection("jobs").findOne({ _id: job._id });
    expect(saved.status).toBe("done");
    expect(saved.result.reelUrl).toBe("https://cdn/reel.mp4");
    expect(steps.upload).toHaveBeenCalledWith("reel.mp4", String(job._id));
  });

  it("marks the job failed when a step throws", async () => {
    const job = await enqueueJob(db, { userId: "u1", sourceUrl: SOURCE });
    const steps = fakeSteps({
      probe: vi.fn().mockRejectedValue(new Error("not a playable video")),
    });

    await processJob(db, job._id, steps);

    const saved = await db.collection("jobs").findOne({ _id: job._id });
    expect(saved.status).toBe("failed");
    expect(saved.error).toBe("not a playable video");
  });

  it("recovers a crashed job exactly once", async () => {
    const job = await enqueueJob(db, { userId: "u1", sourceUrl: SOURCE });
    // Worker A claims the job and then dies without finishing.
    await db.collection("jobs").updateOne(
      { _id: job._id },
      {
        $set: {
          status: "processing",
          lockedUntil: new Date(Date.now() - 1000),
          attempts: 1,
        },
      },
    );
    const steps = fakeSteps();

    const [first, second] = await Promise.all([
      processJob(db, job._id, steps),
      processJob(db, job._id, steps),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(steps.upload).toHaveBeenCalledTimes(1);
    const saved = await db.collection("jobs").findOne({ _id: job._id });
    expect(saved.status).toBe("done");
  });

  it("does not touch a job that is still locked by a live worker", async () => {
    const job = await enqueueJob(db, { userId: "u1", sourceUrl: SOURCE });
    await db.collection("jobs").updateOne(
      { _id: job._id },
      {
        $set: {
          status: "processing",
          lockedUntil: new Date(Date.now() + 60_000),
          attempts: 1,
        },
      },
    );
    const steps = fakeSteps();

    expect(await processJob(db, job._id, steps)).toBeNull();
    expect(steps.download).not.toHaveBeenCalled();
  });
});

describe("isOwnSourceUrl", () => {
  it("accepts a source video from our cloud", () => {
    expect(isOwnSourceUrl(SOURCE)).toBe(true);
  });

  it.each([
    "http://res.cloudinary.com/democloud/video/upload/sources/a.mp4",
    "https://res.cloudinary.com/othercloud/video/upload/sources/a.mp4",
    "https://res.cloudinary.com/democloud/video/upload/reels/a.mp4",
    "https://res.cloudinary.com.evil.com/democloud/video/upload/sources/a.mp4",
    "https://user:pw@res.cloudinary.com/democloud/video/upload/sources/a.mp4",
    "http://169.254.169.254/latest/meta-data",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isOwnSourceUrl(url)).toBe(false);
  });
});

describe("signUpload", () => {
  it("returns a signature but never the secret", () => {
    const signed = signUpload();
    expect(signed.cloudName).toBe("democloud");
    expect(signed.signature).toMatch(/^[a-f0-9]+$/);
    expect(JSON.stringify(signed)).not.toContain("secret");
  });
});

describe("downloadWithCap", () => {
  let httpServer, baseUrl;
  beforeAll(async () => {
    httpServer = createServer((req, res) => res.end("x".repeat(1000)));
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  });
  afterAll(() => httpServer.close());

  it("saves a file under the cap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dl-"));
    await downloadWithCap(baseUrl, join(dir, "f"), 2000);
    expect((await readFile(join(dir, "f"))).length).toBe(1000);
  });

  it("aborts a file over the cap", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dl-"));
    await expect(downloadWithCap(baseUrl, join(dir, "f"), 500)).rejects.toThrow(
      "too large",
    );
  });
});
