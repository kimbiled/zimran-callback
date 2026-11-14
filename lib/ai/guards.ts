// [B] Guards against judge-model mistakes. Pure functions, covered by tests.

import type { JudgeEvent } from "../types";
import { words } from "../metrics";

export const MAX_DELTA = 25;
export const MIN_SCORE = -100;
export const MAX_SCORE = 100;
/** ~60 seconds of speech counts as a monologue */
export const MONOLOGUE_WORDS = 150;

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(hi, Math.max(lo, n));
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\d\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The judge's quote must actually appear in the rep's turn:
 * a contiguous match after punctuation/case normalization, with word boundaries.
 */
export function quoteIsGrounded(quote: string, repText: string): boolean {
  const q = normalize(quote);
  const r = normalize(repText);
  if (!q) return false;
  return ` ${r} `.includes(` ${q} `);
}

export type RawJudge = {
  delta: number;
  reason: string;
  evidenceQuote: string;
  event: JudgeEvent;
  painsUncovered: string[];
};

export type GuardedJudge = RawJudge & { score: number };

export function guardJudge(
  raw: RawJudge,
  ctx: { prevScore: number; repText: string; painIds: string[]; alreadyFound: string[] },
): GuardedJudge {
  let delta = Math.round(clamp(raw.delta, -MAX_DELTA, MAX_DELTA));
  let reason = raw.reason?.trim() || "No noticeable effect.";
  let event = raw.event;
  let evidenceQuote = raw.evidenceQuote ?? "";

  // No evidence in the rep's own words, no points.
  const grounded = quoteIsGrounded(raw.evidenceQuote ?? "", ctx.repText);
  if (!grounded && delta !== 0) {
    delta = 0;
    event = "neutral";
    reason = "Score had no supporting quote, so it didn't count.";
  }

  // Monologues are penalized in code, whatever the model says.
  if (words(ctx.repText).length >= MONOLOGUE_WORDS) {
    delta = Math.min(delta, -5);
    event = "monologue";
    reason = "That turn ran too long. The buyer is tuning out.";
    evidenceQuote = ctx.repText.trim().split(/\s+/).slice(0, 20).join(" ");
  }

  const known = new Set(ctx.painIds);
  const found = new Set(ctx.alreadyFound);
  const painsUncovered = grounded
    ? [...new Set(raw.painsUncovered ?? [])].filter((id) => known.has(id) && !found.has(id))
    : [];

  const score = Math.round(clamp(ctx.prevScore + delta, MIN_SCORE, MAX_SCORE));
  return {
    delta: score - ctx.prevScore,
    reason: reason.slice(0, 120),
    evidenceQuote: event === "monologue" || grounded ? evidenceQuote : "",
    event,
    painsUncovered,
    score,
  };
}
