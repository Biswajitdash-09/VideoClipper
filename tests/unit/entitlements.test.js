import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PLAN_MONTHLY_LIMIT,
  currentPeriod,
  describeUser,
  ensureUser,
  refundJob,
  reserveReel,
} from "../../lib/entitlements.js";
import { enqueueJob } from "../../lib/queue.js";
import { clearDb, startTestDb } from "../helpers.js";

let testDb, db;
beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
}, 120_000);
afterAll(() => testDb?.stop());
beforeEach(async () => {
  await clearDb(db);
  await ensureUser(db, { id: "u1", email: "u1@example.com" });
});

function subscribe(userId = "u1", status = "active") {
  return db
    .collection("users")
    .updateOne({ _id: userId }, { $set: { subscriptionStatus: status } });
}

describe("free trial", () => {
  it("gives exactly one reel", async () => {
    expect((await reserveReel(db, "u1")).ok).toBe(true);
    expect(await reserveReel(db, "u1")).toEqual({
      ok: false,
      reason: "trial_used",
    });
  });

  it("gives exactly one reel to 20 simultaneous requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveReel(db, "u1")),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it("rejects a user that does not exist", async () => {
    expect((await reserveReel(db, "ghost")).ok).toBe(false);
  });

  it("creating the same user twice at once is harmless", async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        ensureUser(db, { id: "u2", email: "u2@example.com" }),
      ),
    );
    expect(await db.collection("users").countDocuments({ _id: "u2" })).toBe(1);
  });
});

describe("paid plan", () => {
  it("stops at the monthly limit, even with simultaneous requests", async () => {
    await subscribe();
    const results = await Promise.all(
      Array.from({ length: PLAN_MONTHLY_LIMIT + 10 }, () =>
        reserveReel(db, "u1"),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(
      PLAN_MONTHLY_LIMIT,
    );
    expect((await describeUser(db, "u1")).canStart).toBe(false);
  });

  it("starts a fresh count in a new month", async () => {
    await subscribe();
    await db.collection("users").updateOne(
      { _id: "u1" },
      {
        $set: { usage: { period: "2020-01", count: PLAN_MONTHLY_LIMIT } },
      },
    );

    expect((await reserveReel(db, "u1")).ok).toBe(true);

    const user = await db.collection("users").findOne({ _id: "u1" });
    expect(user.usage).toEqual({ period: currentPeriod(), count: 1 });
  });

  it("treats a canceled subscription as the free tier", async () => {
    await subscribe("u1", "canceled");
    expect((await describeUser(db, "u1")).onPlan).toBe(false);
  });
});

describe("refunds", () => {
  function chargedJob(charge) {
    return enqueueJob(db, {
      userId: "u1",
      sourceUrl: "https://res.cloudinary.com/demo/video/upload/sources/a.mp4",
      charge,
    });
  }

  it("gives the trial back once, however often it is called", async () => {
    const { charge } = await reserveReel(db, "u1");
    const job = await chargedJob(charge);

    await Promise.all([
      refundJob(db, job),
      refundJob(db, job),
      refundJob(db, job),
    ]);

    expect((await describeUser(db, "u1")).trialAvailable).toBe(true);
  });

  it("gives a plan credit back only once", async () => {
    await subscribe();
    const { charge } = await reserveReel(db, "u1");
    const job = await chargedJob(charge);

    await refundJob(db, job);
    await refundJob(db, job);

    expect((await describeUser(db, "u1")).usedThisMonth).toBe(0);
  });
});
