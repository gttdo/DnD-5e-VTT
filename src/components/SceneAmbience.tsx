import { useEffect, useMemo, useRef } from "react";
import { audioBus } from "../lib/audioBus";
import { resolveAmbience } from "../lib/soundtrack";

/**
 * The ambience player (#0046) — loops the staged scene's track through the
 * per-device Ambiance channel. Cross-fades on scene change (old fades out as
 * new fades in), tracks the mixer live (volume/mute), and plays on every
 * device at the table. Renders nothing; it's pure audio lifecycle.
 *
 * Autoplay may be blocked until the viewer has interacted with the page — the
 * play attempt is retried on the first pointer/key event so it starts as soon
 * as the browser allows, without nagging.
 */

const FADE_MS = 1200;
const STEP_MS = 60;

export const SceneAmbience = ({ trackKey }: { trackKey: string | null | undefined }) => {
  // Resolve the track key to a concrete file, re-picking a random variant only
  // when the key changes (a new scene or a combat swap) — not on every render.
  const url = useMemo(() => resolveAmbience(trackKey), [trackKey]);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef(0); // the channel level this track is fading toward

  // Swap tracks with a cross-fade whenever the staged scene's url changes.
  useEffect(() => {
    const prev = elRef.current;
    if (fadeRef.current) clearInterval(fadeRef.current);

    // Fade the outgoing track down, then stop it.
    if (prev) {
      let v = prev.volume;
      const out = setInterval(() => {
        v = Math.max(0, v - prev.volume / (FADE_MS / STEP_MS) - 0.001);
        prev.volume = Math.max(0, v);
        if (v <= 0.001) {
          clearInterval(out);
          prev.pause();
        }
      }, STEP_MS);
    }

    if (!url) {
      elRef.current = null;
      return;
    }

    const el = new Audio(url);
    el.loop = true;
    el.volume = 0;
    elRef.current = el;
    targetRef.current = audioBus.level("ambiance");

    const tryPlay = () => el.play().catch(() => {/* blocked — retried on first gesture */});
    tryPlay();

    // Fade the incoming track up to the current channel level.
    let v = 0;
    fadeRef.current = setInterval(() => {
      const target = audioBus.level("ambiance");
      v = Math.min(target, v + (target || 0.5) / (FADE_MS / STEP_MS) + 0.001);
      el.volume = Math.min(target, v);
      if (v >= target - 0.001) {
        if (fadeRef.current) clearInterval(fadeRef.current);
        fadeRef.current = null;
      }
    }, STEP_MS);

    // Retry autoplay once, on the first user gesture, if the browser blocked it.
    const onGesture = () => {
      if (el.paused) tryPlay();
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });

    return () => {
      if (fadeRef.current) clearInterval(fadeRef.current);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      el.pause();
    };
  }, [url]);

  // Live-apply mixer changes (volume/mute) to the currently playing track,
  // except while a cross-fade is mid-flight (it manages volume itself).
  useEffect(() => {
    const unsub = audioBus.subscribe(() => {
      const el = elRef.current;
      if (el && !fadeRef.current) el.volume = audioBus.level("ambiance");
    });
    return unsub;
  }, []);

  return null;
};
