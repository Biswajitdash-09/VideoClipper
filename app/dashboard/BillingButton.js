"use client";
import { useState } from "react";

// Asks the server for a Stripe page (checkout or plan management) and goes there.
export default function BillingButton({ endpoint, quiet, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.url) {
        throw new Error(body.error || "failed");
      }
      window.location.assign(body.url);
    } catch {
      setError("Could not open the billing page. Try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={quiet ? "dash-btn dash-btn-quiet" : "dash-btn"}
        onClick={go}
        disabled={busy}
      >
        {busy ? "Opening…" : children}
      </button>
      {error && (
        <p className="dash-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
