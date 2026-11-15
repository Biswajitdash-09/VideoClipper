import Link from "next/link";
import { signIn, signOut } from "../../lib/auth.js";
import { getDb } from "../../lib/db.js";
import { describeUser } from "../../lib/entitlements.js";
import { RETENTION_DAYS } from "../../lib/retention.js";
import { getSessionUser } from "../../lib/session.js";
import "./dashboard.css";
import BillingButton from "./BillingButton.js";
import ReelMaker from "./ReelMaker.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your reels | Reelmark" };

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/dashboard" });
}

async function signOutNow() {
  "use server";
  await signOut({ redirectTo: "/" });
}

async function recentReels(db, userId) {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000);
  return db
    .collection("jobs")
    .find({ userId, status: "done", finishedAt: { $gt: cutoff } })
    .sort({ finishedAt: -1 })
    .limit(5)
    .project({ result: 1, finishedAt: 1 })
    .toArray();
}

function SignedOut() {
  return (
    <main className="dash dash-narrow">
      <h1>Sign in to make your reel</h1>
      <p className="dash-lede">
        Your first reel is free. We use your Google account only to know who you
        are.
      </p>
      <form action={signInWithGoogle}>
        <button className="dash-btn" type="submit">
          Continue with Google
        </button>
      </form>
      <Link className="dash-back" href="/">
        Back to the home page
      </Link>
    </main>
  );
}

export default async function Dashboard({ searchParams }) {
  const user = await getSessionUser();
  if (!user) {
    return <SignedOut />;
  }

  const db = await getDb();
  const plan = await describeUser(db, user.id);
  const reels = await recentReels(db, user.id);
  const justUpgraded = (await searchParams).upgraded === "1";

  return (
    <main className="dash">
      <header className="dash-head">
        <Link className="dash-logo" href="/">
          Reelmark
        </Link>
        <div className="dash-user">
          <span>{user.email}</span>
          <form action={signOutNow}>
            <button className="dash-link" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <h1>Make a reel</h1>

      <section className="dash-plan" aria-label="Your plan">
        {plan.onPlan ? (
          <>
            <p>
              <strong>Pro.</strong> {plan.usedThisMonth} of {plan.monthlyLimit}{" "}
              reels used this month.
            </p>
            <BillingButton endpoint="/api/billing/portal" quiet>
              Manage plan
            </BillingButton>
          </>
        ) : (
          <>
            <p>
              {plan.trialAvailable
                ? "Your free reel is ready to use."
                : "You have used your free reel."}
            </p>
            <BillingButton endpoint="/api/billing/checkout">
              Upgrade to Pro
            </BillingButton>
          </>
        )}
      </section>
      {justUpgraded && !plan.onPlan && (
        <p className="dash-note" role="status">
          Thanks! Your plan can take a minute to switch on. Refresh in a moment.
        </p>
      )}

      <ReelMaker canStart={plan.canStart} />

      <section className="dash-recent" aria-labelledby="recent-h">
        <h2 id="recent-h">Your recent reels</h2>
        {reels.length === 0 ? (
          <p>Reels you make show up here for {RETENTION_DAYS} days.</p>
        ) : (
          <ul>
            {reels.map((reel) => (
              <li key={String(reel._id)}>
                <a href={reel.result.reelUrl} target="_blank" rel="noreferrer">
                  Reel from {reel.finishedAt.toLocaleDateString("en-GB")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
