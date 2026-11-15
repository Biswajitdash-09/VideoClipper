import { expect, test } from "@playwright/test";

test.describe("security", () => {
  test("pages send security headers and a CSP", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["content-security-policy"]).toContain("object-src 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age");
  });

  test("API routes refuse signed-out callers", async ({ request }) => {
    expect((await request.post("/api/uploads/sign")).status()).toBe(401);
    expect(
      (
        await request.post("/api/jobs", {
          data: {
            sourceUrl:
              "https://res.cloudinary.com/e2ecloud/video/upload/sources/a.mp4",
            rightsConfirmed: true,
          },
        })
      ).status(),
    ).toBe(401);
    expect(
      (await request.get("/api/jobs/64b7f0f0f0f0f0f0f0f0f0f0")).status(),
    ).toBe(401);
    expect((await request.post("/api/billing/checkout")).status()).toBe(401);
    expect((await request.post("/api/billing/portal")).status()).toBe(401);
  });

  test("cron routes need the secret", async ({ request }) => {
    for (const path of ["/api/cron/keepalive", "/api/cron/recover"]) {
      expect((await request.get(path)).status()).toBe(401);
      expect(
        (
          await request.get(path, {
            headers: { authorization: "Bearer wrong-secret" },
          })
        ).status(),
      ).toBe(401);
    }
  });

  test("the keepalive cron works with the right secret", async ({
    request,
  }) => {
    const response = await request.get("/api/cron/keepalive", {
      headers: { authorization: "Bearer e2e-cron-secret-0123456789" },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ mongo: "ok" });
  });

  test("a forged Stripe webhook is rejected", async ({ request }) => {
    const response = await request.post("/api/billing/webhook", {
      data: { id: "evt_fake", type: "customer.subscription.created" },
      headers: { "stripe-signature": "t=1,v1=forged" },
    });
    expect(response.status()).toBe(400);
  });
});
