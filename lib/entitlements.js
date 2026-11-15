// Who may start a reel. Every check is a single atomic Mongo update, so two requests
// at the same moment can never both spend the same free trial or the same last credit.
export const PLAN_MONTHLY_LIMIT = 30;
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

const users = (db) => db.collection("users");
const jobs = (db) => db.collection("jobs");

export function currentPeriod(date = new Date()) {
  return date.toISOString().slice(0, 7); // "2026-11"
}

export function hasActivePlan(user) {
  return ACTIVE_STATUSES.has(user?.subscriptionStatus);
}

// Safe to call on every request: creates the user once, ignores the race with a twin request.
export async function ensureUser(db, { id, email }) {
  try {
    await users(db).updateOne(
      { _id: id },
      {
        $setOnInsert: {
          email,
          trialUsed: false,
          subscriptionStatus: "none",
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }
}

// Read-only summary for the dashboard and the upload-permission check.
export async function describeUser(db, userId) {
  const user = await users(db).findOne({ _id: userId });
  const onPlan = hasActivePlan(user);
  const period = currentPeriod();
  const usedThisMonth = user?.usage?.period === period ? user.usage.count : 0;

  return {
    onPlan,
    trialAvailable: !onPlan && !user?.trialUsed,
    usedThisMonth,
    monthlyLimit: PLAN_MONTHLY_LIMIT,
    canStart: onPlan ? usedThisMonth < PLAN_MONTHLY_LIMIT : !user?.trialUsed,
  };
}

// Spends one reel. Returns { ok: true, charge } or { ok: false, reason }.
export async function reserveReel(db, userId) {
  const user = await users(db).findOne({ _id: userId });
  if (!user) {
    return { ok: false, reason: "no_user" };
  }

  if (hasActivePlan(user)) {
    const period = currentPeriod();
    // New month: reset the counter. Only one concurrent request can match this filter.
    await users(db).updateOne(
      { _id: userId, "usage.period": { $ne: period } },
      { $set: { usage: { period, count: 0 } } },
    );
    const spent = await users(db).updateOne(
      {
        _id: userId,
        "usage.period": period,
        "usage.count": { $lt: PLAN_MONTHLY_LIMIT },
      },
      { $inc: { "usage.count": 1 } },
    );
    return spent.modifiedCount
      ? { ok: true, charge: { kind: "plan", period } }
      : { ok: false, reason: "monthly_limit" };
  }

  const spent = await users(db).updateOne(
    { _id: userId, trialUsed: { $ne: true } },
    { $set: { trialUsed: true } },
  );
  return spent.modifiedCount
    ? { ok: true, charge: { kind: "trial" } }
    : { ok: false, reason: "trial_used" };
}

// Gives back what reserveReel spent.
export async function releaseReel(db, userId, charge) {
  if (charge?.kind === "trial") {
    await users(db).updateOne({ _id: userId }, { $set: { trialUsed: false } });
  }
  if (charge?.kind === "plan") {
    await users(db).updateOne(
      { _id: userId, "usage.period": charge.period, "usage.count": { $gt: 0 } },
      { $inc: { "usage.count": -1 } },
    );
  }
}

// A failed reel must not cost the user anything. The `refunded` flag makes this run once
// per job, even if the worker, the poller and the cron all notice the failure.
export async function refundJob(db, job) {
  const claimed = await jobs(db).findOneAndUpdate(
    { _id: job._id, charge: { $exists: true }, refunded: { $ne: true } },
    { $set: { refunded: true } },
  );
  if (claimed) {
    await releaseReel(db, job.userId, claimed.charge);
  }
}
