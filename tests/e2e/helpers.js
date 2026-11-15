import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { encode } from "next-auth/jwt";
import { FFMPEG_BIN } from "../../lib/run.js";

const COOKIE = "authjs.session-token";
const AUTH_SECRET = "e2e-auth-secret-0123456789abcdef";

export async function db() {
  const client = await new MongoClient(
    "mongodb://127.0.0.1:27099/reelmark_e2e",
  ).connect();
  return { db: client.db(), close: () => client.close() };
}

// Signs in without the form: Auth.js sessions are just a signed cookie, and we know the secret.
export async function signInAs(context, { id, email }) {
  const value = await encode({
    token: { sub: id, email, name: "E2E" },
    secret: AUTH_SECRET,
    salt: COOKIE,
  });
  await context.addCookies([
    { name: COOKIE, value, domain: "localhost", path: "/" },
  ]);
}

export async function resetUser(id, fields = {}) {
  const { db: database, close } = await db();
  await database.collection("jobs").deleteMany({ userId: id });
  await database.collection("users").deleteOne({ _id: id });
  if (fields) {
    await database.collection("users").insertOne({
      _id: id,
      email: `${id}@example.com`,
      trialUsed: false,
      subscriptionStatus: "none",
      ...fields,
    });
  }
  await close();
}

// A small real video the browser can play, so the editor can read its length.
export function makeVideo(seconds) {
  const path = join(tmpdir(), `reelmark-e2e-${seconds}s.mp4`);
  execFileSync(FFMPEG_BIN, [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=320x180:rate=10:duration=${seconds}`,
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    path,
  ]);
  return path;
}
