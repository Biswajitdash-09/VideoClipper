import { auth } from "./auth.js";
import { getDb } from "./db.js";
import { ensureUser } from "./entitlements.js";

// The signed-in user (and their database row), or null.
export async function getSessionUser() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) {
    return null;
  }

  await ensureUser(await getDb(), { id: user.id, email: user.email });
  return { id: user.id, email: user.email };
}
