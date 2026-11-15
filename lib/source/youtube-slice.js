import { run, YTDLP_BIN } from "../run.js";

// Downloads ONLY [start, end] of the video at <=720p. Returns the mp4 path.
export async function downloadSlice(videoId, { start, end }, dir) {
  const output = `${dir}/${videoId}-slice.mp4`;
  await run(YTDLP_BIN, [
    "--no-playlist",
    "-f",
    "bv*[height<=720]+ba/b[height<=720]",
    "--download-sections",
    `*${start.toFixed(2)}-${end.toFixed(2)}`,
    "--force-keyframes-at-cuts",
    "--merge-output-format",
    "mp4",
    "-o",
    output,
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  return output;
}
