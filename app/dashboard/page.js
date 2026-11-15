import { AuthError } from "next-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAccount, credentialsSchema } from "../../lib/accounts.js";
import { signIn, signOut } from "../../lib/auth.js";
import { getDb } from "../../lib/db.js";
import { describeUser } from "../../lib/entitlements.js";
import { hit } from "../../lib/rate-limit.js";
import { RETENTION_DAYS } from "../../lib/retention.js";
import { getSessionUser } from "../../lib/session.js";
import "./dashboard.css";
import BillingButton from "./BillingButton.js";
import ReelMaker from "./ReelMaker.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your reels | Reelmark" };

async function signInAction(formData) {
  "use server";
  await logIn(formData);
}

async function logIn(formData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/dashboard?error=signin");
    }
    throw error; // a successful sign-in redirects by throwing, so let it through
  }
}

async function signUp(formData) {
  "use server";
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/dashboard?mode=signup&error=invalid");
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim();
  const db = await getDb();
  const { allowed } = await hit(db, `signup:${ip ?? "unknown"}`, {
    limit: 5,
    windowSeconds: 3600,
  });
  if (!allowed) {
    redirect("/dashboard?mode=signup&error=slow");
  }

  const created = await createAccount(db, parsed.data);
  if (!created.ok) {
    redirect("/dashboard?mode=signup&error=exists");
  }
  await logIn(formData);
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

const ERRORS = {
  signin: "That email and password did not match. Please try again.",
  invalid: "Enter a valid email and a password of 8 to 128 characters.",
  exists: "An account with that email already exists. Try signing in.",
  slow: "Too many sign-ups from this network. Please try again later.",
};

function SignedOut({ signingUp, error }) {
  return (
    <main className="dash dash-narrow">
      <h1>{signingUp ? "Create your account" : "Sign in to make your reel"}</h1>
      <p className="dash-lede">Your first reel is free.</p>
      {ERRORS[error] && (
        <p className="dash-status" role="alert">
          {ERRORS[error]}
        </p>
      )}
      <form action={signingUp ? signUp : signInAction} className="dash-form">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            maxLength={128}
            autoComplete={signingUp ? "new-password" : "current-password"}
            required
          />
        </label>
        <button className="dash-btn" type="submit">
          {signingUp ? "Create account" : "Sign in"}
        </button>
      </form>
      <Link
        className="dash-back"
        href={signingUp ? "/dashboard" : "/dashboard?mode=signup"}
      >
        {signingUp ? "I already have an account" : "Create an account"}
      </Link>
      <Link className="dash-back" href="/">
        Back to the home page
      </Link>
    </main>
  );
}

export default async function Dashboard({ searchParams }) {
  const query = await searchParams;
  const user = await getSessionUser();
  if (!user) {
    return (
      <SignedOut signingUp={query.mode === "signup"} error={query.error} />
    );
  }

  const db = await getDb();
  const plan = await describeUser(db, user.id);
  const reels = await recentReels(db, user.id);
  const justUpgraded = query.upgraded === "1";

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
