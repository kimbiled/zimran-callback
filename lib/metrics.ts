// [B] Call metrics are computed in code, not by the model, so they can't be hallucinated.

import type { CallMode, CallRank, Metrics, Turn } from "./types";

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

/** Healthy conversational pace for a cold call, words per minute. */
export const HEALTHY_WPM = { min: 130, max: 160 } as const;

/** Rep words per minute of rep speaking time. Null for text calls or when there is no measurable speech. */
export function wordsPerMinute(turns: Turn[], mode: CallMode = "voice"): number | null {
  if (mode !== "voice") return null;
  const rep = turns.filter((t) => t.role === "rep");
  const seconds = speechSeconds(rep);
  const count = rep.reduce((n, t) => n + words(t.text).length, 0);
  if (seconds < 1 || count === 0) return null;
  return Math.round(count / (seconds / 60));
}

/** The longest silence between a buyer turn ending and the rep's next turn starting (voice only). */
export function longestPauseBeforeAnswer(turns: Turn[], mode: CallMode = "voice"): { sec: number; turnIndex: number } | null {
  if (mode !== "voice") return null;
  const order = turns.map((t, i) => ({ t, i })).sort((a, b) => a.t.start - b.t.start || a.i - b.i);
  let best: { sec: number; turnIndex: number } | null = null;
  for (let k = 1; k < order.length; k++) {
    const prev = order[k - 1].t;
    const cur = order[k];
    if (prev.role !== "buyer" || cur.t.role !== "rep") continue;
    const gap = Math.max(0, cur.t.start - prev.end);
    if (!best || gap > best.sec) best = { sec: gap, turnIndex: cur.i };
  }
  return best && { sec: Math.round(best.sec * 10) / 10, turnIndex: best.turnIndex };
}

/** "Better than 72% of 40 practice calls with Mike", or "#2 of 3 calls with Mike" for small samples. Real counts only. */
export function rankLine(rank: CallRank, firstName: string): string | null {
  const self = rank.includesSelf ?? true;
  const others = Math.max(0, rank.n - (self ? 1 : 0));
  const total = others + 1;
  if (others <= 0) return `Your first scored practice call with ${firstName}`;
  if (total < 5) return `#${Math.min(total, rank.above + 1)} of ${total} calls with ${firstName}`;
  const pct = Math.round((Math.min(rank.below, others) / others) * 100);
  return `Better than ${pct}% of ${others} practice calls with ${firstName}`;
}

export function callMetrics(turns: Turn[], mode: CallMode = "voice"): Metrics {
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
    wordsPerMinute: wordsPerMinute(turns, mode),
    longestPauseBeforeAnswerSec: longestPauseBeforeAnswer(turns, mode)?.sec ?? null,
  };
}
