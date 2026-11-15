import { z } from "zod";
import { REEL_LENGTHS } from "./reel-lengths.js";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);
const VIDEO_ID = /^[\w-]{11}$/;

// Returns the 11-char video id, or null. Never trust the raw URL beyond this id.
export function parseYouTubeId(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return null;
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let id;
  if (host === "youtu.be") id = url.pathname.slice(1);
  else if (url.pathname === "/watch") id = url.searchParams.get("v");
  else id = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)$/)?.[1];

  return id && VIDEO_ID.test(id) ? id : null;
}

export { REEL_LENGTHS };

export const createJobSchema = z.object({
  sourceUrl: z.string().max(300),
  start: z.number().min(0).max(86_400),
  duration: z.number().refine((seconds) => REEL_LENGTHS.includes(seconds), {
    message: "Pick a length of 10, 15, 20, 25 or 30 seconds",
  }),
  rightsConfirmed: z.literal(true, {
    message: "You must confirm you have the rights to this video",
  }),
});
