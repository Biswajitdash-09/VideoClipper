// Keeps Atlas's free cluster from being auto-paused (it pauses after 30 days idle).
// Cloudinary and Vercel never sleep, so only Mongo needs a heartbeat.
export async function runKeepalive(db) {
  await db.command({ ping: 1 });
  await db
    .collection("heartbeats")
    .updateOne(
      { _id: "keepalive" },
      { $set: { at: new Date() }, $inc: { runs: 1 } },
      { upsert: true },
    );
  return { mongo: "ok" };
}
