import { execFile } from "node:child_process";

// Keep the lines that explain the failure, not the tail of a banner.
const summarize = (text) =>
  (
    text
      .split(/\r?\n/)
      .filter((l) => /error/i.test(l))
      .join(" | ") || text
  ).slice(0, 500);

// Runs a binary with an argument array (no shell, so no injection). Resolves with stdout.
export function run(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: 240_000, maxBuffer: 20e6, windowsHide: true, ...options },
      (error, stdout, stderr) => {
        if (error)
          reject(
            new Error(`${bin} failed: ${summarize(stderr || error.message)}`),
          );
        else resolve(stdout);
      },
    );
  });
}

export const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";
export const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";
