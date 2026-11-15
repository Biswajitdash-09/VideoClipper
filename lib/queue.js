// Mongo-backed job queue. No external queue service (saves free-tier quota).
// Lifecycle: queued -> processing -> done | failed. A crashed worker's lock expires and
// the job is picked up again, up to MAX_ATTEMPTS.
export const MAX_ATTEMPTS = 3;
export const LOCK_MS = 5 * 60_000; // a bit over the 300s function limit

const jobs = (db) => db.collection('jobs');

export async function enqueueJob(db, { userId, videoId }) {
  const job = { userId, videoId, status: 'queued', attempts: 0, lockedUntil: null, createdAt: new Date() };
  const { insertedId } = await jobs(db).insertOne(job);
  return { ...job, _id: insertedId };
}

// Atomically claims one job (a specific one if jobId is given). Returns null if none is available.
export function claimJob(db, jobId) {
  const now = new Date();
  const claimable = {
    $or: [
      { status: 'queued' },
      { status: 'processing', lockedUntil: { $lt: now } }, // lock expired => worker died
    ],
    attempts: { $lt: MAX_ATTEMPTS },
    ...(jobId && { _id: jobId }),
  };
  return jobs(db).findOneAndUpdate(
    claimable,
    { $set: { status: 'processing', lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
}

// Only the current lock holder may finish a job (status guard prevents double completion).
export function completeJob(db, jobId, result) {
  return jobs(db).updateOne(
    { _id: jobId, status: 'processing' },
    { $set: { status: 'done', result, lockedUntil: null, finishedAt: new Date() } },
  );
}

export function failJob(db, jobId, error) {
  return jobs(db).updateOne(
    { _id: jobId, status: 'processing' },
    { $set: { status: 'failed', error: String(error).slice(0, 300), lockedUntil: null, finishedAt: new Date() } },
  );
}

// Used by the daily recover cron: jobs that ran out of attempts are failed for good.
export async function failExhaustedJobs(db) {
  const { modifiedCount } = await jobs(db).updateMany(
    { status: 'processing', lockedUntil: { $lt: new Date() }, attempts: { $gte: MAX_ATTEMPTS } },
    { $set: { status: 'failed', error: 'Too many attempts', lockedUntil: null, finishedAt: new Date() } },
  );
  return modifiedCount;
}
