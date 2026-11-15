import { MongoClient } from 'mongodb';
import { getEnv } from './env.js';

const JOB_TTL_SECONDS = 30 * 24 * 3600;

// Idempotent. TTL indexes expire old jobs and rate-limit counters, so no cleanup code is needed.
export async function ensureIndexes(db) {
  await Promise.all([
    db.collection('jobs').createIndex({ status: 1, lockedUntil: 1 }),
    db.collection('jobs').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('jobs').createIndex({ createdAt: 1 }, { expireAfterSeconds: JOB_TTL_SECONDS }),
    db.collection('rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

// One client per server instance; reused across hot reloads and warm serverless invocations.
let dbPromise = globalThis.__reelmarkDb;

export function getDb() {
  dbPromise ??= globalThis.__reelmarkDb = (async () => {
    const client = await new MongoClient(getEnv().MONGODB_URI, { maxPoolSize: 5 }).connect();
    const db = client.db();
    await ensureIndexes(db);
    return db;
  })().catch((error) => {
    dbPromise = globalThis.__reelmarkDb = undefined; // allow retry after a failed connect
    throw error;
  });
  return dbPromise;
}
