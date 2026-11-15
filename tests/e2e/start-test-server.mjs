// Starts an in-memory MongoDB and a production build of the app wired to it, with fake
// third-party keys. Playwright runs this as its web server. No real service is contacted.
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

export const MONGO_PORT = 27099;
export const APP_PORT = 3100;

const mongo = await MongoMemoryServer.create({
  instance: { port: MONGO_PORT },
});

const env = {
  ...process.env,
  PORT: String(APP_PORT),
  MONGODB_URI: `${mongo.getUri()}reelmark_e2e`,
  CRON_SECRET: "e2e-cron-secret-0123456789",
  CLOUDINARY_URL: "cloudinary://key:secret@e2ecloud",
  AUTH_SECRET: "e2e-auth-secret-0123456789abcdef",
  AUTH_GOOGLE_ID: "fake",
  AUTH_GOOGLE_SECRET: "fake",
  AUTH_TRUST_HOST: "true",
  APP_URL: `http://localhost:${APP_PORT}`,
  STRIPE_SECRET_KEY: "sk_test_dummy",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e",
  STRIPE_PRICE_ID: "price_fake",
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const build = spawn(npx, ["next", "build"], {
  env,
  stdio: "inherit",
  shell: true,
});
build.on("exit", (code) => {
  if (code !== 0) {
    process.exit(code);
  }
  const server = spawn(npx, ["next", "start", "-p", String(APP_PORT)], {
    env,
    stdio: "inherit",
    shell: true,
  });
  const shutdown = async () => {
    server.kill();
    await mongo.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
