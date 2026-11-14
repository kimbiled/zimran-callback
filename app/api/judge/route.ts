// [B] Judge: scores the rep's latest turn -> interest change.
import { z } from "zod";
import { judgeTurn } from "@/lib/ai/judge";
import { isUuid } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import { CallTurnsSchema, initialInterest, judgments, ownedCall, sameRepPrefix, saveJudgment } from "@/lib/ai/call-state";
import { guardJudge } from "@/lib/ai/guards";
import { heuristicJudge } from "@/lib/ai/heuristics";
import { ServerTimer } from "@/lib/server/server-timing";

export const maxDuration = 20;

const Body = z.object({
  callId: z.string(),
  turns: CallTurnsSchema,
});

export async function POST(req: Request) {
  const timer = new ServerTimer();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || !isUuid(parsed.data.callId)) return bad("Invalid request");
  const { callId, turns } = parsed.data;
  const call = await timer.time("db", () => ownedCall(callId));
  if (!call) return bad("Call not found", 404);
  if (call.status !== "live") return bad("Call already ended", 409);
  if (Date.now() - Date.parse(call.startedAt) > 330_000) return bad("Call time limit reached", 409);
  if (turns.at(-1)?.role !== "rep") return bad("Latest turn must be from the rep");
  const entries = await timer.time("db", () => judgments(callId));
  const reps = turns.filter(t => t.role === "rep");
  if (reps.length > 100) return bad("Turn limit reached", 429);
  if (!sameRepPrefix(entries.slice(0, reps.length), turns)) return bad("Previously judged turns changed", 409);
  if (entries[reps.length - 1]) return timer.apply(json(entries[reps.length - 1].verdict));
  // A dropped browser request must not break every later turn or text reply.
  for (let repIndex = entries.length; repIndex < reps.length - 1; repIndex++) {
    const rep = reps[repIndex];
    const prefix = turns.slice(0, turns.indexOf(rep) + 1);
    const found = [...new Set(entries.flatMap(e => e.verdict.painsUncovered))];
    const recovered = { ...guardJudge(heuristicJudge(call.persona, prefix, found), {
      prevScore: entries.at(-1)?.verdict.score ?? initialInterest(call.persona.difficulty),
      repText: rep.text, painIds: call.persona.pains.map(p => p.id), alreadyFound: found,
    }), source: "heuristic" as const };
    const verdict = await timer.time("db", () => saveJudgment(callId, repIndex, rep.text, recovered));
    entries.push({ repText: rep.text, verdict });
  }

  const prevScore = entries.at(-1)?.verdict.score ?? initialInterest(call.persona.difficulty);
  const alreadyFound = [...new Set(entries.flatMap(e => e.verdict.painsUncovered))];
  const verdict = await timer.time("ai", () => judgeTurn({ persona: call.persona, turns, prevScore, alreadyFound }));
  timer.add("ai", 0, verdict.source);
  const saved = await timer.time("db", () => saveJudgment(callId, reps.length - 1, reps.at(-1)!.text, verdict));
  return timer.apply(json(saved));
}
