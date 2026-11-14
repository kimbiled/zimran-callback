// [B] Final debrief. Idempotent: a repeat call returns the saved debrief.
import { z } from "zod";
import { buildDebrief } from "@/lib/ai/debrief";
import { CallTurnsSchema, finalEvidence, finishCallOnce, judgments, ownedCall, sameRepPrefix } from "@/lib/ai/call-state";
import { isUuid } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";

export const maxDuration = 45;

const Body = z.object({
  callId: z.string(),
  turns: CallTurnsSchema,
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || !isUuid(parsed.data.callId)) return bad("Invalid request");
  const { callId, turns } = parsed.data;
  const call = await ownedCall(callId);
  if (!call) return bad("Call not found", 404);
  if (call.status === "done" && call.debrief) return json(call.debrief);

  const entries = await judgments(callId);
  if (!sameRepPrefix(entries, turns)) return bad("Previously judged turns changed", 409);
  const evidence = finalEvidence(call, turns, entries);
  const debrief = await finishCallOnce(call, async () => ({
    turns: evidence.turns,
    debrief: await buildDebrief({ callId, persona: call.persona, turns: evidence.turns, timeline: evidence.timeline, painsHint: evidence.painsFound }),
  }));
  return json(debrief);
}
