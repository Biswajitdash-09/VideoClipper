// Upload-first spike: node scripts/spike-upload.mjs <video-file>
// Uploads have no captions (no speech-to-text yet), so the window is the fallback pick.
import { mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pickWindow } from "../lib/highlight/pick-window.js";
import { probeDuration, sliceUpload } from "../lib/source/upload-source.js";
import { renderReel } from "../lib/render/crop-captions.js";

const file = process.argv[2];
// renderReel runs with cwd = dir, so the path must be absolute.
const dir = resolve("tmp/upload");
await mkdir(dir, { recursive: true });

const startedAt = Date.now();
const duration = await probeDuration(file);
const window = pickWindow([], duration);
const slicePath = await sliceUpload(file, window, dir);
const reelPath = await renderReel({
  slicePath,
  cues: [],
  window,
  dir,
  outputName: "reel.mp4",
});
const { size } = await stat(reelPath);

console.log(
  JSON.stringify({
    ok: true,
    duration,
    window,
    sec: (Date.now() - startedAt) / 1000,
    sizeMB: +(size / 1e6).toFixed(2),
  }),
);
