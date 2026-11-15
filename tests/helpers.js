import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { ensureIndexes } from "../lib/db.js";

// Real MongoDB (in memory), so atomic updates and unique keys behave like production.
export async function startTestDb() {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  const db = client.db("test");
  await ensureIndexes(db);

  return {
    db,
    async stop() {
      await client.close();
      await server.stop();
    },
  };
}

export async function clearDb(db) {
  const collections = await db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}
