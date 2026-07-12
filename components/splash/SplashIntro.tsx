"use client";

import { useEffect, useRef, useState } from "react";

const MAX_DURATION_MS = 3000;

export interface SplashIntroProps {
  onDone: () => void;
  /** Lifted from AuthGate's persistent, always-mounted <video> element. */
  videoReady: boolean;
  videoFailed: boolean;
}

/**
 * Brand intro chrome shown once, right after a successful login, for up to
 * MAX_DURATION_MS. The actual <video> element lives in AuthGate (mounted
 * since the app's very first render, so it's already buffered by the time
 * login succeeds) — this component only renders the background + the
 * static fallback mark (shown until the video is ready, or permanently if
 * it fails) and owns the "how long has the intro been showing" timer.
 */
export default function SplashIntro({
  onDone,
  videoReady,
  videoFailed,
}: SplashIntroProps) {
  const [fadingOut, setFadingOut] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setFadingOut(true);
      setTimeout(onDone, 250); // matches the fade-out transition below
    };
    const timer = setTimeout(finish, MAX_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      dir="rtl"
      className="min-h-screen flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 42%, #1d1510 0%, #140e0a 78%)",
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 250ms ease-out",
      }}
    >
      {/* Static brand mark — instant, no video dependency. Fades out once
          the (already-preloaded) video is confirmed ready; stays as the
          only thing shown if the video failed outright. */}
      <div
        className="flex flex-col items-center gap-6"
        style={{
          opacity: videoReady && !videoFailed ? 0 : 1,
          transition: "opacity 200ms ease-out",
        }}
      >
        <img src="/eight-ball.png" alt="" className="w-32 h-32" />
        <div className="flex items-center gap-3 font-display text-5xl font-extrabold">
          <span className="text-espresso-50">مقهى</span>
          <span className="text-copper-500">ترف</span>
        </div>
      </div>
    </main>
  );
}
