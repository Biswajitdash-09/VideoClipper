import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { deleteExpiredAssets, RETENTION_DAYS } from "../../lib/retention.js";
import { clearDb, startTestDb } from "../helpers.js";

let testDb, db;
beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
}, 120_000);
afterAll(() => testDb?.stop());
beforeEach(() => clearDb(db));

const daysAgo = (days) => new Date(Date.now() - days * 24 * 3600 * 1000);
const SOURCE =
  "https://res.cloudinary.com/demo/video/upload/v123/sources/abc.mp4";

describe("deleteExpiredAssets", () => {
  it("deletes the source and reel of old jobs, once", async () => {
    const { insertedId } = await db.collection("jobs").insertOne({
      sourceUrl: SOURCE,
      status: "done",
      finishedAt: daysAgo(RETENTION_DAYS + 1),
    });
    const remove = vi.fn();

    expect(await deleteExpiredAssets(db, remove)).toBe(1);
    expect(remove).toHaveBeenCalledWith(["sources/abc", `reels/${insertedId}`]);

    expect(await deleteExpiredAssets(db, remove)).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("keeps recent and unfinished jobs", async () => {
    await db.collection("jobs").insertMany([
      { sourceUrl: SOURCE, status: "done", finishedAt: daysAgo(1) },
      { sourceUrl: SOURCE, status: "processing", finishedAt: null },
    ]);
    const remove = vi.fn();

    expect(await deleteExpiredAssets(db, remove)).toBe(0);
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not mark jobs as cleaned when the deletion fails", async () => {
    await db.collection("jobs").insertOne({
      sourceUrl: SOURCE,
      status: "failed",
      finishedAt: daysAgo(RETENTION_DAYS + 1),
    });
    const remove = vi.fn().mockRejectedValue(new Error("cloudinary down"));

    await expect(deleteExpiredAssets(db, remove)).rejects.toThrow();
    expect(await deleteExpiredAssets(db, vi.fn())).toBe(1);
  });
});
