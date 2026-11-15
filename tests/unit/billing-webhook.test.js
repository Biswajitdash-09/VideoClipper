import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Stripe from "stripe";
import { ensureUser } from "../../lib/entitlements.js";
import { clearDb, startTestDb } from "../helpers.js";

const SECRET = "whsec_test_secret";

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
});

let testDb, db;
vi.mock("../../lib/db.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: async () => db,
}));
const { POST } = await import("../../app/api/billing/webhook/route.js");

beforeAll(async () => {
  testDb = await startTestDb();
  db = testDb.db;
}, 120_000);
afterAll(() => testDb?.stop());
beforeEach(async () => {
  await clearDb(db);
  await ensureUser(db, { id: "u1", email: "u1@example.com" });
});

const stripe = new Stripe("sk_test_dummy");

function subscriptionEvent({ id, type, status, created }) {
  return {
    id,
    object: "event",
    type,
    created,
    data: {
      object: {
        object: "subscription",
        status,
        customer: "cus_1",
        metadata: { userId: "u1" },
      },
    },
  };
}

function webhookRequest(event, { secret = SECRET } = {}) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": header },
  });
}

async function statusOf() {
  const user = await db.collection("users").findOne({ _id: "u1" });
  return user.subscriptionStatus;
}

describe("Stripe webhook", () => {
  it("rejects a forged signature and changes nothing", async () => {
    const event = subscriptionEvent({
      id: "evt_forged",
      type: "customer.subscription.created",
      status: "active",
      created: 100,
    });

    const response = await POST(
      webhookRequest(event, { secret: "whsec_wrong" }),
    );

    expect(response.status).toBe(400);
    expect(await statusOf()).toBe("none");
  });

  it("rejects a request with no signature", async () => {
    const response = await POST(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("activates the plan from a valid event", async () => {
    const event = subscriptionEvent({
      id: "evt_1",
      type: "customer.subscription.created",
      status: "active",
      created: 100,
    });

    const response = await POST(webhookRequest(event));

    expect(response.status).toBe(200);
    expect(await statusOf()).toBe("active");
  });

  it("ignores a repeated event", async () => {
    const event = subscriptionEvent({
      id: "evt_dup",
      type: "customer.subscription.created",
      status: "active",
      created: 100,
    });

    await POST(webhookRequest(event));
    const second = await POST(webhookRequest(event));

    expect((await second.json()).duplicate).toBe(true);
  });

  it("does not let an older event undo a newer one", async () => {
    const newer = subscriptionEvent({
      id: "evt_new",
      type: "customer.subscription.deleted",
      status: "canceled",
      created: 200,
    });
    const older = subscriptionEvent({
      id: "evt_old",
      type: "customer.subscription.updated",
      status: "active",
      created: 100,
    });

    await POST(webhookRequest(newer));
    await POST(webhookRequest(older));

    expect(await statusOf()).toBe("canceled");
  });

  it("ignores event types it does not handle", async () => {
    const response = await POST(
      webhookRequest({
        id: "evt_x",
        object: "event",
        type: "invoice.paid",
        created: 1,
        data: { object: {} },
      }),
    );

    expect(response.status).toBe(200);
    expect(await statusOf()).toBe("none");
  });
});
