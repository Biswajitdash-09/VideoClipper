import Link from "next/link";

export const metadata = { title: "Takedown requests | Reelmark" };

// Set NEXT_PUBLIC_CONTACT_EMAIL in the environment before launch.
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

export default function Takedown() {
  return (
    <main className="legal">
      <h1>Takedown requests</h1>
      <p>
        If a video or reel on Reelmark uses your work without permission, tell
        us and we will remove it.
      </p>

      <h2>What to send</h2>
      <ul>
        <li>Your name and how to reach you.</li>
        <li>
          What the work is, and proof it is yours or that you act for the owner.
        </li>
        <li>Where you saw the reel (the link to it).</li>
      </ul>

      <h2>Where to send it</h2>
      {CONTACT ? (
        <p>
          Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We aim to reply
          within 2 working days.
        </p>
      ) : (
        <p>The contact address is not set up yet.</p>
      )}

      <Link href="/">Back to the home page</Link>
    </main>
  );
}
