import type { CallRecord } from "../types";
import { db } from "../server/db";
import { isUuid } from "../server/session";
import { toPublic } from "../personas";
import type { RecordedReplay } from "./model";
export { replayAt } from "./model";

/** Eligibility uses persisted call data; publication consent remains an owner decision. */
export function isReplayCandidate(call: CallRecord): boolean {
  const debrief = call.debrief;
  const start = Date.parse(call.startedAt);
  const end = call.endedAt ? Date.parse(call.endedAt) : Number.NaN;
  if (!isUuid(call.id) || !isUuid(call.sessionId) || call.status !== "done" || call.mode !== "voice" || !Number.isFinite(start) || !Number.isFinite(end) || end < start || debrief?.source !== "ai" || debrief.callId !== call.id) return false;
  if (!Array.isArray(call.turns) || !Array.isArray(debrief.scoreTimeline) || !Array.isArray(debrief.criteria) || call.turns.length < 2 || !call.turns.some(t => t.role === "buyer")) return false;
  if (call.turns.some((t, i) => !t.text.trim() || !Number.isFinite(t.start) || !Number.isFinite(t.end) || t.start < 0 || t.end < t.start || (i > 0 && t.start < call.turns[i - 1].start))) return false;
  const rep = call.turns.filter(t => t.role === "rep");
  const timeline = debrief.scoreTimeline;
  if (rep.length === 0 || timeline.length !== rep.length + 1 || timeline[0].t !== 0) return false;
  if (timeline.some((p, i) => !Number.isFinite(p.t) || !Number.isFinite(p.score) || p.t < 0 || Math.abs(p.score) > 100 || (i > 0 && p.t < timeline[i - 1].t))) return false;
  if (rep.some((t, i) => t.judgeSource !== "ai" || !Number.isFinite(t.delta) || Math.abs(t.delta!) > 25 || !Number.isFinite(t.score) || !t.reason?.trim() || timeline[i + 1].t !== t.end || timeline[i + 1].score !== t.score || timeline[i + 1].score - timeline[i].score !== t.delta)) return false;
  return debrief.criteria.length === 5 && debrief.criteria.every(c => Number.isInteger(c.score) && c.score >= 0 && c.score <= 20)
    && debrief.criteria.reduce((total, c) => total + c.score, 0) === debrief.total
    && call.total === debrief.total && call.finalScore === debrief.finalScore
    && timeline.at(-1)!.score === debrief.finalScore;
}

/** Explicit field projection: no session, budget, hidden pains or unearned profile data. */
export function toReplay(call: CallRecord): RecordedReplay {
  const d = call.debrief!;
  return {
    callId: call.id,
    persona: toPublic(call.persona),
    recordedAt: call.startedAt,
    durationSec: Math.max(...call.turns.map(turn => turn.end), d.scoreTimeline.at(-1)!.t),
    turns: call.turns.map(turn => turn.role === "rep"
      ? { role: turn.role, text: turn.text, start: turn.start, end: turn.end, delta: turn.delta, score: turn.score, reason: turn.reason, judgeSource: turn.judgeSource }
      : { role: turn.role, text: turn.text, start: turn.start, end: turn.end }),
    scoreTimeline: d.scoreTimeline.map(point => ({ t: point.t, score: point.score })),
    total: d.total,
    finalScore: d.finalScore,
    outcome: d.outcome,
    summary: d.summary,
  };
}

export async function loadPublishedReplay(id: string): Promise<RecordedReplay | null> {
  if (!isUuid(id)) return null;
  const call = await db().getCall(id);
  return call?.isSample && isReplayCandidate(call) ? toReplay(call) : null;
}

export async function listPublishedReplays() {
  return (await db().listSamples(12)).filter(isReplayCandidate).slice(0, 6).map(call => {
    const { callId, persona, recordedAt, durationSec, total } = toReplay(call);
    return { callId, persona, recordedAt, durationSec, total, url: `/replay/${callId}` };
  });
}
