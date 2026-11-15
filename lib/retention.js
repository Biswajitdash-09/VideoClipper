import { deleteAssets } from "./storage/cloudinary.js";

export const RETENTION_DAYS = 7;
const BATCH_SIZE = 50; // two assets per job, and Cloudinary accepts 100 ids per call

const jobs = (db) => db.collection("jobs");

// ".../video/upload/v123/sources/abc.mp4" -> "sources/abc"
export function sourcePublicId(sourceUrl) {
  const match = new URL(sourceUrl).pathname.match(
    /\/upload\/(?:v\d+\/)?(.+)\.\w+$/,
  );
  return match?.[1];
}

function assetIdsOf(job) {
  return [sourcePublicId(job.sourceUrl), `reels/${job._id}`].filter(Boolean);
}

// Deletes the source video and reel of jobs finished more than RETENTION_DAYS ago.
// `remove` is replaceable so tests don't call Cloudinary.
export async function deleteExpiredAssets(db, remove = deleteAssets) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  const expired = await jobs(db)
    .find({ finishedAt: { $lt: cutoff }, assetsDeleted: { $ne: true } })
    .limit(BATCH_SIZE)
    .toArray();

  if (expired.length === 0) {
    return 0;
  }

  await remove(expired.flatMap(assetIdsOf));
  await jobs(db).updateMany(
    { _id: { $in: expired.map((job) => job._id) } },
    { $set: { assetsDeleted: true } },
  );
  return expired.length;
}
