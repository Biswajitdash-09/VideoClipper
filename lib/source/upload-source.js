import { run, FFMPEG_BIN, FFPROBE_BIN } from "../run.js";

// Containers a phone or editor produces. ffprobe also "reads" plain text as video (format
// "tty"), so an allowlist is the only reliable check. WebM is listed as part of "matroska".
const VIDEO_FORMATS = ["mov", "matroska", "avi", "flv", "mpegts", "mpeg"];

export async function probeDuration(filePath) {
  const output = await run(FFPROBE_BIN, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "format=format_name,duration:stream=codec_type",
    "-of",
    "json",
    filePath,
  ]);

  const info = JSON.parse(output);
  const formats = (info.format?.format_name ?? "").split(",");
  const hasVideo = info.streams?.some(
    (stream) => stream.codec_type === "video",
  );
  const seconds = parseFloat(info.format?.duration);

  if (
    !hasVideo ||
    !formats.some((format) => VIDEO_FORMATS.includes(format)) ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
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
