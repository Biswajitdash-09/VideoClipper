import Link from "next/link";

export const metadata = { title: "Page not found | Reelmark" };

export default function NotFound() {
  return (
    <main className="legal">
      <h1>We could not find that page</h1>
      <p>The link may be old or mistyped.</p>
      <Link href="/">Go to the home page</Link>
    </main>
  );
}
