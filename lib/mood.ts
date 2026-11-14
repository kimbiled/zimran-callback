// Buyer mood: maps the live interest score (-100..+100) to a face, a label and colors.
// Client-safe and pure, so the avatar, the meter and the tests share one mapping.

export type MoodLabel = "Hostile" | "Annoyed" | "Guarded" | "Neutral" | "Curious" | "Interested" | "Warm";

export type Mood = {
  label: MoodLabel;
  /** solid color for text, the face and the chip dot */
  color: string;
  /** translucent color for the glowing ring and the chip background */
  ring: string;
};

/** Ordered from coldest to warmest; `min` is the lowest score (inclusive) for that mood. */
export const MOODS: readonly (Mood & { min: number })[] = [
  { label: "Hostile", min: -Infinity, color: "#f43f5e", ring: "rgb(244 63 94 / 0.45)" },
  { label: "Annoyed", min: -60, color: "#fb7185", ring: "rgb(251 113 133 / 0.4)" },
  { label: "Guarded", min: -30, color: "#fbbf24", ring: "rgb(251 191 36 / 0.38)" },
  { label: "Neutral", min: -10, color: "#a4a4b8", ring: "rgb(164 164 184 / 0.32)" },
  { label: "Curious", min: 10, color: "#22d3ee", ring: "rgb(34 211 238 / 0.4)" },
  { label: "Interested", min: 30, color: "#34d399", ring: "rgb(52 211 153 / 0.42)" },
  { label: "Warm", min: 60, color: "#4ade80", ring: "rgb(74 222 128 / 0.5)" },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function moodFor(score: number): Mood {
  const s = Number.isFinite(score) ? clamp(score, -100, 100) : 0;
  let found = MOODS[0];
  for (const m of MOODS) if (s >= m.min) found = m;
  return { label: found.label, color: found.color, ring: found.ring };
}

/**
 * Face geometry for a 24×24 viewBox, interpolated continuously with the score.
 * mouthCurve > 0 smiles, < 0 frowns; browInner > 0 lowers the inner brow ends (angry), < 0 raises them.
 */
export function faceFor(score: number): { mouthCurve: number; browInner: number; browLift: number; eyeOpen: number } {
  const t = Number.isFinite(score) ? clamp(score / 100, -1, 1) : 0;
  return {
    mouthCurve: round(t * 5),
    browInner: round(-t * 1.8),
    browLift: round(Math.max(0, t) * 1),
    eyeOpen: round(1 - Math.max(0, -t) * 0.45),
  };
}

const round = (n: number) => Math.round(n * 100) / 100 + 0;
