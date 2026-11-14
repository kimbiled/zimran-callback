import type { PersonaPublic, TimelinePoint, Turn } from "../types";

export type RecordedReplay = {
  callId: string;
  persona: PersonaPublic;
  recordedAt: string;
  durationSec: number;
  turns: Turn[];
  scoreTimeline: TimelinePoint[];
  total: number;
  finalScore: number;
  outcome: "meeting" | "no_meeting";
  summary: string;
};

/** A seek is a projection of saved events, never a new score calculation. */
export function replayAt(replay: RecordedReplay, seconds: number) {
  const at = Math.max(0, Math.min(replay.durationSec, Number.isFinite(seconds) ? seconds : 0));
  const points = replay.scoreTimeline.filter(point => point.t <= at);
  const lastVerdict = replay.turns.filter(turn => turn.role === "rep" && turn.end <= at).at(-1);
  return {
    at,
    score: points.at(-1)?.score ?? replay.scoreTimeline[0].score,
    delta: lastVerdict?.delta ?? null,
    reason: lastVerdict?.reason ?? "Waiting for the first saved judge verdict.",
    points,
    turns: replay.turns.filter(turn => turn.start <= at).map((turn): Turn => {
      const { delta, score, reason, judgeSource, ...unscored } = turn;
      return turn.role === "rep" && turn.end > at ? unscored : { ...turn };
    }),
  };
}
