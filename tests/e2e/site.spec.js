import { expect, test } from "@playwright/test";
import { resetUser, signInAs } from "./helpers.js";

test.describe("public pages", () => {
  test("landing page links to the dashboard, terms and takedown", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Captivate Crowds/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Make a Reel", exact: true }),
    ).toHaveAttribute("href", "/dashboard");

    await page.getByRole("link", { name: "Terms" }).click();
    await expect(
      page.getByRole("heading", { name: "Terms of use" }),
    ).toBeVisible();

    await page.goto("/takedown");
    await expect(
      page.getByRole("heading", { name: "Takedown requests" }),
    ).toBeVisible();
  });

  test("an unknown page shows the not-found page", async ({ page }) => {
    const response = await page.goto("/nope");
    expect(response.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /could not find that page/ }),
    ).toBeVisible();
  });

  test("signed-out dashboard asks you to sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Sign in to make your reel" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("phone width has no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ["/", "/dashboard", "/terms"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("dashboard (signed in)", () => {
  const user = { id: "e2e-user", email: "e2e-user@example.com" };

  test.beforeEach(async ({ context }) => {
    await resetUser(user.id);
    await signInAs(context, user);
  });

  test("shows the free reel and the upload form", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByText("Your free reel is ready to use."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upgrade to Pro" }),
    ).toBeVisible();
    await expect(page.getByLabel("Video file")).toBeVisible();
  });

  test("a user with no reels left sees an upgrade prompt, not the form", async ({
    page,
  }) => {
    await resetUser(user.id, { trialUsed: true });
    await page.goto("/dashboard");

    await expect(page.getByText("You have used your free reel.")).toBeVisible();
    await expect(page.getByText(/no reels left/)).toBeVisible();
    await expect(page.getByLabel("Video file")).toHaveCount(0);
  });

  test("checks the file and the rights box before uploading", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Make my reel" }).click();
    await expect(page.locator(".dash-status")).toHaveText(
      "Choose a video file first.",
    );

    await page.getByLabel("Video file").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("hello"),
    });
    await page.getByRole("button", { name: "Make my reel" }).click();
    await expect(page.locator(".dash-status")).toHaveText(
      "That file is not a video.",
    );

    await page.getByLabel("Video file").setInputFiles({
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake"),
    });
    await page.getByRole("button", { name: "Make my reel" }).click();
    await expect(page.locator(".dash-status")).toContainText(
      "Confirm you own this video",
    );
  });

  async function chooseVideo(page) {
    await page.getByLabel("Video file").setInputFiles({
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake video bytes"),
    });
    await page.getByLabel(/I own this video/).check();
    await page.getByRole("button", { name: "Make my reel" }).click();
  }

  test("upload, wait and show the finished reel (third parties mocked)", async ({
    page,
  }) => {
    await page.route("**/api/uploads/sign", (route) =>
      route.fulfill({
        json: {
          cloudName: "e2ecloud",
          apiKey: "key",
          signature: "sig",
          timestamp: 1,
          folder: "sources",
        },
      }),
    );
    await page.route("https://api.cloudinary.com/**", (route) =>
      route.fulfill({
        json: {
          secure_url:
            "https://res.cloudinary.com/e2ecloud/video/upload/v1/sources/a.mp4",
        },
      }),
    );
    await page.route("**/api/jobs", (route) =>
      route.fulfill({ status: 202, json: { id: "abc123abc123abc123abc123" } }),
    );
    let polls = 0;
    await page.route("**/api/jobs/abc123abc123abc123abc123", (route) => {
      polls++;
      route.fulfill({
        json:
          polls < 2
            ? { id: "x", status: "processing" }
            : {
                id: "x",
                status: "done",
                result: { reelUrl: "http://localhost:3100/favicon.ico" },
              },
      });
    });

    await page.goto("/dashboard");
    await chooseVideo(page);

    await expect(page.getByText(/Making your reel/)).toBeVisible();
    await expect(page.getByText("Your reel is ready.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("button", { name: "Download reel" }),
    ).toBeVisible();
    await expect(page.locator(".reel-frame video")).toBeVisible();
  });

  test("shows a clear message when the reel fails", async ({ page }) => {
    await page.route("**/api/uploads/sign", (route) =>
      route.fulfill({
        json: {
          cloudName: "e2ecloud",
          apiKey: "k",
          signature: "s",
          timestamp: 1,
          folder: "sources",
        },
      }),
    );
    await page.route("https://api.cloudinary.com/**", (route) =>
      route.fulfill({
        json: {
          secure_url:
            "https://res.cloudinary.com/e2ecloud/video/upload/v1/sources/a.mp4",
        },
      }),
    );
    await page.route("**/api/jobs", (route) =>
      route.fulfill({ status: 202, json: { id: "abc123abc123abc123abc123" } }),
    );
    await page.route("**/api/jobs/abc123abc123abc123abc123", (route) =>
      route.fulfill({ json: { id: "x", status: "failed", error: "boom" } }),
    );

    await page.goto("/dashboard");
    await chooseVideo(page);

    await expect(page.locator(".dash-status")).toContainText(
      "Your reel was not used",
      {
        timeout: 20_000,
      },
    );
  });

  test("shows the right message when the server says the trial is used", async ({
    page,
  }) => {
    await page.route("**/api/uploads/sign", (route) =>
      route.fulfill({ status: 402, json: { error: "No reels left" } }),
    );

    await page.goto("/dashboard");
    await chooseVideo(page);

    await expect(page.locator(".dash-status")).toContainText("Upgrade to Pro");
  });
});
