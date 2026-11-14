"use client";
// Buyer avatar that reads the room: initials, a spinning ring in the mood color, a small SVG face
// whose brows and mouth follow the interest score, and a mood chip that crossfades between labels.

import { useEffect, useRef, useState } from "react";
import { MOODS, faceFor, moodFor } from "@/lib/mood";

/** Eases the displayed score toward the target so the face morphs instead of jumping. */
function useEased(target: number, ms = 600): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);
  useEffect(() => {
    from.current = current.current;
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      current.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      current.current = from.current + (target - from.current) * e;
      setValue(current.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function MoodFace({ score, color, size = 28 }: { score: number; color: string; size?: number }) {
  const f = faceFor(score);
  const browY = 8 - f.browLift;
  const mouthY = 16.5 - f.mouthCurve * 0.25;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#13131d" stroke={color} strokeWidth="1.5" style={{ transition: "stroke 500ms ease" }} />
      <g stroke={color} strokeWidth="1.6" strokeLinecap="round" style={{ transition: "stroke 500ms ease" }}>
        <line x1="6.2" y1={browY} x2="10" y2={browY + f.browInner} />
        <line x1="17.8" y1={browY} x2="14" y2={browY + f.browInner} />
        <path d={`M7.5 ${mouthY} Q12 ${mouthY + f.mouthCurve} 16.5 ${mouthY}`} />
      </g>
      <g fill={color} style={{ transition: "fill 500ms ease" }}>
        <ellipse cx="8.6" cy="11.4" rx="1.15" ry={1.2 * f.eyeOpen} />
        <ellipse cx="15.4" cy="11.4" rx="1.15" ry={1.2 * f.eyeOpen} />
      </g>
    </svg>
  );
}

export function MoodChip({ score, className = "" }: { score: number; className?: string }) {
  const mood = moodFor(score);
  return (
    <span
      className={`chip relative transition-colors duration-500 ${className}`}
      style={{ background: mood.ring.replace(/\/ [\d.]+\)/, "/ 0.16)"), color: mood.color }}
    >
      <span className="sr-only">Buyer mood: {mood.label}</span>
      <span className="h-1.5 w-1.5 rounded-full transition-colors duration-500" style={{ background: mood.color }} aria-hidden="true" />
      {/* Every label sits in the same grid cell; only the active one is visible, so changes crossfade. */}
      <span className="grid" aria-hidden="true">
        {MOODS.map((m) => (
          <span
            key={m.label}
            className="col-start-1 row-start-1 whitespace-nowrap transition-opacity duration-300"
            style={{ opacity: m.label === mood.label ? 1 : 0 }}
          >
            {m.label}
          </span>
        ))}
      </span>
    </span>
  );
}

/** "Nina" + "Dr. Nina Castillo" → "NC"; falls back to the first letter. */
export function initialsOf(firstName: string, name: string): string {
  const first = firstName.trim()[0] ?? name.trim()[0] ?? "?";
  const last = name.trim().split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && w !== firstName).at(-1);
  return (first + (last && !last.endsWith(".") ? last[0] : "")).toUpperCase();
}

export function BuyerMood({ firstName, name, score, speaking = false }: { firstName: string; name: string; score: number; speaking?: boolean }) {
  const eased = useEased(score);
  const mood = moodFor(score);
  const initials = initialsOf(firstName, name);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div className={`relative h-16 w-16 rounded-full ${speaking ? "speaking" : ""}`}>
        <span
          className="absolute -inset-2 rounded-full blur-md transition-colors duration-500"
          style={{ background: mood.ring, opacity: 0.35 }}
          aria-hidden="true"
        />
        {/* Spinning conic ring in the mood color */}
        <span
          className="absolute -inset-[3px] animate-spin rounded-full [animation-duration:7s]"
          style={{ background: `conic-gradient(from 0deg, ${mood.color}, ${mood.ring} 35%, transparent 55%, ${mood.ring} 80%, ${mood.color})`, transition: "background 500ms ease" }}
          aria-hidden="true"
        />
        <span className="absolute inset-[1px] grid place-items-center rounded-full bg-panel-2 text-xl font-bold tracking-tight" aria-hidden="true">
          {initials}
        </span>
        <span className="absolute -bottom-1 -right-1 rounded-full ring-2 ring-panel" aria-hidden="true">
          <MoodFace score={eased} color={mood.color} size={26} />
        </span>
      </div>
      <MoodChip score={score} className="px-2 py-0.5 text-[11px]" />
    </div>
  );
}
