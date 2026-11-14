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

const LEAD_IN = /^(?:(?:and|so|but|okay|ok|well|also|now|then|alright|right|sorry|great)[,\s]+)+/i;
const QUESTION_START = /^(?:who|what|what's|when|where|why|how|how's|which|whose|do|does|did|is|isn't|are|aren't|was|were|can|could|would|will|should|have|has|any|may|shall|walk me through|tell me)\b/i;

/** Keep upstream speech question counting: captions often omit question marks. */
export function countQuestions(text: string): number {
  return (text.match(/[^.?!]+[.?!]*/g) ?? []).filter(sentence => {
    const t = sentence.trim();
    return t.endsWith("?") || QUESTION_START.test(t.replace(LEAD_IN, ""));
  }).length;
}

function speechSeconds(turns: Turn[]): number {
  let end = 0;
  let total = 0;
  for (const turn of [...turns].sort((a, b) => a.start - b.start)) {
    total += Math.max(0, turn.end - Math.max(end, turn.start));
    end = Math.max(end, turn.end);
  }
  return total;
}

export function callMetrics(turns: Turn[]): Metrics {
  const rep = turns.filter((t) => t.role === "rep");
  const repTime = speechSeconds(rep);
  const allTime = repTime + speechSeconds(turns.filter(t => t.role === "buyer")) || 1;
  const repWords = rep.flatMap((t) => words(t.text));
  const text = repWords.join(" ");
  const fillers = text.match(/\b(?:um|uh|erm|you know|basically|kind of|sort of|i mean|literally)\b/g)?.length ?? 0;
  const lastEnd = turns.reduce((m, t) => Math.max(m, t.end), 0);
  let chunks: Turn[] = [];
  let longest = 0;
  for (const turn of [...turns].sort((a, b) => a.start - b.start)) {
    if (turn.role === "buyer") chunks = [];
    else {
      chunks.push(turn);
      longest = Math.max(longest, speechSeconds(chunks));
    }
  }
  return {
    durationSec: Math.round(lastEnd),
    talkRatio: rep.length ? Math.round((repTime / allTime) * 100) : 0,
    questions: rep.reduce((n, t) => n + countQuestions(t.text), 0),
    fillersPer100: repWords.length ? +((fillers / repWords.length) * 100).toFixed(1) : 0,
    longestMonologueSec: Math.round(longest),
    repWords: repWords.length,
  };
}
