import { z } from "zod";

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

export const createJobSchema = z.object({
  url: z
    .string()
    .max(300)
    .refine((u) => parseYouTubeId(u) !== null, "Not a valid YouTube link"),
  rightsConfirmed: z.literal(true, {
    message: "You must confirm you have the rights to this video",
  }),
});
