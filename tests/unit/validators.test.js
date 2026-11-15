import { describe, expect, it } from "vitest";
import { createJobSchema, parseYouTubeId } from "../../lib/validators.js";

describe("parseYouTubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=UF8uR6Z6KLc", "UF8uR6Z6KLc"],
    ["https://youtu.be/aqz-KE-bpKQ", "aqz-KE-bpKQ"],
    ["https://m.youtube.com/watch?v=UF8uR6Z6KLc&t=30s", "UF8uR6Z6KLc"],
    ["https://www.youtube.com/shorts/UF8uR6Z6KLc", "UF8uR6Z6KLc"],
  ])("accepts %s", (url, id) => expect(parseYouTubeId(url)).toBe(id));

  it.each([
    "not a url",
    "file:///etc/passwd",
    "http://localhost/watch?v=UF8uR6Z6KLc",
    "https://evil.com/watch?v=UF8uR6Z6KLc",
    "https://youtube.com.evil.com/watch?v=UF8uR6Z6KLc",
    "https://user:pw@www.youtube.com/watch?v=UF8uR6Z6KLc",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=UF8uR6Z6KLc;rm -rf",
    "https://www.youtube.com/playlist?list=PL123",
  ])("rejects %s", (url) => expect(parseYouTubeId(url)).toBeNull());
});

describe("createJobSchema", () => {
  const sourceUrl =
    "https://res.cloudinary.com/demo/video/upload/sources/a.mp4";
  it("requires the rights confirmation", () => {
    expect(
      createJobSchema.safeParse({ sourceUrl, rightsConfirmed: false }).success,
    ).toBe(false);
    expect(createJobSchema.safeParse({ sourceUrl }).success).toBe(false);
  });
  it("accepts a valid request", () => {
    expect(
      createJobSchema.safeParse({ sourceUrl, rightsConfirmed: true }).success,
    ).toBe(true);
  });
});
