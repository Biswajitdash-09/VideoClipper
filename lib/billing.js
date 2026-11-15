// Stripe is the only source of truth for who has a plan, and only a verified webhook
// writes that state. The browser can never tell us "I paid".
const users = (db) => db.collection("users");
const EVENT_TTL_SECONDS = 7 * 24 * 3600;

// Returns false when this event id was already handled (Stripe retries and duplicates).
export async function markEventSeen(db, eventId) {
  try {
    await db.collection("stripe_events").insertOne({
      _id: eventId,
      expiresAt: new Date(Date.now() + EVENT_TTL_SECONDS * 1000),
    });
    return true;
  } catch (error) {
    if (error.code === 11000) {
      return false;
    }
    throw error;
  }
}

export function forgetEvent(db, eventId) {
  return db.collection("stripe_events").deleteOne({ _id: eventId });
}

// Copies a subscription's state onto the user named in its metadata.
// Events can arrive out of order, so an older event never overwrites a newer one.
export async function applySubscriptionEvent(db, event) {
  const subscription = event.data.object;
  const userId = subscription.metadata?.userId;
  if (!userId) {
    return false;
  }

  const status =
    event.type === "customer.subscription.deleted"
      ? "canceled"
      : subscription.status;

  const { modifiedCount } = await users(db).updateOne(
    {
      _id: userId,
      $or: [
        { subscriptionEventAt: { $exists: false } },
        { subscriptionEventAt: { $lt: event.created } },
      ],
    },
    {
      $set: {
        subscriptionStatus: status,
        stripeCustomerId: subscription.customer,
        subscriptionEventAt: event.created,
      },
    },
  );
  return modifiedCount === 1;
}
