import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { ensureIndexes } from "../../lib/db.js";
import {
  claimJob,
  completeJob,
  enqueueJob,
  failExhaustedJobs,
  failJob,
  MAX_ATTEMPTS,
} from "../../lib/queue.js";
import { hit } from "../../lib/rate-limit.js";
import { runKeepalive } from "../../lib/keepalive.js";

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
beforeEach(() =>
  Promise.all(
    ["jobs", "rate_limits", "heartbeats"].map((c) =>
      db.collection(c).deleteMany({}),
    ),
  ),
);

describe("queue", () => {
  it("lets exactly one of many concurrent workers claim a job", async () => {
    const job = await enqueueJob(db, {
      userId: "u1",
      sourceUrl: "https://res.cloudinary.com/demo/video/upload/sources/a.mp4",
    });
    const results = await Promise.all(
      Array.from({ length: 20 }, () => claimJob(db, job._id)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean).attempts).toBe(1);
  });

  it("does not re-claim a job whose lock is still valid", async () => {
    await enqueueJob(db, {
      userId: "u1",
      sourceUrl: "https://res.cloudinary.com/demo/video/upload/sources/a.mp4",
    });
    expect(await claimJob(db)).toBeTruthy();
    expect(await claimJob(db)).toBeNull();
  });

  it("re-claims a job after its lock expires (crashed worker)", async () => {
    const job = await enqueueJob(db, {
      userId: "u1",
      sourceUrl: "https://res.cloudinary.com/demo/video/upload/sources/a.mp4",
    });
    await claimJob(db, job._id);
    await db
      .collection("jobs")
      .updateOne(
        { _id: job._id },
        { $set: { lockedUntil: new Date(Date.now() - 1000) } },
      );
    const again = await claimJob(db, job._id);
    expect(again.attempts).toBe(2);
  });

  it("stops re-claiming after MAX_ATTEMPTS and fails the job", async () => {
    const job = await enqueueJob(db, {
      userId: "u1",
      sourceUrl: "https://res.cloudinary.com/demo/video/upload/sources/a.mp4",
    });
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(await claimJob(db, job._id)).toBeTruthy();
      await db
        .collection("jobs")
        .updateOne(
          { _id: job._id },
          { $set: { lockedUntil: new Date(Date.now() - 1000) } },
        );
    }
    expect(await claimJob(db, job._id)).toBeNull();
    expect(await failExhaustedJobs(db)).toBe(1);
    expect((await db.collection("jobs").findOne({ _id: job._id })).status).toBe(
      "failed",
    );
  });

  it("completes only once and cannot complete a non-processing job", async () => {
    const job = await enqueueJob(db, {
      userId: "u1",
      sourceUrl: "https://res.cloudinary.com/demo/video/upload/sources/a.mp4",
    });
    expect((await completeJob(db, job._id, { url: "x" })).modifiedCount).toBe(
      0,
    ); // still queued
    await claimJob(db, job._id);
    expect((await completeJob(db, job._id, { url: "x" })).modifiedCount).toBe(
      1,
    );
    expect((await failJob(db, job._id, "late")).modifiedCount).toBe(0); // already done
  });
});

describe("rate limit", () => {
  it("allows up to the limit then blocks, even under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        hit(db, "user:u1", { limit: 3, windowSeconds: 60 }),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });
  it("tracks keys independently", async () => {
    await hit(db, "a", { limit: 1, windowSeconds: 60 });
    expect((await hit(db, "b", { limit: 1, windowSeconds: 60 })).allowed).toBe(
      true,
    );
  });
});

describe("infrastructure", () => {
  it("creates the TTL indexes", async () => {
    const jobIdx = await db.collection("jobs").indexes();
    expect(jobIdx.some((i) => i.expireAfterSeconds === 30 * 24 * 3600)).toBe(
      true,
    );
    const rlIdx = await db.collection("rate_limits").indexes();
    expect(rlIdx.some((i) => i.expireAfterSeconds === 0)).toBe(true);
  });
  it("keepalive writes a heartbeat", async () => {
    expect(await runKeepalive(db)).toEqual({ mongo: "ok" });
    await runKeepalive(db);
    expect(
      (await db.collection("heartbeats").findOne({ _id: "keepalive" })).runs,
    ).toBe(2);
  });
});
