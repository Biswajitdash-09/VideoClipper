"use client";
import { useRef, useState } from "react";
import { REEL_LENGTHS } from "../../lib/reel-lengths.js";

// "0:12.5"
function clock(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds - minutes * 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${rest}`;
}

// Lets the user pick which part of their video becomes the reel.
// `trim` is { start, length, videoLength } and lives in the parent, which sends it to the server.
// `onPlayback({ time, playing })` tells the parent where the player is, for the crop preview.
export default function TrimEditor({ url, trim, onTrim, onPlayback }) {
  const videoRef = useRef(null);
  const [cannotPreview, setCannotPreview] = useState(false);

  const { start, length, videoLength } = trim;
  const lengths = videoLength
    ? REEL_LENGTHS.filter((option) => option <= Math.floor(videoLength))
    : REEL_LENGTHS;

  // The latest start that still leaves room for `forLength` seconds, in tenths.
  function latestStart(forLength) {
    return videoLength
      ? Math.max(0, Math.floor((videoLength - forLength) * 10) / 10)
      : 0;
  }

  function tellPlayback(player = videoRef.current) {
    onPlayback({ time: player.currentTime, playing: !player.paused });
  }

  function seekTo(seconds) {
    const player = videoRef.current;
    player.pause();
    player.currentTime = seconds;
    onPlayback({ time: seconds, playing: false });
  }

  function chooseLength(next) {
    const newStart = Math.min(start, latestStart(next));
    onTrim({ length: next, start: newStart });
    if (newStart !== start) {
      seekTo(newStart);
    }
  }

  function chooseStart(next) {
    const clamped = Math.min(Math.max(0, next), latestStart(length));
    onTrim({ start: clamped });
    seekTo(clamped);
  }

  function onMetadata(event) {
    const seconds = event.currentTarget.duration;
    if (!Number.isFinite(seconds)) {
      setCannotPreview(true);
      return;
    }
    const fits = REEL_LENGTHS.filter((option) => option <= Math.floor(seconds));
    onTrim({
      videoLength: seconds,
      start: 0,
      length: fits.includes(length) ? length : (fits.at(-1) ?? length),
    });
  }

  function playSelection() {
    videoRef.current.currentTime = start;
    videoRef.current.play();
  }

  // Stop at the end of the chosen part so the preview shows exactly what the reel will hold.
  function onTimeUpdate(event) {
    const player = event.currentTarget;
    if (!player.paused && player.currentTime >= start + length) {
      player.pause();
    }
    tellPlayback(player);
  }

  const canSlide = Boolean(videoLength) && latestStart(length) > 0;
  const showTimeline = Boolean(videoLength) && lengths.length > 0;

  return (
    <div className="trim">
      <video
        ref={videoRef}
        src={url || undefined}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={onMetadata}
        onTimeUpdate={onTimeUpdate}
        onSeeked={() => tellPlayback()}
        onPlay={() => tellPlayback()}
        onPause={() => tellPlayback()}
        onError={() => setCannotPreview(true)}
      />

      {cannotPreview && (
        <p className="dash-note">
          Your browser cannot preview this file, so the reel will start at the
          beginning of the video. You can still pick how long it is.
        </p>
      )}
      {videoLength && lengths.length === 0 && (
        <p className="dash-note" role="alert">
          This video is shorter than 10 seconds. Choose a longer one.
        </p>
      )}

      <fieldset className="trim-lengths">
        <legend>Reel length</legend>
        {REEL_LENGTHS.map((option) => (
          <button
            key={option}
            type="button"
            className="trim-length"
            aria-pressed={length === option}
            disabled={!lengths.includes(option)}
            onClick={() => chooseLength(option)}
          >
            {option} s
          </button>
        ))}
      </fieldset>

      {showTimeline && (
        <>
          <div className="trim-start">
            <label htmlFor="trim-start-input">
              Start of your reel
              <span className="trim-range">
                {clock(start)} to {clock(start + length)}
              </span>
            </label>
            <div
              className="trim-track"
              style={{
                "--from": `${(start / videoLength) * 100}%`,
                "--span": `${(length / videoLength) * 100}%`,
              }}
            >
              <input
                id="trim-start-input"
                type="range"
                min="0"
                max={videoLength}
                step="0.1"
                value={start}
                disabled={!canSlide}
                aria-valuetext={`${clock(start)} to ${clock(start + length)}`}
                onChange={(event) => chooseStart(Number(event.target.value))}
              />
            </div>
            <div className="trim-ends" aria-hidden="true">
              <span>0:00</span>
              <span>{clock(videoLength)}</span>
            </div>
          </div>

          <div className="trim-actions">
            <button
              type="button"
              className="dash-btn trim-primary"
              onClick={playSelection}
            >
              Preview selection
            </button>
            <button
              type="button"
              className="dash-btn dash-btn-quiet"
              disabled={!canSlide}
              onClick={() => chooseStart(videoRef.current.currentTime)}
            >
              Start at current frame
            </button>
          </div>
        </>
      )}
    </div>
  );
}
