import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ObjectId } from "mongodb";
import { ensureUser } from "../../lib/entitlements.js";
import { clearDb, startTestDb } from "../helpers.js";

vi.hoisted(() => {
  process.env.CLOUDINARY_URL = "cloudinary://key:secret@democloud";
});

let testDb, db;
let currentUser = null;
const deleteAssets = vi.fn();

vi.mock("../../lib/db.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: async () => db,
}));
vi.mock("../../lib/session.js", () => ({
  getSessionUser: async () => currentUser,
}));
vi.mock("../../lib/storage/cloudinary.js", async (importOriginal) => ({
  ...(await importOriginal()),
  deleteAssets: (...args) => deleteAssets(...args),
}));

const { GET: download } =
  await import("../../app/api/jobs/[id]/download/route.js");

const alice = { id: "alice", email: "alice@example.com" };
const bob = { id: "bob", email: "bob@example.com" };

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
}, 120_000);
afterAll(() => testDb?.stop());
beforeEach(async () => {
  await clearDb(db);
  deleteAssets.mockReset();
  vi.unstubAllGlobals();
  currentUser = alice;
  await ensureUser(db, alice);
  await ensureUser(db, bob);
});

async function doneJob(fields = {}) {
  const { insertedId } = await db.collection("jobs").insertOne({
    userId: "alice",
    status: "done",
    ...fields,
  });
  return String(insertedId);
}

function ask(id) {
  return download(new Request("http://localhost/x"), {
    params: Promise.resolve({ id }),
  });
}

function stubReel(body = "reel-bytes", status = 200) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GET /api/jobs/[id]/download", () => {
  it("requires a signed-in user", async () => {
    const id = await doneJob();
    currentUser = null;
    expect((await ask(id)).status).toBe(401);
  });

  it("returns 404 for a malformed id", async () => {
    expect((await ask("../etc/passwd")).status).toBe(404);
  });

  it("hides one user's reel from another user", async () => {
    const id = await doneJob();
    currentUser = bob;
    const fetchMock = stubReel();

    expect((await ask(id)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a reel that is not finished", async () => {
    const id = await doneJob({ status: "processing" });
    expect((await ask(id)).status).toBe(404);
  });

  it("returns 404 for a job that does not exist", async () => {
    expect((await ask(String(new ObjectId()))).status).toBe(404);
  });

  it("streams the reel as a download, then deletes it", async () => {
    const id = await doneJob();
    const fetchMock = stubReel();

    const response = await ask(id);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.text()).toBe("reel-bytes");
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://res.cloudinary.com/democloud/video/upload/reels/${id}.mp4`,
    );
    expect(deleteAssets).toHaveBeenCalledWith([`reels/${id}`]);
    const job = await db.collection("jobs").findOne({ _id: new ObjectId(id) });
    expect(job.reelDeleted).toBe(true);
  });

  it("does not delete the reel until the whole file has been sent", async () => {
    const id = await doneJob();
    stubReel();

    const response = await ask(id);

    expect(deleteAssets).not.toHaveBeenCalled();
    await response.arrayBuffer();
    expect(deleteAssets).toHaveBeenCalledTimes(1);
  });

  it("refuses a second download", async () => {
    const id = await doneJob({ reelDeleted: true });
    const fetchMock = stubReel();

    expect((await ask(id)).status).toBe(410);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says the reel is gone when Cloudinary no longer has it", async () => {
    const id = await doneJob();
    stubReel("not found", 404);

    expect((await ask(id)).status).toBe(410);
    expect(deleteAssets).not.toHaveBeenCalled();
  });

  it("still delivers the reel when the cleanup fails", async () => {
    const id = await doneJob();
    stubReel();
    deleteAssets.mockRejectedValue(new Error("cloudinary down"));

    const response = await ask(id);

    expect(await response.text()).toBe("reel-bytes");
  });
});
