// Coach whisper: one short next line after a buyer turn. Live calls only, owner only.
// Runs beside the judge and the buyer; nothing in the call loop waits for it.
import { z } from "zod";
import { coachHint } from "@/lib/ai/hint";
import { CallTurnsSchema, initialInterest, judgments, ownedCall } from "@/lib/ai/call-state";
import { rateLimit } from "@/lib/server/rate-limit";
import { isUuid } from "@/lib/server/session";
import { bad, json, readJson } from "@/lib/server/validate";
import { recordHint } from "@/lib/ai/hint-count";

export const maxDuration = 10;

const Body = z.object({ callId: z.string(), turns: CallTurnsSchema });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success || !isUuid(parsed.data.callId)) return bad("Invalid request");
  const limited = await rateLimit(req, "hint");
  if (limited) return limited;
  const { callId, turns } = parsed.data;
  const call = await ownedCall(callId);
  if (!call) return bad("Call not found", 404);
  if (call.status !== "live" || Date.now() - Date.parse(call.startedAt) > 330_000) return bad("Call ended", 409);

  // Server-side evidence only: client turns carry no trusted score or pains.
  let painsFound: string[] = [];
  let score = initialInterest(call.persona.difficulty);
  try {
    const entries = await judgments(callId);
    painsFound = [...new Set(entries.flatMap(e => e.verdict.painsUncovered))];
    score = entries.at(-1)?.verdict.score ?? score;
  } catch { /* A hint without judge context is still useful. */ }

  const clean = turns.map(t => ({ role: t.role, text: t.text, start: t.start, end: t.end }));
  const result = await coachHint({ persona: call.persona, turns: clean, painsFound, score });
  // Count only hints actually delivered; the debrief takes HINT_PENALTY points for each.
  if (result.hint) await recordHint(callId).catch(error => console.error("hint count failed", error instanceof Error ? error.name : "error"));
  return json(result);
}
