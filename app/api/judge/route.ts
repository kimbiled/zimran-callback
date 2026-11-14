// [B] Judge: scores the rep's latest turn -> interest change.
import { z } from "zod";
import { judgeTurn } from "@/lib/ai/judge";
import { db } from "@/lib/server/db";
import { isUuid } from "@/lib/server/session";
import { bad, json, PainIdsSchema, readJson, TurnsSchema } from "@/lib/server/validate";

export const maxDuration = 20;

const Body = z.object({
  callId: z.string(),
  turns: TurnsSchema.min(1),
  score: z.number().min(-100).max(100),
  painsFound: PainIdsSchema.default([]),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || !isUuid(parsed.data.callId)) return bad("Invalid request");
  const { callId, turns, score, painsFound } = parsed.data;
  const call = await db().getCall(callId);
  if (!call) return bad("Call not found", 404);
  if (call.status !== "live") return bad("Call already ended", 409);

  const verdict = await judgeTurn({ persona: call.persona, turns, prevScore: Math.round(score), alreadyFound: painsFound });
  return json(verdict);
}
