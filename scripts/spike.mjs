// Phase 0 spike: node scripts/spike.mjs <youtube-url> [...more urls]
// Measures: captions availability, chosen window, slice+render time, output size.
import { mkdir, stat } from "node:fs/promises";
import { parseYouTubeId } from "../lib/validators.js";
import { fetchCaptions } from "../lib/highlight/captions.js";
import { pickWindow } from "../lib/highlight/pick-window.js";
import { downloadSlice } from "../lib/source/youtube-slice.js";
import { renderReel } from "../lib/render/crop-captions.js";

for (const url of process.argv.slice(2)) {
  const id = parseYouTubeId(url);
  if (!id) {
    console.log(`SKIP invalid url: ${url}`);
    continue;
  }
  const dir = `tmp/${id}`;
  await mkdir(dir, { recursive: true });
  const t0 = Date.now();
  try {
    const { duration, cues } = await fetchCaptions(id, dir);
    const window = pickWindow(cues, duration);
    const t1 = Date.now();
    const slicePath = await downloadSlice(id, window, dir);
    const t2 = Date.now();
    const out = await renderReel({
      slicePath,
      cues,
      window,
      dir,
      outputName: `${id}-reel.mp4`,
    });
    const t3 = Date.now();
    const { size } = await stat(out);
    console.log(
      JSON.stringify({
        id,
        ok: true,
        duration,
        cues: cues.length,
        window: [window.start.toFixed(1), window.end.toFixed(1)],
        sec: {
          captions: (t1 - t0) / 1000,
          download: (t2 - t1) / 1000,
          render: (t3 - t2) / 1000,
        },
        sizeMB: +(size / 1e6).toFixed(2),
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({ id, ok: false, error: e.message.slice(0, 300) }),
    );
  }
}
