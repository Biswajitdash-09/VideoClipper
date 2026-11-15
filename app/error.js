"use client";

export default function ErrorPage({ reset }) {
  return (
    <main className="legal">
      <h1>Something went wrong</h1>
      <p>It is on our side. Your reels and plan are safe.</p>
      <button type="button" className="try-cta" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
