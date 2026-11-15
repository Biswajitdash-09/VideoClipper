import { getDb } from "../../../../lib/db.js";
import { describeUser } from "../../../../lib/entitlements.js";
import { rateLimitResponse } from "../../../../lib/request-info.js";
import { getSessionUser } from "../../../../lib/session.js";
import { appUrl, getStripe } from "../../../../lib/stripe.js";

export const dynamic = "force-dynamic";

// Starts a Stripe Checkout for the Pro plan and returns its URL.
export async function POST(request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Sign in first" }, { status: 401 });
  }

  const limited = await rateLimitResponse(`checkout:${user.id}`, 10, 3600);
  if (limited) {
    return limited;
  }

  const db = await getDb();
  if ((await describeUser(db, user.id)).onPlan) {
    return Response.json({ error: "Already subscribed" }, { status: 409 });
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    customer_email: user.email,
    client_reference_id: user.id,
    // The webhook finds the user through this metadata.
    subscription_data: { metadata: { userId: user.id } },
    success_url: `${appUrl()}/dashboard?upgraded=1`,
    cancel_url: `${appUrl()}/dashboard`,
  });

  return Response.json({ url: session.url });
}
