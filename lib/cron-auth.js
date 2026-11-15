import { timingSafeEqual } from 'node:crypto';
import { getEnv } from './env.js';

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Constant-time compare.
export function isAuthorizedCron(request) {
  const expected = Buffer.from(`Bearer ${getEnv().CRON_SECRET}`);
  const actual = Buffer.from(request.headers.get('authorization') ?? '');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
