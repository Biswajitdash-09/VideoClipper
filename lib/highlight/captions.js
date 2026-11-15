import { readdir, readFile } from "node:fs/promises";
import { run, YTDLP_BIN } from "../run.js";

// YouTube "json3" captions -> [{ start, end, text }] in seconds.
export function parseJson3(json) {
  return (json.events ?? [])
    .filter((e) => e.segs && e.dDurationMs)
    .map((e) => ({
      start: e.tStartMs / 1000,
      end: (e.tStartMs + e.dDurationMs) / 1000,
      text: e.segs
        .map((s) => s.utf8)
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((c) => c.text);
}

// Fetches captions + video duration without downloading any media.
export async function fetchCaptions(videoId, dir) {
  const stdout = await run(YTDLP_BIN, [
    "--skip-download",
    "--no-playlist",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    "en.*,en",
    "--sub-format",
    "json3",
    "--print",
    "duration",
    "-o",
    `${dir}/%(id)s`,
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  const duration = Number(stdout.trim().split("\n").pop());
  const file = (await readdir(dir)).find(
    (f) => f.startsWith(videoId) && f.endsWith(".json3"),
  );
  const cues = file
    ? parseJson3(JSON.parse(await readFile(`${dir}/${file}`, "utf8")))
    : [];
  return { duration, cues };
}
