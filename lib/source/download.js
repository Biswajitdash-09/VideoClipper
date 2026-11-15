import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Streams a file to disk and aborts as soon as it passes maxBytes.
export async function downloadWithCap(url, destination, maxBytes) {
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok || !response.body) {
    throw new Error(`download failed: ${response.status}`);
  }

  let received = 0;
  async function* enforceLimit(chunks) {
    for await (const chunk of chunks) {
      received += chunk.length;
      if (received > maxBytes) {
        throw new Error("source file too large");
      }
      yield chunk;
    }
  }

  await pipeline(
    Readable.fromWeb(response.body),
    enforceLimit,
    createWriteStream(destination),
  );
}
