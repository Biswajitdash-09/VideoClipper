import { describe, expect, it } from "vitest";
import {
  REEL_LENGTHS,
  createJobSchema,
  parseYouTubeId,
} from "../../lib/validators.js";

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
  const valid = { sourceUrl, start: 3, duration: 15, rightsConfirmed: true };

  it("requires the rights confirmation", () => {
    expect(
      createJobSchema.safeParse({ ...valid, rightsConfirmed: false }).success,
    ).toBe(false);
    expect(
      createJobSchema.safeParse({ sourceUrl, start: 3, duration: 15 }).success,
    ).toBe(false);
  });

  it("accepts a valid request", () => {
    expect(createJobSchema.safeParse(valid).success).toBe(true);
  });

  it.each(REEL_LENGTHS)("accepts a length of %s seconds", (duration) => {
    expect(createJobSchema.safeParse({ ...valid, duration }).success).toBe(
      true,
    );
  });

  it.each([0, 9, 12, 31, 60, -10, Infinity, NaN, "15", null])(
    "rejects a length of %s",
    (duration) => {
      expect(createJobSchema.safeParse({ ...valid, duration }).success).toBe(
        false,
      );
    },
  );

  it.each([-0.1, Infinity, NaN, "3", null, 1e9])(
    "rejects a start of %s",
    (start) => {
      expect(createJobSchema.safeParse({ ...valid, start }).success).toBe(
        false,
      );
    },
  );

  it("accepts a start of zero and a fractional start", () => {
    expect(createJobSchema.safeParse({ ...valid, start: 0 }).success).toBe(
      true,
    );
    expect(createJobSchema.safeParse({ ...valid, start: 7.25 }).success).toBe(
      true,
    );
  });
});
