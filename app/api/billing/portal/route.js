import { getDb } from "../../../../lib/db.js";
import { getSessionUser } from "../../../../lib/session.js";
import { appUrl, getStripe } from "../../../../lib/stripe.js";

export const dynamic = "force-dynamic";

// Lets a subscriber manage or cancel their plan on Stripe's own page.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  const db = await getDb();
  const row = await db.collection("users").findOne({ _id: user.id });
  if (!row?.stripeCustomerId) {
    return Response.json({ error: "No subscription" }, { status: 404 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${appUrl()}/dashboard`,
  });
  return Response.json({ url: session.url });
}
