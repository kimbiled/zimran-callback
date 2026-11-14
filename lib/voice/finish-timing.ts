// [B] Post-call latency: how long "End call" waits for scoring, and the measured timings of the finish.

/**
 * How long finish() waits for in-flight judge requests before building the debrief.
 * The server fills any unjudged rep turn with the labelled rubric (finalEvidence), so waiting
 * longer only trades user-visible latency for one more AI-scored timeline point.
 */
export const JUDGE_DRAIN_MS = 2500;

/** Resolves true when `work` settles (either way) within `ms`, false on timeout. Never rejects. */
export function waitAtMost(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = work.then(() => true, () => true);
  const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), ms); });
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
}

export type FinishMarks = { endClick: number; judgeDrained: number; debriefResponse: number };
export type FinishTimings = { waitJudgeMs: number; debriefMs: number; totalMs: number };

/** Turns performance.now() marks into whole-millisecond segments (never negative). */
export function finishTimings(m: FinishMarks): FinishTimings {
  const ms = (from: number, to: number) => Math.max(0, Math.round(to - from));
  return {
    waitJudgeMs: ms(m.endClick, m.judgeDrained),
    debriefMs: ms(m.judgeDrained, m.debriefResponse),
    totalMs: ms(m.endClick, m.debriefResponse),
  };
}

export function timingSummary(t: FinishTimings, source: string, judgeDrained: boolean): string {
  return `[callback] debrief ready in ${t.totalMs} ms (judge wait ${t.waitJudgeMs} ms${judgeDrained ? "" : ", capped"}, debrief ${t.debriefMs} ms, source ${source})`;
}
