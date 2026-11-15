"use client";
import { useEffect, useRef } from "react";

// The vertical frame the reel will have. It shows the same video, centre-cropped to 9:16
// exactly like the server does, and follows the main player's position.
export default function CropPreview({ url, time, playing }) {
  const ref = useRef(null);

  useEffect(() => {
    const player = ref.current;
    // While playing, only correct drift: seeking on every tick would stutter.
    if (!playing || Math.abs(player.currentTime - time) > 0.4) {
      player.currentTime = time;
    }
  }, [time, playing]);

  useEffect(() => {
    const player = ref.current;
    if (playing) {
      player.play().catch(() => {});
    } else {
      player.pause();
    }
  }, [playing]);

  return <video ref={ref} src={url} muted playsInline aria-hidden="true" />;
}
