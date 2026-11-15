import { z } from 'zod';

const schema = z.object({
  MONGODB_URI: z.string().min(1),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),
  CLOUDINARY_URL: z.string().optional(), // required from Phase 2
});

let cached;
// Validated lazily so `next build` doesn't need secrets.
export function getEnv() {
  return (cached ??= schema.parse(process.env));
}
