import { expect, test } from "@playwright/test";
import { makeVideo, resetUser, signInAs } from "./helpers.js";

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

  const JOB_ID = "abc123abc123abc123abc123";

  async function mockUpload(page) {
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
  }

  // Records what the browser asks the server to make, and answers like a job.
  // `downloads` is a list of answers for successive download requests (the last repeats).
  async function mockJob(page, { status = "done", downloads } = {}) {
    const asked = { downloads: 0 };
    const reel = {
      contentType: "video/mp4",
      body: Buffer.from("reel bytes"),
    };
    await page.route("**/api/jobs", async (route) => {
      asked.body = route.request().postDataJSON();
      await route.fulfill({ status: 202, json: { id: JOB_ID } });
    });
    await page.route(`**/api/jobs/${JOB_ID}`, (route) =>
      route.fulfill({ json: { id: JOB_ID, status } }),
    );
    await page.route(`**/api/jobs/${JOB_ID}/download`, (route) => {
      const answers = downloads ?? [reel];
      const answer = answers[Math.min(asked.downloads, answers.length - 1)];
      asked.downloads++;
      return route.fulfill(answer);
    });
    return asked;
  }

  async function chooseVideo(page, file) {
    await page.getByLabel("Video file").setInputFiles(
      file ?? {
        name: "clip.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("fake video bytes"),
      },
    );
    await page.getByLabel(/I own this video/).check();
  }

  const makeMyReel = (page) =>
    page.getByRole("button", { name: "Make my reel" }).click();

  test("trim: pick a start and a length, and the server gets exactly that", async ({
    page,
  }) => {
    await mockUpload(page);
    const asked = await mockJob(page);
    await page.goto("/dashboard");
    await chooseVideo(page, makeVideo(40));

    await expect(page.locator(".trim-length")).toHaveText([
      "10 s",
      "15 s",
      "20 s",
      "25 s",
      "30 s",
    ]);
    await expect(page.locator(".trim-range")).toHaveText("0:00.0 to 0:15.0");

    await page.getByRole("button", { name: "20 s" }).click();
    await page.getByLabel("Start of your reel").fill("12");
    await expect(page.locator(".trim-range")).toHaveText("0:12.0 to 0:32.0");

    await makeMyReel(page);
    await expect(page.getByText(/Your reel is ready/)).toBeVisible({
      timeout: 20_000,
    });
    expect(asked.body).toMatchObject({ start: 12, duration: 20 });
  });

  test("trim: shows the vertical crop, and no console errors from the player", async ({
    page,
  }) => {
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/dashboard");
    await expect(page.getByText(/What your reel will show/)).toHaveCount(0);

    await chooseVideo(page, makeVideo(40));

    await expect(page.getByText(/What your reel will show/)).toBeVisible();
    await expect(page.locator(".reel-frame video")).toBeVisible();
    // The track highlights 15 of 40 seconds, and moves when the start moves.
    const track = page.locator(".trim-track");
    await expect(track).toHaveCSS("--span", "37.5%");
    await page.getByLabel("Start of your reel").fill("10");
    await expect(track).toHaveCSS("--from", "25%");
    expect(errors).toEqual([]);
  });

  test("trim: a file the browser cannot preview shows no crop preview", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await chooseVideo(page);

    await expect(page.getByText(/cannot preview this file/)).toBeVisible();
    await expect(page.getByText(/What your reel will show/)).toHaveCount(0);
  });

  test("trim: a longer reel moves the start back so it still fits", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await chooseVideo(page, makeVideo(40));
    await page.getByRole("button", { name: "10 s" }).click();
    await page.getByLabel("Start of your reel").fill("30");
    await expect(page.locator(".trim-range")).toHaveText("0:30.0 to 0:40.0");

    await page.getByRole("button", { name: "30 s" }).click();

    await expect(page.locator(".trim-range")).toHaveText("0:10.0 to 0:40.0");
  });

  test("trim: lengths longer than the video are not offered", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await chooseVideo(page, makeVideo(22));

    await expect(page.getByRole("button", { name: "20 s" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "15 s" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "25 s" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "30 s" })).toBeDisabled();
  });

  test("trim: a video shorter than 10 seconds cannot be used", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await chooseVideo(page, makeVideo(6));

    await expect(
      page.getByRole("alert").filter({ hasText: "shorter than 10 seconds" }),
    ).toBeVisible();
    await makeMyReel(page);
    await expect(page.locator(".dash-status")).toContainText("6 seconds long");
  });

  test("trim: a file the browser cannot preview still works, from the start", async ({
    page,
  }) => {
    await mockUpload(page);
    const asked = await mockJob(page);
    await page.goto("/dashboard");
    await chooseVideo(page);

    await expect(page.getByText(/cannot preview this file/)).toBeVisible();
    await page.getByRole("button", { name: "25 s" }).click();
    await makeMyReel(page);

    await expect(page.getByText(/Your reel is ready/)).toBeVisible({
      timeout: 20_000,
    });
    expect(asked.body).toMatchObject({ start: 0, duration: 25 });
  });

  test("shows the finished reel, with a Download link and no saved list", async ({
    page,
  }) => {
    await mockUpload(page);
    const asked = await mockJob(page);
    await page.goto("/dashboard");
    await chooseVideo(page);
    await makeMyReel(page);

    await expect(page.getByText(/Making your reel/)).toBeVisible();
    await expect(page.getByText(/Your reel is ready/)).toBeVisible({
      timeout: 20_000,
    });
    const link = page.getByRole("link", { name: "Download reel" });
    await expect(link).toHaveAttribute("download", "reel.mp4");
    await expect(link).toHaveAttribute("href", /^blob:/);
    await expect(page.locator(".reel-frame video")).toBeVisible();
    await expect(page.getByText("Your recent reels")).toHaveCount(0);
    expect(asked.downloads).toBe(1);
  });

  test("a reel that was already downloaded says so", async ({ page }) => {
    await mockUpload(page);
    await mockJob(page, {
      downloads: [{ status: 410, json: { error: "Already downloaded" } }],
    });
    await page.goto("/dashboard");
    await chooseVideo(page);
    await makeMyReel(page);

    await expect(page.locator(".dash-status")).toContainText(
      "already downloaded",
      { timeout: 20_000 },
    );
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );
  });

  test("a broken download can be retried and then works", async ({ page }) => {
    await mockUpload(page);
    const asked = await mockJob(page, {
      downloads: [
        { status: 500, json: { error: "boom" } },
        { contentType: "video/mp4", body: Buffer.from("reel bytes") },
      ],
    });
    await page.goto("/dashboard");
    await chooseVideo(page);
    await makeMyReel(page);

    await expect(page.locator(".dash-status")).toContainText(
      "could not be loaded",
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Try again" }).click();

    await expect(page.getByText(/Your reel is ready/)).toBeVisible();
    expect(asked.downloads).toBe(2);
  });

  test("shows a clear message when the reel fails", async ({ page }) => {
    await mockUpload(page);
    await mockJob(page, { status: "failed" });
    await page.goto("/dashboard");
    await chooseVideo(page);
    await makeMyReel(page);

    await expect(page.locator(".dash-status")).toContainText(
      "Your reel was not used",
      { timeout: 20_000 },
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
    await makeMyReel(page);

    await expect(page.locator(".dash-status")).toContainText("Upgrade to Pro");
  });
});
