import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ensureUser, describeUser } from "../../lib/entitlements.js";
import { clearDb, startTestDb } from "../helpers.js";

vi.hoisted(() => {
  process.env.CLOUDINARY_URL = "cloudinary://key:secret@democloud";
  process.env.GLOBAL_DAILY_LIMIT = "3";
});

let testDb, db;
let currentUser = null;
const afterCallbacks = [];

vi.mock("../../lib/db.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: async () => db,
}));
vi.mock("../../lib/session.js", () => ({
  getSessionUser: async () => currentUser,
}));
vi.mock("next/server", () => ({
  after: (callback) => afterCallbacks.push(callback),
}));
vi.mock("../../lib/process-job.js", () => ({ processJob: vi.fn() }));

const { POST: createJob } = await import("../../app/api/jobs/route.js");
const { GET: getJob } = await import("../../app/api/jobs/[id]/route.js");
const { POST: signUpload } =
  await import("../../app/api/uploads/sign/route.js");

const SOURCE =
  "https://res.cloudinary.com/democloud/video/upload/v1/sources/a.mp4";
const alice = { id: "alice", email: "alice@example.com" };
const bob = { id: "bob", email: "bob@example.com" };

function jobRequest(body) {
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  sourceUrl: SOURCE,
  start: 5,
  duration: 15,
  rightsConfirmed: true,
};

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
}, 120_000);
afterAll(() => testDb?.stop());
beforeEach(async () => {
  await clearDb(db);
  afterCallbacks.length = 0;
  currentUser = null;
  await ensureUser(db, alice);
  await ensureUser(db, bob);
});

describe("POST /api/jobs", () => {
  it("requires a signed-in user", async () => {
    const response = await createJob(jobRequest(validBody));
    expect(response.status).toBe(401);
  });

  it("rejects a source that is not our own Cloudinary upload", async () => {
    currentUser = alice;
    const response = await createJob(
      jobRequest({
        sourceUrl: "http://169.254.169.254/latest/meta-data",
        rightsConfirmed: true,
      }),
    );

    expect(response.status).toBe(400);
    expect((await describeUser(db, "alice")).trialAvailable).toBe(true);
  });

  it("requires the rights confirmation", async () => {
    currentUser = alice;
    const response = await createJob(
      jobRequest({ sourceUrl: SOURCE, rightsConfirmed: false }),
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["a length that is not offered", { duration: 12 }],
    ["a length over 30 seconds", { duration: 60 }],
    ["a negative start", { start: -1 }],
    ["a start that is not a number", { start: "5" }],
    ["no start", { start: undefined }],
    ["no length", { duration: undefined }],
  ])("rejects %s and keeps the trial", async (_name, change) => {
    currentUser = alice;
    const response = await createJob(jobRequest({ ...validBody, ...change }));

    expect(response.status).toBe(400);
    expect((await describeUser(db, "alice")).trialAvailable).toBe(true);
  });

  it("saves the user's start and length on the job", async () => {
    currentUser = alice;
    await createJob(jobRequest({ ...validBody, start: 12.5, duration: 20 }));

    const job = await db.collection("jobs").findOne({});
    expect(job).toMatchObject({ start: 12.5, duration: 20 });
  });

  it("starts the first reel and blocks the second trial reel", async () => {
    currentUser = alice;

    const first = await createJob(jobRequest(validBody));
    expect(first.status).toBe(202);
    expect(afterCallbacks).toHaveLength(1);

    const second = await createJob(jobRequest(validBody));
    expect(second.status).toBe(402);
    expect(await db.collection("jobs").countDocuments({})).toBe(1);
  });

  it("gives one trial reel to simultaneous double-submits", async () => {
    currentUser = alice;
    const responses = await Promise.all([
      createJob(jobRequest(validBody)),
      createJob(jobRequest(validBody)),
      createJob(jobRequest(validBody)),
    ]);

    expect(responses.filter((r) => r.status === 202)).toHaveLength(1);
    expect(await db.collection("jobs").countDocuments({})).toBe(1);
  });

  it("stops everyone at the global daily limit and keeps the trial", async () => {
    // GLOBAL_DAILY_LIMIT is 3: three different users use it up.
    for (const id of ["u1", "u2", "u3"]) {
      await ensureUser(db, { id, email: `${id}@example.com` });
      currentUser = { id, email: `${id}@example.com` };
      expect((await createJob(jobRequest(validBody))).status).toBe(202);
    }

    currentUser = alice;
    const response = await createJob(jobRequest(validBody));

    expect(response.status).toBe(503);
    expect((await describeUser(db, "alice")).trialAvailable).toBe(true);
  });
});

describe("GET /api/jobs/[id]", () => {
  async function aliceJob() {
    currentUser = alice;
    const created = await createJob(jobRequest(validBody));
    return (await created.json()).id;
  }

  it("requires a signed-in user", async () => {
    const id = await aliceJob();
    currentUser = null;
    const response = await getJob(new Request("http://localhost/x"), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(401);
  });

  it("shows a user their own job", async () => {
    const id = await aliceJob();
    const response = await getJob(new Request("http://localhost/x"), {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("queued");
    expect(body).not.toHaveProperty("result");
  });

  it("hides one user's job from another user", async () => {
    const id = await aliceJob();
    currentUser = bob;
    const response = await getJob(new Request("http://localhost/x"), {
      params: Promise.resolve({ id }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a malformed id", async () => {
    currentUser = alice;
    const response = await getJob(new Request("http://localhost/x"), {
      params: Promise.resolve({ id: "../etc/passwd" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/uploads/sign", () => {
  it("requires a signed-in user", async () => {
    expect((await signUpload()).status).toBe(401);
  });

  it("signs for a user with a reel left", async () => {
    currentUser = alice;
    const response = await signUpload();
    expect(response.status).toBe(200);
    expect((await response.json()).cloudName).toBe("democloud");
  });

  it("refuses a user whose trial is already used", async () => {
    currentUser = alice;
    await createJob(jobRequest(validBody));
    expect((await signUpload()).status).toBe(402);
  });
});
