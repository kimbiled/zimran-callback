// [B] Final debrief. Idempotent: a repeat call returns the saved debrief.
import { z } from "zod";
import { buildDebrief } from "@/lib/ai/debrief";
import { db } from "@/lib/server/db";
import { isUuid } from "@/lib/server/session";
import { bad, json, PainIdsSchema, readJson, TimelineSchema, TurnsSchema } from "@/lib/server/validate";

export const maxDuration = 45;

const Body = z.object({
  callId: z.string(),
  turns: TurnsSchema,
  timeline: TimelineSchema.default([{ t: 0, score: 0 }]),
  painsFound: PainIdsSchema.default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || !isUuid(parsed.data.callId)) return bad("Invalid request");
  const { callId, turns, timeline, painsFound } = parsed.data;
  const store = db();
  const call = await store.getCall(callId);
  if (!call) return bad("Call not found", 404);
  if (call.status === "done" && call.debrief) return json(call.debrief);

  const debrief = await buildDebrief({ callId, persona: call.persona, turns, timeline, painsHint: painsFound });
  await store.finishCall(callId, turns, debrief);
  if (turns.some((t) => t.role === "rep")) await store.incrementCalls(call.sessionId);
  return json(debrief);
}
