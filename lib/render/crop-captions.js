import { writeFile } from "node:fs/promises";
import { run, FFMPEG_BIN } from "../run.js";

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, "0");
function srtTime(sec) {
  const ms = Math.round((sec % 1) * 1000);
  return `${pad(sec / 3600)}:${pad((sec % 3600) / 60)}:${pad(sec % 60)},${pad(ms, 3)}`;
}

// Cues that overlap the window, re-timed so 0 = window start.
export function buildSrt(cues, { start, end }) {
  return cues
    .filter((c) => c.end > start && c.start < end)
    .map(
      (c, i) =>
        `${i + 1}\n${srtTime(Math.max(c.start, start) - start)} --> ${srtTime(Math.min(c.end, end) - start)}\n${c.text}\n`,
    )
    .join("\n");
}

// 9:16 centre crop at 720x1280 with burned-in captions. Zero Cloudinary transformations.
export async function renderReel({ slicePath, cues, window, dir, outputName }) {
  await writeFile(`${dir}/captions.srt`, buildSrt(cues, window));
  const style =
    "FontName=Arial,FontSize=14,Bold=1,Outline=2,Alignment=2,MarginV=90";
  // cwd = dir keeps the subtitles path relative (avoids Windows drive-letter escaping)
  await run(
    FFMPEG_BIN,
    [
      "-y",
      "-i",
      slicePath,
      "-vf",
      `crop='min(iw,ih*9/16)':ih,scale=720:1280,subtitles=captions.srt:force_style='${style}'`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      outputName,
    ],
    { cwd: dir },
  );
  return `${dir}/${outputName}`;
}
