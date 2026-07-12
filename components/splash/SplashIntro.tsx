"use client";

import { useEffect, useRef, useState } from "react";

const MAX_DURATION_MS = 3000;

/**
 * Brand intro shown once per cold start, while AuthGate's async init runs
 * behind it. Plays the rendered Turaf Café video if the WebView allows
 * autoplay; falls back to a static branded frame (no video dependency) if
 * it doesn't, or if the file fails to load. Either way, `onDone` fires at
 * MAX_DURATION_MS at the latest — never blocks longer than that regardless
 * of media state, per the "2-3 seconds only" requirement.
 */
export default function SplashIntro({ onDone }: { onDone: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
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
      {!videoFailed ? (
        <video
          autoPlay
          muted
          playsInline
          preload="auto"
          src="/turaf-intro.mp4"
          onError={() => setVideoFailed(true)}
          className="w-full h-full object-contain"
        />
      ) : (
        // Static fallback — identical brand mark, no video dependency, in
        // case autoplay is blocked or the asset fails to load.
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/eight-ball.png" alt="" className="w-32 h-32" />
          <div className="flex items-center gap-3 font-display text-5xl font-extrabold">
            <span className="text-espresso-50">مقهى</span>
            <span className="text-copper-500">ترف</span>
          </div>
        </div>
      )}
    </main>
  );
}
