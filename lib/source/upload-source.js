import { run, FFMPEG_BIN, FFPROBE_BIN } from "../run.js";

export async function probeDuration(filePath) {
  const output = await run(FFPROBE_BIN, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    filePath,
  ]);

  const seconds = parseFloat(output);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("not a playable video");
  }
  return seconds;
}

// Cuts [start, end] out of an uploaded file. Same contract as youtube-slice's downloadSlice.
export async function sliceUpload(filePath, { start, end }, dir) {
  const output = `${dir}/upload-slice.mp4`;

  await run(FFMPEG_BIN, [
    "-y",
    "-ss",
    start.toFixed(2),
    "-i",
    filePath,
    "-t",
    (end - start).toFixed(2),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    output,
  ]);

  return output;
}
