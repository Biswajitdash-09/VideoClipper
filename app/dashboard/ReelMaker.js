"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CropPreview from "./CropPreview.js";
import TrimEditor from "./TrimEditor.js";

const FIRST_TRIM = { start: 0, length: 15, videoLength: null };
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
  const [file, setFile] = useState(null);
  const [trim, setTrim] = useState(FIRST_TRIM);
  const [previewUrl, setPreviewUrl] = useState("");
  const [playback, setPlayback] = useState({ time: 0, playing: false });
  const [canRetry, setCanRetry] = useState(false);
  const jobId = useRef(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  // One local copy of the chosen video, shared by the editor and the crop preview.
  useEffect(() => {
    if (!file?.type.startsWith("video/")) {
      setPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setPlayback({ time: 0, playing: false });
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function chooseFile(event) {
    setFile(event.target.files[0] ?? null);
    setTrim(FIRST_TRIM);
  }

  function changeTrim(change) {
    setTrim((current) => ({ ...current, ...change }));
  }

  function fail(text) {
    setMessage(text);
    setPhase("error");
    router.refresh(); // a failed reel is refunded, so show the real plan state
  }

  // The server deletes the reel once it has been sent, so this is the one chance to get it.
  // The browser keeps it in memory for the preview and the Download button.
  async function loadReel() {
    setCanRetry(false);
    let blob;
    try {
      const response = await fetch(`/api/jobs/${jobId.current}/download`);
      if (response.status === 410 || response.status === 404) {
        throw new UserFacingError(
          "This reel was already downloaded, so we no longer have it.",
        );
      }
      if (!response.ok) {
        throw new Error("download failed");
      }
      blob = await response.blob();
    } catch (error) {
      if (error instanceof UserFacingError) {
        throw error;
      }
      // The reel is only deleted after a complete download, so trying again is safe.
      setCanRetry(true);
      throw new UserFacingError("Your reel is made but could not be loaded.");
    }

    setReelUrl(URL.createObjectURL(blob));
    jobId.current = null;
    setPhase("done");
    router.refresh();
  }

  async function retryLoad() {
    try {
      setPhase("processing");
      await loadReel();
    } catch (error) {
      fail(error.message);
    }
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
        await loadReel();
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

    if (!file || file.size === 0) {
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

    if (trim.videoLength !== null && trim.videoLength < trim.length) {
      return fail(
        `Your video is ${Math.floor(trim.videoLength)} seconds long. Pick a shorter reel or choose a longer video.`,
      );
    }

    try {
      setPhase("uploading");
      setProgress(0);
      setMessage("");
      setCanRetry(false);
      setReelUrl("");
      const signed = await postJson("/api/uploads/sign");
      const sourceUrl = await uploadToCloudinary(file, signed, setProgress);

      setPhase("processing");
      const { id } = await postJson("/api/jobs", {
        sourceUrl,
        start: trim.start,
        duration: trim.length,
        rightsConfirmed: true,
      });
      jobId.current = id;
      await waitForReel(id);
    } catch (error) {
      fail(
        error instanceof UserFacingError
          ? error.message
          : "Something went wrong. Try again.",
      );
    }
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <section className="maker" aria-labelledby="maker-h">
      <div className="maker-controls">
        <h2 id="maker-h">Upload a video</h2>
        <p className="dash-lede">
          Pick the part you want, 10 to 30 seconds, and we crop it to vertical.
          Videos up to 100 MB. Your reel is deleted from our servers as soon as
          it reaches you.
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
              onChange={chooseFile}
            />
            {file?.type.startsWith("video/") && (
              <TrimEditor
                url={previewUrl}
                trim={trim}
                onTrim={changeTrim}
                onPlayback={setPlayback}
              />
            )}
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
          {phase === "done" &&
            "Your reel is ready. Download it now: we do not keep it."}
          {phase === "error" && message}
        </p>
        {phase === "uploading" && (
          <progress value={progress} max="100" aria-label="Upload progress" />
        )}
        {phase === "done" && (
          <a className="dash-btn" href={reelUrl} download="reel.mp4">
            Download reel
          </a>
        )}
        {phase === "error" && canRetry && (
          <button className="dash-btn" type="button" onClick={retryLoad}>
            Try again
          </button>
        )}
      </div>

      <div className="reel-side">
        <div className={`reel-frame ${phase}`}>
          {phase === "done" ? (
            <video src={reelUrl} controls playsInline loop autoPlay muted />
          ) : previewUrl && !busy && trim.videoLength ? (
            <CropPreview
              url={previewUrl}
              time={playback.time}
              playing={playback.playing}
            />
          ) : (
            <p>{busy ? "Working on it…" : "Your reel appears here"}</p>
          )}
        </div>
        {phase !== "done" && previewUrl && !busy && trim.videoLength && (
          <p className="reel-caption">
            What your reel will show. The sides are cropped to fit vertical.
          </p>
        )}
      </div>
    </section>
  );
}
