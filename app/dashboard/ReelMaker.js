"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_BYTES = 100 * 1024 * 1024; // Cloudinary's free-plan limit for one video
const POLL_MS = 4000;
const MAX_POLLS = 150; // about 10 minutes

const MESSAGES = {
  402: "You have used your free reel. Upgrade to Pro to make more.",
  429: "Too many tries. Wait a few minutes and try again.",
  503: "We are at capacity today. Try again tomorrow.",
};

class UserFacingError extends Error {}

function uploadToCloudinary(file, signed, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", signed.timestamp);
    form.append("folder", signed.folder);
    form.append("signature", signed.signature);

    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${signed.cloudName}/video/upload`,
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status === 200) {
        resolve(JSON.parse(request.responseText).secure_url);
      } else {
        reject(new UserFacingError("The upload failed. Try the file again."));
      }
    };
    request.onerror = () =>
      reject(new UserFacingError("The upload failed. Check your connection."));
    request.send(form);
  });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) {
    throw new UserFacingError(
      MESSAGES[response.status] || "Something went wrong. Try again.",
    );
  }
  return response.json();
}

export default function ReelMaker({ canStart }) {
  const router = useRouter();
  const [phase, setPhase] = useState("idle"); // idle | uploading | processing | done | error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [reelUrl, setReelUrl] = useState("");
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  function fail(text) {
    setMessage(text);
    setPhase("error");
    router.refresh(); // a failed reel is refunded, so show the real plan state
  }

  async function waitForReel(id) {
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (stopped.current) {
        return;
      }
      const response = await fetch(`/api/jobs/${id}`);
      if (!response.ok) {
        throw new UserFacingError(
          "We lost track of your reel. Refresh the page.",
        );
      }
      const job = await response.json();
      if (job.status === "done") {
        setReelUrl(job.result.reelUrl);
        setPhase("done");
        router.refresh();
        return;
      }
      if (job.status === "failed") {
        throw new UserFacingError(
          "We could not make a reel from this video. Your reel was not used. Try a different video.",
        );
      }
    }
    throw new UserFacingError(
      "This is taking longer than usual. Refresh the page in a few minutes.",
    );
  }

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("video");

    if (!(file instanceof File) || file.size === 0) {
      return fail("Choose a video file first.");
    }
    if (!file.type.startsWith("video/")) {
      return fail("That file is not a video.");
    }
    if (file.size > MAX_BYTES) {
      return fail("That video is over 100 MB. Choose a smaller file.");
    }
    if (form.get("rights") !== "on") {
      return fail("Confirm you own this video or have permission to use it.");
    }

    try {
      setPhase("uploading");
      setProgress(0);
      setMessage("");
      const signed = await postJson("/api/uploads/sign");
      const sourceUrl = await uploadToCloudinary(file, signed, setProgress);

      setPhase("processing");
      const { id } = await postJson("/api/jobs", {
        sourceUrl,
        rightsConfirmed: true,
      });
      await waitForReel(id);
    } catch (error) {
      fail(
        error instanceof UserFacingError
          ? error.message
          : "Something went wrong. Try again.",
      );
    }
  }

  async function download() {
    try {
      const blob = await (await fetch(reelUrl)).blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "reel.mp4";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      window.open(reelUrl, "_blank", "noreferrer");
    }
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <section className="maker" aria-labelledby="maker-h">
      <div className="maker-controls">
        <h2 id="maker-h">Upload a video</h2>
        <p className="dash-lede">
          We cut a 15-second clip and crop it to vertical. Videos up to 100 MB.
        </p>

        {canStart ? (
          <form onSubmit={onSubmit} noValidate>
            <label htmlFor="video">Video file</label>
            <input
              id="video"
              name="video"
              type="file"
              accept="video/*"
              disabled={busy}
            />
            <label className="try-check">
              <input type="checkbox" name="rights" disabled={busy} /> I own this
              video or have permission to use it.
            </label>
            <button className="dash-btn" type="submit" disabled={busy}>
              {busy ? "Working…" : "Make my reel"}
            </button>
          </form>
        ) : (
          <p className="dash-note">
            You have no reels left. Upgrade to Pro to make more.
          </p>
        )}

        <p
          className={`dash-status ${phase === "error" ? "error" : ""}`}
          role={phase === "error" ? "alert" : "status"}
        >
          {phase === "uploading" && `Uploading… ${progress}%`}
          {phase === "processing" &&
            "Making your reel. This takes about a minute."}
          {phase === "done" && "Your reel is ready."}
          {phase === "error" && message}
        </p>
        {phase === "uploading" && (
          <progress value={progress} max="100" aria-label="Upload progress" />
        )}
        {phase === "done" && (
          <button className="dash-btn" type="button" onClick={download}>
            Download reel
          </button>
        )}
      </div>

      <div className={`reel-frame ${phase}`}>
        {phase === "done" ? (
          <video src={reelUrl} controls playsInline loop autoPlay muted />
        ) : (
          <p>{busy ? "Working on it…" : "Your reel appears here"}</p>
        )}
      </div>
    </section>
  );
}
