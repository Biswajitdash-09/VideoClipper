import { describe, expect, it } from "vitest";
import { pickWindow } from "../../lib/highlight/pick-window.js";
import { parseJson3 } from "../../lib/highlight/captions.js";
import { buildSrt } from "../../lib/render/crop-captions.js";

// 4s cues, back to back; every 3rd cue ends a sentence.
const cues = Array.from({ length: 30 }, (_, i) => ({
  start: i * 4,
  end: i * 4 + 4,
  text: i % 3 === 2 ? `This is sentence number ${i}.` : `word word word ${i}`,
}));

describe("pickWindow", () => {
  it("always returns 10-20s inside the video", () => {
    const { start, end } = pickWindow(cues, 120);
    expect(end - start).toBeGreaterThanOrEqual(10);
    expect(end - start).toBeLessThanOrEqual(20);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeLessThanOrEqual(120);
  });

  it("falls back to ~15s mid-video when there are no captions", () => {
    const { start, end } = pickWindow([], 600);
    expect(end - start).toBe(15);
    expect(start).toBe(180);
  });

  it("never leaves the video: short and tiny videos", () => {
    expect(pickWindow([], 12)).toEqual({ start: 0, end: 12 });
    expect(pickWindow([], 5)).toEqual({ start: 0, end: 5 });
    const { start, end } = pickWindow(cues, 40);
    expect(end).toBeLessThanOrEqual(40);
    expect(start).toBeGreaterThanOrEqual(0);
  });

  it("uses the fallback when a cue is longer than the max window", () => {
    const long = [{ start: 0, end: 60, text: "one very long cue." }];
    expect(pickWindow(long, 300).end - pickWindow(long, 300).start).toBe(15);
  });
});

describe("captions + srt", () => {
  it("parses json3 events and drops empty ones", () => {
    const json = {
      events: [
        {
          tStartMs: 1000,
          dDurationMs: 2000,
          segs: [{ utf8: "Hello " }, { utf8: "world" }],
        },
        { tStartMs: 3000, dDurationMs: 500, segs: [{ utf8: "\n" }] },
        { tStartMs: 4000 },
      ],
    };
    expect(parseJson3(json)).toEqual([
      { start: 1, end: 3, text: "Hello world" },
    ]);
  });

  it("re-times cues relative to the window start", () => {
    const srt = buildSrt([{ start: 10, end: 12.5, text: "Hi" }], {
      start: 10,
      end: 20,
    });
    expect(srt).toContain("00:00:00,000 --> 00:00:02,500");
  });

  it("clips cues that straddle the window edges", () => {
    const srt = buildSrt([{ start: 8, end: 12, text: "Edge" }], {
      start: 10,
      end: 20,
    });
    expect(srt).toContain("00:00:00,000 --> 00:00:02,000");
  });
});
