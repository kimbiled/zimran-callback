// [B] Final debrief. Idempotent: a repeat call returns the saved debrief.
import { z } from "zod";
import { buildDebrief } from "@/lib/ai/debrief";
import { CallTurnsSchema, finalEvidence, finishCallOnce, judgments, ownedCall, sameRepPrefix } from "@/lib/ai/call-state";
import { isUuid } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import { ServerTimer } from "@/lib/server/server-timing";
import { applyHintPenalty, hintCount } from "@/lib/ai/hint-count";

export const maxDuration = 45;

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
  if (call.status === "done" && call.debrief) return timer.apply(json(call.debrief));
  if (call.status !== "live") return bad("Call already ended", 409);

  const entries = await timer.time("db", () => judgments(callId));
  if (!sameRepPrefix(entries, turns)) return bad("Previously judged turns changed", 409);
  const evidence = finalEvidence(call, turns, entries);
  const finishing = performance.now();
  const debrief = await finishCallOnce(call, async () => {
    const [built, hints] = await Promise.all([
      timer.time("ai", () => buildDebrief({ callId, persona: call.persona, turns: evidence.turns, timeline: evidence.timeline, painsHint: evidence.painsFound })),
      hintCount(callId).catch(() => 0),
    ]);
    // Coach hints cost points: counted server-side by /api/hint, applied once here.
    return { turns: evidence.turns, debrief: applyHintPenalty(built, hints) };
  });
  // Completion reads/writes around the model call count as db; the model call itself is ai.
  timer.add("db", performance.now() - finishing - timer.get("ai"));
  if (timer.get("ai")) timer.add("ai", 0, debrief.source);
  return timer.apply(json(debrief));
}
