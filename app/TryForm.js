"use client";
import { useState } from "react";

const HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];

// Light client-side check. The real validation (strict, server-side) lives in the backend branch.
function isYouTubeLink(value) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      HOSTS.includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

// Reel creation itself isn't wired up yet.
export default function TryForm() {
  const [message, setMessage] = useState({ kind: "", text: "" });

  function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!isYouTubeLink(String(form.get("url")).trim())) {
      setMessage({
        kind: "error",
        text: "Paste a full YouTube link, like https://www.youtube.com/watch?v=…",
      });
      return;
    }
    if (form.get("rights") !== "on") {
      setMessage({
        kind: "error",
        text: "Confirm you own this video or have permission to use it.",
      });
      return;
    }
    setMessage({
      kind: "ok",
      text: "That link works. Reel creation opens soon, accounts are not live yet.",
    });
  }

  return (
    <form className="try-form" onSubmit={onSubmit} noValidate>
      <label htmlFor="url">YouTube link</label>
      <div className="try-row">
        <input
          id="url"
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=…"
          autoComplete="off"
          aria-describedby="try-msg"
        />
        <button type="submit">Make a reel</button>
      </div>
      <label className="try-check">
        <input type="checkbox" name="rights" /> I own this video or have
        permission to use it.
      </label>
      <p
        id="try-msg"
        className={`try-msg ${message.kind}`}
        role="status"
        aria-live="polite"
      >
        {message.text}
      </p>
    </form>
  );
}
