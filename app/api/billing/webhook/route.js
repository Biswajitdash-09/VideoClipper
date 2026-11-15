import { getDb } from "../../../../lib/db.js";
import {
  applySubscriptionEvent,
  forgetEvent,
  markEventSeen,
} from "../../../../lib/billing.js";
import { getStripe } from "../../../../lib/stripe.js";

export const dynamic = "force-dynamic";

const HANDLED_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function POST(request) {
  // The signature covers the exact bytes Stripe sent, so read the raw text, not JSON.
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    return Response.json({ received: true });
  }

  const db = await getDb();
  if (!(await markEventSeen(db, event.id))) {
    return Response.json({ received: true, duplicate: true });
  }

  try {
    await applySubscriptionEvent(db, event);
  } catch (error) {
    // Let Stripe retry: forget the event so the retry is not skipped as a duplicate.
    await forgetEvent(db, event.id);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}
