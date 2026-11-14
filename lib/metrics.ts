// [B] Call metrics are computed in code, not by the model, so they can't be hallucinated.

import type { Metrics, Turn } from "./types";

/** Filler words and phrases; multi-word ones are matched as phrases. */
export const FILLERS = ["um", "uh", "erm", "you know", "basically", "kind of", "sort of", "i mean", "literally"];

/** Average speaking rate in words per second, used to estimate turn duration */
export const WORDS_PER_SEC = 2.5;

export function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\d']+/gu) ?? [];
}

export function estimateSeconds(text: string): number {
  return Math.max(1, words(text).length / WORDS_PER_SEC);
}

const dur = (t: Turn) => Math.max(0, t.end - t.start);

const LEAD_IN = /^(?:(?:and|so|but|okay|ok|well|also|now|then|alright|right|sorry|great)[,\s]+)+/i;
const QUESTION_START =
  /^(?:who|what|what's|when|where|why|how|how's|which|whose|do|does|did|is|isn't|are|aren't|was|were|can|could|would|will|should|have|has|any|may|shall)\b/i;

/**
 * Sentences that end in "?" or start like a question. Speech-to-text often drops the
 * question mark ("Do you have 30 seconds"), so the opening words count too.
 */
export function countQuestions(text: string): number {
  const sentences = text.match(/[^.?!]+[.?!]*/g) ?? [];
  return sentences.filter((s) => {
    const t = s.trim();
    return t.endsWith("?") || QUESTION_START.test(t.replace(LEAD_IN, ""));
  }).length;
}

export function callMetrics(turns: Turn[]): Metrics {
  const rep = turns.filter((t) => t.role === "rep");
  const repTime = rep.reduce((s, t) => s + dur(t), 0);
  const allTime = turns.reduce((s, t) => s + dur(t), 0) || 1;
  const repWords = rep.flatMap((t) => words(t.text));
  const text = ` ${repWords.join(" ")} `;
  const fillers = FILLERS.reduce((n, f) => n + text.split(` ${f} `).length - 1, 0);
  const lastEnd = turns.reduce((m, t) => Math.max(m, t.end), 0);
  return {
    durationSec: Math.round(lastEnd),
    talkRatio: rep.length ? Math.round((repTime / allTime) * 100) : 0,
    questions: rep.reduce((n, t) => n + countQuestions(t.text), 0),
    fillersPer100: repWords.length ? +((fillers / repWords.length) * 100).toFixed(1) : 0,
    longestMonologueSec: Math.round(Math.max(0, ...rep.map(dur))),
    repWords: repWords.length,
  };
}
